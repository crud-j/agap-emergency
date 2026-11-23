# Deploying AGAP: Phase 3 (Railway) and Phase 4 (Vercel) done; next is Phase 5 (EAS preview APK) on the free addresses

**Date:** 2026-11-24
**Status:** IN PROGRESS (Phases 1–4 done; Phases 5–6 to do)
**Bead(s):** none (`bd` is not installed: `bd: command not found`)
**Epic:** Deployment plan `docs/plans/DEPLOYMENT_PLAN.md`
**Chain:** `standalone-953e4889` seq `2`
**Parent:** `docs/handoff/2026-11-24_deployment-phases-1-3.md`
**Prior chain:** `docs/handoff/2026-11-24_deployment-phases-1-3.md` > this

---

## Since Last Handoff

- Parent's "Where We're Going" step 1 (finish Phase 3 backend health) is **done**: `FIREBASE_PRIVATE_KEY` re-pasted → `Firebase Admin initialized`; `DATABASE_URL` moved to the private network (`postgis.railway.internal:5432`); Redis was already fixed at the end of the parent session.
- Step 2 (Redis `maxmemory-policy`) **done**: the Railway Redis template's start command sets no policy, so Redis runs with its default `noeviction`.
- Step 3 (seed from laptop) **done**, but it surfaced a problem the parent did not plan for: the repo is **public**, so every seed password is public. New script `backend/scripts/rotate-seeded-passwords.ts` (commit `fb5c70a`) moved 17 seeded accounts to a new password right after the seed.
- Step 4 (`assetlinks.json` check, tick Phase 3, record Railway lessons) **done** (commit `fb5c70a`, plan section 3.5).
- Step 5 (Phase 4 Vercel) **done** on `https://agap-emergency.vercel.app` (commit `30de873`). The Vercel UI differed from the plan (a "Services" import screen); recorded in the plan.
- Step 6 (domain decision) **answered**: the user chose to **stay on the free addresses** (`*.up.railway.app` + `*.vercel.app`) for Phase 5. No domain will be bought for now.
- Parent's open questions answered: healthcheck passes (`/v1/health` 200, checked by curl); push now works on Railway (Firebase initialized); PostGIS service name is `PostGIS`; domain = none.
- New risk that materialized: database and Redis passwords were exposed in the chat transcript (user pasted them). Mitigated by removing the PostGIS public TCP proxy; actual password rotation deferred (recorded as an open box in Phase 3).

## Related Handoffs

- `docs/handoff/2026-11-15_session-handoff.md` — SMS fixes, AI summary, AI provider, risk areas; separate feature work stream.
- `docs/handoff/2026-11-15_risk-pin-place-finding.md` — MOD-51 risk-area pinning; separate work stream.

## Reference Documents

