"""Agent memory store — per-agent, per-manager, per-domain.

Memory is a *learned record*, not raw prompt history. Each entry is a small
structured payload that future invocations of the same agent retrieve as
contextual ground truth ("what you've learned about working with this manager").

Tiered retrieval per spec §1.2:
  1) (agent, manager, domain) — exact
  2) (agent, manager, any domain) — pad up to limit
  3) (agent, any manager, any domain) — system-wide pad
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable, List, Literal, Optional

from db import get_db
from models import doc_strip

logger = logging.getLogger("encore.agents.memory")

AgentName = Literal["analyst", "theory_researcher", "architect", "generator", "critic", "polisher"]

# Spec §1.1 — entry types per agent. Open string set so we don't have to wire
# a hundred Literal aliases; validated at write sites.
VALID_ENTRY_TYPES: dict[str, set[str]] = {
    "analyst": {"role_interpretation_pattern", "clarifying_question_useful", "clarifying_question_skipped"},
    "theory_researcher": {"domain_principle", "retrieval_helpful", "retrieval_unused"},
    "architect": {"shape_preferred", "shape_rejected", "combination_pattern"},
    "generator": {"section_kept", "section_revised", "phrasing_preferred", "phrasing_rejected"},
    "critic": {"critique_accepted", "critique_dismissed", "missed_issue"},
    "polisher": {"revision_pattern", "final_acceptance_signal"},
}


def normalize_domain_key(*parts: Optional[str]) -> str:
    """Stable lowercase token derived from role.industry / seniority / etc.
    Used as a coarse scope so memory is per-domain, not just per-manager.
    """
    clean = [(p or "").strip().lower() for p in parts if p and p.strip()]
    if not clean:
        return "general"
    return "::".join(clean)[:120]


async def write_memory(
    *,
    agent_name: str,
    manager_id: str,
    domain_key: str,
    entry_type: str,
    payload: dict[str, Any],
    source_case_id: Optional[str] = None,
    source_feedback_id: Optional[str] = None,
    expires_at: Optional[datetime] = None,
) -> dict[str, Any]:
    if agent_name not in VALID_ENTRY_TYPES:
        raise ValueError(f"Unknown agent_name {agent_name!r}")
    if entry_type not in VALID_ENTRY_TYPES[agent_name]:
        logger.warning("Unrecognised entry_type %s for %s — accepting but flag for review", entry_type, agent_name)

    doc = {
        "id": str(uuid.uuid4()),
        "agent_name": agent_name,
        "manager_id": manager_id,
        "domain_key": domain_key or "general",
        "entry_type": entry_type,
        "payload": payload,
        "source_case_id": source_case_id,
        "source_feedback_id": source_feedback_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at,
    }
    await get_db().agent_memories.insert_one(doc)
    return doc


async def retrieve_memory(
    *,
    agent_name: str,
    manager_id: str,
    domain_key: str,
    limit: int = 15,
) -> List[dict[str, Any]]:
    """Tiered retrieval — return up to `limit` entries, newest first."""
    db = get_db()
    out: List[dict[str, Any]] = []
    seen_ids: set[str] = set()

    async def _fill(query: dict[str, Any]) -> None:
        nonlocal out
        remaining = limit - len(out)
        if remaining <= 0:
            return
        cursor = db.agent_memories.find(query).sort("created_at", -1).limit(remaining + 5)
        async for d in cursor:
            sd = doc_strip(d)
            if sd["id"] in seen_ids:
                continue
            seen_ids.add(sd["id"])
            out.append(sd)
            if len(out) >= limit:
                break

    # Tier 1: exact (manager + domain)
    await _fill({"agent_name": agent_name, "manager_id": manager_id, "domain_key": domain_key})
    # Tier 2: manager only
    if len(out) < limit:
        await _fill({"agent_name": agent_name, "manager_id": manager_id, "domain_key": {"$ne": domain_key}})
    # Tier 3: system-wide
    if len(out) < limit:
        await _fill({"agent_name": agent_name, "manager_id": {"$ne": manager_id}})

    return out


def format_memory_block(entries: Iterable[dict[str, Any]]) -> str:
    """Format memory entries into a compact text block included in the agent prompt."""
    items = list(entries)
    if not items:
        return (
            "You have no prior memory with this manager — this is your first interaction. "
            "Reason from base principles."
        )
    lines = ["What you've learned about working with this manager in this domain:"]
    for e in items:
        ts = (e.get("created_at") or "")[:10]
        kind = e.get("entry_type", "note")
        payload = e.get("payload") or {}
        # Compact representation — keep names, drop noise
        summary = " | ".join(f"{k}={v}" for k, v in payload.items() if k in {"summary", "pattern", "kind", "delta", "principle", "shape_title", "section_id", "critique", "missed", "revision_kind", "phrasing"})
        if not summary:
            summary = str(payload)[:240]
        lines.append(f"- [{ts}] ({kind}) {summary}")
    return "\n".join(lines)


# ----- Feedback log -----
async def write_feedback(
    *,
    agent_name: str,
    manager_id: str,
    case_id: Optional[str],
    workflow_id: Optional[str],
    workflow_step: int,
    feedback_type: str,
    specifics: dict[str, Any],
) -> dict[str, Any]:
    doc = {
        "id": str(uuid.uuid4()),
        "agent_name": agent_name,
        "manager_id": manager_id,
        "case_id": case_id,
        "workflow_id": workflow_id,
        "workflow_step": workflow_step,
        "feedback_type": feedback_type,
        "specifics": specifics,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await get_db().agent_feedback.insert_one(doc)
    return doc
