"""Role CRUD routes (scoped to current manager)."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from db import get_db
from models import ManagerPublic, Role, RoleCreate, RoleUpdate, doc_strip
from security import current_manager

router = APIRouter(prefix="/roles", tags=["roles"])


@router.post("", response_model=Role, status_code=status.HTTP_201_CREATED)
async def create_role(payload: RoleCreate, manager: ManagerPublic = Depends(current_manager)):
    role = Role(manager_id=manager.id, **payload.model_dump())
    await get_db().roles.insert_one(role.model_dump())
    return role


@router.get("", response_model=List[Role])
async def list_roles(
    manager: ManagerPublic = Depends(current_manager),
    include_archived: bool = False,
):
    db = get_db()
    q = {"manager_id": manager.id}
    if not include_archived:
        q["archived"] = {"$ne": True}
    cursor = db.roles.find(q).sort("created_at", -1)
    docs = [doc_strip(d) async for d in cursor]
    if not docs:
        return []
    role_ids = [d["id"] for d in docs]
    counts = {
        row["_id"]: row["count"]
        async for row in db.cases.aggregate([
            {"$match": {"role_id": {"$in": role_ids}}},
            {"$group": {"_id": "$role_id", "count": {"$sum": 1}}},
        ])
    }
    for d in docs:
        d["case_count"] = counts.get(d["id"], 0)
        d.setdefault("archived", False)
    return [Role(**d) for d in docs]


@router.post("/{role_id}/archive", response_model=Role)
async def archive_role(role_id: str, manager: ManagerPublic = Depends(current_manager)):
    db = get_db()
    res = await db.roles.update_one(
        {"id": role_id, "manager_id": manager.id},
        {"$set": {"archived": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    return await get_role(role_id, manager)


@router.post("/{role_id}/unarchive", response_model=Role)
async def unarchive_role(role_id: str, manager: ManagerPublic = Depends(current_manager)):
    db = get_db()
    res = await db.roles.update_one(
        {"id": role_id, "manager_id": manager.id},
        {"$set": {"archived": False}},
    )
    if res.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    return await get_role(role_id, manager)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(role_id: str, manager: ManagerPublic = Depends(current_manager)):
    """Soft-archive a role (recoverable). Underlying cases remain accessible under 'All cases'."""
    res = await get_db().roles.update_one(
        {"id": role_id, "manager_id": manager.id},
        {"$set": {"archived": True}},
    )
    if res.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    return None


@router.get("/{role_id}", response_model=Role)
async def get_role(role_id: str, manager: ManagerPublic = Depends(current_manager)):
    doc = await get_db().roles.find_one({"id": role_id, "manager_id": manager.id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    doc = doc_strip(doc)
    doc["case_count"] = await get_db().cases.count_documents({"role_id": role_id})
    return Role(**doc)


@router.patch("/{role_id}", response_model=Role)
async def update_role(role_id: str, payload: RoleUpdate, manager: ManagerPublic = Depends(current_manager)):
    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not updates:
        # No-op: just return current
        return await get_role(role_id, manager)
    res = await get_db().roles.update_one(
        {"id": role_id, "manager_id": manager.id}, {"$set": updates}
    )
    if res.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    return await get_role(role_id, manager)
