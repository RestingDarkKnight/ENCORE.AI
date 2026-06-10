"""OpenAI Whisper transcription via the Emergent Universal Key."""
from __future__ import annotations

import io
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


def has_key() -> bool:
    return bool(os.environ.get("EMERGENT_LLM_KEY", "").strip())


async def transcribe_bytes(audio_bytes: bytes, filename: str = "audio.webm") -> Optional[str]:
    """Transcribe an audio buffer. Returns the text or None on failure.

    Never raises — the candidate's submission must not be blocked by transcription.
    """
    if not audio_bytes:
        return None
    if not has_key():
        logger.warning("Skipping transcription: EMERGENT_LLM_KEY not set")
        return None
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText

        stt = OpenAISpeechToText(api_key=os.environ["EMERGENT_LLM_KEY"])
        bio = io.BytesIO(audio_bytes)
        bio.name = filename  # OpenAI client uses the .name attribute to detect mime
        response = await stt.transcribe(file=bio, model="whisper-1", response_format="json")
        text = getattr(response, "text", None) or (response.get("text") if isinstance(response, dict) else None)
        return (text or "").strip() or None
    except Exception as e:  # noqa: BLE001
        logger.exception("Transcription failed: %s", e)
        return None