- `docs/plans/DEPLOYMENT_PLAN.md` — **the** plan. Status line now says Phases 1–4 done. Phase 3 has new bullets in 3.3 (rotation script, `-AsSecureString`, close DB proxy) and a new section **3.5 Railway lessons** (8-row table). Phase 4 has a new "Notes from the first deploy" block. Phase 5 and 6 are still written for `api.<domain>` / `app.<domain>` — **substitute the free addresses** (see Where We're Going).
- `CLAUDE.md` — project rules (failed push/SMS must never block an incident; secrets never in git; Rule 14 guest reporting must always work).
- Memory files: `project-deployment-plan.md`, `project-railway-gotchas.md` (new this session), `feedback-git-bash-commits.md` (give commit commands in BOTH PowerShell and Git Bash), `project-backend-test-run.md`, `project-mobile-build-env.md` (no local JDK; dev clients built on EAS cloud).

## The Goal

Run AGAP without the laptop for demos and pilot testing (school project; the user is a student): web console on **Vercel**, NestJS backend + PostGIS + Redis on **Railway** (Trial, Singapore), files on private **Cloudflare R2**, and an **EAS preview APK** for Android phones pointing at the hosted backend. The user works phase by phase with click-by-click dashboard instructions, keeps every secret in **Bitwarden** (collection "AGAP Deployment"), and wants to spend $0 where possible. After Phase 5 (APK) comes Phase 6, the end-to-end checks on the deployed system, including the `TRUST_PROXY` decision.

## Where We Are

- **Live addresses (both verified by curl this session):**
  - Backend: `https://agap-emergency-production.up.railway.app` — `/v1/health` → 200 `{"status":"ok",…,"version":"1.0.0"}`.
  - Web: `https://agap-emergency.vercel.app` — `/login` 200, `/b` 200, `/v1/health` via Vercel's forwarding → 200.
- **Phase 1 (code) and Phase 2 (R2):** done in the parent session (commits `69df535`, `9462828`, `9570b06`).
- **Phase 3 (Railway): done** — all five "Done when" boxes ticked; one extra box left open: change the PostGIS and Redis passwords before a real pilot.
- **Phase 4 (Vercel): done** — all four boxes ticked: `/login` loads, sign-in works and **reload keeps the session**, **Live** indicator on, `/b` loads on a phone without signing in (user-confirmed).
- **Railway backend deploy (latest, `2d295404…`)** logs: `Datasource "db": … at "postgis.railway.internal:5432"`, `41 migrations found`, `No pending migrations to apply.`, `[NotificationProcessor] Firebase Admin initialized`, `Database connection established`, `Nest application successfully started`, `AGAP Backend running on http://0.0.0.0:3000`, `BarangaySmsPoller … every 15 s`. No `Redis unavailable`, no `Object storage unreachable`.
  - Later deploys happened after setting the Phase 4 variables and after the two pushes; user confirmed login + Live afterwards.
- **Railway variables changed this session on service `agap-emergency`:**
  - `FIREBASE_PRIVATE_KEY` re-pasted from the service-account JSON `private_key` (without quotes).
  - `DATABASE_URL=${{PostGIS.DATABASE_PRIVATE_URL}}` (was the public proxy).
  - `CORS_ORIGIN=https://agap-emergency.vercel.app`
  - `PUBLIC_APP_URL=https://agap-emergency.vercel.app`
  - `WEBAUTHN_RP_ID=agap-emergency-production.up.railway.app,agap-emergency.vercel.app` (Railway host first — the APK uses the first entry)
  - `WEBAUTHN_ORIGIN=https://agap-emergency.vercel.app,https://agap-emergency-production.up.railway.app`
- **PostGIS public TCP proxy removed** (Settings → Networking → Public Networking). Verified: a Postgres SSLRequest to `gondola.proxy.rlwy.net:35360` now gets `ECONNRESET` (no database behind it). Re-enable only for the next laptop seed.
- **Redis public access is off** (never enabled). Its `REDIS_URL` contains `redis.railway.internal:6379` (private only).
- **Database seeded** from the laptop (run twice — see What We Tried #8). 56 presentation incidents `INC-2026-000001`…`000056` (next live report gets `INC-2026-000057`), 6 announcements, 48 barangay directory contacts (2 invalid skipped, 1 DEMO contact present), 13 capabilities on 7 units, 22 permissions.
- **Seeded passwords rotated:** `Done: 17 of 18 accounts now use NEW_DEMO_PASSWORD.` The 18th is the admin (its own password from `INITIAL_ADMIN_PASSWORD`, 8 characters, `must_change_password=true`).
- **Admin account:** the user's own Gmail address (stored only in the Railway DB and Bitwarden; not written here). The seed summary text still prints `admin@agap.local` and the dev password — that is hard-coded console text, not the real state.
- **Admin first-sign-in password change:** asked twice, never explicitly confirmed by the user. Sign-in worked on Vercel, so it was most likely done — confirm next session.
- **Vercel project** `agap-emergency` (team "githubdevbyjph-9508…", Hobby), imported as a **single project** with Root Directory `frontend`, Next.js preset. Env vars (Production + Preview): `PROXY_API=true`, `BACKEND_INTERNAL_URL=https://agap-emergency-production.up.railway.app`, `NEXT_PUBLIC_WS_URL=wss://agap-emergency-production.up.railway.app`, `ENABLE_EXPERIMENTAL_COREPACK=1`.
- **Built web JavaScript checked:** of 18 chunks on `/login`, 1 contains `wss://agap-emergency-production.up.railway.app`, 0 contain `localhost:3000`.
- **Not verified on Vercel:** the Node.js version setting (should be 22.x) and "Include files outside the root directory" — the build succeeded, so the latter must be on; Node version was not reported back.
- **Commits this session (all pushed to `origin/main`, `0 0` ahead/behind at handoff time):** `fb5c70a`, `30de873`. Every push redeploys Railway (and Vercel).
- **Uncommitted, not this session's work (leave alone):** `frontend/tsconfig.tsbuildinfo` (typecheck artifact), `docs/presentation/Justine_Soliman_IPO_Report.md` (user's own file).
- **New memory file** `project-railway-gotchas.md` + pointer line in `MEMORY.md`.

## What We Tried (Chronological)

1. **Onboarding (start of session).** Read parent handoff; `bd` unavailable. Local `main` was 2 commits ahead (`c6afb02`, `191e229` — the parent's handoff commits). Read `firebase-admin.ts`, `Dockerfile`, `main.ts`, Phase 3 of the plan, plus `seed.ts`, `prisma.config.ts`, `barangay-directory.ts`, `well-known.controller.ts`. Found that `seed.ts` does `import 'dotenv/config'` → any variable not set in the shell silently comes from the laptop's `backend/.env` (dangerous for `ID_PIN_PEPPER`). Built the seed commands around a guard for this.
2. **Firebase key.** User asked whether to copy the JSON value with its opening quote → told: copy only between the quotes, from `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----\n`, keep the `\n` escapes, no comma; paste via ⋮ → Edit (not Raw Editor). Result: deploy `16f0ad95…` logged `Firebase Admin initialized`. Root cause in the parent session was most likely a truncated multi-line `.env` value copied by the clipboard helper.
3. **First health check from here.** `curl …/v1/health` → 200; `…/.well-known/assetlinks.json` → 200 with `com.agap.emergency` and two SHA-256 fingerprints (`D8:F4:C5:17:…:31:75`, `C9:A0:C6:1B:…:66:48`).
4. **DATABASE_URL to private network.** Deploy log still showed `gondola.proxy.rlwy.net:35360`. The `${{` picker listed `PostGIS.DATABASE_PRIVATE_URL`, `PostGIS.DATABASE_URL`, `PGDATA`, `PGHOST`, `PGPORT`, `POSTGRES_DB`. **Discovery: in this PostGIS template `DATABASE_URL` is the public proxy URL**, and the private one is `DATABASE_PRIVATE_URL`. Chose `${{PostGIS.DATABASE_PRIVATE_URL}}` → deploy `2d295404…` logged `postgis.railway.internal:5432`.
5. **Redis `maxmemory-policy` check — attempt 1 (failed by design).** Planned a laptop `ioredis` one-liner with `REDIS_PUBLIC_URL`. User first offered the backend web address (wrong), then pasted the private `REDIS_URL` (with password) into chat. Redis "Public access" was off, so there was no public URL. **Rejected** enabling public access (opens Redis to the internet + egress billing).
6. **Redis check — attempt 2 (worked).** Read the Redis service's Custom Start Command instead: `/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"` → no `--maxmemory-policy` → default `noeviction`. Done without any connection.
7. **Seed safety design.** Checked what the seed reads: only `DATABASE_URL`, `ID_PIN_PEPPER`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` (`presentation-data.ts` reads no env). `barangay-directory.ts` refuses demo contacts only when `NODE_ENV=production` (left unset; 1 demo contact is harmless with `BARANGAY_ALERTS_ENABLED=false`). User confirmed the repo is **public** → the dev password `AgapDev2026!`, the presentation password, and the default admin password in `seed.ts` are public → wrote `rotate-seeded-passwords.ts` and chained it after the seed in one PowerShell block. Typechecked (`tsc` exit 0) and tested both guards without a DB (`must be at least 12 characters`, `must not be one of the public seed passwords`, exit 1 each).
8. **Seed run 1:** seed completed (`48 created` barangay contacts), then rotation refused: `NEW_DEMO_PASSWORD must not be one of the public seed passwords.` (the user typed a public password). The guard worked; dev passwords were live for a few minutes. **Seed run 2:** seed again (idempotent: `0 created, 48 refreshed`, same incident numbers), rotation: `17 of 18 accounts` changed — announcements, bystander, citizenaccountdemo, citizen@demo.agap, dispatcher1, dispatcher2, 3 orgadmins, receiving@bocauehospital, responder1–6, supervisor.
9. **Secret exposure in run transcripts.** The `DATABASE_URL` prompt used plain `Read-Host`, which echoes; the user pasted the whole terminal transcript, including the **public** Postgres URL with password. Mitigation: user removed the PostGIS public TCP proxy; probe confirmed `ECONNRESET`. Lesson recorded: every secret prompt must use `Read-Host -AsSecureString` (memory + plan 3.3).
10. **Phase 3 bookkeeping.** Edited the plan: status line, 3.3 bullets, new 3.5 lessons table, ticked boxes, added "change PostGIS and Redis passwords before a real pilot" box. Committed by the user as `fb5c70a` with the rotation script and `package.json` script entry.
11. **Phase 4 prep.** Read Phase 4 of the plan, `frontend/vercel.json`, `next.config.mjs`, `middleware.ts`, `session-cookie.ts`. Found **no frontend code reads `NEXT_PUBLIC_MAP_*`** → map variables unnecessary. Worried Vercel would guess pnpm 9/10 from `lockfileVersion: '9.0'` while `pnpm-workspace.yaml` uses pnpm-11-only keys (`allowBuilds`, `minimumReleaseAgeExclude`) → added `ENABLE_EXPERIMENTAL_COREPACK=1` so corepack picks `pnpm@11.1.1` from the root `package.json`. The build log's pnpm version was **not** checked by the user (build succeeded).
12. **Vercel import screen.** New Vercel UI showed "Services" (backend NestJS + frontend Next.js, "Import multi-service project" needing a root `vercel.json`). Chose **Import single project** on `frontend` only. User asked Production vs Preview for env vars → both (Development unticked).
13. **Phase 4 verification.** curl checks (table in Evidence). User set the 4 Railway variables and redeployed → login works, Live on, reload keeps session. `/b` on phone: user first said "does not load", I started investigating (server HTML for `/b` with an Android UA is 200, 10,016 bytes, contains "Enter the alert code"; `/b` is in `PUBLIC_EXACT` in `middleware.ts`; `(ops)` `AuthGate` does not wrap `/b`), then the user corrected: **`/b` loads on the phone**. No bug.
14. **Phase 4 bookkeeping.** Plan: Phase 4 notes block + ticked boxes + status line. User committed and pushed `30de873`.
15. **Domain decision.** Presented stay-free vs buy-domain table; user chose **stay on free addresses**.

## Key Decisions

- **Stay on free addresses for Phase 5** (`agap-emergency-production.up.railway.app` for the APK, `agap-emergency.vercel.app` for the web). Rejected for now: buying a domain (~$10/yr). Trade-off accepted: moving off Railway later means a new APK and re-registering passkeys.
- **Backend DB via `${{PostGIS.DATABASE_PRIVATE_URL}}`**, not the template's `DATABASE_URL` (public proxy, costs egress, internet-exposed).
- **Leave Redis public access off**; verify `noeviction` by reading the start command, not by connecting. Rejected: enabling the public proxy for a one-off check.
- **Remove the PostGIS public TCP proxy after seeding**; re-enable only for the next laptop seed. This made the leaked DB password usable only inside the Railway project.
- **Defer PostGIS/Redis password rotation** until before a real pilot (both services are private-only now). Rejected: rotating immediately (needs a DB connection; Railway template variable wiring uncertain — see Open Questions).
- **Rotate seed passwords with a script, not by hand** — runs in the same shell right after the seed so the public dev password is never live; changes only accounts still on a public password (idempotent); signs them out; audits each change (`PASSWORD_CHANGE`, `MOD-49`). Rejected: changing ~17 passwords by hand in the web console after Phase 4 (public password live on the internet meanwhile); editing `seed.ts` to read the dev password from env (would change the dev workflow).
- **One shared demo password** for all 17 demo accounts (`NEW_DEMO_PASSWORD`, in Bitwarden as "AGAP – Demo accounts password"). The seed's `must_change_password` flags are kept, so console roles still change it at first sign-in.
- **Vercel: single-project import of `frontend`**; rejected the multi-service import (backend is on Railway).
- **`ENABLE_EXPERIMENTAL_COREPACK=1` on Vercel** instead of editing `vercel.json` to `npx pnpm@11.1.1 …` (would duplicate the version pin).
- **Vercel env vars for Production and Preview** (previews are behind Vercel login and not in `CORS_ORIGIN`; we don't use them, but they build instead of failing).
- **Admin username = the user's own Gmail address** (a `+agapadmin` alias was suggested); rejected `admin@agap.local` (public in the repo).

## Evidence & Data

### Commits (this session; all pushed)

| Hash | Summary | Files |
|---|---|---|
| `fb5c70a` | chore(deploy): rotate public seed passwords; Phase 3 (Railway) done | `backend/scripts/rotate-seeded-passwords.ts` (new), `backend/package.json`, `docs/plans/DEPLOYMENT_PLAN.md` |
| `30de873` | docs(deploy): Phase 4 (Vercel) done on agap-emergency.vercel.app | `docs/plans/DEPLOYMENT_PLAN.md` |

Earlier chain commits (parent session): `69df535`, `9462828`, `9570b06`, `428d154`, `1ac3895`, `07bbca8`, `c6afb02`, `191e229`.

### Railway deploys this session

| Deploy | Change before it | Key log lines | Verdict |
|---|---|---|---|
| `16f0ad95…` (18:03 UTC) | `FIREBASE_PRIVATE_KEY` re-pasted | `Firebase Admin initialized`; still `gondola.proxy.rlwy.net:35360` | Firebase fixed |
| `2d295404…` (18:15 UTC) | `DATABASE_URL=${{PostGIS.DATABASE_PRIVATE_URL}}` | `postgis.railway.internal:5432`, `Database connection established` | DB private |
| (unrecorded id) | Phase 4 vars (`CORS_ORIGIN`, `PUBLIC_APP_URL`, `WEBAUTHN_*`) | user: login + Live OK | OK |
| (push `fb5c70a`, push `30de873`) | code/docs only | not inspected | assumed OK (health 200 at 18:41 UTC) |

Log lines marked `severity: error` (`Loaded Prisma config…`, `npm notice …`, `AGAP Backend running…`) are **not errors**: they are stderr output that Railway labels as error.

### Phase 3 "Done when" status

| Check | Result | How verified |
|---|---|---|
| `/v1/health` 200 | ✓ | curl from this machine |
| `assetlinks.json` package + fingerprint | ✓ (2 fingerprints) | curl |
| No config errors at boot | ✓ | user-exported deploy logs |
| Migrations + seed + demo passwords changed | ✓ 41 / seeded / 17 rotated | script output |
| Redis `noeviction` | ✓ default | start command |
| Change PostGIS + Redis passwords | ☐ open (before real pilot) | — |

### Phase 4 checks

| Check | Result |
|---|---|
| `https://agap-emergency.vercel.app/login` | 200 (curl) |
| `https://agap-emergency.vercel.app/b` | 200 (curl, desktop + Android UA); loads on user's phone |
| `https://agap-emergency.vercel.app/v1/health` (forwarded) | 200 `{"status":"ok","timestamp":"2026-11-23T18:57:22.890Z","version":"1.0.0"}` |
| JS chunks on `/login` | 18 total; 1 with Railway `wss://`; 0 with `localhost:3000` |
| Sign-in, reload keeps session | ✓ (user) |
| Live indicator | ✓ (user) |

### Seed output (run 2, abridged)

```
Presentation incidents done: 56 (48 from the last 30 days, 8 on the current shift, 8 reported by SMS)
References INC-2026-000001 to INC-2026-000056; the next live report gets INC-2026-000057
Announcements done (6: 3 published, 2 archived, 1 awaiting Supervisor approval)
[skip] Bagumbayan: "769-2412" is not a usable number (MISSING_AREA_CODE)
[skip] Biñang 1st: "(044) 07924300" is not a usable number (MALFORMED)
Barangay directory: 0 created, 48 refreshed, 0 deactivated, 2 invalid skipped, 1 DEMO contact(s) present
Done: 17 of 18 accounts now use NEW_DEMO_PASSWORD.
```

Seeded logins (password = the demo password in Bitwarden, except admin): dispatcher1/2@mdrrmo.bocaue.gov.ph, supervisor@mdrrmo.bocaue.gov.ph, responder1/2/4/5@mdrrmo.bocaue.gov.ph (ALPHA-1, BRAVO-1, ALPHA-2, ALPHA-3), responder3/6@bfp.bocaue.gov.ph (CHARLIE-1, CHARLIE-3), receiving@bocauehospital.gov.ph, orgadmin@{mdrrmo,bfp,bocauehospital}…, announcements@lgu.bocaue.gov.ph, citizen@demo.agap, citizenaccountdemo@demo.com (09757072301), bystander@demo.agap. Ready-made offers: responder1 → ALPHA-1 Turo chest-pain; responder3 → CHARLIE-1 Bundukan fireworks fire. Free for a live SOS: ALPHA-2, ALPHA-3, BRAVO-1, CHARLIE-3.

### Railway variables on `agap-emergency` (names; values in Bitwarden/Railway)

```
RAILWAY_DOCKERFILE_PATH=backend/Dockerfile   PORT=3000   NODE_ENV=production   BACKEND_PORT=3000   BACKEND_HOST=0.0.0.0
DATABASE_URL=${{PostGIS.DATABASE_PRIVATE_URL}}
REDIS_URL=<private redis URL>?family=0        # possibly still a pasted literal, not ${{Redis.REDIS_URL}}?family=0
JWT_SECRET JWT_REFRESH_SECRET MEDICAL_ENCRYPTION_KEY MFA_ENCRYPTION_KEY ID_DOCUMENT_ENCRYPTION_KEY ID_PIN_PEPPER BARANGAY_LINK_SECRET
ID_VERIFICATION_REQUIRED=true
STORAGE_ENDPOINT STORAGE_ACCESS_KEY STORAGE_SECRET_KEY STORAGE_BUCKET=agap-media STORAGE_REGION=auto STORAGE_LOCAL_FALLBACK=false
CORS_ORIGIN=https://agap-emergency.vercel.app
PUBLIC_APP_URL=https://agap-emergency.vercel.app
WEBAUTHN_RP_ID=agap-emergency-production.up.railway.app,agap-emergency.vercel.app
WEBAUTHN_ORIGIN=https://agap-emergency.vercel.app,https://agap-emergency-production.up.railway.app
WEBAUTHN_ANDROID_PACKAGE=com.agap.emergency   WEBAUTHN_ANDROID_CERT_FINGERPRINTS=<2 fingerprints from local backend/.env>
CITIZEN_SMS_SOS_ENABLED=true BARANGAY_ALERTS_ENABLED=false AI_ASSIST_ENABLED=false PROFILE_PHOTO_CHECKS=off
FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY   TEXTBEE_API_KEY TEXTBEE_DEVICE_ID MDRRMO_OPS_PHONE   MAP_* (copied from local .env)
Settings: Healthcheck /v1/health; Pre-deploy `npx prisma migrate deploy`; Custom Start Command EMPTY
```
Not set: `TRUST_PROXY` (Phase 6 decision), `COOKIE_DOMAIN`, `COOKIE_SECURE` (defaults: secure in production).

### Railway service facts learned

| Service | Fact |
|---|---|
| PostGIS | Variables offered by `${{`: `DATABASE_PRIVATE_URL`, `DATABASE_URL` (= public proxy), `PGDATA`, `PGHOST`, `PGPORT`, `POSTGRES_DB`. Public TCP proxy was `gondola.proxy.rlwy.net:35360` — now removed. |
| Redis | Public access off; `REDIS_URL` host `redis.railway.internal:6379`; start command above (no maxmemory flags). Public access panel warns: "Anyone with the string can connect… Public traffic is billed as egress." |
| agap-emergency | Public domain `agap-emergency-production.up.railway.app` → port 3000 |

### Vercel project facts

| Item | Value |
|---|---|
| Project / team | `agap-emergency` / "githubdevbyjph-9508…" (Hobby) |
| Production address | `https://agap-emergency.vercel.app` |
| Root Directory | `frontend` (single project; "Services" import rejected) |
| Build | from `frontend/vercel.json`: install `pnpm install --frozen-lockfile --filter @agap/frontend...`, build `pnpm --filter @agap/shared build && pnpm build`, region `sin1` |
| Env (Prod + Preview) | `PROXY_API`, `BACKEND_INTERNAL_URL`, `NEXT_PUBLIC_WS_URL`, `ENABLE_EXPERIMENTAL_COREPACK=1` |

### Dashboard click paths used this session (reuse in Phase 5/6 instructions)

| Need | Where |
|---|---|
| Edit one backend variable | Railway → `agap-emergency` box → Variables → row ⋮ → Edit → ✓ → **Deploy** on the banner |
| Reference another service's variable | value box, type `${{` → pick e.g. `PostGIS.DATABASE_PRIVATE_URL` → eye icon shows the resolved value |
| Read Redis start command | Railway → Redis box → Settings → Deploy → Custom Start Command |
| Close DB public door | Railway → PostGIS box → Settings → Networking → Public Networking → TCP proxy row → trash icon |
| Redis public access (leave OFF) | Railway → Redis box → Settings → Networking → "Public access" |
| Copy Firebase key | service-account JSON `private_key` value without the quotes; paste in the single-variable editor, not Raw Editor |
| Import web app | Vercel → Add New… → Project → Import repo → "Services" screen → `frontend` → **Import single project** |
| Vercel Node version / root dir | Vercel project → Settings → Build and Deployment (Node.js Version 22.x; Root Directory `frontend` + "Include files outside the root directory") |
| Vercel redeploy | Deployments tab → ⋯ on latest → Redeploy (needed after any env change: `NEXT_PUBLIC_*` are build-time) |
| Vercel build log | open the deployment → Build Logs |

### PowerShell patterns that worked (secrets never echoed)

```powershell
$env:X = [System.Net.NetworkCredential]::new('', (Read-Host "Paste X" -AsSecureString)).Password   # hidden input
if ($env:DATABASE_URL -notmatch 'proxy\.rlwy\.net') { Write-Host "STOP …" } else { pnpm db:seed; if ($?) { pnpm db:rotate-seeded-passwords } }
Remove-Item Env:X                                                                                   # clean up
node -e '…require(''ioredis'')…'   # in a single-quoted PS string, double the single quotes; avoid " (PS 5.1 strips them for native exes)
```
Plain `Read-Host` (used once for `DATABASE_URL`) **echoes** — that is how the DB URL leaked.

### `/b` investigation (no bug; kept so it isn't repeated)

- Server HTML of `/b` with an Android Chrome user agent: HTTP 200, 10,016 bytes, `<title>AGAP Operations Center`, contains "Enter the alert code" (server-rendered form; works even before JS loads).
- `frontend/middleware.ts` lists `/b` in `PUBLIC_EXACT`; `/b/<code>` under `PUBLIC_PATHS`. `AuthGate` wraps only `app/(ops)/layout.tsx`, not `app/b`. `providers/providers.tsx` has no auth redirect.
- The user's first "does not load on the phone" was a mistake; corrected to "loads".

### Exposure timeline (for the password-rotation decision)

| Secret | How exposed | Reachable from internet now? | Action |
|---|---|---|---|
| Redis password (`REDIS_URL`) | pasted in chat (parent session + this one) | No (public access never on) | rotate before pilot |
| Postgres password (public URL) | echoed by plain `Read-Host`, transcript pasted in chat | No (TCP proxy removed, verified `ECONNRESET`) | rotate before pilot |
| Seed dev password `AgapDev2026!` | public repo | Not usable (17 accounts rotated) | rerun rotation after every seed |
| Admin email | in chat transcript (user's own Gmail) | n/a (username, not a secret) | none |

## Code Analysis

- `backend/scripts/rotate-seeded-passwords.ts` (new): `PUBLIC_PASSWORDS = ['AgapDev2026!', '@L03e1t3!@', 'ChangeThisPasswordImmediately!']`, `MIN_LENGTH = 12`. Reads `NEW_DEMO_PASSWORD` + `DATABASE_URL`; `bcrypt.compare` each user's `password_hash` against the public list; for matches, in one `$transaction` per user: `user.update` (new hash, `failed_login_count: 0`, `locked_until: null`, `lockout_level: 0`), `user_sessions.updateMany(is_revoked: true)`, `trusted_devices.updateMany(revoked_at: now)`, `auditLog.create({ action: PASSWORD_CHANGE, entity_type: 'users', entity_id, module_id: 'MOD-49', new_values: { reason } })`. Never prints the password. Script entry: `"db:rotate-seeded-passwords": "ts-node scripts/rotate-seeded-passwords.ts"` in `backend/package.json`.
- `backend/prisma/seed/seed.ts`: `DEV_PASSWORD = 'AgapDev2026!'` (line 22); presentation citizen `citizenaccountdemo@demo.com` gets `'@L03e1t3!@'` and is **reset on every seed** (lines ~1055–1070, `update` sets `password_hash`); admin from `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` (defaults `admin@agap.local` / `ChangeThisPasswordImmediately!`), `must_change_password: true`; summary console text at lines ~1116–1130 is static. `import 'dotenv/config'` at line 1.
- `backend/prisma/seed/barangay-directory.ts`: reads `docs/automation/bocaue-barangay-hotlines.json` (1 entry `"is_demo": true`); throws when demo contacts exist and `NODE_ENV=production`.
- `backend/src/auth/well-known.controller.ts`: `assetlinks.json` returns `[]` if `WEBAUTHN_ANDROID_CERT_FINGERPRINTS` empty; package from `WEBAUTHN_ANDROID_PACKAGE` (default `com.agap.emergency`); fingerprints upper-cased.
- `backend/src/auth/sessions/session-cookie.ts`: `REFRESH_COOKIE='agap_refresh'`, HttpOnly, `sameSite: 'strict'`, `secure` = `COOKIE_SECURE` or `NODE_ENV==='production'`, optional `COOKIE_DOMAIN`; web clients send header `x-agap-client: web`. Works through Vercel's rewrite because the cookie is host-only on `agap-emergency.vercel.app`.
- `backend/src/main.ts`: CORS from `CORS_ORIGIN` (comma list, default `http://localhost:3001`); `trust proxy` from `TRUST_PROXY` default `'loopback, linklocal, uniquelocal'` via `parseTrustProxy`; listens on `BACKEND_PORT`/`BACKEND_HOST`. `backend/src/realtime/agap.gateway.ts:24` also uses `CORS_ORIGIN`.
- `backend/src/auth/webauthn.service.ts:82-85`: `WEBAUTHN_RP_ID` (csv, default `localhost`), `WEBAUTHN_ORIGIN` (csv, default `http://localhost:3000`).
- `frontend/middleware.ts`: public paths `/login`, `/b/`, `/v1/public/barangay/`, exact `/b`; others redirect to `/login?next=…` without the `agap_refresh` cookie; matcher excludes `v1/`, `socket.io/`, `sw.js`, `route-warmup-worker.js`.
- `frontend/next.config.mjs`: `proxyApi = NODE_ENV!=='production' || PROXY_API==='true'`; `keepWsUrl = NODE_ENV==='production' && !!NEXT_PUBLIC_WS_URL`; rewrites `/v1/:path*` and `/socket.io/` to `BACKEND_INTERNAL_URL` when proxying; `/v1/public/barangay/:path*` always forwarded.
- `mobile/eas.json`: profiles development/preview/production all pin `node 22.14.0`, `pnpm 11.1.1`; `preview` = `distribution: internal`, `environment: preview`, `android.buildType: apk`. `mobile/app.json`: name AGAP, slug `agap-emergency`, package `com.agap.emergency`, EAS `projectId 8ca010d9-8a80-4b01-a55a-c394c52c852f`, owner `catchy-sql`.
- Mobile env vars read in code (`mobile/src`, `mobile/app`, `app.config.*`): `EXPO_PUBLIC_API_URL` (18 refs), `EXPO_PUBLIC_AGAP_SMS_NUMBER` (2), `EXPO_PUBLIC_PASSKEY_RP_ID` (2), `EXPO_PUBLIC_WS_URL` (1). **`EXPO_PUBLIC_MAP_API_KEY` was not found in that grep** although the plan lists it — verify before creating it on EAS.

## Files Changed

### Source code
- `backend/scripts/rotate-seeded-passwords.ts` — new; replaces public seed passwords after a seed (see Code Analysis).
- `backend/package.json` — added script `db:rotate-seeded-passwords`.

### Docs
- `docs/plans/DEPLOYMENT_PLAN.md` — status line (Phases 1–4 done, free addresses); 3.3 three new bullets (rotation script, `-AsSecureString`, close DB proxy); new 3.5 "Railway lessons" table (8 rows); Phase 3 boxes ticked + open password-rotation box; Phase 4 "Notes from the first deploy" + boxes ticked.
- `docs/handoff/2026-11-24_deployment-phases-3-4.md` — this file.

### Memory (outside repo)
- `C:\Users\githu\.claude\projects\c--Users-githu-Music-agap-emergency\memory\project-railway-gotchas.md` — new; plus a line in `MEMORY.md`.

### Tests
- None added. Rotation script verified by `tsc` (exit 0) and its two input guards; real run against Railway: 17 of 18 changed.

## User Feedback & Preferences (REQUIRED — never omit)

- Asked for the onboarding narration first and to **wait for go-ahead** before executing; then moved step by step, reporting each dashboard action ("done, redeployed — here are the logs").
- Reports status with **Railway log JSON exports and screenshots**; logs are huge (each deploy ~250 route lines) — scan for the key lines only.
- Asks small clarifying questions mid-step ("should I copy the value starting with its open quote?", "is this my public url?", "is it on the image or is this it?", "what should I put on INITIAL_ADMIN_EMAIL?", "should it be production and preview?") → keep answers short, concrete, with the exact click path.
- **Pastes secrets into chat by accident** (Redis private URL twice, Postgres public URL via a terminal transcript). Remind gently, never repeat the value, and give every secret prompt as `Read-Host -AsSecureString`.
- Confirmed the GitHub **repo is public** → treat anything in the repo as public.
- Chose to **stay on free addresses** (no domain) — consistent with the $0 preference.
- Runs commits/pushes themself; give **both PowerShell (`@'…'@ | git commit -F -`) and Git Bash (heredoc)** forms.
- Corrected themself ("/b does not load" → "/b loads on phone") — double-check ambiguous failure reports before deep debugging.
- Wants **handoffs + a paste prompt** to continue in a fresh session, and wants the session closed after the handoff.
- From the parent session (still valid): phase by phase; detailed click-by-click dashboard steps; secrets in Bitwarden collection "AGAP Deployment"; database started fresh; terse answers welcome when asked.

## Where We're Going

**Phase 5 — EAS preview APK, on the free addresses** (plan Phase 5; replace `api.<domain>` with `agap-emergency-production.up.railway.app`). Run from `mobile/`; `eas` CLI is used (no local JDK; builds are in EAS cloud).

1. **Confirm the preview signing fingerprint:** `cd mobile; eas credentials` → Android → preview. Compare its SHA-256 with the two already in `WEBAUTHN_ANDROID_CERT_FINGERPRINTS` (`D8:F4:C5:17:…:31:75`, `C9:A0:C6:1B:…:66:48`, visible at `https://agap-emergency-production.up.railway.app/.well-known/assetlinks.json`). If it is not one of them, add it on Railway (comma list) and redeploy.
2. **Check which `EXPO_PUBLIC_*` the app really reads** (grep `mobile/` incl. `app.config.js`; `EXPO_PUBLIC_MAP_API_KEY` looked unused) and the value of `EXPO_PUBLIC_AGAP_SMS_NUMBER` (the Textbee SIM number — not a secret; user has it locally).
3. **Create EAS env vars for `preview`** (plaintext; none are secret):
   ```
   eas env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://agap-emergency-production.up.railway.app --visibility plaintext
   eas env:create --environment preview --name EXPO_PUBLIC_WS_URL --value wss://agap-emergency-production.up.railway.app --visibility plaintext
   eas env:create --environment preview --name EXPO_PUBLIC_PASSKEY_RP_ID --value agap-emergency-production.up.railway.app --visibility plaintext
   eas env:create --environment preview --name EXPO_PUBLIC_AGAP_SMS_NUMBER --value <Textbee SIM number> --visibility plaintext
   ```
   Check first whether `EXPO_PUBLIC_API_URL` should include `/v1` — read how `mobile/src` builds request URLs before setting it.
4. **Build:** `eas build --profile preview --platform android` (EAS free tier). Uninstall the dev client on test phones first (same package `com.agap.emergency`).
5. **Phase 5 Done when:** APK installs; sign-in works over **mobile data**; push permission granted and the device token registers (Firebase is now initialized on Railway).
6. Then **Phase 6** end-to-end checks (plan list), including the `TRUST_PROXY` decision (plan recommends `1`) and setting `STORAGE_LOCAL_FALLBACK=true` after a successful photo upload.
7. **Before any real pilot:** change the PostGIS and Redis passwords (open box in Phase 3); optionally switch `REDIS_URL` to the reference `${{Redis.REDIS_URL}}?family=0` at the same time.

## Risks & Blockers

- **Railway Trial credit** ($5 / 30 days). Moving DB traffic to the private network and closing the DB proxy reduces egress, but an always-on backend will likely need **Hobby ($5/mo)** before the trial ends. If the backend moves elsewhere, the APK built on the Railway address must be rebuilt.
- **Textbee double-processing:** never run the local backend (or a local prod container) with `CITIZEN_SMS_SOS_ENABLED=true` / barangay SMS replies on while Railway runs — both would poll the same Textbee device.
- **Per-IP rate limits** (login 5/min; guest SOS 20 per 10 min) may lump users together behind Vercel/Railway proxies until `TRUST_PROXY` is decided in Phase 6. "Too many attempts" during testing likely means this. Emergency switch: `GUEST_REPORT_LIMIT_DISABLED=true`.
- **Leaked DB/Redis passwords** (chat transcript) — only reachable inside the Railway project now; rotate before a real pilot.
- **Every push to `main` redeploys Railway and Vercel** — don't push broken work.

## Open Questions

- Did the admin change its password at first sign-in, and is Bitwarden updated? (Asked twice; not answered explicitly.)
- Is the Vercel Node.js version set to 22.x? Which pnpm version did the Vercel build log show (expected 11.1.1)?
- Is `REDIS_URL` on Railway still a pasted literal or the `${{Redis.REDIS_URL}}?family=0` reference? (Matters for password rotation: a literal won't follow a new password.)
- How to rotate the PostGIS password on Railway's PostGIS template: likely `ALTER USER postgres PASSWORD …` plus updating the template's password variable(s) so `DATABASE_PRIVATE_URL` follows — not verified.
- Does the EAS preview keystore match one of the two fingerprints already on Railway?

## Quick Start for Next Session

```bash
# Restore context (bd not installed)
# Reference docs
docs/plans/DEPLOYMENT_PLAN.md          # Phase 5 + 6; substitute the free addresses for api./app.<domain>
docs/handoff/2026-11-24_deployment-phases-1-3.md   # parent (Phases 1–3 history)
CLAUDE.md

# Key files to read first (not exhaustive — explore adjacent code too)
mobile/eas.json
mobile/app.json  mobile/app.config.js
mobile/src (grep EXPO_PUBLIC_) — how the API base URL and SMS number are read
backend/src/auth/well-known.controller.ts
backend/src/auth/webauthn.service.ts

# Verify current state (read-only)
curl -s https://agap-emergency-production.up.railway.app/v1/health
curl -s https://agap-emergency-production.up.railway.app/.well-known/assetlinks.json
curl -s -o /dev/null -w "%{http_code}\n" https://agap-emergency.vercel.app/login

# Next action
Phase 5 step 1: have the user run `cd mobile; eas credentials` (Android → preview) and compare the SHA-256
with the two fingerprints in assetlinks.json; meanwhile grep mobile/ for EXPO_PUBLIC_* to finalize the EAS env list.
```

## Session Closed
**Closed at:** 2026-11-24 (local)
**Commit:** the `session: deployment-phases-3-4` commit that includes this note (not pushed: a push to main redeploys Railway and Vercel)
**Session status:** Handed off to next session
