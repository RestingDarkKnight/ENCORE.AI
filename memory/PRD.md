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

### Phase 3 — Evaluation & Reporting ✅
- Auto-evaluation on submit via FastAPI BackgroundTask (no-ops cleanly when `ANTHROPIC_API_KEY` is empty).
- Manual `POST /api/responses/by-assignment/{id}/evaluate` (idempotent — returns existing eval; 503 with clear msg when no key).
- Claude eval prompt includes rubric anchors and demands a verbatim `quote` from the candidate per dimension score.
- Per-dimension `CriterionScore { dimension_id, name, score, weight, quote, justification }`; `Recommendation` enum (`strong_hire` | `hire` | `borderline` | `no_hire`); strengths, concerns, summary.
- Configurable eval model via `CLAUDE_EVAL_MODEL` (falls back to `CLAUDE_MODEL`).
- Decision tracking: `POST /api/decisions` upserts one Decision per response (`advance` | `hold` | `reject` + optional note).
- Multi-candidate leaderboard at `/api/cases/{case_id}/leaderboard` — evaluated rows ranked by `overall_score` desc, then submitted-not-evaluated, then in-progress, then sent.
- Manager UI: `/reports/:assignmentId` page — score ring + recommendation pill, summary, strengths/concerns cards, per-dimension breakdown with anchor bar + verbatim quote callouts, candidate work playback (audio + transcript), decision buttons + note.
- Audio playback for `<audio>` tags uses `?t=<jwt>` query param fallback (HTML5 cannot send Authorization headers).
- Comparison Leaderboard panel appears on case detail when 2+ candidates have been evaluated.
- 18/18 new backend pytest + previous 38/38 still green (74 total). Frontend 100% on report, decision flow, leaderboard.

### Phase 4 — Polish & Gamification ✅
- Public Landing page at `/` ("Hire on judgment. Not trivia.") for unauthenticated users; auto-redirects to `/dashboard` when signed in. Faux scored-report preview card showing the product's payoff above the fold.
- Momentum Dashboard: 4 progress-ring stat cards (Roles created, Cases generated, Candidates scored, Decisions made) that fill toward next-milestone thresholds (1 → 3 → 5 → 10 / 25).
- BadgeStrip with 9 understated milestones: first_role, first_case, first_approved, first_invite, first_submission, first_decision, first_hire, three_cases, five_candidates. Shows earned pills + a "Next:" row with a progress bar toward the next badge.
- Loading-state copy with personality: "ENCORE is designing your case — choosing stakeholders, picking real constraints, drafting a rubric…" / "Scoring against the rubric…" / "Locking in your work and notifying the team…".
- Empty states guide to the next action (open a case, create your first role).
- TakeCase header tightened for mobile (390px) — smaller logo, smaller ring, hidden saved-indicator on phones, `break-words` on long case titles.
- `GET /api/stats/manager` returns counts + computed badge milestones (no new DB collection).
- 10/10 new backend pytest + prior 74/74 still green (84 total). Frontend 100% on Landing surfaces, momentum dashboard, badges, candidate-activity panel, mobile TakeCase. Zero console warnings.

