"""SME (Subject-Matter Expert) review workflow."""
import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from db import get_db
from models import (
    CaseReview,
    CaseReviewCreate,
    ManagerPublic,
    ManagerDB,
    SMEInviteCreate,
    doc_strip,
)
from security import current_manager, hash_password

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sme", tags=["sme"])


def _require_sme(user: ManagerPublic) -> None:
    if user.role != "sme":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "SME role required")


def _require_manager(user: ManagerPublic) -> None:
    if user.role != "manager":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Manager role required")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Manager invites an SME ----------
@router.post("/invite", status_code=status.HTTP_201_CREATED)
async def invite_sme(payload: SMEInviteCreate, user: ManagerPublic = Depends(current_manager)):
    _require_manager(user)
    db = get_db()
    if await db.managers.find_one({"email": payload.email.lower()}):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists")
    sme = ManagerDB(
        email=payload.email.lower(),
        full_name=payload.full_name,
        company=user.company,
        role="sme",
        password_hash=hash_password(payload.password),
    )
    await db.managers.insert_one(sme.model_dump())
    logger.info("SME invited by manager=%s email=%s", user.id, payload.email)
    return {"ok": True, "sme_id": sme.id, "email": sme.email}


# ---------- SME's review queue ----------
@router.get("/queue")
async def review_queue(user: ManagerPublic = Depends(current_manager)):
    _require_sme(user)
    db = get_db()
    pending = [
        doc_strip(c) async for c in db.cases.find({"review_status": "pending_review"}).sort("created_at", -1)
    ]
    reviewed_recent = [
        doc_strip(c) async for c in db.cases.find({"review_status": {"$in": ["approved", "rejected"]}}).sort("updated_at", -1).limit(20)
    ]
    return {"pending": pending, "recent": reviewed_recent}


@router.get("/cases/{case_id}")
async def get_case_for_review(case_id: str, user: ManagerPublic = Depends(current_manager)):
    _require_sme(user)
    db = get_db()
    c = await db.cases.find_one({"id": case_id})
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    review = await db.case_reviews.find_one({"case_id": case_id}, sort=[("reviewed_at", -1)])
    return {"case": doc_strip(c), "review": doc_strip(review) if review else None}


@router.post("/cases/{case_id}/review", response_model=CaseReview)
async def submit_review(case_id: str, payload: CaseReviewCreate, user: ManagerPublic = Depends(current_manager)):
    _require_sme(user)
    db = get_db()
    c = await db.cases.find_one({"id": case_id})
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")

    # Hard rule: fabricated specs ⇒ must be rejected
    verdict = payload.verdict
    if payload.fabricated_specs_flag and verdict != "rejected":
        verdict = "rejected"

    review = CaseReview(
        case_id=case_id,
        sme_id=user.id,
        scores=payload.scores,
        fabricated_specs_flag=payload.fabricated_specs_flag,
        verdict=verdict,
        notes=payload.notes,
    )
    await db.case_reviews.insert_one(review.model_dump())
    await db.cases.update_one(
        {"id": case_id},
        {"$set": {"review_status": verdict, "updated_at": _now()}},
    )
    logger.info(
        "SME review: case=%s sme=%s verdict=%s fabricated=%s",
        case_id, user.id, verdict, payload.fabricated_specs_flag,
    )
    return review
