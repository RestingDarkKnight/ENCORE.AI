"""Case study routes — generation, edit, approve, regenerate-section."""
import logging
import os
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from claude_service import call_claude_json, has_api_key, smoke_test
from db import get_db
from models import (
    Case,
    CaseGenerateRequest,
    CaseSection,
    CaseStudyDraft,
    CaseUpdateRequest,
    ManagerPublic,
    SectionRegenerateRequest,
    doc_strip,
)
from security import current_manager

router = APIRouter(prefix="/cases", tags=["cases"])
logger = logging.getLogger(__name__)


# ---------- Prompts ----------
_SYSTEM_PROMPT_GENERATE = """You are ENCORE, a senior hiring manager and expert assessment designer.

You design OPEN-ENDED, work-simulation case studies that test JUDGMENT, INVESTIGATION, TRADE-OFF REASONING, and COMMUNICATION — NEVER textbook recall or definitions.

Hard rules every case MUST follow:
- The scenario is a SPECIFIC, realistic situation the candidate could face on this exact job, with real constraints (deadlines, incomplete data, competing priorities, real stakeholders by role).
- There is NO single right answer, but the situation is anchored enough that strong reasoning is visibly distinguishable from weak.
- Calibrate difficulty to the seniority and difficulty_level provided.
- Every question asks for a DECISION, an INVESTIGATION PLAN, a TRADE-OFF, or a JUSTIFICATION — never a definition or recall.
- Structure: a story-style scenario_text, then 3-4 sections, each with its own intro and 3-6 questions.
- Produce a rubric of 4-6 named scoring dimensions; weights are PERCENTAGES summing to exactly 100; each dimension includes behavioral anchors describing what a 1 (weak), a 3 (solid), and a 5 (exceptional) answer looks like for THIS specific scenario.

You MUST return ONLY a single valid JSON object. NO markdown, NO preamble, NO commentary. The JSON must match exactly this shape:
{
  "title": str,
  "scenario_text": str,        // 250-500 words. Story-style intro: who the candidate is in the simulation, the company, the situation, the stakeholders, the constraints.
  "sections": [
    {
      "id": str,                // any short unique id
      "title": str,
      "intro": str,             // 1-3 sentences framing the section
      "questions": [str]        // 3-6 questions, each requiring judgment
    }
  ],                            // 3-4 sections total
  "rubric": [
    {
      "id": str,
      "name": str,
      "description": str,
      "weight": number,         // percentage; all weights sum to 100
      "anchors": {
        "one": str,             // ~1-2 sentences
        "three": str,           // ~1-2 sentences
        "five": str             // ~1-2 sentences
      }
    }
  ],                            // 4-6 dimensions
  "estimated_minutes": int      // 30-120
}
JSON only."""


_SYSTEM_PROMPT_SECTION = """You are ENCORE, an expert assessment designer. You will REGENERATE a single section of an existing case study.

Constraints:
- Keep the section faithful to the existing scenario (same world, same stakeholders, same constraints).
- The new section's questions test judgment, investigation, or trade-offs — NEVER recall.
- Return ONLY a single valid JSON object matching this shape:
{
  "id": str,
  "title": str,
  "intro": str,
  "questions": [str]
}
3-6 questions. JSON only, no markdown, no commentary."""


def _role_brief(role: dict) -> str:
    return (
        f"Job title: {role['job_title']}\n"
        f"Industry / domain: {role.get('industry') or 'unspecified'}\n"
        f"Seniority: {role['seniority']}\n"
        f"Difficulty level: {role['difficulty_level']}\n"
        f"Technical skills to assess: {', '.join(role.get('technical_skills', [])) or 'unspecified'}\n"
        f"Soft skills to assess: {', '.join(role.get('soft_skills', [])) or 'unspecified'}\n"
        f"Success criteria for this role: {role.get('success_criteria') or 'unspecified'}\n"
        f"Common challenges this role faces: {role.get('common_challenges') or 'unspecified'}\n"
    )


# ---------- Endpoints ----------
@router.get("/health")
async def claude_health():
    return await smoke_test()


