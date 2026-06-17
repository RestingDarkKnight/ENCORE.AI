"""Orchestrator — runs one agent at a time. Human-orchestrated; agents never auto-chain.

Each `run_agent` call:
  1) Retrieves up-to-15 memory entries for (agent, manager, domain).
  2) Composes a strict-JSON prompt: system + memory block + prior-step block + task block.
  3) Calls Claude (Opus by default) with model_override per call.
  4) Parses & validates against the Pydantic contract.
  5) Persists the output to the workflow state.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

from claude_service import call_claude_json
from agents.memory import format_memory_block, retrieve_memory
from agents.prompts import MAX_TOKENS, SCHEMA_CONTRACT, SYSTEM_PROMPTS
from agents.retrieval import retrieve_for_theory
from agents.workflow_state import save_step_output

logger = logging.getLogger("encore.agents.orchestrator")

OPUS_MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-4-8")

AGENT_STEP_MAP = {
    "analyst": 1,
    "theory_researcher": 2,
    "architect": 3,
    "generator": 4,
    "critic": 5,
    "polisher": 6,
}


def _format_prior_outputs(workflow: Dict[str, Any], up_to_step: int) -> str:
    """Compose a 'what other agents have produced so far' block for this agent."""
    parts: List[str] = []
    step_outputs = workflow.get("step_outputs") or {}
    step_labels = {
        "1": "Analyst output",
        "2": "Theory Researcher output",
        "3": "Architect output (and the SHAPE the manager picked)",
        "4": "Generator draft (full case + rubric)",
        "5": "Critic evaluation",
    }
    for k in sorted(step_outputs.keys(), key=lambda x: int(x)):
        if int(k) >= up_to_step:
            break
        label = step_labels.get(k, f"Step {k} output")
        import json  # noqa: PLC0415
        parts.append(f"=== {label} ===\n{json.dumps(step_outputs[k], indent=2, ensure_ascii=False)[:6000]}")
    if not parts:
        return "No prior steps have run yet."
    return "\n\n".join(parts)


def _compose_user_prompt(*, agent_name: str, task: str, memory_block: str, prior_outputs_block: str, knowledge_block: Optional[str] = None) -> str:
    chunks = [memory_block, ""]
    if knowledge_block is not None:
        chunks.append("=== Domain knowledge available to you ===")
        chunks.append(knowledge_block)
        chunks.append("")
    chunks.append("=== Prior agents' outputs (the chain so far) ===")
    chunks.append(prior_outputs_block)
    chunks.append("")
    chunks.append("=== Your task ===")
    chunks.append(task)
    return "\n".join(chunks)


async def run_agent(
    *,
    agent_name: str,
    workflow: Dict[str, Any],
    role: Dict[str, Any],
    extra_task_context: Optional[str] = None,
    user_input: Optional[str] = None,
) -> Dict[str, Any]:
    """Run one agent and persist its output. Returns the updated workflow doc."""
    if agent_name not in SYSTEM_PROMPTS:
        raise ValueError(f"Unknown agent {agent_name!r}")
    step = AGENT_STEP_MAP[agent_name]
    manager_id = workflow["manager_id"]
    domain_key = workflow.get("domain_key") or "general"

    # 1) memory
    memory_entries = await retrieve_memory(agent_name=agent_name, manager_id=manager_id, domain_key=domain_key, limit=15)
    memory_block = format_memory_block(memory_entries)
    memory_ids = [m["id"] for m in memory_entries]

    # 2) task per-agent
    task = _build_task(agent_name=agent_name, role=role, workflow=workflow, extra=extra_task_context, user_input=user_input)

    # 3) Theory Researcher gets corpus retrieval
    knowledge_block: Optional[str] = None
    if agent_name == "theory_researcher":
        analyst_out = (workflow.get("step_outputs") or {}).get("1") or {}
        query = " ".join([
            (analyst_out.get("daily_reality") or ""),
            " ".join(c.get("name", "") for c in (analyst_out.get("core_competencies") or [])),
            role.get("job_title", ""),
        ])[:1500]
        chunks = await retrieve_for_theory(domain_key=domain_key, query_text=query, k=5)
        if chunks:
            knowledge_block = "\n\n".join(
                f"[{c.get('source_type')}#{c.get('source_id','?')[:8]}]\n{c.get('text','')[:1200]}"
                for c in chunks
            )
        else:
            knowledge_block = "No proprietary corpus exists for this domain yet — reason from base domain knowledge only."

    prior_block = _format_prior_outputs(workflow, up_to_step=step)
    user_prompt = _compose_user_prompt(
        agent_name=agent_name,
        task=task,
        memory_block=memory_block,
        prior_outputs_block=prior_block,
        knowledge_block=knowledge_block,
    )

    # 4) Claude
    contract = SCHEMA_CONTRACT[agent_name]
    parsed = await call_claude_json(
        system=SYSTEM_PROMPTS[agent_name],
        user=user_prompt,
        model=contract,
        max_tokens=MAX_TOKENS[agent_name],
        timeout=120.0,
        max_attempts=2,
        model_override=OPUS_MODEL,
    )
    output = parsed.model_dump()
    reasoning = output.get("reasoning_summary", "")

    # 5) persist
    updated = await save_step_output(
        workflow_id=workflow["id"],
        manager_id=manager_id,
        step=step,
        output=output,
        reasoning=reasoning,
        memory_ids=memory_ids,
    )
    return updated


def _build_task(*, agent_name: str, role: Dict[str, Any], workflow: Dict[str, Any], extra: Optional[str], user_input: Optional[str]) -> str:
    import json  # noqa: PLC0415
    role_block = json.dumps({
        "job_title": role.get("job_title"),
        "industry": role.get("industry"),
        "seniority": role.get("seniority"),
        "difficulty_level": role.get("difficulty_level"),
        "language_register": role.get("language_register") or "standard",
        "technical_skills": role.get("technical_skills"),
        "soft_skills": role.get("soft_skills"),
        "success_criteria": role.get("success_criteria"),
        "common_challenges": role.get("common_challenges"),
    }, indent=2, ensure_ascii=False)

    # Inject language-register guidance for agents that produce candidate-facing text
    from language_register import register_block as _register_block  # noqa: PLC0415
    from assessment_mode import (  # noqa: PLC0415
        generator_mode_block as _gen_mode,
        architect_mode_block as _arch_mode,
        critic_mode_block as _critic_mode,
        require_reasoning_block as _req_reasoning,
    )

    mode = workflow.get("assessment_mode") or "interview"
    require_reasoning = bool(workflow.get("require_reasoning"))
    est_minutes = workflow.get("estimated_minutes")
    manager_notes = (workflow.get("notes") or "").strip()

    register_hint = ""
    if agent_name in ("generator", "polisher", "architect"):
        register_hint = "\n\n" + _register_block(role.get("language_register"), label="writing this case")

    mode_hint = ""
    if agent_name == "architect":
        mode_hint = "\n\n" + _arch_mode(mode)
    elif agent_name == "generator":
        mode_hint = "\n\n" + _gen_mode(mode)
        rr = _req_reasoning(require_reasoning)
        if rr:
            mode_hint += "\n\n" + rr
    elif agent_name == "critic":
        mode_hint = "\n\n=== Mode-specific critic checks ===\n" + _critic_mode(mode)
    elif agent_name == "polisher":
        mode_hint = "\n\n" + _gen_mode(mode)
        rr = _req_reasoning(require_reasoning)
        if rr:
            mode_hint += "\n\n" + rr

    # Manager-provided target time (Slice 2 — user-picked from mode pills/custom).
    time_hint = ""
    if est_minutes and agent_name in ("architect", "generator", "polisher"):
        time_hint = (
            f"\n\n=== Target duration (manager-set) ===\n"
            f"The candidate has approximately {est_minutes} minutes total. Calibrate the depth, number of "
            f"sections, and length of questions so a strong candidate finishes comfortably within this budget. "
            f"Set estimated_minutes={est_minutes} in your output."
        )

    notes_hint = ""
    if manager_notes and agent_name in ("analyst", "architect", "generator", "polisher"):
        notes_hint = f"\n\n=== Manager notes (steer the case here) ===\n{manager_notes}"

    base_tail = f"\n\nUSER INPUT (optional):\n{user_input}" if user_input else ""
    base_tail = mode_hint + time_hint + notes_hint + register_hint + base_tail

    if agent_name == "analyst":
        return ("Read the role record below and produce your structured role interpretation.\n\n"
                f"Role record:\n{role_block}" + (f"\n\nPasted JD:\n{extra}" if extra else "") + base_tail)
    if agent_name == "theory_researcher":
        return ("Establish the theory and reality the case must respect. Anchor your answer in the corpus chunks "
                "if any were provided (above); otherwise say so in grounding_source." + base_tail)
    if agent_name == "architect":
        return ("Propose 2–3 DISTINCT case shapes that exercise the Analyst's competencies from different angles. "
                "Do not write the case yet — just shapes." + base_tail)
    if agent_name == "generator":
        return ("Generate the full case + scoring rubric in the CHOSEN shape (see chosen_shape_id in the prior outputs or "
                "user input). Stay within the quality bar." + base_tail)
    if agent_name == "critic":
        return ("Critique the Generator's draft above honestly. Score against all 7 dimensions. Propose 2–3 specific revisions "
                "with stable IDs." + base_tail)
    if agent_name == "polisher":
        return ("Apply ONLY the selected_revision_ids the manager picked (see user input). Do not rewrite untouched sections. "
                "Return the final case + rubric in the same schema as the Generator." + base_tail)
    return "Run your task."
