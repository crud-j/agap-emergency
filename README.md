# AGAP — Emergency Response and Incident Coordination Platform

AGAP is a digital coordination layer that connects citizens, bystanders, the MDRRMO/LGU Operations Center, responders, hospitals, and authorized emergency organizations.

**AGAP does not replace 911, existing MDRRMO hotlines, trained personnel, ambulance services, or hospital systems.**

---

## Repository Structure

```
agap-emergency/
├── backend/          # NestJS REST API + WebSocket server
├── frontend/         # Next.js Operations Center (MDRRMO/LGU)
├── mobile/           # Expo React Native (citizen + responder)
├── shared/           # Shared TypeScript types, enums, contracts
├── infrastructure/   # Docker, nginx, database init
├── scripts/          # Dev setup scripts
├── docs/             # Architecture and module documentation
└── .github/          # CI/CD workflows
```

## Quick Start

```bash
# 1. Copy environment config
cp .env.example .env
# Edit .env with your database, JWT secrets, etc.

# 2. Start infrastructure
docker-compose up -d

# 3. Install dependencies
pnpm install

# 4. Generate Prisma client and migrate
pnpm --filter @agap/backend db:generate
pnpm --filter @agap/backend db:migrate

# 5. Seed database
pnpm --filter @agap/backend db:seed

# 6. Start backend
pnpm --filter @agap/backend start:dev

# 7. Start frontend (separate terminal)
pnpm --filter @agap/frontend dev

# 8. Start mobile (separate terminal)
pnpm --filter @agap/mobile start
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS, TypeScript, Prisma, PostgreSQL + PostGIS |
| Frontend | Next.js, React, Tailwind CSS, TanStack Query |
| Mobile | Expo, React Native, Expo Router |
| Real-time | Socket.IO WebSocket |
| Background | Redis + BullMQ |
| Database | PostgreSQL 16 + PostGIS 3.4 |

## Architectural Principles

- PostgreSQL is the source of truth
- WebSocket is for real-time distribution only
- Redis/BullMQ handles background jobs
- Reporter and patient are separate concepts
- Emergency reporting does not require registration
- GPS is best-effort and optional
- Dispatch recommendation ≠ dispatch authorization
- Notification failure does not invalidate an incident
- Medical data follows least-privilege access

## Modules

See [docs/modules/](docs/modules/) for documentation on all 53 functional modules.

## License

See [LICENSE](LICENSE).
