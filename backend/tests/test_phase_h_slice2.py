"""Phase H Slice 2 tests — assessment_mode + require_reasoning on cases & workflows."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

MANAGER_EMAIL = "demo.manager@encore.ai"
MANAGER_PASSWORD = "Encore-Phase1-2026!"
SEED_ROLE_ID = "d0ac3e26-0ec5-4802-8b40-158fa6f891c1"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{API}/auth/login", json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    assert token
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def role_id(auth_headers):
    # Verify the seed role exists for this manager; fall back to creating one if not
    r = requests.get(f"{API}/roles/{SEED_ROLE_ID}", headers=auth_headers, timeout=10)
    if r.status_code == 200:
        return SEED_ROLE_ID
    # else create a TEST_ role
    payload = {
        "job_title": f"TEST_h2 Senior Engineer {uuid.uuid4().hex[:6]}",
        "industry": "fintech",
        "seniority": "senior",
        "difficulty_level": "applied",
        "technical_skills": ["python"],
        "soft_skills": ["judgment"],
        "success_criteria": "ships clean code",
        "common_challenges": "ambiguous specs",
    }
    rr = requests.post(f"{API}/roles", headers=auth_headers, json=payload, timeout=10)
    assert rr.status_code in (200, 201), rr.text
    return rr.json()["id"]


# ============================ Case generation schema ============================
class TestCaseGenerateSchema:
    def test_generate_accepts_mode_and_reasoning(self, auth_headers, role_id):
        # ANTHROPIC_API_KEY empty => 503 expected; we only verify schema acceptance
        body = {
            "role_id": role_id,
            "notes": "test",
            "assessment_mode": "screening",
            "require_reasoning": True,
        }
        r = requests.post(f"{API}/cases/generate", headers=auth_headers, json=body, timeout=20)
        # NOT a 422 validation error — that's the assertion
        assert r.status_code != 422, f"Schema rejected new fields: {r.text}"
        # Should be 503 (claude not configured) per env setup
        assert r.status_code in (503, 200, 201, 502), f"Unexpected status: {r.status_code} {r.text}"
        if r.status_code == 503:
            assert "claude" in r.text.lower() or "anthropic" in r.text.lower()

    def test_generate_with_default_values(self, auth_headers, role_id):
        # Sending only role_id - defaults should be applied (interview/false)
        body = {"role_id": role_id}
        r = requests.post(f"{API}/cases/generate", headers=auth_headers, json=body, timeout=20)
        assert r.status_code != 422, f"Defaults not honored: {r.text}"


# ============================ Workflow persistence ============================
class TestWorkflowPersistence:
    def test_workflow_persists_mode_and_reasoning(self, auth_headers, role_id):
        body = {"role_id": role_id, "assessment_mode": "screening", "require_reasoning": True}
        r = requests.post(f"{API}/workflows", headers=auth_headers, json=body, timeout=15)
        assert r.status_code == 201, r.text
        wf = r.json()
        assert wf["assessment_mode"] == "screening"
        assert wf["require_reasoning"] is True
        wf_id = wf["id"]

        # GET verifies persistence
        g = requests.get(f"{API}/workflows/{wf_id}", headers=auth_headers, timeout=10)
        assert g.status_code == 200
        gwf = g.json()
        assert gwf["assessment_mode"] == "screening"
        assert gwf["require_reasoning"] is True

    def test_workflow_takehome_no_reasoning(self, auth_headers, role_id):
        body = {"role_id": role_id, "assessment_mode": "takehome", "require_reasoning": False}
        r = requests.post(f"{API}/workflows", headers=auth_headers, json=body, timeout=15)
        assert r.status_code == 201
        wf = r.json()
        assert wf["assessment_mode"] == "takehome"
        assert wf["require_reasoning"] is False

    def test_workflow_defaults_when_omitted(self, auth_headers, role_id):
        # Omit assessment_mode and require_reasoning entirely
        body = {"role_id": role_id}
        r = requests.post(f"{API}/workflows", headers=auth_headers, json=body, timeout=15)
        assert r.status_code == 201, r.text
        wf = r.json()
        assert wf["assessment_mode"] == "interview", f"Expected default interview, got {wf.get('assessment_mode')}"
        assert wf["require_reasoning"] is False, f"Expected default False, got {wf.get('require_reasoning')}"

        # Verify via GET
        g = requests.get(f"{API}/workflows/{wf['id']}", headers=auth_headers, timeout=10)
        assert g.json()["assessment_mode"] == "interview"
        assert g.json()["require_reasoning"] is False

    def test_workflow_invalid_mode_coerced(self, auth_headers, role_id):
        body = {"role_id": role_id, "assessment_mode": "lol", "require_reasoning": False}
        r = requests.post(f"{API}/workflows", headers=auth_headers, json=body, timeout=15)
        assert r.status_code == 201, r.text
        wf = r.json()
        assert wf["assessment_mode"] == "interview", f"Invalid mode 'lol' should coerce to 'interview', got {wf['assessment_mode']}"

    def test_list_workflows_by_role_includes_mode_fields(self, auth_headers, role_id):
        r = requests.get(f"{API}/workflows/by-role/{role_id}", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        lst = r.json()
        assert isinstance(lst, list)
        assert len(lst) > 0, "Expected at least one workflow (from previous tests)"
        for wf in lst:
            assert "assessment_mode" in wf, f"Missing assessment_mode: {wf}"
            assert "require_reasoning" in wf, f"Missing require_reasoning: {wf}"
            assert wf["assessment_mode"] in ("screening", "takehome", "interview")


# ============================ Regression: existing endpoints still work ============================
class TestRegression:
    def test_list_cases_for_role(self, auth_headers, role_id):
        r = requests.get(f"{API}/cases/role/{role_id}", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_all_cases(self, auth_headers):
        r = requests.get(f"{API}/cases", headers=auth_headers, timeout=10)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stats_manager(self, auth_headers):
        r = requests.get(f"{API}/stats/manager", headers=auth_headers, timeout=10)
        assert r.status_code == 200

    def test_roles_list(self, auth_headers):
        r = requests.get(f"{API}/roles", headers=auth_headers, timeout=10)
        assert r.status_code == 200
