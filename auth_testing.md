# Auth Testing Playbook (Emergent-managed Google Auth)

## How the flow works in ENCORE
- Landing / Login has "Sign in with Google" button.
- Clicking it redirects to `https://auth.emergentagent.com/?redirect=<origin>/auth/callback`.
- Emergent completes Google login and redirects back to `/auth/callback#session_id=<sid>`.
- Frontend `AuthCallback` component extracts `session_id`, POSTs to `/api/auth/google/session`.
- Backend calls `https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data`
  with header `X-Session-ID: <sid>`, receives `{id, email, name, session_token}`.
- Backend upserts a Manager document keyed by email. Returns our normal JWT `TokenResponse`.
- Frontend stores JWT in localStorage (`encore_token`) and navigates to `/dashboard`.

## Test credentials
See `/app/memory/test_credentials.md`.

## Local smoke tests
1. Password login still works with the seeded demo account.
2. New signup via `/signup` creates a fresh manager and returns a JWT.
3. Google Auth: visit `/login`, click "Continue with Google", complete flow, verify
   backend created a `managers` doc (no `password_hash`) and JWT works on `/api/auth/me`.

## Regression checklist
- Existing email+password login/signup flow unaffected.
- `/api/auth/me` returns the same manager shape whether login was via password or Google.
- CORS allows credentials so the Google flow works in production.
