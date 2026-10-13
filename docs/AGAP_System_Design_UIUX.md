# AGAP — System Design Architecture & UI/UX

**GPS-Based Mobile Emergency Alert System for Immediate Hospital / Ambulance Dispatch**
Operator: **Bocaue MDRRMO / LGU Operations Center**, Bocaue, Bulacan, Philippines.

This document is the single design reference for AGAP's **system architecture** and its **UI/UX design system** across all three surfaces. It is grounded in the actual repository (`backend/`, `frontend/`, `mobile/`, `shared/`, `infrastructure/`) and governed by `CLAUDE.md`. Use it alongside `docs/AGAP_Master_Completion_Plan.md`.

---

## 1. System Overview

AGAP reduces the time and information gap between an emergency occurring and the right responders moving with correct information. It **complements, never replaces** 911 / MDRRMO hotlines.

- **Central object:** the **Incident**. Every table, event, and screen supports its lifecycle.
- **Reporter ≠ Patient** always. Unknown patient is valid and never blocks dispatch.
- **Source of truth:** PostgreSQL. WebSocket distributes changes; it does not replace persistence.
- **Dual-path delivery:** HTTPS data path + **backend-first SMS (Textbee, server-side)** fire together at trigger because Bocaue flood-zone connectivity degrades during typhoons.

### 1.1 Surfaces

| Surface | Users | Stack | Theme |
|---|---|---|---|
| **Mobile** (`mobile/`) | Citizens, Bystanders, Responders | Expo + React Native, Expo Router | Light "pearl" + deep-green (calm, high-legibility) |
| **Ops Center** (`frontend/`) | Dispatchers, Supervisors, Org/Sys Admins, Announcers, Hospital users | Next.js App Router + React | Light "pearl" + deep-green (matches mobile — consistent brand, high-legibility) |
| **Backend** (`backend/`) | — (serves all) | NestJS modular monolith, Prisma, BullMQ, Socket.io | — |

---

## 2. Architecture (C4-style)

### 2.1 Context

```
            ┌──────────────┐        ┌──────────────┐        ┌──────────────┐
            │  Citizen /   │        │  Responder   │        │ Dispatcher / │
            │  Bystander   │        │ (ambulance)  │        │  Supervisor  │
            └──────┬───────┘        └──────┬───────┘        └──────┬───────┘
                   │ Expo app               │ Expo app             │ Next.js Ops Center
                   ▼                        ▼                      ▼
        ┌───────────────────────────────────────────────────────────────────┐
        │                      AGAP Backend (NestJS monolith)                 │
        │   REST /api/v1  ·  WebSocket /agap  ·  BullMQ jobs  ·  Prisma ORM    │
        └───────┬───────────────┬──────────────┬───────────────┬─────────────┘
                │               │              │               │
                ▼               ▼              ▼               ▼
         PostgreSQL+PostGIS   Redis/BullMQ   Object Storage   External:
         (source of truth)   (jobs/cache)    (MinIO/S3)       FCM push, Textbee SMS,
                                                              Map provider (Mapbox/OSRM/Nominatim)
```

AGAP complements **911 / MDRRMO hotlines** and coordinates with **BFP** (MOD-34).

### 2.2 Containers

```
agap-emergency/ (pnpm workspace, Node ≥20)
├── backend/     NestJS — REST + WS + jobs. One deployable service.
├── frontend/    Next.js — Operations Center + Hospital Portal (pearl/green, matches mobile).
├── mobile/      Expo RN — Citizen App + Responder App (pearl/green).
├── shared/      Types, enums, constants, Zod schemas, WS event contracts.
└── infrastructure/  docker, postgres(+PostGIS), redis, minio, nginx.
```

### 2.3 Backend component map (modular monolith)

32 feature modules under `backend/src`, grouped by the 10 clusters (A–J). Cross-cutting: `common/` (guards, Prisma), `realtime/` (Socket.io gateway), `jobs/` (BullMQ processors), `audit/` (insert-only), `config/`.

```
Request → Guard chain (Identity→Role→Org→Ownership→Permission)
        → Controller (DTO validation: class-validator + Zod)
        → Service (Prisma write = source of truth, synchronous for critical path)
        → AuditService.log (insert-only)
        → RealtimeService.emit*  (AFTER commit, best-effort)
        → BullMQ enqueue (SMS/push/eta/sla — retries, never block incident)
```

