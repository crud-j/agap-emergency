# AGAP — Master Completion Plan

**Goal:** Finish all 53 modules across backend, Operations Center (frontend), and mobile — wire the backend's real-time layer, complete backend stubs, build the frontend design + pages, and connect every surface end-to-end.

**Baseline references**
- `docs/AGAP_Complete_Master_Enterprise_Architecture.md` (architecture of record)
- `CLAUDE.md` (non-negotiable rules — this plan must never violate them)
- `docs/modules/MOD-XX_*.md` (per-module specs)
- Prior plans: `docs/AGAP_Backend_Implementation_Plan.md`, `docs/AGAP_Backend_Completion_Plan.md`

**Author’s note on SMS (per requirement):** SMS stays **backend-first**. All SMS continues to be sent **server-side via Textbee** (`backend/src/jobs/processors/sms.processor.ts`, env `TEXTBEE_API_KEY` / `TEXTBEE_DEVICE_ID` / `MDRRMO_OPS_PHONE`). Do **not** move SMS sending to the device. The mobile `src/services/sms` only *composes the dual-path payload string* for the offline fallback queue; the actual send is the backend's responsibility. Keep it that way throughout this plan.

---

## How to read this

| Mark | Meaning |
|---|---|
| ✅ Done | Real, functional implementation |
| 🟡 Partial | Core exists, pieces missing (noted) |
| 🔴 Stub/Missing | Placeholder, empty dir, or not wired |
| — | Not applicable to that surface |

Surfaces: **BE** = backend · **OPS** = frontend operations center · **MOB** = mobile app.

---

## Verified stack facts (build to these — they reflect the real repo)

**Backend** (`backend/src`, NestJS modular monolith)
- 32 feature modules present; most have real Prisma services. ~197 endpoints register in Swagger (`/api/docs`).
- Realtime: `realtime/agap.gateway.ts` has JWT handshake auth, `join:incident` / ops rooms, and `emitToOps()` / `emitToIncident()` helpers. **`RealtimeService`/`AgapGateway` are not imported by any other module** — only `realtime.service.ts` emits (just `dispatch.cancelled`). This is the keystone gap.
- Typed event contracts already exist in `shared/src/events/` — use these names verbatim (`incident.created`, `incident.status_changed`, `responder.location_updated`, etc.).
- Jobs (BullMQ): `sms` (Textbee, real), `notification` (FCM, real), `escalation`, `sla-monitor`, `eta-refresh`, `analytics`, `offline-sync`, `announcement-push`.
- Media: real S3/MinIO (`media/media.service.ts`).

**Frontend** (`frontend/`, Next.js App Router + TypeScript)
- Styling: **Tailwind** with tokens `agap.{red,orange,yellow,blue}` and `priority.{critical,high,medium,low}`; theme base `#F2F5F8` pearl + `#0D6053` deep-green (matches mobile — see `docs/AGAP_System_Design_UIUX.md` §5.4). `agap.dark` is retired; add `agap.{pearl,green,greenSoft,surface,textMain,textMid,textSub,border,track}`. **Radix UI** per CLAUDE.md (add as needed).
- State: **TanStack Query** (provider wired in `providers/providers.tsx`) + **Zustand** (add store).
- Realtime client: `lib/websocket.ts` (`socket.io-client`, connects `/agap` namespace) — **exists but unused**.
- Auth: cookie `agap_token` (`lib/auth.ts`), set by `app/login/page.tsx`. `middleware.ts` present.
- Map: **Leaflet + react-leaflet** (NOT maplibre). Reuse for MOD-22.
- API helper: `lib/api.ts` (`api.get/post/patch`, Bearer). Hooks: `useDispatch`, `useIncidents`. Components: `components/dispatch/*` only.
- Real pages today: `login`, `operations/dispatch`, `operations/incidents` (basic), `operations/map` (shell). All other pages are 11-line placeholders; ~14 route dirs and all `features/*` are empty.

