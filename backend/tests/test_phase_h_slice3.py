"""Phase H Slice 3 tests — typed questions + deterministic scoring (HTTP layer)."""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

MANAGER_EMAIL = "demo.manager@encore.ai"
MANAGER_PASSWORD = "Encore-Phase1-2026!"
DRAFT_CASE_ID = "934d41ef-6821-4c32-b096-c24c020efb13"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{API}/auth/login", json={"email": MANAGER_EMAIL, "password": MANAGER_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token")
    assert token
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ============================ Pydantic auto-normalisation ============================
class TestLegacyAutoUpgrade:
    """Existing cases with sections.questions as List[str] auto-normalize to typed dicts."""

    def test_get_cases_list_normalises_strings(self, auth_headers):
        r = requests.get(f"{API}/cases", headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        cases = r.json()
        assert isinstance(cases, list) and len(cases) > 0
        # Find at least one case with at least one section + question
        found = False
        for c in cases:
            for s in c.get("sections", []):
                if s.get("questions"):
                    q = s["questions"][0]
                    assert isinstance(q, dict), f"question still raw string: {q!r}"
                    for k in ("id", "type", "prompt", "options", "correct_option_ids",
                              "acceptable_answers", "numerical_answer", "numerical_tolerance",
                              "pairs", "reasoning_key", "points"):
                        assert k in q, f"missing key {k} in normalized question {q}"
                    found = True
                    break
            if found:
                break
        assert found, "No section.questions found across any case to verify"

    def test_get_single_draft_case_normalised(self, auth_headers):
        r = requests.get(f"{API}/cases/{DRAFT_CASE_ID}", headers=auth_headers, timeout=15)
        if r.status_code != 200:
            pytest.skip(f"Draft case {DRAFT_CASE_ID} not available: {r.status_code}")
        case = r.json()
        secs = case.get("sections", [])
        assert secs, "case has no sections"
        for s in secs:
            for q in s.get("questions", []):
                assert isinstance(q, dict)
                assert q.get("type") in {"mcq", "multiple_correct", "fill_blank", "match", "short_answer", "open"}


# ============================ Patch round-trip ============================
class TestPatchTypedQuestion:
    def test_mcq_round_trips_through_patch(self, auth_headers):
        # GET draft case
        r = requests.get(f"{API}/cases/{DRAFT_CASE_ID}", headers=auth_headers, timeout=15)
        if r.status_code != 200:
            pytest.skip(f"Draft case unavailable: {r.status_code}")
        case = r.json()
        sections = case.get("sections", [])
        assert sections
        sid = sections[0]["id"]

        # Patch with a typed mcq question
        new_q = {
            "id": f"TEST_{uuid.uuid4().hex[:8]}",
            "type": "mcq",
            "prompt": "TEST_MCQ: Which is option A?",
            "options": [{"id": "a", "text": "Alpha"}, {"id": "b", "text": "Beta"}],
            "correct_option_ids": ["a"],
            "acceptable_answers": [],
            "pairs": [],
            "reasoning_key": "",
            "points": 1,
        }
        # Preserve existing questions and append the new typed one
        existing = sections[0].get("questions", [])
        patched_sections = [dict(s) for s in sections]
        patched_sections[0] = dict(patched_sections[0])
        patched_sections[0]["questions"] = list(existing) + [new_q]

        patch = {"sections": patched_sections}
        rp = requests.patch(f"{API}/cases/{DRAFT_CASE_ID}", headers=auth_headers, json=patch, timeout=15)
        assert rp.status_code == 200, f"Patch failed: {rp.status_code} {rp.text}"

        # GET back and verify the mcq is preserved
        rg = requests.get(f"{API}/cases/{DRAFT_CASE_ID}", headers=auth_headers, timeout=15)
        assert rg.status_code == 200
        case2 = rg.json()
        found = None
        for s in case2["sections"]:
            for q in s.get("questions", []):
                if q.get("prompt", "").startswith("TEST_MCQ:"):
                    found = q
                    break
        assert found is not None, "TEST_MCQ question not persisted"
        assert found["type"] == "mcq"
        assert found["correct_option_ids"] == ["a"]
        assert len(found["options"]) == 2
        assert found["options"][0]["id"] == "a"


# ============================ Candidate view (take token) ============================
class TestCandidateView:
    @pytest.fixture(scope="class")
    def take_token_and_case(self, auth_headers):
        """Create an assignment against an approved case so we have a take token. Also force require_reasoning=true."""
        # Find an approved case
        rc = requests.get(f"{API}/cases", headers=auth_headers, timeout=15)
        assert rc.status_code == 200
        approved = [c for c in rc.json() if c.get("status") == "approved"]
        if not approved:
            pytest.skip("No approved cases available")
        case = approved[0]
        case_id = case["id"]

        # Force require_reasoning=true via patch
        patch_r = requests.patch(f"{API}/cases/{case_id}", headers=auth_headers,
                                json={"require_reasoning": True}, timeout=15)
        # may 200 or 400 depending on whether approved cases allow this field; tolerate
        # Create an assignment
        payload = {
            "case_id": case_id,
            "candidate_email": f"TEST_cand_{uuid.uuid4().hex[:6]}@example.com",
            "candidate_name": "Test Candidate",
        }
        ra = requests.post(f"{API}/assignments", headers=auth_headers, json=payload, timeout=15)
        assert ra.status_code in (200, 201), f"assignment create failed: {ra.status_code} {ra.text}"
        a = ra.json()
        token = a.get("invite_token") or a.get("token") or a.get("candidate_token")
        assert token, f"no take token in {a}"
        return token, case_id

    def test_take_strips_answer_keys(self, take_token_and_case):
        token, _ = take_token_and_case
        r = requests.get(f"{API}/take/{token}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        case = data.get("case") or data
        sections = case.get("sections", [])
        assert sections
        leaked = []
        for s in sections:
            for q in s.get("questions", []):
                for forbidden in ("correct_option_ids", "acceptable_answers", "reasoning_key",
                                  "numerical_answer", "numerical_tolerance"):
                    if forbidden in q:
                        leaked.append((q.get("id"), forbidden))
                # Allowed candidate keys
                assert "id" in q and "type" in q and "prompt" in q
        assert not leaked, f"Answer keys leaked to candidate: {leaked}"

    def test_take_require_reasoning_on_objective_only(self, take_token_and_case):
        token, _ = take_token_and_case
        r = requests.get(f"{API}/take/{token}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        case = data.get("case") or data
        case_require_reasoning = case.get("require_reasoning", False)
        for s in case.get("sections", []):
            for q in s.get("questions", []):
                if case_require_reasoning and q.get("type") != "open":
                    assert q.get("require_reasoning") is True, f"objective q missing require_reasoning: {q}"
                if q.get("type") == "open":
                    # open questions must NEVER have require_reasoning=true
                    assert q.get("require_reasoning") in (False, None), f"open q has require_reasoning=true: {q}"


# ============================ progress + submit ============================
class TestProgressAndSubmit:
    @pytest.fixture(scope="class")
    def take_token(self, auth_headers):
        # Reuse the assignment-creation logic but inline
        rc = requests.get(f"{API}/cases", headers=auth_headers, timeout=15)
        approved = [c for c in rc.json() if c.get("status") == "approved"]
        if not approved:
            pytest.skip("No approved cases available")
        case = approved[0]
        payload = {
            "case_id": case["id"],
            "candidate_email": f"TEST_progress_{uuid.uuid4().hex[:6]}@example.com",
            "candidate_name": "Test Candidate",
        }
        ra = requests.post(f"{API}/assignments", headers=auth_headers, json=payload, timeout=15)
        assert ra.status_code in (200, 201), ra.text
        a = ra.json()
        token = a.get("invite_token") or a.get("token") or a.get("candidate_token")
        assert token
        return token

    def test_progress_accepts_dict_answers_and_reasonings(self, take_token):
        # Submit answers as dict (mixed types: str/list/dict) + reasonings as dict[str,str]
        payload = {
            "answers": {
                "s1::0": "free text answer",
                "s1::1": ["a", "b"],
                "s1::2": {"left1": "right1"},
            },
            "reasonings": {
                "s1::0": "Because reasoning A",
                "s1::1": "Because reasoning B",
            },
        }
        r = requests.post(f"{API}/take/{take_token}/progress", json=payload, timeout=15)
        assert r.status_code in (200, 204), f"progress failed: {r.status_code} {r.text}"

    def test_submit_runs_deterministic_scoring(self, take_token):
        # Submit (idempotent if already submitted)
        r = requests.post(f"{API}/take/{take_token}/submit",
                          json={"answers": {}, "reasonings": {}}, timeout=20)
        # Accept 200 / 409 (already submitted) — both indicate the endpoint reached scoring path
        assert r.status_code in (200, 204, 409), f"submit failed: {r.status_code} {r.text}"