---

## 3. Data & Event Flows

### 3.1 Incident lifecycle (status machine)

```
DRAFT → SUBMITTED → RECEIVED → ACKNOWLEDGED → ASSESSED
      → DISPATCH_PENDING → DISPATCHED → EN_ROUTE → ON_SCENE
      → TRANSPORTING / ASSISTING → RESOLVED → CLOSED

Terminal alt: CANCELLED | FALSE_ALERT | DUPLICATE | UNABLE_TO_RESPOND | REFERRED
```
Transitions are permission-controlled + timestamped. Responder cannot close. Citizen cannot acknowledge. Enforced by `incidents/incident-status`.

### 3.2 Dual-path trigger (SMS backend-first)

```
SOS/shake trigger (mobile)
   │  assigns clientEventId (idempotency key)
   ├──► HTTPS POST /v1/incidents ─────► DB persist (synchronous) ─► emit incident.created ─► enqueue SMS job
   └──► if offline → secure local queue ─► flush on reconnect (same clientEventId → dedup)

SMS is ALWAYS sent by the BACKEND (Textbee server-side). The device never sends SMS.
Mobile only composes the <160-char payload for the offline fallback record.
Payload: AGAP|INC-2026-000123|14.5995,120.9842|<ts>|FIRE|C:Y
```

### 3.3 Real-time distribution (MOD-20)

```
Backend service commits → RealtimeService → AgapGateway (Socket.io /agap)
   ├─ emitToOps(event, payload)            → room "ops:all"  (dispatchers/supervisors)
   └─ emitToIncident(event, id, payload)   → room "incident:{id}" (owner + assigned responders + dispatchers)

Rooms & scoping:
  • JWT handshake auth on connect (reject unauthenticated).
  • Citizens join only their own incident rooms — receive only their incident events.
  • Ops join "ops:all" (role-gated).
Event names: shared/src/events/* (incident.*, responder.*, escalation.*, announcement.published, notification.created).
```

### 3.4 Offline queue (idempotent)

```
1) clientEventId at trigger   2) try data + (backend) SMS   3) both fail → local queue
4) reconnect → flush with original IDs   5) backend dedups by ID → never a duplicate incident
```

---

## 4. Security, RBAC, Privacy

**Guard order (every protected op):** Identity (JWT) → Role → Organization → Ownership → Permission.

**Roles:** Citizen, Bystander (no account), Dispatcher, Supervisor, Responder, Hospital User, Org Administrator, Announcements Publisher, System Administrator.

**Auth:** JWT access + refresh rotation. Mobile stores tokens in Expo Secure Store; **passkeys (WebAuthn)** supported (username-first on mobile, `/.well-known/*` association served by backend). Ops Center uses `agap_token` cookie.

**Privacy classes:** Public (announcements, reference numbers) · Personal (name/phone/email — authenticated) · Sensitive (location history, contacts — least-privilege + audit) · Medical (blood type/allergies/conditions — separate `ConsentRecord` + encrypted). Audit logs are **immutable** (insert-only).

**Identity protection:** AGAP must never reveal a nearby AGAP user's identity to a stranger/bystander.

---

## 5. UI/UX Design System

AGAP uses **two coordinated themes** — one calm/high-legibility for citizens under stress, one dense/dark for the 24/7 ops console — unified by shared status & priority semantics.

### 5.1 Design principles

1. **Emergency-first legibility** — big tap targets, high contrast, no ambiguous states.
2. **Never silently fail** — every connectivity/permission/GPS state has a visible indicator (CLAUDE.md).
3. **Status is color** — the same priority/status color language across mobile and ops.
4. **Optional never blocks** — photo/GPS/medical are clearly optional; submission always reachable.
5. **Accessibility** — WCAG AA contrast, dynamic text size (mobile MOD-04), Radix primitives (ops), keyboard nav, EN/Filipino i18n.
6. **Trust & safety** — 911/MDRRMO always reachable; ETA always labeled "estimate".

### 5.2 Shared semantic tokens (both surfaces)

**Priority** (from `frontend/tailwind.config.ts` `priority.*`):
| Priority | Color | Hex |
|---|---|---|
| CRITICAL | red | `#DC2626` |
| HIGH | orange | `#EA580C` |
| MEDIUM | yellow | `#CA8A04` |
| LOW | green | `#16A34A` |

