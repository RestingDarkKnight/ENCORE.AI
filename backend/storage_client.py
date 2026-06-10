"""Emergent Object Storage helpers (used for candidate audio files).

Per the integration playbook:
- /init obtains a session-scoped storage_key (cached at module level).
- PUT /objects/{path} uploads bytes; GET /objects/{path} downloads.
- No delete/rename API — DB is the source of truth (soft delete via flags).
"""
from __future__ import annotations

import logging
import os
from typing import Optional, Tuple

import requests

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "encore"

_storage_key: Optional[str] = None


def _emergent_key() -> str:
    key = os.environ.get("EMERGENT_LLM_KEY", "").strip()
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY is not configured")
    return key


def init_storage() -> str:
    """Call once at startup. Returns a session-scoped storage_key."""
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(
        f"{STORAGE_URL}/init",
        json={"emergent_key": _emergent_key()},
        timeout=30,
    )
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    logger.info("Emergent storage initialised")
    return _storage_key


def _key() -> str:
    return _storage_key or init_storage()


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload bytes. Returns {"path": "...", "size": int, "etag": "..."}."""
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": _key(), "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 403:
        # Storage key may have expired — refresh once and retry
        global _storage_key
        _storage_key = None
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": _key(), "Content-Type": content_type},
            data=data,
            timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> Tuple[bytes, str]:
    """Download bytes. Returns (content, content_type)."""
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": _key()},
        timeout=60,
    )
    if resp.status_code == 403:
        global _storage_key
        _storage_key = None
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": _key()},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
