# ENCORE — Production Deployment Guide

Ship the app live on **Vercel (frontend)** + **Railway (backend + MongoDB)** with a
custom domain. Estimated time end-to-end: **60–90 minutes**.

---

## 0. Buy a domain (5 min)

You don't have one yet, so grab one at [Namecheap](https://www.namecheap.com/) or
[Cloudflare Registrar](https://dash.cloudflare.com/) (Cloudflare is cheaper at cost).

**Recommended names for a hiring-assessment product (pick one you can grab)**:
- `useencore.com` / `useencore.ai`
- `encorehire.com` / `encorehire.ai`
- `encoreapp.io`
- `hireencore.com`
- `tryencore.ai`

Buy the `.com` if available (best default) — Google penalises less-common TLDs
in trust perception. `.ai` is a great alt for the AI angle. Budget ~₹800–1,500/yr
for `.com`, ~₹6,000/yr for `.ai`.

After purchase, keep the domain registrar tab open — you'll add DNS records in
step 4.

---

## 1. Stand up MongoDB Atlas (free tier, 10 min)

1. Create an account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas).
2. Create a **new project** → **Build a Cluster** → pick the **M0 Free** tier
   (AWS region closest to your Railway region — see step 2, use `ap-south-1`
   for India users, `us-east-1` otherwise).
3. **Database Access** → Add a database user with a strong random password.
   Save it — we'll paste it into Railway shortly.
4. **Network Access** → Add IP `0.0.0.0/0` (Allow from anywhere). Railway's
   outbound IPs rotate; whitelisting Railway alone is fragile.
5. **Connect** → **Drivers** → copy the SRV connection string. It looks like:
   ```
   mongodb+srv://<user>:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `<user>` and `<password>` with the ones from step 3. **Save this
   string** — it becomes the `MONGO_URL` env var on Railway.

---

## 2. Deploy the backend on Railway (15 min)

1. Push the code to GitHub (Emergent has a "Save to GitHub" button in the chat
   input — use it. The repo should contain both `/backend` and `/frontend`).
2. Sign in at [railway.app](https://railway.app/) with your GitHub.
3. **New Project → Deploy from GitHub Repo** → select the ENCORE repo.
4. Railway will detect Python. Click the service → **Settings**:
   - **Root Directory**: `backend`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
   - **Build Command**: `pip install -r requirements.txt`
5. **Variables** tab → add these environment variables:
   ```
   MONGO_URL       = <paste the SRV string from step 1.5>
   DB_NAME         = encore_prod
   JWT_SECRET      = <run: python -c "import secrets;print(secrets.token_urlsafe(48))">
   EMERGENT_LLM_KEY = <your key — Profile → Manage plan → Universal Key>
   ANTHROPIC_API_KEY = <blank until you add credits; app 503s cleanly without it>
   CORS_ORIGINS    = https://<your-frontend-domain>
   ```
6. Deploy. Wait for the first build (~2 min).
7. Under **Settings → Networking → Generate Domain** to get a temporary URL like
   `encore-backend-production.up.railway.app`. Verify it works:
   ```bash
   curl https://<railway-domain>/api/health
   # Expected: {"ok":true,...}
   ```

**Backend deployment gotchas**:
- If the build fails with `pip` errors, add a `nixpacks.toml` at `/backend` root:
  ```toml
  [phases.setup]
  aptPkgs = ["ffmpeg"]
  ```
  (ffmpeg is needed for Whisper voice transcription.)
- Never commit `.env` — `MONGO_URL` and `JWT_SECRET` live only in Railway's UI.

---

## 3. Deploy the frontend on Vercel (10 min)

1. Sign in at [vercel.com](https://vercel.com/) with the same GitHub.
2. **New Project → Import** the ENCORE repo.
3. **Framework Preset**: Create React App (auto-detected).
4. **Root Directory**: `frontend`
5. **Environment Variables** — add ONE:
   ```
   REACT_APP_BACKEND_URL = https://<railway-domain>
   ```
   ⚠️ **Must include `https://`** — the last deploy attempt broke because this
   was missing the scheme.
6. Click **Deploy**. Wait ~1–2 minutes.
7. Vercel gives you a temporary URL like `encore-frontend.vercel.app`. Open it —
   the landing page should load.

---

## 4. Point your custom domain at both (15 min)

Once the temporary Vercel and Railway URLs work, wire your custom domain.

**A. Frontend on `useencore.com` (or your chosen domain)**
1. Vercel → your project → **Settings → Domains → Add** → enter `useencore.com`
   and `www.useencore.com`.
