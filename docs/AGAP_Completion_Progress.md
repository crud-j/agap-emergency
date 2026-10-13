# AGAP — Completion Progress Tracker

Mirrors the workstreams in `docs/AGAP_Master_Completion_Plan.md`. Update the status as each prompt in `docs/AGAP_Implementation_Step_By_Step_Prompts.md` lands.

**Legend:** ⬜ not started · 🟦 in progress · ✅ done · ⚠️ blocked · 🟡 partial · 🔴 stub

_Last updated: 2026-10-08 — Full-system verification pass (P20). See verification notes below._

---

## PROMPT 0 — Prerequisites & dependency audit ✅
- ✅ Frontend UI deps installed & pinned (exact): `@radix-ui/react-{dialog,dropdown-menu,tabs,select,toast,tooltip}`, `zustand@5.0.15`, `recharts@3.10.1`. Reusing existing `clsx`, `tailwind-merge`, `lucide-react`, `leaflet`, `react-leaflet`.
- ✅ `shared` builds; `shared/src/events` + `shared/src/enums` importable from frontend & mobile (typecheck green both).
- ✅ Infra audited: PostGIS image + init extension ✅, Redis ✅, MinIO bucket `agap-media` ✅.
- ✅ This tracker created.

---

## MILESTONE 1 — Live core (real-time + ops shell) ✅

- ✅ **P1 · WS-1.1** Realtime engine injectable (MOD-20)
  - `RealtimeModule` is `@Global()`, exports `RealtimeService`
  - `RealtimeService` has 16+ canonical methods (incidentCreated, statusChanged, dispatchCreated, incidentAssigned, escalationCreated, responderLocation, responderStatus, incidentLocationUpdated, assessmentUpdated, incidentHandover, incidentTransporting, facilityArrival, messageCreated, announcementPublished, notificationCreated, broadcast) + 11 backward-compatible aliases
  - `AgapGateway` has JWT handshake auth, auto-joins `user:{userId}` room, `join:incident` (participant-validated), `join:ops` (staff-only), `emitToOps` / `emitToIncident` / `emitToUser`
  - All emits wrapped in `safe()` — WS failure never blocks any request path

- ✅ **P2 · WS-1.2** Emit domain events after state change (MOD-20)
  - **15 services** inject and call `RealtimeService` after DB commit:
    `incidents.service`, `emergency-alerts.service`, `dispatch.service`, `false-alerts.service`, `escalations.service`, `responders.service`, `locations.service`, `communications.service`, `announcements.service`, `notifications.service`, `assessment.service`, `transport.service`, `incident-handover.service`, `eta-refresh.processor`, `sla-monitor.processor`
  - All use `shared/src/events` event-name constants verbatim

- ✅ **P3 · WS-3.1/3.2/3.5** Ops shell + auth guard + design primitives
  - `frontend/app/(ops)/layout.tsx` wraps all ops routes with Sidebar + Topbar
  - `components/layout/Sidebar.tsx` — grouped nav with role-visibility filtering
  - `components/layout/Topbar.tsx` — user/org/role display
  - `components/layout/ConnectionIndicator.tsx` — live/connecting/offline dot
  - `frontend/middleware.ts` — JWT cookie check, redirect to `/login` if absent; `HOSPITAL_USER` restricted to `/hospitals`
  - `components/ui/` — full library: Button, Badge, PriorityBadge, StatusChip, Card, StatCard, DataTable, Tabs, Dialog, Drawer, Select, Toast, Skeleton, EmptyState, EtaLabel
  - `tailwind.config.ts` — full `agap.*` + `priority.*` token set

- ✅ **P4 · WS-3.3/3.4** Ops data layer + realtime provider
  - All `frontend/features/*/api.ts` + `hooks.ts` implemented for: incidents, dispatch, resources, fleet, organizations, hospitals, escalations, announcements, audit, admin, analytics, risk, surge
  - `providers/socket-provider.tsx` connects `/agap`, joins `ops:all`, handles 12 event types updating TanStack Query cache in-place
  - `lib/use-ws-state.ts` tracks connected / connecting / offline state

---

## MILESTONE 2 — Dispatch loop ✅

- ✅ **P5 · WS-2.1 / WS-5.3** MOD-08 False Alerts (BE + mobile cancel UX)
  - `false-alerts.service.ts` — `cancel()` + `markFalseAlert()` with `IncidentStatusService.validateTransition`, audit, realtime emit
  - `mobile/app/emergency/cancel.tsx` — reason picker, calls `cancelIncident()`, shows 911/MDRRMO fallback text

