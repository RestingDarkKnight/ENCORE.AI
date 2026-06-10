"""Grounding layer — retrieves validated material for a domain and builds the grounding section of the Claude prompt.

DESIGN NOTES:
- "Relevant" today = same `domain_key`, most recent first.
- EXTENSION POINT: once a domain has 50+ approved cases, replace `_relevant_approved`
  with embedding-based semantic retrieval (e.g. pgvector / Mongo Atlas vector index)
  to surface the cases most similar to the *current* role brief — not just the most
  recent. Do NOT do this prematurely; recency-by-domain is sufficient signal until
  the library is large.
- Graceful degradation: if every query returns empty, the grounding section is
  omitted entirely and generation behaves exactly as the unrounded baseline.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Dict, List, Optional, Tuple

from db import get_db

logger = logging.getLogger(__name__)

_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


def make_domain_key(industry: Optional[str], job_title: Optional[str]) -> str:
    """Normalize industry + title into a stable, lowercase, snake_case key.

    Examples:
        ("Casting foundry", "QA Engineer") → "casting_foundry_qa_engineer"
        ("",                "Backend Eng") → "backend_eng"
    """
    parts = " ".join([(industry or "").strip(), (job_title or "").strip()]).strip().lower()
    cleaned = _NON_ALNUM_RE.sub("_", parts).strip("_")
    return cleaned or "general"


def _approved_n() -> int:
    try:
        return max(0, int(os.environ.get("GROUND_APPROVED_N", "3")))
    except ValueError:
        return 3


def _rejected_m() -> int:
    try:
        return max(0, int(os.environ.get("GROUND_REJECTED_M", "2")))
    except ValueError:
        return 2


async def _relevant_approved(domain_key: str, n: int, exclude_case_id: Optional[str]) -> List[dict]:
    if n <= 0:
        return []
    db = get_db()
    q = {"domain_key": domain_key, "review_status": "approved"}
    if exclude_case_id:
        q["id"] = {"$ne": exclude_case_id}
    cursor = db.cases.find(q).sort("created_at", -1).limit(n)
    return [c async for c in cursor]


async def _domain_constraints(domain_key: str) -> List[dict]:
    db = get_db()
    cursor = db.domain_constraints.find({"domain_key": domain_key}).sort("created_at", -1)
    return [c async for c in cursor]


async def _recent_rejected_with_notes(domain_key: str, m: int, exclude_case_id: Optional[str]) -> List[Tuple[dict, str]]:
    if m <= 0:
        return []
    db = get_db()
    q = {"domain_key": domain_key, "review_status": "rejected"}
    if exclude_case_id:
        q["id"] = {"$ne": exclude_case_id}
    rejected = [c async for c in db.cases.find(q).sort("created_at", -1).limit(m)]
    if not rejected:
        return []
    # Pull the most recent review note per rejected case
    case_ids = [c["id"] for c in rejected]
    reviews = {}
    async for r in db.case_reviews.find(
        {"case_id": {"$in": case_ids}, "verdict": "rejected"}
    ).sort("reviewed_at", -1):
        reviews.setdefault(r["case_id"], r.get("notes") or "")
    return [(c, reviews.get(c["id"], "")) for c in rejected]


def _format_approved(c: dict, idx: int) -> str:
    rubric_lines = [
        f"  - {r['name']} (weight {r['weight']}%): {r['description']}"
        for r in c.get("rubric", [])
    ]
    return (
        f"### Approved example {idx}: {c['title']}\n"
        f"Scenario:\n{c['scenario_text']}\n\n"
        f"Rubric dimensions:\n" + "\n".join(rubric_lines)
    )


def _format_constraint(c: dict) -> str:
    label = {"real_fact": "FACT", "limit": "LIMIT", "anti_pattern": "AVOID"}.get(c["constraint_type"], "NOTE")
    return f"- [{label}] {c['text']}"


def _format_rejection(c: dict, notes: str, idx: int) -> str:
    return (
        f"### Rejected example {idx}: {c['title']}\n"
        f"Scenario excerpt: {c['scenario_text'][:400]}{'…' if len(c['scenario_text']) > 400 else ''}\n"
        f"SME rejection notes: {notes or '(no notes recorded)'}"
    )


async def build_grounding_block(
    domain_key: str,
    *,
    exclude_case_id: Optional[str] = None,
) -> Tuple[str, Dict[str, int]]:
    """Returns (grounding_text, counts). Empty string + zero counts when library is empty."""
    n = _approved_n()
    m = _rejected_m()

    approved = await _relevant_approved(domain_key, n, exclude_case_id)
    constraints = await _domain_constraints(domain_key)
    rejected_pairs = await _recent_rejected_with_notes(domain_key, m, exclude_case_id)

    counts = {
        "approved": len(approved),
        "constraints": len(constraints),
        "rejected": len(rejected_pairs),
    }

    # Graceful degradation: if nothing relevant exists, emit nothing.
    if not any(counts.values()):
        return "", counts

    parts: List[str] = ["## GROUNDING CONTEXT", ""]

    if approved:
        parts.append("### Strong validated cases for this role family")
        parts.append("These passed SME review against the quality rubric. Treat them as the standard of excellence — but do NOT copy them. Generate something new that meets the same bar.")
        for i, c in enumerate(approved, 1):
            parts.append("")
            parts.append(_format_approved(c, i))
        parts.append("")

    if constraints:
        parts.append("### Domain facts and constraints you MUST respect")
        parts.extend(_format_constraint(c) for c in constraints)
        parts.append("")

    if rejected_pairs:
        parts.append("### Past mistakes — do NOT repeat these")
        for i, (c, notes) in enumerate(rejected_pairs, 1):
            parts.append("")
            parts.append(_format_rejection(c, notes, i))
        parts.append("")

    parts.append("---")
    parts.append("Now generate a NEW case (do not copy any of the above) that meets the same standard and respects the constraints.")
    return "\n".join(parts), counts


def log_generation(role_id: str, domain_key: str, counts: Dict[str, int]) -> None:
    if any(counts.values()):
        logger.info(
            "Case generation GROUNDED (role=%s domain=%s) — %d approved, %d constraints, %d rejections",
            role_id, domain_key, counts["approved"], counts["constraints"], counts["rejected"],
        )
    else:
        logger.info(
            "Case generation PLAIN (role=%s domain=%s) — empty library, no grounding injected",
            role_id, domain_key,
        )
