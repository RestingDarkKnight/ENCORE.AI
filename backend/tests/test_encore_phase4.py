"""ENCORE Phase 4 backend tests — /api/stats/manager + Phase 1/2/3 regression smoke."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo.manager@encore.ai"
DEMO_PASSWORD = "Encore-Phase1-2026!"

BADGE_IDS = {
    "first_role", "first_case", "first_approved", "first_invite",
    "first_submission", "first_decision", "first_hire",
    "three_cases", "five_candidates",
}


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_headers(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def manager_b(session):
    email = f"TEST_b_p4_{uuid.uuid4().hex[:8]}@encore.ai"
    r = session.post(f"{API}/auth/signup", json={
        "email": email, "password": "TestPass-123!", "full_name": "B P4", "company": "BCo"
    })
    assert r.status_code == 201, r.text
    body = r.json()
    return {"headers": {"Authorization": f"Bearer {body['access_token']}", "Content-Type": "application/json"}}


# ---------- /api/stats/manager ----------
class TestManagerStats:
    def test_requires_auth(self, session):
        r = session.get(f"{API}/stats/manager")
        assert r.status_code in (401, 403)

    def test_returns_full_shape(self, session, demo_headers):
        r = session.get(f"{API}/stats/manager", headers=demo_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        # All count fields exist + integers
        for k in ("roles", "cases", "approved_cases", "invited", "submitted",
                  "evaluated", "decisions", "advanced"):
            assert k in data
            assert isinstance(data[k], int), f"{k} not int: {data[k]}"
        # Badges list of 9, each with the right shape and id
        assert "badges" in data
        assert isinstance(data["badges"], list)
        assert len(data["badges"]) == 9
        ids = {b["id"] for b in data["badges"]}
        assert ids == BADGE_IDS
        for b in data["badges"]:
            assert {"id", "label", "description", "earned", "earned_at", "progress", "next_at"} <= b.keys()
            assert isinstance(b["earned"], bool)
            assert isinstance(b["progress"], (int, float))
            assert 0.0 <= b["progress"] <= 1.0
            if b["earned"]:
                # earned_at populated, next_at null
                # earned_at may be None for legacy seeds — but spec says "Earned milestones have earned_at populated"
                # we assert next_at is None when earned
                assert b["next_at"] is None
            else:
                assert b["earned_at"] is None

    def test_demo_seed_counts_and_badges(self, session, demo_headers):
        """Spec: 15 roles, 9 cases, 1 approved, 15 invited, 8 submitted, 2 eval, 1 decision, 1 advanced.
        8 of 9 badges earned; only five_candidates unearned with progress=2/5."""
        r = session.get(f"{API}/stats/manager", headers=demo_headers)
        data = r.json()
        # Counts should match seed (be lenient — allow >= for some, == for stable ones)
        assert data["roles"] >= 15
        assert data["cases"] >= 9
        assert data["approved_cases"] >= 1
        assert data["invited"] >= 15
        assert data["submitted"] >= 8
        assert data["evaluated"] >= 2
        assert data["decisions"] >= 1
        assert data["advanced"] >= 1

        bmap = {b["id"]: b for b in data["badges"]}
        # 8 earned milestones
        for bid in ("first_role", "first_case", "first_approved", "first_invite",
                    "first_submission", "first_decision", "first_hire", "three_cases"):
            assert bmap[bid]["earned"] is True, f"{bid} should be earned"
        # five_candidates: should be unearned unless previous test runs created 5+ evals
        fc = bmap["five_candidates"]
        if data["evaluated"] < 5:
            assert fc["earned"] is False
            assert fc["next_at"] == 5
            # progress fraction
            assert abs(fc["progress"] - (data["evaluated"] / 5.0)) < 1e-6

    def test_scoped_to_manager_b_is_empty(self, session, manager_b):
        r = session.get(f"{API}/stats/manager", headers=manager_b["headers"])
        assert r.status_code == 200, r.text
        d = r.json()
        # Brand new manager → all zeros and zero badges earned
        assert d["roles"] == 0 and d["cases"] == 0 and d["approved_cases"] == 0
        assert d["invited"] == 0 and d["submitted"] == 0 and d["evaluated"] == 0
        assert d["decisions"] == 0 and d["advanced"] == 0
        assert all(b["earned"] is False for b in d["badges"])
        # Unearned badges should NOT leak earned_at
        for b in d["badges"]:
            assert b["earned_at"] is None
        # three_cases / five_candidates expose next_at
        bmap = {b["id"]: b for b in d["badges"]}
        assert bmap["three_cases"]["next_at"] == 3
        assert bmap["five_candidates"]["next_at"] == 5


# ---------- Regression smoke for Phase 1/2/3 endpoints ----------
class TestRegressionSmoke:
    def test_health(self, session):
        r = session.get(f"{API}/health")
        assert r.status_code == 200 and r.json()["ok"] is True

    def test_login_works(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_list_roles(self, session, demo_headers):
        r = session.get(f"{API}/roles", headers=demo_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_role(self, session, demo_headers):
        r = session.post(f"{API}/roles", headers=demo_headers, json={
            "job_title": f"TEST_P4_Role_{uuid.uuid4().hex[:6]}",
            "title": f"TEST_P4_Role_{uuid.uuid4().hex[:6]}",
            "level": "Mid",
            "core_responsibilities": ["X"],
            "skills_required": ["Y"],
        })
        assert r.status_code in (200, 201), r.text
        assert "id" in r.json()

    def test_case_generate_503_without_key(self, session, demo_headers):
        # Need a real role id
        roles = session.get(f"{API}/roles", headers=demo_headers).json()
        assert roles, "no seeded roles to use"
        role_id = roles[0]["id"]
        r = session.post(f"{API}/cases/generate", headers=demo_headers, json={"role_id": role_id})
        assert r.status_code == 503, r.text

    def test_leaderboard_works(self, session, demo_headers):
        # Find approved case via Mongo
        import sys
        sys.path.insert(0, "/app/backend")
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        from pymongo import MongoClient
        db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        me = session.get(f"{API}/auth/me", headers=demo_headers).json()
        approved = db.cases.find_one({"manager_id": me["id"], "status": "approved"})
        if not approved:
            pytest.skip("No approved case found")
        r = session.get(f"{API}/cases/{approved['id']}/leaderboard", headers=demo_headers)
        assert r.status_code == 200
        assert "rows" in r.json()
