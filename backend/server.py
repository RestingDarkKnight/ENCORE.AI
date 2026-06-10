"""ENCORE FastAPI entrypoint."""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from db import close_client, ensure_indexes  # noqa: E402
from routes_assignments import router as assignments_router  # noqa: E402
from routes_auth import router as auth_router  # noqa: E402
from routes_cases import router as cases_router  # noqa: E402
from routes_constraints import router as constraints_router  # noqa: E402
from routes_evaluation import router as evaluation_router  # noqa: E402
from routes_responses import router as responses_router  # noqa: E402
from routes_roles import router as roles_router  # noqa: E402
from routes_sme import router as sme_router  # noqa: E402
from routes_stats import router as stats_router  # noqa: E402
from routes_take import router as take_router  # noqa: E402
from seed import seed_demo_manager  # noqa: E402
from storage_client import init_storage  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("encore")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()
    await seed_demo_manager()
    # Best-effort storage init — don't crash the app if it fails
    try:
        init_storage()
    except Exception as e:  # noqa: BLE001
        logger.warning("Object storage init failed (will retry on first use): %s", e)
    logger.info("ENCORE backend ready (model=%s)", os.environ.get("CLAUDE_MODEL", "claude-opus-4-8"))
    yield
    close_client()


app = FastAPI(title="ENCORE API", lifespan=lifespan)

api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"service": "ENCORE API", "ok": True}


@api.get("/health")
async def health():
    return {
        "ok": True,
        "model": os.environ.get("CLAUDE_MODEL", "claude-opus-4-8"),
        "claude_configured": bool(os.environ.get("ANTHROPIC_API_KEY", "").strip()),
        "transcription_configured": bool(os.environ.get("EMERGENT_LLM_KEY", "").strip()),
    }


api.include_router(auth_router)
api.include_router(roles_router)
api.include_router(cases_router)
api.include_router(assignments_router)
api.include_router(responses_router)
api.include_router(evaluation_router)
api.include_router(stats_router)
api.include_router(sme_router)
api.include_router(constraints_router)
api.include_router(take_router)

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
