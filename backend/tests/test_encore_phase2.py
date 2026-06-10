"""ENCORE Phase 2 backend tests — assignments, public take loop, audio upload, responses."""
import io
import os
import struct
import time
import uuid
import wave

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
def demo_headers(session):
    r = session.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def manager_b_headers(session):
    email = f"TEST_b_p2_{uuid.uuid4().hex[:8]}@encore.ai"
    r = session.post(f"{API}/auth/signup", json={
        "email": email, "password": "TestPass-123!", "full_name": "B", "company": "BCo"
    })
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}


def _sync_db():
    """Return a pymongo Database for direct sync seeding (avoids motor loop binding)."""
    import sys
    sys.path.insert(0, "/app/backend")
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    from pymongo import MongoClient
    client = MongoClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


def _seed_approved_case(manager_id: str) -> dict:
    """Insert an approved case directly via Mongo to support Phase 2 tests independent of Claude."""
    import sys
    sys.path.insert(0, "/app/backend")
    from models import Case, CaseSection, RubricDimension, RubricAnchors  # noqa

    case = Case(
        role_id=str(uuid.uuid4()),
        manager_id=manager_id,
        status="approved",
        title="TEST_Phase2_FoundryEscape",
        scenario_text="A simulated investigation scenario for testing.",
        sections=[
            CaseSection(title="Investigation", intro="Look at the data.",
                        questions=["What do you check first?", "What hypothesis would you test?"]),
            CaseSection(title="Trade-offs", intro="Decide.",
                        questions=["What is the trade-off?"]),
        ],
        rubric=[RubricDimension(name="Judgment", description="Decisions under uncertainty",
                                weight=100.0, anchors=RubricAnchors(one="weak", three="solid", five="exceptional"))],
        estimated_minutes=60,
        model_used="seeded-for-test",
        approved_at="2026-01-01T00:00:00+00:00",
    )
    _sync_db().cases.insert_one(case.model_dump())
    return case.model_dump()


@pytest.fixture(scope="session")
def approved_case(session, demo_headers):
    me = session.get(f"{API}/auth/me", headers=demo_headers).json()
    return _seed_approved_case(me["id"])


@pytest.fixture(scope="session")
def draft_case(session, demo_headers):
    """Seed a DRAFT case to test the 409 path."""
    import sys
    sys.path.insert(0, "/app/backend")
    from models import Case, CaseSection, RubricDimension, RubricAnchors

    me = session.get(f"{API}/auth/me", headers=demo_headers).json()
    case = Case(
        role_id=str(uuid.uuid4()),
        manager_id=me["id"],
        status="draft",
        title="TEST_Phase2_DraftCase",
        scenario_text="Draft.",
        sections=[CaseSection(title="S1", intro="i", questions=["q1"])],
        rubric=[RubricDimension(name="J", description="d", weight=100.0,
                                anchors=RubricAnchors(one="w", three="s", five="e"))],
        estimated_minutes=60,
        model_used="seeded",
    )
    _sync_db().cases.insert_one(case.model_dump())
    return case.model_dump()


