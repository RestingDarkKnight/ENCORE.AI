# ENCORE — Production Deploy Guide (Path B)

Deploy ENCORE from your GitHub repo to your own hosting stack.

```
   ┌──────────────────┐         ┌────────────────────┐         ┌────────────────────┐
   │  Vercel          │  HTTPS  │  Railway / Render  │  TLS    │  MongoDB Atlas     │
   │  React frontend  │ ──────▶ │  FastAPI backend   │ ──────▶ │  Managed cluster   │
   │  encore.app      │         │  api.encore.app    │         │                    │
   └──────────────────┘         └────────────────────┘         └────────────────────┘
```

There are three pieces. Do them in this order.

---

## 0 · Push to GitHub first

In the Emergent UI: **Save to GitHub → connect → select `RestingDarkKnight/ENCORE.AI`**.

`.env`, `node_modules/`, `__pycache__/`, `memory/` are all in `.gitignore` already — your secrets stay on Emergent.

After the push, verify on GitHub that the repo has `/app/backend`, `/app/frontend`, the new `Dockerfile`, `railway.json`, `vercel.json`, and this `DEPLOY.md`.

---

## 1 · MongoDB Atlas (database)

1. Create a free account at **https://www.mongodb.com/cloud/atlas/register**.
2. Build a free **M0 cluster** in a region close to where you'll host the backend (e.g. `us-east-1` if you pick Railway US).
3. **Security → Database Access** → add a user (e.g. `encore-prod` + a strong password). Save it.
4. **Security → Network Access** → **Add IP Address** → temporarily allow `0.0.0.0/0` so Railway/Fly can reach it. (Lock it down later to your host's egress IPs.)
5. **Database → Connect → Drivers → Python** → copy the connection string:
   ```
   mongodb+srv://encore-prod:<password>@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Substitute your real password. **Append a database name** at the end before the `?`:
   ```
   mongodb+srv://encore-prod:<pwd>@cluster0.xxxx.mongodb.net/encore_prod?retryWrites=true&w=majority
   ```

Save the full URL — you'll use it as `MONGO_URL` next. Use `DB_NAME=encore_prod`.

---

## 2 · Backend on Railway

1. Sign up at **https://railway.app** with your GitHub account.
2. **New Project → Deploy from GitHub Repo → `RestingDarkKnight/ENCORE.AI`**.
3. When prompted for the root: set the service's **Root Directory** to `/app/backend`. (Railway will auto-detect the `Dockerfile`.)
4. Open the service → **Variables** tab → **Raw Editor** → paste:
   ```
   MONGO_URL=mongodb+srv://encore-prod:<pwd>@cluster0.xxxx.mongodb.net/encore_prod?retryWrites=true&w=majority
   DB_NAME=encore_prod
   JWT_SECRET=<run: openssl rand -hex 32>
   JWT_ALGORITHM=HS256
   JWT_EXPIRY_MINUTES=1440
   ANTHROPIC_API_KEY=sk-ant-...your-key...
   CLAUDE_MODEL=claude-opus-4-8
   CLAUDE_EVAL_MODEL=
   EMERGENT_LLM_KEY=sk-emergent-...your-key...
   CORS_ORIGINS=https://YOUR-FRONTEND-DOMAIN.vercel.app
   DEMO_MANAGER_EMAIL=you@yourcompany.com
   DEMO_MANAGER_PASSWORD=<a-strong-password>
   DEMO_MANAGER_NAME=Your Name
   ```
   > **Important**: set `CORS_ORIGINS` to your exact Vercel URL once you have it (step 3). For the first boot you can use `*` and tighten it later.
5. **Settings → Networking → Generate Domain**. You'll get something like `encore-api-production.up.railway.app`. Save it.
6. Railway redeploys. Watch logs for `ENCORE backend ready (model=claude-opus-4-8)`.
7. Smoke test:
   ```bash
   curl https://encore-api-production.up.railway.app/api/health
   # → {"ok":true,"model":"claude-opus-4-8","claude_configured":true,"transcription_configured":true}
   ```

### Cost note
Railway's free trial gives you $5/month of usage. ENCORE backend is tiny — easily fits free tier at the start. Add a card when you're ready to scale.

---

## 3 · Frontend on Vercel

1. Sign up at **https://vercel.com** with GitHub.
2. **Add New → Project → Import `RestingDarkKnight/ENCORE.AI`**.
3. **Configure project**:
   - **Root Directory** → `app/frontend`
   - Framework Preset → **Create React App** (auto-detected via `vercel.json`)
   - Build command, install command, output dir → leave the defaults (they come from `vercel.json`)
4. **Environment Variables** → add:
   ```
   REACT_APP_BACKEND_URL=https://encore-api-production.up.railway.app
   ```
   (the exact URL from step 2.5 — no trailing slash, no `/api`)
5. **Deploy**. After ~2 min you'll have a URL like `encore-ai.vercel.app`.
6. Go back to **Railway → Variables** and update `CORS_ORIGINS` to that exact Vercel URL. Redeploy backend.

---

## 4 · Verify end-to-end

1. Visit your Vercel URL → see the Landing page.
2. Sign in with your `DEMO_MANAGER_EMAIL` / `DEMO_MANAGER_PASSWORD`.
3. Create a role → generate a case (live Claude!) → approve → invite yourself as the candidate (use a personal email; the link is just a token, no email is sent yet).
4. Open the take-link in another browser / incognito → run through the case → submit.
5. Back in the manager session → open the report. Auto-evaluation will have already fired in the background.

If something doesn't work, the three places to look are:
- Railway service logs (`/api/health` should return 200)
- Vercel function logs (build-time env vars baked in correctly?)
- Browser DevTools Network tab (any 4xx on `/api/*` calls?)

---

## 5 · Custom domains (optional, recommended)

### Frontend: `encore.app`
- Vercel → Project → **Domains** → add `encore.app` → follow DNS instructions at your registrar.

### Backend: `api.encore.app`
- Railway → Service → **Settings → Networking → Custom Domain** → add `api.encore.app` → set the CNAME at your DNS provider.
- Update Vercel env `REACT_APP_BACKEND_URL` to `https://api.encore.app` → redeploy frontend.
- Update Railway env `CORS_ORIGINS` to `https://encore.app` → redeploy backend.

---

## 6 · Production hardening (do these before real candidates take cases)

| Item | Action |
|---|---|
| **JWT_SECRET** | Make sure it's a 32+ byte random string (`openssl rand -hex 32`). Never reuse the dev one. |
| **Mongo network** | In Atlas → Network Access, replace `0.0.0.0/0` with Railway's egress IPs (see Railway docs → IP allowlist). |
| **Demo seed** | Either disable the auto-seed by removing the call in `server.py` lifespan, OR change `DEMO_MANAGER_PASSWORD` to something only you know. |
| **CORS** | Tighten `CORS_ORIGINS` to your exact production domain — no `*`. |
| **Secrets rotation** | Set a calendar reminder to rotate `JWT_SECRET` and `ANTHROPIC_API_KEY` every 90 days. |
| **Monitoring** | Railway has built-in metrics. For deeper observability, add Sentry to backend (1 env var). |
| **Backups** | Atlas free tier doesn't include backups. Snapshot-restore costs a few $/month and is worth it the day you ship to real users. |

---

## 7 · Alternative hosts (drop-in)

The `Dockerfile` is portable.

- **Render**: New Web Service → connect GitHub → root `/app/backend` → it auto-detects the Dockerfile. Add the same env vars. The `Procfile` is also there as a fallback.
- **Fly.io**: `cd /app/backend && fly launch` (uses the Dockerfile). Set secrets via `fly secrets set ANTHROPIC_API_KEY=... MONGO_URL=...`.
- **Google Cloud Run**: `gcloud run deploy encore-api --source /app/backend` — same Dockerfile, same env vars.

For the frontend, Vercel is the easiest, but Netlify, Cloudflare Pages, and Render Static Sites all work identically (build cmd `yarn build`, publish dir `build`).

---

## Quick reference — every env var

### Backend (Railway / Render / Fly)
| Var | Required | Example / default |
|---|---|---|
| `MONGO_URL` | ✅ | `mongodb+srv://user:pwd@cluster.mongodb.net/encore_prod` |
| `DB_NAME` | ✅ | `encore_prod` |
| `JWT_SECRET` | ✅ | output of `openssl rand -hex 32` |
| `JWT_ALGORITHM` |  | `HS256` |
| `JWT_EXPIRY_MINUTES` |  | `1440` |
| `ANTHROPIC_API_KEY` | ✅ for live AI | `sk-ant-...` |
| `CLAUDE_MODEL` |  | `claude-opus-4-8` |
| `CLAUDE_EVAL_MODEL` |  | (empty → falls back to `CLAUDE_MODEL`) |
| `EMERGENT_LLM_KEY` | ✅ for audio + Whisper | `sk-emergent-...` |
| `CORS_ORIGINS` | ✅ in prod | `https://encore.app,https://www.encore.app` |
| `DEMO_MANAGER_EMAIL` |  | `you@yourcompany.com` |
| `DEMO_MANAGER_PASSWORD` |  | strong, your choice |
| `DEMO_MANAGER_NAME` |  | `Your Name` |
| `PORT` | auto | Railway/Render set this — `Dockerfile` reads it |

### Frontend (Vercel)
| Var | Required | Example |
|---|---|---|
| `REACT_APP_BACKEND_URL` | ✅ | `https://api.encore.app` |

That's it. You're production.