@router.post("/generate", response_model=Case, status_code=status.HTTP_201_CREATED)
async def generate_case(payload: CaseGenerateRequest, manager: ManagerPublic = Depends(current_manager)):
    if not has_api_key():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Claude is not configured yet. Set ANTHROPIC_API_KEY on the server to enable case generation.",
        )

    role = await get_db().roles.find_one({"id": payload.role_id, "manager_id": manager.id})
    if not role:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    role = doc_strip(role)

    user_prompt = (
        "Design a work-simulation case study for the role described below.\n\n"
        f"{_role_brief(role)}\n"
        f"Additional notes from the hiring manager: {payload.notes or 'none'}\n\n"
        "Return JSON only, matching the schema in the system message."
    )

    try:
        draft = await call_claude_json(
            system=_SYSTEM_PROMPT_GENERATE,
            user=user_prompt,
            model=CaseStudyDraft,
            max_tokens=6000,
            timeout=120.0,
        )
    except Exception as e:
        logger.exception("Case generation failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Failed to generate a valid case study: {e}")

    case = Case(
        role_id=role["id"],
        manager_id=manager.id,
        title=draft.title,
        scenario_text=draft.scenario_text,
        sections=draft.sections,
        rubric=draft.rubric,
        estimated_minutes=draft.estimated_minutes,
        model_used=os.environ.get("CLAUDE_MODEL", "claude-opus-4-8"),
        model_version=os.environ.get("CLAUDE_MODEL", "claude-opus-4-8"),
    )
    await get_db().cases.insert_one(case.model_dump())
    return case


@router.post("/{case_id}/regenerate", response_model=Case)
async def regenerate_case(case_id: str, manager: ManagerPublic = Depends(current_manager)):
    """Wholly regenerate a draft case (keeps the same id; overwrites content)."""
    if not has_api_key():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Claude is not configured")
    existing = await get_db().cases.find_one({"id": case_id, "manager_id": manager.id})
    if not existing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    if existing.get("status") == "approved":
        raise HTTPException(status.HTTP_409_CONFLICT, "Approved cases cannot be regenerated")
    role = await get_db().roles.find_one({"id": existing["role_id"], "manager_id": manager.id})
    if not role:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    role = doc_strip(role)

    user_prompt = (
        "Regenerate a fresh work-simulation case for the role below. Produce a noticeably different scenario from any previous draft.\n\n"
        f"{_role_brief(role)}\n"
        "Return JSON only."
    )
    try:
        draft = await call_claude_json(
            system=_SYSTEM_PROMPT_GENERATE,
            user=user_prompt,
            model=CaseStudyDraft,
            max_tokens=6000,
            timeout=120.0,
        )
    except Exception as e:
        logger.exception("Case regeneration failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Failed to regenerate: {e}")

    now = datetime.now(timezone.utc).isoformat()
    updates = {
        "title": draft.title,
        "scenario_text": draft.scenario_text,
        "sections": [s.model_dump() for s in draft.sections],
        "rubric": [r.model_dump() for r in draft.rubric],
        "estimated_minutes": draft.estimated_minutes,
        "updated_at": now,
    }
    await get_db().cases.update_one({"id": case_id}, {"$set": updates})
    doc = await get_db().cases.find_one({"id": case_id})
    return Case(**doc_strip(doc))