def _make_wav_bytes(seconds: float = 1.0, sr: int = 16000) -> bytes:
    """Generate silent mono 16-bit PCM WAV."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        n = int(sr * seconds)
        w.writeframes(struct.pack("<" + "h" * n, *([0] * n)))
    return buf.getvalue()


# ---------- Health: transcription_configured ----------
class TestHealth:
    def test_health_transcription_configured(self, session):
        r = session.get(f"{API}/health")
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert d.get("transcription_configured") is True


# ---------- Assignment CRUD ----------
class TestAssignments:
    def test_create_assignment_on_draft_returns_409(self, session, demo_headers, draft_case):
        r = session.post(f"{API}/assignments", headers=demo_headers, json={
            "case_id": draft_case["id"],
            "candidate_email": "TEST_cand1@example.com",
            "candidate_name": "Cand One",
            "time_limit_minutes": 60,
        })
        assert r.status_code == 409, r.text
        assert "approve" in r.text.lower()

    def test_create_assignment_on_approved_201(self, session, demo_headers, approved_case):
        r = session.post(f"{API}/assignments", headers=demo_headers, json={
            "case_id": approved_case["id"],
            "candidate_email": "TEST_p2_cand@example.com",
            "candidate_name": "Test Candidate",
            "time_limit_minutes": 90,
        })
        assert r.status_code == 201, r.text
        a = r.json()
        assert a["case_id"] == approved_case["id"]
        assert a["status"] == "sent"
        assert a["time_limit_minutes"] == 90
        assert len(a["token"]) == 32
        assert all(c in "0123456789abcdef" for c in a["token"])
        assert "id" in a

    def test_time_limit_default_180(self, session, demo_headers, approved_case):
        r = session.post(f"{API}/assignments", headers=demo_headers, json={
            "case_id": approved_case["id"],
            "candidate_email": "TEST_default_time@example.com",
        })
        assert r.status_code == 201
        assert r.json()["time_limit_minutes"] == 180

    def test_time_limit_out_of_range(self, session, demo_headers, approved_case):
        r = session.post(f"{API}/assignments", headers=demo_headers, json={
            "case_id": approved_case["id"],
            "candidate_email": "TEST_oor@example.com",
            "time_limit_minutes": 5,
        })
        assert r.status_code == 422
        r2 = session.post(f"{API}/assignments", headers=demo_headers, json={
            "case_id": approved_case["id"],
            "candidate_email": "TEST_oor2@example.com",
            "time_limit_minutes": 600,
        })
        assert r2.status_code == 422

    def test_list_assignments_for_case_newest_first(self, session, demo_headers, approved_case):
        # ensure at least 2
        for i in range(2):
            session.post(f"{API}/assignments", headers=demo_headers, json={
                "case_id": approved_case["id"],
                "candidate_email": f"TEST_list_{i}_{uuid.uuid4().hex[:6]}@e.com",
            })
        r = session.get(f"{API}/assignments/case/{approved_case['id']}", headers=demo_headers)
        assert r.status_code == 200
        lst = r.json()
        assert isinstance(lst, list) and len(lst) >= 2
        # newest first → created_at descending
        for i in range(len(lst) - 1):
            assert lst[i]["created_at"] >= lst[i + 1]["created_at"]

    def test_list_assignments_cross_manager_404(self, session, manager_b_headers, approved_case):
        r = session.get(f"{API}/assignments/case/{approved_case['id']}", headers=manager_b_headers)
        assert r.status_code == 404

    def test_delete_assignment_cross_manager_404_then_self_204(self, session, demo_headers, manager_b_headers, approved_case):
        c = session.post(f"{API}/assignments", headers=demo_headers, json={
            "case_id": approved_case["id"],
            "candidate_email": "TEST_del@e.com",
        }).json()
        # cross-manager 404
        r = session.delete(f"{API}/assignments/{c['id']}", headers=manager_b_headers)
        assert r.status_code == 404
        # self 204
        r2 = session.delete(f"{API}/assignments/{c['id']}", headers=demo_headers)
        assert r2.status_code == 204
        # Already deleted → 404
        r3 = session.delete(f"{API}/assignments/{c['id']}", headers=demo_headers)
        assert r3.status_code == 404


# ---------- Public take loop ----------
@pytest.fixture(scope="class")
def fresh_assignment(session, demo_headers, approved_case):
    r = session.post(f"{API}/assignments", headers=demo_headers, json={
        "case_id": approved_case["id"],
        "candidate_email": "TEST_takeflow@example.com",
        "candidate_name": "Takeflow Candidate",
        "time_limit_minutes": 45,
    })
    assert r.status_code == 201
    return r.json()


class TestTakeFlow:
    def test_get_take_bad_token_404(self, session):
        r = session.get(f"{API}/take/nonexistent_garbage_token")
        assert r.status_code == 404

    def test_get_take_strips_rubric_and_flips_to_in_progress(self, session, demo_headers, fresh_assignment):
        token = fresh_assignment["token"]
        r = requests.get(f"{API}/take/{token}")
        assert r.status_code == 200, r.text
        d = r.json()
        # No rubric exposed
        assert "rubric" not in d.get("case", {})
        # case payload
        assert d["case"]["title"].startswith("TEST_Phase2")
        assert d["candidate_email"] == "TEST_takeflow@example.com"
        # status flipped
        assert d["status"] == "in_progress"
        assert d["started_at"] is not None
        # Verify on manager side too
        a = session.get(f"{API}/assignments/{fresh_assignment['id']}", headers=demo_headers).json()
        assert a["status"] == "in_progress"

    def test_progress_autosave_204(self, session, fresh_assignment, approved_case):
        token = fresh_assignment["token"]
        s_id = approved_case["sections"][0]["id"]
        key = f"{s_id}::0"
        r = requests.post(f"{API}/take/{token}/progress",
                          json={"answers": {key: "my draft answer"}, "honor_code_accepted": True})
        assert r.status_code == 204
        # GET reflects saved answer
        d = requests.get(f"{API}/take/{token}").json()
        assert d["saved_answers"].get(key) == "my draft answer"
        assert d["honor_code_accepted"] is True

    def test_audio_unknown_section_400(self, session, fresh_assignment):
        token = fresh_assignment["token"]
        wav = _make_wav_bytes(0.5)
        r = requests.post(
            f"{API}/take/{token}/audio",
            data={"section_id": "no-such-section", "question_index": 0},
            files={"file": ("clip.wav", wav, "audio/wav")},
        )
        assert r.status_code == 400

    def test_audio_empty_file_400(self, session, fresh_assignment, approved_case):
        token = fresh_assignment["token"]
        s_id = approved_case["sections"][0]["id"]
        r = requests.post(
            f"{API}/take/{token}/audio",
            data={"section_id": s_id, "question_index": 0},
            files={"file": ("empty.wav", b"", "audio/wav")},
        )
        assert r.status_code == 400

    def test_audio_upload_succeeds_and_storage_path_prefix(self, session, fresh_assignment, approved_case, demo_headers):
        token = fresh_assignment["token"]
        s_id = approved_case["sections"][0]["id"]
        wav = _make_wav_bytes(1.0)
        r = requests.post(
            f"{API}/take/{token}/audio",
            data={"section_id": s_id, "question_index": 0},
            files={"file": ("clip.wav", wav, "audio/wav")},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["storage_path"].startswith(f"encore/audio/{fresh_assignment['id']}/{s_id}/")
        assert body["size"] > 0

        # Take view should expose saved_audio
        tv = requests.get(f"{API}/take/{token}").json()
        key = f"{s_id}::0"
        assert key in tv["saved_audio"]
        assert tv["saved_audio"][key]["storage_path"].startswith("encore/audio/")

        # Stream audio (public token route)
        st = requests.get(f"{API}/take/{token}/audio/{s_id}/0")
        assert st.status_code == 200
        assert len(st.content) > 0

        # Wait briefly for background transcription; don't fail if empty (silent WAV)
        time.sleep(8)
        rv = session.get(f"{API}/responses/by-assignment/{fresh_assignment['id']}",
                         headers=demo_headers).json()
        assert key in rv["audio"]
        # transcript may be None for silent WAV — that's acceptable per spec

    def test_submit_requires_honor_code(self, session, fresh_assignment):
        token = fresh_assignment["token"]
        r = requests.post(f"{API}/take/{token}/submit", json={"answers": {}, "honor_code_accepted": False})
        assert r.status_code == 400

    def test_submit_success_then_409(self, session, demo_headers, fresh_assignment, approved_case):
        token = fresh_assignment["token"]
        s_id = approved_case["sections"][0]["id"]
        r = requests.post(f"{API}/take/{token}/submit",
                          json={"answers": {f"{s_id}::0": "final"}, "honor_code_accepted": True,
                                "time_taken_seconds": 120})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "submitted"
        assert d["submitted_at"] is not None

        # Manager-side response
        rv = session.get(f"{API}/responses/by-assignment/{fresh_assignment['id']}",
                         headers=demo_headers).json()
        assert rv["submitted_at"] is not None
        assert rv["time_taken_seconds"] == 120

        # Second submit 409
        r2 = requests.post(f"{API}/take/{token}/submit",
                           json={"answers": {}, "honor_code_accepted": True})
        assert r2.status_code == 409

        # progress 409 after submit
        r3 = requests.post(f"{API}/take/{token}/progress",
                           json={"answers": {f"{s_id}::0": "late"}, "honor_code_accepted": True})
        assert r3.status_code == 409

        # audio 409 after submit
        wav = _make_wav_bytes(0.5)
        r4 = requests.post(f"{API}/take/{token}/audio",
                           data={"section_id": s_id, "question_index": 0},
                           files={"file": ("late.wav", wav, "audio/wav")})
        assert r4.status_code == 409


# ---------- Responses manager-side ----------
class TestResponsesManager:
    def test_response_cross_manager_404(self, session, manager_b_headers, demo_headers, approved_case):
        # Create one fresh assignment, do a quick progress save, then check cross-manager 404
        a = session.post(f"{API}/assignments", headers=demo_headers, json={
            "case_id": approved_case["id"], "candidate_email": "TEST_xm@e.com",
        }).json()
        token = a["token"]
        s_id = approved_case["sections"][0]["id"]
        requests.get(f"{API}/take/{token}")
        requests.post(f"{API}/take/{token}/progress",
                      json={"answers": {f"{s_id}::0": "answering"}, "honor_code_accepted": True})

        # Cross-manager
        r = session.get(f"{API}/responses/by-assignment/{a['id']}", headers=manager_b_headers)
        assert r.status_code == 404
        # Own manager
        r2 = session.get(f"{API}/responses/by-assignment/{a['id']}", headers=demo_headers)
        assert r2.status_code == 200
        assert r2.json()["answers"].get(f"{s_id}::0") == "answering"

    def test_response_audio_stream_jwt(self, session, demo_headers, manager_b_headers, approved_case):
        a = session.post(f"{API}/assignments", headers=demo_headers, json={
            "case_id": approved_case["id"], "candidate_email": "TEST_aud@e.com",
        }).json()
        token = a["token"]
        s_id = approved_case["sections"][0]["id"]
        requests.get(f"{API}/take/{token}")
        wav = _make_wav_bytes(1.0)
        up = requests.post(f"{API}/take/{token}/audio",
                           data={"section_id": s_id, "question_index": 0},
                           files={"file": ("c.wav", wav, "audio/wav")})
        assert up.status_code == 200

        r = session.get(f"{API}/responses/by-assignment/{a['id']}/audio/{s_id}/0",
                        headers=demo_headers)
        assert r.status_code == 200
        assert len(r.content) > 0

        r2 = session.get(f"{API}/responses/by-assignment/{a['id']}/audio/{s_id}/0",
                         headers=manager_b_headers)
        assert r2.status_code == 404
