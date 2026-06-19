"""Phase H Slice 3 — question normalization + deterministic scoring engine.

Two responsibilities:

1. `normalize_questions(sections)` — up-converts legacy plain-string questions to a
   typed Question(type='open', prompt=<string>) shape on read. Approved cases stay
   semantically unchanged; the API surface just speaks the new schema.

2. `score_question(question, answer, *, reasoning=None, reasoning_weight=0.4)` —
   deterministic per-type scoring. Returns a dict
   `{score, max_score, awarded, needs_review, breakdown}` where:
     - score: 0..1 normalized
     - awarded: score * question.points
     - needs_review: True when the deterministic check is inconclusive (e.g. short_answer
       with no keyphrase match, or open-type which never auto-scores).
     - reasoning: an optional LLM-graded score is NOT done here. Phase H Slice 4 owns
       human-in-the-loop reasoning grading; for now, when require_reasoning is on the
       deterministic correctness becomes 60% of the score and the remaining 40% is
       marked pending-review (we report it as `needs_review=True` with the deterministic
       portion already in `breakdown.objective`).
"""
from __future__ import annotations

from typing import Any, Dict, List


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------
def _question_from_str(s: str) -> Dict[str, Any]:
    """Convert a legacy plain-string question to a typed Question dict."""
    return {
        "id": "",  # the caller will fill if needed; downstream readers usually keep idx
        "type": "open",
        "prompt": s,
        "options": [],
        "correct_option_ids": [],
        "acceptable_answers": [],
        "numerical_answer": None,
        "numerical_tolerance": 0.0,
        "pairs": [],
        "reasoning_key": None,
        "points": 1.0,
    }


