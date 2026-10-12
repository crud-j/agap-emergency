# AGAP — Emergency Response and Incident Coordination Platform

AGAP is a GPS-based digital coordination layer that connects citizens, bystanders, the MDRRMO/LGU Operations Center, responders, hospitals, and authorized emergency organizations in Bocaue, Bulacan, Philippines.

**AGAP does not replace 911, existing MDRRMO hotlines, trained personnel, ambulance services, or hospital systems. It complements them.**

---

## Table of Contents

- [Repository Structure](#repository-structure)
- [Technology Stack](#technology-stack)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Infrastructure (Docker)](#infrastructure-docker)
- [Installing Dependencies](#installing-dependencies)
- [Database Setup](#database-setup)
- [Running the Applications](#running-the-applications)
- [Testing](#testing)
- [Linting and Type Checking](#linting-and-type-checking)
- [Building for Production](#building-for-production)
- [API Documentation](#api-documentation)
- [Architectural Principles](#architectural-principles)
- [Modules](#modules)

---

## Repository Structure

```
agap-emergency/
├── backend/          # NestJS REST API + WebSocket server  (port 3000)
├── frontend/         # Next.js Operations Center — MDRRMO/LGU  (port 3001)
├── mobile/           # Expo React Native — citizen + responder apps
├── shared/           # Shared TypeScript types, enums, validation contracts
├── tests/            # Cross-package unit and integration test suite
├── infrastructure/   # Docker, nginx, Postgres init, MinIO
├── scripts/          # Dev setup helpers
├── docs/             # Architecture, 53 module specs, DB schema docs
└── .github/          # CI/CD workflows (lint, typecheck, test, security)
```

Package manager: **pnpm** workspaces. All packages are managed from the repo root.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Backend | NestJS, TypeScript, Prisma ORM |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| Cache / Jobs | Redis 7 + BullMQ |
| Real-time | Socket.IO WebSocket |
| Frontend | Next.js 14, React, Tailwind CSS, TanStack Query |
| Mobile | Expo 57, React Native, Expo Router |
| Object Storage | MinIO (dev) / S3-compatible (prod) |
| Push Notifications | Firebase Cloud Messaging |
| SMS | Textbee (textbee.dev) — Android device SIM gateway |

---

## Prerequisites

Install these before cloning:

| Tool | Minimum version | Install |
|------|----------------|---------|
| Node.js | 20.x LTS | https://nodejs.org |
| pnpm | 9.x | `npm install -g pnpm` |
| Docker Desktop | latest | https://www.docker.com/products/docker-desktop |
| Git | any | https://git-scm.com |

Optional but recommended:
- **VS Code** with the [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) and [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extensions
- **Prisma VS Code extension** for schema highlighting

---

## Environment Setup

```bash
# 1. Copy the example env file
cp .env.example .env
```

Open `.env` and fill in the required values:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Pre-filled for Docker dev setup |
| `REDIS_URL` | Yes | Pre-filled for Docker dev setup |
| `JWT_SECRET` | Yes | Generate: `openssl rand -hex 64` |
| `JWT_REFRESH_SECRET` | Yes | Generate: `openssl rand -hex 64` |
| `TEXTBEE_API_KEY` | For SMS | Textbee API key (https://textbee.dev) |
| `TEXTBEE_DEVICE_ID` | For SMS | Android gateway device ID from Textbee dashboard |
| `MDRRMO_OPS_PHONE` | For SMS | Operations center phone number that receives alerts |
| `FCM_PROJECT_ID` | For push | Firebase project credentials |
| `FCM_CLIENT_EMAIL` | For push | Firebase project credentials |
| `FCM_PRIVATE_KEY` | For push | Firebase project credentials |
| `MAP_API_KEY` | For maps | Mapbox public token |
| `INITIAL_ADMIN_PASSWORD` | Yes | First login password for admin account |

For local development, the database and Redis values in `.env.example` work as-is with the Docker setup below.

---

## Infrastructure (Docker)

All infrastructure runs in Docker. Start it before running any application.

```bash
# Start PostgreSQL (PostGIS), Redis, and MinIO (object storage)
docker compose up -d postgres redis minio

# Verify all containers are healthy
docker compose ps
```

Expected output — all three should show `healthy`:
```
agap_postgres   running   healthy
agap_redis      running   healthy
agap_minio      running   healthy
```

Port mappings (host → container):
| Service | Host port |
|---------|-----------|
| PostgreSQL | `5461` |
| Redis | `6382` |
| MinIO | `9000` |

To stop infrastructure:
```bash
docker compose down
```

To stop and wipe all data volumes (full reset):
```bash
docker compose down -v
```

---

## Installing Dependencies

Install all workspace packages from the repo root:

```bash
pnpm install
```

This installs dependencies for `backend`, `frontend`, `mobile`, `shared`, and `tests` in one command.

---

## Database Setup

Run these once after first clone, and again after any new Prisma migration is added.

```bash
# Generate the Prisma client (must run after schema changes)
pnpm --filter @agap/backend db:generate

# Apply all migrations to the database
pnpm --filter @agap/backend db:migrate

# Seed with initial data (admin account, org, sample resources)
pnpm --filter @agap/backend db:seed
```

To open the Prisma visual database browser:
```bash
pnpm --filter @agap/backend db:studio
# Opens at http://localhost:5555
```

---

## Running the Applications

Open a separate terminal for each process.

### Backend (NestJS)

```bash
# Development mode with hot reload
pnpm --filter @agap/backend start:dev

# Debug mode (attach Node inspector on port 9229)
pnpm --filter @agap/backend start:debug
```

Backend runs at **http://localhost:3000**

### Frontend (Next.js Operations Center)

```bash
pnpm --filter @agap/frontend dev
```

Frontend runs at **http://localhost:3001**

### Mobile (Expo)

```bash
# Start Expo dev server (opens QR code for Expo Go or device)
pnpm --filter @agap/mobile start

# Android emulator
pnpm --filter @agap/mobile android

# iOS simulator (macOS only)
pnpm --filter @agap/mobile ios
cloudflared tunnel --url http://127.0.0.1:3000
npx expo start --dev-client
ngrok http 3000 --domain=benevolent-semirhythmically-tova.ngrok-free.dev
curl -H "ngrok-skip-browser-warning: 1" https://benevolent-semirhythmically-tova.ngrok-free.dev/.well-known/assetlinks.json

$token = (curl.exe -s -X POST http://localhost:3000/v1/auth/login -H "Content-Type: application/json" -d '{\"identifier\":\"citizen@demo.agap\",\"password\":\"AgapDev2026!\"}' | ConvertFrom-Json).accessToken; curl.exe -X GET http://localhost:3000/v1/incidents/mine -H "Authorization: Bearer $token"
```

### Run everything from root

```bash
# Runs all packages concurrently (requires concurrently installed globally,
# or use separate terminals as shown above)
pnpm --filter @agap/backend start:dev &
pnpm --filter @agap/frontend dev &
pnpm --filter @agap/mobile start
```

---

## Testing

### Cross-package test suite (`tests/`)

The `tests/` package contains unit and integration tests for the backend services. No database or Redis is needed — all external dependencies are mocked.

```bash
# Run all tests (from repo root)
pnpm --filter @agap/tests test

# Watch mode — re-runs on file change
pnpm --filter @agap/tests test:watch

# With coverage report
pnpm --filter @agap/tests test:cov
```

Or from inside the `tests/` directory:
```bash
cd tests
pnpm test
pnpm test:watch
pnpm test:cov
```

Current coverage: **65 tests** across 5 service suites.

| Test file | Service | Tests |
|-----------|---------|-------|
| `backend/auth.service.spec.ts` | AuthService | 16 |
| `backend/incidents.service.spec.ts` | IncidentsService | 15 |
| `backend/emergency-alerts.service.spec.ts` | EmergencyAlertsService | 12 |
| `backend/dispatch.service.spec.ts` | DispatchService | 11 |
| `backend/offline-sync.service.spec.ts` | OfflineSyncService | 4 |
| `backend/offline-sync.service.spec.ts` | Shared helpers | 7 |

### Backend unit tests (NestJS built-in)

```bash
pnpm --filter @agap/backend test

# Watch mode
pnpm --filter @agap/backend test:watch

# With coverage
pnpm --filter @agap/backend test:cov
```

### End-to-end tests

```bash
# Requires a running backend + database
pnpm --filter @agap/backend test:e2e
```

### Run all tests from root

```bash
pnpm test
```

---

## Linting and Type Checking

```bash
# Lint all packages
pnpm lint

# Type check all packages
pnpm typecheck

# Format all files (Prettier)
pnpm format

# Individual packages
pnpm --filter @agap/backend lint
pnpm --filter @agap/backend typecheck

pnpm --filter @agap/frontend lint
pnpm --filter @agap/frontend typecheck

pnpm --filter @agap/mobile lint
pnpm --filter @agap/mobile typecheck
```

---

## Building for Production

```bash
# Build all packages
pnpm build

# Build individual packages
pnpm --filter @agap/backend build
pnpm --filter @agap/frontend build
```

Run in production with Docker:
```bash
docker compose -f docker-compose.prod.yml up -d
```

---

## API Documentation

The backend exposes a Swagger UI when running in development:

```
http://localhost:3000/api/docs
```

All REST endpoints are versioned under `/api/v1/`. Key route groups:

```
/api/v1/auth              # Registration, login, OTP, refresh, logout
/api/v1/users             # User profiles
/api/v1/incidents         # Incident lifecycle (central business object)
/api/v1/alerts            # SOS and shake-to-alert triggers
/api/v1/dispatch          # Dispatcher assignment and dispatch
/api/v1/locations         # GPS and live tracking
/api/v1/hospitals         # Hospital registry and referrals
/api/v1/resources         # Resource and fleet management
/api/v1/notifications     # Push and SMS notifications
/api/v1/announcements     # Public broadcast (MOD-53)
/api/v1/analytics         # Response analytics and reports
/api/v1/audit             # Immutable audit trail
/api/v1/admin             # System administration
```

WebSocket events (Socket.IO) — authenticated connections only:
```
incident.created / incident.updated / incident.status_changed
dispatch.created / dispatch.updated
responder.location_updated / responder.eta_updated
announcement.published
```

---

## Architectural Principles

- **Incident is the central business object.** Every module exists to support the incident lifecycle.
- **Reporter ≠ Patient.** Always separate concepts. Unknown patient identity is valid and never blocks dispatch.
- **PostgreSQL is the source of truth.** WebSocket distributes changes; it does not replace persistence.
- **Critical incident persistence is synchronous.** Queues handle background tasks and retries.
- **Optional data never blocks submission.** GPS, photos, and medical profiles are best-effort.
- **Notification failure does not invalidate an incident.** Failed SMS or push never cancels a record.
- **Dispatch recommendations assist personnel.** They never make decisions autonomously.
- **Offline retries are idempotent.** Duplicate client event IDs are deduplicated server-side.
- **Registration never blocks emergency reporting.** Guest reporting is always available.
- **All consequential actions are auditable.** Audit logs are immutable — no UPDATE or DELETE.

---

---
Docker commands when backend code changes:

# Rebuild only the backend image and restart its container
docker compose up -d --build backend

If you also changed Prisma schema and need migrations to run:

# Rebuild backend, then run pending migrations
---
Docker commands when backend code changes:

# Rebuild only the backend image and restart its container
docker compose up -d --build backend

If you also changed Prisma schema and need migrations to run:

# Rebuild backend, then run pending migrations
docker compose up -d --build backend
docker compose exec backend npx prisma migrate deploy

To check if it's running and see logs:

# Tail backend logs
docker compose logs -f backend

# Check all container status
docker compose ps

Swagger will be at http://localhost:3002/api/docs when running via Docker (port 3002 → container 3000, as set in docker-compose.yml line 52).


---



## Modules

53 functional modules across 10 clusters. See [`docs/modules/`](docs/modules/) for per-module specifications.

| Cluster | Modules |
|---------|---------|
| A — User and Identity | MOD-01 to MOD-05 |
| B — Alert Triggering | MOD-06 to MOD-08 |
| C — Location and Tracking | MOD-09 to MOD-13 |
| D — Alert Processing and Dispatch | MOD-14 to MOD-24 |
| E — Monitoring and Escalation | MOD-25 to MOD-32 |
| F — Field Response and Coordination | MOD-33 to MOD-40 |
| G — Status, Escalation, and Closure | MOD-41 to MOD-45 |
| H — Governance and Compliance | MOD-46 to MOD-49 |
| I — Analytics, Intelligence, and Surge | MOD-50 to MOD-52 |
| J — Municipal Broadcast | MOD-53 |

Architecture baseline: [`docs/AGAP_Complete_Master_Enterprise_Architecture.md`](docs/AGAP_Complete_Master_Enterprise_Architecture.md)

---

## License

See [LICENSE](LICENSE).
