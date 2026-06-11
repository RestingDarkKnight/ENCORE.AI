"""ENCORE Phase A backend tests — role & case archive/restore + listing filters."""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def headers():
    """Brand new manager so we don't pollute the demo account or each other."""
    email = f"TEST_pa_{uuid.uuid4().hex[:8]}@encore.ai"
    s = requests.Session()
    r = s.post(
        f"{API}/auth/signup",
        json={"email": email, "password": "PhaseA-123!", "full_name": "Phase A", "company": "PA"},
    )
    assert r.status_code == 201, r.text
    return {
        "Authorization": f"Bearer {r.json()['access_token']}",
        "Content-Type": "application/json",
    }


def _make_role(h, title="PA Role"):
    r = requests.post(
        f"{API}/roles",
        json={
            "job_title": title,
            "industry": "Software",
            "seniority": "mid",
            "technical_skills": ["python"],
            "soft_skills": ["communication"],
            "success_criteria": "Ships clean code.",
            "common_challenges": "Legacy systems.",
            "difficulty_level": "applied",
        },
        headers=h,
    )
    assert r.status_code == 201, r.text
    return r.json()


def _make_case(h, role_id):
    """Insert a case directly via PATCH-after-create flow is not exposed; use Mongo? No — Claude isn't configured.
    Instead, write a minimal case manually through the DB-backed test? Easier: skip generation and validate
    the archive endpoints using an empty-case payload via approve-not-needed path. The case routes need a
    real case in DB. Use the mongo URL directly via PyMongo.
    """
    from motor.motor_asyncio import AsyncIOMotorClient  # noqa: PLC0415
    import asyncio  # noqa: PLC0415
    import uuid as _uuid  # noqa: PLC0415
    from datetime import datetime, timezone  # noqa: PLC0415

    mongo = os.environ["MONGO_URL"]
    dbn = os.environ["DB_NAME"]

    # Decode manager_id from JWT we sent
    import base64  # noqa: PLC0415
    import json  # noqa: PLC0415
    tok = h["Authorization"].split(" ", 1)[1]
    payload = tok.split(".")[1] + "=" * (-len(tok.split(".")[1]) % 4)
    sub = json.loads(base64.urlsafe_b64decode(payload))["sub"]

    case_id = str(_uuid.uuid4())
    doc = {
        "id": case_id,
        "role_id": role_id,
        "manager_id": sub,
        "status": "draft",
        "title": "PA Case",
        "scenario_text": "scenario",
        "sections": [{"id": "s1", "title": "S1", "intro": "i", "questions": ["q?"]}],
        "rubric": [{
            "id": "r1", "name": "Judgment", "description": "d", "weight": 100.0,
            "anchors": {"one": "1", "three": "3", "five": "5"},
        }],
        "estimated_minutes": 60,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "model_used": "test",
        "model_version": "test",
    }

    async def _ins():
        client = AsyncIOMotorClient(mongo)
        await client[dbn].cases.insert_one(doc)
        client.close()

    asyncio.get_event_loop().run_until_complete(_ins())
    return doc