**Incident category accents** (icons/badges): MEDICAL, ROAD_ACCIDENT, FLOOD, RESCUE, FIRE, INDUSTRIAL, DEBRIS, OTHER — each a lucide icon + tint.

**Lifecycle status chips** — map each status to a tone: intake (slate/blue) → active (orange/amber) → en route/on scene (blue) → resolved (green) → terminal-negative CANCELLED/FALSE_ALERT/DUPLICATE (gray/red muted).

### 5.3 Mobile theme (citizen/responder) — from `mobile/src/theme/tokens.ts`

```
bg        #F2F5F8  (pearl)        primary     #0D6053  (deep green)
white     #FFFFFF                 primarySoft #EEF7F4
text      #1C2B3A                 danger      #D44858 / dangerSoft #FDF0F1
textMid   #40536D                 amber       #D97706 / amberSoft #FFFBEB
textSub   #8795A3                 info        #3B82F6 / infoSoft #EFF6FF
surface   #EDF1F4  border rgba(168,181,193,.20)  track #DCE3E9
radius: sm8 md12 lg16 xl20   ·   cardShadow: soft neumorphic (#8795A3)
```
- **SOS** = large red primary action, always one tap from home.
- Emergency flow is a guided stepper (type → reporter/patient → location → photo → details → transmission) with a visible step progress bar; every optional step is skippable.
- Connectivity/GPS banners use `danger`/`amber`/`info` soft tints.
- Fonts scale via MOD-04 (`useFontScale` 0.875/1.0/1.15). EN/Filipino via `src/i18n`.

### 5.4 Ops Center theme (pearl / light) — from `mobile/src/theme/tokens.ts`

The Ops Center shares the same visual language as the mobile app so both surfaces project a unified AGAP brand.

```
page bg        #F2F5F8  (pearl)       same as mobile tokens.bg
cards/panels   #FFFFFF  with neumorphic shadow (shadowColor #8795A3, 0.09 opacity)
sidebar        #FFFFFF  · hover #EDF1F4 (surface) · active text+icon #0D6053
topbar         #FFFFFF  with bottom bevel rgba(168,181,193,0.20)
border         rgba(168,181,193,0.20)  same as mobile BEVEL_BORDER
surface/input  #EDF1F4  (off-white — matches mobile icon wrap colour)
track/divider  #DCE3E9

primary        #0D6053  (deep green)  · primarySoft #EEF7F4
text           #1C2B3A  (main)        · textMid #40536D · textSub #8795A3
danger         #D44858  · dangerSoft #FDF0F1
amber          #D97706  · amberSoft #FFFBEB
info           #3B82F6  · infoSoft #EFF6FF

priority.*     unchanged (CRITICAL #DC2626 · HIGH #EA580C · MEDIUM #CA8A04 · LOW #16A34A)
radius         sm:8 md:12 lg:16 xl:20  (Tailwind: rounded-lg / rounded-2xl / rounded-3xl)

libs           Tailwind + Radix UI primitives; lucide-react icons; clsx + tailwind-merge
charts         (MOD-50) recharts; map chart palette → agap tokens; accessible in light theme
map            Leaflet + react-leaflet (priority-colored markers; responder live markers)
```

**Tailwind config additions (add alongside existing `agap.*` and `priority.*`):**
```
agap.pearl      #F2F5F8     page background
agap.green      #0D6053     primary / nav active
agap.greenSoft  #EEF7F4     soft primary tint
agap.surface    #EDF1F4     surface / icon wrap
agap.textMain   #1C2B3A     body text
agap.textMid    #40536D     secondary text
agap.textSub    #8795A3     muted / meta text
agap.border     rgba(168,181,193,0.20)  bevel border
agap.track      #DCE3E9     progress / divider
```
Keep existing `agap.red`, `agap.orange`, `agap.yellow`, `agap.blue` for status accents; `agap.dark` is retired in favour of `agap.green`.

### 5.5 Component library

**Ops `components/ui/` (to build, Radix + Tailwind):**
`Button`, `Badge` (status/priority variants), `Card`/`StatCard`, `DataTable` (sortable/filterable), `Tabs`, `Dialog`, `Drawer` (incident detail over queue/map), `Select`, `Toast`, `Skeleton`, `EmptyState`, `ConnectionIndicator` (WS state), `MapContainer` (Leaflet wrapper), `PriorityBadge`, `StatusChip`.

