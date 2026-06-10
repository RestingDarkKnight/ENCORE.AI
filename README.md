# ENCORE

> **AI-native simulation hiring.** Hire on judgment. Not trivia.

ENCORE turns a job description into a realistic, open-ended work-simulation case study. A hiring manager describes a role; ENCORE uses **Claude** to generate a tailored case with a weighted rubric. A candidate works through it (text + optional voice). ENCORE then evaluates the response against the rubric and produces a scored report with verbatim quotes — not a black-box vibe check.

---

## What's in this repo

```
/app
├── backend/                # FastAPI + MongoDB
│   ├── server.py           # entrypoint (registers /api/* routers)
│   ├── models.py           # Pydantic models (Manager, Role, Case, Assignment, Response, Evaluation, Decision)
│   ├── db.py               # Motor client + indexes
│   ├── security.py         # JWT + bcrypt
│   ├── claude_service.py   # Anthropic client + robust JSON parsing
│   ├── evaluation.py       # Claude evaluator with rubric anchors
│   ├── transcription.py    # OpenAI Whisper via Emergent Universal Key
│   ├── storage_client.py   # Emergent object storage helpers
│   ├── routes_auth.py
│   ├── routes_roles.py
│   ├── routes_cases.py
│   ├── routes_assignments.py
│   ├── routes_take.py      # public candidate endpoints
│   ├── routes_responses.py
│   ├── routes_evaluation.py
│   ├── routes_stats.py     # /api/stats/manager + badges
│   ├── seed.py             # idempotent demo-manager seed
│   ├── tests/              # pytest test suite (84 tests)
│   └── requirements.txt
│
└── frontend/               # React (CRA) + Tailwind + shadcn + framer-motion
    ├── src/
    │   ├── App.js          # routes + AuthProvider
    │   ├── lib/
    │   │   ├── api.js
    │   │   ├── auth.jsx
    │   │   ├── takeApi.js          # public no-auth axios for /api/take
    │   │   └── useVoiceRecorder.js # MediaRecorder hook
    │   ├── components/
    │   │   ├── AppShell.jsx
    │   │   ├── ProtectedRoute.jsx
    │   │   ├── InvitePanel.jsx
    │   │   ├── Leaderboard.jsx
    │   │   └── BadgeStrip.jsx
    │   └── pages/
    │       ├── Landing.jsx
    │       ├── Login.jsx
    │       ├── Signup.jsx
    │       ├── Dashboard.jsx
    │       ├── RolesList.jsx
    │       ├── CreateRole.jsx     # 6-step gamified wizard
    │       ├── RoleDetail.jsx
    │       ├── CaseDetail.jsx     # inline edit + approve + invite
    │       ├── TakeCase.jsx       # public candidate experience
    │       └── ReportView.jsx     # scored report + decision
    └── package.json
```

---

## Tech stack

- **Frontend** — React 19, Tailwind, shadcn/ui, framer-motion, Phosphor icons, sonner, axios
- **Backend** — FastAPI (async), Motor (MongoDB), PyJWT + bcrypt, Anthropic SDK
- **Database** — MongoDB (UUID string ids; relational-style references with indexes)
- **AI** — Anthropic Claude (default `claude-opus-4-8`, configurable via env)
- **STT** — OpenAI Whisper via the Emergent Universal LLM Key
- **File storage** — Emergent Object Storage (for candidate audio answers)

---

## Data model

A chain of relationships, modelled in MongoDB with explicit foreign-key-style references and indexes:

```
Manager ─── owns ───▶ Role ─── owns ───▶ Case ─── assigned to ───▶ Assignment
                                                                       │
                                                                       ▼
                                                            CandidateResponse
                                                                       │
                                                                       ├─▶ Evaluation
                                                                       └─▶ Decision
```

