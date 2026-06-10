"""Idempotent seed for the demo manager account."""
import asyncio
import logging
import os

from db import get_db
from models import ManagerDB
from security import hash_password

logger = logging.getLogger(__name__)

DEMO_EMAIL = os.environ.get("DEMO_MANAGER_EMAIL", "demo.manager@encore.ai")
DEMO_PASSWORD = os.environ.get("DEMO_MANAGER_PASSWORD", "Encore-Phase1-2026!")
DEMO_NAME = os.environ.get("DEMO_MANAGER_NAME", "Demo Manager")

SME_EMAIL = os.environ.get("DEMO_SME_EMAIL", "demo.sme@encore.ai")
SME_PASSWORD = os.environ.get("DEMO_SME_PASSWORD", "Encore-SME-2026!")
SME_NAME = os.environ.get("DEMO_SME_NAME", "Demo Reviewer")


async def seed_demo_manager() -> None:
    db = get_db()
    if not await db.managers.find_one({"email": DEMO_EMAIL.lower()}):
        manager = ManagerDB(
            email=DEMO_EMAIL.lower(),
            full_name=DEMO_NAME,
            company="ENCORE Test Co",
            password_hash=hash_password(DEMO_PASSWORD),
        )
        await db.managers.insert_one(manager.model_dump())
        logger.info("Seeded demo manager: %s", DEMO_EMAIL)
    else:
        logger.info("Demo manager already exists: %s", DEMO_EMAIL)

    if not await db.managers.find_one({"email": SME_EMAIL.lower()}):
        sme = ManagerDB(
            email=SME_EMAIL.lower(),
            full_name=SME_NAME,
            company="ENCORE Test Co",
            role="sme",
            password_hash=hash_password(SME_PASSWORD),
        )
        await db.managers.insert_one(sme.model_dump())
        logger.info("Seeded demo SME: %s", SME_EMAIL)
    else:
        logger.info("Demo SME already exists: %s", SME_EMAIL)


if __name__ == "__main__":
    from dotenv import load_dotenv
    from pathlib import Path

    load_dotenv(Path(__file__).parent / ".env")
    asyncio.run(seed_demo_manager())