# ---------- Role archive lifecycle ----------
def test_role_archive_unarchive_lifecycle(headers):
    role = _make_role(headers, "PA Archivable Role")

    # Default listing includes it
    r = requests.get(f"{API}/roles", headers=headers)
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert role["id"] in ids

    # Archive via POST endpoint
    r = requests.post(f"{API}/roles/{role['id']}/archive", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["archived"] is True

    # Default listing hides archived
    r = requests.get(f"{API}/roles", headers=headers)
    ids = [x["id"] for x in r.json()]
    assert role["id"] not in ids

    # include_archived=true returns it
    r = requests.get(f"{API}/roles", headers=headers, params={"include_archived": "true"})
    ids = [x["id"] for x in r.json()]
    assert role["id"] in ids

    # Unarchive restores it
    r = requests.post(f"{API}/roles/{role['id']}/unarchive", headers=headers)
    assert r.status_code == 200
    assert r.json()["archived"] is False

    r = requests.get(f"{API}/roles", headers=headers)
    ids = [x["id"] for x in r.json()]
    assert role["id"] in ids


def test_role_delete_is_soft_archive(headers):
    role = _make_role(headers, "PA Soft Delete Role")
    r = requests.delete(f"{API}/roles/{role['id']}", headers=headers)
    assert r.status_code == 204

    # Hidden in default list
    r = requests.get(f"{API}/roles", headers=headers)
    assert role["id"] not in [x["id"] for x in r.json()]

    # Still retrievable (no hard delete)
    r = requests.get(f"{API}/roles/{role['id']}", headers=headers)
    assert r.status_code == 200
    assert r.json()["archived"] is True


def test_role_patch_updates_core_fields(headers):
    role = _make_role(headers, "PA Editable Role")
    r = requests.patch(
        f"{API}/roles/{role['id']}",
        json={"job_title": "New Title", "success_criteria": "Now ships features fast."},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["job_title"] == "New Title"
    assert r.json()["success_criteria"] == "Now ships features fast."


# ---------- Case archive lifecycle ----------
def test_case_archive_unarchive_lifecycle(headers):
    role = _make_role(headers, "PA Case-Holding Role")
    case = _make_case(headers, role["id"])

    # Default list includes it
    r = requests.get(f"{API}/cases/role/{role['id']}", headers=headers)
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert case["id"] in ids

    # Archive
    r = requests.post(f"{API}/cases/{case['id']}/archive", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "archived"

    # Hidden by default
    r = requests.get(f"{API}/cases/role/{role['id']}", headers=headers)
    assert case["id"] not in [x["id"] for x in r.json()]

    # include_archived=true returns it
    r = requests.get(f"{API}/cases/role/{role['id']}", headers=headers, params={"include_archived": "true"})
    assert case["id"] in [x["id"] for x in r.json()]

    # Unarchive → draft
    r = requests.post(f"{API}/cases/{case['id']}/unarchive", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "draft"


def test_case_delete_is_soft_archive(headers):
    role = _make_role(headers, "PA Soft-Delete Case Role")
    case = _make_case(headers, role["id"])
    r = requests.delete(f"{API}/cases/{case['id']}", headers=headers)
    assert r.status_code == 204
    r = requests.get(f"{API}/cases/{case['id']}", headers=headers)
    assert r.status_code == 200
    assert r.json()["status"] == "archived"


def test_list_all_cases_filters_archived(headers):
    role = _make_role(headers, "PA All-Cases Role")
    visible = _make_case(headers, role["id"])
    hidden = _make_case(headers, role["id"])
    requests.delete(f"{API}/cases/{hidden['id']}", headers=headers)

    r = requests.get(f"{API}/cases", headers=headers)
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert visible["id"] in ids
    assert hidden["id"] not in ids

    r = requests.get(f"{API}/cases", headers=headers, params={"include_archived": "true"})
    ids = [x["id"] for x in r.json()]
    assert hidden["id"] in ids


# ---------- Stats reflect archive ----------
def test_stats_exclude_archived_roles_and_cases(headers):
    # Baseline
    r0 = requests.get(f"{API}/stats/manager", headers=headers).json()
    role = _make_role(headers, "PA Stats Role")
    case = _make_case(headers, role["id"])
    r1 = requests.get(f"{API}/stats/manager", headers=headers).json()
    assert r1["roles"] == r0["roles"] + 1
    assert r1["cases"] == r0["cases"] + 1

    requests.post(f"{API}/roles/{role['id']}/archive", headers=headers)
    requests.post(f"{API}/cases/{case['id']}/archive", headers=headers)
    r2 = requests.get(f"{API}/stats/manager", headers=headers).json()
    assert r2["roles"] == r0["roles"]
    assert r2["cases"] == r0["cases"]
