# AGAP — Claude Agent Context

## Project Identity

**AGAP** (formerly AlagaLink) — GPS-Based Mobile Emergency Alert System for Immediate Hospital / Ambulance Dispatch.
**Operator context:** Bocaue MDRRMO / LGU Operations Center, Bocaue, Bulacan, Philippines.
**Repo name:** `AGAPSYSTEM-Backend-Frontend` (local path: `agap-emergency`)
**Scope:** 53 modules across 10 clusters. Architecture baseline: `docs/AGAP_Complete_Master_Enterprise_Architecture.md`.

---

## Mission

Reduce the time and informational gap between when an emergency occurs and when the right responders are moving toward it with the correct information. AGAP complements (never replaces) 911 and MDRRMO hotlines.

---

## Monorepo Structure

```
agap-emergency/                     ← pnpm workspace root
├── backend/                        ← NestJS modular monolith (Node.js LTS)
├── frontend/                       ← Next.js + React (Operations Center + Hospital Portal)
├── mobile/                         ← Expo + React Native (Citizen App + Responder App)
├── shared/                         ← shared types, enums, constants, validation, events
├── docs/                           ← architecture, 53 module docs, operations, DB, API, security
├── infrastructure/                 ← Docker, Postgres, Redis, Nginx, monitoring
├── scripts/                        ← setup, DB, dev, test, codegen, maintenance
├── tests/                          ← cross-package unit/integration/e2e/failure fixtures
└── .github/workflows/              ← CI: backend, frontend, mobile, tests, lint, typecheck, security
```

Package manager: **pnpm** (`pnpm-workspace.yaml`). Node >= 20. Lockfile committed.

---

## Technology Stack

### Backend (`backend/`)
- **Runtime:** Node.js LTS
- **Framework:** NestJS (TypeScript) — modular monolith, one deployable service
- **ORM:** Prisma → PostgreSQL (PostGIS enabled for geographic queries)
- **Cache/Jobs:** Redis + BullMQ
- **API:** REST (versioned `/api/v1/…`) + WebSocket (Socket.io)
- **Auth:** JWT (access + refresh rotation) stored in Expo Secure Store on mobile
- **Docs:** OpenAPI / Swagger
- **Validation:** class-validator + Zod

### Frontend (`frontend/`)
- **Framework:** Next.js + React (TypeScript)
- **Styling:** Tailwind CSS + Radix UI (accessible primitives)
- **State:** TanStack Query (server state) + Zustand (local UI)
- **Realtime:** Socket.io client
- **Validation:** Zod

### Mobile (`mobile/`)
- **Framework:** Expo + React Native (TypeScript)
- **Router:** Expo Router (file-based)
- **GPS:** Expo Location
- **Push:** Expo Notifications
- **Storage:** Expo Secure Store
- **Sensors:** Expo Sensors (accelerometer for shake-to-alert)
- **Camera:** Expo Camera / Image Picker
- **State:** TanStack Query + Zustand
- **Validation:** Zod

### Shared (`shared/`)
Types, constants, enums, validation schemas, and WebSocket event names used across all three surfaces.

### External Services
| Service | Purpose |
|---|---|
| Firebase Cloud Messaging | Push notifications |
| Textbee (textbee.dev) | SMS gateway via Android device SIM |
| Map Provider | Geocoding, routing, ETA |
| Object Storage | Incident photos and media |

---

## Central Domain Concept — Incident

The **Incident** is the central business object. Every module, table, and real-time event exists to support the incident lifecycle.

```
Reporter  ≠  Patient   ← ALWAYS separate concepts
```

- **Reporter** — person who triggers the alert (victim, bystander, barangay staff, etc.)
- **Patient** — person needing assistance; may be unknown, may be the reporter, may be multiple people
- A patient does **not** need an AGAP account
- AGAP must **never** automatically identify a nearby AGAP user as the patient
- Unknown patient identity is a valid, fully-supported value — it must never block dispatch

---

## Emergency Status Lifecycle

```
DRAFT → SUBMITTED → RECEIVED → ACKNOWLEDGED → ASSESSED
  → DISPATCH_PENDING → DISPATCHED → EN_ROUTE → ON_SCENE
  → TRANSPORTING / ASSISTING → RESOLVED → CLOSED

Terminal alternatives:
  CANCELLED | FALSE_ALERT | DUPLICATE | UNABLE_TO_RESPOND | REFERRED
```