| Collection      | Key fields |
|-----------------|------------|
| `managers`      | id (uuid), email (unique), full_name, company, password_hash, created_at |
| `roles`         | id, manager_id, job_title, industry, seniority, technical_skills[], soft_skills[], success_criteria, common_challenges, difficulty_level, created_at |
| `cases`         | id, role_id, manager_id, status (draft/approved/archived), title, scenario_text, sections[{title,intro,questions[]}], rubric[{name, description, weight, anchors{one,three,five}}], estimated_minutes, model_used, created_at, approved_at |
| `assignments`   | id, case_id, manager_id, candidate_email, candidate_name, token (unique), status (sent/in_progress/submitted), time_limit_minutes, created_at, started_at, submitted_at |
| `responses`     | id, assignment_id (unique), answers{}, audio{} (per-question AudioRecord with storage_path + transcript), honor_code_accepted, time_taken_seconds, submitted_at |
| `evaluations`   | id, response_id (unique), assignment_id, case_id, scores[{name, score, weight, quote, justification}], overall_score, recommendation (strong_hire/hire/borderline/no_hire), strengths[], concerns[], summary, model_used |
| `decisions`     | id, response_id (unique), assignment_id, case_id, manager_id, outcome (advance/hold/reject), note, decided_at |

---

## API surface

All routes are prefixed with `/api`. JWT bearer auth except where noted (public).

### Auth
- `POST /api/auth/signup` — create a manager
- `POST /api/auth/login` — login → `{ access_token, manager }`
- `GET  /api/auth/me`

### Roles
- `POST /api/roles` · `GET /api/roles` · `GET /api/roles/{id}` · `PATCH /api/roles/{id}` · `DELETE /api/roles/{id}`

### Cases
- `POST /api/cases/generate` — Claude drafts a case for the given role
- `GET  /api/cases/role/{role_id}` · `GET /api/cases/{id}`
- `PATCH /api/cases/{id}` — inline edit (locked once approved)
- `POST /api/cases/{id}/regenerate` · `POST /api/cases/{id}/regenerate-section`
- `POST /api/cases/{id}/approve` · `POST /api/cases/{id}/reopen`

### Assignments
- `POST /api/assignments` — invite a candidate (case must be approved)
- `GET  /api/assignments/case/{case_id}` · `GET /api/assignments/{id}` · `DELETE /api/assignments/{id}`

### Candidate take (PUBLIC — token-gated)
- `GET  /api/take/{token}` — case + saved progress (no rubric exposed)
- `POST /api/take/{token}/progress` — autosave answers
- `POST /api/take/{token}/audio` — upload audio for one question (multipart)
- `POST /api/take/{token}/submit` — final submit (triggers async eval)
- `GET  /api/take/{token}/audio/{section_id}/{q}` — stream own audio

### Responses & evaluation (manager)
- `GET  /api/responses/by-assignment/{id}` · `GET /api/responses/by-assignment/{id}/audio/{section_id}/{q}?t=<jwt>`
- `POST /api/responses/by-assignment/{id}/evaluate` — idempotent; 503 if no key
- `GET  /api/responses/by-assignment/{id}/evaluation`
- `POST /api/decisions` · `GET /api/decisions/by-response/{response_id}`
- `GET  /api/cases/{case_id}/leaderboard`

### Stats
- `GET /api/stats/manager` — counts + computed milestone badges

---

## Environment variables

### Backend (`/app/backend/.env`)
| Var | Required | Purpose |
|-----|----------|---------|
| `MONGO_URL` | ✅ | Mongo connection string |
| `DB_NAME` | ✅ | Database name |
| `JWT_SECRET` | ✅ | JWT signing secret |
| `JWT_ALGORITHM` | optional | default `HS256` |
| `JWT_EXPIRY_MINUTES` | optional | default `1440` |
| `ANTHROPIC_API_KEY` | ✅ for live AI | Claude (case-gen + evaluation). Leave empty for stubbed behavior — endpoints return clean 503s. |
| `CLAUDE_MODEL` | optional | default `claude-opus-4-8` |
| `CLAUDE_EVAL_MODEL` | optional | falls back to `CLAUDE_MODEL` |
| `EMERGENT_LLM_KEY` | ✅ for audio + transcripts | Object storage init + Whisper STT. |
| `CORS_ORIGINS` | optional | default `*` |

