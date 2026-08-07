"""Auth routes: signup, login, /me, Google OAuth session exchange."""
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status

from db import get_db
from models import (
    GoogleSessionRequest,
    ManagerCreate,
    ManagerDB,
    ManagerLogin,
    ManagerPublic,
    TokenResponse,
    doc_strip,
)
from security import create_access_token, current_manager, hash_password, verify_password

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

# Emergent-managed Google Auth session-data endpoint. Never expose to the client.
EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


def _to_public(doc: dict) -> ManagerPublic:
    return ManagerPublic(
        id=doc["id"],
        email=doc["email"],
        full_name=doc["full_name"],
        company=doc.get("company"),
        role=doc.get("role", "manager"),
        created_at=doc["created_at"],
    )


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: ManagerCreate):
    db = get_db()
    existing = await db.managers.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    manager = ManagerDB(
        email=payload.email.lower(),
        full_name=payload.full_name,
        company=payload.company,
        password_hash=hash_password(payload.password),
    )
    await db.managers.insert_one(manager.model_dump())
    token = create_access_token(manager.id)
    return TokenResponse(access_token=token, manager=_to_public(manager.model_dump()))


@router.post("/login", response_model=TokenResponse)
async def login(payload: ManagerLogin):
    db = get_db()
    doc = await db.managers.find_one({"email": payload.email.lower()})
    if not doc or not verify_password(payload.password, doc["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    doc = doc_strip(doc)
    token = create_access_token(doc["id"])
    return TokenResponse(access_token=token, manager=_to_public(doc))


@router.get("/me", response_model=ManagerPublic)
async def me(manager: ManagerPublic = Depends(current_manager)):
    return manager


# ---------- Emergent-managed Google Auth ----------
# REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
@router.post("/google/session", response_model=TokenResponse)
async def google_session_exchange(payload: GoogleSessionRequest):
    """Exchange an Emergent Auth `session_id` (from the URL fragment after Google login)
    for a first-party JWT that behaves identically to a password login.

    Flow:
      1. Frontend receives `#session_id=<sid>` at `/auth/callback`.
      2. Frontend POSTs `{ session_id }` here.
      3. We call Emergent's /session-data with the id to get {email, name, ...}.
      4. Upsert a manager document keyed by email. Return our JWT.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(EMERGENT_AUTH_SESSION_URL, headers={"X-Session-ID": payload.session_id})
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to reach Emergent Auth")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Auth provider unreachable: {exc}")

    if r.status_code != 200:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired Google session.")
    data = r.json()
    email = (data.get("email") or "").lower().strip()
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    if not email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Auth response missing email.")

    db = get_db()
    now_iso = datetime.now(timezone.utc).isoformat()
    existing = await db.managers.find_one({"email": email})
    if existing:
        # Update profile bits + flip provider if the account was originally password-only
        updates = {"picture": picture} if picture else {}
        if not existing.get("auth_provider"):
            updates["auth_provider"] = "google"
        if updates:
            await db.managers.update_one({"id": existing["id"]}, {"$set": updates})
        doc = doc_strip({**existing, **updates})
    else:
        new_manager = ManagerDB(
            email=email,
            full_name=name,
            company=None,
            password_hash=None,
            auth_provider="google",
            picture=picture,
        )
        await db.managers.insert_one(new_manager.model_dump())
        doc = new_manager.model_dump()
        logger.info("Created new manager via Google Auth: %s", email)
    _ = now_iso  # tolerate unused
    token = create_access_token(doc["id"])
    return TokenResponse(access_token=token, manager=_to_public(doc))
