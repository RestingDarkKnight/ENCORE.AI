"""Claude-powered evaluation of a candidate's response against a case rubric.

Phase H Slice 4 — single Claude call grades:
  (a) every rubric dimension with quote + justification (existing)
  (b) every reasoning sub-question against the manager's reasoning_key (new)

We deliberately batch (b) into the same call so a single candidate costs ONE call.
The deterministic objective score (Slice 3) is computed separately at submit time
and merged later by the route layer; the LLM does not regrade objective items.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List

from claude_service import call_claude_json
from language_register import EVALUATOR_FAIRNESS_CLAUSE
from models import EvaluationDraft

logger = logging.getLogger(__name__)


_SYSTEM_PROMPT = """You are ENCORE, a senior hiring assessment evaluator.

You score a candidate's work-simulation response against a provided rubric. Your scoring is honest, evidence-based, and audience-aware.

Hard rules:
- Score EVERY rubric dimension on a 1-5 integer-or-half-step scale, calibrated to that dimension's own 1/3/5 behavioral anchors.
- For EVERY dimension score, include a `quote` field that is a literal short verbatim excerpt from the candidate's own answer that justifies the score. Keep quotes concise (under ~30 words). If no relevant content exists, set quote to "(no relevant content)".
- The `justification` field explains the score in 1-2 sentences, referring to the quote and the anchors.
- Be honest. A weak or absent answer gets a low score. Do not inflate.
- `overall_score` is the weighted average of dimension scores using the supplied weights (treat weights as percentages summing to ~100). Round to 1 decimal.
- `recommendation` is one of: "strong_hire", "hire", "borderline", "no_hire", calibrated to the overall_score AND the strengths/concerns balance.
- `strengths` and `concerns` are 2-5 short bullet points each (one phrase per item, no leading dashes).
- `summary` is 2-3 sentences. Plain, honest, audience: the hiring manager.

REASONING SUB-QUESTIONS (Phase H Slice 4):
- If the input includes a `REASONING ITEMS TO GRADE` block, you MUST also return `reasoning_grades`: one entry per item.
- Each reasoning grade scores the candidate's `Why?` answer on a 0..1 scale against the manager's reasoning_key (the ideal answer).
- Score 1.0 = ideal reasoning; 0.5 = partial; 0.0 = absent or off-base. Include a verbatim `quote` from the candidate's Why? text and a 1-2 sentence `justification`.
- Use `question_key` exactly as provided (format: "<section_id>::<q_idx>").
- If there is no REASONING ITEMS TO GRADE block, return an empty `reasoning_grades` array.

