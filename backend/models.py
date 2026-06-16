"""Pydantic models for ENCORE."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


def _new_id() -> str:
    return str(uuid.uuid4())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Auth / Manager ----------
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
LanguageRegister = Literal["plain", "standard", "advanced"]


class RoleCreate(BaseModel):
    job_title: str = Field(min_length=1, max_length=200)
    industry: str = Field(default="", max_length=200)
    seniority: Seniority = "mid"
    technical_skills: List[str] = Field(default_factory=list)
    soft_skills: List[str] = Field(default_factory=list)
    success_criteria: str = Field(default="", max_length=2000)
    common_challenges: str = Field(default="", max_length=2000)
    difficulty_level: Difficulty = "applied"
    language_register: LanguageRegister = "standard"


class RoleUpdate(BaseModel):
    job_title: Optional[str] = None
    industry: Optional[str] = None
    seniority: Optional[Seniority] = None
    technical_skills: Optional[List[str]] = None
    soft_skills: Optional[List[str]] = None
    success_criteria: Optional[str] = None
    common_challenges: Optional[str] = None
    difficulty_level: Optional[Difficulty] = None
    language_register: Optional[LanguageRegister] = None


class Role(RoleCreate):
    id: str = Field(default_factory=_new_id)
    manager_id: str
    archived: bool = False
    created_at: str = Field(default_factory=_now_iso)
    case_count: int = 0


# ---------- Case Study ----------
class RubricAnchors(BaseModel):
    one: str
    three: str
    five: str


class RubricDimension(BaseModel):
    id: str = Field(default_factory=_new_id)
    name: str
    description: str
    weight: float
    anchors: RubricAnchors


class CaseSection(BaseModel):
    id: str = Field(default_factory=_new_id)
    title: str
    intro: str
    questions: List[str]


class CaseStudyDraft(BaseModel):
    title: str
    scenario_text: str
    sections: List[CaseSection]
    rubric: List[RubricDimension]
    estimated_minutes: int = 60


ReviewStatus = Literal["pending_review", "approved", "rejected"]


ReviewStatus = Literal["pending_review", "approved", "rejected"]


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


# ---------- SME review ----------
RUBRIC_DIMENSIONS = [
    "discrimination_power",
    "job_fidelity",
    "anchored_openness",
    "judgment_over_recall",
    "technical_accuracy",
    "difficulty_calibration",
    "rubric_quality",
]


class ReviewScores(BaseModel):
    discrimination_power: int = Field(ge=1, le=5)
    job_fidelity: int = Field(ge=1, le=5)
    anchored_openness: int = Field(ge=1, le=5)
    judgment_over_recall: int = Field(ge=1, le=5)
    technical_accuracy: int = Field(ge=1, le=5)
    difficulty_calibration: int = Field(ge=1, le=5)
    rubric_quality: int = Field(ge=1, le=5)


class CaseReviewCreate(BaseModel):
    scores: ReviewScores
    fabricated_specs_flag: bool = False
    verdict: Literal["approved", "rejected"]
    notes: str = Field(default="", max_length=4000)


class CaseReview(BaseModel):
    id: str = Field(default_factory=_new_id)
    case_id: str
    sme_id: str
    scores: ReviewScores
    fabricated_specs_flag: bool = False
    verdict: Literal["approved", "rejected"]
    notes: str = ""
    reviewed_at: str = Field(default_factory=_now_iso)


# ---------- Domain constraints (grounding) ----------
ConstraintType = Literal["real_fact", "limit", "anti_pattern"]


class DomainConstraintCreate(BaseModel):
    domain_key: str = Field(min_length=1, max_length=200)
    constraint_type: ConstraintType
    text: str = Field(min_length=1, max_length=2000)


class DomainConstraint(BaseModel):
    id: str = Field(default_factory=_new_id)
    domain_key: str
    constraint_type: ConstraintType
    text: str
    added_by: str
    created_at: str = Field(default_factory=_now_iso)


# ---------- SME invite ----------
class SMEInviteCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(min_length=8, max_length=128)


class CaseGenerateRequest(BaseModel):
    role_id: str
    notes: str = Field(default="", max_length=2000)


class CaseUpdateRequest(BaseModel):
    title: Optional[str] = None
    scenario_text: Optional[str] = None
    sections: Optional[List[CaseSection]] = None
    rubric: Optional[List[RubricDimension]] = None
    estimated_minutes: Optional[int] = None


class SectionRegenerateRequest(BaseModel):
    section_id: str
    notes: str = Field(default="", max_length=2000)


# ---------- Phase 2: Assignment / Response ----------
AssignmentStatus = Literal["sent", "in_progress", "submitted"]


class AssignmentCreate(BaseModel):
    case_id: str
    candidate_email: EmailStr
    candidate_name: Optional[str] = None
    time_limit_minutes: int = Field(default=180, ge=15, le=480)


class Assignment(BaseModel):
    id: str = Field(default_factory=_new_id)
    case_id: str
    manager_id: str
    candidate_email: EmailStr
    candidate_name: Optional[str] = None
    token: str = Field(default_factory=lambda: uuid.uuid4().hex)
    status: AssignmentStatus = "sent"
    time_limit_minutes: int = 180
    created_at: str = Field(default_factory=_now_iso)
    started_at: Optional[str] = None
    submitted_at: Optional[str] = None


class AudioRecord(BaseModel):
    """One uploaded audio clip linked to a specific question."""
    storage_path: str
    content_type: str
    size: int
    uploaded_at: str = Field(default_factory=_now_iso)
    transcript: Optional[str] = None
    transcribed_at: Optional[str] = None


class CandidateResponse(BaseModel):
    """A candidate's work for an assignment. One per assignment.

    `answers` is keyed by f"{section_id}::{q_idx}" → text.
    `audio` is keyed by the same key → AudioRecord.
    """
    id: str = Field(default_factory=_new_id)
    assignment_id: str
    answers: Dict[str, str] = Field(default_factory=dict)
    audio: Dict[str, AudioRecord] = Field(default_factory=dict)
    honor_code_accepted: bool = False
    time_taken_seconds: Optional[int] = None
    submitted_at: Optional[str] = None
    updated_at: str = Field(default_factory=_now_iso)


class ProgressSaveRequest(BaseModel):
    answers: Dict[str, str] = Field(default_factory=dict)
    honor_code_accepted: Optional[bool] = None


class SubmitRequest(BaseModel):
    answers: Dict[str, str] = Field(default_factory=dict)
    honor_code_accepted: bool = True
    time_taken_seconds: Optional[int] = None


# ---------- Candidate-facing case (rubric stripped) ----------
class CandidateSection(BaseModel):
    id: str
    title: str
    intro: str
    questions: List[str]


class CandidateCaseView(BaseModel):
    case_id: str
    title: str
    scenario_text: str
    sections: List[CandidateSection]
    estimated_minutes: int


class TakeView(BaseModel):
    """Everything the candidate's browser needs to take the case."""
    assignment_id: str
    status: AssignmentStatus
    candidate_email: EmailStr
    candidate_name: Optional[str]
    time_limit_minutes: int
    started_at: Optional[str]
    submitted_at: Optional[str]
    case: CandidateCaseView
    saved_answers: Dict[str, str] = Field(default_factory=dict)
    saved_audio: Dict[str, AudioRecord] = Field(default_factory=dict)
    honor_code_accepted: bool = False


