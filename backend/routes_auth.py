"""Auth routes: signup, login, /me."""
from fastapi import APIRouter, Depends, HTTPException, status

from db import get_db
from models import (
    ManagerCreate,
    ManagerDB,
    ManagerLogin,
    ManagerPublic,
    TokenResponse,
    doc_strip,
)
from security import create_access_token, current_manager, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def _to_public(doc: dict) -> ManagerPublic:
    return ManagerPublic(
        id=doc["id"],
        email=doc["email"],
        full_name=doc["full_name"],
        company=doc.get("company"),
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