You MUST return ONLY a single valid JSON object matching this schema exactly:
{
  "scores": [
    {"dimension_id": str, "name": str, "score": number, "weight": number, "quote": str, "justification": str}
  ],
  "overall_score": number,
  "recommendation": "strong_hire" | "hire" | "borderline" | "no_hire",
  "strengths": [str],
  "concerns": [str],
  "summary": str,
  "reasoning_grades": [
    {"question_key": str, "score": number, "quote": str, "justification": str}
  ]
}
JSON only. No markdown fences. No preamble. No trailing commentary."""


def _question_prompt(q: Any) -> str:
    """Get the candidate-facing prompt regardless of legacy string or typed dict."""
    if isinstance(q, str):
        return q
    if isinstance(q, dict):
        return q.get("prompt") or q.get("text") or ""
    return str(q)


def _answer_to_text(a: Any) -> str:
    """Render any answer shape as evaluator-friendly text."""
    if a is None:
        return ""
    if isinstance(a, str):
        return a
    if isinstance(a, list):
        return ", ".join(str(x) for x in a)
    if isinstance(a, dict):
        return "; ".join(f"{k} → {v}" for k, v in a.items())
    return str(a)


def _candidate_answers_payload(case: dict, response: dict) -> str:
    lines: List[str] = []
    answers: Dict[str, Any] = response.get("answers", {}) or {}
    reasonings: Dict[str, str] = response.get("reasonings", {}) or {}
    audio: Dict[str, Any] = response.get("audio", {}) or {}
    for s_idx, section in enumerate(case["sections"]):
        lines.append(f"## SECTION {s_idx + 1}: {section['title']}")
        for q_idx, q in enumerate(section["questions"]):
            key = f"{section['id']}::{q_idx}"
            prompt = _question_prompt(q)
            qtype = q.get("type", "open") if isinstance(q, dict) else "open"
            lines.append(f"\nQUESTION {q_idx + 1} [{qtype}]: {prompt}")
            text = _answer_to_text(answers.get(key)).strip()
            transcript = ""
            if key in audio and audio[key].get("transcript"):
                transcript = audio[key]["transcript"].strip()
            r_text = (reasonings.get(key) or "").strip()
            if text:
                lines.append(f"WRITTEN ANSWER: {text}")
            if transcript:
                lines.append(f"VOICE TRANSCRIPT: {transcript}")
            if r_text:
                lines.append(f"WHY? (reasoning): {r_text}")
            if not text and not transcript and not r_text:
                lines.append("(no answer provided)")
        lines.append("")
    return "\n".join(lines)


def _rubric_payload(case: dict) -> str:
    lines: List[str] = []
    total = sum(float(r.get("weight", 0)) for r in case.get("rubric", []))
    lines.append(f"Total weight: {total:.0f}%")
    for r in case["rubric"]:
        lines.append(
            f"- id={r['id']} | name={r['name']} | weight={r['weight']}%"
            f"\n  description: {r.get('description','')}"
            f"\n  anchor 1 (weak): {r['anchors']['one']}"
            f"\n  anchor 3 (solid): {r['anchors']['three']}"
            f"\n  anchor 5 (exceptional): {r['anchors']['five']}"
        )
    return "\n".join(lines)


def _reasoning_block(case: dict, response: dict) -> str:
    """List the objective questions whose reasoning the LLM must grade against the manager's key."""
    if not case.get("require_reasoning"):
        return ""
    objective = {"mcq", "multiple_correct", "fill_blank", "match", "short_answer"}
    reasonings = response.get("reasonings", {}) or {}
    items: List[str] = []
    for s_idx, section in enumerate(case["sections"]):
        for q_idx, q in enumerate(section["questions"]):
            if not isinstance(q, dict):
                continue
            if q.get("type") not in objective:
                continue
            key = f"{section['id']}::{q_idx}"
            ideal = q.get("reasoning_key") or "(no reasoning_key set by manager — grade against the question's intent)"
            cand = (reasonings.get(key) or "").strip() or "(candidate did not write a reasoning)"
            items.append(
                f"- question_key: {key}\n"
                f"  question_prompt: {q.get('prompt','')}\n"
                f"  manager_reasoning_key: {ideal}\n"
                f"  candidate_why: {cand}"
            )
    if not items:
        return ""
    return "REASONING ITEMS TO GRADE (score each 0..1 with a quote from the candidate's Why?):\n" + "\n".join(items)


def eval_model_name() -> str:
    return (
        os.environ.get("CLAUDE_EVAL_MODEL", "").strip()
        or os.environ.get("CLAUDE_MODEL", "claude-opus-4-8")
    )


async def evaluate_response(case: dict, response: dict) -> EvaluationDraft:
    """Call Claude to evaluate. Single call grades rubric + reasoning sub-questions in one shot."""
    reasoning_block = _reasoning_block(case, response)
    user_prompt = (
        f"{EVALUATOR_FAIRNESS_CLAUSE}\n\n"
        f"CASE TITLE: {case['title']}\n\n"
        f"CASE SCENARIO:\n{case['scenario_text']}\n\n"
        f"RUBRIC:\n{_rubric_payload(case)}\n\n"
        f"CANDIDATE'S WORK:\n{_candidate_answers_payload(case, response)}\n\n"
        + (f"{reasoning_block}\n\n" if reasoning_block else "")
        + "Score each rubric dimension honestly using its anchors, with a verbatim quote per score. "
        "Score reasoning and substance only — never the candidate's English. "
        "Return JSON only matching the schema."
    )

    original_model = os.environ.get("CLAUDE_MODEL")
    try:
        os.environ["CLAUDE_MODEL"] = eval_model_name()
        return await call_claude_json(
            system=_SYSTEM_PROMPT,
            user=user_prompt,
            model=EvaluationDraft,
            max_tokens=8000,
            timeout=180.0,
        )
    finally:
        if original_model is None:
            os.environ.pop("CLAUDE_MODEL", None)
        else:
            os.environ["CLAUDE_MODEL"] = original_model
