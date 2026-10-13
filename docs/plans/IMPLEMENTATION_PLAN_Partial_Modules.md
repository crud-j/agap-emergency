# AGAP — Implementation Plan: Partial Modules (backend ready, client UI missing/stub)

**Scope:** 22 modules whose backend endpoints exist but have no usable client surface.
**Goal:** make each module usable end-to-end by building the missing frontend (Operations Center) and/or mobile UI and wiring it to the **existing** backend — no new backends, no duplicate auth (per `CLAUDE.md`).
**Baseline:** verified backend route surface (see each module). Architecture rules, RBAC, and WS contracts follow `CLAUDE.md`.

> Companion doc: `IMPLEMENTATION_PLAN_Minimal_Modules.md` (scaffold-only modules).

---

## 0. Conventions & shared prerequisites (do these first)

These unblock most of the frontend modules below.

### 0.1 Frontend Operations Center shell (blocks MOD-23, 27, 46, 49, 50 + hospital)
Today `frontend/app/layout.tsx` only renders `<Providers>`; every Ops page is a bare route with no navigation or shared chrome, and `/operations/dispatch` is the only real screen.

- **Create** `frontend/components/layout/AppShell.tsx` — sidebar nav + top bar, role-gated links. Reuse the dark slate theme already in the dispatch dashboard.
- **Create** `frontend/app/(ops)/layout.tsx` (route group) wrapping authenticated Ops pages with `AppShell`; move `dashboard`, `operations/*`, `hospitals`, `administration`, `analytics`, `audit`, `announcements` under it.
- Nav items gated by role (MOD-47): Dispatch, Incidents (Command Queue), Map, Hospitals, Analytics, Admin, Audit, Announcements, Surge.

### 0.2 Frontend session/user context (blocks all RBAC-gated UI)
There is no client-side user/role today (middleware only checks the cookie exists).

- **Create** `frontend/hooks/useSession.ts` → fetches `GET /v1/users/me` with the cookie token; exposes `{ user, role, isLoading }`.
- **Create** `frontend/providers` addition `SessionProvider` (or TanStack query) so nav + pages can gate on role.
- **Update** `frontend/lib/api.ts`: add a `del<T>()` method (missing today) and an authed wrapper that injects the `agap_token` cookie via `frontend/lib/auth.ts` `getToken()` so callers stop passing the token manually.

### 0.3 Mobile reuse patterns
- API services live in `mobile/src/services/api/<domain>.api.ts` (pattern: `auth.api.ts`, `incidents.api.ts`). Reuse `useAuthStore().accessToken` + TanStack Query.
- Screens under `mobile/app/<route>`; match existing styling (teal `#0D6053`, `SafeAreaView`, `Ionicons`, `onbrd-progressbar`).
- New shared enums/types go in `shared/src/*`, then rebuild (`pnpm --filter @agap/shared build`).

### 0.4 Conventions
- Frontend components: annotate exported component return types `: ReactElement` (avoids the known monorepo TS2742). Maps use `next/dynamic` with `ssr: false` (Leaflet needs `window`).
- Every consequential action is auditable/attributable (Rule 11) — the backend already writes audit; the UI must send the authenticated actor (JWT).
- Optional data never blocks emergency flow (Rule 5). ETA always labeled an estimate (Rule 13).
- After each epic: `pnpm --filter @agap/frontend typecheck && next build`, `pnpm --filter @agap/mobile typecheck`, and run the emergency-flow E2E.

---

## Epic A — Citizen self-service (mobile)

### MOD-02 · Emergency Contact Management
- **Backend (exists):** `GET/POST /v1/emergency-contacts`, `PATCH/DELETE /v1/emergency-contacts/:id`, `PATCH /v1/emergency-contacts/:id/priority`.
- **Build:** `mobile/src/services/api/emergency-contacts.api.ts`; expand `mobile/app/contacts/` into list + add/edit form + delete + reorder-priority. Validate PH phone (reuse login regex).
- **Rules:** contacts are *Sensitive* (least-privilege); shown only to the owner. Notification to contacts is MOD-16.
- **Effort:** S.

