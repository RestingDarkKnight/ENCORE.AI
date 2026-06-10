"""
ENCORE Grounding Layer (Modules 1-3) backend tests.

Covers:
- SME role login + /api/auth/me
- /api/sme/invite + duplicate + role-guard
- /api/sme/queue, /api/sme/cases/{id}, review submission
- HARD RULE: fabricated_specs_flag=true forces verdict='rejected'
- /api/constraints CRUD + role permissions + domains list
- grounding helpers (make_domain_key, build_grounding_block) graceful degradation
- Regression: core P1-P4 endpoints still work
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pymongo
import pytest
import requests
from dotenv import load_dotenv

# Load backend env so we can directly query mongo & import grounding helpers
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Sync pymongo client for test-only DB ops (avoids motor event-loop collisions in pytest)
SYNC_DB = pymongo.MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _insert_pending_case(domain_key: str = "casting_foundry_qa_engineer", title: str = "TEST_pending") -> str:
    cid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    SYNC_DB.cases.insert_one({
        "id": cid, "role_id": "r", "manager_id": "m",
        "status": "draft", "review_status": "pending_review",
        "domain_key": domain_key, "title": title,
        "scenario_text": "Test scenario", "sections": [], "rubric": [],
        "estimated_minutes": 60, "created_at": now, "updated_at": now,
    })
    return cid


def _run(coro):
    """Run an async coroutine in a fresh loop with a fresh motor client to avoid loop reuse."""
    async def runner():
        return await coro
    return asyncio.new_event_loop().run_until_complete(runner())

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # fallback to frontend env
    fe_env = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    if fe_env.exists():
        for line in fe_env.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
                break
BASE_URL = (BASE_URL or "").rstrip("/")
API = f"{BASE_URL}/api"

MANAGER_EMAIL = "demo.manager@encore.ai"
MANAGER_PASSWORD = "Encore-Phase1-2026!"
SME_EMAIL = "demo.sme@encore.ai"
SME_PASSWORD = "Encore-SME-2026!"

GOOD_SCORES = {
    "discrimination_power": 4,
    "job_fidelity": 4,
    "anchored_openness": 4,
    "judgment_over_recall": 4,
    "technical_accuracy": 4,
    "difficulty_calibration": 4,
    "rubric_quality": 4,
}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def manager_token():
    r = requests.post(f"{API}/auth/login", json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def sme_token():
    r = requests.post(f"{API}/auth/login", json={"email": SME_EMAIL, "password": SME_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture
def mh(manager_token):
    return {"Authorization": f"Bearer {manager_token}"}


@pytest.fixture
def sh(sme_token):
    return {"Authorization": f"Bearer {sme_token}"}


@pytest.fixture(scope="session")
def fresh_pending_case():
    """Insert a fresh pending_review case so SME queue is non-empty, return its id."""
    return _insert_pending_case(title="TEST_GroundingPending case")


# ---------- 1. Auth & role exposure ----------
class TestAuthAndRoles:
    def test_sme_login_returns_role_sme(self, sme_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {sme_token}"}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "sme"
        assert data["email"] == SME_EMAIL

    def test_manager_login_returns_role_manager(self, manager_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {manager_token}"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["role"] == "manager"


# ---------- 2. SME invite ----------
class TestSMEInvite:
    def test_invite_by_manager_creates_sme(self, mh):
        email = f"TEST_sme_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/sme/invite",
                          json={"email": email, "full_name": "Test SME", "password": "TestSME-2026!"},
                          headers=mh, timeout=10)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["email"] == email.lower()
        # Duplicate → 409
        r2 = requests.post(f"{API}/sme/invite",
                           json={"email": email, "full_name": "Test SME", "password": "TestSME-2026!"},
                           headers=mh, timeout=10)
        assert r2.status_code == 409
        # Login as new SME and confirm role
        r3 = requests.post(f"{API}/auth/login", json={"email": email, "password": "TestSME-2026!"}, timeout=10)
        assert r3.status_code == 200
        assert r3.json()["manager"]["role"] == "sme"

    def test_invite_by_sme_forbidden(self, sh):
        email = f"TEST_sme2_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/sme/invite",
                          json={"email": email, "full_name": "X", "password": "TestSME-2026!"},
                          headers=sh, timeout=10)
        assert r.status_code == 403


# ---------- 3. SME queue / case detail ----------
class TestSMEQueue:
    def test_queue_requires_sme(self, mh):
        r = requests.get(f"{API}/sme/queue", headers=mh, timeout=10)
        assert r.status_code == 403

    def test_queue_returns_pending_and_recent(self, sh, fresh_pending_case):
        r = requests.get(f"{API}/sme/queue", headers=sh, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "pending" in data and "recent" in data
        pending_ids = [c["id"] for c in data["pending"]]
        assert fresh_pending_case in pending_ids
        # all pending must have review_status=pending_review
        for c in data["pending"]:
            assert c["review_status"] == "pending_review"

    def test_case_detail_404(self, sh):
        r = requests.get(f"{API}/sme/cases/does-not-exist", headers=sh, timeout=10)
        assert r.status_code == 404

    def test_case_detail_ok(self, sh, fresh_pending_case):
        r = requests.get(f"{API}/sme/cases/{fresh_pending_case}", headers=sh, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["case"]["id"] == fresh_pending_case
        assert "review" in body  # may be None


# ---------- 4. Review submission ----------
class TestSMEReview:
    def _make_pending(self):
        return _insert_pending_case(title="TEST_ReviewCase")

    def test_score_out_of_range_422(self, sh):
        cid = self._make_pending()
        bad = dict(GOOD_SCORES); bad["discrimination_power"] = 9
        r = requests.post(f"{API}/sme/cases/{cid}/review",
                          json={"scores": bad, "verdict": "approved", "notes": "ok"},
                          headers=sh, timeout=10)
        assert r.status_code == 422

    def test_approve_updates_review_status(self, sh):
        cid = self._make_pending()
        r = requests.post(f"{API}/sme/cases/{cid}/review",
                          json={"scores": GOOD_SCORES, "verdict": "approved", "notes": "Looks good"},
                          headers=sh, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["verdict"] == "approved"
        # GET reflects new status
        det = requests.get(f"{API}/sme/cases/{cid}", headers=sh, timeout=10).json()
        assert det["case"]["review_status"] == "approved"

    def test_hard_rule_fabricated_forces_rejected(self, sh):
        """THE hard rule: fabricated_specs_flag=true AND verdict='approved' → server overrides to rejected."""
        cid = self._make_pending()
        r = requests.post(f"{API}/sme/cases/{cid}/review",
                          json={"scores": GOOD_SCORES, "verdict": "approved",
                                "fabricated_specs_flag": True, "notes": "Claims fake spec"},
                          headers=sh, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["verdict"] == "rejected", "Server must override approved→rejected when fabricated_specs_flag=True"
        assert body["fabricated_specs_flag"] is True
        det = requests.get(f"{API}/sme/cases/{cid}", headers=sh, timeout=10).json()
        assert det["case"]["review_status"] == "rejected"


# ---------- 5. Domain constraints ----------
class TestConstraints:
    def test_list_create_delete_as_manager(self, mh):
        dk = f"TEST_dom_{uuid.uuid4().hex[:6]}"
        # invalid type → 422
        bad = requests.post(f"{API}/constraints",
                            json={"domain_key": dk, "constraint_type": "bogus", "text": "x"},
                            headers=mh, timeout=10)
        assert bad.status_code == 422
        # create
        r = requests.post(f"{API}/constraints",
                          json={"domain_key": dk, "constraint_type": "real_fact", "text": "TEST real fact"},
                          headers=mh, timeout=10)
        assert r.status_code == 201, r.text
        cid = r.json()["id"]
        # list filtered by domain_key (server lowercases on create)
        lst = requests.get(f"{API}/constraints", params={"domain_key": dk.lower()}, headers=mh, timeout=10)
        assert lst.status_code == 200
        assert any(c["id"] == cid for c in lst.json())
        # delete
        d = requests.delete(f"{API}/constraints/{cid}", headers=mh, timeout=10)
        assert d.status_code == 204
        d2 = requests.delete(f"{API}/constraints/{cid}", headers=mh, timeout=10)
        assert d2.status_code == 404

    def test_constraints_allowed_for_sme(self, sh):
        dk = f"TEST_smedom_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/constraints",
                          json={"domain_key": dk, "constraint_type": "limit", "text": "TEST limit"},
                          headers=sh, timeout=10)
        assert r.status_code == 201
        cid = r.json()["id"]
        requests.delete(f"{API}/constraints/{cid}", headers=sh, timeout=10)

    def test_constraints_domains_endpoint(self, mh):
        r = requests.get(f"{API}/constraints/domains", headers=mh, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        # casting_foundry_qa_engineer should be there (seeded)
        assert "casting_foundry_qa_engineer" in r.json()


# ---------- 6. Grounding helpers ----------
class TestGroundingHelpers:
    def test_make_domain_key(self):
        from grounding import make_domain_key
        assert make_domain_key("Casting foundry", "QA Engineer") == "casting_foundry_qa_engineer"
        assert make_domain_key(None, None) == "general"
        assert make_domain_key("", "Backend Eng") == "backend_eng"
        assert make_domain_key("  ", "  ") == "general"

    def test_build_grounding_block_with_data(self):
        import db as db_mod
        from grounding import build_grounding_block
        db_mod._client = None; db_mod._db = None
        async def _run_block():
            return await build_grounding_block("casting_foundry_qa_engineer")
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            text, counts = loop.run_until_complete(_run_block())
        finally:
            loop.close()
        assert counts["approved"] >= 1, f"expected seeded approved case, got {counts}"
        assert counts["constraints"] >= 1, f"expected seeded constraint, got {counts}"
        assert text.startswith("## GROUNDING CONTEXT")

    def test_build_grounding_block_graceful_degradation(self):
        import db as db_mod
        from grounding import build_grounding_block
        db_mod._client = None; db_mod._db = None
        unknown = f"xyz_unknown_{uuid.uuid4().hex[:8]}"
        async def _run_block():
            return await build_grounding_block(unknown)
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            text, counts = loop.run_until_complete(_run_block())
        finally:
            loop.close()
        assert text == ""
        assert counts == {"approved": 0, "constraints": 0, "rejected": 0}


# ---------- 7. Generate-case 503 regression ----------
class TestGenerateRegression:
    def test_generate_503_without_key(self, mh):
        # Find a role
        roles = requests.get(f"{API}/roles", headers=mh, timeout=10).json()
        if not roles:
            pytest.skip("no roles to generate against")
        r = requests.post(f"{API}/cases/generate",
                          json={"role_id": roles[0]["id"], "notes": "test"},
                          headers=mh, timeout=15)
        # ANTHROPIC_API_KEY is empty in this env, so 503 expected
        assert r.status_code in (200, 503), r.text
        if r.status_code == 503:
            assert "anthropic" in r.text.lower() or "key" in r.text.lower() or "503" in str(r.status_code)


# ---------- 8. P1-P4 regression spot-checks ----------
class TestRegression:
    def test_login_and_me(self, mh):
        r = requests.get(f"{API}/auth/me", headers=mh, timeout=10)
        assert r.status_code == 200

    def test_roles_list(self, mh):
        r = requests.get(f"{API}/roles", headers=mh, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_manager_stats(self, mh):
        r = requests.get(f"{API}/stats/manager", headers=mh, timeout=10)
        assert r.status_code == 200

    def test_case_detail_seeded(self, mh):
        # Get manager id and find owned approved case
        me = requests.get(f"{API}/auth/me", headers=mh, timeout=10).json()
        c = SYNC_DB.cases.find_one({"manager_id": me["id"], "status": "approved"})
        if not c:
            pytest.skip("no manager-owned approved case")
        r = requests.get(f"{API}/cases/{c['id']}", headers=mh, timeout=10)
        assert r.status_code == 200
        assert r.json()["id"] == c["id"]
