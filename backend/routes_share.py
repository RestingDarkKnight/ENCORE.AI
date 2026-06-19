"""Shareable read-only report links — manager toggle + public render.

- `POST /reports/{assignment_id}/share` (manager-only): generate/regenerate share token + initials toggle.
- `DELETE /reports/{assignment_id}/share` (manager-only): revoke the token.
- `GET /shared/report/{share_token}` (PUBLIC, no auth): returns a sanitized report payload.

The share token is a 32-byte URL-safe random hex stored on the assignment.
"""
from __future__ import annotations

import secrets
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from db import get_db
from models import ManagerPublic, doc_strip
from routes_auth import current_manager

router = APIRouter(tags=["share"])


def _new_share_token() -> str:
    return secrets.token_urlsafe(32)


def _initials_of(name_or_email: str) -> str:
    s = (name_or_email or "").strip()
    if not s:
        return "—"
    if "@" in s:
        s = s.split("@", 1)[0]
    parts = [p for p in s.replace(".", " ").replace("_", " ").split() if p]
    if not parts:
        return s[:2].upper()
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


class ShareRequest(BaseModel):
    show_initials_only: bool = True   # default privacy-first


class ShareResponse(BaseModel):
    share_token: str
    share_url: str                     # client builds final URL anyway; we provide path
    show_initials_only: bool


# ---------- Manager endpoints (under /reports prefix) ----------
@router.post("/reports/{assignment_id}/share", response_model=ShareResponse)
async def create_share(assignment_id: str, payload: ShareRequest = ShareRequest(), manager: ManagerPublic = Depends(current_manager)):
    db = get_db()
    a = await db.assignments.find_one({"id": assignment_id, "manager_id": manager.id})
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    token = a.get("share_token") or _new_share_token()
    await db.assignments.update_one(
        {"id": assignment_id},
        {"$set": {"share_token": token, "share_initials_only": bool(payload.show_initials_only)}},
    )
    return ShareResponse(share_token=token, share_url=f"/r/{token}", show_initials_only=bool(payload.show_initials_only))


@router.delete("/reports/{assignment_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share(assignment_id: str, manager: ManagerPublic = Depends(current_manager)):
    db = get_db()
    res = await db.assignments.update_one(
        {"id": assignment_id, "manager_id": manager.id},
        {"$unset": {"share_token": "", "share_initials_only": ""}},
    )
    if res.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    return None


@router.get("/reports/{assignment_id}/share", response_model=Optional[ShareResponse])
async def get_share(assignment_id: str, manager: ManagerPublic = Depends(current_manager)):
    db = get_db()
    a = await db.assignments.find_one({"id": assignment_id, "manager_id": manager.id}, {"share_token": 1, "share_initials_only": 1})
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    tok = a.get("share_token")
    if not tok:
        return None
    return ShareResponse(share_token=tok, share_url=f"/r/{tok}", show_initials_only=bool(a.get("share_initials_only", True)))


# ---------- Public shared payload ----------
class SharedReport(BaseModel):
    candidate_display: str
    case_title: str
    role_title: str
    submitted_at: Optional[str]
    overall_score: Optional[float]
    recommendation: Optional[str]
    scores: list                       # [{name, score, weight, justification, quote}]
    strengths: list
    concerns: list
    summary: Optional[str]
    estimated_minutes: Optional[int]
    generated_at: str


@router.get("/shared/report/{share_token}", response_model=SharedReport)
async def get_shared_report(share_token: str):
    db = get_db()
    a = await db.assignments.find_one({"share_token": share_token})
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share link not found or revoked")
    a = doc_strip(a)

    case = await db.cases.find_one({"id": a["case_id"]})
    role = await db.roles.find_one({"id": case.get("role_id")}, {"job_title": 1}) if case else None
    response = await db.responses.find_one({"assignment_id": a["id"]})
    evaluation = await db.evaluations.find_one({"assignment_id": a["id"]}) if response else None

    if not evaluation:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This report isn\u2019t ready yet.")

    # Slice 4 review-gate: hide provisional evaluations from candidate-facing surface.
    if evaluation.get("status") and evaluation.get("status") != "finalized":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This report isn\u2019t ready yet — the hiring manager is still reviewing.")

    initials_only = bool(a.get("share_initials_only", True))
    candidate_display = _initials_of(a.get("candidate_name") or a.get("candidate_email")) if initials_only else (a.get("candidate_name") or a.get("candidate_email"))

    scores_out = []
    for s in evaluation.get("scores", []):
        scores_out.append({
            "name": s.get("name"),
            "score": s.get("score"),
            "weight": s.get("weight"),
            "justification": s.get("justification"),
            "quote": s.get("quote", ""),
        })

    from datetime import datetime, timezone  # local import to avoid top-level dep when unused
    return SharedReport(
        candidate_display=candidate_display,
        case_title=case.get("title") if case else "Untitled case",
        role_title=(role or {}).get("job_title") or "Role",
        submitted_at=a.get("submitted_at"),
        overall_score=evaluation.get("final_score") or evaluation.get("overall_score"),
        recommendation=evaluation.get("final_recommendation") or evaluation.get("recommendation"),
        scores=scores_out,
        strengths=evaluation.get("strengths", []),
        concerns=evaluation.get("concerns", []),
        summary=evaluation.get("summary"),
        estimated_minutes=(case or {}).get("estimated_minutes"),
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
