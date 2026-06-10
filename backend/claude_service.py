"""Anthropic Claude integration with robust JSON parsing.

- API key + model name read from env vars (never hardcoded).
- Both calls are async and offload the blocking SDK call to a thread.
- Output is parsed defensively: strip code fences, locate first balanced JSON,
  validate against expected Pydantic shape, fail with a clear retry path.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Dict, Optional, Type, TypeVar

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)


def _model() -> str:
    return os.environ.get("CLAUDE_MODEL", "claude-opus-4-8")


def has_api_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())


def _extract_json(text: str) -> str:
    """Strip markdown fences or locate first balanced JSON object."""
    text = text.strip()
    fence = _CODE_FENCE_RE.search(text)
    if fence:
        return fence.group(1).strip()
    # Locate first balanced {...}
    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON object found in model response")
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    raise ValueError("Unbalanced JSON braces in model response")


def parse_json_strict(text: str, model: Type[T]) -> T:
    raw = _extract_json(text)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Malformed JSON from model: {e}") from e
    try:
        return model.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"JSON did not match expected shape: {e}") from e


async def _claude_call(system: str, user: str, max_tokens: int = 4096, timeout: float = 90.0) -> str:
    """Run a Claude messages call in a worker thread; return the text content."""
    if not has_api_key():
        raise RuntimeError("ANTHROPIC_API_KEY is not configured on the server")

    from anthropic import Anthropic  # imported lazily so app starts without key

    def _do_call() -> str:
        client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], timeout=timeout)
        resp = client.messages.create(
            model=_model(),
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        # Join all text blocks
        return "".join(getattr(b, "text", "") for b in resp.content)

    try:
        return await asyncio.wait_for(asyncio.to_thread(_do_call), timeout=timeout + 5)
    except asyncio.TimeoutError as e:
        raise RuntimeError("Claude request timed out") from e


async def call_claude_json(
    system: str,
    user: str,
    model: Type[T],
    *,
    max_tokens: int = 4096,
    timeout: float = 90.0,
    max_attempts: int = 2,
) -> T:
    """Call Claude expecting strict JSON; retry once on parse/validation failure."""
    last_err: Optional[Exception] = None
    for attempt in range(1, max_attempts + 1):
        try:
            text = await _claude_call(system=system, user=user, max_tokens=max_tokens, timeout=timeout)
            return parse_json_strict(text, model)
        except (ValueError, RuntimeError) as e:
            last_err = e
            logger.warning("Claude JSON attempt %s failed: %s", attempt, e)
            if attempt < max_attempts:
                # On retry, append a stricter instruction
                user = user + "\n\nIMPORTANT: Your previous response was not valid JSON. Reply with ONLY a valid JSON object. No markdown, no commentary."
    assert last_err is not None
    raise last_err


# ---------- Smoke test (used by /api/claude/health) ----------
async def smoke_test() -> Dict[str, Any]:
    if not has_api_key():
        return {"ok": False, "configured": False, "message": "ANTHROPIC_API_KEY not set"}
    try:
        text = await _claude_call(
            system="You are a JSON-only API.",
            user='Respond with exactly: {"ok": true, "model": "claude"}',
            max_tokens=64,
            timeout=20.0,
        )
        data = json.loads(_extract_json(text))
        return {"ok": True, "configured": True, "model": _model(), "echo": data}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "configured": True, "model": _model(), "error": str(e)}