### MOD-03 · Medical Profile  +  MOD-48 · Privacy/Consent (medical)
- **Backend (exists):** `GET/POST/PATCH/DELETE /v1/medical-profiles/me`, `GET /v1/medical-profiles/:userId` (responder/dispatcher/supervisor); consent `POST /v1/consent`, `GET /v1/consent/:type`, `DELETE /v1/consent/:type`; `GET /v1/privacy/access-log`, `GET /v1/privacy/export`.
- **Build:** `mobile/src/services/api/medical.api.ts` + `consent.api.ts`; expand `mobile/app/medical/` into a profile editor (blood type, allergies, conditions, meds). **Gate writes behind a ConsentRecord**: on first entry, show a consent modal that calls `POST /v1/consent` (type `MEDICAL_PROFILE`); block save until consent granted (Privacy rule — medical requires separate consent). Add a "Privacy & data" screen under `settings` showing `access-log` + `export`, and a "Withdraw consent" action (`DELETE /v1/consent/:type`).
- **Rules:** Medical = most-restricted class; never logged; dispatch never blocked by missing medical (Reliability rule).
- **Effort:** M.

### MOD-05 · Emergency Readiness & Permissions
- **Backend (exists):** `GET /v1/users/me/readiness`.
- **Build:** expand `mobile/app/settings/` into a readiness checklist: location/notification/camera permission status (Expo permissions), profile completeness, contacts present, medical present. Each row links to the fixing screen. Call `users/me/readiness` for the server view; combine with on-device permission checks.
- **Effort:** S.

### MOD-08 · Emergency Cancellation & False-Alert Management
- **Backend (exists):** `POST /v1/emergency-alerts/:id/cancel` (citizen cancels own alert), `POST /v1/incidents/:id/false-alert` (dispatcher classifies), `false-alerts` module.
- **Build (mobile, citizen):** a **cancel window** after SOS submit — add `mobile/app/emergency/confirmation.tsx` (referenced in CLAUDE map) or a cancel affordance on `/tracking/[id]` / `/incidents/[id]` for `DRAFT`/`SUBMITTED` states → `POST /v1/emergency-alerts/:id/cancel` with reason. Use the seeded `sos_cancel_window_seconds` config.
- **Build (frontend, dispatcher):** a "Mark false alert" action in the dispatch `IncidentDetailPanel` → `POST /v1/incidents/:id/false-alert` (reason). 
- **Rules:** a failed cancel must never silently fail (clear UI state); terminal status `CANCELLED`/`FALSE_ALERT` per lifecycle.
- **Effort:** M.

---

## Epic B — Dispatcher tools & monitoring (frontend)

### MOD-23 · Incident Command Queue
- **Backend (exists):** `GET /v1/incidents` (ops list, now includes location), `GET /v1/incidents/:id/*`, WS `incident.created` / `incident.status_changed`.
- **Build:** promote `frontend/app/operations/incidents/page.tsx` from the basic stub list to a full command queue: filters (status/priority/category/barangay), sort, search by reference, SLA column (reuse `lib/sla.ts`), bulk triage entry points. Reuse `IncidentQueue` patterns from the dispatch dashboard; share a `components/incidents/` set.
- **Effort:** M.

### MOD-25 · Incident Triage & Validation
- **Backend (exists):** `POST /v1/dispatch/triage/:incidentId` (priority assessment + notes), `PATCH /v1/incidents/:id/assess`, `GET /v1/dispatch/priority/:incidentId` (recommendation).
- **Build:** a Triage panel in the incident detail (dispatch + command queue): show the recommended priority (`priority/:incidentId`), let the dispatcher confirm/override + notes → `POST /v1/dispatch/triage/:incidentId`, then `assess`. Validation checklist (location present, category set, duplicates — see MOD-26).
- **Rules:** recommendation is assistive; dispatcher confirms (Rule 8).
- **Effort:** M.

### MOD-28 · Response Unit Availability & Readiness  +  MOD-29 · Capability Matrix
- **Backend (exists):** `GET /v1/resources`, `GET /v1/resources/available`, `PATCH /v1/resources/:id/status`, `POST/DELETE /v1/resources/:id/capabilities`, `GET /v1/fleet`, WS `resource.status_changed` / `resource.location_updated`.
- **Build:** `frontend/app/(ops)/fleet/page.tsx` — live unit board grouped by org/type with status chips (AVAILABLE/DISPATCHED/…), capabilities, base barangay, and a status override (`PATCH :id/status`). Subscribe to `resource.status_changed` for live updates. Capability matrix = a table of unit × capability.
- **Effort:** M.