All primitives use pearl/green tokens: pearl `#F2F5F8` backgrounds, white cards with neumorphic shadow, deep-green `#0D6053` for primary actions and active states, same danger/amber/info tints as mobile.

**Ops app shell:** left **Sidebar** (`#FFFFFF` bg, `#0D6053` active, `#EDF1F4` hover, grouped by cluster), **Topbar** (`#FFFFFF` with bottom bevel, user/org/role + live WS dot), content region on `#F2F5F8` pearl; incident detail = right **Drawer** (`#FFFFFF` card).

**Mobile shared components** (`mobile/src/components`): cards, status chips, steppers, bottom-nav, map, SOS button, banners — already partially present; extend with assessment form (MOD-37) and incident chat (MOD-33).

### 5.6 Layout grammar

- **Ops page** = Topbar (`#FFFFFF` bar) → optional filter/toolbar → content grid on pearl `#F2F5F8` (table/map/cards) → detail Drawer (`#FFFFFF`).
- **Dashboard (MOD-21)** = KPI StatCards row + live incident list + surge banner.
- **Map (MOD-22)** = full-bleed Leaflet, left incident list, click → detail Drawer, responder live markers.
- **Mobile** = guided single-column flows; home = SOS-forward; status/tracking = live timeline + map.

### 5.7 Realtime UX rules

- A **ConnectionIndicator** is always visible (ops Topbar, mobile banner): `connected` (green), `connecting` (amber pulse), `offline` (red + queued count).
- Live inserts animate in (subtle), never reorder destructively mid-interaction.
- ETA fields always carry an "est." label and last-updated time.

### 5.8 Accessibility & i18n

- Contrast AA in both themes (pearl bg with `#1C2B3A` text is high-contrast; verify green `#0D6053` on white at smaller sizes).
- Mobile: dynamic text size, reduced-motion, high-contrast (MOD-04); large touch targets for SOS.
- Ops: full keyboard nav, focus rings, Radix a11y semantics; light theme simplifies contrast requirements.
- Languages: English + Filipino (mobile `src/i18n`); ops copy EN with PH operational terms (barangay, MDRRMO, BFP).

---

## 6. Key screens (reference inventory)

**Mobile (citizen):** Onboarding, Login (+passkey), Home (SOS), Emergency flow (type → reporter/patient → location → capture → details → transmission), Incident status, Tracking, History, Contacts, Medical, Announcements, First-aid, Profile (+Passkeys), Settings/Permissions.
**Mobile (responder):** Assignments list, Assignment detail, **On-scene assessment (MOD-37, to build)**, incident chat (MOD-33, to build), location sharing.
**Ops Center:** Login, Dashboard (21), Incident Queue (23/24), Map (22), Triage (25/26), Dispatch (31 + 29/30 recommendations), Fleet/Resources (27/28), Hospitals (38/39), Escalations (41), Command/ICS (36), Multi-agency (34), Mutual aid (35), Handover (44), Surge (52), Analytics (50), Risk heatmap (51), Announcements publisher (53), Admin (49), Audit (46).

---

## 7. Non-functional & reliability

- Persist-before-emit; critical path synchronous; jobs for retries.
- Failed push/SMS/ETA never deletes/cancels/stops an incident.
- SMS < 160 chars, single segment, **backend-first**.
- PostGIS for proximity (duplicate detection, unit recommendation, risk heatmap).
- Every consequential action audited and attributable.

---

## 8. Appendix — colors quick card

```
PRIORITY   critical #DC2626 · high #EA580C · medium #CA8A04 · low #16A34A
SHARED     bg #F2F5F8 (pearl) · primary #0D6053 (deep green) · cards #FFFFFF w/ shadow #8795A3
           text #1C2B3A · textMid #40536D · textSub #8795A3
           danger #D44858 · dangerSoft #FDF0F1
           amber  #D97706 · amberSoft  #FFFBEB
           info   #3B82F6 · infoSoft   #EFF6FF
           border rgba(168,181,193,0.20) · surface #EDF1F4 · track #DCE3E9
```

Both surfaces (mobile and ops center) share the same token vocabulary. Status/priority colors are identical across all three surfaces.
