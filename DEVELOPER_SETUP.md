# AGAP — Developer Setup Guide (No Docker)

This guide covers setting up the AGAP monorepo locally without Docker. You will install
PostgreSQL, Redis, and Node.js directly on your machine.

---

## Prerequisites

Install the following tools before starting.

### Required

| Tool | Version | Download |
|---|---|---|
| Node.js | >= 20 (LTS) | https://nodejs.org |
| pnpm | >= 9 | `npm install -g pnpm` |
| PostgreSQL | >= 15 | https://www.postgresql.org/download |
| Redis | >= 7 | See per-OS instructions below |
| Git | any recent | https://git-scm.com |

### Optional (mobile development only)

| Tool | Notes |
|---|---|
| Android Studio | For Android emulator / physical device |
| Xcode (macOS only) | For iOS simulator |
| Expo Go app | Fastest way to test on a physical device |

---

## 1. Clone the repository

```bash
git clone https://github.com/crud-j/agap-emergency.git agap-emergency
cd agap-emergency
```

If you already have the repo and just need to pull the latest changes:

```bash
git pull origin main
```

---

## 2. Install PostgreSQL (no Docker)

### Windows

Download and run the installer from https://www.postgresql.org/download/windows.
During setup, note the password you set for the `postgres` superuser and the port (default: **5432**).

After installation, open **pgAdmin** or **psql** and run:

```sql
CREATE USER agap_user WITH PASSWORD 'agap_password';
CREATE DATABASE agap_db OWNER agap_user;
\c agap_db
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

> PostGIS must be installed separately on Windows. Download the **Stack Builder** that ships
> with PostgreSQL and install the **PostGIS** bundle for your PostgreSQL version.

### macOS (Homebrew)

```bash
brew install postgresql@15 postgis
brew services start postgresql@15

psql postgres -c "CREATE USER agap_user WITH PASSWORD 'agap_password';"
psql postgres -c "CREATE DATABASE agap_db OWNER agap_user;"
psql agap_db -c "CREATE EXTENSION IF NOT EXISTS postgis;"
psql agap_db -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
psql agap_db -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib postgis

sudo -u postgres psql -c "CREATE USER agap_user WITH PASSWORD 'agap_password';"
sudo -u postgres psql -c "CREATE DATABASE agap_db OWNER agap_user;"
sudo -u postgres psql agap_db -c "CREATE EXTENSION IF NOT EXISTS postgis;"
sudo -u postgres psql agap_db -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
sudo -u postgres psql agap_db -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

---

## 3. Install Redis (no Docker)

### Windows

Redis does not have an official native Windows build. Use one of these options:

**Option A — WSL (recommended):**
```bash
# Inside WSL terminal
sudo apt update && sudo apt install -y redis-server
sudo service redis-server start
```

**Option B — Memurai (Windows-native Redis-compatible server):**
Download from https://www.memurai.com — free for development.

### macOS (Homebrew)

```bash
brew install redis
brew services start redis
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y redis-server
sudo systemctl enable --now redis-server
```

---

## 4. Install dependencies

From the repo root:

```bash
pnpm install
```

This installs dependencies for all workspace packages (`backend`, `frontend`, `mobile`, `shared`)
in a single command.

---

## 5. Configure environment variables

```bash
# Copy the example file — do this once
cp .env.example .env
```

Open `.env` and fill in at minimum:

```env
# Database — use 127.0.0.1, NOT "localhost" (avoids IPv6 resolution issues on Windows/Node 18+)
DATABASE_URL=postgresql://agap_user:agap_password@127.0.0.1:5432/agap_db?schema=public

# Redis
REDIS_URL=redis://localhost:6379

# JWT — generate two strong random secrets (e.g. openssl rand -base64 64)
JWT_SECRET=<your_secret>
JWT_REFRESH_SECRET=<your_refresh_secret>

# Initial admin account
INITIAL_ADMIN_EMAIL=admin@agap.local
INITIAL_ADMIN_PASSWORD=<your_admin_password>

# Backend / Frontend URLs (leave as-is for local dev)
BACKEND_PORT=3000
CORS_ORIGIN=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000
EXPO_PUBLIC_API_URL=http://localhost:3000
```

The following are optional for local dev (features will be degraded without them):

| Variable | Feature |
|---|---|
| `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY` | Push notifications |
| `TEXTBEE_API_KEY` / `TEXTBEE_DEVICE_ID` / `MDRRMO_OPS_PHONE` | SMS alerts |
| `MAP_API_KEY` | Mapbox tiles / routing |
| `STORAGE_*` | Incident photo upload |

---

## 6. Run database migrations and seed

```bash
cd backend

# Apply all migrations (creates tables, indexes, enums)
pnpm prisma migrate dev

# Seed the database with initial roles, admin account, and test data
pnpm prisma db seed
```

---

## 7. Run the services

Open separate terminals for each service, or use a terminal multiplexer like `tmux`.

### Backend (NestJS — port 3000)

```bash
cd backend
pnpm start:dev
```

### Frontend (Next.js — port 3001)

```bash
cd frontend
pnpm dev
```

### Mobile (Expo)

```bash
cd mobile
npx expo start --clear
```

Press `a` for Android emulator, `i` for iOS simulator, or scan the QR code with Expo Go.

---

## 8. Verify everything is running

| Service | URL |
|---|---|
| Backend API | http://localhost:3000/api/v1 |
| Swagger docs | http://localhost:3000/api/docs |
| Frontend (Operations Center) | http://localhost:3001 |
| Prisma Studio (optional DB UI) | run `cd backend && pnpm db:studio` → http://localhost:5555 |

---

## Useful commands

```bash
# Install all workspace dependencies
pnpm install

# Run all tests
pnpm test

# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Format all files
pnpm format

# Backend only — watch mode
cd backend && pnpm start:dev

# Backend only — debug mode
cd backend && pnpm start:debug

# Run backend tests with coverage
cd backend && pnpm test:cov

# Run backend E2E tests
cd backend && pnpm test:e2e

# Prisma — create a new migration after schema changes
cd backend && pnpm prisma migrate dev --name <migration_name>

# Prisma — regenerate the client (after schema changes without migration)
cd backend && pnpm db:generate

# Prisma — open database GUI
cd backend && pnpm db:studio

# Frontend dev server
cd frontend && pnpm dev

# Mobile — Android
cd mobile && npx expo run:android

# Mobile — iOS (macOS only)
cd mobile && npx expo run:ios
```

---

## Pulling updates from the team

```bash
git pull origin main
pnpm install                        # pick up any new/changed dependencies
cd backend && pnpm prisma migrate dev  # apply any new migrations
```

---

## Common issues

### `DATABASE_URL` hangs or times out on Windows

Use `127.0.0.1` instead of `localhost`. On Windows with Node 18+, `localhost` resolves to
IPv6 `::1` first; PostgreSQL's TCP listener may not accept that, causing a silent hang.

### `prisma migrate dev` fails with "extension does not exist"

PostGIS is not installed. Re-read step 2 and install the PostGIS extension for your
PostgreSQL version before running migrations.

### Redis connection refused

Make sure Redis is running. On Windows WSL: `sudo service redis-server start`.
On macOS: `brew services start redis`. On Linux: `sudo systemctl start redis-server`.

### Port 3000 or 3001 already in use

```bash
# Windows — find the PID using the port
netstat -ano | findstr :3000
# then kill it
taskkill /PID <pid> /F

# macOS / Linux
lsof -ti:3000 | xargs kill
```

### `pnpm install` fails with workspace resolution errors

Delete the lockfile and reinstall:

```bash
rm pnpm-lock.yaml
pnpm install
```
