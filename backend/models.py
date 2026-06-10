"""Pydantic models for ENCORE.

All documents use UUID strings (no ObjectId).
Datetimes are stored as ISO strings.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


def _new_id() -> str:
    return str(uuid.uuid4())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Auth / Manager (users with role=manager) ----------
class ManagerBase(BaseModel):
    model_config = ConfigDict(extra="ignore")
    email: EmailStr
    full_name: str
    company: Optional[str] = None


class ManagerCreate(ManagerBase):
    password: str = Field(min_length=8, max_length=128)


class ManagerLogin(BaseModel):
    email: EmailStr
    password: str


class ManagerPublic(ManagerBase):
    id: str
    role: Literal["manager", "candidate"] = "manager"
    created_at: str


class ManagerDB(ManagerBase):
    id: str = Field(default_factory=_new_id)
    role: Literal["manager", "candidate"] = "manager"
    password_hash: str
    created_at: str = Field(default_factory=_now_iso)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    manager: ManagerPublic


# ---------- Role ----------
Seniority = Literal["junior", "mid", "senior", "lead"]
Difficulty = Literal["foundational", "applied", "advanced", "expert"]


class RoleCreate(BaseModel):
    job_title: str = Field(min_length=1, max_length=200)
    industry: str = Field(default="", max_length=200)
    seniority: Seniority = "mid"
    technical_skills: List[str] = Field(default_factory=list)
    soft_skills: List[str] = Field(default_factory=list)
    success_criteria: str = Field(default="", max_length=2000)
    common_challenges: str = Field(default="", max_length=2000)
    difficulty_level: Difficulty = "applied"


class RoleUpdate(BaseModel):
    job_title: Optional[str] = None
    industry: Optional[str] = None
    seniority: Optional[Seniority] = None
    technical_skills: Optional[List[str]] = None
    soft_skills: Optional[List[str]] = None
    success_criteria: Optional[str] = None
    common_challenges: Optional[str] = None
    difficulty_level: Optional[Difficulty] = None


class Role(RoleCreate):
    id: str = Field(default_factory=_new_id)
    manager_id: str
    created_at: str = Field(default_factory=_now_iso)
    case_count: int = 0


# ---------- Case Study ----------
class RubricAnchors(BaseModel):
    """Behavioral anchors at three reference scores."""
    one: str = Field(description="What a score of 1 looks like (weak)")
    three: str = Field(description="What a score of 3 looks like (solid)")
    five: str = Field(description="What a score of 5 looks like (exceptional)")


class RubricDimension(BaseModel):
    id: str = Field(default_factory=_new_id)
    name: str
    description: str
    weight: float = Field(description="Weight as a percentage (0-100); all weights sum to ~100")
    anchors: RubricAnchors


class CaseSection(BaseModel):
    id: str = Field(default_factory=_new_id)
    title: str
    intro: str
    questions: List[str]


class CaseStudyDraft(BaseModel):
    """The exact JSON shape we ask Claude to return."""
    title: str
    scenario_text: str = Field(description="Story-style intro: the realistic situation the candidate faces")
    sections: List[CaseSection]
    rubric: List[RubricDimension]
    estimated_minutes: int = 60


class Case(BaseModel):
    id: str = Field(default_factory=_new_id)
    role_id: str
    manager_id: str
    status: Literal["draft", "approved", "archived"] = "draft"
    title: str
    scenario_text: str
    sections: List[CaseSection]
    rubric: List[RubricDimension]
    estimated_minutes: int = 60
    model_used: Optional[str] = None
    model_version: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)
    approved_at: Optional[str] = None


class CaseGenerateRequest(BaseModel):
    role_id: str
    notes: str = Field(default="", max_length=2000)


class CaseUpdateRequest(BaseModel):
    """Patch any of these fields on an existing draft case."""
    title: Optional[str] = None
    scenario_text: Optional[str] = None
    sections: Optional[List[CaseSection]] = None
    rubric: Optional[List[RubricDimension]] = None
    estimated_minutes: Optional[int] = None


class SectionRegenerateRequest(BaseModel):
    section_id: str
    notes: str = Field(default="", max_length=2000)


# ---------- Phase 2/3 scaffolding (kept lean) ----------
class Assignment(BaseModel):
    id: str = Field(default_factory=_new_id)
    case_id: str
    candidate_email: EmailStr
    candidate_name: Optional[str] = None
    token: str = Field(default_factory=lambda: uuid.uuid4().hex)
    status: Literal["sent", "in_progress", "submitted"] = "sent"
    created_at: str = Field(default_factory=_now_iso)
    submitted_at: Optional[str] = None


class Response(BaseModel):
    id: str = Field(default_factory=_new_id)
    assignment_id: str
    answers: dict = Field(default_factory=dict)
    audio_urls: List[str] = Field(default_factory=list)
    transcript: Optional[str] = None
    time_taken_seconds: Optional[int] = None
    submitted_at: Optional[str] = None


class CriterionScore(BaseModel):
    dimension_id: str
    name: str
    score: float
    weight: float
    justification: str


class Evaluation(BaseModel):
    id: str = Field(default_factory=_new_id)
    response_id: str
    scores: List[CriterionScore]
    overall_score: float
    strengths: List[str] = Field(default_factory=list)
    concerns: List[str] = Field(default_factory=list)
    recommendation: str
    summary: str
    created_at: str = Field(default_factory=_now_iso)


def doc_strip(d: dict[str, Any]) -> dict[str, Any]:
    """Remove Mongo's _id from a fetched dict."""
    d.pop("_id", None)
    return d
