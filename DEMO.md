# AGAP Demo Runbook (no Docker)

How to reset the database, seed demo data, and run every part of AGAP for a live demo on this laptop.
Everything runs natively: PostgreSQL on Windows, and Redis and Garage (S3 storage) inside WSL Ubuntu.
The mobile app is the **preview APK** already installed on the phone.

| Part | Where it runs | Address |
|---|---|---|
| PostgreSQL 18 | Windows service `postgresql-x64-18` (starts automatically) | `localhost:5432`, database `AGAP` |
| Redis | WSL Ubuntu service `redis-server` (starts with WSL) | `localhost:6379` |
| Object storage (Garage) | WSL Ubuntu, started by hand | `localhost:9000`, bucket `agap-media` |
| Backend (NestJS) | Windows | `http://localhost:3000` (Swagger: `/api/docs`) |
| Frontend (Next.js) | Windows | `http://localhost:3001` |
| Public tunnel for the phone | ngrok | `https://benevolent-semirhythmically-tova.ngrok-free.dev` |

All commands below are **PowerShell, run from the repo root** (`C:\Users\githu\Music\agap-emergency`) unless a step says WSL.

---

## 1. One-time / after every `git pull`

```powershell
pnpm install
pnpm --filter @agap/shared build      # backend + frontend read the compiled shared/dist
cd backend; pnpm prisma migrate deploy; cd ..
```

Skipping the `shared` build gives hundreds of `has no exported member ... from '@agap/shared'` errors.

---

## 2. Reset the database and seed demo data

Pick **one** of the two options, then run the seed.

### Option A — Full reset (drops and recreates everything from `backend/prisma/schema.prisma` migrations)

```powershell
cd backend
pnpm prisma migrate reset --force    # drops DB, re-applies every migration
pnpm prisma db seed                  # Prisma 7 no longer seeds automatically after reset
cd ..
```

Use this when the database is in a bad state or migrations drifted.
Never run it against a database whose data you need: it deletes **everything**, including the audit log.

### Option B — Quick data wipe (keeps the schema and migration history)

```powershell
cd backend
pnpm db:reset-data                   # empties all AGAP tables (scripts/db/reset-data.sql)
pnpm db:seed
cd ..
```

Faster; good for "clean slate" between demo rehearsals.

### Demo accounts created by the seed

Password for all of them: **`AgapDev2026!`**
Staff accounts are flagged *must change password* on first login — log in once with each account you'll use **before** the demo and set its new password.

| Role | Login |
|---|---|
| Dispatcher | `dispatcher1@mdrrmo.bocaue.gov.ph`, `dispatcher2@mdrrmo.bocaue.gov.ph` |
| Supervisor | `supervisor@mdrrmo.bocaue.gov.ph` |
| Responder (MDRRMO) | `responder1@`, `responder2@`, `responder4@`, `responder5@mdrrmo.bocaue.gov.ph` |
| Responder (BFP) | `responder3@bfp.bocaue.gov.ph`, `responder6@bfp.bocaue.gov.ph` |
| Hospital receiving | `receiving@bocauehospital.gov.ph` |
| Org admins | `orgadmin@mdrrmo.bocaue.gov.ph`, `orgadmin@bfp.bocaue.gov.ph`, `orgadmin@bocauehospital.gov.ph` |
| Announcements publisher | `announcements@lgu.bocaue.gov.ph` |
| Citizen | `citizen@demo.agap` |
| Bystander | `bystander@demo.agap` |
| System admin | `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` from `backend/.env` (default `admin@agap.local`) |

To put dispatcher passwords back to `AgapDev2026!` later:

```powershell
cd backend
pnpm dev:reset-dispatcher            # all dispatchers
pnpm dev:reset-dispatcher --mfa      # also wipe passkeys / authenticator / backup codes
cd ..
```

---

## 3. Build for the demo

Production builds are faster and won't restart if a file is touched mid-demo.

