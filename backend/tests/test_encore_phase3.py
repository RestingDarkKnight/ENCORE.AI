"""ENCORE Phase 3 backend tests — evaluations, decisions, leaderboard, audio JWT."""
import os
import sys
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo.manager@encore.ai"
DEMO_PASSWORD = "Encore-Phase1-2026!"


def _sync_db():
    sys.path.insert(0, "/app/backend")
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    from pymongo import MongoClient
    client = MongoClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_login(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def demo_token(demo_login):
    return demo_login["access_token"]


@pytest.fixture(scope="session")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def demo_me(session, demo_headers):
    return session.get(f"{API}/auth/me", headers=demo_headers).json()


@pytest.fixture(scope="session")
def manager_b(session):
    email = f"TEST_b_p3_{uuid.uuid4().hex[:8]}@encore.ai"
    r = session.post(f"{API}/auth/signup", json={
        "email": email, "password": "TestPass-123!", "full_name": "B P3", "company": "BCo"
    })
    assert r.status_code == 201, r.text
    body = r.json()
    return {
        "token": body["access_token"],
        "headers": {"Authorization": f"Bearer {body['access_token']}", "Content-Type": "application/json"},
        "id": body["manager"]["id"],
    }


# ---------- Find pre-seeded Alice assignment via direct Mongo query ----------
@pytest.fixture(scope="session")
def alice_assignment(session, demo_headers, demo_me):
    """Find Alice's pre-seeded submitted assignment with overall_score=3.8 via Mongo."""
    db = _sync_db()
    # Find evaluation with score 3.8
    ev = db.evaluations.find_one({"overall_score": 3.8})
    if not ev:
        pytest.skip("Pre-seeded evaluation with overall_score=3.8 not found")
    a = db.assignments.find_one({"id": ev["assignment_id"], "manager_id": demo_me["id"]})
    if not a:
        pytest.skip("Alice assignment not owned by demo manager")
    a.pop("_id", None)
    return a


# ---------- BACKEND: evaluation endpoint ----------
class TestEvaluation:
    def test_get_evaluation_alice_returns_seed(self, session, demo_headers, alice_assignment):
        r = session.get(
            f"{API}/responses/by-assignment/{alice_assignment['id']}/evaluation",
            headers=demo_headers,
        )
        assert r.status_code == 200
        e = r.json()
        assert e is not None
        assert e["overall_score"] == 3.8
        assert e["recommendation"] == "hire"
        assert isinstance(e["scores"], list) and len(e["scores"]) > 0
        for s in e["scores"]:
            assert "dimension_id" in s
            assert "quote" in s
            assert "justification" in s

    def test_evaluate_alice_idempotent_returns_existing(self, session, demo_headers, alice_assignment):
        r = session.post(
            f"{API}/responses/by-assignment/{alice_assignment['id']}/evaluate",
            headers=demo_headers,
        )
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["overall_score"] == 3.8
        assert e["recommendation"] == "hire"

    def test_evaluate_cross_manager_404(self, session, manager_b, alice_assignment):
        r = session.post(
            f"{API}/responses/by-assignment/{alice_assignment['id']}/evaluate",
            headers=manager_b["headers"],
        )
        assert r.status_code == 404

    def test_get_evaluation_cross_manager_404(self, session, manager_b, alice_assignment):
        r = session.get(
            f"{API}/responses/by-assignment/{alice_assignment['id']}/evaluation",
            headers=manager_b["headers"],
        )
        assert r.status_code == 404

    def test_evaluate_unknown_assignment_404(self, session, demo_headers):
        r = session.post(
            f"{API}/responses/by-assignment/no_such_id/evaluate",
            headers=demo_headers,
        )
        assert r.status_code == 404

    def test_evaluate_not_submitted_409(self, session, demo_headers, demo_me):
        """Find an in_progress or sent assignment and try to evaluate → 409."""
        db = _sync_db()
        a = db.assignments.find_one({
            "manager_id": demo_me["id"],
            "status": {"$in": ["sent", "in_progress"]},
        })
        if not a:
            pytest.skip("No non-submitted assignment to test 409")
        rr = session.post(
            f"{API}/responses/by-assignment/{a['id']}/evaluate",
            headers=demo_headers,
        )
        assert rr.status_code == 409, rr.text

    def test_evaluate_submitted_no_eval_returns_503(self, session, demo_headers, demo_me):
        """Create a submitted assignment with no evaluation → 503 (Claude not configured)."""
        # Seed: approved case + assignment + response + flip status to submitted (no eval).
        db = _sync_db()
        sys.path.insert(0, "/app/backend")
        from models import Case, CaseSection, RubricDimension, RubricAnchors, Assignment, CandidateResponse

        case = Case(
            role_id=str(uuid.uuid4()),
            manager_id=demo_me["id"],
            status="approved",
            title="TEST_P3_NoEvalCase",
            scenario_text="x",
            sections=[CaseSection(title="S", intro="i", questions=["q"])],
            rubric=[RubricDimension(name="J", description="d", weight=100.0,
                                    anchors=RubricAnchors(one="w", three="s", five="e"))],
            estimated_minutes=60, model_used="seed",
            approved_at=datetime.now(timezone.utc).isoformat(),
        )
        db.cases.insert_one(case.model_dump())
        a = Assignment(
            case_id=case.id, manager_id=demo_me["id"],
            candidate_email="TEST_p3_noeval@example.com", candidate_name="No Eval",
            status="submitted", submitted_at=datetime.now(timezone.utc).isoformat(),
        )
        db.assignments.insert_one(a.model_dump())
        resp = CandidateResponse(
            assignment_id=a.id, answers={}, audio={},
            honor_code_accepted=True,
            submitted_at=datetime.now(timezone.utc).isoformat(),
        )
        db.responses.insert_one(resp.model_dump())

        r = session.post(
            f"{API}/responses/by-assignment/{a.id}/evaluate",
            headers=demo_headers,
        )
        assert r.status_code == 503, r.text
        assert "Claude" in r.text or "not configured" in r.text.lower()

        # GET evaluation returns null
        g = session.get(
            f"{API}/responses/by-assignment/{a.id}/evaluation",
            headers=demo_headers,
        )
        assert g.status_code == 200
        assert g.json() is None


# ---------- BACKEND: Decisions ----------
class TestDecisions:
    def test_create_decision_advance(self, session, demo_headers, alice_assignment):
        # Get response_id
        rv = session.get(
            f"{API}/responses/by-assignment/{alice_assignment['id']}",
            headers=demo_headers,
        ).json()
        response_id = rv["id"]
        r = session.post(f"{API}/decisions", headers=demo_headers, json={
            "response_id": response_id,
            "outcome": "advance",
            "note": "TEST_decision note advance",
        })
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["outcome"] == "advance"
        assert d["note"] == "TEST_decision note advance"

        # GET reflects
        g = session.get(f"{API}/decisions/by-response/{response_id}", headers=demo_headers)
        assert g.status_code == 200
        assert g.json()["outcome"] == "advance"

    def test_decision_upserts_to_reject(self, session, demo_headers, alice_assignment):
        rv = session.get(
            f"{API}/responses/by-assignment/{alice_assignment['id']}",
            headers=demo_headers,
        ).json()
        response_id = rv["id"]
        r = session.post(f"{API}/decisions", headers=demo_headers, json={
            "response_id": response_id, "outcome": "reject", "note": "TEST_reject",
        })
        assert r.status_code == 201
        g = session.get(f"{API}/decisions/by-response/{response_id}", headers=demo_headers).json()
        assert g["outcome"] == "reject"
        assert g["note"] == "TEST_reject"

        # Restore to "advance" (seeded state) for other tests
        session.post(f"{API}/decisions", headers=demo_headers, json={
            "response_id": response_id, "outcome": "advance", "note": "Bring to onsite.",
        })

    def test_decision_invalid_outcome_422(self, session, demo_headers, alice_assignment):
        rv = session.get(
            f"{API}/responses/by-assignment/{alice_assignment['id']}",
            headers=demo_headers,
        ).json()
        r = session.post(f"{API}/decisions", headers=demo_headers, json={
            "response_id": rv["id"], "outcome": "maybe", "note": "x",
        })
        assert r.status_code == 422

    def test_decision_unknown_response_404(self, session, demo_headers):
        r = session.post(f"{API}/decisions", headers=demo_headers, json={
            "response_id": "no_such_response", "outcome": "advance", "note": "",
        })
        assert r.status_code == 404

    def test_decision_cross_manager_404(self, session, manager_b, demo_headers, alice_assignment):
        rv = session.get(
            f"{API}/responses/by-assignment/{alice_assignment['id']}",
            headers=demo_headers,
        ).json()
        r = session.post(f"{API}/decisions", headers=manager_b["headers"], json={
            "response_id": rv["id"], "outcome": "advance", "note": "x",
        })
        assert r.status_code == 404


# ---------- BACKEND: Leaderboard ----------
class TestLeaderboard:
    def test_leaderboard_sorts_and_includes_decision(self, session, demo_headers, alice_assignment, demo_me):
        case_id = alice_assignment["case_id"]
        # Seed a second evaluation with lower score on the SAME case for sort assertion
        db = _sync_db()
        sys.path.insert(0, "/app/backend")
        from models import Assignment, CandidateResponse, Evaluation, CriterionScore

        a2 = Assignment(
            case_id=case_id, manager_id=demo_me["id"],
            candidate_email="TEST_p3_second@example.com", candidate_name="Bob LB",
            status="submitted", submitted_at=datetime.now(timezone.utc).isoformat(),
        )
        db.assignments.insert_one(a2.model_dump())
        r2 = CandidateResponse(
            assignment_id=a2.id, answers={}, audio={},
            honor_code_accepted=True, submitted_at=datetime.now(timezone.utc).isoformat(),
        )
        db.responses.insert_one(r2.model_dump())
        ev2 = Evaluation(
            response_id=r2.id, assignment_id=a2.id, case_id=case_id,
            scores=[CriterionScore(dimension_id="d1", name="Judgment", score=2.5, weight=100.0,
                                   quote="seeded", justification="seeded")],
            overall_score=2.5, recommendation="borderline",
            strengths=["s"], concerns=["c"], summary="lower seeded",
            model_used="seed",
        )
        db.evaluations.insert_one(ev2.model_dump())

        r = session.get(f"{API}/cases/{case_id}/leaderboard", headers=demo_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["case_id"] == case_id
        assert "case_title" in body
        rows = body["rows"]
        # find rows with overall_score set
        eval_rows = [row for row in rows if row.get("overall_score") is not None]
        assert len(eval_rows) >= 2
        # First eval row should be highest score (3.8 > 2.5)
        assert eval_rows[0]["overall_score"] >= eval_rows[1]["overall_score"]
        assert eval_rows[0]["overall_score"] == 3.8

        # Decision included for Alice's row
        alice_row = next((row for row in rows if row["assignment"]["id"] == alice_assignment["id"]), None)
        assert alice_row is not None
        # Decision should be "advance" (seeded)
        assert alice_row.get("decision") == "advance"

    def test_leaderboard_cross_manager_404(self, session, manager_b, alice_assignment):
        r = session.get(
            f"{API}/cases/{alice_assignment['case_id']}/leaderboard",
            headers=manager_b["headers"],
        )
        assert r.status_code == 404


# ---------- BACKEND: audio JWT streaming ----------
class TestAudioJwtStreaming:
    def test_audio_stream_missing_t_401(self, session, alice_assignment):
        # Find a section_id with audio on Alice's response (or just pick any from the case)
        # We're testing the auth layer — without t param.
        r = requests.get(
            f"{API}/responses/by-assignment/{alice_assignment['id']}/audio/foo/0",
        )
        assert r.status_code == 401

    def test_audio_stream_invalid_t_401(self, session, alice_assignment):
        r = requests.get(
            f"{API}/responses/by-assignment/{alice_assignment['id']}/audio/foo/0?t=garbage_jwt",
        )
        assert r.status_code == 401

    def test_audio_stream_valid_t_passes_auth(self, session, demo_token, alice_assignment, demo_headers):
        # The point: with valid JWT in ?t=, auth passes. Returns 200 if audio exists, 404 if no clip.
        # Either response means auth passed (not 401).
        # Find a section/q with audio if any.
        rv = session.get(
            f"{API}/responses/by-assignment/{alice_assignment['id']}",
            headers=demo_headers,
        ).json()
        audio_map = rv.get("audio") or {}
        if audio_map:
            key = next(iter(audio_map.keys()))
            sid, q = key.split("::")
            r = requests.get(
                f"{API}/responses/by-assignment/{alice_assignment['id']}/audio/{sid}/{q}?t={demo_token}",
            )
            assert r.status_code == 200
            assert len(r.content) > 0
        else:
            # No audio — should still pass auth then 404
            r = requests.get(
                f"{API}/responses/by-assignment/{alice_assignment['id']}/audio/nope/0?t={demo_token}",
            )
            assert r.status_code in (404,)


# ---------- BACKEND: auto-evaluate no-ops without key ----------
class TestAutoEvaluateNoOp:
    def test_submit_does_not_create_evaluation_when_key_missing(self, session, demo_headers, demo_me):
        """End-to-end: create assignment, take, submit → no evaluation created (key empty)."""
        sys.path.insert(0, "/app/backend")
        from models import Case, CaseSection, RubricDimension, RubricAnchors
        db = _sync_db()
        case = Case(
            role_id=str(uuid.uuid4()),
            manager_id=demo_me["id"],
            status="approved",
            title="TEST_P3_AutoEvalNoOp",
            scenario_text="x",
            sections=[CaseSection(title="S", intro="i", questions=["q"])],
            rubric=[RubricDimension(name="J", description="d", weight=100.0,
                                    anchors=RubricAnchors(one="w", three="s", five="e"))],
            estimated_minutes=30, model_used="seed",
            approved_at=datetime.now(timezone.utc).isoformat(),
        )
        db.cases.insert_one(case.model_dump())

        a = session.post(f"{API}/assignments", headers=demo_headers, json={
            "case_id": case.id, "candidate_email": "TEST_p3_auto@example.com",
        }).json()
        token = a["token"]
        # take + submit
        requests.get(f"{API}/take/{token}")
        sub = requests.post(f"{API}/take/{token}/submit", json={
            "answers": {}, "honor_code_accepted": True, "time_taken_seconds": 1,
        })
        assert sub.status_code == 200
        # Wait briefly for background task
        import time
        time.sleep(2)
        # GET evaluation → null
        ev = session.get(
            f"{API}/responses/by-assignment/{a['id']}/evaluation",
            headers=demo_headers,
        )
        assert ev.status_code == 200
        assert ev.json() is None