### Frontend (`/app/frontend/.env`)
| Var | Purpose |
|-----|---------|
| `REACT_APP_BACKEND_URL` | Base URL of the API |

---

## Running locally

### Backend
```bash
cd backend
pip install -r requirements.txt
# Make sure .env is populated (see above)
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend
```bash
cd frontend
yarn install
yarn start          # http://localhost:3000
```

### Tests
```bash
cd backend
pytest tests/ -v    # 84 tests across Phases 1–4
```

---

## Demo manager (seeded on first run)

- **Email**: `demo.manager@encore.ai`
- **Password**: `Encore-Phase1-2026!`

The seed is idempotent — safe to restart anytime.

---

## What's built — by phase

### ✅ Phase 1 — The Spine
JWT auth, manager dashboard, 6-step gamified role-creation wizard with progress ring, AI case generation (sectioned + weighted rubric with 1/3/5 behavioral anchors), inline edit on every field, regenerate full / regenerate section, approve & lock.

### ✅ Phase 2 — The Candidate Loop
Invite candidate from an approved case (unique tokenized link, copyable). Public token-gated candidate experience: welcome with honor code, section-by-section flow with progress ring + calm timer, autosaving text answers, optional voice recording per question (MediaRecorder → Emergent object storage), Whisper transcription as a background task that never blocks submit. Celebratory completion screen.

### ✅ Phase 3 — Evaluation & Reporting
Auto-evaluation on submit via FastAPI BackgroundTask. Manual "Evaluate with Claude" button (idempotent). Per-dimension scoring with **verbatim quote** from the candidate, recommendation enum (strong_hire / hire / borderline / no_hire), strengths/concerns/summary. Scored report page with score ring, anchor bars, blockquote callouts, audio playback + transcripts. Decision capture (advance/hold/reject + note). Multi-candidate leaderboard.

### ✅ Phase 4 — Polish & Gamification
Public landing page at `/` with hero + faux scored-report preview. Momentum dashboard with 4 progress-ring stat cards filling toward next milestones. 9-badge milestone strip (first_role → first_advance → five_candidates). Loading copy with personality ("ENCORE is designing your case…", "Scoring against the rubric…"). Mobile-tight candidate experience. `GET /api/stats/manager` computes badges from existing data.

---

## Design principles (kept throughout)

- **Hire on judgment, not trivia.** Cases test investigation, trade-off reasoning, and communication. Never recall.
- **Open-ended, no single right answer.** But anchored enough that strong reasoning is visibly distinguishable from weak.
- **Server-side AI only.** `ANTHROPIC_API_KEY` and `EMERGENT_LLM_KEY` live on the server. Never exposed to the browser.
- **Robust JSON handling.** Strip markdown fences, validate against Pydantic shape, retry once with a stricter instruction. Bad AI responses never crash a flow or save corrupt data.
- **Async by default.** Slow Claude calls (~30–60s) run with proper timeouts and clear loading states. Transcription runs as a background task — audio is stored even if transcription fails.
- **Lightly gamified, premium.** Progress rings, subtle badges, completion micro-animations. B2B-credible, never childish.

---

## Out of scope (deliberately)

- No grounding/validated-case library or retrieval layer.
- No SME approval workflow (manager approval is enough).
- No MCQ / multiple-choice formats — open-ended text + voice only.
- No fine-tuning or custom models — Claude API as-is.
- No analytics dashboards or billing.
- No multi-tenant org management beyond individual manager accounts.

---

## Roadmap

- Live Claude round-trip verification with user-provided `ANTHROPIC_API_KEY` (single env var; no code change).
- Force-rerun evaluation (`?force=true`) with calibration anchors.
- "What ENCORE looks for" candidate-facing brief (lowers anxiety → better signal).
- Email digests (SendGrid).
- Multi-manager teams + role-based access.
- Role-level analytics.

---

## License

Proprietary — © ENCORE. All rights reserved.
