"""Reports Hub aggregation endpoints — manager-facing summary + per-case candidate mapping."""
from collections import defaultdict
from statistics import mean
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from db import get_db
from models import ManagerPublic, doc_strip
from routes_auth import current_manager

router = APIRouter(prefix="/reports", tags=["reports"])


# ---------- Response shapes ----------
class CaseSummary(BaseModel):
    case_id: str
    case_title: str
    role_id: str
    role_title: str
    invited: int
    submitted: int
    evaluated: int
    pending_review: int = 0  # Slice 4 — provisional evaluations awaiting manager finalize
    avg_overall_score: Optional[float] = None
    rec_distribution: Dict[str, int]                 # strong_hire/hire/borderline/no_hire counts
    dimension_averages: List[Dict[str, Any]]          # [{id, name, average}]


class ManagerReportsSummary(BaseModel):
    total_cases: int
    total_candidates: int
    total_evaluated: int
    cases: List[CaseSummary]


class CandidateRow(BaseModel):
    assignment_id: str
    candidate_email: str
    candidate_name: Optional[str] = None
    status: str
    invited_at: str
    submitted_at: Optional[str] = None
    overall_score: Optional[float] = None
    recommendation: Optional[str] = None
    scores: List[Dict[str, Any]] = []                 # [{dimension_id, name, score, weight}]
    strengths: List[str] = []
    concerns: List[str] = []
    summary: Optional[str] = None
    decision: Optional[str] = None
    # Phase H Slice 4 — review-gate signals
    evaluation_id: Optional[str] = None
    evaluation_status: Optional[str] = None  # provisional | finalized | None
    decided_at: Optional[str] = None


class CaseReport(BaseModel):
    case_id: str
    case_title: str
    role_id: str
    role_title: str
    rubric: List[Dict[str, Any]]                     # [{id, name, weight}]
    rows: List[CandidateRow]
    pending_review: int = 0  # Phase H Slice 4 — # of provisional evals on this case


# ---------- Helpers ----------
async def _build_case_summary(db, manager_id: str, case_doc: dict) -> Optional[CaseSummary]:
    case_id = case_doc["id"]
    assignments = [doc_strip(a) async for a in db.assignments.find({"case_id": case_id, "manager_id": manager_id})]
    if not assignments:
        return None

    invited = len(assignments)
    submitted = sum(1 for a in assignments if a.get("status") == "submitted")

    assignment_ids = [a["id"] for a in assignments]
    evals_all = [doc_strip(e) async for e in db.evaluations.find({"assignment_id": {"$in": assignment_ids}})]
    evaluated = len(evals_all)
    pending_review = sum(1 for e in evals_all if e.get("status") and e.get("status") != "finalized")
    # Aggregates use FINALIZED evals only (Slice 4 review gate). Legacy evals
    # without a status field are treated as finalized so older data still counts.
    evals = [e for e in evals_all if (e.get("status") in (None, "finalized"))]

    def _final_or_overall(e):
        return e.get("final_score") if e.get("final_score") is not None else e.get("overall_score")

    avg_overall = mean([s for s in (_final_or_overall(e) for e in evals) if s is not None]) if evals else None

    rec_dist = {"strong_hire": 0, "hire": 0, "borderline": 0, "no_hire": 0}
    for e in evals:
        rec = e.get("final_recommendation") or e.get("recommendation")
        if rec in rec_dist:
            rec_dist[rec] += 1

    # Per-dimension averages — group scores by dimension_id from all evals
    dim_buckets: Dict[str, Dict[str, Any]] = {}
    for e in evals:
        for s in e.get("scores", []):
            d_id = s.get("dimension_id")
            if not d_id:
                continue
            bucket = dim_buckets.setdefault(d_id, {"id": d_id, "name": s.get("name", d_id), "_vals": []})
            bucket["_vals"].append(s.get("score", 0.0))
    dimension_averages = []
    for d in dim_buckets.values():
        dimension_averages.append({"id": d["id"], "name": d["name"], "average": mean(d["_vals"]) if d["_vals"] else 0.0})

    role_doc = await db.roles.find_one({"id": case_doc["role_id"]}, {"job_title": 1})

    return CaseSummary(
        case_id=case_id,
        case_title=case_doc.get("title") or "Untitled case",
        role_id=case_doc["role_id"],
        role_title=(role_doc or {}).get("job_title") or "Unknown role",
        invited=invited,
        submitted=submitted,
        evaluated=evaluated,
        pending_review=pending_review,
        avg_overall_score=avg_overall,
        rec_distribution=rec_dist,
        dimension_averages=dimension_averages,
    )