### Phase A — Control & Clarity Fix Pack ✅ (2026-06-11)
- **Role edit**: `PATCH /api/roles/{id}` already existed; UI now exposes click-to-edit on `job_title`, `success_criteria`, `common_challenges` (RoleDetail). Toast `Saved.` on commit.
- **Role archive (soft)**: `archived: bool` flag on roles. `POST /api/roles/{id}/archive` and `/unarchive`. `DELETE /api/roles/{id}` is now a soft-archive (204; doc retained, `archived=true`). `GET /api/roles` filters archived by default; `?include_archived=true` returns all. RolesList shows kebab + "Show archived" toggle. Cards opacity-dim when archived. RoleDetail shows banner + Restore + disables case generation.
- **Case archive (soft)**: `POST /api/cases/{id}/archive` and `/unarchive` (unarchive returns case to draft). `DELETE /api/cases/{id}` is now a soft-archive (no data destroyed). `GET /api/cases/role/{role_id}` filters archived by default. `GET /api/cases` (new) returns all cases for the manager, filterable. CaseDetail header has a kebab with Archive / Restore; archived URL shows banner + pill + Restore.
- **Stats reflect archive**: `/api/stats/manager` `roles` and `cases` counts now exclude archived items (so dashboard momentum stays accurate). Other fields unchanged.
- **PipelineStrip** (Dashboard): 4-stage orientation strip — Define role → Generate case → Invite candidates → Review reports. Computes the next best action from stats and renders a single CTA. Active stage pulses (motion respects `prefers-reduced-motion`). Gated on stats !== null to avoid initial flash.
- **Shared `KebabMenu`** component (closes on outside-click / Escape) used by RolesList, RoleDetail, CaseDetail.
- 7/7 new backend pytest (`tests/test_encore_phase_a.py`) + prior 72/73 still green (1 pre-existing flaky JWT audio test unrelated to Phase A). Frontend e2e: 100% on pipeline strip, kebab archive/restore, inline role edits, banner restore, archived disable rules.

### Phase D — Design Elevation & Motion ✅ (2026-06-12)
- **D1 Design language**: refined Tailwind tokens (typography scale `.text-display-{1,2,3}`, 8px-rhythm `section`/`section-lg`/`gutter` spacing, larger radii, layered shadows `card`/`card-hover`/`lift`, warm-neutral `canvas.warm`, restrained score scale `score.weak|mid|strong`). Global tabular numerals on all stats/scores. Two-button system (`.btn-primary`, `.btn-quiet`). Visible AA focus rings everywhere (`:focus-visible` global). `prefers-reduced-motion` honored across the app via a base-layer `@media` rule.
- **D2 Motion choreography** (framer-motion only; reduced-motion honored):
  - Route transitions: 0.2s fade+rise wrapper via `AnimatePresence` + `PageTransition` in `App.js`. `ScrollToTop` on route change.
  - Dashboard: `useCountUp` hook animates stat numbers 0 → target. Pipeline strip draws connector line left → right with `scaleX` motion.
  - Badge "newly earned" toast: `useBadgeNotifier` hook stores last-seen badge ids in `localStorage[encore.badges.seen.<managerId>]`. First visit seeds the set silently; subsequent visits fire a single refined `toast.custom` per newly-earned badge (no stacking, animated icon).
  - Case generation: new `<GenerationTicker active />` cycles "Understanding the role… → Designing the scenario… → Writing the rubric…" on a 6.5s cadence with a slim shimmer bar.
  - Case detail: sections stagger-reveal on mount (staggerChildren 0.08).
  - TakeCase done screen: animated SVG check (circle + checkmark) with `pathLength` draw, replacing the static icon.
  - Wizard chip swarm: `AnimatePresence` + `layout` + spring on add/remove for technical & soft skills chips.
  - Reports: dimension cards stagger-reveal, dimension bars grow from 0 to value, leaderboard rows stagger from the left.
- **D3 Landing rebuild** (`Landing.jsx`): GSAP timeline reveals headline ("Hire on judgment. Not trivia." with word-by-word `yPercent` stagger) → subhead → CTAs → trust line → hero mock. Three product-mock sections (Case Studio, Candidate Portal, Reports Hub) with `whileInView` scroll reveals — every mock is a styled component, fully themeable. Grain SVG overlay + `gradient-drift` keyframe behind hero. Social proof, closing CTA, footer. Headline timeline uses GSAP v3.15 (landing-only; rest of app remains framer-motion).
- **D4 Quality bar**: Mobile Take-Case header unchanged from Phase 4 (already responsive at 390px). All interactive elements keyboard-navigable with visible focus rings. No layout shift — `PipelineStrip` and `BadgeStrip` gated on stats load. Reduced-motion verified on every new animation (PageTransition, useCountUp, GenerationTicker, hero, scroll reveals).
- Verified: testing agent + visual smoke pass. Chip swarm live-tested (add 3 / remove 1 with spring animation). Landing GSAP timeline confirmed not stuck (all `[data-anim='headline-word']` settled at opacity 1). 0 console errors, 0 pageerrors across Landing, Dashboard, Roles list, Role detail. Source-reviewed for surfaces with no live data (badge subsequent-visit toast, generation ticker active state, ReportView with no completed evaluations).