# ---------- Phase 3 stubs ----------
class CriterionScore(BaseModel):
    dimension_id: str
    name: str
    score: float
    weight: float
    quote: str = Field(default="", description="Quote from the candidate's answer that justifies the score")
    justification: str


Recommendation = Literal["strong_hire", "hire", "borderline", "no_hire"]


class Evaluation(BaseModel):
    id: str = Field(default_factory=_new_id)
    response_id: str
    assignment_id: str
    case_id: str
    scores: List[CriterionScore]
    overall_score: float
    recommendation: Recommendation
    strengths: List[str] = Field(default_factory=list)
    concerns: List[str] = Field(default_factory=list)
    summary: str
    model_used: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso)


class EvaluationDraft(BaseModel):
    """The exact JSON shape we ask Claude to return for an evaluation."""
    scores: List[CriterionScore]
    overall_score: float = Field(ge=0, le=5)
    recommendation: Recommendation
    strengths: List[str]
    concerns: List[str]
    summary: str


# ---------- Hiring decision ----------
DecisionOutcome = Literal["advance", "reject", "hold"]


class DecisionCreate(BaseModel):
    response_id: str
    outcome: DecisionOutcome
    note: str = Field(default="", max_length=2000)


class Decision(BaseModel):
    id: str = Field(default_factory=_new_id)
    response_id: str
    assignment_id: str
    case_id: str
    manager_id: str
    outcome: DecisionOutcome
    note: str = ""
    decided_at: str = Field(default_factory=_now_iso)


def doc_strip(d: dict[str, Any]) -> dict[str, Any]:
    d.pop("_id", None)
    return d
