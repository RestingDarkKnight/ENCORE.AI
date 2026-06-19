"""Manager-side evaluation, decision, and leaderboard endpoints."""
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from claude_service import has_api_key
from db import get_db
from evaluation import eval_model_name, evaluate_response
from models import (
    Assignment,
    Decision,
    DecisionCreate,
    Evaluation,
    EvaluationOverrideRequest,
    ManagerPublic,
    doc_strip,
)
from security import current_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["evaluations"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _compute_final_score(eval_doc: dict) -> tuple[float, str]:
    """Blend the LLM rubric scores with any manager overrides, applying the deterministic
    objective layer when reasoning is required. Returns (final_score on 0..5, recommendation).
    """
    overrides = eval_doc.get("manager_overrides") or {}
    scores = eval_doc.get("scores") or []
    if not scores:
        return float(eval_doc.get("overall_score") or 0.0), eval_doc.get("recommendation") or "borderline"

    total_weight = sum(float(s.get("weight") or 0) for s in scores) or 100.0
    weighted_sum = 0.0
    for s in scores:
        sid = s.get("dimension_id")
        score = float(overrides.get(sid, s.get("score") or 0))
        weighted_sum += score * float(s.get("weight") or 0)
    final_rubric = weighted_sum / total_weight  # 0..5

    # If we have a deterministic score, blend at 70/30 (rubric/deterministic) per slice spec.
    det = eval_doc.get("deterministic_score") or {}
    det_pct = float(det.get("objective_pct") or 0)  # 0..100
    det_max = float(det.get("objective_max") or 0)
    if det_max > 0:
        # rubric is on 0..5, det is on 0..100. Normalise det to 0..5.
        det_on_5 = det_pct / 20.0
        final = round(0.7 * final_rubric + 0.3 * det_on_5, 2)
    else:
        final = round(final_rubric, 2)

    # Always derive the band from the (possibly overridden) final score. The route layer
    # applies an explicit manager-chosen recommendation on top of this when supplied.
    if final >= 4.0:
        rec = "strong_hire"
    elif final >= 3.0:
        rec = "hire"
    elif final >= 2.0:
        rec = "borderline"
    else:
        rec = "no_hire"
    return final, rec


async def _assignment_for_manager(assignment_id: str, manager_id: str) -> dict:
    a = await get_db().assignments.find_one({"id": assignment_id, "manager_id": manager_id})
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    return doc_strip(a)


# ---------- Evaluate a submitted response ----------
@router.post("/responses/by-assignment/{assignment_id}/evaluate", response_model=Evaluation)
async def evaluate_assignment(assignment_id: str, manager: ManagerPublic = Depends(current_manager)):
    """Trigger Claude evaluation for a submitted response. Idempotent if already evaluated unless ?force=true."""
    a = await _assignment_for_manager(assignment_id, manager.id)
    if a.get("status") != "submitted":
        raise HTTPException(status.HTTP_409_CONFLICT, "Candidate has not submitted yet")
    db = get_db()
    r = await db.responses.find_one({"assignment_id": assignment_id})
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No response to evaluate")
    r = doc_strip(r)

    # If an evaluation already exists, just return it (idempotent).
    existing = await db.evaluations.find_one({"response_id": r["id"]})
    if existing:
        return Evaluation(**doc_strip(existing))

    if not has_api_key():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Claude is not configured yet. Set ANTHROPIC_API_KEY on the server to enable evaluation.",
        )

    case = await db.cases.find_one({"id": a["case_id"]})
    if not case:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    case = doc_strip(case)

    try:
        draft = await evaluate_response(case, r)
    except Exception as e:  # noqa: BLE001
        logger.exception("Evaluation failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Evaluation failed: {e}")

    evaluation = Evaluation(
        response_id=r["id"],
        assignment_id=assignment_id,
        case_id=a["case_id"],
        scores=draft.scores,
        overall_score=draft.overall_score,
        recommendation=draft.recommendation,
        strengths=draft.strengths,
        concerns=draft.concerns,
        summary=draft.summary,
        model_used=eval_model_name(),
        # Phase H Slice 4 — review-gate fields
        status="provisional",
        reasoning_grades=draft.reasoning_grades,
        deterministic_score=r.get("deterministic_score"),
    )
    # Compute the initial final_score from the provisional data
    eval_dict = evaluation.model_dump()
    final, rec = _compute_final_score(eval_dict)
    eval_dict["final_score"] = final
    eval_dict["final_recommendation"] = rec
    await db.evaluations.insert_one(eval_dict)
    return Evaluation(**eval_dict)


