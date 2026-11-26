# Plan: Deploy AGAP (Web on Vercel, Backend on Railway, Files on R2, Preview APK)

> **Status:** Phases 1 and 2 done 2026-11-23. Phase 3 done 2026-11-24 on `agap-emergency-production.up.railway.app`, Phase 4 done 2026-11-24 on `agap-emergency.vercel.app` (no domain yet). Keys live in Bitwarden (collection "AGAP Deployment"). Database starts fresh.
> **How to use:** do one phase at a time, in order. Each phase ends with a **Done when** checklist that must pass before the next phase starts.
> **Scope:** a working public deployment for demos and pilot testing. It is not yet a hardened production setup for real LGU operations; see [Phase 7](#phase-7-known-limits-and-follow-ups).
> **Modules touched:** MOD-10 (media), MOD-17/19 (SMS paths), MOD-20 (WebSocket), MOD-21 (ops dashboard), MOD-47 (auth), MOD-48 (privacy).

## Context

Today AGAP runs on one laptop:
- **Backend:** `pnpm start:dev`.
- **Database and Redis:** Postgres and Redis, local.
- **Files:** Garage in WSL.
- **Phone access:** an ngrok tunnel, so the dev-client APK can reach the backend.

The goal is to reach everything without the laptop:

| Part | Where | Address |
|---|---|---|
| Website (Operations Center, Hospital Portal, barangay `/b` page) | **Vercel** | `https://app.<domain>` |
| Backend (NestJS REST + Socket.io + BullMQ jobs + Textbee poller) | **Railway**, Singapore region | `https://api.<domain>` |
| Database | Railway Postgres with **PostGIS** | private to Railway |
| Redis | Railway Redis | private to Railway |
| Files (incident photos and videos, sealed ID images) | **Cloudflare R2**, private bucket | private |
| Citizen and Responder app | **EAS preview APK** (Android) | talks to `api.<domain>` |

`<domain>` is a domain the team buys. Both addresses use it, so they stay the same for as long as the domain is kept.

### Why this split

- **Vercel cannot run the backend.** The backend holds Socket.io connections open, runs BullMQ workers, polls Textbee every 15 s and runs SLA/ETA jobs. It needs an always-on process. Vercel functions are short-lived.
- **Railway over Render:** the backend needs about 1 GB of RAM when the on-server selfie check is on. On Render that is the $25 Standard plan, plus a separate paid Redis. Railway bills for actual use and keeps backend, Postgres and Redis in one project. Render's free tier is ruled out because it sleeps after 15 minutes, and an SOS must never wait for a cold start.
- **Vercel over Cloudflare Workers:** Workers need the OpenNext adapter, which is pre-1.0 and supports only the latest Next.js 14 minor release. The paid Workers plan would likely be needed for bundle size and CPU time. Vercel runs Next.js as is. We can revisit this later.
- **R2:** S3-compatible, so the current `S3Client` code works unchanged. There are no download fees.

### Rules that apply to every phase

These come from CLAUDE.md and from how the code works today:
- **Web API calls go through Vercel.** The web refresh cookie `agap_refresh` is `SameSite=Strict` ([session-cookie.ts](../../backend/src/auth/sessions/session-cookie.ts)), and [middleware.ts](../../frontend/middleware.ts) looks for it on the **website's** domain. So the browser must call `/v1/*` on `app.<domain>`, and Vercel forwards the call to the backend (`PROXY_API=true`). Calling `api.<domain>` directly from the browser gives a login loop and signs users out on every reload.
- **Socket.io goes direct to the backend.** It signs in with the access token, not the cookie, so it can connect to `wss://api.<domain>` directly. Vercel does not forward WebSocket upgrades.
- **The backend must be HTTPS.** Release APKs refuse plain `http://`, and passkeys need HTTPS.
- **Settle the backend address before building the APK.** `EXPO_PUBLIC_*` values are built into the APK, so changing `api.<domain>` later means a rebuild.
- **The bucket stays private.** Files reach clients only through the authenticated `GET /incidents/:id/attachments/:attachmentId/file` endpoint.
- **No secrets in git.** Every key goes in the Railway, Vercel or EAS dashboards. `.env` files stay local.
- **Real barangays must not be texted by accident.** With `NODE_ENV=production`, `BARANGAY_SMS_TEST_OVERRIDE_PHONE` is no longer required, so `BARANGAY_ALERTS_ENABLED=true` texts **real barangay numbers**. Keep it `false`, or set the override phone, until MDRRMO verifies the numbers.

### Phase overview

| Phase | Delivers | Depends on |
|---|---|---|
| 0 | Decisions, domain and accounts (no code) | — |
| 1 | Code changes for deployment; local proof the images and builds work | 0 |
| 2 | R2 bucket and token | 0 |
| 3 | Backend, Postgres and Redis on Railway at `api.<domain>` | 1, 2 |
| 4 | Website on Vercel at `app.<domain>` | 1, 3 |
| 5 | Preview APK pointing at `api.<domain>` | 3 |
| 6 | End-to-end checks | 3, 4, 5 |
| 7 | Known limits and follow-ups | — |

### Rough monthly cost (check current pricing)

| Item | Estimate |
|---|---|
| Domain | about $10–15 per year |
| Railway (backend, Postgres, Redis, low traffic) | about $10–20 per month, usage-based |
| Vercel Hobby | free; non-commercial use only. A real LGU deployment needs Pro |
| Cloudflare R2 | free up to 10 GB |
| EAS preview builds | free tier queue |

---

## Phase 0: Decisions, domain and accounts (no code)

1. **Buy `<domain>`.** Use Cloudflare as the DNS host. That keeps it next to R2, and both subdomains are easy to point.
2. **Create or confirm the accounts:** Railway, Vercel, Cloudflare, Expo (EAS), Firebase (an existing project with the `com.agap.emergency` Android app), Textbee.
3. **Keep the Textbee phone powered, online and on Wi-Fi.** Turn "Receive SMS" on in the Textbee app; citizen SMS SOS and barangay replies need it.
4. **Decide who keeps the encryption keys.** Use a password manager or similar. Losing `MEDICAL_ENCRYPTION_KEY` or `ID_DOCUMENT_ENCRYPTION_KEY` makes that data unreadable for good.
5. **Note the data-location issue for the DPO.** R2 has no Philippine region; the Asia-Pacific location hint is the closest. Railway's region is Singapore. For demo data this is fine. Real citizen photos, ID images and medical data need the DPO's sign-off, as with AI Assist.
6. **Decide on the selfie check.** `PROFILE_PHOTO_CHECKS=on` needs about 1 GB of RAM. `off` saves memory and skips the check.

**Done when:**
- [ ] The domain is bought and its DNS is on Cloudflare.
- [ ] All accounts exist, and the team knows who owns each one.
- [ ] A safe place for keys is agreed.
- [ ] `PROFILE_PHOTO_CHECKS` is decided.

---

## Phase 1: Code changes for deployment

### 1.0 Pin pnpm everywhere (done 2026-11-23)

**Problem:** local pnpm is 11.1.1 and `pnpm-workspace.yaml` uses pnpm 11 settings (`allowBuilds`, `minimumReleaseAgeExclude`). The Dockerfile installed `pnpm@9` (and an unpinned `pnpm` in production), CI used pnpm 9 on Node 20, and nothing told Vercel or EAS which version to use. With pnpm 9, `allowBuilds` is ignored, so install scripts that are switched off (for example puppeteer's Chrome download) would run.

**Fix:** `"packageManager": "pnpm@11.1.1"` in the root `package.json` is the one place for the version.
- Dockerfile: `corepack enable && corepack install` reads it; the production stage builds `FROM base`.
- CI: `pnpm/action-setup` reads it (no `version:`); Node 22, because pnpm 11 needs Node ≥ 22.13.
- `mobile/eas.json`: `node: 22.14.0` and `pnpm: 11.1.1` on every build profile.
- Vercel picks it up from `packageManager`; Phase 4 already sets Node 22.

### 1.1 Fix the backend production image ([backend/Dockerfile](../../backend/Dockerfile))

**Problem:** the `production` stage copies only `backend/node_modules`. With pnpm, its entries are links into the root `node_modules/.pnpm` and into `shared/`, and neither is copied. The image should then fail at start with `Cannot find module`. This is expected from how pnpm lays out files; confirm it in 1.4.

**Fix (simple, recommended for now):**
- Build `@agap/shared` in the build stage: `pnpm --filter @agap/shared build`.
- In the production stage, copy the whole `/app` from the build stage and start from `/app/backend` (`node dist/main`).
- The image is bigger, because it keeps dev dependencies. In return the links stay valid, and the Prisma CLI and `ts-node` stay available for `prisma migrate deploy` and the seed.

**Also needed (found while building, done 2026-11-23):**
- Copy `backend/prisma` and `backend/prisma.config.ts` **before** `pnpm install`: the backend's `postinstall` runs `prisma generate`. This also fixes the `development` stage.
- Install `openssl` in the base image: the Prisma CLI's schema engine (`prisma migrate deploy`) needs it.
- No `--mount=type=cache` in **any** stage: Railway validates every stage, even ones it does not build, and rejects cache ids not prefixed with its service id ("The Dockerfile failed validation"; found on the first Railway build).
- `.dockerignore`: `**/.env` instead of `.env`. The bare pattern matched only the repo root, so `backend/.env` was copied into locally built images. `frontend/` is excluded too.
- Result: the image is 2.89 GB.

*(Later, a smaller image: `pnpm deploy --filter @agap/backend --prod`. That needs `"files": ["dist"]` in `shared/package.json`, because `dist/` is gitignored, and a `prisma generate` inside the output. Not needed now.)*

### 1.2 Let Socket.io connect straight to the backend ([frontend/next.config.mjs](../../frontend/next.config.mjs))

**Problem:** with `PROXY_API=true`, the config blanks **both** `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`. Socket.io then tries the Vercel domain, which cannot forward WebSockets.

**Fix:** keep blanking `NEXT_PUBLIC_API_URL`, so REST stays same-origin. Keep `NEXT_PUBLIC_WS_URL` only in a **production build** where it is set. `next dev` still blanks it: `frontend/.env.local` sets `ws://localhost:3000`, which would break the tunnel. Socket.io's allowed origins come from `CORS_ORIGIN`, the same as REST.

### 1.3 Add `frontend/vercel.json`

- `installCommand`: `pnpm install --frozen-lockfile --filter @agap/frontend...`. The trailing `...` includes `@agap/shared`. This skips installing backend and mobile dependencies, which are large (Expo, ONNX, Hugging Face).
- `buildCommand`: `pnpm --filter @agap/shared build && pnpm build`. The frontend imports `@agap/shared` from `shared/dist`, which is gitignored and not built on install.
- `regions`: `["sin1"]`, the region closest to Bocaue.

### 1.4 Prove it locally

1. `docker build -f backend/Dockerfile --target production -t agap-backend:test .` from the repo root.
2. Run it with `backend/.env` values and `NODE_ENV=production`. Point `DATABASE_URL` and `REDIS_URL` at `host.docker.internal` instead of `127.0.0.1`: inside the container, `127.0.0.1` is the container itself, not the laptop.
3. `curl http://localhost:3000/v1/health` returns 200.
4. Build the frontend as Vercel will:
   - `pnpm --filter @agap/shared build`
   - then, in `frontend/`: `PROXY_API=true BACKEND_INTERNAL_URL=http://localhost:3000 NEXT_PUBLIC_WS_URL=ws://localhost:3000 NEXT_DIST_DIR=.next-prod pnpm build`
5. Run `pnpm typecheck` for all packages. The frontend lint is known to be broken, so `tsc --noEmit` is the check for it.

### 1.5 R2 checksum option (only if needed in Phase 3)

AWS SDK 3.1138 sends CRC32 checksums by default. If the first R2 upload fails with `NotImplemented` or a checksum error, add `requestChecksumCalculation: 'WHEN_REQUIRED'` and `responseChecksumValidation: 'WHEN_REQUIRED'` to the `S3Client` in [media.service.ts](../../backend/src/media/media.service.ts).

**Local test note:** the container runs the Textbee pollers against the real device, like a second backend. Stop it right after the health check.

**Done when:**
- [x] The production image starts and `/v1/health` returns 200 locally. *(2026-11-23: database connected, login path returned 401 as expected.)*
- [x] The frontend builds with `PROXY_API=true` and the shared build.
- [x] Locally, a production-mode web build keeps `NEXT_PUBLIC_WS_URL` (Socket.io connects to the backend directly). *(The WS address is in the built pages; the `localhost` API address from `.env.local` is not.)*
- [x] Typecheck passes for all four packages.
- [ ] The changes are committed.
- [ ] Still untested: the `vercel.json` filtered install (first Vercel deploy, Phase 4).

---

## Phase 2: Files on Cloudflare R2

1. **Create the bucket.** R2 → Create bucket → name `agap-media`, location hint **Asia-Pacific**. Leave **public access off** and the `r2.dev` URL **off**.
2. **Create the API token.** R2 → Manage API tokens → **Object Read & Write**, scoped to `agap-media` only.
   - Save the Access Key ID, the Secret Access Key and the Account ID.
   - Create the bucket first. A bucket-scoped token cannot create buckets, although the code tries to create a missing one.
3. **Optional: move old files.** If old attachments from Garage should keep working, copy the bucket to R2 with the same bucket name and keys (e.g. `rclone copy garage:agap-media r2:agap-media`). Skip this if the database starts fresh.

4. **Test the token** without putting keys in any file: set `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` (PowerShell `Read-Host`) and run `node scripts/check-storage.mjs` from `backend/`. It runs the backend's startup `HeadBucket` check and an upload/read/delete round trip, and says whether step 1.5 is needed.

**Done when:**
- [x] The bucket exists and is private. *(2026-11-23: `agap-media`, APAC hint, r2.dev off.)*
- [x] The token is saved in the key store. *(Account API token `agap-backend`, Object Read & Write, `agap-media` only; in Bitwarden, collection "AGAP Deployment".)*
- [x] `check-storage.mjs` passes. *(HeadBucket and default checksums work, so step 1.5 is not needed.)*
- Old files: **not moved**. The Railway database starts fresh (decided 2026-11-23).

---

## Phase 3: Backend on Railway

### 3.1 Services

**No domain yet?** Do all of Phase 3 on Railway's free `*.up.railway.app` address and attach `api.<domain>` later. The domain must exist before Phase 5, because the APK has the address built in. Push the Phase 1–2 commits to GitHub first: Railway builds from the repo.

1. **Create the project** in the **Singapore** region.
2. **Add Postgres from the PostGIS template**, not plain Postgres. The schema enables `postgis`, `pg_trgm` and `uuid-ossp`.
3. **Add Redis.**
   - Check `CONFIG GET maxmemory-policy`. BullMQ needs **`noeviction`**; local dev uses the same (`docker-compose.yml`).
   - If it is anything else, set it to `noeviction` (e.g. `--maxmemory-policy noeviction` in the start command).
4. **Add the backend service** from the GitHub repo:
   - Root directory: repo root (the Dockerfile needs `shared/` and the workspace files)
   - Service variable `RAILWAY_DOCKERFILE_PATH=backend/Dockerfile`
   - Health check path: `/v1/health`
   - Networking: add the custom domain `api.<domain>` with target port `3000`, then add the CNAME Railway shows in Cloudflare DNS (**DNS only**, grey cloud, so Railway issues the certificate).

### 3.2 Environment variables

Generate each key separately with:
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `BACKEND_PORT` / `BACKEND_HOST` | `3000` / `0.0.0.0` |
| `DATABASE_URL` | Railway reference to the PostGIS service URL |
| `REDIS_URL` | `${{Redis.REDIS_URL}}?family=0`. Railway's private network can be IPv6; `family=0` lets ioredis use either. Every Redis client in the backend (BullMQ included) takes the URL as-is, so the option reaches all of them |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | new, different values |
| `MEDICAL_ENCRYPTION_KEY` | new (required in production) |
| `MFA_ENCRYPTION_KEY` | new |
| `ID_VERIFICATION_REQUIRED` | `true` |
| `ID_DOCUMENT_ENCRYPTION_KEY` | new |
| `ID_PIN_PEPPER` | new, at least 32 characters |
| `BARANGAY_LINK_SECRET` | new; signs the barangay `/b` links. Without it, the key is derived from `JWT_SECRET` |
| `CORS_ORIGIN` | `https://app.<domain>` |
| `PUBLIC_APP_URL` | `https://app.<domain>` |
| `WEBAUTHN_RP_ID` | `api.<domain>,app.<domain>`. The backend host goes **first**: the APK sends no Origin and uses the first entry |
| `WEBAUTHN_ORIGIN` | `https://app.<domain>,https://api.<domain>` |
| `WEBAUTHN_ANDROID_PACKAGE` | `com.agap.emergency` |
| `WEBAUTHN_ANDROID_CERT_FINGERPRINTS` | the preview build's SHA-256 (Phase 5.1) |
| `STORAGE_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `STORAGE_REGION` | `auto` |
| `STORAGE_BUCKET` | `agap-media` |
| `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` | from Phase 2 |
| `STORAGE_LOCAL_FALLBACK` | `false` for the first test, then `true` |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | service account; private key on one line with `\n` escapes |
| `TEXTBEE_API_KEY`, `TEXTBEE_DEVICE_ID`, `MDRRMO_OPS_PHONE` | same as local |
| `CITIZEN_SMS_SOS_ENABLED` | `true` |
| `BARANGAY_ALERTS_ENABLED` | `false` (see the barangay rule in Context) |
| `MAP_PROVIDER`, `MAP_API_KEY`, `MAP_STYLE_URL`, `MAP_SATELLITE_STYLE_URL`, `MAP_ROUTER`, `MAP_PROVIDER_ROUTING_URL`, `MAP_GEOCODER_URL` | same as local |
| `AI_ASSIST_ENABLED` | `false` unless a paid key and DPO sign-off exist |
| `PROFILE_PHOTO_CHECKS` | from Phase 0 |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | only the seed reads these (3.3, on the laptop); Railway does not need them. Never the dev default |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal, 100.64.0.0/10` (set 2026-11-26, see Phase 6 "Client IP"). The default records Railway's proxy (`100.64.x.x`) for every client |

Leave `PUBLIC_STORAGE_URL` unset. Nothing reads it for display.

### 3.3 Database setup (first time, from a laptop)

The prisma config loads `backend/.env`, but a `DATABASE_URL` set in the shell takes priority. Use Railway's **public** Postgres URL:

```powershell
cd backend
$env:DATABASE_URL = '<Railway public Postgres URL>'
pnpm db:migrate:prod
$env:ID_PIN_PEPPER = '<same value as on Railway>'
$env:INITIAL_ADMIN_EMAIL = '<admin email>'
$env:INITIAL_ADMIN_PASSWORD = '<new admin password>'
pnpm db:seed
```

- **Seed with the production `ID_PIN_PEPPER`.** The seed uses it, and the duplicate-ID check breaks if the values differ.
- **Demo passwords are public.** The seed creates demo staff accounts with the dev password from [seed.ts](../../backend/prisma/seed/seed.ts) and adds presentation data. Those accounts are marked "must change password", but anyone who can read the repo knows the first password. **Sign in to every demo account right after seeding** and set new passwords.

- **The repository is public, so every seed password is public.** Right after `pnpm db:seed`, in the same shell, run `pnpm db:rotate-seeded-passwords` with `NEW_DEMO_PASSWORD` set ([script](../../backend/scripts/rotate-seeded-passwords.ts)). It gives every account still on a public seed password one new password, signs those accounts out and audits each change. Run it after **every** seed: the seed puts the presentation citizen back on its public password.
- **Read secrets with `Read-Host -AsSecureString`.** Plain `Read-Host` shows what is pasted, and terminal transcripts get copied around.
- **Close the database's public door afterwards** (PostGIS → Settings → Networking → remove the TCP proxy). The backend uses the private network; turn the proxy on again only for the next laptop seed.

### 3.4 Later deploys

Set the pre-deploy command to `npx prisma migrate deploy`, so new migrations run before each release. The Phase 1 image keeps the Prisma CLI, which makes this possible.

### 3.5 Railway lessons (2026-11-23/24)

| Symptom | Cause | Fix |
|---|---|---|
| "Railpack failed to prepare the build" | No Dockerfile at the repo root | Service variable `RAILWAY_DOCKERFILE_PATH=backend/Dockerfile` |
| "The Dockerfile failed validation" | Railway checks every stage and rejects BuildKit cache mounts | No `--mount=type=cache` anywhere in the Dockerfile |
| Healthcheck hits `:8080` and fails | Railway injects `PORT`; the backend listens on `BACKEND_PORT` | Variable `PORT=3000` |
| `Connection url is empty` | Migrate command in **Custom Start Command**; database services missing | Command goes in **Pre-deploy**, Start Command stays empty; PostGIS and Redis must be in the **same project** |
| `Failed to parse private key.` | `FIREBASE_PRIVATE_KEY` cut short | Paste `private_key` from the service-account JSON without the quotes; the backend now turns push off instead of crashing |
| `Redis unavailable …` with an empty error | `REDIS_URL` empty | `${{Redis.REDIS_URL}}?family=0` |
| Datasource at `*.proxy.rlwy.net` | In the PostGIS template, `DATABASE_URL` is the **public** address | Backend `DATABASE_URL=${{PostGIS.DATABASE_PRIVATE_URL}}` (shows `postgis.railway.internal`) |
| `maxmemory-policy` check | Template start command sets none | Redis default is `noeviction`; nothing to do |
| A push deployed, but the old behaviour is still live (build took ~00:10) | Railway reused an old image (seen once, 2026-11-24, deployment `6e1a8b91`) | Railway → service → **Ctrl+K → "Deploy Latest Commit"** (plain **Redeploy** reuses the same image). Always check a backend fix live with a request only the new code answers differently |

**Done when:**
- [x] `https://api.<domain>/v1/health` returns 200. *(On the Railway address for now; repeat on `api.<domain>` once the domain exists.)*
- [x] `https://api.<domain>/.well-known/assetlinks.json` returns the package and fingerprint. *(Railway address; both fingerprints listed.)*
- [x] The Railway logs show no config errors at boot, and no `Object storage unreachable`. *(Firebase initialized, Redis connected, database on the private network.)*
- [x] Migrations and seed are done, and the demo passwords are changed. *(41 migrations; 17 seeded accounts moved off public passwords; the admin has its own password and must change it at first sign-in.)*
- [x] Redis `maxmemory-policy` is `noeviction`.
- [ ] Before a real pilot: change the PostGIS and Redis passwords. Both were exposed in a chat transcript on 2026-11-24. Both services are private-only now, so only the project's own backend can reach them.

---

## Phase 4: Website on Vercel

1. **Import the repo** with Root Directory `frontend` and "Include files outside the root directory" **on** (needed for `shared/`). `frontend/vercel.json` from Phase 1.3 supplies the install and build commands and the region.
2. **Use Node 22** (Project Settings → Node.js Version).
3. **Set the environment variables** (Production). They are read **at build time**: `NEXT_PUBLIC_*` values are built into the pages and the forwarding rules are fixed at build. After any change, **redeploy**.

   | Variable | Value |
   |---|---|
   | `PROXY_API` | `true` |
   | `BACKEND_INTERNAL_URL` | `https://api.<domain>` |
   | `NEXT_PUBLIC_WS_URL` | `wss://api.<domain>` |
   | `NEXT_PUBLIC_MAP_PROVIDER`, `NEXT_PUBLIC_MAP_API_KEY` | same as local |

4. **Add the domain** `app.<domain>`. Add the CNAME Vercel shows in Cloudflare DNS (**DNS only**).
5. **Use only `app.<domain>`.** Preview deployments get random addresses that are not in `CORS_ORIGIN` or the passkey settings, and Vercel's deployment protection blocks barangays from opening `/b` on them.

**Notes from the first deploy (2026-11-24, `https://agap-emergency.vercel.app`, no domain yet):**
- Vercel shows the repo as "Services" (backend + frontend). Use **Import single project** on `frontend` only; the backend stays on Railway.
- Also set `ENABLE_EXPERIMENTAL_COREPACK=1`, so Vercel installs with the pnpm version pinned in the root `package.json`, not the one it guesses from the lockfile. Set the variables for Production and Preview.
- The `NEXT_PUBLIC_MAP_*` variables are not needed: no frontend code reads them (the map settings come from the backend).
- On Railway, with the Vercel address in place of `app.<domain>`: `CORS_ORIGIN` and `PUBLIC_APP_URL` = `https://agap-emergency.vercel.app`; `WEBAUTHN_RP_ID=agap-emergency-production.up.railway.app,agap-emergency.vercel.app`; `WEBAUTHN_ORIGIN=https://agap-emergency.vercel.app,https://agap-emergency-production.up.railway.app`.
- Checked: the built pages contain the Railway `wss://` address and no `localhost:3000`; `/v1/health` through Vercel returns 200.

**Done when:**
- [x] `https://app.<domain>/login` loads. *(On `agap-emergency.vercel.app` for now.)*
- [x] Signing in works, and **reloading the page keeps the session**.
- [x] The Live indicator turns on.
- [x] `https://app.<domain>/b` loads on a phone without signing in.

---

## Phase 5: Preview APK (EAS)

Run everything from `mobile/`; [mobile/eas.json](../../mobile/eas.json) is the one in use. The root `eas.json` is a leftover and is not used.

1. **Get the signing fingerprint** with `eas credentials` (Android → preview). Preview normally reuses the same keystore as development; confirm it. Put the SHA-256 in `WEBAUTHN_ANDROID_CERT_FINGERPRINTS` on Railway and redeploy the backend.
2. **Set the EAS variables for the `preview` environment.** EAS cloud builds do **not** upload `mobile/.env` or `mobile/.env.local`, because both are gitignored. Without these variables the APK points at `http://localhost:3000`.

   ```
   eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://api.<domain> --visibility plaintext
   eas env:create --environment preview --name EXPO_PUBLIC_WS_URL --value wss://api.<domain> --visibility plaintext
   eas env:create --environment preview --name EXPO_PUBLIC_MAP_API_KEY --value <Mapbox pk token> --visibility plaintext
   eas env:create --environment preview --name EXPO_PUBLIC_PASSKEY_RP_ID --value api.<domain> --visibility plaintext
   eas env:create --environment preview --name EXPO_PUBLIC_AGAP_SMS_NUMBER --value <Textbee SIM number> --visibility plaintext
   ```

   Without `EXPO_PUBLIC_AGAP_SMS_NUMBER`, "Send by SMS" has no number to text.
3. **Build:** `eas build --profile preview --platform android`.
4. **Install the APK** on the test phones. It uses the same package name as the dev client (`com.agap.emergency`), so uninstall the dev client first.
5. **Know the registration limits.** Registration requires a PhilHealth ID scan and a location inside Bocaue. The backend refuses coordinates outside the service area, and `EXPO_PUBLIC_DEV_SKIP_GEO_FENCE` is not read anywhere in the code. Testers outside Bocaue should use the seeded demo citizen account, or guest SOS.

**Notes from the first build (2026-11-24, no domain yet):**
- **Fingerprint:** the preview keystore SHA-256 (`C9:A0:C6:1B:…:66:48`) was already the second entry in `WEBAUTHN_ANDROID_CERT_FINGERPRINTS`, so the backend needed no change.
- **The variables already existed** in `preview`, still pointing at the old ngrok address. Overwrite them with `--force` (Git Bash): `eas env:create --environment preview --name "$n" --value "$v" --visibility plaintext --force --non-interactive`.
- **Values used:** `EXPO_PUBLIC_API_URL=https://agap-emergency-production.up.railway.app` (**no `/v1`**: every call adds `/v1/...` itself), `EXPO_PUBLIC_WS_URL=wss://agap-emergency-production.up.railway.app`, `EXPO_PUBLIC_PASSKEY_RP_ID=agap-emergency-production.up.railway.app` (only `app.config.js` reads it, for iOS; on Android the backend picks the RP ID), `EXPO_PUBLIC_AGAP_SMS_NUMBER` unchanged.
- **`EXPO_PUBLIC_MAP_API_KEY` is not needed:** no code reads it (the maps are MapLibre). It was left in place, which is harmless.
- **No EAS FCM key is needed:** the app registers the raw FCM device token (`getDevicePushTokenAsync`), and the backend sends through Firebase Admin.
- **`mobile/android` is committed**, so EAS builds from it and ignores `android.*` in `app.config.js`. The `app.json` changes since that folder was last regenerated are iOS-only, so no prebuild was needed. If an Android-side plugin or permission is added later, regenerate `android/` first.
- **ID OCR runs on the server**, so a backend fix reaches every installed APK without a rebuild. The 180° (upside-down card) fix is `0ecf05c`.
- **Sign-in needs internet.** A phone on mobile data with no load cannot reach the server, so sign-in fails there. That is expected. A user who signed in earlier **stays signed in offline**: the session is read from Secure Store with no server call, so SOS and "Send by SMS" still work.

**Done when:**
- [x] The APK installs. *(2026-11-24; ID scan checked on the APK too.)*
- [ ] Sign-in works over mobile data, not only Wi-Fi. *(Wi-Fi sign-in works against Railway, so the app does not depend on the laptop or LAN. Still to test on a phone that has load: it checks that the carrier can reach Railway's IPv4-only address. First open `https://agap-emergency-production.up.railway.app/v1/health` in Chrome on data.)*
- [x] Push permission is granted, and the device token registers. *(2026-11-25: Health → Integrations showed registered devices ≥ 1 after the demo citizen signed in; a dispatcher's Acknowledge produced an "Incident updates" notification on the APK.)*

---

## Phase 6: End-to-end checks

Run all of these on the deployed system, not locally.

**Emergency path**
- [x] A guest SOS from the APK creates an incident. It appears live on the web dispatch map without a reload. *(2026-11-25: the pin appeared on Live Dispatch with no reload.)*
- [ ] A guest follows their report (added 2026-11-25; needs the backend deploy **and** a new APK): after the guest SOS, the success screen shows a live status card and asks for notifications. Acknowledge → "Report received" push and the card says "Report accepted". Merge it into another report → "Report merged", then that report's dispatch/arrival pushes keep coming. False alert / Cancel → the matching push. Tapping a push opens "Your report"; the sign-in screen shows "Your report INC-…".
- [ ] One open report per guest phone (added 2026-11-26; backend only, works on any APK). *(2026-11-26: the daily cap is confirmed live: at 19:03 phone `0bfa0f12` was refused with "Too many from one phone · limit 3 per day" after INC-2026-000060/61/62. The open-report rule itself is still untested: 61 and 62 were sent at 18:39/18:42, before `1fa51ce` (18:53) was deployed.)*
  Steps: send a guest SOS, then a second one from the same phone → "Report Not Sent" naming the first report, with the hotline buttons and "Sign in to report" (no SMS button). Logs → Security events shows "Guest report blocked · Earlier report still open · INC-…". Mark the first report False alert, then the same phone can report again. A signed-in citizen is never held back by this. *(Since the false-alert wait below, "report again" after a False alert comes 10 minutes later; use Resolve/Close to free the phone at once.)*
- [ ] Wait after a false alert (added 2026-11-26; backend, works on any APK). Mark a guest report **False alert**, then send another guest SOS from that phone → "Report Not Sent: … was marked a false alert … in about 10 minutes". Security events: "Guest report blocked · Wait after a false alert · INC-… · N min left". After **Resolved/Closed** instead, the phone can report again at once (no wait).
- [ ] Guest is taken to their open report (added 2026-11-26; **needs a new preview APK**). With a guest report still open, tap "Report an emergency" on the sign-in or registration screen → "Your report" opens with "You already have an active report", live status, hotlines and "Sign in to report a different emergency" (no form). After a False alert: the same screen shows "You can send a new report in m:ss", and its button unlocks at 0:00. After Close: a red "Report an emergency" button. "Report Not Sent" (429) has a "See your report" button. With data off, the button goes straight to the form (no hold-up).
- [x] The MDRRMO ops phone gets the `AGAP|INC-…` SMS. *(Received on the ops phone on 2026-11-24. On 2026-11-25 the admin SMS Activity page logged the ops alert as `Accepted` by Textbee. "Accepted" means the gateway took it, not that the phone confirmed delivery.)*
- [ ] A signed-in citizen SOS works, and the citizen sees status changes live.
- [ ] Dispatching from the web reaches the responder APK (push and live status). Responder location updates show on the map.
- [ ] Unanswered assignment keeps buzzing (added 2026-11-27; **needs a new preview APK** for the alarm channel and in-app alarm). Responder signs in, closes AGAP, opens another app. Dispatch to them: the phone rings and vibrates (alarm sound) with "New assignment", then again every 30 s ("still waiting"), replacing the same notification. Accept → it stops. Leave one unanswered for 3 min → Escalations shows "No answer to assignment — INC-…: … has not accepted or declined in 3 min". With AGAP open: a red full-screen "New assignment" vibrates until "Open assignment". Set Settings → Apps → AGAP → Battery → **Unrestricted** on every responder phone first.
- [ ] With mobile data off, "Send by SMS" creates the incident within about 30 s, and the reference is texted back. Turning data back on and resending gives the **same** incident, not a duplicate.

**Web console**
- [ ] Every role signs in (dispatcher, supervisor, hospital user, admin), and reloading keeps each one signed in.
- [ ] Signing out in one tab signs out the others.
- [ ] Passkey sign-in works on the web and on the APK.

**Files**
- [ ] A photo upload succeeds. The Railway logs show **no** `stored … on local disk`. The photo opens in the web console.
- [ ] Then set `STORAGE_LOCAL_FALLBACK=true` on Railway.

**Barangay page**
- [ ] `https://app.<domain>/b` accepts an access code and the status buttons work.

**Client IP and rate limits (decide `TRUST_PROXY`)**

Per-IP limits use `req.ip`:
- login: 5 per minute
- guest SOS: 20 per 10 minutes per IP
- guest SOS, same network and same place (~200 m): 3 per 10 minutes (added 2026-11-25)

They only work if `req.ip` is the real client address. **Easiest check (since 2026-11-25):** send a guest SOS from the APK, then open System Administration → Security Events → "Guest report" and read the IP column. A public address (the phone's carrier) means it works. An address starting with `10.`, `100.`, `172.` or `192.168.` is Railway's proxy: fix `TRUST_PROXY` **before** any pilot, or every guest in Bocaue shares one limit (done 2026-11-26, see Result below). You can also compare against the IPs of two different phones and of the web.
- **If the APK requests all show one address** (Railway's proxy), guest SOS from different people shares one limit. That would break Rule 14. Trust Railway's proxy range so `req.ip` comes from Railway's `X-Forwarded-For`.
- **Web logins** reach the backend through Vercel, so with `TRUST_PROXY=1` they still share Vercel's addresses. `TRUST_PROXY=2` fixes the web path, but then an APK client could fake its address and dodge the guest limit. For a demo, `1` is the safer choice. If many staff sign in at once, stagger the sign-ins.
- If guest reports are ever blocked during a real event, `GUEST_REPORT_LIMIT_DISABLED=true` is the emergency switch.

**Result (2026-11-26):**
- [x] **App path fixed.** With the default, a guest SOS from the APK was recorded as `100.64.0.19` (INC-2026-000059, 11:08). Railway's proxy connects from `100.64.0.0/10`, a range the default does not trust. After setting `TRUST_PROXY=loopback, linklocal, uniquelocal, 100.64.0.0/10`, the same phone (Security Events code `0bfa0f12`) was recorded as its public address `152.233.15.123` (INC-2026-000060, 11:56). Guest limits now apply per network, not town-wide.
  - Why this and not `1`: Express takes the right-most address it does not trust. Railway's hop adds the real client address last, so a client that fakes `X-Forwarded-For` still ends at its real IP.
  - Undo: delete the variable and redeploy.
- [x] **Web path works too.** A deliberate wrong-password sign-in through the Vercel console (Login Failed, Dispatcher, 12:14) was recorded as public `152.233.15.120`, the user's own network block, not Railway's proxy or a Vercel address. Web sign-ins are limited per client, so staff don't share one login limit.

**Done when:** every box above is ticked, and `TRUST_PROXY` is set and recorded here.

---

## Phase 7: Known limits and follow-ups

| Limit | Effect | Follow-up |
|---|---|---|
| Public OSRM and Nominatim servers | No guaranteed uptime; Nominatim allows 1 request/s | Self-host OSRM (`infrastructure/osrm`) and a Bulacan Nominatim extract |
| One Textbee phone | SMS fails if the phone is off or offline | A second device, or a provider with an SLA |
| Web staff share Vercel IPs | Login rate limit can trip when many staff sign in at once | Rate-limit login per account as well as per IP |
| Vercel Hobby is non-commercial | Fine for school and demos; not for LGU operations | Vercel Pro, or the Cloudflare Workers option |
| Data outside the Philippines | R2 Asia-Pacific and Railway Singapore | DPO sign-off before real citizen data |
| Backups | Database and keys must be restorable together | Daily `pg_dump`, plus the keys in the key store; test a restore once |
| Large backend image (Phase 1.1) | Slower deploys | Move to `pnpm deploy --prod` |
| Seeded demo accounts | Known first password | Remove or disable demo accounts before real use |

### Rollback

- **Website:** Vercel → Deployments → promote the previous deployment.
- **Backend:** Railway → Deployments → redeploy the previous one.
  - Database migrations do not roll back on their own. Take a `pg_dump` before deploying a release that includes a new migration.
- **APK:** reinstall the previous APK from the EAS build page.
