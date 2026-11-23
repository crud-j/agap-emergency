# Deploying AGAP: Phases 1–2 done, Phase 3 (Railway backend) running but Redis + Firebase still to fix

**Date:** 2026-11-24 (session started 2026-11-23)
**Status:** IN PROGRESS
**Bead(s):** none (bd not installed)
**Epic:** Deployment plan `docs/plans/DEPLOYMENT_PLAN.md`
**Chain:** `standalone-953e4889` seq `1`
**Parent:** `none — first in chain`
**Prior chain:** none — first in chain

---

## Related Handoffs

- `docs/handoff/2026-11-15_session-handoff.md` — SMS fixes, AI summary, AI provider, risk areas; separate work stream (features, not deployment)
- `docs/handoff/2026-11-15_risk-pin-place-finding.md` — MOD-51 risk-area pinning; separate work stream

## Reference Documents

- `docs/plans/DEPLOYMENT_PLAN.md` — **the** plan for this work. Phases 0–7, each with a "Done when" checklist. Status line at the top + ticked boxes record progress. Sections 1.0, 1.1 (extra notes), 1.2, 2 (step 4 + ticks), 3.1 (no-domain note), 3.2 (REDIS_URL `?family=0`, `BARANGAY_LINK_SECRET`, INITIAL_ADMIN note) were edited this session.
- `CLAUDE.md` — project rules (reliability rules: failed push/SMS must never block an incident; secrets never in git).
- Memory: `project-deployment-plan.md`, `feedback-git-bash-commits.md` (give commit commands in BOTH Git Bash and PowerShell forms), `project-backend-test-run.md` (jest needs `--config ./test/jest.config.ts`).

## The Goal

Get AGAP running without the laptop: website on **Vercel**, NestJS backend + Postgres (PostGIS) + Redis on **Railway** (Singapore), files on private **Cloudflare R2**, and an **EAS preview APK** pointing at the hosted backend. It is for demos/pilot testing (school project context: the user is a student), not hardened LGU production yet. The user wants to go **phase by phase**, with detailed click-by-click dashboard instructions, and keeps all secrets in **Bitwarden** (collection "AGAP Deployment"). The user is on the **Railway Trial** ($5 credit / 30 days) and wants to avoid paying if possible.

## Where We Are

- **Phase 0** (domain/accounts): no domain bought yet. Decided to run Phase 3 on Railway's free `*.up.railway.app` address; custom domain must exist before Phase 5 (APK bakes the backend URL in). Accounts in use: Cloudflare (R2 activated, $0 plan), Railway (Trial, GitHub login), Bitwarden (new).
- **Phase 1 (code) — DONE and committed** (commits `69df535`, `9462828`). Local proof: production image ran, `/v1/health` 200, DB connected, login path 401.
- **Phase 2 (R2) — DONE and committed** (`9570b06`). Bucket `agap-media`, APAC hint, r2.dev off; Account API token `agap-backend` (Object Read & Write, `agap-media` only, TTL Forever). `node scripts/check-storage.mjs` passed: HeadBucket OK + default checksums OK → plan step 1.5 NOT needed. Database starts fresh (no Garage file copy).
- **Phase 3 (Railway) — IN PROGRESS.**
  - Railway project name: `unique-achievement`, environment `production`. Backend service is named **`agap-emergency`** (created from the GitHub repo), domain **`agap-emergency-production.up.railway.app`** (port 3000).
  - The user had to add PostGIS and Redis services late (they were missing at first — the backend was alone on the canvas). As of the last message, PostGIS and Redis exist in the same project.
  - Backend variables set: `RAILWAY_DOCKERFILE_PATH=backend/Dockerfile`, `PORT=3000`, full B5 block (NODE_ENV=production, secrets from Bitwarden "AGAP – Railway backend secrets", R2 keys, WEBAUTHN_* for the Railway domain, feature switches, Firebase/Textbee/Map lines copied from local `backend/.env`).
  - Settings: Healthcheck Path `/v1/health`; **Pre-deploy Command** `npx prisma migrate deploy` (Custom Start Command must stay EMPTY — it was wrongly filled once).
  - **Migrations ran on Railway**: "41 migrations found", all applied, later deploy says "No pending migrations to apply."
  - **Last deploy (`2d97a1ec…`, after commit `07bbca8`)**: `Nest application successfully started`, `AGAP Backend running on http://0.0.0.0:3000`, `Database connection established`. Healthcheck outcome of that deploy NOT confirmed by the user.
  - **Remaining problem 1 — Redis not connected**: logs show `Redis unavailable for the geocode cache…`, `…guest report limits…`, `…session revocation…`, `…route cache…`, `…transport retries…`, each with an EMPTY error message (typical of an AggregateError when connecting to `localhost` → REDIS_URL was probably empty). BullMQ jobs (SMS, push, SLA, ETA) cannot run without Redis. The user was about to fix `REDIS_URL` (either `${{Redis.REDIS_URL}}?family=0` or the literal private URL + `?family=0`) and redeploy.
  - **Remaining problem 2 — Firebase key unreadable**: `Firebase Admin could not start (Failed to parse private key.) … Push is off.` (both NotificationProcessor and AnnouncementPushProcessor). Backend no longer crashes because of it (fix `07bbca8`). User told to re-paste `private_key` straight from the Firebase service-account JSON, no quotes; and asked whether push works on the laptop today (unanswered).
  - **Remaining problem 3 — DATABASE_URL uses the public proxy** `gondola.proxy.rlwy.net:35360` (i.e. points at `DATABASE_PUBLIC_URL`). Works, but egress costs; should be the private `${{<db>.DATABASE_URL}}` (`…railway.internal…`).
