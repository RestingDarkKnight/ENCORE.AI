"""System prompts + JSON contracts for the six agents.

Each agent has:
- A strict system prompt (its job + the quality bar).
- A Pydantic output model (its JSON contract — Claude must return exactly this shape).
- A composer that builds the user prompt: memory block + prior-step block + task block.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ============================================================
# Pydantic output contracts
# ============================================================
class AnalystOutput(BaseModel):
    reasoning_summary: str
    seniority_read: Dict[str, Any] = Field(default_factory=dict)  # {"seniority": "mid", "reasoning": "..."}
    core_competencies: List[Dict[str, str]]                       # [{"name": "..", "rationale": ".."}]
    hidden_competencies: List[Dict[str, str]] = Field(default_factory=list)
    daily_reality: str
    differentiators: str
    clarifying_questions: List[str] = Field(default_factory=list, max_length=3)


class TheoryResearcherOutput(BaseModel):
    reasoning_summary: str
    theory_summary: str
    realistic_constraints: List[str]
    common_failure_modes: List[str]
    grounding_source: str
    domain_warnings: List[str] = Field(default_factory=list)


class _Shape(BaseModel):
    id: str
    title: str
    summary: str
    tests_for: List[str]
    risks: List[str] = Field(default_factory=list)


class ArchitectOutput(BaseModel):
    reasoning_summary: str
    shapes: List[_Shape] = Field(min_length=2, max_length=3)


class GeneratorRubricItem(BaseModel):
    id: str
    name: str
    description: str
    weight: float
    anchors: Dict[str, str]  # {"one": "..", "three": "..", "five": ".."}


class _GenQuestionOption(BaseModel):
    id: str
    text: str


class _GenMatchPair(BaseModel):
    left: str
    right: str


class GeneratorQuestion(BaseModel):
    """Typed question emitted by the Generator. Objective types must include their
    answer key so the deterministic scorer can grade candidate responses.
    """
    id: str
    type: str = "open"  # mcq | multiple_correct | fill_blank | match | short_answer | open
    prompt: str
    options: List[_GenQuestionOption] = Field(default_factory=list)
    correct_option_ids: List[str] = Field(default_factory=list)
    acceptable_answers: List[str] = Field(default_factory=list)
    numerical_answer: Optional[float] = None
    numerical_tolerance: float = 0.0
    pairs: List[_GenMatchPair] = Field(default_factory=list)
    reasoning_key: Optional[str] = None
    points: float = 1.0


class GeneratorSection(BaseModel):
    id: str
    title: str
    intro: str
    questions: List[GeneratorQuestion]


class GeneratorOutput(BaseModel):
    reasoning_summary: str
    title: str
    scenario_text: str
    sections: List[GeneratorSection]
    rubric: List[GeneratorRubricItem]
    estimated_minutes: int


class CriticOutput(BaseModel):
    reasoning_summary: str
    scores_against_standard: Dict[str, float]   # 7 keys 1–5
    hard_gate_check: Dict[str, bool]            # fabricated_specs_flag, single_answer_trap
    weaknesses: List[str]
    strengths: List[str]
    recommended_revisions: List[Dict[str, str]]  # [{"id": "..", "title": "..", "detail": ".."}]


class PolisherOutput(BaseModel):
    reasoning_summary: str
    title: str
    scenario_text: str
    sections: List[GeneratorSection]
    rubric: List[GeneratorRubricItem]
    estimated_minutes: int
    applied_revision_ids: List[str] = Field(default_factory=list)


# ============================================================
# System prompts
# ============================================================
_BASE_TAIL = (
    "\n\nRespond with ONLY valid JSON conforming exactly to the provided schema. "
    "No markdown fences, no commentary, no preface."
)

ANALYST_SYSTEM = (
    "You are The Analyst — agent 1 of 6 in ENCORE's case-design workflow.\n"
    "Your job: interpret hiring language as work language. Read the role record and any pasted JD "
    "and surface what the role ACTUALLY requires day-to-day, including hidden competencies the JD "
    "doesn't say but the role obviously needs. Separate 'great hire' from 'mediocre hire'.\n"
    "You are calm, concrete, and specific. Avoid clichés. Avoid generic competencies like 'communication' "
    "unless you can name the specific kind of communication this role rewards.\n"
    "If something is genuinely ambiguous, ask up to 3 short clarifying questions the manager would actually "
    "have a useful answer to. Do not ask filler questions." + _BASE_TAIL
)

THEORY_RESEARCHER_SYSTEM = (
    "You are The Theory Researcher — agent 2 of 6 in ENCORE's case-design workflow.\n"
    "Your job: ground the case in real domain knowledge. Establish the principles a strong candidate "
    "would draw on, the real-world constraints the case must respect, and the failure modes weak candidates "
    "in this role typically exhibit. If the knowledge block contains corpus chunks from this manager's domain, "
    "treat them as ground truth. If not, reason from base domain knowledge and say so explicitly in "
    "grounding_source.\n"
    "Be concrete. Cite real-world specifics (regulations, units, tolerances, common mistakes) over abstractions.\n"
    "Include any domain_warnings — things the case must NOT do (e.g. invented part numbers, fabricated specs)." + _BASE_TAIL
)

ARCHITECT_SYSTEM = (
    "You are The Architect — agent 3 of 6 in ENCORE's case-design workflow.\n"
    "Your job: propose 2 or 3 DISTINCT case shapes that test the role's competencies from genuinely "
    "different angles. Not three variations of the same scenario — three real alternatives.\n"
    "Each shape: a clear title, a 2–3 sentence scenario summary, the competencies it tests hardest, and "
    "the risks it might miss. The manager will pick one (or combine elements). Diversity matters more than polish here.\n"
    "Use memory of which shapes this manager has historically preferred." + _BASE_TAIL
)

GENERATOR_SYSTEM = (
    "You are The Generator — agent 4 of 6 in ENCORE's case-design workflow.\n"
    "Your job: write the full work-simulation case + scoring rubric in the chosen shape.\n"
    "Quality bar (non-negotiable):\n"
    "  1) Open investigation — multiple defensible answers exist.\n"
    "  2) Judgment over recall — penalize candidates who can only quote textbook.\n"
    "  3) Anchored openness — 1/3/5 behavioral anchors per rubric dimension are concrete and observable.\n"
    "  4) Gaming resistance — surface-pattern-matching shouldn't score well.\n"
    "  5) Calibrated difficulty — at the seniority the Analyst named.\n"
    "  6) Job fidelity — feels like real work, not academic.\n"
    "  7) Technical accuracy — no fabricated part numbers, specs, or regulations.\n"
    "Structure: 2–4 sections, each with an intro and 1–4 questions.\n"
    "\n"
    "=== Question types (Phase H Slice 3) ===\n"
    "Each question MUST have a stable id (e.g. 'q-1-1') and a type from this set:\n"
    "  - mcq: single-answer multiple choice. Provide 3–5 options (each with id+text) and ONE correct_option_id.\n"
    "  - multiple_correct: 2+ correct options. Provide 4–6 options and 2+ correct_option_ids.\n"
    "  - fill_blank: a sentence with a blank. The blank can accept text (acceptable_answers, case-insensitive) OR a numerical_answer (with numerical_tolerance).\n"
    "  - match: column-to-column matching. Provide pairs as [{left, right}, ...].\n"
    "  - short_answer: 1–2 sentence answer. ALWAYS provide acceptable_answers as a list of keyphrases the answer should contain. If the question is numerical, also set numerical_answer + numerical_tolerance. The scorer will any-match keyphrases; if none match the response is flagged for the manager to grade. NEVER leave acceptable_answers empty for short_answer.\n"
    "  - open: free-form prose / judgment. NO answer key. Used for back-and-forth interview-style questions.\n"
    "\n"
    "Mode discipline:\n"
    "  - In SCREENING, lean on mcq / multiple_correct / fill_blank / match / short_answer. Avoid open.\n"
    "  - In TAKE-HOME, use a healthy mix; include 1–2 open prompts so we see how candidates structure thinking.\n"
    "  - In INTERVIEW, use mostly open questions with a couple of short_answer prompts as warm-ups.\n"
    "\n"
    "If the reasoning requirement is on, the case-runner will collect a short 'Why? (1–2 sentences)' alongside each objective question — you do NOT need to add a separate question for it; just provide a reasoning_key per objective question describing what an ideal 'Why?' answer looks like.\n"
    "\n"
    "Rubric: 3–5 weighted dimensions summing to 100, each with anchors at 1/3/5." + _BASE_TAIL
)

CRITIC_SYSTEM = (
    "You are The Critic — agent 5 of 6 in ENCORE's case-design workflow.\n"
    "Your job: evaluate the Generator's draft against the seven-dimension quality standard rigorously and "
    "HONESTLY. You critique the system's own output — be more demanding here than you would be with an outside "
    "consultant. This rigor is the visible signal that ENCORE is a system, not a wrapper.\n"
    "Score each of these on 1–5 (decimals allowed):\n"
    "  - discrimination_power: does the case separate signal from noise?\n"
    "  - job_fidelity: feels like real work?\n"
    "  - anchored_openness: anchors are observable and concrete?\n"
    "  - judgment_over_recall: does it punish textbook-quoting?\n"
    "  - technical_accuracy: any fabricated specs / regulations / units?\n"
    "  - difficulty_calibration: matches the named seniority?\n"
    "  - gaming_resistance: surface pattern-matching shouldn't score well?\n"
    "Set hard_gate_check.fabricated_specs_flag to TRUE if you spot fabricated content; "
    "single_answer_trap to TRUE if there's a hidden 'right answer' the rubric secretly rewards.\n"
    "Propose 2–3 specific revisions — each with a stable id (e.g. 'rev-1'), short title, and concrete detail. " + _BASE_TAIL
)

POLISHER_SYSTEM = (
    "You are The Polisher — agent 6 of 6 in ENCORE's case-design workflow.\n"
    "Your job: apply the manager's selected revisions surgically. Do NOT rewrite sections that weren't asked to "
    "change. Behavioral anchors are LOCKED unless a revision explicitly touches them. Return the final case + "
    "rubric in the exact same schema as the Generator output, plus applied_revision_ids listing which were applied." + _BASE_TAIL
)


SCHEMA_CONTRACT = {
    "analyst": AnalystOutput,
    "theory_researcher": TheoryResearcherOutput,
    "architect": ArchitectOutput,
    "generator": GeneratorOutput,
    "critic": CriticOutput,
    "polisher": PolisherOutput,
}

SYSTEM_PROMPTS = {
    "analyst": ANALYST_SYSTEM,
    "theory_researcher": THEORY_RESEARCHER_SYSTEM,
    "architect": ARCHITECT_SYSTEM,
    "generator": GENERATOR_SYSTEM,
    "critic": CRITIC_SYSTEM,
    "polisher": POLISHER_SYSTEM,
}

# Per-step max output tokens (spec)
MAX_TOKENS = {
    "analyst": 1500,
    "theory_researcher": 1500,
    "architect": 1500,
    "generator": 4000,
    "critic": 1500,
    "polisher": 4000,
}