### MOD-30 · Suitable Response Unit Recommendation
- **Backend (exists):** `GET /v1/resources/recommend/:incidentId`.
- **Build:** in the dispatch `AssignUnitPanel`, add a "Recommended" section that calls `recommend/:incidentId` and ranks units (distance/capability/availability), with a clear "assistive — dispatcher decides" label; keep the full available-units list below. 
- **Rules:** never auto-dispatch (Rule 8).
- **Effort:** S.

### MOD-46 · Immutable Audit Trail (viewer)
- **Backend (exists):** `GET /v1/audit` (supervisor/admin), `GET /v1/audit/incidents/:incidentId` (dispatcher+), `GET /v1/audit/:id`.
- **Build:** `frontend/app/(ops)/audit/page.tsx` — filterable, read-only audit log (actor, action, entity, timestamp); an incident-scoped audit tab on the incident detail (`audit/incidents/:incidentId`). Emphasize immutability (no edit/delete controls).
- **Effort:** S–M.

### MOD-50 · Emergency Response Analytics
- **Backend (exists):** `GET /v1/analytics/response-times | volume | sla-compliance | false-alert-rate | resource-utilization | daily`, `GET /v1/analytics/reports/:incidentId`.
- **Build:** `frontend/app/(ops)/analytics/page.tsx` — dashboards (response-time percentiles, volume by category/barangay, SLA compliance, false-alert rate, utilization). Charts via a light lib (e.g., `recharts`) or SVG; date-range filter. Per-incident report on the incident detail.
- **Effort:** M.

---

## Epic C — Admin & registry (frontend)

### MOD-27 · Organization & Resource Registry  +  MOD-49 · System Administration
- **Backend (exists):** organizations `GET/POST/PATCH /v1/organizations`, `GET/POST/DELETE /v1/organizations/:id/members`; resources `POST/PATCH /v1/resources`, `POST/DELETE /v1/resources/:id/capabilities`; fleet `POST/PATCH/activate/deactivate`; administration `GET /v1/administration/users`, `PATCH users/:id/role|activate|deactivate`, `DELETE users/:id`, `GET/PUT /v1/administration/config`, `GET /v1/administration/health`; permissions `GET /v1/permissions`, roles CRUD.
- **Build:** `frontend/app/(ops)/administration/` with tabs: **Users** (list, role/activate/deactivate/delete), **Organizations & members**, **Resources & fleet** (CRUD + capabilities), **System config** (key/value editor via `administration/config`), **Health**. Org-admin sees org-scoped; sys-admin sees all (RBAC).
- **Rules:** least-privilege; all changes audited.
- **Effort:** L (split: Users+Config first, then Org/Resource registry).

### MOD-53 · Municipal Announcements (publisher)
- **Backend (exists):** `GET /v1/announcements`, `POST /v1/announcements`, `PATCH :id`, `POST :id/publish|schedule|archive|supersede`, `GET :id/delivery`.
- **Build:** `frontend/app/(ops)/announcements/` — compose/edit, schedule, publish, archive, supersede, and a delivery-status view. Mobile viewer already exists; this adds the publisher console (role `ANNOUNCEMENTS_PUBLISHER`).
- **Rules:** MOD-53 is one-way broadcast only — **not** an emergency dispatch channel (Rule 16).
- **Effort:** M.

---

## Epic D — Field → hospital → closure chain (mobile + frontend)

### MOD-37 · On-Scene Patient Assessment (mobile, responder)
- **Backend (exists):** `GET/POST /v1/incidents/:id/assessments` (responder), `PATCH /v1/incidents/:id/assessments/:aId`, `GET /v1/incidents/:id/assessments/:aId`.
- **Build:** `mobile/app/responder/assessment.tsx` (referenced in CLAUDE map) reachable from the assignment detail when status is `ON_SCENE`: vitals, consciousness/breathing, chief complaint, interventions, patient count. Submit → `POST :id/assessments`; editable until handover.
- **Rules:** Reporter ≠ Patient; unknown patient valid; medical data restricted.
- **Effort:** M.

### MOD-39 · Hospital & Receiving Facility Registry (frontend)
- **Backend (exists):** `GET /v1/hospitals`, `GET /v1/hospitals/nearby`, `GET /v1/hospitals/:id`, `POST /v1/hospitals` (sysadmin), `PATCH /v1/hospitals/:id`; `GET /v1/facilities`, `PATCH /v1/facilities/:id/status`, `POST /v1/facilities` (sysadmin).
- **Build:** replace `frontend/app/hospitals/page.tsx` stub with a registry: hospital/facility list, capabilities (ER/ICU/blood bank), **receiving status** editor (`facilities/:id/status`), map of facilities. 
- **Effort:** M.

