"""MongoDB connection and index setup."""
import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return _client


def get_db() -> AsyncIOMotorDatabase:
    global _db
    if _db is None:
        _db = get_client()[os.environ["DB_NAME"]]
    return _db


async def ensure_indexes() -> None:
    db = get_db()
    # Managers - unique email
    await db.managers.create_index("email", unique=True)
    # Roles - by manager
    await db.roles.create_index("manager_id")
    await db.roles.create_index([("manager_id", 1), ("created_at", -1)])
    # Cases - by role
    await db.cases.create_index("role_id")
    await db.cases.create_index([("role_id", 1), ("created_at", -1)])
    # Assignments - by case + by candidate token
    await db.assignments.create_index("case_id")
    await db.assignments.create_index("manager_id")
    await db.assignments.create_index("token", unique=True)
    # Responses - by assignment
    await db.responses.create_index("assignment_id", unique=True)
    # Evaluations - by response
    await db.evaluations.create_index("response_id", unique=True)
    await db.evaluations.create_index("case_id")
    # Decisions - by response (one current decision per response)
    await db.decisions.create_index("response_id", unique=True)
    await db.decisions.create_index("manager_id")
    # Hire outcomes — at most one per (assignment, window)
    await db.hire_outcomes.create_index([("assignment_id", 1), ("window", 1)], unique=True)
    await db.hire_outcomes.create_index("manager_id")


def close_client() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