- **Phase 3 Part C (seed) — NOT started.** Seed from laptop with Railway's public DB URL + production `ID_PIN_PEPPER` + `INITIAL_ADMIN_EMAIL/PASSWORD`, then change every demo account password.
- **Phases 4–6** not started. Phase 7 is reference only.
- **Uncommitted in working tree** (not this session's work, leave alone): `frontend/tsconfig.tsbuildinfo` (typecheck artifact), `docs/presentation/Justine_Soliman_IPO_Report.md` (user's own file).
- **All session commits are pushed to `origin/main`** (Railway auto-deploys on every push to main).

## What We Tried (Chronological)

1. **Plan review (start of session).** Verified Phase 1 claims against code: `backend/Dockerfile` production stage copied only `backend/node_modules` (pnpm symlinks would break); `frontend/next.config.mjs` blanked both API and WS URLs under `PROXY_API`; `frontend/vercel.json` missing. All confirmed.
2. **Found pnpm version mismatch (new step 1.0).** Local pnpm 11.1.1; `pnpm-workspace.yaml` uses pnpm-11-only settings (`allowBuilds`, `minimumReleaseAgeExclude`); Dockerfile used `pnpm@9` (+ unpinned `pnpm` in prod stage), CI used pnpm 9 / Node 20. Fix: `"packageManager": "pnpm@11.1.1"` in root package.json; Dockerfile `corepack enable && corepack install`; CI drops `version: 9` and moves to Node 22 (pnpm 11 needs Node ≥ 22.13, confirmed via `npm view pnpm@11.1.1 engines` → `>=22.13`); `mobile/eas.json` pins `node: 22.14.0`, `pnpm: 11.1.1` on all 3 profiles. `pnpm install --frozen-lockfile --offline` → "Already up to date", lockfile unchanged.
3. **User's commit failed in PowerShell** because I gave a Bash heredoc. Gave PowerShell here-string form (`@'…'@ | git commit -F -`). Memory updated: always give both forms.
4. **1.1 Dockerfile rebuild — first build failed** at `pnpm install`: backend `postinstall` runs `prisma generate` but schema not yet copied ("Could not find Prisma Schema"), plus Prisma warning "failed to detect libssl". Fix: copy `backend/prisma.config.ts` and `backend/prisma` before install (in both development and build stages); install `openssl ca-certificates` in base.
5. **Shell-edit mangling:** a Python heredoc wrote a literal `\n` into the Dockerfile RUN line ("E: Unable to locate package n"). Fixed with Edit tool. (Memory already warns: no backslash edits via shell.)
6. **Second build succeeded** (took >10 min, ran in background). Image `agap-backend:test` = **2.89 GB**. In-image checks: 0 `.env` files, `@agap/shared` resolves, pnpm 11.1.1, Prisma CLI works.
7. **`.dockerignore` secret leak found:** bare `.env` pattern only matched repo root → `backend/.env` would be baked into local images. Changed to `**/.env`, `**/.env.*`, `!**/.env.example`; also excluded `frontend`.
8. **Local run test of the image:** `backend/.env` mounted read-only + scratchpad `docker-start.js` that rewrites only DATABASE_URL/REDIS_URL/STORAGE_ENDPOINT hosts to `host.docker.internal` and prints no values; port 3005. Result: health 200, DB connected, login 401. **Textbee pollers started in the container** (BarangaySmsPoller "every 15 s") — stopped container immediately to avoid double SMS processing.
9. **1.2 next.config WS URL:** plan assumed `NEXT_PUBLIC_WS_URL` unset locally, but `frontend/.env.local` sets `ws://localhost:3000`. Implemented `keepWsUrl = NODE_ENV==='production' && !!NEXT_PUBLIC_WS_URL`; `next dev` still blanks it. Verified a prod build (`PROXY_API=true … NEXT_PUBLIC_WS_URL=wss://api.example.test NEXT_DIST_DIR=.next-prod`) contains the WS URL in 3 chunks and no `http://localhost:3000/v1`.
10. **Phase 2 R2:** wrote `backend/scripts/check-storage.mjs`; smoke-tested failure paths locally (missing env → exit 2; ECONNREFUSED → exit 1). User ran it with real keys via `Read-Host` → passed.
11. **Hosting alternatives discussed (user asked for $0 options):** Oracle Always Free (viable, self-managed), Render free (sleeps — rejected), Koyeb/Fly (no), Google e2-micro (1 GB US — no), Neon/Supabase + Upstash (Upstash command limits vs BullMQ — no), **Cloudflare Workers (rejected: no always-on process, no Socket.io, 10 ms CPU vs bcrypt ~100 ms, no native modules, no Redis, ~3 MB bundle cap)**, **Azure for Students** (user's cost analysis: $6.13 in ~6 days, $4.88 of it a VM in Japan East, resource group `smarthealth-rg` → existing project burns ~$30/month of the $100 credit; rejected). **User chose Railway Trial.**
12. **First Railway build failed: Railpack** ("Railpack failed to prepare the build") — service had no Dockerfile at repo root. Fix: variable `RAILWAY_DOCKERFILE_PATH=backend/Dockerfile`.
13. **Second Railway build failed: "The Dockerfile failed validation"** after 10 s — Railway validates ALL stages and rejects `--mount=type=cache` ids not prefixed with its service id; the development stage still had one. Removed from every stage (commit `1ac3895`). `docker build --check` → no warnings.
14. **Third: build OK, healthcheck failure.** Logs showed healthcheck hitting `…:8080/v1/health` (Railway's PORT) and a loop of `Error: Connection url is empty` from Prisma with no Nest output → (a) `npx prisma migrate deploy` had been put in **Custom Start Command** instead of Pre-deploy; (b) DATABASE_URL empty. Fixes: set `PORT=3000`; move command to Pre-deploy, clear Start Command.
15. **Fourth: pre-deploy runs once but `Connection url is empty`.** Root cause found from the user's canvas screenshot: the project only had the `agap-emergency` service — **PostGIS and Redis had never been created** (the `${{` picker only listed the service's own RAILWAY_* vars). User added both into the same project and set references.
16. **Fifth: migrations applied (41), then Nest crash loop `Failed to parse private key.`** in `NotificationProcessor` constructor (firebase-admin `cert()`), killing boot. Code fix (commit `07bbca8`): shared `ensureFirebaseApp()` that normalizes the key and never throws.
17. **Sixth (latest): app starts and listens on 3000**; Firebase logs "could not start … Push is off" (key still unreadable); Redis unavailable warnings (REDIS_URL probably empty). User asked whether they can paste the literal private Redis URL → yes with `?family=0`, reference preferred; warned they had pasted the Redis password into chat (low risk: private network only; rotate later if possible).

## Key Decisions

- **Hosting: Railway Trial now**, decide Hobby ($5/mo) vs moving later. Rejected: Cloudflare Workers (architecture mismatch), Render free (sleeps; SOS must not wait for cold start), Azure for Students (credit shared with an existing ~$30/month project), Oracle Always Free (viable but self-managed; kept as the $0 fallback).
- **pnpm version single source of truth = root `packageManager`** (pnpm 11.1.1); every builder reads it (corepack in Docker, action-setup in CI) or pins the same (eas.json).
- **Production image = whole workspace copied** (simple, keeps Prisma CLI + ts-node for migrate/seed; 2.89 GB). Rejected for now: `pnpm deploy --prod` slim image (needs `"files": ["dist"]` in shared + prisma generate inside output) — Phase 7 follow-up.
- **No BuildKit cache mounts anywhere** in `backend/Dockerfile` (Railway rejects them, even in unused stages). Local docker-compose dev rebuilds are slower as a trade-off.
- **WS URL kept only in production builds**; REST stays same-origin via Vercel proxy (SameSite=Strict refresh cookie).
- **Migrations via Railway Pre-deploy** (`npx prisma migrate deploy`) instead of running them from the laptop; seed still from the laptop.
- **Firebase init must never crash boot**; it logs (without the key) and turns push off.
- **Start on `*.up.railway.app`**, buy domain before Phase 5. WEBAUTHN_RP_ID/ORIGIN currently = Railway domain (passkeys registered now will break when switching to `api.<domain>` — acceptable for testing).
- **Database starts fresh** (no Garage → R2 copy).
- **`PROFILE_PHOTO_CHECKS=off`** on the Trial (the selfie check needs ~1 GB RAM).
- **`BARANGAY_ALERTS_ENABLED=false`** (real barangay numbers would be texted in production mode).
- **`AI_ASSIST_ENABLED=false`**.

## Evidence & Data

### Commits this session (all pushed to origin/main)

| Hash | Summary |
|---|---|
| `69df535` | build: pin pnpm 11.1.1 via packageManager for Docker, CI and EAS |
| `9462828` | build: production backend image, direct Socket.io in prod web build, vercel.json |
| `9570b06` | chore(deploy): object storage check script, Phase 2 (R2) done |
| `428d154` | docs(deploy): Railway notes for Phase 3 (no-domain start, Redis family=0) |
| `1ac3895` | fix(docker): drop the pnpm cache mount from every stage for Railway |
| `07bbca8` | fix(push): a bad FIREBASE_PRIVATE_KEY turns push off instead of crashing boot |

### Railway deploy attempts

| # | Symptom | Cause | Fix |
|---|---|---|---|
| 1 | "Railpack failed to prepare the build" | No root Dockerfile; Railpack guessed | `RAILWAY_DOCKERFILE_PATH=backend/Dockerfile` |
| 2 | "The Dockerfile failed validation" (10 s) | `--mount=type=cache,id=agap-pnpm-store` in development stage | Removed cache mounts from all stages (`1ac3895`) |
| 3 | Build 1:37 OK, Healthcheck failure (1:42) | Healthcheck on PORT 8080; migrate command in Start Command; DATABASE_URL empty | `PORT=3000`; command → Pre-deploy |
| 4 | Pre-deploy: `Connection url is empty` | PostGIS/Redis services did not exist | User added both to the project |
| 5 | 41 migrations applied; Nest crash loop `Failed to parse private key.` | Unguarded firebase-admin init | `ensureFirebaseApp()` (`07bbca8`) |
| 6 | App started on :3000; Firebase "Push is off"; Redis unavailable ×5 | Key still unreadable; REDIS_URL probably empty | In progress (user editing variables) |

### Local test results

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile --offline` with pnpm pin | "Already up to date", lockfile unchanged |
| Docker image size | 2.89 GB |
| `.env` files inside image | 0 |
| Local container `/v1/health` (port 3005) | 200 `{"status":"ok",…,"version":"1.0.0"}` |
| Local container login with fake user | 401 (proves DB path) |
| Prod web build with PROXY_API + WS URL | WS URL found in 3 chunks; localhost API URL in 0 |
| `pnpm typecheck` (shared, mobile, frontend, backend) | all Done |
| Notification tests (`test/notifications`) | 4 suites, 74/74 pass |
| Full backend suite | 137/138 suites, 2405/2406 tests; 1 flake `auth-phase3` "MfaService — login decision › asks enrolled users…" 5 s timeout; passes alone |
| `check-storage.mjs` against R2 | HeadBucket OK, default checksums OK |

### Cost data (Azure, user screenshot, Nov 2026)

| Service | Cost |
|---|---|
| Virtual Machines | $4.88 |
| Virtual Network | $0.64 |
| Storage | $0.60 |
| Bandwidth | <$0.01 |
| **Total (Nov 17–23)** | **$6.13**, location Japan East, RG `smarthealth-rg` |

### Railway variables (names only — values in Bitwarden / Railway)

```
RAILWAY_DOCKERFILE_PATH=backend/Dockerfile
PORT=3000
DATABASE_URL=${{<PostGIS service>.DATABASE_URL}}      # currently resolves to PUBLIC proxy — fix
REDIS_URL=${{Redis.REDIS_URL}}?family=0               # being fixed
NODE_ENV=production  BACKEND_PORT=3000  BACKEND_HOST=0.0.0.0
JWT_SECRET JWT_REFRESH_SECRET MEDICAL_ENCRYPTION_KEY MFA_ENCRYPTION_KEY
ID_DOCUMENT_ENCRYPTION_KEY ID_PIN_PEPPER BARANGAY_LINK_SECRET   # Bitwarden "AGAP – Railway backend secrets"
ID_VERIFICATION_REQUIRED=true
STORAGE_ENDPOINT STORAGE_ACCESS_KEY STORAGE_SECRET_KEY            # Bitwarden "AGAP – Cloudflare R2 (agap-media)"
STORAGE_BUCKET=agap-media STORAGE_REGION=auto STORAGE_LOCAL_FALLBACK=false
WEBAUTHN_RP_ID=agap-emergency-production.up.railway.app
WEBAUTHN_ORIGIN=https://agap-emergency-production.up.railway.app
WEBAUTHN_ANDROID_PACKAGE=com.agap.emergency
CITIZEN_SMS_SOS_ENABLED=true BARANGAY_ALERTS_ENABLED=false AI_ASSIST_ENABLED=false PROFILE_PHOTO_CHECKS=off
FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY   # key currently unparseable
TEXTBEE_API_KEY TEXTBEE_DEVICE_ID MDRRMO_OPS_PHONE
MAP_* lines and WEBAUTHN_ANDROID_CERT_FINGERPRINTS copied from local backend/.env (localhost ones skipped)
```
Not yet set (Phase 4): `CORS_ORIGIN`, `PUBLIC_APP_URL`. `TRUST_PROXY` left default (Phase 6 decision).

### Secret generation command used (PowerShell)

```powershell
node -e "const c=require('crypto');for(const n of ['JWT_SECRET','JWT_REFRESH_SECRET','MEDICAL_ENCRYPTION_KEY','MFA_ENCRYPTION_KEY','ID_DOCUMENT_ENCRYPTION_KEY','ID_PIN_PEPPER','BARANGAY_LINK_SECRET'])console.log(n+'='+c.randomBytes(32).toString('base64'))"
```
Encryption keys must be exactly 32 bytes base64 (`parseEncryptionKey` in `backend/src/common/crypto/secret-box.ts` throws otherwise). `ID_PIN_PEPPER` ≥ 32 chars.

### PowerShell helper used to copy .env lines to clipboard (prints names only)

Keys: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, TEXTBEE_API_KEY, TEXTBEE_DEVICE_ID, MDRRMO_OPS_PHONE, MAP_PROVIDER, MAP_API_KEY, MAP_STYLE_URL, MAP_SATELLITE_STYLE_URL, MAP_ROUTER, MAP_PROVIDER_ROUTING_URL, MAP_GEOCODER_URL, WEBAUTHN_ANDROID_CERT_FINGERPRINTS. Lines containing `localhost|127.0.0.1` were skipped on purpose (public map servers are defaults). The helper warns if FIREBASE_PRIVATE_KEY lacks "END PRIVATE KEY" (multi-line in .env).

### Railway dashboard facts learned (where things are)

| Need | Where in Railway |
|---|---|
| Dockerfile path | Service → Variables → `RAILWAY_DOCKERFILE_PATH` (Railway only auto-detects a Dockerfile at repo root) |
| Public domain | Service → Settings → Networking → Public Networking → Generate Domain → port 3000 |
| Healthcheck | Service → Settings → Deploy → Healthcheck Path |
| Migrations | Service → Settings → Deploy → **Pre-deploy Command** (may sit behind "+ Add pre-deploy step"); Custom Start Command stays empty |
| Region | Service → Settings → Regions → Southeast Asia (Singapore), per service |
| References | Variables → value box, type `${{` → picker lists other services **only if in the same project** |
| Raw Editor | Variables → Raw Editor (paste `.env`-style block, keeps existing lines) |
| Logs | Deployment → View logs → Build Logs / Deploy Logs (user exports JSON) |
| Railway system vars | `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_PRIVATE_DOMAIN`, etc. (these were the only ones offered when DBs were missing) |
| Railway's `PORT` | Railway injects PORT (healthcheck hit 8080); backend ignores it → set `PORT=3000` |

### Cloudflare R2 setup done (for reference)

- R2 activated: "Activate R2 — Purchase complete", $0/month plan, 10 GB storage, 1 M Class A, 10 M Class B ops/month included; overage $0.015/GB-month, $4.50/M Class A, $0.36/M Class B.
- Bucket `agap-media`: Location hint Asia-Pacific (APAC), Standard class, Public Development URL disabled, no custom domain, no CORS policy.
- Token: R2 overview → Account Details → API Tokens → Manage → **Create Account API token**, name `agap-backend`, Object Read & Write, specific bucket `agap-media`, TTL Forever, no IP filter. Values saved: Access Key ID (Bitwarden Username), Secret Access Key (Password), default S3 endpoint `https://<account-id>.r2.cloudflarestorage.com` (Website/URI); Cloudflare "Token value" in Notes.
- The user dismissed Cloudflare's "Enable Agent Lee access" panel (AI assistant asking for an API token) — told not to grant it.

### Hosting comparison given to the user

| Option | Fit for AGAP backend | Why |
|---|---|---|
| Railway Trial → Hobby | ✅ chosen | Always-on, Docker, PostGIS template, Redis, $5 Trial credit; Hobby $5/mo incl. $5 usage; est. $10–20/mo low traffic |
| Oracle Cloud Always Free | ✅ $0 fallback | ARM VM up to 4 OCPU/24 GB, Singapore possible but capacity errors; idle reclaim (avoid via PAYG); self-managed Docker/Caddy/backups; card for verification |
| Azure for Students | ⚠️ rejected | $100 credit shared with `smarthealth-rg` (~$30/mo burn); free B1s VM 1 GB + Postgres Flexible B1ms 12 mo; Redis not free; can't charge card (services stop at $0) |
| Render free | ❌ | Sleeps after 15 min; free Postgres deleted after 30 days |
| Koyeb / Fly.io | ❌ | Koyeb free sleeps; Fly no free tier for new users |
| Google e2-micro | ❌ | 1 GB RAM, US regions only |
| Neon/Supabase + Upstash | ❌ | Upstash free command cap vs BullMQ + 15 s pollers; still no backend host |
| Cloudflare Workers | ❌ | No always-on process, no Socket.io, 10 ms CPU (bcrypt ~100 ms), no native modules (onnxruntime, sharp), no Redis, ~3 MB bundle |

### Local Docker test caveat (record for any future local prod test)

- Container started BarangaySmsPoller ("Polling Textbee for barangay SMS replies every 15 s") against the real Textbee device; stopped within seconds (~15:05 UTC+8 on 2026-11-23). An SMS arriving then may have been processed twice.
- `docker run` with `MSYS_NO_PATHCONV=1`, `-v "$(cygpath -w backend/.env):/app/backend/.env:ro"`, `-p 3005:3000`; Postgres + Redis native on the laptop (reachable via `host.docker.internal`), Garage was down.
- Reading `backend/.env` contents directly from tool commands is blocked by the auto-mode classifier — use mount/script approaches that never print values.

## Code Analysis

- `backend/src/main.ts:110-112` — port = `BACKEND_PORT` (default 3000), host `BACKEND_HOST` (default 0.0.0.0); **ignores Railway's `PORT`** → hence `PORT=3000` variable. CORS from `CORS_ORIGIN` (comma list), line ~45.
- `backend/src/realtime/agap.gateway.ts:22-28` — Socket.io namespace `/agap`, CORS origins from `process.env.CORS_ORIGIN`.
- `backend/src/app.module.ts:47-66` — `ConfigModule.forRoot({ envFilePath: ['.env.local', '.env'] })`; BullMQ `connection: { url: REDIS_URL }`. BullMQ (`redis-connection.js:182-183`) extracts `url` and calls `new IORedis(url, rest)` → URL query `?family=0` works. Verified: ioredis 5.11.1 string URL parses host/port/family.
- Other Redis clients take `REDIS_URL` as a string: `session-revocation.service.ts:38`, `guest-report-limit.service.ts:152`, `transport-request-cache.service.ts:31`, `geocode-cache.service.ts:30`, `route-cache.service.ts:41`, `mfa-state.store.ts:24-29`. They log "Redis unavailable … : {err}" and fall back.
- `backend/src/config/config.validation.ts` — required: DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET; production requires MEDICAL_ENCRYPTION_KEY; `ID_VERIFICATION_REQUIRED=true` requires ID_DOCUMENT_ENCRYPTION_KEY + ID_PIN_PEPPER (≥ MIN length); `BARANGAY_LINK_SECRET` optional (falls back to key from JWT_SECRET); `TRUST_PROXY` default `'loopback, linklocal, uniquelocal'`.
- `backend/src/media/media.service.ts:133-183` — S3Client `forcePathStyle: true`; `ensureBucket()` HeadBucket → on NoSuchBucket/NotFound creates bucket; any other error logs "Object storage unreachable" and throws ServiceUnavailable → local-disk fallback unless `STORAGE_LOCAL_FALLBACK=false`.
- `backend/prisma.config.ts` — loads `backend/.env` via dotenv; `DATABASE_URL` from env wins; seed = `ts-node prisma/seed/seed.ts`.
- `backend/prisma/seed/seed.ts:35-46,1117-1126` — `INITIAL_ADMIN_EMAIL` (default `admin@agap.local`), `INITIAL_ADMIN_PASSWORD` (default `ChangeThisPasswordImmediately!`); seed only, Railway does not need them.
- `frontend/lib/websocket.ts:5,11` — `WS_URL = NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000'`; `io(`${WS_URL}/agap`)`; empty string ⇒ same origin.
- `backend/src/notifications/firebase-admin.ts` (new) — `normalizeFirebasePrivateKey(raw)`: trim, strip one pair of surrounding `"`/`'`, `\\r`→'', `\\n`→newline, CRLF→LF, trim, append `\n`. `ensureFirebaseApp(config, logger): boolean` — returns true if app exists/initialized; warns when any of 3 vars missing; catches `initializeApp` errors and logs message without the key. Send paths in both processors already skip when `getApps().length === 0` (notification.processor ~line 80, announcement-push ~line 95).

## Files Changed

### Source code
- `package.json` — `"packageManager": "pnpm@11.1.1"`; engines node `>=22.13.0`, pnpm `>=11.0.0`.
- `backend/Dockerfile` — base: apt `openssl ca-certificates`, `COPY package.json`, `corepack enable && corepack install`, `COREPACK_ENABLE_DOWNLOAD_PROMPT=0`; dev + build stages copy `backend/prisma.config.ts` and `backend/prisma` before `pnpm install --frozen-lockfile`; no cache mounts; build stage runs `pnpm --filter @agap/shared build`, `pnpm db:generate`, `pnpm build`; production `FROM base`, `COPY --from=build /app /app`, `WORKDIR /app/backend`, `CMD ["node","dist/main"]`, `PROFILE_PHOTO_MODEL_DIR=/app/.cache/models`.
- `.dockerignore` — `**/.env`, `**/.env.*`, `!**/.env.example`; excludes `frontend` and `mobile`.
- `frontend/next.config.mjs` — `keepWsUrl`; env override `{ NEXT_PUBLIC_API_URL: '', ...(keepWsUrl ? {} : { NEXT_PUBLIC_WS_URL: '' }) }`.
- `frontend/vercel.json` (new) — installCommand `pnpm install --frozen-lockfile --filter @agap/frontend...`, buildCommand `pnpm --filter @agap/shared build && pnpm build`, regions `["sin1"]`. **Untested** until Phase 4.
- `backend/src/notifications/firebase-admin.ts` (new) — see Code Analysis.
- `backend/src/jobs/processors/notification.processor.ts`, `announcement-push.processor.ts` — constructors call `ensureFirebaseApp(config, this.logger)`; imports reduced to `getApps`.

### Tests
- `backend/test/notifications/firebase-admin.spec.ts` (new) — 9 tests: 6 key formats (generated 1024-bit RSA PKCS8 PEM), empty/missing, init-once, missing-var warn, rejected key doesn't throw and isn't logged.

### Scripts
- `backend/scripts/check-storage.mjs` (new) — S3 check with backend settings; reads STORAGE_* env; HeadBucket + put/get/delete with default checksums, then retry with `WHEN_REQUIRED`; exit 0/1/2.

### Config / CI
- `.github/workflows/ci.yml` — `pnpm/action-setup@v4` without `version` (reads packageManager); `node-version: 22` (both jobs).
- `mobile/eas.json` — `node: "22.14.0"`, `pnpm: "11.1.1"` on development, preview, production.

### Docs
- `docs/plans/DEPLOYMENT_PLAN.md` — status line; 1.0 section; 1.1 extra findings; 1.2 refined; Phase 1 + 2 boxes ticked; 2 step 4; 3.1 no-domain note; 3.2 table rows for REDIS_URL, BARANGAY_LINK_SECRET, INITIAL_ADMIN_*.

### Scratch (not in repo)
- `C:\Users\githu\AppData\Local\Temp\claude\b3f723b3e9521670\c08f33a2-47c2-41a0-918e-285a90ac8ce9\scratchpad\docker-start.js` — local container start helper (rewrites DB/Redis/storage hosts to host.docker.internal).

## User Feedback & Preferences (REQUIRED — never omit)

- "help me phase by phase" — work one plan phase at a time; wait for the user between parts.
- Wants **detailed, click-by-click dashboard steps** ("make sure its detailed and tell me where to click").
- Runs commits themselves; mixes **PowerShell and Git Bash** — give both commit forms. Bash heredoc failed in PowerShell this session.
- Wants **$0 where possible**; asked about Workers, Azure for Students; finally "lets use railway instead" / "lets go with railway trial".
- Stores secrets in **Bitwarden**, collection "AGAP Deployment": items "AGAP – Cloudflare R2 (agap-media)" and secure note "AGAP – Railway backend secrets". Never ask them to paste secrets into chat; give `Read-Host`/clipboard commands they run.
- The user once pasted the Redis private URL including password into chat — remind gently, don't repeat it.
- Asked for terse answers sometimes ("just give me the value for DATABASE_URL and REDIS_URL").
- Wants the database to **start fresh**.
- Wants handoffs + a paste prompt when context gets long.
- Screenshots and Railway log JSON exports are how they report status; logs can be huge.

## Where We're Going

1. **Finish Phase 3 backend health** (user mid-way):
   a. `REDIS_URL` = `${{Redis.REDIS_URL}}?family=0` (or the private literal + `?family=0`); eye icon must show `redis://…@redis.railway.internal:6379?family=0`.
   b. `DATABASE_URL` → private reference (eye shows `…railway.internal…`, not `gondola.proxy.rlwy.net`).
   c. `FIREBASE_PRIVATE_KEY` re-pasted from the service-account JSON `private_key` value, no quotes; confirm `FIREBASE_CLIENT_EMAIL`/`PROJECT_ID` from the same JSON.
   d. Redeploy; logs must show no `Redis unavailable`, `Firebase Admin initialized`, `Nest application successfully started`; browser `https://agap-emergency-production.up.railway.app/v1/health` → `{"status":"ok"…}`.
2. **Redis `maxmemory-policy` = `noeviction`** check (plan 3.1 step 3).
3. **Phase 3 Part C — seed from laptop** (PowerShell, plan 3.3): `$env:DATABASE_URL` = Railway **public** DB URL (DATABASE_PUBLIC_URL), `$env:ID_PIN_PEPPER` = same as Railway, `$env:INITIAL_ADMIN_EMAIL/PASSWORD` new; `cd backend; pnpm db:seed`. Use `Read-Host` for secrets. Then sign in to every demo account and change passwords (they're "must change password" with a public dev password).
4. Check `https://agap-emergency-production.up.railway.app/.well-known/assetlinks.json` shows package + fingerprint. Tick Phase 3 boxes in the plan and record the Railway lessons there (PORT=3000, Pre-deploy vs Start Command, services must be in one project, no cache mounts).
5. **Phase 4 (Vercel)**: root dir `frontend`, include files outside root, Node 22, env `PROXY_API=true`, `BACKEND_INTERNAL_URL=https://agap-emergency-production.up.railway.app`, `NEXT_PUBLIC_WS_URL=wss://agap-emergency-production.up.railway.app`, map keys; then set `CORS_ORIGIN` and `PUBLIC_APP_URL` on Railway to the Vercel URL and add it to `WEBAUTHN_ORIGIN`/`RP_ID`.
6. **Domain decision** before Phase 5 (APK bakes in `EXPO_PUBLIC_API_URL`).
7. Phase 5 (EAS preview APK) and Phase 6 (end-to-end checks, `TRUST_PROXY` decision).

## Risks & Blockers

- **Railway Trial credit** ($5 / 30 days, banner "30 days or $5.00 left"). Failing builds and the public DB proxy consume it. Hobby upgrade likely needed for an always-on backend.
- **Textbee double-processing**: while Railway backend runs, do NOT run the local backend (or set `CITIZEN_SMS_SOS_ENABLED=false` and `BARANGAY_SMS_REPLIES_ENABLED=false` locally). Same applies to any local prod container test.
- **Redis down ⇒ BullMQ jobs (SMS/push/SLA/ETA) don't run** even though the app is "up".
- **Every push to `main` triggers a Railway deploy** — avoid pushing broken work.
- Image 2.89 GB → slow builds (~1.5–10 min); Railway Trial image limit believed 4 GB.
- `frontend/vercel.json` filtered install untested.

## Open Questions

- Did the latest deploy's healthcheck pass (`/v1/health` from the browser)?
- Does push currently work on the laptop (is the local `.env` Firebase key valid)?
- Exact service names on the canvas (PostGIS service name for the `${{…}}` reference)?
- Will the user buy a domain (and which), or stay on `*.up.railway.app` / `*.vercel.app`?
- Railway Trial → Hobby upgrade timing.

## Quick Start for Next Session

```bash
# Reference docs
docs/plans/DEPLOYMENT_PLAN.md          # the plan; Status line + Done-when ticks
CLAUDE.md

# Key files to read first
backend/Dockerfile
backend/src/notifications/firebase-admin.ts
backend/src/main.ts                    # BACKEND_PORT, CORS
backend/src/app.module.ts              # env files, BullMQ Redis
backend/scripts/check-storage.mjs

# Verify current state (user runs in browser)
https://agap-emergency-production.up.railway.app/v1/health

# Backend tests (if code changes)
cd backend && npx jest --config ./test/jest.config.ts --maxWorkers=50%
pnpm typecheck

# Next action
Ask the user for the result of the redeploy after fixing REDIS_URL / DATABASE_URL / FIREBASE_PRIVATE_KEY
(Deploy Logs: no "Redis unavailable", "Firebase Admin initialized"), then do Phase 3 Part C (seed).
```

## Session Closed
**Closed at:** 2026-11-24 (local)
**Commit:** the `session: deployment-phases-1-3` commit that includes this note (not pushed: a push to main triggers a Railway deploy)
**Session status:** Handed off to next session
