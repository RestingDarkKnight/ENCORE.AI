"""Claude-powered evaluation of a candidate's response against a case rubric."""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List

from claude_service import call_claude_json
from models import CriterionScore, EvaluationDraft

logger = logging.getLogger(__name__)


_SYSTEM_PROMPT = """You are ENCORE, a senior hiring assessment evaluator.

You score a candidate's open-ended work-simulation response against a provided rubric. Your scoring is honest, evidence-based, and audience-aware.

Hard rules:
- Score EVERY rubric dimension on a 1-5 integer-or-half-step scale, calibrated to the dimension's own 1/3/5 behavioral anchors.
- For EVERY score, include a `quote` field that is a literal short verbatim excerpt from the candidate's own answer that justifies the score. Keep quotes concise (under ~30 words). If no relevant content exists for a dimension, set quote to "(no relevant content)".
- The `justification` field explains the score in 1-2 sentences, referring to the quote and the anchors.
- Be honest. A weak or absent answer gets a low score. Do not inflate.
- `overall_score` is the weighted average of dimension scores using the supplied weights (treat weights as percentages summing to ~100). Round to 1 decimal.
- `recommendation` is one of: "strong_hire", "hire", "borderline", "no_hire", calibrated to the overall_score AND the strengths/concerns balance.
- `strengths` and `concerns` are 2-5 short bullet points each (one phrase per item, no leading dashes).
- `summary` is 2-3 sentences. Plain, honest, audience: the hiring manager.

You MUST return ONLY a single valid JSON object matching this schema exactly:
{
  "scores": [
    {
      "dimension_id": str,
      "name": str,
      "score": number,          // 1-5, half-steps allowed
      "weight": number,         // copy the dimension's weight as provided
      "quote": str,             // verbatim from the candidate's answer
      "justification": str      // 1-2 sentences
    }
  ],
  "overall_score": number,      // 0-5, one decimal
  "recommendation": "strong_hire" | "hire" | "borderline" | "no_hire",
  "strengths": [str],
  "concerns": [str],
  "summary": str
}
JSON only. No markdown fences. No preamble. No trailing commentary."""


def _candidate_answers_payload(case: dict, response: dict) -> str:
    """Build a deterministic, evaluator-friendly transcript of the candidate's work."""
    lines: List[str] = []
    answers: Dict[str, str] = response.get("answers", {}) or {}
    audio: Dict[str, Any] = response.get("audio", {}) or {}
    for s_idx, section in enumerate(case["sections"]):
        lines.append(f"## SECTION {s_idx + 1}: {section['title']}")
        for q_idx, q in enumerate(section["questions"]):
            key = f"{section['id']}::{q_idx}"
            lines.append(f"\nQUESTION {q_idx + 1}: {q}")
            text = (answers.get(key) or "").strip()
            transcript = ""
            if key in audio and audio[key].get("transcript"):
                transcript = audio[key]["transcript"].strip()
            if text:
                lines.append(f"WRITTEN ANSWER: {text}")
            if transcript:
                lines.append(f"VOICE TRANSCRIPT: {transcript}")
            if not text and not transcript:
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


def eval_model_name() -> str:
    # If user sets a separate eval model, use it; otherwise fall back to the main model.
    return (
        os.environ.get("CLAUDE_EVAL_MODEL", "").strip()
        or os.environ.get("CLAUDE_MODEL", "claude-opus-4-8")
    )


async def evaluate_response(case: dict, response: dict) -> EvaluationDraft:
    """Call Claude to evaluate. Raises on failure (caller catches)."""
    user_prompt = (
        f"CASE TITLE: {case['title']}\n\n"
        f"CASE SCENARIO:\n{case['scenario_text']}\n\n"
        f"RUBRIC:\n{_rubric_payload(case)}\n\n"
        f"CANDIDATE'S WORK:\n{_candidate_answers_payload(case, response)}\n\n"
        "Score each rubric dimension honestly using its anchors, with a verbatim quote per score. "
        "Return JSON only matching the schema."
    )

    # Temporarily allow the eval call to use a different model than CLAUDE_MODEL
    original_model = os.environ.get("CLAUDE_MODEL")
    try:
        os.environ["CLAUDE_MODEL"] = eval_model_name()
        return await call_claude_json(
            system=_SYSTEM_PROMPT,
            user=user_prompt,
            model=EvaluationDraft,
            max_tokens=6000,
            timeout=120.0,
        )
    finally:
        if original_model is None:
            os.environ.pop("CLAUDE_MODEL", None)
        else:
            os.environ["CLAUDE_MODEL"] = original_model
