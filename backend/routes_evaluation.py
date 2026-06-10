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
    ManagerPublic,
    doc_strip,
)
from security import current_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["evaluations"])


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    )
    await db.evaluations.insert_one(evaluation.model_dump())
    return evaluation


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
    recommendation: Optional[str] = None
    summary: Optional[str] = None
    decision: Optional[str] = None


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

    rows: List[LeaderboardRow] = []
    for a in assignments:
        r = await db.responses.find_one({"assignment_id": a["id"]})
        if not r:
            rows.append(LeaderboardRow(assignment=Assignment(**a)))
            continue
        r_id = r["id"]
        e = await db.evaluations.find_one({"response_id": r_id})
        d = await db.decisions.find_one({"response_id": r_id})
        rows.append(LeaderboardRow(
            assignment=Assignment(**a),
            response_id=r_id,
            overall_score=(e or {}).get("overall_score"),
            recommendation=(e or {}).get("recommendation"),
            summary=(e or {}).get("summary"),
            decision=(d or {}).get("outcome"),
        ))

    # Sort: evaluated (by overall_score desc) → submitted-but-not-yet-evaluated → in-progress → sent
    status_rank = {"submitted": 0, "in_progress": 1, "sent": 2}
    rows.sort(key=lambda row: (
        0 if row.overall_score is not None else 1,
        -1 * (row.overall_score or 0),
        status_rank.get(row.assignment.status, 3),
    ))

    return LeaderboardResponse(case_id=case_id, case_title=case["title"], rows=rows)
