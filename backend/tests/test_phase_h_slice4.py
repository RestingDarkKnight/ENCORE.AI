"""Phase H Slice 4 — grading review-gate endpoints.

Covers:
  - PATCH /api/evaluations/{eval_id}      (manager overrides; updates final_score)
  - POST  /api/evaluations/{eval_id}/finalize
  - POST  /api/evaluations/{eval_id}/reopen
  - GET   /api/evaluations/{eval_id}
  - Aggregate-stat impact: provisional evals excluded from CaseSummary averages but counted as pending_review.
  - Leaderboard row exposes evaluation_status + evaluation_id + final_score.
  - Shared report endpoint 404s while provisional, returns when finalized.

Because the ANTHROPIC_API_KEY is empty in this env, we cannot trigger /evaluate to
create an Evaluation via the real flow. Instead, we insert a provisional Evaluation
document directly into Mongo using pymongo (sync) so the HTTP layer can read it.
"""
import os
import uuid
from datetime import datetime, timezone

import pymongo
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017").strip().strip('"').strip("'")
DB_NAME = os.environ.get("DB_NAME", "test_database").strip().strip('"').strip("'")

DEMO_EMAIL = "demo.manager@encore.ai"
DEMO_PASSWORD = "Encore-Phase1-2026!"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    yield s
    s.close()


@pytest.fixture(scope="module")
def auth_headers(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=10)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def db():
    return pymongo.MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture
def seeded_eval(session, auth_headers, db):
    """Create a fresh role+case+assignment+response+evaluation triple. Yields the eval id."""
    # 1) role
    role = session.post(f"{API}/roles", headers=auth_headers, json={
        "job_title": f"Slice4 Role {uuid.uuid4().hex[:6]}",
        "industry": "Test",
        "seniority": "mid",
        "technical_skills": ["x"], "soft_skills": ["y"],
        "success_criteria": "ok", "common_challenges": "none",
        "difficulty_level": "applied", "language_register": "standard",
    }, timeout=10).json()

    # 2) case (insert directly so we don't need Claude)
    manager_id = session.get(f"{API}/auth/me", headers=auth_headers, timeout=10).json()["id"]
    case = {
        "id": str(uuid.uuid4()),
        "role_id": role["id"],
        "manager_id": manager_id,
        "status": "approved",
        "title": "Slice4 Test Case",
        "scenario_text": "Scenario.",
        "sections": [{"id": "s1", "title": "S1", "intro": "", "questions": [
            {"id": "q1", "type": "open", "prompt": "Q1", "options": [], "correct_option_ids": [], "acceptable_answers": [], "pairs": [], "points": 1, "numerical_answer": None, "numerical_tolerance": 0, "reasoning_key": None},
        ]}],
        "rubric": [
            {"id": "r1", "name": "Clarity",  "description": "", "weight": 50, "anchors": {"one": "low", "three": "mid", "five": "hi"}},
            {"id": "r2", "name": "Accuracy", "description": "", "weight": 50, "anchors": {"one": "low", "three": "mid", "five": "hi"}},
        ],
        "estimated_minutes": 30,
        "assessment_mode": "interview",
        "require_reasoning": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "model_used": "manual",
    }
    db.cases.insert_one(case)

    # 3) assignment
    assn_resp = session.post(f"{API}/assignments", headers=auth_headers, json={
        "case_id": case["id"],
        "candidate_email": f"cand-{uuid.uuid4().hex[:6]}@example.com",
        "candidate_name": "Test Cand",
    }, timeout=10).json()

    # 4) response + provisional evaluation
    response_id = str(uuid.uuid4())
    db.responses.insert_one({
        "id": response_id, "assignment_id": assn_resp["id"], "answers": {"s1::0": "An answer"},
        "reasonings": {}, "audio": {}, "honor_code_accepted": True,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    })
    db.assignments.update_one({"id": assn_resp["id"]}, {"$set": {"status": "submitted", "submitted_at": datetime.now(timezone.utc).isoformat()}})

    eval_id = str(uuid.uuid4())
    eval_doc = {
        "id": eval_id, "response_id": response_id, "assignment_id": assn_resp["id"], "case_id": case["id"],
        "scores": [
            {"dimension_id": "r1", "name": "Clarity",  "score": 3.0, "weight": 50, "quote": "...", "justification": "ok"},
            {"dimension_id": "r2", "name": "Accuracy", "score": 4.0, "weight": 50, "quote": "...", "justification": "ok"},
        ],
        "overall_score": 3.5,
        "recommendation": "hire",
        "strengths": ["x"], "concerns": ["y"], "summary": "Adequate",
        "model_used": "test",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "provisional",
        "reasoning_grades": [],
        "deterministic_score": None,
        "manager_overrides": {},
        "section_comments": {},
        "final_score": 3.5,
        "final_recommendation": "hire",
        "finalized_at": None,
        "finalized_by": None,
    }
    db.evaluations.insert_one(eval_doc)

    yield {"eval_id": eval_id, "case_id": case["id"], "assignment_id": assn_resp["id"]}