- ✅ **P6 · WS-2.2** MOD-29 Capability Matrix + MOD-30 Unit Recommendation
  - `dispatch/resource-matching/resource-matching.service.ts` — CAPABILITY_MATRIX for all 8 categories, PostGIS ST_Distance proximity, capability + proximity + type-affinity scoring, returns ranked list with rationale
  - Seed populates 13 capabilities across 5 units (WS-6)

- ✅ **P7 · WS-4.1** MOD-21 Dashboard (live)
  - Live KPI tiles (active incidents, responders on-scene, units available, pending dispatch)
  - Surge mode banner + critical announcement banner
  - Recent incidents feed, retry strip for failed queries, ConnectionIndicator

- ✅ **P8 · WS-4.2/4.3** MOD-23/24 Queue + MOD-22 Live Map
  - Incidents queue: sortable/filterable DataTable, priority recommendation chip, IncidentDetailDrawer, live WS updates
  - Map: Leaflet CircleMarker per incident (priority color), live responder markers, flood-prone barangay overlays, Bocaue center, click → IncidentDetailDrawer

- ✅ **P9 · WS-4.4/4.5** MOD-31 Dispatch recommendations + MOD-25 Triage
  - Dispatch: ranked recommendation panel (capability score bar, distance, rationale), confirm-to-assign (dispatcher decides), pre-dispatch lifecycle actions
  - Triage: triage queue (SUBMITTED/RECEIVED/ACKNOWLEDGED), priority chip, lifecycle actions (Received/Acknowledged/Assessed), false alert button, MOD-26 duplicate candidates with merge dialog

- ✅ **P10 · WS-2.3** MOD-26 Duplicate Detection upgrade
  - PostGIS `ST_DWithin` with `DUPLICATE_DETECTION_RADIUS_METERS` constant, time window, distance-ordered candidates
  - Advisory only — dispatcher confirms merge; `incidents/duplicate-detection.service.ts` has `findCandidates` + `findNearbyRecent`

---

## MILESTONE 3 — Field & field-back ✅ (except 2 OPS stubs)

- ✅ **P11 · WS-2.4 / WS-5.1** MOD-37 On-Scene Assessment (BE + mobile)
  - `assessment/assessment.service.ts` — `submit()` creates `on_scene_assessments`, audits, emits `incident.assessment_updated`; all fields optional
  - `mobile/app/responder/assessment/[id].tsx` — optional vitals form, offline-safe, sync banner

- ✅ **P12 · WS-2.5 / WS-5.2** MOD-33 Secure Incident Comms (BE + mobile)
  - `communications.service.ts` — participants-only (reporter/crew/dispatchers), emits `message.created` to `incident:{id}` room only (never leaks to ops:all), role-label identity protection
  - `mobile/app/incident/chat/[id].tsx` + `src/hooks/useIncidentChat.ts` — joins `incident:{id}` room, appends live `message.created` events

- ✅ **P13 · WS-4.6** MOD-27/28 Registries + Fleet
  - `organizations/page.tsx` — searchable org registry, type filter, create/edit dialogs, ORG_ADMIN scoped
  - `resources/page.tsx` — resource registry with capabilities display, org filter, create/edit
  - `operations/fleet/page.tsx` — unit availability board, status summary stats, live status dropdown

- 🔴 **P14 · WS-4.7** MOD-41 Escalations board — **STUB**
  - `operations/escalations/page.tsx` — "Coming soon" placeholder
  - Backend `escalations.service.ts` is complete: `findAll/findById/acknowledge/resolve` + realtime emit
  - `features/escalations/api.ts` + `hooks.ts` are complete (useEscalations, useAcknowledgeEscalation, useResolveEscalation)
  - **Next step:** Implement the escalations board page using existing hooks

- 🔴 **P14 · WS-4.8** MOD-38/39 Hospitals — **STUB**
  - `hospitals/page.tsx` — placeholder with wrong dark theme (stale)
  - Backend hospital endpoints complete; `features/hospitals/api.ts` + `hooks.ts` complete
  - **Next step:** Implement facility registry + receiving coordination page

- ✅ **P15 · WS-2.6** MOD-34/35/36/40/44 backend workflows
  - MOD-34 Multi-Agency: `organizations` service + incident agency participants
  - MOD-35 Mutual Aid: resource request lifecycle, `operations/multi-agency/page.tsx` mutual aid tab
  - MOD-36 ICS: incident command structures, `operations/command/page.tsx` full ICS page
  - MOD-40 Transport: `transport.service.ts` with `startTransport/recordArrival/updateTransport`, emits `incident.transporting` / `incident.facility_arrival`
  - MOD-44 Handover: `incident-handover.service.ts` with `create/list/acknowledge`, emits `incident.handover`

