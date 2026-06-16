"""Knowledge corpus + embedding-driven retrieval for the Theory Researcher.

- Embeddings via OpenAI `text-embedding-3-small` (1536-dim) using the Emergent LLM key.
- Vector search: tries MongoDB Atlas `$vectorSearch` (index name `knowledge_chunks_vec`).
  Falls back transparently to an in-memory cosine scan when the Atlas index isn't
  available (small corpus, dev). Both modes return the same shape.
- An async background helper indexes approved cases + constraints + rejection notes
  into `knowledge_chunks`.
"""
from __future__ import annotations

import asyncio
import logging
import math
import os
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from db import get_db
from models import doc_strip

logger = logging.getLogger("encore.agents.retrieval")

EMBED_MODEL = os.environ.get("EMBED_MODEL", "text-embedding-3-small")
EMBED_DIM = 1536

# Lightweight in-process cache so identical query strings don't pay twice
_EMBED_CACHE: dict[str, list[float]] = {}


def _get_openai_client():
    """Lazy-import openai SDK; route through Emergent's universal gateway if configured."""
    from openai import OpenAI  # noqa: PLC0415
    api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("EMERGENT_LLM_KEY")
    # Emergent's universal endpoint understands the openai protocol
    base_url = os.environ.get("EMERGENT_LLM_BASE_URL") or ("https://integrations.emergentagent.com/llm" if os.environ.get("EMERGENT_LLM_KEY") and not os.environ.get("OPENAI_API_KEY") else None)
    if base_url:
        return OpenAI(api_key=api_key, base_url=base_url)
    return OpenAI(api_key=api_key)


async def embed_text(text: str) -> Optional[List[float]]:
    """Return the 1536-dim embedding for `text`, or None on failure (fail-soft)."""
    if not text or not text.strip():
        return None
    key = text.strip()[:8000]
    if key in _EMBED_CACHE:
        return _EMBED_CACHE[key]
    if not (os.environ.get("OPENAI_API_KEY") or os.environ.get("EMERGENT_LLM_KEY")):
        return None
    try:
        client = _get_openai_client()
        # Sync SDK — run in thread to keep the event loop free
        resp = await asyncio.to_thread(lambda: client.embeddings.create(model=EMBED_MODEL, input=key))
        vec = list(resp.data[0].embedding)
        _EMBED_CACHE[key] = vec
        return vec
    except Exception as e:  # noqa: BLE001
        logger.warning("embed_text failed: %s", e)
        return None


def _cosine(a: List[float], b: List[float]) -> float:
    s = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return s / (na * nb) if na and nb else 0.0


async def retrieve_for_theory(
    domain_key: str,
    query_text: str,
    k: int = 5,
) -> List[dict[str, Any]]:
    """Top-k corpus chunks for the given domain. Empty list cleanly if no chunks."""
    db = get_db()
    query_vec = await embed_text(query_text) if query_text else None

    # Try Atlas $vectorSearch first
    if query_vec is not None:
        try:
            pipeline = [
                {
                    "$vectorSearch": {
                        "index": os.environ.get("VECTOR_INDEX_NAME", "knowledge_chunks_vec"),
                        "path": "embedding",
                        "queryVector": query_vec,
                        "numCandidates": max(20, k * 10),
                        "limit": k,
                        "filter": {"domain_key": domain_key},
                    }
                },
                {"$project": {"_id": 0, "embedding": 0}},
            ]
            results = [doc async for doc in db.knowledge_chunks.aggregate(pipeline)]
            if results:
                return results
        except Exception as e:  # noqa: BLE001
            logger.debug("Atlas vector search unavailable, falling back: %s", e)

    # Fallback: load all chunks for domain, cosine-score in process
    candidates: List[dict[str, Any]] = []
    async for d in db.knowledge_chunks.find({"domain_key": domain_key}):
        candidates.append(doc_strip(d))
    if not candidates:
        return []
    if query_vec is None:
        # No embedding available — return most recent
        return [{k_: v for k_, v in c.items() if k_ != "embedding"} for c in candidates[:k]]

    scored: List[tuple[float, dict[str, Any]]] = []
    for c in candidates:
        emb = c.get("embedding")
        if not emb or len(emb) != len(query_vec):
            continue
        scored.append((_cosine(query_vec, emb), c))
    scored.sort(key=lambda x: x[0], reverse=True)
    out = []
    for _, c in scored[:k]:
        out.append({kk: vv for kk, vv in c.items() if kk != "embedding"})
    return out


async def index_chunk(
    *,
    source_type: str,
    source_id: str,
    domain_key: str,
    text: str,
    extra: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    """Insert one knowledge chunk with its embedding. Fail-soft: returns None if
    embedding isn't available. Caller may invoke this as a background task.
    """
    if not text or not text.strip():
        return None
    vec = await embed_text(text)
    doc = {
        "id": str(uuid.uuid4()),
        "source_type": source_type,
        "source_id": source_id,
        "domain_key": domain_key,
        "text": text.strip()[:4000],
        "embedding": vec,
        "extra": extra or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await get_db().knowledge_chunks.insert_one(doc)
    return doc


def background_index_approved_case(*, case: dict[str, Any], domain_key: str, manager_id: str) -> None:
    """Fire-and-forget indexing of an approved case's scenario, rubric, sme_notes."""
    async def _run():
        try:
            await index_chunk(source_type="approved_case", source_id=case["id"], domain_key=domain_key, text=case.get("scenario_text", ""), extra={"manager_id": manager_id, "title": case.get("title")})
            rubric_text = "\n".join(f"{r.get('name')}: {r.get('description', '')}" for r in (case.get("rubric") or []))
            if rubric_text.strip():
                await index_chunk(source_type="approved_case", source_id=case["id"], domain_key=domain_key, text=rubric_text, extra={"manager_id": manager_id, "kind": "rubric"})
            for note_key in ("sme_notes", "approval_notes"):
                if case.get(note_key):
                    await index_chunk(source_type="approved_case", source_id=case["id"], domain_key=domain_key, text=str(case[note_key]), extra={"manager_id": manager_id, "kind": note_key})
        except Exception as e:  # noqa: BLE001
            logger.warning("background_index_approved_case failed: %s", e)
    try:
        loop = asyncio.get_event_loop()
        loop.create_task(_run())
    except RuntimeError:
        # No running loop — caller will need to await directly
        asyncio.create_task(_run())