```powershell
pnpm --filter @agap/shared build
pnpm --filter @agap/backend build
```

(The frontend builds itself in step 4.)

---

## 4. Start everything — one terminal per item, in this order

### Terminal 1 — Keep WSL (and Redis) alive

```powershell
Start-Process wsl -ArgumentList '-d','Ubuntu','--','sleep','infinity' -WindowStyle Hidden
wsl -d Ubuntu -- redis-cli ping      # must print PONG
```

Redis starts on its own with WSL; the hidden `sleep` stops WSL shutting down when idle.

### Terminal 2 — Object storage (Garage)

```powershell
wsl -d Ubuntu
```
then, inside Ubuntu:
```bash
~/.config/agap-object-storage/start-garage
```

Leave it open. Photos, profile pictures and ID images are stored here.

### Terminal 3 — Backend

```powershell
pnpm --filter @agap/backend start
```

Wait for `Nest application successfully started`. Check: <http://localhost:3000/api/docs>.

### Terminal 4 — Frontend (Operations Center + Hospital Portal)

```powershell
pnpm --filter @agap/frontend demo                # builds, then starts on :3001
pnpm --filter @agap/frontend demo -- --no-build  # restart without rebuilding
```

Open <http://localhost:3001>.

### Terminal 5 — Tunnel for the phone

```powershell
ngrok http 3000 --domain=benevolent-semirhythmically-tova.ngrok-free.dev
```

The preview APK can't reach `localhost`; it talks to the backend through this tunnel.
Check from the PC:

```powershell
curl.exe -H "ngrok-skip-browser-warning: 1" https://benevolent-semirhythmically-tova.ngrok-free.dev/.well-known/assetlinks.json
```

> **Confirm the APK's URL.** The preview APK has its backend URL baked in from the EAS `preview` environment at build time.
> `backend/.env` and `mobile/.env` on this laptop use `benevolent-semirhythmically-tova.ngrok-free.dev`; the README mentions `await-endearing-prevail.ngrok-free.dev` (another machine).
> Run ngrok with **whichever domain the APK was built with** (`eas env:list --environment preview` in `mobile/` shows it). If they differ, either tunnel the APK's domain or rebuild the APK.
> Passkeys only work on the domain in `WEBAUTHN_RP_ID` (`backend/.env`).

### Phone

Open the installed AGAP preview app. No Metro / `expo start` is needed for a preview APK.

---

## 5. Pre-demo checklist

- [ ] `wsl -d Ubuntu -- redis-cli ping` → `PONG`
- [ ] Garage terminal open, no errors
- [ ] <http://localhost:3000/api/docs> loads
- [ ] <http://localhost:3001> loads and dispatcher can log in
- [ ] Phone app logs in as `citizen@demo.agap` (proves the tunnel works)
- [ ] Send one test SOS from the phone and see it appear on the dashboard
- [ ] First-login password changes already done for every staff account you'll use
- [ ] Re-run step 2 if you want a clean slate after the rehearsal

---

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `has no exported member ... '@agap/shared'` | `pnpm --filter @agap/shared build`, then restart backend |
| `EADDRINUSE :3000` | Another backend is running — stop it (Ctrl+C) before starting a new one |
| Backend logs Redis `ECONNREFUSED` | Run Terminal 1 again; `REDIS_URL` in `backend/.env` must be `redis://localhost:6379` |
| Photo / ID upload fails | Garage not running — start Terminal 2, then restart backend |
| Phone says network error | ngrok not running, or the APK uses a different ngrok domain (see step 4, Terminal 5) |
| Code changed after building | Re-run step 3 and restart backend / `demo` frontend |
| `pnpm install` postinstall `'\|\|' is not a valid statement separator` | pnpm's `scriptShell` set to PowerShell — remove it from `%LOCALAPPDATA%\pnpm\config\config.yaml` |
| `pnpm install` `EPERM ... rename` | Something locked `node_modules` (antivirus / VS Code); stop dev servers and retry |