---

## MILESTONE 4 — Governance & intelligence ✅ (2 pages partial)

- ✅ **P16 · WS-4.9/4.15** MOD-53 Announcements publisher + MOD-46 Audit viewer
  - Announcements: compose/schedule/publish/archive, Announcer-role scoped, emits `announcement.published`
  - Audit: filterable read-only log table, detail dialog showing full metadata JSON, immutable note; SUPERVISOR/SYS_ADMIN only

- ✅ **P17 · WS-4.10/4.14** MOD-49 Admin + MOD-36/34/35/44 command pages
  - Admin: three-tab (Users/Health/Config), user management with role-change/activate/deactivate/delete, SYS_ADMIN only
  - Command/ICS (`operations/command`): ICS activate/positions/deactivate, SUPERVISOR only
  - Multi-Agency (`operations/multi-agency`): agencies + mutual aid + handover tabs

- 🟡 **P18 · WS-4.11/4.12/4.13** MOD-50 Analytics + MOD-51 Risk + MOD-52 Surge
  - ✅ Analytics: KPI tiles, volume BarChart (category + status), response-time multi-series BarChart, SLA compliance ring gauges (recharts, agap tokens)
  - 🟡 Risk (`operations/risk`): Leaflet heatmap with density circles, flood-prone overlays, industrial/fireworks overlays, risk area side panel — **no edit affordances for risk areas**
  - 🟡 Surge (`operations/surge`): activate/deactivate, triage summary tiles, triage tags table, resources, broadcast — **triage tags rely on polling (staleTime 30s, refetchInterval 60s), not live WS push**

---

## MILESTONE 5 — Harden & finish 🟡

- ✅ **P19 · WS-6** Seed, infra, tests, cleanup
  - Seed: 9 roles (one account each), MDRRMO + BFP + Hospital orgs, 5 units with 13 capabilities (MOD-29), all-category demo incidents (8 total across full lifecycle), SLA policies, system configs; idempotent; typecheck-clean
  - Infra: `infrastructure/nginx/nginx.conf` created (routes `/.well-known/*`, `/socket.io/*` + WS upgrade, `/v1`, `/api`); prod compose updated with PostGIS init mount + nginx service
  - Tests: backend 118 passing (13 suites), tests-workspace 83 passing (8 suites), frontend 8 passing; `pnpm -r test` exit 0; `pnpm -r typecheck` exit 0; `pnpm -r build` exit 0
  - SMS: 4 assertion tests in `tests/backend/emergency-alerts.service.spec.ts` (format regex, C:Y/C:N, ≤160 chars, never-blocks-incident)

- 🟡 **P20** Final verification pass (this session — 2026-10-08)
  - ✅ Critical audit gap fixed: `dispatch.service.ts` now injects `AuditService` and calls `audit.log` on create-dispatch (MOD-31), cancel-dispatch, add/remove-crew, and submit-triage (MOD-25)
  - Remaining stubs and partials documented in table below

---

## Module status matrix (post-P20 verification)