Status transitions are permission-controlled and timestamped. Responder cannot close. Citizen cannot acknowledge.

---

## Incident Categories

```
MEDICAL | ROAD_ACCIDENT | FLOOD | RESCUE | FIRE | INDUSTRIAL | DEBRIS | OTHER
```
All four Bocaue operational categories are in scope: Medical & Trauma, Flood Operations, Fire & Industrial Hazards, Post-Disaster Community Safety.

---

## 53-Module Inventory

### Cluster A — User and Identity
| MOD | Name |
|---|---|
| MOD-01 | User Registration and Profile Management |
| MOD-02 | Emergency Contact Management |
| MOD-03 | Medical Profile |
| MOD-04 | Accessibility and Multi-Language Support |
| MOD-05 | Emergency Readiness and Permission Status |

### Cluster B — Alert Triggering
| MOD | Name |
|---|---|
| MOD-06 | Immediate SOS Trigger / One-Button SOS |
| MOD-07 | Shake-to-Alert Trigger |
| MOD-08 | Emergency Cancellation and False Alert Management |

### Cluster C — Location and Tracking
| MOD | Name |
|---|---|
| MOD-09 | Rapid Incident Detail Capture |
| MOD-10 | Incident Photo and Evidence Capture |
| MOD-11 | Precision GPS Capture |
| MOD-12 | Location Context and Reverse Geocoding |
| MOD-13 | Live Incident Location Tracking |

### Cluster D — Alert Processing and Dispatch
| MOD | Name |
|---|---|
| MOD-14 | Emergency Incident Record and Ticketing |
| MOD-15 | Incident Lifecycle State Management |
| MOD-16 | Emergency Contact Notification |
| MOD-17 | Multi-Channel Emergency Transmission Gateway |
| MOD-18 | Responder Assignment Notification and Dispatch Messaging |
| MOD-19 | Offline Emergency Queue and Retry |
| MOD-20 | Real-Time Event / WebSocket Engine |
| MOD-21 | Emergency Operations and Dispatch Dashboard |
| MOD-22 | Real-Time Incident Map |
| MOD-23 | Incident Command Queue |
| MOD-24 | Emergency Severity and Priority Recommendation |

### Cluster E — Monitoring and Escalation
| MOD | Name |
|---|---|
| MOD-25 | Incident Triage and Validation |
| MOD-26 | Duplicate Incident Detection and Merging |
| MOD-27 | Emergency Organization and Resource Registry |
| MOD-28 | Response Unit Availability and Readiness |
| MOD-29 | Incident-to-Response Capability Matrix |
| MOD-30 | Suitable Response Unit Recommendation |
| MOD-31 | Dispatcher Assignment and Dispatch Authorization |
| MOD-32 | Responder / Ambulance Crew Mobile Interface |

### Cluster F — Field Response and Coordination
| MOD | Name |
|---|---|
| MOD-33 | Secure Incident Communication |
| MOD-34 | Multi-Agency Coordination |
| MOD-35 | Resource Request and Mutual Aid |
| MOD-36 | Incident Command / ICS Support |
| MOD-37 | On-Scene Patient Assessment |
| MOD-38 | Hospital Receiving Coordination |
| MOD-39 | Hospital and Receiving Facility Registry |
| MOD-40 | Transport and Destination Tracking |

### Cluster G — Status, Escalation, and Closure
| MOD | Name |
|---|---|
| MOD-41 | Dispatcher SLA and Escalation Engine |
| MOD-42 | User-Facing Emergency Status |
| MOD-43 | Live ETA and Responder Tracking |
| MOD-44 | Incident Handover |
| MOD-45 | Incident Resolution and Closure |

### Cluster H — Governance and Compliance
| MOD | Name |
|---|---|
| MOD-46 | Immutable Audit Trail |
| MOD-47 | Role-Based Access Control |
| MOD-48 | Privacy, Consent and Medical Data Protection |
| MOD-49 | System Administration and Account Management |

### Cluster I — Analytics, Intelligence, and Surge
| MOD | Name |
|---|---|
| MOD-50 | Emergency Response Analytics |
| MOD-51 | Emergency Intelligence and Risk Visualization |
| MOD-52 | Disaster Surge and Mass-Casualty Mode |

### Cluster J — Municipal Broadcast
| MOD | Name |
|---|---|
| MOD-53 | Municipal Announcements and Public Broadcast |

