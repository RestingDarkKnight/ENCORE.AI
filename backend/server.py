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
from routes_auth import router as auth_router  # noqa: E402
from routes_cases import router as cases_router  # noqa: E402
from routes_roles import router as roles_router  # noqa: E402
from seed import seed_demo_manager  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("encore")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await ensure_indexes()
    await seed_demo_manager()
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
    }


api.include_router(auth_router)
api.include_router(roles_router)
api.include_router(cases_router)

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
