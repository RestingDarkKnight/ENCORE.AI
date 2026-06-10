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
async def list_roles(manager: ManagerPublic = Depends(current_manager)):
    cursor = get_db().roles.find({"manager_id": manager.id}).sort("created_at", -1)
    docs = [doc_strip(d) async for d in cursor]
    for d in docs:
        d["case_count"] = await get_db().cases.count_documents({"role_id": d["id"]})
    return [Role(**d) for d in docs]


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


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(role_id: str, manager: ManagerPublic = Depends(current_manager)):
    res = await get_db().roles.delete_one({"id": role_id, "manager_id": manager.id})
    if res.deleted_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Role not found")
    await get_db().cases.delete_many({"role_id": role_id})
    return None