---

## Module → Code Mapping (quick reference)

| Module | Primary code location |
|---|---|
| MOD-01 | `backend/src/users` + `mobile/app/auth` + `mobile/app/profile` |
| MOD-02 | `backend/src/emergency-contacts` + `mobile/app/contacts` |
| MOD-03 | `backend/src/medical-profiles` + `mobile/app/medical` |
| MOD-04 | mobile i18n (`src/i18n/`) + accessibility components |
| MOD-05 | `mobile/app/settings/permissions.tsx` |
| MOD-06 | `mobile/app/emergency/sos.tsx` + `backend/src/emergency-alerts/sos` |
| MOD-07 | `mobile/src/services/shake-detector` + `backend/src/emergency-alerts` |
| MOD-08 | `mobile/app/emergency/confirmation.tsx` + `backend/src/false-alerts` |
| MOD-09 | `mobile/app/emergency/incident-details.tsx` + `backend/src/incidents` |
| MOD-10 | `mobile/app/emergency/photo.tsx` + `backend/src/media` |
| MOD-11 | `mobile/src/services/gps` + `backend/src/locations/gps` |
| MOD-12 | `backend/src/locations/geocoding` |
| MOD-13 | `backend/src/locations/live-tracking` + `backend/src/realtime` |
| MOD-14 | `backend/src/incidents` + `backend/src/emergency-alerts` |
| MOD-15 | `backend/src/incidents/incident-status` |
| MOD-16 | `backend/src/notifications` (push + SMS) |
| MOD-17 | `backend/src/notifications/sms` + `backend/src/emergency-alerts/transmission` |
| MOD-18 | `backend/src/notifications` + `backend/src/dispatch` |
| MOD-19 | `mobile/src/services/offline` + `backend/src/offline-sync` |
| MOD-20 | `backend/src/realtime/websocket.gateway.ts` |
| MOD-21 | `frontend/app/operations/page.tsx` |
| MOD-22 | `frontend/app/operations/map` |
| MOD-23 | `frontend/app/operations/incidents` |
| MOD-24 | `backend/src/dispatch/priority` |
| MOD-25 | `backend/src/incidents/triage` + `incident-validation` |
| MOD-26 | `backend/src/incidents/duplicate-detection` |
| MOD-27 | `backend/src/organizations` + `backend/src/resources` |
| MOD-28 | `backend/src/fleet` + realtime |
| MOD-29 | `backend/src/dispatch/resource-matching` |
| MOD-30 | `backend/src/dispatch/resource-matching` (recommendation) |
| MOD-31 | `backend/src/dispatch/assignment` + `frontend/app/operations/dispatch` |
| MOD-32 | `mobile/app/responder` + `backend/src/responders` |
| MOD-33 | `backend/src/realtime` (incident-scoped chat) |
| MOD-34 | `backend/src/organizations` + multi-org incident scope |
| MOD-35 | `backend/src/resources` (inter-org requests) |
| MOD-36 | `backend/src/incidents` (ICS state) + `frontend/app/operations/command` |
| MOD-37 | `mobile/app/responder/assessment.tsx` + `backend/src/incidents` |
| MOD-38 | `backend/src/hospitals` + `backend/src/incidents` |
| MOD-39 | `backend/src/hospitals` + `backend/src/facilities` + `frontend/app/hospitals` |
| MOD-40 | `backend/src/locations` + `backend/src/hospitals` + realtime |
| MOD-41 | `backend/src/dispatch/escalation` + `backend/src/jobs/sla` |
| MOD-42 | `mobile/app/emergency/status.tsx` + realtime |
| MOD-43 | `backend/src/locations/routing` + `backend/src/jobs/eta` + realtime |
| MOD-44 | `backend/src/incidents/incident-handover` |
| MOD-45 | `backend/src/incidents/closure` + `frontend/app/operations` |
| MOD-46 | `backend/src/audit` (all modules write here) |
| MOD-47 | `backend/src/permissions` + `backend/src/common/guards` |
| MOD-48 | `backend/src/privacy` + `backend/src/consent` |
| MOD-49 | `backend/src/administration` + `frontend/app/administration` |
| MOD-50 | `backend/src/analytics` + `frontend/app/analytics` |
| MOD-51 | `backend/src/risk-intelligence` + PostGIS |
| MOD-52 | `backend/src/disaster-mode` + `frontend/app/operations/surge` |
| MOD-53 | `backend/src/announcements` + `mobile/app/announcements` + `frontend/app/announcements` |