| MOD | Module | BE | OPS | MOB | Status |
|---|---|---|---|---|---|
| 01 | User Reg & Profile | ✅ | ✅ (via admin) | ✅ | ✅ |
| 02 | Emergency Contacts | ✅ | — | ✅ | ✅ |
| 03 | Medical Profile | ✅ | — | ✅ | ✅ |
| 04 | Accessibility / i18n | 🟡 | — | ✅ | 🟡 |
| 05 | Readiness / Permissions | — | — | ✅ | ✅ |
| 06 | SOS Trigger | ✅ | — | ✅ | ✅ |
| 07 | Shake-to-Alert | ✅ | — | ✅ | ✅ |
| 08 | Cancellation / False Alert | ✅ | ✅ (triage) | ✅ | ✅ |
| 09 | Rapid Detail Capture | ✅ | — | ✅ | ✅ |
| 10 | Photo / Evidence | ✅ | — | ✅ | ✅ |
| 11 | Precision GPS | ✅ | — | ✅ | ✅ |
| 12 | Reverse Geocoding | ✅ | — | ✅ | ✅ |
| 13 | Live Location Tracking | ✅ | ✅ (map live) | ✅ | ✅ |
| 14 | Incident Record/Ticketing | ✅ | ✅ (queue+detail) | ✅ | ✅ |
| 15 | Lifecycle State Mgmt | ✅ | ✅ (triage+dispatch) | ✅ | ✅ |
| 16 | Emergency Contact Notify | ✅ | — | — | ✅ |
| 17 | Multi-Channel Gateway | ✅ | — | ✅ | ✅ |
| 18 | Responder Dispatch Msg | ✅ | ✅ | ✅ | ✅ |
| 19 | Offline Queue & Retry | ✅ | — | ✅ | ✅ |
| 20 | WebSocket Engine | ✅ | ✅ | ✅ | ✅ |
| 21 | Ops Dashboard | — | ✅ | — | ✅ |
| 22 | Real-Time Incident Map | — | ✅ | — | ✅ |
| 23 | Incident Command Queue | ✅ | ✅ | — | ✅ |
| 24 | Severity/Priority Rec | ✅ | ✅ | — | ✅ |
| 25 | Triage & Validation | ✅ | ✅ | — | ✅ |
| 26 | Duplicate Detection | ✅ | ✅ | — | ✅ |
| 27 | Org/Resource Registry | ✅ | ✅ | — | ✅ |
| 28 | Unit Availability | ✅ | ✅ | — | ✅ |
| 29 | Capability Matrix | ✅ | ✅ (dispatch) | — | ✅ |
| 30 | Unit Recommendation | ✅ | ✅ (dispatch) | — | ✅ |
| 31 | Dispatch Authorization | ✅ | ✅ | — | ✅ |
| 32 | Responder Mobile IF | ✅ | — | ✅ | ✅ |
| 33 | Secure Incident Comms | ✅ | — | ✅ | ✅ |
| 34 | Multi-Agency Coord | ✅ | ✅ | — | ✅ |
| 35 | Resource Req / Mutual Aid | ✅ | ✅ | — | ✅ |
| 36 | ICS Support | ✅ | ✅ | — | ✅ |
| 37 | On-Scene Assessment | ✅ | — | ✅ | ✅ |
| 38 | Hospital Receiving | ✅ | 🔴 | — | 🔴 |
| 39 | Facility Registry | ✅ | 🔴 | — | 🔴 |
| 40 | Transport Tracking | ✅ | 🟡 | ✅ | 🟡 |
| 41 | SLA & Escalation | ✅ | 🔴 | — | 🔴 |
| 42 | User-Facing Status | ✅ | — | ✅ | ✅ |
| 43 | Live ETA & Tracking | ✅ | ✅ (dispatch) | ✅ | ✅ |
| 44 | Incident Handover | ✅ | ✅ (multi-agency) | — | ✅ |
| 45 | Resolution & Closure | ✅ | ✅ (dispatch) | — | ✅ |
| 46 | Immutable Audit Trail | ✅ | ✅ | — | ✅ |
| 47 | RBAC | ✅ | ✅ | ✅ | ✅ |
| 48 | Privacy / Consent | ✅ | — | ✅ | ✅ |
| 49 | System Admin | ✅ | ✅ | — | ✅ |
| 50 | Response Analytics | ✅ | ✅ | — | ✅ |
| 51 | Risk Visualization | ✅ | 🟡 | — | 🟡 |
| 52 | Disaster/Surge Mode | ✅ | 🟡 | — | 🟡 |
| 53 | Municipal Announcements | ✅ | ✅ | ✅ | ✅ |

**Counts:** ✅ 45 / 53 · 🟡 5 / 53 · 🔴 3 / 53

---

## Guardrail status (post-P20 verification)

| Guardrail | Status | Evidence |
|---|---|---|
| Reporter ≠ Patient (always separate records) | ✅ | `incidents.service.ts:76-97`, `emergency-alerts.service.ts:63-80` |
| Optional-never-blocks (GPS/photo/medical) | ✅ | Location creation conditional on coords present |
| publicReference everywhere (no raw DB IDs) | ✅ | All controllers return `public_reference` (INC-2026-NNNNNN) |
| Audit on consequential actions | ✅ | Fixed in dispatch.service.ts; all others already audited |
| No sensitive data in logs/SMS | ✅ | Logger uses only IDs/references, never PII/tokens |
| SMS backend-first (Textbee, <160 chars) | ✅ | `sms.processor.ts` Textbee API; enqueued after persist; payload regex tested |
| ETA labeled "est." | ✅ | `eta-label.tsx:25` always shows "est." prefix |
| WS failures non-fatal | ✅ | All realtime calls in try/catch; never propagate to request path |
| 911/MDRRMO always reachable | ✅ (mobile) / 🟡 (FE) | Mobile shows fallback on transmission failure; dashboard has no visible contact |
| Dispatch recommendations assistive | ✅ | Ranked list shown; `authorize dispatch` button requires dispatcher click |
| Offline retries idempotent | ✅ | `clientEventId` dedup on backend; `findFirst` before `create` |
| No autonomous dispatch | ✅ | No code path dispatches without `dispatcherId` param |

