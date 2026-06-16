"""Language register — Phase H slice 1.

A single source of truth for register-aware prompt fragments. Injected into:
  - Generator (one-shot case generation + agentic Generator)
  - Polisher (preserves register on revision)
  - Section regeneration (consistency)
  - Evaluator (fairness clause: NEVER score candidate English fluency)

Register controls only how ENCORE writes. It never controls how candidates are judged.
"""
from typing import Literal

LanguageRegister = Literal["plain", "standard", "advanced"]


REGISTER_RULES: dict[str, str] = {
    "plain": (
        "LANGUAGE REGISTER: PLAIN & DIRECT.\n"
        "- Short sentences (most under 15 words).\n"
        "- Common everyday vocabulary; no idioms, metaphors, or business clichés.\n"
        "- No stacking of subordinate clauses; one idea per sentence.\n"
        "- Active voice. Direct address ('You are...', 'Your job is to...').\n"
        "- Aim for the clarity a competent professional reading English as a second language follows easily.\n"
        "- Example tone: 'A part is failing inspection. It started during the monsoon. Some weeks are fine, "
        "some weeks one in three parts is rejected. You are the new engineer. Your job is to find out why and fix it.'"
    ),
    "standard": (
        "LANGUAGE REGISTER: STANDARD PROFESSIONAL.\n"
        "- Clear business English; moderate sentence length.\n"
        "- Minimal idiom; professional but not ornate.\n"
        "- Active voice preferred; subordinate clauses fine when they clarify.\n"
        "- Example tone: 'A precision-cast component has begun failing X-ray inspection for subsurface porosity, "
        "with rejection rates that fluctuate week to week since the start of the monsoon. As the newly appointed "
        "process engineer, you have been asked to investigate the cause and recommend a fix within three hours.'"
    ),
    "advanced": (
        "LANGUAGE REGISTER: ADVANCED.\n"
        "- Full professional register; nuanced phrasing; complex sentence structures acceptable.\n"
        "- Use only because this role genuinely selects on English communication.\n"
        "- Example tone: 'A flight-critical casting has developed an intermittent subsurface porosity defect whose "
        "incidence — fluctuating sharply with no immediately discernible pattern since monsoon onset — has begun "
        "to threaten both yield and delivery commitments.'"
    ),
}

# Fairness clause for the evaluator. Independent of which register the case used.
EVALUATOR_FAIRNESS_CLAUSE = (
    "FAIRNESS — CANDIDATE ENGLISH:\n"
    "You must NEVER penalise the candidate for the register, fluency, grammar, vocabulary, or polish of their "
    "OWN writing. Score reasoning, judgement, and substance only. A candidate writing 'machine stop working "
    "because oil is old, change oil and check filter' is making the same observation as a candidate writing "
    "'the equipment failure is attributable to degraded lubricant; replace the oil and inspect the filter'. "
    "Score them identically on substance. The case's register reflects how ENCORE wrote the case — not a bar "
    "the candidate must meet."
)


def register_block(register: str | None, *, label: str = "writing this case") -> str:
    """Return the register instruction block to splice into a prompt."""
    reg = (register or "standard").lower()
    rules = REGISTER_RULES.get(reg) or REGISTER_RULES["standard"]
    return f"=== When {label}, follow this register ===\n{rules}"


# Short sample paragraphs surfaced in the wizard UI (kept identical to spec).
REGISTER_SAMPLES: dict[str, str] = {
    "plain": (
        "A part is failing inspection. It started during the monsoon. Some weeks are fine, some weeks one "
        "in three parts is rejected. You are the new engineer. Your job is to find out why and fix it. "
        "You have three hours and you can talk to anyone on the floor."
    ),
    "standard": (
        "A precision-cast component has begun failing X-ray inspection for subsurface porosity, with rejection "
        "rates that fluctuate week to week since the start of the monsoon. As the newly appointed process "
        "engineer, you have been asked to investigate the cause and recommend a fix within three hours, with "
        "full access to the shop floor and records."
    ),
    "advanced": (
        "A flight-critical casting has developed an intermittent subsurface porosity defect whose incidence "
        "— fluctuating sharply with no immediately discernible pattern since monsoon onset — has begun to "
        "threaten both yield and delivery commitments. You have inherited the investigation, and must, within "
        "three hours, disentangle the contributing factors and commit to a defensible remediation."
    ),
}
