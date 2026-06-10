"""Manager-side response viewer + audio playback."""
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from db import get_db
from models import CandidateResponse, ManagerPublic, doc_strip
from security import current_manager, decode_token
from storage_client import get_object

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/responses", tags=["responses"])


async def _assignment_for_manager(assignment_id: str, manager_id: str) -> dict:
    a = await get_db().assignments.find_one({"id": assignment_id, "manager_id": manager_id})
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    return doc_strip(a)


@router.get("/by-assignment/{assignment_id}", response_model=CandidateResponse)
async def get_response(assignment_id: str, manager: ManagerPublic = Depends(current_manager)):
    await _assignment_for_manager(assignment_id, manager.id)
    r = await get_db().responses.find_one({"assignment_id": assignment_id})
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No response yet")
    return CandidateResponse(**doc_strip(r))


@router.get("/by-assignment/{assignment_id}/audio/{section_id}/{question_index}")
async def get_audio(
    assignment_id: str,
    section_id: str,
    question_index: int,
    t: Optional[str] = Query(default=None, description="JWT (alternative to Authorization header for <audio> tags)"),
):
    """Auth via Authorization header OR ?t=<jwt> query param (so HTML <audio> can stream)."""
    manager_id: Optional[str] = None
    if t:
        manager_id = decode_token(t)
    if not manager_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Auth required (Authorization header or ?t=jwt)")
    await _assignment_for_manager(assignment_id, manager_id)
    r = await get_db().responses.find_one({"assignment_id": assignment_id})
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No response")
    key = f"{section_id}::{question_index}"
    audio = (r.get("audio") or {}).get(key)
    if not audio:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No audio for that question")
    try:
        data, ct = await asyncio.to_thread(get_object, audio["storage_path"])
    except Exception as e:
        logger.exception("Storage fetch failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Storage fetch failed: {e}") from e
    return Response(content=data, media_type=audio.get("content_type", ct))
