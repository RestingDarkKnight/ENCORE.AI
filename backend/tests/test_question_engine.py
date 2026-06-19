"""Unit tests for /app/backend/question_engine.py — Phase H Slice 3.

These are pure-Python tests; no HTTP / no Mongo.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from question_engine import (  # noqa: E402
    normalize_questions,
    candidate_questions,
    score_question,
    score_response,
)


# ============================ normalize_questions ============================
class TestNormalize:
    def test_string_questions_upconvert_to_open(self):
        sections = [{"id": "s1", "title": "T", "intro": "I", "questions": ["Q1?", "Q2?"]}]
        out = normalize_questions(sections)
        assert len(out[0]["questions"]) == 2
        for q in out[0]["questions"]:
            assert q["type"] == "open"
            assert q["prompt"].startswith("Q")
            assert q["id"].startswith("s1-q")

    def test_typed_dict_passthrough(self):
        q = {"id": "q1", "type": "mcq", "prompt": "P?", "options": [{"id": "a", "text": "A"}], "correct_option_ids": ["a"]}
        out = normalize_questions([{"id": "s1", "title": "T", "intro": "I", "questions": [q]}])
        rendered = out[0]["questions"][0]
        assert rendered["type"] == "mcq"
        assert rendered["correct_option_ids"] == ["a"]

    def test_idempotent(self):
        sections = [{"id": "s1", "title": "T", "intro": "I", "questions": ["Q1?"]}]
        once = normalize_questions(sections)
        twice = normalize_questions(once)
        assert once == twice


# ============================ candidate_questions strip ============================
class TestCandidateView:
    def test_keys_stripped(self):
        q = {"id": "q1", "type": "mcq", "prompt": "P?",
             "options": [{"id": "a", "text": "A"}, {"id": "b", "text": "B"}],
             "correct_option_ids": ["a"], "reasoning_key": "secret"}
        out = candidate_questions([{"id": "s1", "title": "T", "intro": "I", "questions": [q]}])
        cq = out[0]["questions"][0]
        assert "correct_option_ids" not in cq
        assert "reasoning_key" not in cq
        assert "acceptable_answers" not in cq
        assert cq["options"] == [{"id": "a", "text": "A"}, {"id": "b", "text": "B"}]


# ============================ scoring per type ============================
class TestMCQ:
    def test_correct(self):
        q = {"type": "mcq", "options": [{"id": "a"}, {"id": "b"}], "correct_option_ids": ["a"], "points": 2}
        r = score_question(q, "a")
        assert r["score"] == 1.0
        assert r["awarded"] == 2.0
        assert not r["needs_review"]

    def test_wrong(self):
        q = {"type": "mcq", "options": [{"id": "a"}, {"id": "b"}], "correct_option_ids": ["a"]}
        r = score_question(q, "b")
        assert r["score"] == 0.0

    def test_missing_key_flags_review(self):
        q = {"type": "mcq", "options": [{"id": "a"}], "correct_option_ids": []}
        r = score_question(q, "a")
        assert r["needs_review"]


class TestMultipleCorrect:
    def test_exact_match(self):
        q = {"type": "multiple_correct", "correct_option_ids": ["a", "b"]}
        assert score_question(q, ["a", "b"])["score"] == 1.0

    def test_partial(self):
        q = {"type": "multiple_correct", "correct_option_ids": ["a", "b", "c"]}
        r = score_question(q, ["a", "b"])
        assert 0 < r["score"] < 1

    def test_wrong_pick_penalised(self):
        q = {"type": "multiple_correct", "correct_option_ids": ["a"]}
        r = score_question(q, ["a", "x"])
        assert r["score"] < 1.0


class TestFillBlank:
    def test_case_insensitive(self):
        q = {"type": "fill_blank", "acceptable_answers": ["TCP/IP", "tcp ip"]}
        assert score_question(q, "tcp/ip")["score"] == 1.0
        assert score_question(q, "  TCP/IP  ")["score"] == 1.0

    def test_numerical(self):
        q = {"type": "fill_blank", "numerical_answer": 3.14, "numerical_tolerance": 0.01}
        assert score_question(q, "3.14")["score"] == 1.0
        assert score_question(q, "3.20")["score"] == 0.0


class TestMatch:
    def test_all_correct(self):
        q = {"type": "match", "pairs": [{"left": "A", "right": "1"}, {"left": "B", "right": "2"}]}
        assert score_question(q, {"A": "1", "B": "2"})["score"] == 1.0

    def test_partial(self):
        q = {"type": "match", "pairs": [{"left": "A", "right": "1"}, {"left": "B", "right": "2"}]}
        assert score_question(q, {"A": "1", "B": "wrong"})["score"] == 0.5


class TestShortAnswer:
    def test_keyphrase_match(self):
        q = {"type": "short_answer", "acceptable_answers": ["consistency", "latency"]}
        assert score_question(q, "We need to think about consistency tradeoffs")["score"] == 1.0

    def test_no_match_flags_review(self):
        q = {"type": "short_answer", "acceptable_answers": ["consistency"]}
        r = score_question(q, "I'd talk to the user")
        assert r["needs_review"]
        assert r["score"] == 0.0

    def test_no_key_configured_flags_review(self):
        q = {"type": "short_answer", "acceptable_answers": []}
        r = score_question(q, "anything")
        assert r["needs_review"]

    def test_numerical_short(self):
        q = {"type": "short_answer", "numerical_answer": 42, "numerical_tolerance": 1}
        assert score_question(q, "42")["score"] == 1.0


class TestOpen:
    def test_always_needs_review(self):
        q = {"type": "open"}
        r = score_question(q, "Free-form response here.")
        assert r["needs_review"]
        assert r["score"] == 0.0


class TestReasoningBlend:
    def test_objective_60_pct_when_reasoning_required(self):
        q = {"type": "mcq", "options": [{"id": "a"}], "correct_option_ids": ["a"]}
        r = score_question(q, "a", reasoning="Because A is correct", case_requires_reasoning=True)
        # Objective 1.0 * 0.6 = 0.6 final, pending reasoning grade
        assert r["score"] == 0.6
        assert r["needs_review"]
        assert r["breakdown"]["reasoning_pending"]

    def test_open_unchanged_by_reasoning_flag(self):
        q = {"type": "open"}
        r = score_question(q, "free text", case_requires_reasoning=True)
        # open never gets the 60/40 split — still 0 + needs_review
        assert r["score"] == 0.0
        assert r["needs_review"]


# ============================ end-to-end response scoring ============================
class TestScoreResponse:
    def test_mixed_case(self):
        case = {
            "require_reasoning": False,
            "sections": [
                {"id": "s1", "title": "Section 1", "intro": "", "questions": [
                    {"id": "q1", "type": "mcq", "prompt": "?", "options": [{"id": "a"}, {"id": "b"}], "correct_option_ids": ["a"], "points": 1},
                    {"id": "q2", "type": "open", "prompt": "?", "points": 2},
                ]},
            ],
        }
        response = {"answers": {"s1::0": "a", "s1::1": "Some thoughtful answer."}}
        result = score_response(case, response)
        assert result["objective_total"] == 1.0  # q1 right
        assert result["objective_max"] == 3.0  # 1 + 2 points
        assert result["items_needing_review"] == 1  # q2 (open)
        assert result["per_question"]["s1::0"]["score"] == 1.0
