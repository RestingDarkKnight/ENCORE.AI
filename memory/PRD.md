# ENCORE — Product Requirements Document

## Original Problem Statement
ENCORE is an AI-native hiring assessment platform for technical and engineering roles. Instead of testing textbook recall, ENCORE generates realistic, open-ended work-simulation case studies that reveal how a candidate actually thinks, investigates, decides, and communicates.

A hiring manager describes a role; ENCORE uses Claude to generate a tailored case study with a scoring rubric; a candidate works through the case; ENCORE evaluates the response against the rubric and produces a scored report.

## Core Principles
- Manager experience feels easy and lightly gamified (progress rings, smart defaults, celebratory moments) — premium B2B, never childish.
- Case studies are open investigations with no single right answer — they test judgment, not recall.
- All Claude/OpenAI calls happen server-side. Keys never reach the browser.
- Robust JSON handling: strip markdown fences, validate against Pydantic shape, retry once with a stricter instruction.
- Long AI calls are async with timeouts and clear loading states.

## Tech Stack
- **Frontend**: React (CRA), React Router, Tailwind + shadcn, framer-motion, Phosphor icons, sonner toasts.
- **Backend**: FastAPI (async), Motor (MongoDB), bcrypt + PyJWT, Anthropic SDK.
- **DB**: MongoDB with relational-style references + indexes.
- **AI**: Claude (model name configurable via `CLAUDE_MODEL`, default `claude-opus-4-8`).

## Architecture
- All API routes under `/api/*` (kubernetes ingress).
- Frontend uses `REACT_APP_BACKEND_URL`; backend uses `MONGO_URL` + `DB_NAME`.
- UUID string ids everywhere; never expose `_id`.
- Indexes: managers.email (unique), roles.manager_id, cases.role_id, assignments.invite_token (unique), responses.assignment_id (unique), evaluations.response_id (unique).

## User Personas
1. **Hiring Manager** — creates roles, generates/edits/approves cases. Default sign-up role.
2. **Candidate** — invited via assignment token (no self-signup). Phase 2.

## Data Model
- `users` (managers) — id, email, full_name, company, role (manager|candidate), password_hash, created_at
- `roles` — id, manager_id, job_title, industry, seniority, technical_skills[], soft_skills[], success_criteria, common_challenges, difficulty_level, created_at, case_count
- `cases` — id, role_id, manager_id, status (draft|approved|archived), title, scenario_text, sections[{id,title,intro,questions[]}], rubric[{id,name,description,weight,anchors{one,three,five}}], estimated_minutes, model_used, model_version, created_at, updated_at, approved_at
- `assignments` — id, case_id, candidate_email, candidate_name, token, status (sent|in_progress|submitted), created_at, submitted_at *(Phase 2)*
- `responses` — id, assignment_id, answers, audio_urls[], transcript, time_taken_seconds, submitted_at *(Phase 2)*
- `evaluations` — id, response_id, scores[{dimension_id,name,score,weight,justification}], overall_score, strengths[], concerns[], recommendation, summary, created_at *(Phase 3)*

## What's Implemented (2026-06-10)
### Phase 1 — The Spine ✅
- JWT email/password auth (signup, login, /me, logout).
- Seeded demo manager: `demo.manager@encore.ai` / `Encore-Phase1-2026!`.
- Manager dashboard: welcome, three stat cards (Roles / Cases / Approved), Claude status pill, role grid, candidate activity placeholder.
- 6-step gamified role-creation wizard with progress ring and smart skill suggestions.
- Case generation prompt + robust JSON parser (claude-opus-4-8 by default).
- Case detail view: scenario, 3-4 sections, weighted rubric with 1/3/5 behavioral anchors.
- Inline edit on title, scenario, section title/intro/questions, rubric name/description/weight/anchors.
- Regenerate full / Regenerate section endpoints (503 until ANTHROPIC_API_KEY is set).
- Approve & lock with celebratory confirmation + Reopen-to-edit.
- 20/20 backend pytest passing; full frontend Playwright flow validated.

### Phase 2 — The Candidate Loop ✅
- Invite candidate from an APPROVED case (manager UI: name + email + time-limit + Invite button).
- Unique tokenized `/take/{token}` link, copyable from the UI (no email integration yet).
- Public token-gated candidate experience (no auth):
  - Welcome with honor code gate.
  - Section-by-section flow with progress ring stepper, visible (but calm) countdown timer, scenario as expandable on section 1.
  - Per-question text answer (autosaves to `/api/take/{token}/progress` ~800ms after typing).
  - Optional voice answer per question via `MediaRecorder` → uploaded to **Emergent Object Storage** under `encore/audio/{assignment_id}/{section_id}/...`.
  - Whisper transcription (Emergent Universal Key) runs as a FastAPI background task — never blocks the candidate or the submit.
  - Final submit screen: "You're done — nicely handled." with celebratory animation.
  - Reopening a submitted token shows the done screen.
- Manager-side response viewer endpoints (`/api/responses/by-assignment/{id}` + audio streaming) — UI in Phase 3.
- 18/18 new backend pytest passing (+ previous 20/20 still green). All 8 frontend candidate-loop flows validated.

## Backlog
### P0 — needed before Phase 2 sign-off by user
- (None — Phase 1 acceptance is: signup → wizard → generate → edit → approve. All in place.)
- Live Claude round-trip — requires the user to provide `ANTHROPIC_API_KEY`.

### P1 — Phase 3 (Evaluation & scoring)
- Server-side Claude evaluation against the case's rubric → scored report.
- Per-criterion score, justification, strengths, concerns, recommendation, summary.
- Side-by-side ranking of candidates for a case/role.
- Manager response viewer UI (audio playback, transcript display).
- Optional: email digest of new submissions.

### P3 — Nice-to-have
- Role templates / starter library.
- Anonymized rubric calibration across roles.
- Role-level analytics (avg score, time taken, drop-off).
- GitHub auto-sync of /app to `RestingDarkKnight/ENCORE.AI` via Emergent GitHub flow.

## Notes
- `ANTHROPIC_API_KEY` lives in `/app/backend/.env` and is currently empty. Generation endpoints return HTTP 503 with a clear message until set.
- `CLAUDE_MODEL` is configurable (env). Both generation and evaluation will use this single setting until the user wants to split them.