@router.post("/{case_id}/regenerate-section", response_model=Case)
async def regenerate_section(
    case_id: str,
    payload: SectionRegenerateRequest,
    manager: ManagerPublic = Depends(current_manager),
):
    if not has_api_key():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Claude is not configured")
    existing = await get_db().cases.find_one({"id": case_id, "manager_id": manager.id})
    if not existing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    if existing.get("status") == "approved":
        raise HTTPException(status.HTTP_409_CONFLICT, "Approved cases cannot be modified")

    target = next((s for s in existing["sections"] if s["id"] == payload.section_id), None)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Section not found")

    user_prompt = (
        "Regenerate the section below for an existing case study. Keep it consistent with the case scenario.\n\n"
        f"CASE TITLE: {existing['title']}\n"
        f"CASE SCENARIO:\n{existing['scenario_text']}\n\n"
        f"SECTION TO REPLACE — title: {target['title']}\n"
        f"SECTION TO REPLACE — current intro: {target['intro']}\n"
        f"Manager notes: {payload.notes or 'none'}\n\n"
        "Return JSON only matching the section schema."
    )

    try:
        new_section = await call_claude_json(
            system=_SYSTEM_PROMPT_SECTION,
            user=user_prompt,
            model=CaseSection,
            max_tokens=2000,
            timeout=60.0,
        )
    except Exception as e:
        logger.exception("Section regeneration failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Failed to regenerate section: {e}")

    new_section_data = new_section.model_dump()
    new_section_data["id"] = payload.section_id  # preserve id
    new_sections = [
        new_section_data if s["id"] == payload.section_id else s
        for s in existing["sections"]
    ]
    now = datetime.now(timezone.utc).isoformat()
    await get_db().cases.update_one(
        {"id": case_id}, {"$set": {"sections": new_sections, "updated_at": now}}
    )
    doc = await get_db().cases.find_one({"id": case_id})
    return Case(**doc_strip(doc))


@router.patch("/{case_id}", response_model=Case)
async def update_case(case_id: str, payload: CaseUpdateRequest, manager: ManagerPublic = Depends(current_manager)):
    existing = await get_db().cases.find_one({"id": case_id, "manager_id": manager.id})
    if not existing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    if existing.get("status") == "approved":
        raise HTTPException(status.HTTP_409_CONFLICT, "Approved cases are locked. Reopen to edit.")

    updates = {}
    for k, v in payload.model_dump(exclude_none=True).items():
        if k == "sections" and v is not None:
            updates[k] = [s if isinstance(s, dict) else s.model_dump() for s in v]
        elif k == "rubric" and v is not None:
            updates[k] = [r if isinstance(r, dict) else r.model_dump() for r in v]
        else:
            updates[k] = v
    if not updates:
        return Case(**doc_strip(existing))

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await get_db().cases.update_one({"id": case_id}, {"$set": updates})
    doc = await get_db().cases.find_one({"id": case_id})
    return Case(**doc_strip(doc))


@router.post("/{case_id}/approve", response_model=Case)
async def approve_case(case_id: str, manager: ManagerPublic = Depends(current_manager)):
    existing = await get_db().cases.find_one({"id": case_id, "manager_id": manager.id})
    if not existing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    now = datetime.now(timezone.utc).isoformat()
    await get_db().cases.update_one(
        {"id": case_id},
        {"$set": {"status": "approved", "approved_at": now, "updated_at": now}},
    )
    doc = await get_db().cases.find_one({"id": case_id})
    return Case(**doc_strip(doc))


@router.post("/{case_id}/reopen", response_model=Case)
async def reopen_case(case_id: str, manager: ManagerPublic = Depends(current_manager)):
    """Allow editing again on an approved case."""
    existing = await get_db().cases.find_one({"id": case_id, "manager_id": manager.id})
    if not existing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    await get_db().cases.update_one(
        {"id": case_id},
        {"$set": {"status": "draft", "approved_at": None, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    doc = await get_db().cases.find_one({"id": case_id})
    return Case(**doc_strip(doc))


@router.get("/role/{role_id}", response_model=List[Case])
async def list_cases_for_role(role_id: str, manager: ManagerPublic = Depends(current_manager)):
    role = await get_db().roles.find_one({"id": role_id, "manager_id": manager.id})
    if not role:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    cursor = get_db().cases.find({"role_id": role_id}).sort("created_at", -1)
    return [Case(**doc_strip(d)) async for d in cursor]


@router.get("/{case_id}", response_model=Case)
async def get_case(case_id: str, manager: ManagerPublic = Depends(current_manager)):
    doc = await get_db().cases.find_one({"id": case_id, "manager_id": manager.id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    return Case(**doc_strip(doc))
