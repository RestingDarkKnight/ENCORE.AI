"""Manager-side assignment routes."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from db import get_db
from models import Assignment, AssignmentCreate, ManagerPublic, doc_strip
from security import current_manager

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.post("", response_model=Assignment, status_code=status.HTTP_201_CREATED)
async def create_assignment(payload: AssignmentCreate, manager: ManagerPublic = Depends(current_manager)):
    case = await get_db().cases.find_one({"id": payload.case_id, "manager_id": manager.id})
    if not case:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    if case.get("status") != "approved":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only approved cases can be assigned. Approve the case first.")
    assignment = Assignment(
        case_id=payload.case_id,
        manager_id=manager.id,
        candidate_email=payload.candidate_email,
        candidate_name=payload.candidate_name,
        time_limit_minutes=payload.time_limit_minutes,
    )
    await get_db().assignments.insert_one(assignment.model_dump())
    return assignment


@router.get("/case/{case_id}", response_model=List[Assignment])
async def list_assignments_for_case(case_id: str, manager: ManagerPublic = Depends(current_manager)):
    case = await get_db().cases.find_one({"id": case_id, "manager_id": manager.id})
    if not case:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Case not found")
    cursor = get_db().assignments.find({"case_id": case_id}).sort("created_at", -1)
    return [Assignment(**doc_strip(d)) async for d in cursor]


@router.get("/{assignment_id}", response_model=Assignment)
async def get_assignment(assignment_id: str, manager: ManagerPublic = Depends(current_manager)):
    doc = await get_db().assignments.find_one({"id": assignment_id, "manager_id": manager.id})
    if not doc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    return Assignment(**doc_strip(doc))


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(assignment_id: str, manager: ManagerPublic = Depends(current_manager)):
    res = await get_db().assignments.delete_one({"id": assignment_id, "manager_id": manager.id})
    if res.deleted_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    return None