---

## Remaining 🟡/🔴 items with exact next steps

### 🔴 MOD-38/39 — Hospital Coordination OPS page
- **File:** `frontend/app/(ops)/hospitals/page.tsx` (10-line stub, wrong dark theme)
- **Also:** Stale theme class `text-white` / `text-slate-500` (pre-design-system)
- **Next step:** Implement facility registry DataTable + referral coordination using `useHospitals()`, `useFacilities()`, `useHospitalReferrals()`, `useAcceptReferral()`, `useDivertReferral()` — all hooks already exist.

### 🔴 MOD-41 — Escalations Board OPS page
- **File:** `frontend/app/(ops)/operations/escalations/page.tsx` (8-line stub)
- **Next step:** Implement SLA-breach board using `useEscalations()`, `useAcknowledgeEscalation()`, `useResolveEscalation()` — all hooks and backend already exist. Subscribe to `escalation.created/updated` WS events (already handled in socket-provider).

### 🟡 MOD-51 — Risk Intelligence (edit affordances)
- **File:** `frontend/app/(ops)/operations/risk/page.tsx`
- **What exists:** heatmap, flood overlays, industrial overlays, side panels
- **Gap:** Risk area records shown read-only; no create/edit/delete affordances for SYSTEM_ADMINISTRATOR to manage risk_areas registry
- **Next step:** Add manage-risk-areas dialog (SYS_ADMIN only) to the side panel — POST/PATCH/DELETE `/risk-intelligence/areas`.

### 🟡 MOD-52 — Surge Mode (live triage push)
- **File:** `frontend/app/(ops)/operations/surge/page.tsx`
- **What exists:** full activate/deactivate, triage tags table (polling), resources, broadcast
- **Gap:** Triage tags table polls (60s interval) instead of receiving live `triage.created` WS pushes; no WS event currently emitted by backend for new triage tags
- **Next step:** Either (a) add `triage.created` event to `RealtimeService` + `DisasterModeService.createTriageTag()` and handle in socket-provider + surge page, or (b) accept 60s poll latency (acceptable for ops dashboard).

### 🟡 MOD-04 — Accessibility / i18n (BE preference persistence)
- **What exists:** Mobile i18n with language support
- **Gap:** BE does not consistently read/serve user language preference
- **Next step:** Ensure `user.preferred_language` is included in JWT claims / profile endpoint.

### 🟡 MOD-40 — Transport Tracking (OPS page)
- **What exists:** Backend transport endpoints fully implemented (startTransport/recordArrival/updateTransport, full emit chain)
- **Gap:** No dedicated OPS transport view — transport status only visible indirectly through incident detail
- **Next step:** Add a "Transport" tab or panel to the IncidentDetailDrawer showing transport records, estimated arrival, destination facility.

### 🟡 911/MDRRMO fallback — Frontend dashboard
- **Gap:** Dashboard shows no visible emergency contact or hotline fallback for the ops operator
- **This is low severity** (dispatchers have direct access to MDRRMO phone; this is the ops center, not a citizen screen)
- **Next step:** Add a small footer or sidebar entry with `+63-44-693-1234 (MDRRMO hotline)` for completeness.

---

## Known pre-existing issues (unchanged)

- Frontend `next lint` crashes repo-wide (ESLint 9 vs `next lint` legacy CLI + `eslint-plugin-react-hooks@5`). `next build` lints cleanly in its own step; standalone `next lint` crashes. Not caused by plan work — ESLint config migration is its own task.
- Mobile has 4 pre-existing ESLint errors in app code (unused vars, exhaustive-deps) unrelated to plan work.
- `shared/src/**/*.{js,d.ts,map}` stale compiled artifacts still present. Gitignore `shared/src/**/*.{js,d.ts,map}` or clean in next PR.

## Notes / decisions

- SMS stays **backend-first** (Textbee server-side); mobile only composes the offline-fallback payload.
- Ops theme: pearl `#F2F5F8` + deep-green `#0D6053` + `agap.*`/`priority.*` tokens; Radix + lucide + Leaflet.
- Backend dev port is **3002** (Docker) / 3000 (local); ops `NEXT_PUBLIC_API_URL`, mobile `EXPO_PUBLIC_API_URL` point at the active backend/ngrok.
- Dispatch is the most consequential operational action — now fully audited (fixed in P20).
