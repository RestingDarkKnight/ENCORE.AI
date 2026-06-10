"""JWT + password hashing utilities."""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from db import get_db
from models import ManagerPublic, doc_strip

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(manager_id: str) -> str:
    secret = os.environ["JWT_SECRET"]
    algo = os.environ.get("JWT_ALGORITHM", "HS256")
    minutes = int(os.environ.get("JWT_EXPIRY_MINUTES", "1440"))
    payload = {
        "sub": manager_id,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes),
    }
    return jwt.encode(payload, secret, algorithm=algo)


def decode_token(token: str) -> Optional[str]:
    secret = os.environ["JWT_SECRET"]
    algo = os.environ.get("JWT_ALGORITHM", "HS256")
    try:
        payload = jwt.decode(token, secret, algorithms=[algo])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


async def current_manager(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> ManagerPublic:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    manager_id = decode_token(credentials.credentials)
    if not manager_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    doc = await get_db().managers.find_one({"id": manager_id})
    if not doc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Manager not found")
    doc = doc_strip(doc)
    return ManagerPublic(**{k: doc[k] for k in ("id", "email", "full_name", "company", "created_at") if k in doc})
