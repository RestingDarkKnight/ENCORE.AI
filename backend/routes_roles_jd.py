"""JD parsing — `POST /api/roles/parse-jd`.

Accepts a raw job-description blob (paste OR file text) and returns a
Role-shaped dictionary the frontend can drop directly into the CreateRole
wizard. Uses claude-haiku-4-5 (fast + cheap) via the shared LLM service.
"""
from __future__ import annotations

import logging
import os
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from claude_service import call_claude_json, has_api_key
from models import ManagerPublic
from security import current_manager

router = APIRouter(prefix="/roles", tags=["roles-jd"])
logger = logging.getLogger("encore.jd")


def _haiku_model() -> str:
    return os.environ.get("CLAUDE_HAIKU_MODEL", "claude-haiku-4-5")


class ParseJdRequest(BaseModel):
    jd_text: str = Field(min_length=40, max_length=20000)


class ParsedRole(BaseModel):
    """Output shape from the JD parser. Matches the CreateRole wizard 1-to-1."""
    job_title: str = ""
    industry: str = ""
    seniority: Literal["junior", "mid", "senior", "lead"] = "mid"
    difficulty_level: Literal["foundational", "applied", "advanced", "expert"] = "applied"
    language_register: Literal["plain", "standard", "advanced"] = "standard"
    technical_skills: List[str] = Field(default_factory=list)
    soft_skills: List[str] = Field(default_factory=list)
    success_criteria: str = ""
    common_challenges: str = ""


_SYS = """You are ENCORE, an expert hiring assistant. Given a raw job description you extract
the fields needed to seed our role-creation wizard. Be honest — infer only what the JD supports.

Rules:
- job_title: canonical, short (e.g. "Senior Backend Engineer", "QA Analyst").
- industry: 1–3 words (e.g. "Fintech", "Manufacturing SaaS", "Healthtech"). If unclear, guess based on context.
- seniority: exactly one of junior | mid | senior | lead. Infer from years-of-experience or explicit level.
- difficulty_level: one of foundational | applied | advanced | expert. Rule of thumb: junior→foundational, mid→applied, senior→advanced, lead→expert. Adjust ± one band based on the role's technical depth.
- language_register: plain (candidate audience less fluent in English), standard (typical B2B), advanced (research/PhD-level roles). Default to standard if unclear.
- technical_skills: 5–10 short kebab/space skill tags actually mentioned or clearly implied (e.g. "Python", "PostgreSQL", "System design"). No sentences.
- soft_skills: 3–6 short tags (e.g. "Stakeholder management", "Written communication").
- success_criteria: 2–3 sentences describing what "great" in this role looks like. Concrete, observable.
- common_challenges: 2–3 sentences describing typical struggles or friction in this role.

Return ONLY valid JSON matching the ParsedRole schema. No preamble, no markdown fences."""


@router.post("/parse-jd", response_model=ParsedRole)
async def parse_jd(payload: ParseJdRequest, manager: ManagerPublic = Depends(current_manager)):
    if not has_api_key():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Claude isn't configured on this environment yet. Add ANTHROPIC_API_KEY or deploy on Emergent to auto-provision the LLM key.",
        )
    try:
        original = os.environ.get("CLAUDE_MODEL")
        os.environ["CLAUDE_MODEL"] = _haiku_model()
        try:
            parsed = await call_claude_json(
                system=_SYS,
                user=f"JOB DESCRIPTION:\n{payload.jd_text}\n\nReturn JSON only.",
                model=ParsedRole,
                max_tokens=1500,
                timeout=45.0,
            )
        finally:
            if original is None:
                os.environ.pop("CLAUDE_MODEL", None)
            else:
                os.environ["CLAUDE_MODEL"] = original
        return parsed
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("JD parse failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Could not parse this JD: {exc}")