---

## REST API Routes

```
/api/v1/auth
/api/v1/users
/api/v1/contacts
/api/v1/medical-profiles
/api/v1/incidents
/api/v1/incidents/:id/events
/api/v1/alerts
/api/v1/locations
/api/v1/tracking
/api/v1/dispatch
/api/v1/resources
/api/v1/responders
/api/v1/fleet
/api/v1/hospitals
/api/v1/facilities
/api/v1/notifications
/api/v1/announcements
/api/v1/announcements/subscribe
/api/v1/escalations
/api/v1/reports
/api/v1/analytics
/api/v1/audit
/api/v1/organizations
/api/v1/admin
```

---

## WebSocket Events (Socket.io)

```
incident.created / incident.updated / incident.status_changed
incident.escalated / incident.closed
dispatch.created / dispatch.updated / dispatch.cancelled
resource.status_changed / resource.location_updated
responder.location_updated / responder.status_changed / responder.eta_updated
notification.created
escalation.created / escalation.updated
announcement.published                   ← MOD-53 only
```

All WS connections require authentication. Subscriptions scoped by role + organization. Citizens receive only their own incident events.

---

## Background Jobs (BullMQ / Redis)

`backend/src/jobs/` contains processors for:
`sms` | `push` | `contacts` | `sla` | `eta` | `offline` | `analytics` | `audit` | `announcements`

Critical rule: incident record is persisted to PostgreSQL **before** any background job is relied upon.

---

## Role-Based Access Control

| Role | Key authority |
|---|---|
| Citizen | Own profile, contacts, medical; report emergency; view own incident |
| Bystander | Report emergency (no account required) |
| Dispatcher | Acknowledge, assess, validate, dispatch, escalate |
| Supervisor | Monitor, receive escalations, authorize special actions |
| Responder | Receive assignment, navigate, update status, share location |
| Hospital User | View referrals, coordinate receiving, update receiving status |
| Org Administrator | Manage org-scoped users, resources, configuration |
| Announcements Publisher | Compose, schedule, publish, archive announcements (MOD-53) |
| System Administrator | Platform-wide management, health, global config |

---

## Security Model

Every protected operation checks (in order):
1. Identity — valid JWT, not expired
2. Role — permission exists for this action
3. Organization — resource belongs to actor's org
4. Ownership — user authorized for this specific resource
5. Permission — specific capability confirmed

Additional: rate limiting on auth + alert endpoints; bcrypt passwords; refresh rotation; no sensitive data in logs or SMS payloads; secrets in env vars only.

---

## Privacy / Data Classification

| Class | Examples | Control |
|---|---|---|
| Public | Announcement content, incident reference numbers | None |
| Personal | Name, phone, email | Authenticated only |
| Sensitive | Location history, contact list | Least-privilege + audit |
| Medical | Blood type, allergies, conditions | Separate consent + encrypted |

Medical profile requires a separate ConsentRecord before any access. Audit logs are immutable — no UPDATE or DELETE permitted.

---

## Dual-Path Alert Delivery

Data path (HTTPS) + SMS path (Textbee) fire **simultaneously** at trigger. SMS payload < 160 chars:
```
AGAP|INC-2026-001234|14.5995,120.9842|1754179200|FIRE|C:Y
```
Both fire immediately because connectivity in Bocaue flood zones is degraded during typhoon events.

---

## Offline Queue

1. Assign a unique client event ID (idempotency key) at trigger time
2. Try data + SMS in parallel
3. If both fail → save to secure local queue
4. On reconnect → flush queue with original event IDs
5. Backend deduplicates by event ID — same ID → same incident, never a duplicate

---

## Architectural Rules (non-negotiable)

1. Incident is the central business object.
2. Reporter and patient are always separate concepts.
3. Unknown patient is valid and never blocks dispatch.
4. Patient does not need an AGAP account.
5. Optional data (photos, medical profile, GPS) must never block emergency submission.
6. PostgreSQL is the source of truth. WebSocket distributes changes; it does not replace persistence.
7. Critical incident persistence is synchronous. Queues handle background/retries.
8. Dispatch recommendations assist authorized personnel. They never make the decision autonomously.
9. 911 and MDRRMO hotlines remain available. AGAP complements; it does not replace.
10. Sensitive information follows least-privilege at all times.
11. All consequential operational actions are auditable and attributable.
12. Offline retries are idempotent.
13. ETA is always labeled as an estimate, never a guarantee.
14. Guest emergency reporting must always be available — registration must never block getting help.
15. AGAP must never reveal the identity of a nearby AGAP user to a stranger or bystander.
16. MOD-53 is one-way broadcast only — it is not an emergency dispatch mechanism.
17. All four Bocaue emergency categories are in scope.