# ---------- Slice 4 review gate ----------
async def _evaluation_for_manager(eval_id: str, manager_id: str) -> dict:
    db = get_db()
    e = await db.evaluations.find_one({"id": eval_id})
    if not e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evaluation not found")
    a = await db.assignments.find_one({"id": e["assignment_id"], "manager_id": manager_id})
    if not a:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your evaluation")
    return doc_strip(e)


@router.patch("/evaluations/{eval_id}", response_model=Evaluation)
async def override_evaluation(eval_id: str, payload: EvaluationOverrideRequest, manager: ManagerPublic = Depends(current_manager)):
    """Manager edits during the review gate. Recomputes final_score after every patch."""
    e = await _evaluation_for_manager(eval_id, manager.id)
    if e.get("status") == "finalized":
        raise HTTPException(status.HTTP_409_CONFLICT, "Evaluation is finalized; cannot edit. Reopen first.")
    updates = {}
    if payload.manager_overrides is not None:
        updates["manager_overrides"] = payload.manager_overrides
    if payload.override_note is not None:
        updates["override_note"] = payload.override_note
    if payload.section_comments is not None:
        updates["section_comments"] = payload.section_comments
    if payload.reasoning_grades is not None:
        updates["reasoning_grades"] = [g.model_dump() for g in payload.reasoning_grades]
    if payload.final_recommendation is not None:
        updates["final_recommendation"] = payload.final_recommendation
    merged = {**e, **updates}
    final, rec = _compute_final_score(merged)
    updates["final_score"] = final
    if not payload.final_recommendation:
        updates["final_recommendation"] = rec
    await get_db().evaluations.update_one({"id": eval_id}, {"$set": updates})
    return Evaluation(**doc_strip({**e, **updates}))


@router.post("/evaluations/{eval_id}/finalize", response_model=Evaluation)
async def finalize_evaluation(eval_id: str, manager: ManagerPublic = Depends(current_manager)):
    """Lock the evaluation. Until this is called, the candidate's report is hidden from
    candidate-facing surfaces and excluded from aggregate stats / leaderboards."""
    e = await _evaluation_for_manager(eval_id, manager.id)
    if e.get("status") == "finalized":
        return Evaluation(**e)
    final, rec = _compute_final_score(e)
    updates = {
        "status": "finalized",
        "final_score": final,
        "final_recommendation": e.get("final_recommendation") or rec,
        "finalized_at": _now(),
        "finalized_by": manager.id,
    }
    await get_db().evaluations.update_one({"id": eval_id}, {"$set": updates})
    return Evaluation(**doc_strip({**e, **updates}))


@router.post("/evaluations/{eval_id}/reopen", response_model=Evaluation)
async def reopen_evaluation(eval_id: str, manager: ManagerPublic = Depends(current_manager)):
    """Unlock a finalized evaluation so the manager can edit it again."""
    e = await _evaluation_for_manager(eval_id, manager.id)
    await get_db().evaluations.update_one(
        {"id": eval_id},
        {"$set": {"status": "provisional", "finalized_at": None, "finalized_by": None}},
    )
    e["status"] = "provisional"
    e["finalized_at"] = None
    e["finalized_by"] = None
    return Evaluation(**e)


@router.get("/evaluations/{eval_id}", response_model=Evaluation)
async def get_evaluation_by_id(eval_id: str, manager: ManagerPublic = Depends(current_manager)):
    e = await _evaluation_for_manager(eval_id, manager.id)
    return Evaluation(**e)


@router.get("/responses/by-assignment/{assignment_id}/evaluation", response_model=Optional[Evaluation])
async def get_evaluation(assignment_id: str, manager: ManagerPublic = Depends(current_manager)):
    a = await _assignment_for_manager(assignment_id, manager.id)
    db = get_db()
    r = await db.responses.find_one({"assignment_id": assignment_id})
    if not r:
        return None
    e = await db.evaluations.find_one({"response_id": r["id"], "case_id": a["case_id"]})
    if not e:
        return None
    return Evaluation(**doc_strip(e))