2. Vercel shows DNS records to add. Copy them.
3. Go to your registrar (Namecheap / Cloudflare) → DNS settings → add:
   - `A` record → `@` → `76.76.21.21` (Vercel's IP; Vercel will show you the current one)
   - `CNAME` record → `www` → `cname.vercel-dns.com`
4. Wait 5–20 min for DNS. Vercel will auto-issue an SSL cert.

**B. Backend on `api.useencore.com`**
1. Railway → your backend service → **Settings → Networking → Custom Domain** →
   enter `api.useencore.com`. Railway shows a `CNAME` target.
2. Registrar → add a `CNAME` record: `api` → `<the value Railway shows>`.
3. Wait 5–20 min. Railway auto-issues SSL.

**C. Update Vercel with the API domain**
1. Vercel → **Settings → Environment Variables** → edit
   `REACT_APP_BACKEND_URL` → set it to `https://api.useencore.com`.
2. **Redeploy** the frontend so the new env var takes effect (the "Deployments"
   tab → three-dot menu on the latest deployment → **Redeploy**).

**D. Update backend CORS**
1. Railway → Variables → set:
   `CORS_ORIGINS = https://useencore.com,https://www.useencore.com`
2. Railway auto-redeploys on env changes.

---

## 5. Smoke-test production (5 min)

Visit `https://useencore.com`:
- Landing page loads with 0 console errors.
- Click **Sign up** → create a new account → land on `/dashboard`.
- Create a role → back to dashboard → sees the role card.
- Sign out → back on Landing.
- Sign in again with the account you just created.

If Google Auth is enabled (it already is): click **Continue with Google** on
`/login`. You'll be redirected to Emergent → Google → back to
`https://useencore.com/auth/callback#session_id=...` → dashboard.

---

## 6. Turn on real Claude evaluations (2 min)

Until now `ANTHROPIC_API_KEY` was empty (case evaluations return 503). To flip
on the real evaluator:
1. Profile → Manage plan → Universal Key → **Add balance** (or enable auto
   top-up). Your Emergent LLM key already handles Claude usage — no separate
   Anthropic account needed.
2. On Railway, remove `ANTHROPIC_API_KEY` if empty and rely on the
   `EMERGENT_LLM_KEY` (already wired via `claude_service.py`).
3. Redeploy. `/api/health` should now report `"claude_configured": true`.

---

## 7. Operational checklist

- [ ] **Backups**: MongoDB Atlas M0 has no automatic backup. Upgrade to M2 (~$9/mo)
      once you have paying customers, OR run a nightly `mongodump` cron.
- [ ] **Monitoring**: Railway has built-in logs. Add [Sentry](https://sentry.io/) (free tier)
      for error tracking on the frontend — one `<script>` in `frontend/public/index.html`.
- [ ] **Custom email domain**: eventually set up transactional email (SendGrid/Resend)
      so candidate invites go from `you@useencore.com` instead of a generic sender.
- [ ] **Rate limiting**: the current backend doesn't rate-limit signup. Add
      [slowapi](https://slowapi.readthedocs.io/) if you get bot signups.
- [ ] **Delete the demo seed**: `demo.manager@encore.ai` still exists in the
      shared preview DB. Before launching, run a one-time script to delete it
      from prod (or leave it — nobody knows the password).

---

## 8. Rollback plan

- **Frontend regression?** Vercel → Deployments tab → click any previous
  deployment → **Promote to Production**. Instant.
- **Backend regression?** Railway → your service → Deployments → click a
  previous deployment → **Redeploy**. ~30 seconds.
- **DB corruption?** MongoDB Atlas → Backup → Point-in-Time Restore (requires
  M2+; on M0 you're on your own with the nightly `mongodump`).

---

## Common issues

| Symptom | Fix |
|---|---|
| Vercel build error `REACT_APP_BACKEND_URL undefined` | Env var not set OR missing `https://` prefix. |
| CORS error on browser console | Update `CORS_ORIGINS` in Railway to include the exact domain, no trailing slash. |
| `/api/health` returns 502 | Backend crashed. Check Railway logs; probably missing `MONGO_URL` or a Python import error. |
| Google Auth returns to a blank page | The `/auth/callback` route works only after the frontend has been redeployed with the new `REACT_APP_BACKEND_URL`. |
| Invites don't send | You haven't wired real email yet (Resend/SendGrid). Currently invites are stored + shown as copyable links only. |

---

You're live. If you get stuck at any step, share the exact log line and I'll
diagnose. Save this file — it's the source of truth for future redeploys.
