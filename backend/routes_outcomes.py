"""30/90-day hire-outcome capture.

- POST   /outcomes              — record an outcome for an (assignment, window)
- GET    /outcomes/by-assignment/{assignment_id} — list outcomes for one candidate
- GET    /outcomes/due          — outcomes due for the current manager (advanced hires whose decision is >=N days old without an outcome for that window)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from db import get_db
from models import ManagerPublic, doc_strip
from routes_auth import current_manager

router = APIRouter(prefix="/outcomes", tags=["outcomes"])

OutcomeWindow = Literal["30d", "90d"]
WINDOW_DAYS = {"30d": 30, "90d": 90}


class OutcomeCreate(BaseModel):
    assignment_id: str
    window: OutcomeWindow
    performing: int = Field(ge=1, le=5, description="1-5 rating of how the candidate is performing")
    would_hire_again: bool
    comment: Optional[str] = Field(default=None, max_length=1000)


class HireOutcome(BaseModel):
    id: str
    assignment_id: str
    manager_id: str
    window: OutcomeWindow
    performing: int
    would_hire_again: bool
    comment: Optional[str] = None
    recorded_at: str


class OutcomeDue(BaseModel):
    assignment_id: str
    candidate_email: str
    candidate_name: Optional[str] = None
    case_title: str
    role_title: str
    decision_at: str
    window: OutcomeWindow
    days_since_decision: int


@router.post("", response_model=HireOutcome, status_code=status.HTTP_201_CREATED)
async def create_outcome(payload: OutcomeCreate, manager: ManagerPublic = Depends(current_manager)):
    db = get_db()
    a = await db.assignments.find_one({"id": payload.assignment_id, "manager_id": manager.id})
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    # Confirm a positive decision was recorded — only advanced/hired candidates make sense here
    resp = await db.responses.find_one({"assignment_id": payload.assignment_id})
    if not resp:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Candidate has no submitted response yet.")
    decision = await db.decisions.find_one({"response_id": resp["id"], "outcome": "advance"})
    if not decision:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Outcome check-ins are only for candidates marked Advance.")

    doc = {
        "id": str(uuid.uuid4()),
        "assignment_id": payload.assignment_id,
        "manager_id": manager.id,
        "window": payload.window,
        "performing": payload.performing,
        "would_hire_again": payload.would_hire_again,
        "comment": payload.comment,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }
    # Upsert — at most one per (assignment, window)
    await db.hire_outcomes.update_one(
        {"assignment_id": payload.assignment_id, "window": payload.window},
        {"$set": doc},
        upsert=True,
    )
    saved = await db.hire_outcomes.find_one({"assignment_id": payload.assignment_id, "window": payload.window})
    return HireOutcome(**doc_strip(saved))


@router.get("/by-assignment/{assignment_id}", response_model=List[HireOutcome])
async def list_for_assignment(assignment_id: str, manager: ManagerPublic = Depends(current_manager)):
    db = get_db()
    a = await db.assignments.find_one({"id": assignment_id, "manager_id": manager.id})
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    out = [HireOutcome(**doc_strip(d)) async for d in db.hire_outcomes.find({"assignment_id": assignment_id}).sort("recorded_at", 1)]
    return out


@router.get("/due", response_model=List[OutcomeDue])
async def list_due(manager: ManagerPublic = Depends(current_manager)):
    """List candidates whose 30d/90d check-in is overdue and not yet captured."""
    db = get_db()
    now = datetime.now(timezone.utc)
    decisions = [doc_strip(d) async for d in db.decisions.find({"manager_id": manager.id, "outcome": "advance"})]
    if not decisions:
        return []

    response_ids = [d["response_id"] for d in decisions]
    responses = {r["id"]: doc_strip(r) async for r in db.responses.find({"id": {"$in": response_ids}}) if r}

    out: List[OutcomeDue] = []
    for dec in decisions:
        resp = responses.get(dec["response_id"])
        if not resp:
            continue
        a = await db.assignments.find_one({"id": resp["assignment_id"]})
        if not a:
            continue
        decision_at = _parse_iso(dec.get("decided_at"))
        if not decision_at:
            continue
        days = (now - decision_at).days

        case = await db.cases.find_one({"id": a["case_id"]}, {"title": 1, "role_id": 1})
        role = await db.roles.find_one({"id": (case or {}).get("role_id")}, {"job_title": 1}) if case else None

        for window, threshold in WINDOW_DAYS.items():
            if days < threshold:
                continue
            existing = await db.hire_outcomes.find_one({"assignment_id": a["id"], "window": window})
            if existing:
                continue
            out.append(OutcomeDue(
                assignment_id=a["id"],
                candidate_email=a["candidate_email"],
                candidate_name=a.get("candidate_name"),
                case_title=(case or {}).get("title") or "Untitled case",
                role_title=(role or {}).get("job_title") or "Role",
                decision_at=dec.get("decided_at"),
                window=window,
                days_since_decision=days,
            ))
    # Most overdue first
    out.sort(key=lambda x: x.days_since_decision, reverse=True)
    return out


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Python's fromisoformat handles "+00:00" but not "Z"
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
