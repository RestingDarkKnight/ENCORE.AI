"""ENCORE Phase 1 backend tests — auth, roles, cases (Phase 1 spine)."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo.manager@encore.ai"
DEMO_PASSWORD = "Encore-Phase1-2026!"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def demo_token(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def manager_b_headers(session):
    email = f"TEST_b_{uuid.uuid4().hex[:8]}@encore.ai"
    r = session.post(f"{API}/auth/signup", json={
        "email": email, "password": "TestPass-123!", "full_name": "B", "company": "BCo"
    })
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


def _make_role(session, headers, **overrides):
    payload = {
        "job_title": "TEST_Senior Backend Engineer",
        "industry": "FinTech",
        "seniority": "senior",
        "technical_skills": ["Python", "FastAPI"],
        "soft_skills": ["Communication"],
        "success_criteria": "Ship reliable APIs",
        "common_challenges": "Legacy migration",
        "difficulty_level": "applied",
    }
    payload.update(overrides)
    r = session.post(f"{API}/roles", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# ---------- Health ----------
class TestHealth:
    def test_root_health(self, session):
        r = session.get(f"{API}/health")
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert d["claude_configured"] is False

    def test_cases_health_unconfigured(self, session):
        r = session.get(f"{API}/cases/health")
        assert r.status_code == 200
        d = r.json()
        assert d.get("configured") is False


# ---------- Auth ----------
class TestAuth:
    def test_login_demo_success(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["access_token"], str) and len(d["access_token"]) > 10
        assert d["manager"]["email"] == DEMO_EMAIL

    def test_login_wrong_password(self, session):
        r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrong-pass"})
        assert r.status_code == 401

    def test_me_valid_token(self, session, demo_headers):
        r = session.get(f"{API}/auth/me", headers=demo_headers)
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)

    def test_me_invalid_token(self):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer bogus.token.value"})
        assert r.status_code == 401

    def test_signup_duplicate_email(self, session):
        r = session.post(f"{API}/auth/signup", json={
            "email": DEMO_EMAIL, "password": "ValidPass-123!", "full_name": "Dup", "company": "X"
        })
        assert r.status_code == 409


# ---------- Roles (new schema) ----------
class TestRoles:
    def test_create_role_new_schema(self, session, demo_headers):
        d = _make_role(session, demo_headers, job_title="TEST_Role_Create")
        assert d["job_title"] == "TEST_Role_Create"
        assert d["industry"] == "FinTech"
        assert d["seniority"] == "senior"
        assert d["technical_skills"] == ["Python", "FastAPI"]
        assert d["soft_skills"] == ["Communication"]
        assert d["difficulty_level"] == "applied"
        assert "id" in d

    def test_patch_role_partial_update(self, session, demo_headers):
        d = _make_role(session, demo_headers, job_title="TEST_PatchMe")
        rid = d["id"]
        r = session.patch(f"{API}/roles/{rid}",
                          json={"job_title": "TEST_Patched", "difficulty_level": "expert"},
                          headers=demo_headers)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["job_title"] == "TEST_Patched"
        assert u["difficulty_level"] == "expert"
        # unchanged
        assert u["industry"] == "FinTech"

        # Persistence check
        g = session.get(f"{API}/roles/{rid}", headers=demo_headers).json()
        assert g["job_title"] == "TEST_Patched"
        assert g["difficulty_level"] == "expert"

    def test_patch_role_other_manager_404(self, session, demo_headers, manager_b_headers):
        d = _make_role(session, demo_headers, job_title="TEST_OwnedByA")
        r = session.patch(f"{API}/roles/{d['id']}", json={"job_title": "x"}, headers=manager_b_headers)
        assert r.status_code == 404

    def test_get_role_isolation(self, session, demo_headers, manager_b_headers):
        d = _make_role(session, demo_headers, job_title="TEST_IsolationRole")
        r = session.get(f"{API}/roles/{d['id']}", headers=manager_b_headers)
        assert r.status_code == 404


# ---------- Case generation 503 ----------
class TestCaseGeneration503:
    def test_generate_returns_503(self, session, demo_headers):
        role = _make_role(session, demo_headers, job_title="TEST_GenRole")
        r = session.post(f"{API}/cases/generate", json={"role_id": role["id"]}, headers=demo_headers)
        assert r.status_code == 503
        body = r.text.lower()
        assert "claude" in body or "configured" in body


# ---------- Case edit/approve/reopen using direct Mongo seeding ----------
def _seed_case(role_id: str, manager_id: str) -> str:
    """Insert a draft case directly via Mongo using backend imports."""
    import asyncio
    import sys
    sys.path.insert(0, "/app/backend")
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    from db import get_db  # noqa
    from models import Case, CaseSection, RubricDimension, RubricAnchors  # noqa

    case = Case(
        role_id=role_id,
        manager_id=manager_id,
        title="TEST_The foundry escape",
        scenario_text="A realistic scenario about an escape.",
        sections=[CaseSection(title="Investigation", intro="Look at the data.", questions=["What do you check first?"])],
        rubric=[RubricDimension(name="Judgment", description="Decisions under uncertainty",
                                weight=100.0, anchors=RubricAnchors(one="weak", three="solid", five="exceptional"))],
        estimated_minutes=60,
        model_used="claude-opus-4-8 (seeded for testing)",
    )

    async def _ins():
        await get_db().cases.insert_one(case.model_dump())

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_ins())
    finally:
        loop.close()
    return case.id


@pytest.fixture(scope="class")
def seeded_case(session, demo_headers):
    # Get demo manager id
    me = session.get(f"{API}/auth/me", headers=demo_headers).json()
    role = _make_role(session, demo_headers, job_title="TEST_CaseRole")
    cid = _seed_case(role["id"], me["id"])
    return {"case_id": cid, "role_id": role["id"], "manager_id": me["id"]}


class TestCaseLifecycle:
    def test_get_seeded_case(self, session, demo_headers, seeded_case):
        r = session.get(f"{API}/cases/{seeded_case['case_id']}", headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "draft"
        assert len(d["sections"]) == 1
        assert len(d["rubric"]) == 1
        assert d["rubric"][0]["anchors"]["one"] == "weak"
        assert d["rubric"][0]["anchors"]["three"] == "solid"
        assert d["rubric"][0]["anchors"]["five"] == "exceptional"

    def test_patch_case_title_and_scenario(self, session, demo_headers, seeded_case):
        cid = seeded_case["case_id"]
        r = session.patch(f"{API}/cases/{cid}",
                          json={"title": "TEST_Updated Title", "scenario_text": "New scenario."},
                          headers=demo_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST_Updated Title"
        assert d["scenario_text"] == "New scenario."
        # Persisted
        g = session.get(f"{API}/cases/{cid}", headers=demo_headers).json()
        assert g["title"] == "TEST_Updated Title"

    def test_regenerate_503(self, session, demo_headers, seeded_case):
        r = session.post(f"{API}/cases/{seeded_case['case_id']}/regenerate", headers=demo_headers)
        assert r.status_code == 503

    def test_regenerate_section_503(self, session, demo_headers, seeded_case):
        # Get section_id
        g = session.get(f"{API}/cases/{seeded_case['case_id']}", headers=demo_headers).json()
        sid = g["sections"][0]["id"]
        r = session.post(f"{API}/cases/{seeded_case['case_id']}/regenerate-section",
                         json={"section_id": sid}, headers=demo_headers)
        assert r.status_code == 503

    def test_approve_locks_patch(self, session, demo_headers, seeded_case):
        cid = seeded_case["case_id"]
        r = session.post(f"{API}/cases/{cid}/approve", headers=demo_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "approved"
        assert d["approved_at"] is not None

        # PATCH should now 409
        r2 = session.patch(f"{API}/cases/{cid}", json={"title": "BLOCKED"}, headers=demo_headers)
        assert r2.status_code == 409

    def test_reopen_restores_draft(self, session, demo_headers, seeded_case):
        cid = seeded_case["case_id"]
        r = session.post(f"{API}/cases/{cid}/reopen", headers=demo_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "draft"
        assert d["approved_at"] is None

        # PATCH works again
        r2 = session.patch(f"{API}/cases/{cid}", json={"title": "TEST_Reopened"}, headers=demo_headers)
        assert r2.status_code == 200
        assert r2.json()["title"] == "TEST_Reopened"

    def test_case_scope_isolation(self, session, demo_headers, manager_b_headers, seeded_case):
        cid = seeded_case["case_id"]
        # Manager B - GET 404
        assert session.get(f"{API}/cases/{cid}", headers=manager_b_headers).status_code == 404
        # PATCH 404
        assert session.patch(f"{API}/cases/{cid}", json={"title": "x"}, headers=manager_b_headers).status_code == 404
        # Approve 404
        assert session.post(f"{API}/cases/{cid}/approve", headers=manager_b_headers).status_code == 404
        # Reopen 404
        assert session.post(f"{API}/cases/{cid}/reopen", headers=manager_b_headers).status_code == 404