### MOD-38 · Hospital Receiving Coordination (mobile + frontend)
- **Backend (exists):** `POST /v1/hospitals/:id/referrals` (responder/dispatcher/supervisor), `GET /v1/hospitals/:id/referrals`, `GET /v1/hospitals/referrals/:refId`, `PATCH referrals/:refId/acknowledge` (hospital user), `PATCH referrals/:refId/arrived`.
- **Build (mobile, responder):** from assignment detail / transport, "Refer to hospital" → pick a receiving facility (nearby + OPEN status) → `POST :id/referrals`; show referral status.
- **Build (frontend, hospital user):** a Hospital Portal view (role `HOSPITAL_USER`) listing inbound referrals with acknowledge/arrived actions. Realtime: referral updates over WS.
- **Effort:** M–L.

### MOD-40 · Transport & Destination Tracking (mobile + frontend)
- **Backend (exists):** `POST /v1/dispatch/:id/transport`, `GET /v1/dispatch/:id/transport`, `PATCH :id/transport/destination`, `POST :id/transport/arrived`, `POST :id/transport/handover`.
- **Build (mobile, responder):** when status → `TRANSPORTING`, start transport (`POST :id/transport`) with destination (from MOD-38 referral); change destination, mark arrived, complete handover — surfaced as steps in the assignment detail. Reuse the live map + route line to the destination.
- **Build (frontend):** show transport leg + destination + ETA on the dispatch map/detail (reuse `responder.eta_updated`).
- **Rules:** ETA is an estimate; failed ETA never stops transport.
- **Effort:** M.

### MOD-44 · Incident Handover
- **Backend (exists):** `POST /v1/incidents/:id/handover`, `GET /v1/incidents/:id/handover`, `PATCH /v1/incidents/:id/handover/acknowledge` (dispatcher/supervisor).
- **Build (frontend):** handover panel on the incident detail — create handover (shift/role change) with notes, outgoing/incoming actor; incoming acknowledges. Timeline entry.
- **Effort:** S–M.

### MOD-45 · Incident Resolution & Closure (frontend)
- **Backend (exists):** `POST /v1/incidents/:id/resolution`, `GET /v1/incidents/:id/resolution`, `POST /v1/incidents/:id/close` (dispatcher/supervisor).
- **Build:** a "Resolve & close" flow in the dispatch/command incident detail: capture outcome, patient disposition, follow-up required, notes → `POST :id/resolution`; then `POST :id/close`. Citizen detail already renders `resolution` (MOD-42). Responder cannot close (RBAC).
- **Rules:** closure is permission-controlled + timestamped; terminal state.
- **Effort:** S–M.

---

## Epic E — Notification visibility (cross-surface)

### MOD-16 · Emergency Contact Notification
- **Backend (exists):** notifications module + `contacts` BullMQ queue; dispatch already enqueues contact notifications on dispatch.
- **Build:** surface delivery status — on the citizen incident detail (`/incidents/[id]`) show "emergency contacts notified" state; let the citizen opt contacts in/out per incident. On the frontend incident detail, show the notification log (`incident.notifications`). Reuse existing notification read endpoints.
- **Rules:** a failed contact SMS/push must never cancel the incident (Reliability rule); no sensitive data in SMS.
- **Effort:** S.

---

## Sequencing (recommended)

| Phase | Modules | Rationale |
|---|---|---|
| **0** | Shell + session + `api.del` | Unblocks all frontend epics |
| **1** | A: MOD-02, 03+48, 05, 08 | Citizen readiness; mostly mobile, low risk |
| **2** | B: MOD-23, 25, 30, 28/29 | Completes dispatcher workflow on the web |
| **3** | D: MOD-37 → 38/39 → 40 → 44 → 45 | Field-to-hospital-to-closure chain (Phase 4 scope) |
| **4** | C: MOD-27/49, 53 | Admin consoles + publisher |
| **5** | B: MOD-46, 50; E: MOD-16 | Governance + analytics + notification visibility |

## Cross-cutting acceptance criteria
- Each module: reachable from nav, RBAC-gated, wired to the listed real endpoints, live where a WS event exists, and passing `typecheck` + `next build` / mobile `typecheck`.
- No new auth, no duplicate backends, no exposing internal DB IDs (use `publicReference`).
- Emergency-flow E2E still green after each epic.