---

## Reliability Rules (non-negotiable)

- A failed push notification must never delete or cancel an incident.
- A failed SMS must never delete or cancel an incident.
- A failed ETA calculation must never stop dispatch.
- Missing medical information must never stop dispatch.
- The system must never silently fail — every connectivity state needs a clear UI indicator.
- SMS payload must always be under 160 characters for single-segment delivery.

---

## Bocaue Operational Context (always relevant)

- **Bocaue River critical level:** 11.50 m → mandatory evacuation
- **Flood-prone barangays:** Lolomboy, Bunlo, Igulot, Bambang (degraded connectivity during typhoons)
- **Fireworks industry:** Barangays Bundukan, Biñang 1st — industrial fire/explosion is a real mass-casualty scenario
- **High-traffic corridors:** MacArthur Highway, NLEX Interchange, Governor F. Halili Avenue
- **Multi-agency partner:** BFP (Bureau of Fire Protection) — MOD-34 handles coordination
- **SMS provider:** Textbee (textbee.dev) — Android device-based SMS gateway using local SIM card. Env vars: `TEXTBEE_API_KEY`, `TEXTBEE_DEVICE_ID`, `MDRRMO_OPS_PHONE`

---

## Development Phase Order

Phase 1 (MVP): Auth, SOS, incident creation, GPS, dual-path transmission, basic dashboard, dispatch, responder status, citizen status, closure.
Phase 2: WebSocket, live tracking, fleet, ETA, emergency contacts, push notifications.
Phase 3: Offline queue, SMS fallback, dedup, SLA escalation.
Phase 4: Hospitals, resources matrix, medical profiles, photos, false alert mgmt, audit, BFP coordination.
Phase 5: Disaster/surge mode, risk visualization, advanced analytics, MOD-53 announcements.

---

## Common Commands

```bash
# Install all workspace dependencies
pnpm install

# Run all builds
pnpm build

# Run all tests
pnpm test

# Format all files
pnpm format

# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Backend only
cd backend && pnpm start:dev

# Frontend only
cd frontend && pnpm dev

# Mobile only
cd mobile && npx expo start

# Prisma DB migrations
cd backend && pnpm prisma migrate dev

# Prisma seed
cd backend && pnpm prisma db seed

# Docker (dev)
docker compose up -d

# Docker (prod)
docker compose -f docker-compose.prod.yml up -d
```

---

## Key Files

| File | Purpose |
|---|---|
| `docs/AGAP_Complete_Master_Enterprise_Architecture.md` | Full architecture, all 53 modules, all rules |
| `docs/AGAP_Complete_Enterprise_Folder_Structure.md` | Complete folder tree for all packages |
| `docs/modules/MOD-XX_*.md` | Per-module detailed specification |
| `backend/prisma/schema.prisma` | Database schema (source of truth) |
| `backend/src/realtime/websocket.gateway.ts` | WebSocket gateway (MOD-20) |
| `shared/src/enums/incident-status.ts` | Status enum used across all surfaces |
| `shared/src/events/` | Typed WebSocket event contracts |
| `.env.example` | All required environment variables |

---

## What NOT to do

- Do not create separate backends per role or client surface.
- Do not put all code in generic `utils` or `services` folders — respect domain boundaries.
- Do not let optional fields (photo, GPS, medical) block emergency submission.
- Do not let notification failure delete or modify an incident.
- Do not make dispatch decisions without dispatcher confirmation.
- Do not expose internal database IDs in public API responses (use `publicReference` like `INC-2026-001234`).
- Do not log passwords, JWT tokens, full medical profiles, or unnecessary personal data.
- Do not commit real credentials — use `.env.example` with placeholders.
- Do not use unbounded `latest` in production dependency manifests.
- Do not skip running the emergency-flow E2E test suite after dependency upgrades.
- Do not treat MOD-53 announcements as an emergency dispatch channel.