# ---------- Decisions ----------
@router.post("/decisions", response_model=Decision, status_code=status.HTTP_201_CREATED)
async def upsert_decision(payload: DecisionCreate, manager: ManagerPublic = Depends(current_manager)):
    db = get_db()
    r = await db.responses.find_one({"id": payload.response_id})
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Response not found")
    a = await db.assignments.find_one({"id": r["assignment_id"], "manager_id": manager.id})
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    now = _now()
    decision = Decision(
        response_id=payload.response_id,
        assignment_id=a["id"],
        case_id=a["case_id"],
        manager_id=manager.id,
        outcome=payload.outcome,
        note=payload.note,
        decided_at=now,
    )
    # Upsert (one decision per response)
    await db.decisions.update_one(
        {"response_id": payload.response_id},
        {"$set": decision.model_dump()},
        upsert=True,
    )
    return decision


@router.get("/decisions/by-response/{response_id}", response_model=Optional[Decision])
async def get_decision(response_id: str, manager: ManagerPublic = Depends(current_manager)):
    db = get_db()
    d = await db.decisions.find_one({"response_id": response_id, "manager_id": manager.id})
    if not d:
        return None
    return Decision(**doc_strip(d))


# ---------- Leaderboard / comparison ----------
class LeaderboardRow(BaseModel):
    assignment: Assignment
    response_id: Optional[str] = None
    overall_score: Optional[float] = None
    final_score: Optional[float] = None
    recommendation: Optional[str] = None
    summary: Optional[str] = None
    decision: Optional[str] = None
    # Phase H Slice 4 review-gate signal
    evaluation_id: Optional[str] = None
    evaluation_status: Optional[str] = None  # provisional | finalized | None


class LeaderboardResponse(BaseModel):
    case_id: str
    case_title: str
    rows: List[LeaderboardRow]


@router.get("/cases/{case_id}/leaderboard", response_model=LeaderboardResponse)
async def leaderboard(case_id: str, manager: ManagerPublic = Depends(current_manager)):
    db = get_db()
    case = await db.cases.find_one({"id": case_id, "manager_id": manager.id})
    if not case:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    case = doc_strip(case)

    assignments = [
        doc_strip(d) async for d in db.assignments.find({"case_id": case_id, "manager_id": manager.id}).sort("created_at", -1)
    ]
    if not assignments:
        return LeaderboardResponse(case_id=case_id, case_title=case["title"], rows=[])

    # Batch-fetch responses, evaluations, decisions to avoid N+1 queries
    assignment_ids = [a["id"] for a in assignments]
    responses_by_assignment = {
        r["assignment_id"]: doc_strip(r)
        async for r in db.responses.find({"assignment_id": {"$in": assignment_ids}})
    }
    response_ids = [r["id"] for r in responses_by_assignment.values()]
    evaluations_by_response = {
        e["response_id"]: doc_strip(e)
        async for e in db.evaluations.find({"response_id": {"$in": response_ids}})
    } if response_ids else {}
    decisions_by_response = {
        d["response_id"]: doc_strip(d)
        async for d in db.decisions.find({"response_id": {"$in": response_ids}})
    } if response_ids else {}

    rows: List[LeaderboardRow] = []
    for a in assignments:
        r = responses_by_assignment.get(a["id"])
        if not r:
            rows.append(LeaderboardRow(assignment=Assignment(**a)))
            continue
        e = evaluations_by_response.get(r["id"])
        d = decisions_by_response.get(r["id"])
        rows.append(LeaderboardRow(
            assignment=Assignment(**a),
            response_id=r["id"],
            overall_score=(e or {}).get("overall_score"),
            final_score=(e or {}).get("final_score"),
            recommendation=(e or {}).get("final_recommendation") or (e or {}).get("recommendation"),
            summary=(e or {}).get("summary"),
            decision=(d or {}).get("outcome"),
            evaluation_id=(e or {}).get("id"),
            evaluation_status=(e or {}).get("status"),
        ))

    # Sort: evaluated (by overall_score desc) → submitted-but-not-yet-evaluated → in-progress → sent
    status_rank = {"submitted": 0, "in_progress": 1, "sent": 2}
    rows.sort(key=lambda row: (
        0 if row.overall_score is not None else 1,
        -1 * (row.overall_score or 0),
        status_rank.get(row.assignment.status, 3),
    ))

    return LeaderboardResponse(case_id=case_id, case_title=case["title"], rows=rows)