**Mobile** (`mobile/`, Expo Router) — most complete surface. Services present: `gps, offline, shake-detector, websocket, passkey, sms, media, navigation, notifications, secure-storage`.

---

## Guardrails (every task must honor)

From `CLAUDE.md` — treat as acceptance gates:
1. Incident is the central object; **Reporter ≠ Patient**; unknown patient never blocks dispatch.
2. Optional data (photo/GPS/medical) never blocks submission.
3. **PostgreSQL is source of truth; WebSocket only distributes** — persist first, emit after commit.
4. Critical incident persistence is synchronous; queues are for retries/background.
5. Dispatch recommendations are assistive — never auto-decide.
6. Failed push/SMS/ETA must never delete/modify/stop an incident.
7. All consequential actions are **audited** (`AuditService.log`, insert-only).
8. No internal DB IDs in public responses — use `publicReference` (`INC-2026-000001`).
9. Least-privilege + org scoping on every protected op (Identity→Role→Org→Ownership→Permission).
10. SMS payload < 160 chars, single segment; **SMS is backend-first**.
11. Guest emergency reporting always available.
12. Never silently fail — every connectivity state shows a clear UI indicator.

---

## 53-Module status matrix (current)

| MOD | Module | BE | OPS | MOB | Gap to close |
|---|---|---|---|---|---|
| 01 | User Reg & Profile | ✅ | 🔴 | ✅ | OPS user admin UI (MOD-49) |
| 02 | Emergency Contacts | ✅ | — | ✅ | — |
| 03 | Medical Profile | ✅ | — | ✅ | — |
| 04 | Accessibility / i18n | 🟡 | — | ✅ | BE: persist/serve prefs consistently |
| 05 | Readiness / Permissions | — | — | ✅ | — |
| 06 | SOS Trigger | ✅ | — | ✅ | emit `incident.created` |
| 07 | Shake-to-Alert | ✅ | — | ✅ | — |
| 08 | Cancellation / False Alert | 🔴 | 🔴 | 🟡 | **BE stub**; OPS action; MOB cancel UX |
| 09 | Rapid Detail Capture | ✅ | — | ✅ | — |
| 10 | Photo / Evidence | ✅ | — | ✅ | — |
| 11 | Precision GPS | ✅ | — | ✅ | — |
| 12 | Reverse Geocoding | ✅ | — | ✅ | — |
| 13 | Live Location Tracking | ✅ | 🟡 | ✅ | OPS live markers (WS) |
| 14 | Incident Record/Ticketing | ✅ | 🟡 | ✅ | OPS detail view |
| 15 | Lifecycle State Mgmt | ✅ | 🟡 | ✅ | OPS status actions |
| 16 | Emergency Contact Notify | ✅ | — | — | — |
| 17 | Multi-Channel Gateway | ✅ | — | ✅ | — (SMS backend-first) |
| 18 | Responder Dispatch Msg | ✅ | ✅ | ✅ | emit on assign |
| 19 | Offline Queue & Retry | ✅ | — | ✅ | — |
| 20 | **WebSocket Engine** | 🟡 | 🟡 | 🟡 | **Wire emits + FE/MOB subscribe** |
| 21 | Ops Dashboard | — | 🔴 | — | Build (live KPIs) |
| 22 | Real-Time Incident Map | — | 🟡 | — | Live Leaflet map |
| 23 | Incident Command Queue | ✅ | 🟡 | — | Enrich queue + filters |
| 24 | Severity/Priority Rec | ✅ | 🟡 | — | Show rec in OPS |
| 25 | Triage & Validation | ✅ | 🔴 | — | OPS triage page |
| 26 | Duplicate Detection | 🟡 | 🔴 | — | PostGIS distance + merge UI |
| 27 | Org/Resource Registry | ✅ | 🔴 | — | OPS registries |
| 28 | Unit Availability | ✅ | 🔴 | — | OPS fleet board |
| 29 | Capability Matrix | 🔴 | 🔴 | — | **BE matching logic** + UI |
| 30 | Unit Recommendation | 🟡 | 🔴 | — | **BE ranking** + UI |
| 31 | Dispatch Authorization | ✅ | ✅ | — | emit on dispatch |
| 32 | Responder Mobile IF | ✅ | — | ✅ | — |
| 33 | Secure Incident Comms | 🟡 | 🔴 | 🔴 | WS chat + UI both surfaces |
| 34 | Multi-Agency Coord | 🟡 | 🔴 | — | BE flows + OPS page |
| 35 | Resource Req / Mutual Aid | 🟡 | 🔴 | — | BE workflow + OPS page |
| 36 | ICS Support | 🟡 | 🔴 | — | BE ICS state + OPS command |
| 37 | On-Scene Assessment | 🔴 | — | 🔴 | **BE endpoints + MOB form** |
| 38 | Hospital Receiving | ✅ | 🔴 | — | OPS/hospital portal |
| 39 | Facility Registry | ✅ | 🔴 | — | OPS registry |
| 40 | Transport Tracking | 🟡 | 🔴 | 🟡 | Destination tracking + UI |
| 41 | SLA & Escalation | ✅ | 🔴 | — | OPS escalation board |
| 42 | User-Facing Status | ✅ | — | ✅ | — |
| 43 | Live ETA & Tracking | ✅ | 🟡 | ✅ | OPS ETA display |
| 44 | Incident Handover | 🟡 | 🔴 | 🔴 | BE complete + UIs |
| 45 | Resolution & Closure | ✅ | 🟡 | — | OPS closure form |
| 46 | Immutable Audit Trail | ✅ | 🔴 | — | OPS audit viewer |
| 47 | RBAC | ✅ | — | — | FE route guards use roles |
| 48 | Privacy / Consent | ✅ | — | ✅ | — |
| 49 | System Admin | ✅ | 🔴 | — | OPS admin console |
| 50 | Response Analytics | ✅ | 🔴 | — | OPS analytics dashboards |
| 51 | Risk Visualization | ✅ | 🔴 | — | OPS heatmap |
| 52 | Disaster/Surge Mode | ✅ | 🔴 | — | OPS surge console |
| 53 | Municipal Announcements | ✅ | 🔴 | ✅ | OPS publisher |

