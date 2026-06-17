"""Six-agent workflow API + feedback routing (Module 1 + 2 + 3.1).

Endpoints:
- POST   /workflows                    — start a new workflow for a role
- GET    /workflows/{id}              — fetch state (for resume)
- POST   /workflows/{id}/run/{step}   — run one agent (1..6). Body may carry user_input / chosen_shape_id / selected_revisions.
- POST   /workflows/{id}/feedback     — record a feedback action; spawns a background extraction call.
- POST   /workflows/{id}/finalize     — create the Case row + mark workflow completed.
- GET    /workflows/by-role/{role_id} — list workflows for a role (resume picker).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel

from claude_service import _claude_call, has_api_key
from db import get_db
from models import ManagerPublic, doc_strip
from routes_auth import current_manager
from agents.memory import normalize_domain_key, retrieve_memory, write_feedback, write_memory, VALID_ENTRY_TYPES
from agents.orchestrator import AGENT_STEP_MAP, run_agent
from agents.workflow_state import create_workflow, get_workflow, list_workflows_for_role, mark_completed, save_step_output

logger = logging.getLogger("encore.routes_workflow")
router = APIRouter(prefix="/workflows", tags=["workflows"])

HAIKU_MODEL = os.environ.get("CLAUDE_HAIKU_MODEL", "claude-haiku-4-5")


# ============================ Request models ============================
class WorkflowStartRequest(BaseModel):
    role_id: str
    jd_text: Optional[str] = None
    assessment_mode: Optional[str] = "interview"
    require_reasoning: Optional[bool] = False


class RunStepRequest(BaseModel):
    user_input: Optional[str] = None
    chosen_shape_id: Optional[str] = None
    selected_revision_ids: Optional[List[str]] = None
    answers_to_clarifying: Optional[Dict[str, str]] = None


class FeedbackRequest(BaseModel):
    agent_name: str
    feedback_type: str         # accepted | revised | rejected | dismissed | user_input
    workflow_step: int
    specifics: Dict[str, Any]


# ============================ Workflow CRUD ============================
@router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def start_workflow(payload: WorkflowStartRequest, manager: ManagerPublic = Depends(current_manager)):
    db = get_db()
    role = await db.roles.find_one({"id": payload.role_id, "manager_id": manager.id})
    if not role:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    domain_key = normalize_domain_key(role.get("industry"), role.get("seniority"))
    mode = (payload.assessment_mode or "interview").lower()
    if mode not in ("screening", "takehome", "interview"):
        mode = "interview"
    wf = await create_workflow(
        manager_id=manager.id,
        role_id=payload.role_id,
        domain_key=domain_key,
        assessment_mode=mode,
        require_reasoning=bool(payload.require_reasoning),
    )
    return wf


@router.get("/by-role/{role_id}", response_model=List[Dict[str, Any]])
async def list_workflows(role_id: str, manager: ManagerPublic = Depends(current_manager)):
    return await list_workflows_for_role(role_id, manager.id)


@router.get("/{workflow_id}", response_model=Dict[str, Any])
async def get_workflow_state(workflow_id: str, manager: ManagerPublic = Depends(current_manager)):
    return await get_workflow(workflow_id, manager.id)


# ============================ Run one agent ============================
@router.post("/{workflow_id}/run/{step}", response_model=Dict[str, Any])
async def run_step(workflow_id: str, step: int, payload: RunStepRequest = RunStepRequest(), manager: ManagerPublic = Depends(current_manager)):
    if step < 1 or step > 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "step must be 1..6")
    if not has_api_key():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "ANTHROPIC_API_KEY is not configured on the server.")

    wf = await get_workflow(workflow_id, manager.id)
    db = get_db()
    role = await db.roles.find_one({"id": wf["role_id"], "manager_id": manager.id})
    if not role:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")

    # Map step → agent_name
    agent_name = {v: k for k, v in AGENT_STEP_MAP.items()}[step]

    # Stash explicit choices into a small "user_input" string so the agent's task sees them
    bits = []
    if payload.user_input:
        bits.append(payload.user_input.strip())
    if payload.chosen_shape_id:
        bits.append(f"chosen_shape_id: {payload.chosen_shape_id}")
    if payload.selected_revision_ids:
        bits.append("selected_revision_ids: " + ", ".join(payload.selected_revision_ids))
    if payload.answers_to_clarifying:
        bits.append("answers_to_clarifying_questions: " + json.dumps(payload.answers_to_clarifying, ensure_ascii=False))
    user_input = "\n".join(bits) if bits else None

    updated = await run_agent(agent_name=agent_name, workflow=wf, role=role, user_input=user_input)
    return updated


# ============================ Feedback + extraction ============================
async def _extract_and_write_memory(*, agent_name: str, manager_id: str, domain_key: str, feedback_id: str, case_id: Optional[str], feedback_type: str, specifics: Dict[str, Any], workflow_step: int) -> None:
    """Spec §3.1 — small Haiku call to convert feedback into a memory_entry payload.

    Fail-soft: if Claude is unavailable or the call errors, we still write a raw
    'unstructured' memory entry so we never lose the signal.
    """
    try:
        valid_types = sorted(VALID_ENTRY_TYPES.get(agent_name, set()))
        if not valid_types:
            return

        if has_api_key():
            sys = (
                f"You distill a single user-feedback event into a SHORT, structured memory record for "
                f"the '{agent_name}' agent. Pick the most appropriate entry_type from this allowed set: "
                f"{valid_types}. Capture only the durable pattern (NOT the raw text). "
                "Reply with ONLY a JSON object: "
                '{"entry_type": "<from set>", "payload": {"summary": "<<= 30 words", "...optional structured fields"}}'
            )
            user = json.dumps({
                "feedback_type": feedback_type,
                "workflow_step": workflow_step,
                "specifics": specifics,
            }, ensure_ascii=False)[:3000]

            text = await _claude_call(system=sys, user=user, max_tokens=200, timeout=15.0, model_override=HAIKU_MODEL)
            # Defensive JSON
            t = text.strip()
            if t.startswith("```"):
                t = t.strip("`")
                if t.lower().startswith("json"):
                    t = t[4:]
            data = json.loads(t)
            entry_type = data.get("entry_type") or valid_types[0]
            payload = data.get("payload") or {"summary": str(specifics)[:200]}
            if entry_type not in VALID_ENTRY_TYPES[agent_name]:
                entry_type = valid_types[0]
            await write_memory(agent_name=agent_name, manager_id=manager_id, domain_key=domain_key, entry_type=entry_type, payload=payload, source_case_id=case_id, source_feedback_id=feedback_id)
            return
    except Exception as e:  # noqa: BLE001
        logger.warning("Feedback extraction failed for %s — saving raw: %s", agent_name, e)

    # Fallback — raw record so we never drop the signal
    fallback_type = sorted(VALID_ENTRY_TYPES.get(agent_name, {"summary"}))[0]
    await write_memory(
        agent_name=agent_name,
        manager_id=manager_id,
        domain_key=domain_key,
        entry_type=fallback_type,
        payload={"summary": f"{feedback_type}: {str(specifics)[:200]}"},
        source_case_id=case_id,
        source_feedback_id=feedback_id,
    )


@router.post("/{workflow_id}/feedback", response_model=Dict[str, Any])
async def record_feedback(workflow_id: str, payload: FeedbackRequest, background: BackgroundTasks, manager: ManagerPublic = Depends(current_manager)):
    wf = await get_workflow(workflow_id, manager.id)
    fb = await write_feedback(
        agent_name=payload.agent_name,
        manager_id=manager.id,
        case_id=wf.get("case_id"),
        workflow_id=workflow_id,
        workflow_step=payload.workflow_step,
        feedback_type=payload.feedback_type,
        specifics=payload.specifics,
    )

    # Only schedule extraction if this feedback is memory-worthy (skip pure 'accepted with no delta')
    if not (payload.feedback_type == "accepted" and not payload.specifics):
        background.add_task(
            _extract_and_write_memory,
            agent_name=payload.agent_name,
            manager_id=manager.id,
            domain_key=wf.get("domain_key") or "general",
            feedback_id=fb["id"],
            case_id=wf.get("case_id"),
            feedback_type=payload.feedback_type,
            specifics=payload.specifics,
            workflow_step=payload.workflow_step,
        )

    return {"ok": True, "feedback_id": fb["id"]}


# ============================ Finalize → create Case ============================
@router.post("/{workflow_id}/finalize", response_model=Dict[str, Any])
async def finalize_workflow(workflow_id: str, manager: ManagerPublic = Depends(current_manager)):
    wf = await get_workflow(workflow_id, manager.id)
    final = (wf.get("step_outputs") or {}).get("6") or (wf.get("step_outputs") or {}).get("4")
    if not final:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Need at least a Generator output to finalize.")

    db = get_db()
    role = await db.roles.find_one({"id": wf["role_id"], "manager_id": manager.id})
    if not role:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")

    now = datetime.now(timezone.utc).isoformat()
    case_doc = {
        "id": str(uuid.uuid4()),
        "role_id": role["id"],
        "manager_id": manager.id,
        "status": "draft",
        "title": final.get("title") or "Untitled case",
        "scenario_text": final.get("scenario_text") or "",
        "sections": final.get("sections") or [],
        "rubric": final.get("rubric") or [],
        "estimated_minutes": final.get("estimated_minutes") or 60,
        "assessment_mode": wf.get("assessment_mode") or "interview",
        "require_reasoning": bool(wf.get("require_reasoning")),
        "language_register": role.get("language_register"),
        "created_at": now,
        "updated_at": now,
        "approved_at": None,
        "model_used": "agentic-workflow",
        "model_version": "v1",
        "workflow_id": wf["id"],
    }
    await db.cases.insert_one(case_doc)
    await mark_completed(workflow_id, manager.id, case_id=case_doc["id"])
    return {"ok": True, "case_id": case_doc["id"]}


# ============================ Memory inspection (settings page) ============================
@router.get("/_memory/list", response_model=Dict[str, Any])
async def list_my_memory(agent_name: str, manager: ManagerPublic = Depends(current_manager)):
    """Used by /settings/agent-memory in the UI."""
    if agent_name not in VALID_ENTRY_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown agent")
    entries = await retrieve_memory(agent_name=agent_name, manager_id=manager.id, domain_key="*", limit=500)
    return {"agent_name": agent_name, "count": len(entries), "entries": entries}