def normalize_questions(sections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Walk sections and up-convert any plain-string question to a typed Question dict.

    Returns a new list of section dicts; original input is not mutated.
    Safe to call repeatedly — already-typed questions pass through unchanged.
    """
    out: List[Dict[str, Any]] = []
    for s in sections or []:
        new_qs: List[Dict[str, Any]] = []
        for idx, q in enumerate(s.get("questions") or []):
            if isinstance(q, str):
                q_obj = _question_from_str(q)
                # Give it a stable id derived from the section + index so updates round-trip.
                q_obj["id"] = f"{s.get('id', 'sec')}-q{idx}"
                new_qs.append(q_obj)
            elif isinstance(q, dict):
                # Backfill any missing keys so downstream consumers don't KeyError.
                qd = {**_question_from_str(""), **q}
                if not qd.get("id"):
                    qd["id"] = f"{s.get('id', 'sec')}-q{idx}"
                # prompt may have been carried as 'text' historically
                if not qd.get("prompt") and qd.get("text"):
                    qd["prompt"] = qd["text"]
                new_qs.append(qd)
            else:
                # Unknown shape — coerce to open
                new_qs.append(_question_from_str(str(q)))
        out.append({**s, "questions": new_qs})
    return out


def candidate_questions(sections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return candidate-safe versions of the sections (answer keys stripped)."""
    safe: List[Dict[str, Any]] = []
    for s in normalize_questions(sections):
        cqs: List[Dict[str, Any]] = []
        for q in s["questions"]:
            cq = {
                "id": q["id"],
                "type": q["type"],
                "prompt": q["prompt"],
                "options": q.get("options", []),
                "pairs_left": [p["left"] for p in q.get("pairs", []) if "left" in p],
                "pairs_right_pool": [p["right"] for p in q.get("pairs", []) if "right" in p],
                "require_reasoning": False,  # set by caller based on case.require_reasoning + type
            }
            cqs.append(cq)
        safe.append({"id": s["id"], "title": s["title"], "intro": s["intro"], "questions": cqs})
    return safe


# ---------------------------------------------------------------------------
# Scoring engine
# ---------------------------------------------------------------------------
def _norm_text(s: Any) -> str:
    return str(s or "").strip().lower()


def _score_mcq(q: Dict[str, Any], answer: Any) -> Dict[str, Any]:
    correct = set(q.get("correct_option_ids") or [])
    picked_id = answer if isinstance(answer, str) else (answer[0] if isinstance(answer, list) and answer else None)
    if not correct:
        return {"score": 0.0, "needs_review": True, "reason": "no answer key configured"}
    if picked_id and picked_id in correct:
        return {"score": 1.0, "needs_review": False, "reason": "matches key"}
    return {"score": 0.0, "needs_review": False, "reason": "does not match key"}


def _score_multiple_correct(q: Dict[str, Any], answer: Any) -> Dict[str, Any]:
    """Jaccard-style scoring on selected options vs key. Penalises wrong picks."""
    correct = set(q.get("correct_option_ids") or [])
    picked = set(answer if isinstance(answer, list) else ([answer] if isinstance(answer, str) else []))
    if not correct:
        return {"score": 0.0, "needs_review": True, "reason": "no answer key configured"}
    if not picked:
        return {"score": 0.0, "needs_review": False, "reason": "no selection"}
    tp = len(picked & correct)
    fp = len(picked - correct)
    fn = len(correct - picked)
    raw = tp / (tp + fp + fn) if (tp + fp + fn) > 0 else 0.0
    return {"score": round(raw, 4), "needs_review": False, "reason": f"jaccard={raw:.2f}"}


def _score_fill_blank(q: Dict[str, Any], answer: Any) -> Dict[str, Any]:
    """Case-insensitive whitespace-collapsed match against acceptable_answers OR numerical."""
    raw = _norm_text(answer)
    if q.get("numerical_answer") is not None:
        try:
            x = float(str(answer).strip())
            tol = float(q.get("numerical_tolerance") or 0.0)
            ok = abs(x - float(q["numerical_answer"])) <= tol
            return {"score": 1.0 if ok else 0.0, "needs_review": False, "reason": "numerical match" if ok else "numerical mismatch"}
        except (TypeError, ValueError):
            pass
    accepts = [_norm_text(a) for a in (q.get("acceptable_answers") or [])]
    if not accepts:
        return {"score": 0.0, "needs_review": True, "reason": "no answer key configured"}
    # Collapse internal whitespace for forgiveness
    raw_collapsed = " ".join(raw.split())
    for a in accepts:
        if " ".join(a.split()) == raw_collapsed:
            return {"score": 1.0, "needs_review": False, "reason": "matches accepted answer"}
    return {"score": 0.0, "needs_review": False, "reason": "does not match accepted answers"}


def _score_match(q: Dict[str, Any], answer: Any) -> Dict[str, Any]:
    """answer expected as dict {left: chosen_right}. Score = correct_pairs / total_pairs."""
    pairs = q.get("pairs") or []
    if not pairs:
        return {"score": 0.0, "needs_review": True, "reason": "no pairs configured"}
    if not isinstance(answer, dict):
        return {"score": 0.0, "needs_review": False, "reason": "no pairing submitted"}
    correct = 0
    for p in pairs:
        chosen = answer.get(p["left"])
        if chosen and _norm_text(chosen) == _norm_text(p["right"]):
            correct += 1
    return {"score": round(correct / len(pairs), 4), "needs_review": False, "reason": f"{correct}/{len(pairs)} pairs correct"}


def _score_short_answer(q: Dict[str, Any], answer: Any) -> Dict[str, Any]:
    """Any-match on acceptable_keyphrases. If none match → needs_review (manager grades).
    Also supports numerical_answer + tolerance.
    """
    if q.get("numerical_answer") is not None:
        try:
            x = float(str(answer).strip())
            tol = float(q.get("numerical_tolerance") or 0.0)
            ok = abs(x - float(q["numerical_answer"])) <= tol
            return {"score": 1.0 if ok else 0.0, "needs_review": False, "reason": "numerical match" if ok else "numerical mismatch"}
        except (TypeError, ValueError):
            pass
    raw = _norm_text(answer)
    keyphrases = [_norm_text(a) for a in (q.get("acceptable_answers") or []) if a]
    if not keyphrases:
        # No key configured AND not numerical → cannot deterministically score
        return {"score": 0.0, "needs_review": True, "reason": "no keyphrases configured"}
    if not raw:
        return {"score": 0.0, "needs_review": False, "reason": "empty answer"}
    for kp in keyphrases:
        if kp and kp in raw:
            return {"score": 1.0, "needs_review": False, "reason": f"matched keyphrase: {kp[:40]}"}
    # No keyphrase matched — flag for manual review (per user spec)
    return {"score": 0.0, "needs_review": True, "reason": "no keyphrase match — needs manager review"}


def score_question(q: Dict[str, Any], answer: Any, *, reasoning: str | None = None, case_requires_reasoning: bool = False) -> Dict[str, Any]:
    """Score one question. Returns
    {
      score: 0..1,           # final blended score
      max_score: 1.0,
      awarded: score * q.points,
      needs_review: bool,
      breakdown: {objective, reasoning_pending},
      reason: str,
    }
    """
    t = (q.get("type") or "open").lower()
    if t == "mcq":
        det = _score_mcq(q, answer)
    elif t == "multiple_correct":
        det = _score_multiple_correct(q, answer)
    elif t == "fill_blank":
        det = _score_fill_blank(q, answer)
    elif t == "match":
        det = _score_match(q, answer)
    elif t == "short_answer":
        det = _score_short_answer(q, answer)
    else:  # open
        det = {"score": 0.0, "needs_review": True, "reason": "open question — deferred to grading review"}

    objective = float(det["score"])
    needs_review = bool(det["needs_review"])
    breakdown = {"objective": objective, "reasoning_pending": False}

    # Reasoning blending: when the case requires reasoning AND the question is objective,
    # the objective portion becomes 60% of final and the remaining 40% is reasoning-pending.
    # Slice 4 will replace reasoning_pending with an actual graded score.
    objective_types = ("mcq", "multiple_correct", "fill_blank", "match", "short_answer")
    if case_requires_reasoning and t in objective_types:
        final = round(objective * 0.6, 4)
        if reasoning and reasoning.strip():
            breakdown["reasoning_pending"] = True
            needs_review = True  # waiting for human/LLM reasoning grade
        else:
            # No reasoning supplied — penalise slightly (no bonus available)
            breakdown["reasoning_pending"] = False
        return {
            "score": final,
            "max_score": 1.0,
            "awarded": round(final * float(q.get("points") or 1.0), 4),
            "needs_review": needs_review,
            "breakdown": breakdown,
            "reason": det.get("reason") or "",
            "type": t,
        }

    return {
        "score": objective,
        "max_score": 1.0,
        "awarded": round(objective * float(q.get("points") or 1.0), 4),
        "needs_review": needs_review,
        "breakdown": breakdown,
        "reason": det.get("reason") or "",
        "type": t,
    }


def score_response(case: Dict[str, Any], response: Dict[str, Any]) -> Dict[str, Any]:
    """Score every question on a case against a candidate response.

    Returns a summary dict:
      {
        per_question: { f"{section_id}::{q_idx}": {score, awarded, needs_review, ...} },
        objective_total: float,        # sum of awarded scores
        objective_max: float,          # sum of max possible
        objective_pct: float,          # 0..100
        items_needing_review: int,
      }
    """
    sections = normalize_questions(case.get("sections") or [])
    case_rr = bool(case.get("require_reasoning"))
    answers = response.get("answers") or {}
    reasonings = response.get("reasonings") or {}
    per_q: Dict[str, Any] = {}
    obj_total = 0.0
    obj_max = 0.0
    review_count = 0
    for s in sections:
        for idx, q in enumerate(s["questions"]):
            key = f"{s['id']}::{idx}"
            ans = answers.get(key)
            r_text = reasonings.get(key)
            r = score_question(q, ans, reasoning=r_text, case_requires_reasoning=case_rr)
            r["question_id"] = q["id"]
            r["key"] = key
            per_q[key] = r
            obj_total += float(r["awarded"])
            obj_max += float(q.get("points") or 1.0)
            if r["needs_review"]:
                review_count += 1
    obj_pct = round((obj_total / obj_max) * 100.0, 2) if obj_max > 0 else 0.0
    return {
        "per_question": per_q,
        "objective_total": round(obj_total, 4),
        "objective_max": round(obj_max, 4),
        "objective_pct": obj_pct,
        "items_needing_review": review_count,
    }