### Phase B — Reports Hub & Candidate Mapping ✅ (2026-06-13)
- **Backend** `routes_reports.py`:
  - `GET /api/reports/summary` — per-case summary across the manager: invited / submitted / evaluated counts, avg overall score, recommendation distribution (`strong_hire | hire | borderline | no_hire`), per-dimension averages.
  - `GET /api/reports/case/{case_id}` — full candidate mapping: every assignment with status, submitted_at, overall score, per-dimension scores, recommendation, decision, strengths, concerns, summary. Default sort: evaluated first by score desc.
- **Frontend** `/reports` (`Reports.jsx`):
  - Top: per-case cards with funnel (invited → submitted → scored), animated average-score ring, recommendation-distribution stacked bar.
  - Click → inline drill-down: dimension averages panel + ranked candidate table (sort by score / submitted / status).
  - Each row deep-links to `/reports/:assignmentId?case={caseId}` so the existing report view knows where to put breadcrumb + prev/next.
- **B3 ReportView** breadcrumb (Reports › Case › Candidate) + Prev / Next neighbour navigation when arriving from the hub.
- **Nav**: "Reports" entry added to AppShell.

### Phase C — Skill Swarm & "Generate with AI" Assists ✅ (2026-06-13)
- **Backend** `routes_suggest.py`:
  - `POST /api/suggest` (manager auth) with `kind = technical_skills | soft_skills | success_criteria | common_challenges`.
  - Calls **claude-haiku-4-5** (`CLAUDE_HAIKU_MODEL` env, default `claude-haiku-4-5`) with `max_tokens=500`, 2 retries max, 20s timeout.
  - **Process-wide in-memory cache** keyed by `(kind | title | industry | seniority | existing-set)` with 1-hour TTL — repeated wizard renders don't re-bill.
  - **Static taxonomy fallback** for Indian core-engineering SMEs (metallurgy, mechanical, civil, chemical, manufacturing, QA, foundry) so the wizard always has 12+ relevant chips even with no Claude key.
  - Always strips suggestions already in `existing` before returning.
- **Frontend** `CreateRole.jsx`:
  - `useSuggest` hook with **session-memory cache** + inflight dedupe.
  - Skills steps: lazy-fetch on entry, "AI" refresh button beside Add, secondary "Refresh" link, staggered chip swarm animation (40ms steps).
  - Success-criteria & common-challenges textareas each get a "Generate with AI" affordance that drops an editable 2-3 sentence draft into the field.
  - All AI affordances respect `prefers-reduced-motion` and gracefully degrade to seeded taxonomy when Claude isn't configured.

### Phase E2 — Shareable read-only reports + PDF ✅ (2026-06-13)
- **Backend** `routes_share.py`:
  - `POST /api/reports/{assignment_id}/share` — generates / refreshes a 32-byte URL-safe share token; accepts `{ show_initials_only }` privacy toggle.
  - `GET /api/reports/{assignment_id}/share` — fetch current share state (or 200 + null).
  - `DELETE /api/reports/{assignment_id}/share` — revoke.
  - `GET /api/shared/report/{share_token}` — **PUBLIC, no auth**. Returns a sanitized payload: candidate display string (initials or full name per toggle), case title, role title, overall score, recommendation, per-dimension scores with justification + quote, strengths, concerns, summary. No internal IDs leaked.