---

## Workstreams

The plan is organized into 7 workstreams (WS). WS-1 is the keystone and unblocks live behavior everywhere. WS-3 establishes the frontend shell/design that every OPS page depends on. WS-4 is the bulk (OPS pages). Each task lists **files**, **work**, and **acceptance**.

---

### WS-1 — Wire the Real-Time Engine (MOD-20) 🔑 KEYSTONE

**Why first:** the gateway and typed events exist; nothing emits. Wiring this makes OPS dashboard/map/queue and mobile status screens actually live.

**1.1 Export realtime for injection**
- Files: `backend/src/realtime/realtime.module.ts`, `realtime.service.ts`, `agap.gateway.ts`.
- Work: `@Global()` the realtime module (or export `RealtimeService`) so every feature module can inject it. Add thin `RealtimeService` methods wrapping the gateway: `incidentCreated()`, `incidentUpdated()`, `statusChanged()`, `escalationCreated()`, `responderLocation()`, `dispatchCreated()`, `announcementPublished()`, `assessmentUpdated()`, `handover()` — each taking the payload and routing to `emitToOps` and/or `emitToIncident`.
- Acceptance: any service can `constructor(private realtime: RealtimeService)` with no circular-dep error.

**1.2 Emit after every state change (persist → commit → emit)**
Inject `RealtimeService` and emit the matching `shared/src/events` name **after** the DB write commits:

