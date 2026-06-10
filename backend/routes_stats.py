"""Manager stats + badges (computed from existing collections — no new table needed)."""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from db import get_db
from models import ManagerPublic
from security import current_manager

router = APIRouter(prefix="/stats", tags=["stats"])


class Milestone(BaseModel):
    id: str
    label: str
    description: str
    earned: bool
    earned_at: Optional[str] = None
    progress: float = 0.0  # 0..1
    next_at: Optional[int] = None


class ManagerStats(BaseModel):
    roles: int
    cases: int
    approved_cases: int
    invited: int
    submitted: int
    evaluated: int
    decisions: int
    advanced: int
    badges: List[Milestone]


def _badge(id: str, label: str, description: str, earned: bool, earned_at: Optional[str] = None,
           progress: float = 0.0, next_at: Optional[int] = None) -> Milestone:
    return Milestone(
        id=id, label=label, description=description,
        earned=earned, earned_at=earned_at if earned else None,
        progress=min(1.0, max(0.0, progress)),
        next_at=next_at if not earned else None,
    )


@router.get("/manager", response_model=ManagerStats)
async def manager_stats(manager: ManagerPublic = Depends(current_manager)):
    db = get_db()

    roles = await db.roles.count_documents({"manager_id": manager.id})
    cases = await db.cases.count_documents({"manager_id": manager.id})
    approved = await db.cases.count_documents({"manager_id": manager.id, "status": "approved"})
    invited = await db.assignments.count_documents({"manager_id": manager.id})
    submitted = await db.assignments.count_documents({"manager_id": manager.id, "status": "submitted"})

    # Materialise manager's case IDs once, then count joined collections in single queries
    case_ids: List[str] = [c["id"] async for c in db.cases.find({"manager_id": manager.id}, {"id": 1})]
    evaluated = await db.evaluations.count_documents({"case_id": {"$in": case_ids}}) if case_ids else 0
    decisions = await db.decisions.count_documents({"manager_id": manager.id})
    advanced = await db.decisions.count_documents({"manager_id": manager.id, "outcome": "advance"})

    # Earned-at timestamps come from the first document that triggered the badge
    async def _first_at(coll, q, sort_field="created_at") -> Optional[str]:
        d = await coll.find_one(q, sort=[(sort_field, 1)])
        return d.get(sort_field) if d else None

    first_role_at = await _first_at(db.roles, {"manager_id": manager.id})
    first_case_at = await _first_at(db.cases, {"manager_id": manager.id})
    first_approved_at = await _first_at(db.cases, {"manager_id": manager.id, "status": "approved"}, "approved_at")
    first_invite_at = await _first_at(db.assignments, {"manager_id": manager.id})
    first_submit_at = await _first_at(db.assignments, {"manager_id": manager.id, "status": "submitted"}, "submitted_at")
    first_decision_at = await _first_at(db.decisions, {"manager_id": manager.id}, "decided_at")
    first_hire_at = await _first_at(db.decisions, {"manager_id": manager.id, "outcome": "advance"}, "decided_at")

    badges: List[Milestone] = [
        _badge("first_role", "First role defined", "You created your first role.",
               earned=roles >= 1, earned_at=first_role_at,
               progress=min(1.0, roles / 1.0)),
        _badge("first_case", "First case drafted", "You drafted your first work-simulation case.",
               earned=cases >= 1, earned_at=first_case_at,
               progress=min(1.0, cases / 1.0)),
        _badge("first_approved", "First case approved", "You locked in a case for candidates.",
               earned=approved >= 1, earned_at=first_approved_at),
        _badge("first_invite", "First candidate invited", "You shared the link with a real candidate.",
               earned=invited >= 1, earned_at=first_invite_at),
        _badge("first_submission", "First submission received", "A candidate finished their case.",
               earned=submitted >= 1, earned_at=first_submit_at),
        _badge("first_decision", "First decision recorded", "You made your first hiring call.",
               earned=decisions >= 1, earned_at=first_decision_at),
        _badge("first_hire", "First advance", "You moved someone forward in your pipeline.",
               earned=advanced >= 1, earned_at=first_hire_at),
        _badge("three_cases", "Three cases generated", "A working library of role-specific cases.",
               earned=cases >= 3,
               progress=min(1.0, cases / 3.0),
               next_at=3 if cases < 3 else None),
        _badge("five_candidates", "Five candidates scored",
               "Enough signal to calibrate your hiring bar.",
               earned=evaluated >= 5,
               progress=min(1.0, evaluated / 5.0),
               next_at=5 if evaluated < 5 else None),
    ]

    return ManagerStats(
        roles=roles, cases=cases, approved_cases=approved,
        invited=invited, submitted=submitted, evaluated=evaluated,
        decisions=decisions, advanced=advanced,
        badges=badges,
    )