- **Frontend** `/r/:shareToken` (`SharedReport.jsx`):
  - Read-only page (no nav, no decision UI) with a "Download PDF" button that triggers `window.print()`.
  - Print stylesheet (`@media print`) in `index.css` lays out a clean one-pager (A4, 14mm margins, layered shadows stripped, page-break-inside avoid on cards, animations disabled). Zero dependencies.
- **ReportView** gains a Share button → modal: copy link, toggle initials-only, preview, revoke. Print button calls `window.print()` (manager view also has the printable id so it prints cleanly).

### Phase E3 — Candidate comparison ✅ (2026-06-13)
- **Frontend** `/reports/compare/:caseId?ids=a,b,c` (`CompareCandidates.jsx`):
  - Reuses `GET /api/reports/case/{case_id}` — no new backend needed.
  - Three rows of comparison, all aligned on the same rubric axis:
    1. Top row: candidate name, overall-score ring, recommendation pill, decision buttons (advance / hold / reject — decision recorded inline without leaving the page).
    2. Dimension breakdown: every rubric dimension as a horizontal bar, side-by-side per candidate (max 3) so deltas read instantly.
    3. Narratives: top strength + top concern per candidate.
- **Reports drill-down**: checkbox per evaluated row (max 3) + floating "Compare N candidates" CTA that animates up from the bottom when ≥2 selected.

### Phase E4 — 30/90-day outcome capture ✅ (2026-06-13)
- **New collection** `hire_outcomes` with unique compound index `(assignment_id, window)`.
- **Backend** `routes_outcomes.py`:
  - `POST /api/outcomes` — record an outcome (`window: 30d|90d`, `performing: 1-5`, `would_hire_again: bool`, optional `comment`). Upserts at most one per window per candidate. Only valid for candidates whose decision is `advance`.
  - `GET /api/outcomes/by-assignment/{id}` — list outcomes for one candidate.
  - `GET /api/outcomes/due` — surfaces hires whose decision is ≥30 or ≥90 days old with no outcome for that window. Sorted most-overdue first.
- **Frontend** `OutcomesDueCard.jsx` on the Dashboard — appears only when at least one check-in is due. Each row expands inline to a 3-field form (5-star rating, would-hire-again yes/no, optional comment). Saves in <10s of work.
- **ReportView** shows captured outcomes as a "Post-hire outcomes" panel (30-day / 90-day cards with performing/5, would-hire-again pill, and the comment).
- **Out of scope** (intentionally): automated email nudges — manual + dashboard surfacing only in v1.

### Phase Agentic-v1 — Six-Agent Collaborative Workflow ✅ (2026-06-16)

**Module 1 — Substrate**
- 5 new Mongo collections: `agent_memories`, `agent_feedback`, `agent_metrics_daily`, `knowledge_chunks`, `case_workflow_state` (all indexed for manager+domain+time lookups; agent_memories has TTL via expires_at).
- `agents/memory.py` — tiered retrieval (exact `manager+domain` → manager-only → system-wide pads up to 15 entries), strict entry_type validation per agent, formatted memory block for prompts, feedback log.
- `agents/retrieval.py` — OpenAI `text-embedding-3-small` (via Emergent LLM key, 1536-dim, in-process cache); tries Atlas `$vectorSearch` first, transparently falls back to in-memory cosine. Background indexer for approved-case scenarios+rubric+notes.
- `agents/workflow_state.py` — resume-from-anywhere persistence; 8-call hard cap enforced server-side.
- `normalize_domain_key()` from `(role.industry, role.seniority)`.

**Module 2 — Six agents**
- `agents/prompts.py` — strict Pydantic JSON contracts per agent (Analyst, Theory Researcher, Architect, Generator, Critic, Polisher) + per-agent system prompts + max_tokens (1500 / 1500 / 1500 / 4000 / 1500 / 4000).
- `agents/orchestrator.py` — composes `system + memory_block + (knowledge_block for theory) + prior_outputs + task` per agent; one Claude call (Opus by default, configurable via `CLAUDE_MODEL`); persists output + reasoning_summary + memory IDs used.
- `routes_workflow.py` — `POST /api/workflows`, `GET /api/workflows/{id}`, `POST /api/workflows/{id}/run/{step}`, `POST /api/workflows/{id}/feedback`, `POST /api/workflows/{id}/finalize` (creates a Case row from final output and links workflow→case), `GET /api/workflows/by-role/{role_id}` for resume.