| Service | Event(s) | Room |
|---|---|---|
| `incidents.service` create | `incident.created` | ops + `incident:{id}` |
| `incidents/incident-status` transition | `incident.status_changed` (+ specific: `incident.dispatched`, `incident.en_route`, `incident.arrived`, `incident.resolved`, `incident.closed`, `incident.cancelled`) | ops + incident |
| `incidents` update | `incident.updated` | ops + incident |
| `dispatch.service` create/assign | `incident.assigned`, `dispatch.created` | ops + incident |
| `escalations.service` + `jobs/sla-monitor` | `incident.escalated`, `escalation.created/updated` | ops |
| `responders.service` location/status | `responder.location_updated`, `responder.status_changed`, `responder.eta_updated` | incident + ops |
| `locations.service` track | `incident.location_updated` | incident + ops |
| `incidents` assessment (MOD-37) | `incident.assessment_updated` | incident + ops |
| `incidents/incident-handover` (MOD-44) | `incident.handover` | incident + ops |
| `announcements.service` publish | `announcement.published` | ops + public/subscribers |
| `notifications` create | `notification.created` | user room |

- Rule: **emit is best-effort** — wrap so a WS failure never throws into the request path (Reliability Rules).
- Acceptance: with two Swagger/WS clients connected, a status change on incident A pushes `incident.status_changed` to the ops room and to `incident:{A}` only (citizen in B gets nothing).

**1.3 Mobile + frontend subscribe**
- Mobile: confirm `src/services/websocket/agap-socket.ts` joins `incident:{id}` on the status/tracking screens and updates Zustand store on events (citizen sees live status without refresh).
- Frontend: WS-3.4 below.
- Acceptance: citizen `tracking/[id]` and responder screens update live; ops queue/map update live.

---

### WS-2 — Complete / fix the backend (BE gaps)

**2.1 MOD-08 False Alerts (stub → real)**
- Files: `backend/src/false-alerts/false-alerts.service.ts` (8-line stub), `.controller.ts`.
- Work: implement `cancel(incidentId, actorId, reason)` and `markFalseAlert(...)` using `IncidentStatusService.validateTransition` to `CANCELLED` / `FALSE_ALERT`; persist `cancellation_reason` enum; audit; emit `incident.cancelled`. Respect lifecycle rules (responder cannot close; reporter can cancel own pre-dispatch).
- Acceptance: cancelling a `SUBMITTED` incident transitions + audits + emits; invalid transition returns 400.

**2.2 MOD-29 Capability Matrix + MOD-30 Unit Recommendation (new logic)**
- Files: new `backend/src/dispatch/resource-matching/resource-matching.service.ts` (+ module wiring in `dispatch.module.ts`).
- Work: map `IncidentType` → required unit capabilities (seed a matrix in `shared` or DB `resource_capabilities`); rank AVAILABLE units by capability match + proximity (PostGIS distance) + readiness. Expose `GET /v1/dispatch/recommendations?incidentId=`. **Assistive only** — returns ranked list with scores + rationale; never auto-assigns.
- Acceptance: for a FIRE incident, fire/rescue-capable available units rank above medical-only; response includes rationale; dispatcher still confirms.

**2.3 MOD-26 Duplicate Detection (upgrade)**
- Files: `backend/src/incidents/duplicate-detection/duplicate-detection.service.ts`.
- Work: replace bbox with PostGIS `ST_DWithin` radius query (use `DUPLICATE_DETECTION_RADIUS_METERS`/`_WINDOW_MINUTES`); return candidates with distance; add `POST /v1/incidents/:id/merge` (dispatcher-only) setting `status=DUPLICATE` + `duplicate_of_id`, audited. **Advisory — human confirms merge.**
- Acceptance: two nearby same-category reports within window surface each other; merge sets DUPLICATE + emits.