# ---------- Routes ----------
@router.get("/summary", response_model=ManagerReportsSummary)
async def get_summary(manager: ManagerPublic = Depends(current_manager)):
    """Manager-wide summary across every case that has ≥1 assignment."""
    db = get_db()
    # Include archived cases in reports — manager may still want historical performance
    cases = [doc_strip(c) async for c in db.cases.find({"manager_id": manager.id}).sort("created_at", -1)]
    summaries: List[CaseSummary] = []
    for c in cases:
        s = await _build_case_summary(db, manager.id, c)
        if s is not None:
            summaries.append(s)
    total_candidates = sum(s.invited for s in summaries)
    total_evaluated = sum(s.evaluated for s in summaries)
    return ManagerReportsSummary(
        total_cases=len(summaries),
        total_candidates=total_candidates,
        total_evaluated=total_evaluated,
        cases=summaries,
    )


@router.get("/case/{case_id}", response_model=CaseReport)
async def get_case_report(case_id: str, manager: ManagerPublic = Depends(current_manager)):
    """Full candidate mapping for one case — every assignment with its evaluation + decision."""
    db = get_db()
    case_doc = await db.cases.find_one({"id": case_id, "manager_id": manager.id})
    if not case_doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    case_doc = doc_strip(case_doc)

    role_doc = await db.roles.find_one({"id": case_doc["role_id"]}, {"job_title": 1}) or {}

    # All assignments for this case (manager-owned)
    assignments = [doc_strip(a) async for a in db.assignments.find({"case_id": case_id, "manager_id": manager.id}).sort("created_at", -1)]
    assignment_ids = [a["id"] for a in assignments]

    # Bulk-fetch responses + evaluations + decisions
    responses = {r["assignment_id"]: doc_strip(r) async for r in db.responses.find({"assignment_id": {"$in": assignment_ids}})}
    evals_by_assignment: Dict[str, dict] = {}
    async for e in db.evaluations.find({"assignment_id": {"$in": assignment_ids}}):
        evals_by_assignment[e["assignment_id"]] = doc_strip(e)
    decisions_by_response: Dict[str, dict] = {}
    response_ids = [r["id"] for r in responses.values()]
    if response_ids:
        async for d in db.decisions.find({"response_id": {"$in": response_ids}}):
            decisions_by_response[d["response_id"]] = doc_strip(d)

    rubric_summary = [
        {"id": r["id"], "name": r["name"], "weight": r.get("weight", 0)}
        for r in case_doc.get("rubric", [])
    ]

    rows: List[CandidateRow] = []
    for a in assignments:
        ev = evals_by_assignment.get(a["id"])
        resp = responses.get(a["id"])
        dec = decisions_by_response.get(resp["id"]) if resp else None
        rows.append(
            CandidateRow(
                assignment_id=a["id"],
                candidate_email=a["candidate_email"],
                candidate_name=a.get("candidate_name"),
                status=a.get("status", "sent"),
                invited_at=a.get("created_at", ""),
                submitted_at=a.get("submitted_at"),
                overall_score=(ev.get("final_score") if ev and ev.get("final_score") is not None else (ev.get("overall_score") if ev else None)),
                recommendation=(ev.get("final_recommendation") or ev.get("recommendation")) if ev else None,
                scores=[
                    {"dimension_id": s["dimension_id"], "name": s["name"], "score": s["score"], "weight": s.get("weight", 0)}
                    for s in (ev.get("scores", []) if ev else [])
                ],
                strengths=ev.get("strengths", []) if ev else [],
                concerns=ev.get("concerns", []) if ev else [],
                summary=ev.get("summary") if ev else None,
                decision=dec.get("outcome") if dec else None,
                evaluation_id=ev.get("id") if ev else None,
                evaluation_status=ev.get("status") if ev else None,
                decided_at=dec.get("decided_at") if dec else None,
            )
        )

    # Default sort: evaluated rows first, then by overall_score desc, then by invited_at desc
    rows.sort(
        key=lambda r: (
            r.overall_score is None,                            # evaluated first
            -(r.overall_score or 0.0),
            -(int((r.submitted_at or r.invited_at or "0").replace("-", "").replace(":", "").replace("T", "").replace(".", "").replace("+", "")[:14] or 0)),
        )
    )

    pending_count = sum(1 for row in rows if row.evaluation_status and row.evaluation_status != "finalized")
    return CaseReport(
        case_id=case_id,
        case_title=case_doc.get("title") or "Untitled case",
        role_id=case_doc["role_id"],
        role_title=role_doc.get("job_title") or "Unknown role",
        rubric=rubric_summary,
        rows=rows,
        pending_review=pending_count,
    )
