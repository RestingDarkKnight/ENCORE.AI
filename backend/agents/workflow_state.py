"""Workflow state — resume-from-anywhere persistence for the 6-agent flow.

A single Mongo doc per workflow run. Each step's output is appended to
`step_outputs`, the `current_step` advances on Continue/Approve, and
`call_count` enforces the 8-Claude-call hard cap (spec).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import HTTPException, status

from db import get_db
from models import doc_strip

logger = logging.getLogger("encore.agents.workflow")

STEP_NAMES = ["analyst", "theory_researcher", "architect", "generator", "critic", "polisher"]
MAX_CALLS = 8  # 6 agents + up to 2 user-triggered revisions
WorkflowStatus = Literal["in_progress", "completed", "abandoned"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def create_workflow(*, manager_id: str, role_id: str, domain_key: str, assessment_mode: str = "interview", require_reasoning: bool = False, estimated_minutes: Optional[int] = None, notes: Optional[str] = None) -> Dict[str, Any]:
    doc = {
        "id": str(uuid.uuid4()),
        "case_id": None,
        "manager_id": manager_id,
        "role_id": role_id,
        "domain_key": domain_key,
        "assessment_mode": assessment_mode,
        "require_reasoning": require_reasoning,
        "estimated_minutes": estimated_minutes,
        "notes": notes or "",
        "status": "in_progress",
        "current_step": 1,
        "step_outputs": {},   # keyed by step number 1..6
        "step_reasonings": {},  # short reasoning_summary per step
        "memory_used": {},   # per-step memory entry ids that were retrieved
        "call_count": 0,
        "started_at": _now(),
        "updated_at": _now(),
    }
    await get_db().case_workflow_state.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def get_workflow(workflow_id: str, manager_id: str) -> Dict[str, Any]:
    d = await get_db().case_workflow_state.find_one({"id": workflow_id, "manager_id": manager_id})
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found")
    d = doc_strip(d)
    d.setdefault("assessment_mode", "interview")
    d.setdefault("require_reasoning", False)
    d.setdefault("estimated_minutes", None)
    d.setdefault("notes", "")
    return d


async def list_workflows_for_role(role_id: str, manager_id: str) -> List[Dict[str, Any]]:
    out = []
    async for d in get_db().case_workflow_state.find({"role_id": role_id, "manager_id": manager_id}).sort("updated_at", -1):
        d = doc_strip(d)
        d.setdefault("assessment_mode", "interview")
        d.setdefault("require_reasoning", False)
        d.setdefault("estimated_minutes", None)
        d.setdefault("notes", "")
        out.append(d)
    return out


async def save_step_output(*, workflow_id: str, manager_id: str, step: int, output: Dict[str, Any], reasoning: Optional[str], memory_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    """Persist one agent's output. Advances current_step if this was the active step."""
    wf = await get_workflow(workflow_id, manager_id)
    if step < 1 or step > 6:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Step must be 1..6")
    if wf.get("call_count", 0) >= MAX_CALLS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Call budget exhausted (8 max per workflow).")

    set_doc: Dict[str, Any] = {
        f"step_outputs.{step}": output,
        f"step_reasonings.{step}": reasoning or "",
        "updated_at": _now(),
    }
    if memory_ids is not None:
        set_doc[f"memory_used.{step}"] = memory_ids
    inc_doc = {"call_count": 1}
    # Advance current_step only if user is moving forward (not revising a prior step)
    if step >= int(wf.get("current_step", 1)):
        set_doc["current_step"] = min(6, step + 1) if step < 6 else 6

    await get_db().case_workflow_state.update_one(
        {"id": workflow_id, "manager_id": manager_id},
        {"$set": set_doc, "$inc": inc_doc},
    )
    return await get_workflow(workflow_id, manager_id)


async def mark_completed(workflow_id: str, manager_id: str, *, case_id: str) -> Dict[str, Any]:
    await get_db().case_workflow_state.update_one(
        {"id": workflow_id, "manager_id": manager_id},
        {"$set": {"status": "completed", "case_id": case_id, "updated_at": _now()}},
    )
    return await get_workflow(workflow_id, manager_id)


async def mark_abandoned(workflow_id: str, manager_id: str) -> None:
    await get_db().case_workflow_state.update_one(
        {"id": workflow_id, "manager_id": manager_id},
        {"$set": {"status": "abandoned", "updated_at": _now()}},
    )
