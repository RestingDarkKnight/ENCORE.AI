"""Assessment mode — Phase H slice 2.

Three modes that condition every agent's prompt:
  - screening  : early-funnel, high-volume, gaming-resistant; objective-heavy when supported.
  - takehome   : mid-funnel, deeper applied work; mixed question types.
  - interview  : late-funnel, one-on-one open work-simulation; voice-recordable.

The full Question-Types schema + deterministic scorer arrive in Slice 3.
For now, this slice teaches the generator + critic to *talk in mode terms* and
sets the data plumbing so a case carries `assessment_mode` end to end.
"""
from typing import Literal

AssessmentMode = Literal["screening", "takehome", "interview"]

MODE_LABELS = {
    "screening": "Screening",
    "takehome": "Take-home",
    "interview": "Interview",
}

MODE_DESCRIPTIONS = {
    "screening": "High-volume, fast, gaming-resistant. Use for the first cut of many candidates.",
    "takehome": "Mid-funnel, deeper applied work that candidates do asynchronously.",
    "interview": "Late-funnel, one-on-one, open work-simulation. Designed for live back-and-forth.",
}

# Generator-side instructions per mode. Spliced into the system/user prompt.
GENERATOR_RULES = {
    "screening": (
        "ASSESSMENT MODE: SCREENING (high-volume, gaming-resistant).\n"
        "- Optimise for fairness, speed, and comparability across many candidates.\n"
        "- Prefer concise sections (2–3) and tight, scenario-embedded prompts.\n"
        "- Where this case uses objective question types (Slice 3 will add them formally), follow these rules:\n"
        "    * NEVER abstract — every question must require reasoning about the specific scenario.\n"
        "    * Application over recall — no textbook definitions.\n"
        "    * Prefer multiple-correct over single MCQ where the concept allows.\n"
        "    * Plausible distractors — wrong options must be SUBTLY wrong, not obviously wrong.\n"
        "- A strong candidate should be able to do this in 30–45 minutes; weak candidates will struggle to game it."
    ),
    "takehome": (
        "ASSESSMENT MODE: TAKE-HOME (mid-funnel, deeper, async).\n"
        "- Mix of question types: some objective scenarios, several short-answer reasoning questions, "
        "and 1–2 open sectioned work-simulation questions.\n"
        "- Calibrate to 90–180 minutes of focused work.\n"
        "- Encourage written reasoning that reveals how the candidate thinks, not just what they conclude."
    ),
    "interview": (
        "ASSESSMENT MODE: INTERVIEW (late-funnel, live, open).\n"
        "- Single rich scenario with sections designed for back-and-forth conversation.\n"
        "- Questions should invite follow-ups (\"...and what would you ask next?\"), not yield clean closed answers.\n"
        "- Sections should be voice-recordable; assume the interviewer may probe.\n"
        "- Calibrate to 45–60 minutes of conversational depth."
    ),
}

# Architect-side rules per mode. Used to nudge what *kinds* of shapes are proposed.
ARCHITECT_RULES = {
    "screening": (
        "ASSESSMENT MODE: SCREENING.\n"
        "- Propose shapes that work as high-volume first cuts: scenarios where many candidates "
        "will attempt the SAME prompt and we need clean, comparable signal in 30–45 minutes.\n"
        "- Prefer shapes that lend themselves to a mix of objective-style and short-answer questions."
    ),
    "takehome": (
        "ASSESSMENT MODE: TAKE-HOME.\n"
        "- Propose shapes the candidate will work on asynchronously for 90–180 minutes.\n"
        "- Shapes should have natural section breaks for mixed question types."
    ),
    "interview": (
        "ASSESSMENT MODE: INTERVIEW.\n"
        "- Propose shapes designed for back-and-forth conversation: rich open-ended scenarios that "
        "invite the interviewer to probe and the candidate to think aloud for 45–60 minutes."
    ),
}


CRITIC_EXTRA = {
    "screening": (
        "MODE-SPECIFIC CHECKS (Screening): for any objective-style question, verify (a) exactly ONE defensible "
        "answer key, (b) distractors are SUBTLY wrong (not obviously wrong, not trivia-shaped), and (c) gaming-"
        "resistance: a general-purpose LLM could NOT one-shot this from textbook knowledge alone."
    ),
    "takehome": (
        "MODE-SPECIFIC CHECKS (Take-home): verify the mix is balanced; the open scenario truly requires "
        "judgement; the short-answer items have observable scoring anchors and aren't pure recall."
    ),
    "interview": (
        "MODE-SPECIFIC CHECKS (Interview): verify each section invites follow-up probing; no closed-answer "
        "questions; sections are voice-friendly (not list-heavy)."
    ),
}


def generator_mode_block(mode: str | None) -> str:
    m = (mode or "interview").lower()
    return "=== Mode-aware design rules ===\n" + (GENERATOR_RULES.get(m) or GENERATOR_RULES["interview"])


def architect_mode_block(mode: str | None) -> str:
    m = (mode or "interview").lower()
    return "=== Mode-aware shape rules ===\n" + (ARCHITECT_RULES.get(m) or ARCHITECT_RULES["interview"])


def critic_mode_block(mode: str | None) -> str:
    m = (mode or "interview").lower()
    return CRITIC_EXTRA.get(m) or CRITIC_EXTRA["interview"]


# Optional "require reasoning" clause — Phase H Slice 3 preview.
# When True, the generator must append a brief "Why? (1–2 sentences)" follow-up to any
# objective-style question, so we capture *how the candidate thinks*, not just what they pick.
REQUIRE_REASONING_CLAUSE = (
    "REASONING REQUIREMENT: When the case uses any objective-style question (MCQ, multiple-correct, "
    "fill-blank, match), it MUST be paired with a short 'Why? (1–2 sentences)' follow-up that asks the "
    "candidate to justify their pick. This is non-negotiable — it converts a guessable item into a "
    "judgement signal. For purely open / short-answer questions, this clause does not apply."
)


def require_reasoning_block(require_reasoning: bool | None) -> str:
    if not require_reasoning:
        return ""
    return "=== Reasoning requirement ===\n" + REQUIRE_REASONING_CLAUSE