# ============================ PATCH /evaluations/{id} ============================
class TestOverride:
    def test_override_updates_final_score(self, session, auth_headers, seeded_eval):
        r = session.patch(f"{API}/evaluations/{seeded_eval['eval_id']}", headers=auth_headers, json={
            "manager_overrides": {"r1": 5.0, "r2": 5.0},
            "override_note": "Strong on both dimensions",
        }, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["manager_overrides"] == {"r1": 5.0, "r2": 5.0}
        # 5*50 + 5*50 / 100 = 5.0; no deterministic_score → final = 5.0
        assert body["final_score"] == 5.0
        assert body["final_recommendation"] == "strong_hire"  # auto-derived

    def test_section_comments_persist(self, session, auth_headers, seeded_eval):
        r = session.patch(f"{API}/evaluations/{seeded_eval['eval_id']}", headers=auth_headers, json={
            "section_comments": {"s1": "Nice job"},
        }, timeout=10)
        assert r.status_code == 200
        assert r.json()["section_comments"] == {"s1": "Nice job"}


# ============================ POST /finalize ============================
class TestFinalize:
    def test_finalize_locks_evaluation(self, session, auth_headers, seeded_eval):
        r = session.post(f"{API}/evaluations/{seeded_eval['eval_id']}/finalize", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "finalized"
        assert body["finalized_at"] is not None

    def test_finalized_eval_rejects_patches(self, session, auth_headers, seeded_eval):
        session.post(f"{API}/evaluations/{seeded_eval['eval_id']}/finalize", headers=auth_headers, timeout=10)
        r = session.patch(f"{API}/evaluations/{seeded_eval['eval_id']}", headers=auth_headers, json={"override_note": "x"}, timeout=10)
        assert r.status_code == 409, r.text

    def test_reopen_unlocks(self, session, auth_headers, seeded_eval):
        session.post(f"{API}/evaluations/{seeded_eval['eval_id']}/finalize", headers=auth_headers, timeout=10)
        r = session.post(f"{API}/evaluations/{seeded_eval['eval_id']}/reopen", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "provisional"


# ============================ Aggregate-stat impact ============================
class TestAggregateExclusion:
    def test_provisional_excluded_from_avg_but_counted_in_pending(self, session, auth_headers, seeded_eval):
        # /reports/case/{id} returns CaseReport with `pending_review`
        r = session.get(f"{API}/reports/case/{seeded_eval['case_id']}", headers=auth_headers, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["pending_review"] == 1
        # /reports/summary returns CaseSummary list with `evaluated` + `avg_overall_score`
        s = session.get(f"{API}/reports/summary", headers=auth_headers, timeout=10).json()
        case = next(c for c in s["cases"] if c["case_id"] == seeded_eval["case_id"])
        assert case["evaluated"] == 1
        assert case["pending_review"] == 1
        assert case["avg_overall_score"] is None  # provisional excluded

    def test_finalize_then_aggregate_uses_only_finalized(self, session, auth_headers, seeded_eval):
        session.post(f"{API}/evaluations/{seeded_eval['eval_id']}/finalize", headers=auth_headers, timeout=10)
        s = session.get(f"{API}/reports/summary", headers=auth_headers, timeout=10).json()
        case = next(c for c in s["cases"] if c["case_id"] == seeded_eval["case_id"])
        assert case["pending_review"] == 0
        assert case["avg_overall_score"] is not None


# ============================ Leaderboard row signals ============================
class TestLeaderboardSignals:
    def test_evaluation_status_surfaces(self, session, auth_headers, seeded_eval):
        r = session.get(f"{API}/cases/{seeded_eval['case_id']}/leaderboard", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        rows = r.json().get("rows", [])
        target = [row for row in rows if row.get("evaluation_id") == seeded_eval["eval_id"]]
        assert target, "leaderboard should include the seeded evaluation"
        assert target[0]["evaluation_status"] == "provisional"
        assert target[0]["final_score"] is not None


# ============================ Shared report gating ============================
class TestSharedReportGate:
    def test_shared_report_404s_when_provisional(self, session, auth_headers, seeded_eval, db):
        share = session.post(f"{API}/reports/{seeded_eval['assignment_id']}/share",
                             headers=auth_headers, json={"show_initials_only": False}, timeout=10)
        assert share.status_code in (200, 201), share.text
        token = share.json()["share_token"]
        r = session.get(f"{API}/shared/report/{token}", timeout=10)
        assert r.status_code == 404
        body_lower = r.text.lower()
        assert "still reviewing" in body_lower or "ready" in body_lower

    def test_shared_report_returns_when_finalized(self, session, auth_headers, seeded_eval, db):
        session.post(f"{API}/evaluations/{seeded_eval['eval_id']}/finalize", headers=auth_headers, timeout=10)
        share = session.post(f"{API}/reports/{seeded_eval['assignment_id']}/share",
                             headers=auth_headers, json={"show_initials_only": False}, timeout=10).json()
        r = session.get(f"{API}/shared/report/{share['share_token']}", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("overall_score") is not None