**2.4 MOD-37 On-Scene Assessment (new BE)**
- Files: `backend/src/incidents/*` (assessment sub-service + DTO); schema already has `consciousness_state`, `breathing_status` enums.
- Work: `POST /v1/incidents/:id/assessment` (Responder role) persisting patient assessment (consciousness, breathing, vitals, notes, # patients); audit; emit `incident.assessment_updated`.
- Acceptance: responder on-scene submits assessment; dispatcher sees it live; missing fields never block.

**2.5 MOD-33 Secure Comms (WS wire)**
- Files: `backend/src/communications/communications.service.ts` (+ gateway).
- Work: on `sendMessage`, emit incident-scoped `message.created` to `incident:{id}` room; enforce participants-only (reporter, assigned responders, dispatchers). Keep insert/read/markRead.
- Acceptance: messages appear live for incident participants only; others blocked.

**2.6 MOD-34 / 35 / 36 / 40 / 44 (finish workflows)**
- MOD-34 Multi-Agency: org-to-org incident participation records + BFP coordination endpoints (`organizations`).
- MOD-35 Mutual Aid: implement request lifecycle (`resources/resource-request.dto.ts` exists) → `POST /v1/resources/requests`, approve/deny, audit.
- MOD-36 ICS: incident command roles/sections state on incident; endpoints to assign IC.
- MOD-40 Transport: destination facility + status timeline (`locations` + `hospitals`), emit `incident.transporting` / `incident.facility_arrival`.
- MOD-44 Handover: complete `incidents/incident-handover` (from/to responder/facility, timestamp, reason), audit, emit `incident.handover`.
- Acceptance per module: endpoints documented in Swagger, audited, emit where stateful.

**2.7 Backend hardening (cross-cutting)**
- Confirm RBAC guard + org scoping on all new endpoints (MOD-47).
- Ensure every consequential write calls `AuditService.log` (MOD-46).
- Keep SMS backend-first; verify `sms.processor` payload < 160 chars and never blocks incident.

---

### WS-3 — Frontend Operations Center: shell + design system + wiring

**This unblocks every OPS page. Do before WS-4.**

**3.1 App shell & navigation**
- Files: new `frontend/app/(ops)/layout.tsx` or `components/layout/*` (Sidebar, Topbar, RoleBadge, ConnectionIndicator).
- Work: persistent left nav grouped by cluster (Dashboard, Incidents/Queue, Map, Triage, Dispatch, Fleet/Resources, Hospitals, Escalations, Surge, Analytics, Risk, Announcements, Admin, Audit). Topbar: user, org, role, live WS connection dot (never silently fail — show connecting/offline).
- Acceptance: nav renders, highlights active route, hides items the role can’t access.

**3.2 Auth guard + role routing (MOD-47 on FE)**
- Files: `frontend/middleware.ts`, `lib/auth.ts`, new `lib/use-auth.ts` (decode role from JWT).
- Work: redirect unauthenticated → `/login`; gate routes by role (Dispatcher/Supervisor/Hospital/Org-Admin/Sys-Admin/Announcer). Hospital users land on hospital portal only.
- Acceptance: direct URL to an unauthorized page redirects; token expiry → login.

**3.3 Data layer (TanStack Query hooks per domain)**
- Files: expand `frontend/lib/api.ts`; add `frontend/features/<domain>/api.ts` + `hooks.ts` (fill the empty `features/*`). One hook set per domain: incidents, dispatch, resources/fleet, hospitals/facilities, escalations, analytics, risk, surge, announcements, audit, admin, orgs.
- Work: typed fetchers against existing REST routes; use `publicReference` in UI, never DB ids.
- Acceptance: each page reads via its hook; loading/empty/error states present.

**3.4 Realtime provider (consume WS-1 emits)**
- Files: `frontend/lib/websocket.ts` (exists), new `providers/socket-provider.tsx`, `hooks/useIncidentEvents.ts`.
- Work: connect `/agap` with cookie JWT, join `ops:all`; on events, update the relevant Query cache (`queryClient.setQueryData`) so dashboard/queue/map update without refetch. Show reconnect state.
- Acceptance: a backend status change reflects in the open OPS tab within ~1s, no manual refresh.

**3.5 Design system (so all pages are consistent)**
- Tokens (extend `tailwind.config.ts`): page bg `#F2F5F8` (pearl); cards `#FFFFFF`; primary `#0D6053` (deep green); add `agap.{pearl,green,greenSoft,surface,textMain,textMid,textSub,border,track,dangerSoft,amberSoft,infoSoft}`; `agap.{red,orange,yellow,blue}` for status accents; `priority.{critical,high,medium,low}` unchanged; `agap.dark` is retired. All tokens mirror `mobile/src/theme/tokens.ts`.
- Primitives (Radix + Tailwind) in `components/ui/`: `Button`, `Badge` (status/priority), `Card/StatCard`, `Table/DataTable`, `Tabs`, `Dialog`, `Drawer` (incident detail), `Select`, `Toast`, `Skeleton`, `EmptyState`, `MapContainer` (Leaflet wrapper).
- Status/priority badge map: CRITICAL=red, HIGH=orange, MEDIUM=yellow, LOW=green; lifecycle chips color-coded. Same semantic language as mobile chips.
- Layout grammar: page bg = pearl `#F2F5F8`; Topbar = white bar w/ bottom bevel; Sidebar = white bg, `#0D6053` active, `#EDF1F4` hover; content grid = pearl; cards/drawers = white w/ neumorphic shadow (`#8795A3` 0.09 opacity, elevation equivalents via Tailwind shadow).
- Accessibility: Radix primitives, focus states, keyboard nav, WCAG AA contrast; pearl/green theme is inherently high-contrast in light mode.
- Acceptance: a shared Storybook-less “kitchen sink” route or the dispatch page re-skinned to tokens; every new page uses these primitives (no ad-hoc colors).

---

### WS-4 — Frontend Operations Center: module pages

Each page: use WS-3 shell + hooks + realtime + design primitives. Build in this order (operational value first).

**4.1 MOD-21 Dashboard** — live KPI tiles (Active, On-Scene, Units Available, Pending Dispatch), recent incidents, surge banner. Replace `app/dashboard/page.tsx` placeholder; subscribe to WS.

**4.2 MOD-23/24 Incident Queue** — enrich `operations/incidents`: sortable/filterable DataTable (status, category, priority, barangay, age), priority recommendation chip (MOD-24), row → detail Drawer; live insert/update via WS.

**4.3 MOD-22 Real-Time Map** — Leaflet map (`operations/map`): incident markers (color by priority), responder markers (live via `responder.location_updated`), click → detail; Bocaue center + flood-prone barangay overlays.

**4.4 MOD-31 Dispatch (enhance)** — keep `operations/dispatch`; add MOD-29/30 recommendation panel (ranked units + rationale), confirm-to-assign (assistive, dispatcher decides), emit path.

**4.5 MOD-25 Triage** — new `operations/triage`: validate/assess queue, mark ASSESSED or FALSE_ALERT (MOD-08), duplicate candidate surfacing (MOD-26 merge action).

**4.6 MOD-27/28 Registries** — `organizations`, `resources`, `operations/fleet`: org registry, resource registry, unit availability board (live status).

**4.7 MOD-41 Escalations** — `operations` escalation board: SLA breaches, acknowledge/resolve, live `escalation.created/updated`.

**4.8 MOD-38/39 Hospitals** — `hospitals`: facility registry + receiving coordination (referrals, bed status, accept/divert), hospital-user scoped.

**4.9 MOD-53 Announcements publisher** — `announcements`: compose/schedule/publish/archive (Announcer role); one-way broadcast only (never dispatch); emits `announcement.published`.

**4.10 MOD-49 Admin** — `administration`: user/account management, org config, system health.

**4.11 MOD-50 Analytics** — `analytics`: response-time charts, volume by category/barangay, SLA compliance (use `dataviz` guidance; brand-neutral palette → AGAP tokens).

**4.12 MOD-51 Risk** — risk heatmap (Leaflet heat layer) from `risk-intelligence`.

**4.13 MOD-52 Surge** — `operations/surge`: activate/deactivate mass-casualty mode, triage tags, resource surge view.

**4.14 MOD-36/34/35/44 command pages** — `operations/command` (ICS), `operations/multi-agency` (BFP coordination), mutual-aid requests, handover view.

**4.15 MOD-46 Audit** — `audit`: filterable immutable log viewer (read-only).

**Cleanup:** fill or delete the empty `features/*` dirs and unused empty route dirs so the tree matches reality.

---

### WS-5 — Mobile remaining gaps

**5.1 MOD-37 Responder assessment form** — new `mobile/app/responder/assessment/[id].tsx` (or within assignment): consciousness/breathing/vitals/#patients/notes → `POST /v1/incidents/:id/assessment`; offline-safe; optional fields never block.

**5.2 MOD-33 Incident chat** — incident-scoped chat UI (citizen ↔ dispatcher ↔ responder) over WS `message.created`; participants only; respect identity-privacy rule (never expose bystander identity).

**5.3 MOD-08 Cancel/false-alert UX** — explicit cancel action on active incident with reason picker (`cancellation_reason`), wired to MOD-08 BE.

**5.4 Live subscriptions** — ensure status/tracking screens consume WS-1 events (no polling).

---

### WS-6 — Cross-cutting: testing, data, infra

- **Tests:** unit tests for new BE services (follow `backend/test/**`); e2e emergency-flow must still pass after each workstream (CLAUDE.md). Add WS emit assertions.
- **Seed:** extend `backend/prisma/seed/seed.ts` with orgs (MDRRMO, BFP), units with capabilities (MOD-29), hospitals/facilities, demo incidents, and role accounts for OPS testing.
- **Infra:** `infrastructure/` (docker/postgres/minio/nginx) — ensure PostGIS enabled for MOD-22/26/30/51; nginx routes `/.well-known/*` (passkeys) and `/agap` WS upgrade; MinIO bucket for media.
- **SMS stays backend-first:** keep Textbee server-side; verify payload format `AGAP|INC-…|lat,lng|ts|TYPE|C:Y` < 160 chars.
- **Env:** document any new vars in `.env.example` (no real secrets).

---

## Sequencing / milestones

| Milestone | Contents | Outcome |
|---|---|---|
| **M1 — Live core** | WS-1 (all emits) + WS-3.1–3.4 (shell, auth, data, socket) | Backend pushes events; OPS shell live |
| **M2 — Dispatch loop** | WS-2.1/2.2/2.3 + WS-4.1/4.2/4.3/4.4/4.5 | Full report→triage→recommend→dispatch→map, live |
| **M3 — Field & field-back** | WS-2.4/2.5/2.6 + WS-5 + WS-4.6/4.7/4.8 | Assessment, chat, resources, escalations, hospitals |
| **M4 — Governance & intel** | WS-4.9–4.15 + WS-6 | Announcements, admin, analytics, risk, surge, audit |
| **M5 — Harden** | WS-6 tests/seed/infra, E2E, a11y pass | Release-ready |

Phase order aligns with `CLAUDE.md` Development Phase Order (MVP → WS → offline/SLA → hospitals/resources → surge/analytics/announcements).

---

## Per-module acceptance checklist (Definition of Done)

For each module, DoD = all that apply:
- [ ] BE endpoint(s) in Swagger, RBAC + org scoped, audited, persist-before-emit.
- [ ] WS event emitted after commit (if stateful), using `shared/src/events` names; best-effort.
- [ ] OPS page uses shell + design primitives + Query hook + live updates + loading/empty/error states.
- [ ] MOB screen (if applicable) offline-safe; optional fields never block.
- [ ] Guardrails respected (Reporter≠Patient, publicReference, no sensitive logs, SMS<160 & backend-first).
- [ ] Unit test(s) added; emergency-flow E2E still green.

---

## Out of scope / explicit decisions
- **SMS remains backend-first (Textbee server-side).** No device/client SMS sending. Mobile only composes the offline-fallback payload string.
- No per-role/separate backends (single NestJS monolith).
- Dispatch recommendations stay assistive — no autonomous assignment.
- MOD-53 is one-way broadcast — never an emergency dispatch channel.
