"""Wizard AI assist — `/suggest` endpoint.

Provides Claude-haiku-driven suggestions for:
- technical_skills: 10–15 short skill tags tailored to the role
- soft_skills: 10–15 soft-skill tags
- success_criteria: a 2–3 sentence editable draft
- common_challenges: a 2–3 sentence editable draft

Cost guards:
- Uses claude-haiku-4-5 (via CLAUDE_HAIKU_MODEL env, default 'claude-haiku-4-5').
- max_tokens hard-capped at 500.
- max_attempts = 2.
- Process-wide in-memory cache keyed by (kind|title|industry|seniority|existing-hash),
  so repeated wizard re-renders don't re-bill. Cache is per-process (resets on deploy).
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from claude_service import call_claude_json, has_api_key
from models import ManagerPublic
from routes_auth import current_manager

router = APIRouter(prefix="/suggest", tags=["suggest"])
logger = logging.getLogger("encore.suggest")

SuggestKind = Literal["technical_skills", "soft_skills", "success_criteria", "common_challenges"]


def _haiku_model() -> str:
    return os.environ.get("CLAUDE_HAIKU_MODEL", "claude-haiku-4-5")


# ---------- IO shapes ----------
class SuggestRequest(BaseModel):
    kind: SuggestKind
    job_title: str = Field(min_length=2, max_length=120)
    industry: Optional[str] = Field(default=None, max_length=120)
    seniority: Optional[str] = Field(default=None, max_length=20)
    existing: List[str] = Field(default_factory=list, max_length=50)


class SkillSuggestResponse(BaseModel):
    suggestions: List[str]
    source: Literal["ai", "cache", "fallback"] = "ai"
    model: Optional[str] = None


class TextSuggestResponse(BaseModel):
    draft: str
    source: Literal["ai", "cache", "fallback"] = "ai"
    model: Optional[str] = None


# ---------- AI shapes (what we ask Claude for) ----------
class _SkillJSON(BaseModel):
    suggestions: List[str] = Field(min_length=4, max_length=20)


class _TextJSON(BaseModel):
    draft: str = Field(min_length=20, max_length=800)


# ---------- Static taxonomy fallback ----------
# Domain-keyed seed skill list so the wizard always has *something* useful,
# even with no Claude key configured. Hand-curated for Indian core-engineering SMEs.
_SKILL_TAXONOMY = {
    "metallurgy": ["Heat treatment", "Phase diagrams", "Failure analysis", "Casting defects", "Microstructure analysis", "Hardness testing", "Corrosion control", "Welding metallurgy"],
    "mechanical": ["GD&T", "FEA / Ansys", "Mechanical design", "Tolerance stacking", "Vibration analysis", "Fatigue analysis", "DFM/DFA", "CAD (SolidWorks/Creo)"],
    "civil": ["RCC design", "Structural analysis", "BIM / Revit", "Site supervision", "Soil mechanics", "Construction management", "STAAD / ETABS", "Estimation & costing"],
    "chemical": ["Process safety (HAZOP)", "Distillation design", "PFD / P&ID", "Reactor design", "Heat exchangers", "Mass balance", "Yield optimisation", "Aspen Plus"],
    "manufacturing": ["Lean / 5S", "Six Sigma", "OEE", "SPC", "Kaizen", "Production planning", "Quality control", "Root cause analysis"],
    "qa": ["Test strategy", "Defect tracking", "ISO 9001", "Statistical sampling", "CAPA", "Process audit", "Failure mode analysis (FMEA)", "Calibration"],
    "foundry": ["Sand casting", "Investment casting", "Pattern design", "Melting practice", "Mould inspection", "Defect classification", "Heat balance", "Cooling control"],
    "default": ["Problem solving", "Data analysis", "Domain expertise", "Documentation", "Stakeholder communication", "Process improvement", "Technical investigation", "Quality mindset"],
}

_SOFT_SEED = [
    "Cross-functional collaboration", "Stakeholder communication", "Ownership mindset",
    "Calm under pressure", "Influencing without authority", "Coaching juniors",
    "Async written clarity", "Structured thinking", "Bias for action",
    "Customer empathy", "Conflict resolution", "Time-bounded decisions",
]


def _seed_skills(kind: SuggestKind, job_title: str, industry: Optional[str]) -> List[str]:
    if kind == "soft_skills":
        return _SOFT_SEED[:]
    blob = f"{(industry or '').lower()} {(job_title or '').lower()}"
    matched: List[str] = []
    for key, vals in _SKILL_TAXONOMY.items():
        if key == "default":
            continue
        if key in blob:
            matched.extend(vals)
    if not matched:
        matched.extend(_SKILL_TAXONOMY["default"])
    # Dedupe in order
    seen, out = set(), []
    for s in matched:
        if s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out[:16]


# ---------- Process-wide cache ----------
_CACHE: dict[str, tuple[float, object]] = {}
_CACHE_TTL_SEC = 60 * 60  # 1 hour


def _cache_key(req: SuggestRequest) -> str:
    h = hashlib.sha1()
    payload = "|".join([
        req.kind,
        (req.job_title or "").strip().lower(),
        (req.industry or "").strip().lower(),
        (req.seniority or "").strip().lower(),
        ",".join(sorted(s.strip().lower() for s in req.existing)),
    ])
    h.update(payload.encode())
    return h.hexdigest()


def _cache_get(key: str):
    rec = _CACHE.get(key)
    if not rec:
        return None
    ts, val = rec
    if time.time() - ts > _CACHE_TTL_SEC:
        _CACHE.pop(key, None)
        return None
    return val


def _cache_put(key: str, val):
    _CACHE[key] = (time.time(), val)


# ---------- Prompt builders ----------
def _system_for(kind: SuggestKind) -> str:
    if kind in ("technical_skills", "soft_skills"):
        return (
            "You are a senior hiring partner who has interviewed hundreds of engineers and operators "
            "for Indian core-engineering and manufacturing SMEs. You suggest skill tags that are "
            "specific, concrete, and actually testable on a 3-hour work-simulation case study. "
            "You return ONLY valid JSON in the exact shape: {\"suggestions\": [\"<tag>\", ...]}. "
            "No commentary. No markdown."
        )
    return (
        "You are a senior hiring partner who writes calm, specific role briefs for Indian "
        "core-engineering and manufacturing SMEs. You return ONLY a JSON object in the shape: "
        "{\"draft\": \"<2-3 sentence editable draft>\"}. No markdown. No commentary."
    )


def _user_for(req: SuggestRequest) -> str:
    base = (
        f"Job title: {req.job_title}\n"
        f"Industry: {req.industry or 'unspecified'}\n"
        f"Seniority: {req.seniority or 'unspecified'}\n"
    )
    if req.existing:
        base += f"Already selected (DO NOT REPEAT these): {', '.join(req.existing)}\n"
    if req.kind == "technical_skills":
        base += (
            "Suggest 12 *technical* skill tags this role specifically needs. "
            "Prefer specific tools, methods, and domain knowledge over vague labels. "
            "Each tag should be 1–4 words. Avoid soft skills (handled separately)."
        )
    elif req.kind == "soft_skills":
        base += (
            "Suggest 10 *soft* skill tags this role specifically rewards. "
            "Each tag should be 1–4 words, action-oriented, and observable from a written work product."
        )
    elif req.kind == "success_criteria":
        base += (
            "Write 2–3 sentences describing what success looks like in this role at the 90-day mark. "
            "Be specific. No marketing language."
        )
    elif req.kind == "common_challenges":
        base += (
            "Write 2–3 sentences describing the most common, real challenges this role faces in the "
            "first 6 months. Specific situations. No hedging."
        )
    return base


# ---------- Route ----------
@router.post("", response_model=dict)
async def suggest(req: SuggestRequest, manager: ManagerPublic = Depends(current_manager)):
    """Cost-guarded AI suggestions for the wizard. Returns SkillSuggest or TextSuggest based on kind."""
    cache_key = _cache_key(req)
    cached = _cache_get(cache_key)
    if cached is not None:
        out = cached.model_copy()
        out.source = "cache"
        return out.model_dump()

    # Fallback when no Claude key configured
    if not has_api_key():
        if req.kind in ("technical_skills", "soft_skills"):
            seed = _seed_skills(req.kind, req.job_title, req.industry)
            existing_lower = {e.lower() for e in req.existing}
            fresh = [s for s in seed if s.lower() not in existing_lower][:12]
            resp = SkillSuggestResponse(suggestions=fresh, source="fallback", model=None)
        else:
            placeholder = (
                "Drives clear outcomes in the first 90 days by understanding the existing setup, "
                "asking the right questions early, and shipping one meaningful win that the team can rally around."
                if req.kind == "success_criteria"
                else "Inherits incomplete documentation, conflicting priorities from production and quality teams, "
                "and pressure to deliver before the underlying systems are well understood."
            )
            resp = TextSuggestResponse(draft=placeholder, source="fallback", model=None)
        _cache_put(cache_key, resp)
        return resp.model_dump()

    # Live Claude call
    try:
        if req.kind in ("technical_skills", "soft_skills"):
            ai = await call_claude_json(
                system=_system_for(req.kind),
                user=_user_for(req),
                model=_SkillJSON,
                max_tokens=500,
                timeout=20.0,
                max_attempts=2,
                model_override=_haiku_model(),
            )
            # Filter out duplicates of `existing`
            existing_lower = {e.lower() for e in req.existing}
            fresh = [s.strip() for s in ai.suggestions if s.strip() and s.strip().lower() not in existing_lower]
            # Cap to 15
            resp = SkillSuggestResponse(suggestions=fresh[:15], source="ai", model=_haiku_model())
        else:
            ai = await call_claude_json(
                system=_system_for(req.kind),
                user=_user_for(req),
                model=_TextJSON,
                max_tokens=500,
                timeout=20.0,
                max_attempts=2,
                model_override=_haiku_model(),
            )
            resp = TextSuggestResponse(draft=ai.draft.strip(), source="ai", model=_haiku_model())
        _cache_put(cache_key, resp)
        return resp.model_dump()
    except Exception as e:  # noqa: BLE001
        logger.warning("Suggest call failed (%s) — serving fallback", e)
        # Graceful fallback so the wizard never blocks the user
        if req.kind in ("technical_skills", "soft_skills"):
            seed = _seed_skills(req.kind, req.job_title, req.industry)
            existing_lower = {e.lower() for e in req.existing}
            fresh = [s for s in seed if s.lower() not in existing_lower][:12]
            return SkillSuggestResponse(suggestions=fresh, source="fallback").model_dump()
        return TextSuggestResponse(draft="", source="fallback").model_dump()