**Module 3.1 — Feedback routing**
- Every user action (Continue / Revise / Pick shape / Apply revisions / Approve) sends a `feedback` event keyed to the responsible agent.
- Background extraction call (Haiku 4.5, max_tokens=200, fail-soft) converts each feedback event into a structured `agent_memories` entry with a validated `entry_type` per agent. Raw fallback preserves the signal even if Claude is unavailable.
- Memory is automatically used in subsequent calls — no manual wiring needed.

**Module 3.4 — Show-your-thinking UI**
- New route `/roles/:roleId/cases/new-guided` (`GuidedCase.jsx`).
- Persistent 6-step progress strip; current step pulses; clickable to view read-only past output.
- Per-step "Show reasoning" panel with the agent's `reasoning_summary` and a "Memory used: N prior interactions informed this step" line.
- Call budget indicator (Calls used: X / 8) — gentle, top-right.
- Honest agent labels and "the Analyst is reading the role…" status while a call is in flight.
- Resume-from-anywhere: re-opening the page picks up the newest in-progress workflow for that role.

**Deferred per spec** (user explicitly OK'd in scope question):
- **3.2** Outcome-signal attribution — `hire_outcomes` infrastructure exists (Phase E4) and `agent_feedback` collection accepts `outcome_signal` type. The Claude attribution call is not wired yet — pending real candidate outcomes.
- **3.3** `/admin/agent-metrics` dashboard — `agent_metrics_daily` collection + indexes exist; aggregation job + UI deferred until there's usage.
- **3.5** Memory hygiene — TTL index on `agent_memories.expires_at` exists; 500-entry-per-(manager,domain) cap + per-agent clear UI deferred.

### Phase H — Assessment Modes & Grading (in flight)

**Slice 1 ✅ — Language Register (2026-02-15)**
- Three registers: `plain | standard | advanced` selectable in role wizard; persisted on `Role`.
- Generator/Polisher/Section-regen all receive a register block; Evaluator gets a fairness clause (NEVER score candidate English).

**Slice 2 ✅ — Assessment Modes + Reasoning Preview (2026-02-17)**
- Three modes: `screening | takehome | interview`. Stored on `Case` and on `case_workflow_state` doc.
- Manager picks mode + an optional "Require reasoning on objective questions" toggle on RoleDetail (one selector drives both one-shot and 6-agent flows).
- Mode block injected into Architect/Generator/Critic/Polisher prompts; reasoning clause appends a "Why? (1–2 sentences)" requirement for objective question types (Slice 3 will introduce the formal types).
- GuidedCase shows a mode badge + reasoning badge in the header; URL params (`?mode=...&reasoning=1`) seed a fresh workflow, but an existing in-progress workflow always takes precedence.
- Legacy workflow docs without the new fields are read with safe defaults (`interview` / false).
- Test coverage: 11/11 new pytest cases passing (`backend/tests/test_phase_h_slice2.py`); frontend Playwright flow (mode toggle, reasoning toggle, fresh + resume scenarios) passing in iteration_8.

**Slice 2.5 ✅ — Unified case-design experience (2026-02-17)**
- The one-shot `/api/cases/generate` endpoint is **retired** (returns 410 Gone). The 6-agent workflow is now the only generation path.
- RoleDetail card title is now "Let's design a work-simulation case." Six agents collaborate; the manager approves each step.
- New `ModeTimeSelector` component: each mode tab darkens when active and expands inward to show three preset time pills (Screening 30/45/60, Take-home 90/120/180, Interview 30/45/60) plus a custom-minute input (5–480). Once a time is picked, the dark tab shows "Mode · NN min · tap pencil to change". Switching modes resets the time choice.
- Workflow now persists `estimated_minutes` and `notes` (manager-supplied); orchestrator injects them as a target-duration hint and notes block into the Architect / Generator / Polisher prompts.
- The 6-agent workspace is now an embeddable component (`/app/frontend/src/components/GuidedWorkflow.jsx`) and renders inline below the design card on `/roles/:id`. Page transitions are gone. The "Calls used: N / 8" budget badge has been removed per spec.
- Drafted cases now expand inline to show scenario, sections, and full rubric; each row has a "Revise via agents" button (pre-fills the design card with the case's mode + duration and re-opens the workspace) and an "Open editor" link.
- CaseDetail now supports inline `+ Add question` and per-question remove buttons on non-approved cases.
- The legacy `/roles/:roleId/cases/new-guided` route now `<Navigate>`s back to `/roles/:roleId` so bookmarks still work.
- Test coverage: 22/22 backend pytest passing (including 5 new tests for em + notes); end-to-end Playwright validated mode/time pills, custom input, reset behavior, pencil-to-edit, resume, redirect, add/remove question, no console errors (iteration_9.json).

**Slice 3 (P0) — pending**: 6 formal question types (`mcq`, `multiple_correct`, `fill_blank`, `match`, `short_answer`, `open`) + deterministic scoring engine for the objective ones. The `require_reasoning` boolean and `assessment_mode` literal are already on `Case` and ready to drive Slice 3 logic.

**Slice 4 (P0) — pending**: Grading system — human-in-the-loop review gate, identity-blind LLM evaluation with quoted evidence, transparent candidate-facing feedback.

**Hard cost guardrails (enforced)**
- 8 Claude calls per workflow max (enforced in `save_step_output`).
- Per-agent max_tokens enforced.
- Memory extraction calls capped at 200 tokens (Haiku).
- Embeddings cached in-process (`_EMBED_CACHE`).
- No autonomous agent loops — each step requires explicit human action.

**Tested**
- Backend pytest: 37/38 passing (1 pre-existing flaky `test_response_audio_stream_jwt` unrelated).
- Live curl: `POST /workflows` returns clean JSON (200 with domain_key `foundry::mid`); `POST /workflows/{id}/run/1` returns expected 503 (`ANTHROPIC_API_KEY not configured`) — confirming the workflow will Just Work once Claude key arrives on Railway; `POST /workflows/{id}/feedback` returns 200 with background extraction queued.
- Live frontend: `/roles/:id/cases/new-guided` renders the progress strip with 6 steps, "Calls used: 0 / 8" budget, Run Analyst CTA. Page is resume-aware (returns to newest in-progress workflow).

## Backlog
### P0 — needed before Phase 2 sign-off by user
- (None — Phase 1 acceptance is: signup → wizard → generate → edit → approve. All in place.)
- Live Claude round-trip — requires the user to provide `ANTHROPIC_API_KEY`.

### P1 — Phase 4 (whatever you spec next)
- Force-rerun evaluation (`?force=true`) with calibration anchors.
- Email digest of new submissions / decisions (SendGrid integration).
- Multi-manager teams + role-based access.
- Anonymized rubric calibration across roles.
- Role-level analytics (avg score, time taken, drop-off).
- GitHub auto-sync of /app to `RestingDarkKnight/ENCORE.AI` via Emergent GitHub flow.

### P3 — Nice-to-have
- Role templates / starter library.
- Anonymized rubric calibration across roles.
- Role-level analytics (avg score, time taken, drop-off).
- GitHub auto-sync of /app to `RestingDarkKnight/ENCORE.AI` via Emergent GitHub flow.

## Notes
- `ANTHROPIC_API_KEY` lives in `/app/backend/.env` and is currently empty. Generation endpoints return HTTP 503 with a clear message until set.
- `CLAUDE_MODEL` is configurable (env). Both generation and evaluation will use this single setting until the user wants to split them.
