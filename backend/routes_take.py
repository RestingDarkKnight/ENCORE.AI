"""Public candidate-take routes — token-gated, no JWT auth."""
import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)

from db import get_db
from models import (
    AudioRecord,
    CandidateCaseView,
    CandidateResponse,
    CandidateSection,
    ProgressSaveRequest,
    SubmitRequest,
    TakeView,
    doc_strip,
)
from storage_client import get_object, put_object
from transcription import transcribe_bytes

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/take", tags=["take"])

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB — Whisper hard limit
ALLOWED_AUDIO_TYPES = {"audio/webm", "audio/ogg", "audio/wav", "audio/mp4", "audio/mpeg", "audio/x-m4a"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _load_assignment_and_case(token: str):
    db = get_db()
    a = await db.assignments.find_one({"token": token})
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invalid invitation link")
    a = doc_strip(a)
    c = await db.cases.find_one({"id": a["case_id"]})
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case for this invitation is missing")
    return a, doc_strip(c)


async def _ensure_response(db, assignment_id: str) -> dict:
    r = await db.responses.find_one({"assignment_id": assignment_id})
    if r:
        return doc_strip(r)
    response = CandidateResponse(assignment_id=assignment_id)
    await db.responses.insert_one(response.model_dump())
    return response.model_dump()


def _candidate_case_view(case_doc: dict) -> CandidateCaseView:
    return CandidateCaseView(
        case_id=case_doc["id"],
        title=case_doc["title"],
        scenario_text=case_doc["scenario_text"],
        sections=[CandidateSection(**s) for s in case_doc["sections"]],
        estimated_minutes=case_doc["estimated_minutes"],
    )


# ---------- GET — load case + saved progress ----------
@router.get("/{token}", response_model=TakeView)
async def get_take(token: str):
    a, c = await _load_assignment_and_case(token)
    db = get_db()

    # Mark started on first GET (after submit, leave alone)
    if a["status"] == "sent":
        now = _now()
        await db.assignments.update_one(
            {"id": a["id"]},
            {"$set": {"status": "in_progress", "started_at": now}},
        )
        a["status"] = "in_progress"
        a["started_at"] = now

    r = await _ensure_response(db, a["id"])

    return TakeView(
        assignment_id=a["id"],
        status=a["status"],
        candidate_email=a["candidate_email"],
        candidate_name=a.get("candidate_name"),
        time_limit_minutes=a["time_limit_minutes"],
        started_at=a.get("started_at"),
        submitted_at=a.get("submitted_at"),
        case=_candidate_case_view(c),
        saved_answers=r.get("answers", {}),
        saved_audio={k: AudioRecord(**v) for k, v in r.get("audio", {}).items()},
        honor_code_accepted=r.get("honor_code_accepted", False),
    )


# ---------- POST — autosave progress ----------
@router.post("/{token}/progress", status_code=status.HTTP_204_NO_CONTENT)
async def save_progress(token: str, payload: ProgressSaveRequest):
    a, _ = await _load_assignment_and_case(token)
    if a["status"] == "submitted":
        raise HTTPException(status.HTTP_409_CONFLICT, "This case has already been submitted")
    db = get_db()
    await _ensure_response(db, a["id"])
    updates = {"answers": payload.answers, "updated_at": _now()}
    if payload.honor_code_accepted is not None:
        updates["honor_code_accepted"] = payload.honor_code_accepted
    await db.responses.update_one({"assignment_id": a["id"]}, {"$set": updates})
    return Response(status_code=204)


# ---------- POST — upload audio for a specific question ----------
@router.post("/{token}/audio")
async def upload_audio(
    token: str,
    background_tasks: BackgroundTasks,
    section_id: str = Form(...),
    question_index: int = Form(...),
    file: UploadFile = File(...),
):
    a, c = await _load_assignment_and_case(token)
    if a["status"] == "submitted":
        raise HTTPException(status.HTTP_409_CONFLICT, "Cannot add audio after submission")

    # Validate section + question exist
    section = next((s for s in c["sections"] if s["id"] == section_id), None)
    if not section or question_index < 0 or question_index >= len(section["questions"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown section/question")

    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty audio file")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Audio exceeds 25 MB")

    content_type = (file.content_type or "audio/webm").split(";")[0]
    ext = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mp4": "m4a", "audio/mpeg": "mp3"}.get(content_type, "webm")
    path = f"encore/audio/{a['id']}/{section_id}/{question_index}-{uuid.uuid4().hex}.{ext}"

    try:
        result = await asyncio.to_thread(put_object, path, data, content_type)
    except Exception as e:
        logger.exception("Storage upload failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Storage upload failed: {e}") from e

    db = get_db()
    await _ensure_response(db, a["id"])
    key = f"{section_id}::{question_index}"
    audio = AudioRecord(
        storage_path=result["path"],
        content_type=content_type,
        size=result.get("size", len(data)),
    )
    await db.responses.update_one(
        {"assignment_id": a["id"]},
        {"$set": {f"audio.{key}": audio.model_dump(), "updated_at": _now()}},
    )

    # Transcribe in background — never blocks submit/upload
    background_tasks.add_task(_transcribe_clip, a["id"], key, result["path"], content_type)

    return {"ok": True, "key": key, "storage_path": result["path"], "size": audio.size}


async def _transcribe_clip(assignment_id: str, key: str, storage_path: str, content_type: str) -> None:
    try:
        data, _ct = await asyncio.to_thread(get_object, storage_path)
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not fetch %s for transcription: %s", storage_path, e)
        return
    ext = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mp4": "m4a", "audio/mpeg": "mp3"}.get(content_type, "webm")
    text = await transcribe_bytes(data, filename=f"clip.{ext}")
    if text is None:
        return
    db = get_db()
    await db.responses.update_one(
        {"assignment_id": assignment_id},
        {
            "$set": {
                f"audio.{key}.transcript": text,
                f"audio.{key}.transcribed_at": _now(),
            }
        },
    )
    logger.info("Transcription saved for assignment=%s key=%s len=%d", assignment_id, key, len(text))


# ---------- POST — final submit ----------
@router.post("/{token}/submit", response_model=TakeView)
async def submit_take(token: str, payload: SubmitRequest, background_tasks: BackgroundTasks):
    a, c = await _load_assignment_and_case(token)
    if a["status"] == "submitted":
        raise HTTPException(status.HTTP_409_CONFLICT, "Already submitted")
    if not payload.honor_code_accepted:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Honor code must be accepted to submit")
    db = get_db()
    now = _now()
    await _ensure_response(db, a["id"])
    await db.responses.update_one(
        {"assignment_id": a["id"]},
        {"$set": {
            "answers": payload.answers,
            "honor_code_accepted": True,
            "submitted_at": now,
            "time_taken_seconds": payload.time_taken_seconds,
            "updated_at": now,
        }},
    )
    await db.assignments.update_one(
        {"id": a["id"]},
        {"$set": {"status": "submitted", "submitted_at": now}},
    )

    # Trigger Claude evaluation asynchronously (never blocks submit).
    background_tasks.add_task(_auto_evaluate, a["id"])

    return await get_take(token)


async def _auto_evaluate(assignment_id: str) -> None:
    """Best-effort: kick off Claude evaluation after submit. Swallows errors."""
    from claude_service import has_api_key
    from evaluation import eval_model_name, evaluate_response
    from models import Evaluation

    if not has_api_key():
        logger.info("Skipping auto-evaluation: ANTHROPIC_API_KEY not set (assignment=%s)", assignment_id)
        return
    db = get_db()
    try:
        a = await db.assignments.find_one({"id": assignment_id})
        if not a:
            return
        r = await db.responses.find_one({"assignment_id": assignment_id})
        if not r:
            return
        # Skip if already evaluated
        if await db.evaluations.find_one({"response_id": r["id"]}):
            return
        case = await db.cases.find_one({"id": a["case_id"]})
        if not case:
            return
        draft = await evaluate_response(doc_strip(case), doc_strip(r))
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
        logger.info("Auto-evaluation stored for assignment=%s", assignment_id)
    except Exception as e:  # noqa: BLE001
        logger.exception("Auto-evaluation failed for %s: %s", assignment_id, e)


# ---------- Audio streaming (auth-gated via query param for the candidate's own clip) ----------
@router.get("/{token}/audio/{section_id}/{question_index}")
async def stream_candidate_audio(token: str, section_id: str, question_index: int):
    """The candidate can play back their own clip while still in progress."""
    a, _ = await _load_assignment_and_case(token)
    r = await get_db().responses.find_one({"assignment_id": a["id"]})
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No response yet")
    key = f"{section_id}::{question_index}"
    audio = (r.get("audio") or {}).get(key)
    if not audio:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No audio for this question")
    try:
        data, ct = await asyncio.to_thread(get_object, audio["storage_path"])
    except Exception as e:
        logger.exception("Storage fetch failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Storage fetch failed: {e}") from e
    return Response(content=data, media_type=audio.get("content_type", ct))
