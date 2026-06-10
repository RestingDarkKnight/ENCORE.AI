"""Domain constraints CRUD (used by the grounding layer)."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from db import get_db
from models import DomainConstraint, DomainConstraintCreate, ManagerPublic, doc_strip
from security import current_manager

router = APIRouter(prefix="/constraints", tags=["constraints"])


def _allowed(user: ManagerPublic) -> None:
    if user.role not in ("manager", "sme"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Manager or SME role required")


@router.get("", response_model=List[DomainConstraint])
async def list_constraints(domain_key: str, user: ManagerPublic = Depends(current_manager)):
    _allowed(user)
    cursor = get_db().domain_constraints.find({"domain_key": domain_key}).sort("created_at", -1)
    return [DomainConstraint(**doc_strip(d)) async for d in cursor]


@router.post("", response_model=DomainConstraint, status_code=status.HTTP_201_CREATED)
async def create_constraint(payload: DomainConstraintCreate, user: ManagerPublic = Depends(current_manager)):
    _allowed(user)
    constraint = DomainConstraint(
        domain_key=payload.domain_key.strip().lower(),
        constraint_type=payload.constraint_type,
        text=payload.text.strip(),
        added_by=user.id,
    )
    await get_db().domain_constraints.insert_one(constraint.model_dump())
    return constraint


@router.delete("/{constraint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_constraint(constraint_id: str, user: ManagerPublic = Depends(current_manager)):
    _allowed(user)
    res = await get_db().domain_constraints.delete_one({"id": constraint_id})
    if res.deleted_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Constraint not found")
    return None


@router.get("/domains")
async def list_domains(user: ManagerPublic = Depends(current_manager)):
    """List distinct domain_keys across cases and constraints — useful for the admin UI."""
    _allowed(user)
    db = get_db()
    keys: set = set()
    keys.update(await db.cases.distinct("domain_key"))
    keys.update(await db.domain_constraints.distinct("domain_key"))
    keys.discard(None)
    keys.discard("")
    return sorted(keys)
