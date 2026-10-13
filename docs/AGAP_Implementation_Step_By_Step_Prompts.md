# AGAP — Step-by-Step Implementation Prompts

Copy-paste these prompts **one at a time** into Claude Code to complete `docs/AGAP_Master_Completion_Plan.md`. They are ordered by milestone (M1→M5). Each prompt is self-contained, names the real files, states UI/UX requirements, and ends with acceptance criteria.

**Every prompt implicitly carries these standing rules — do not restate, just obey:**
- Follow `CLAUDE.md` (all Architectural & Reliability rules) and `docs/AGAP_System_Design_UIUX.md` (design system).
- **SMS is backend-first** (Textbee server-side only). Never send SMS from the device.
- Persist to PostgreSQL first, then emit WS **after commit**, best-effort (a WS/SMS/push failure must never block or modify an incident).
- Use `shared/src/events/*` event names and `shared/src/enums/*` verbatim. Expose `publicReference`, never raw DB ids.
- RBAC + org scoping + `AuditService.log` on every consequential endpoint.
- After each prompt: run `pnpm typecheck` + `pnpm lint` for the touched package, add/adjust tests, and keep the emergency-flow E2E green.
- Use the design tokens: Ops = pearl `#F2F5F8` + deep-green `#0D6053` + `agap.*`/`priority.*` + Radix + lucide + Leaflet (matches mobile theme — see `docs/AGAP_System_Design_UIUX.md` §5.4); Mobile = same tokens from `mobile/src/theme/tokens.ts`.

Work in small commits per prompt. Typecheck before moving on.

---

## PROMPT 0 — Prerequisites & dependency audit

```
Review backend/, frontend/, mobile/, shared/ and docs/AGAP_Master_Completion_Plan.md + docs/AGAP_System_Design_UIUX.md.

Prepare the workspace for the completion plan WITHOUT implementing features yet:
1. In frontend/, confirm/install UI deps the plan needs but that are missing: @radix-ui primitives (dialog, dropdown-menu, tabs, select, toast, tooltip), zustand, and a chart lib for MOD-50 (recharts). Pin exact versions (no "latest"). clsx, tailwind-merge, lucide-react, leaflet, react-leaflet already exist — reuse them.
2. Confirm shared/src/events and shared/src/enums build and are importable from frontend and mobile.
3. Confirm infrastructure/ has PostGIS enabled on Postgres and MinIO bucket + nginx /agap WS upgrade + /.well-known/* routing. List any gaps; fix docker-compose/nginx config only if trivially missing.
4. Create a short docs/AGAP_Completion_Progress.md checklist mirroring the plan's workstreams so we can track status.

Do not build features. Report what you changed and what was already present. Run pnpm install and pnpm typecheck.
```

---

# MILESTONE 1 — Live core (real-time + ops shell)

## PROMPT 1 — WS-1.1 Make the realtime engine injectable (MOD-20)

```
Implement WS-1.1 of docs/AGAP_Master_Completion_Plan.md.

In backend/src/realtime: make the realtime layer injectable by every feature module.
- Mark realtime.module.ts @Global() (or export RealtimeService) so any module can inject RealtimeService with no circular dependency.
- In agap.gateway.ts keep the JWT handshake auth and join:incident / ops rooms. Confirm emitToOps() and emitToIncident() exist.
- In realtime.service.ts add thin, best-effort wrapper methods that route to the gateway and use shared/src/events names:
  incidentCreated, incidentUpdated, statusChanged, dispatchCreated, incidentAssigned,
  escalationCreated, responderLocation, responderStatus, incidentLocationUpdated,
  assessmentUpdated, incidentHandover, announcementPublished, notificationCreated.
  Each wraps in try/catch so a WS failure never throws into the caller.

Acceptance: any service can inject RealtimeService; app boots with no DI/circular errors; pnpm --filter backend typecheck passes. Add a unit test asserting statusChanged() routes to emitToIncident + emitToOps.
```

## PROMPT 2 — WS-1.2 Emit domain events after every state change (MOD-20)

```
Implement WS-1.2 of the Master Completion Plan.

Inject RealtimeService into these backend services and emit the matching shared/src/events event AFTER the DB write commits (persist→commit→emit, best-effort):
- incidents.service (create → incident.created; update → incident.updated) to ops + incident:{id}
- incidents/incident-status (transition → incident.status_changed plus the specific incident.dispatched/en_route/arrived/resolved/closed/cancelled)
- dispatch.service (create/assign → incident.assigned + dispatch.created)
- escalations.service and jobs/processors/sla-monitor (incident.escalated, escalation.created/updated)
- responders.service (responder.location_updated, responder.status_changed, responder.eta_updated)
- locations.service track (incident.location_updated)
- announcements.service publish (announcement.published)
- notifications create (notification.created to the user room)

Rooms: ops → emitToOps; incident-scoped → emitToIncident(id). Citizens must only receive their own incident events.
No UI in this prompt.

Acceptance: with two WS clients, a status change on incident A pushes incident.status_changed to ops:all and incident:{A} only; a client in incident:{B} receives nothing. Add tests asserting emit is called after the Prisma update and that a thrown emit does not fail the request. Typecheck + existing tests green.
```

## PROMPT 3 — WS-3.1/3.2 Ops Center app shell + auth guard + design primitives

```
Implement WS-3.1, WS-3.2, and WS-3.5 (design primitives) of the Master Completion Plan for frontend/ (Operations Center), following docs/AGAP_System_Design_UIUX.md §5.4 (pearl/green theme — matches mobile).

1. App shell: create frontend/app/(ops)/layout.tsx with components/layout/{Sidebar,Topbar,ConnectionIndicator}. Sidebar grouped by cluster (Dashboard, Incidents, Map, Triage, Dispatch, Fleet/Resources, Hospitals, Escalations, Command, Multi-agency, Surge, Analytics, Risk, Announcements, Admin, Audit). Topbar shows user/org/role + live WS connection dot. Pearl base #F2F5F8 page bg, white (#FFFFFF) sidebar/topbar/cards, deep-green #0D6053 primary/active, agap.* status accents.
2. Auth guard + role routing (MOD-47 on FE): use middleware.ts + lib/auth.ts; add lib/use-auth.ts to decode role from the agap_token JWT. Redirect unauthenticated → /login; gate nav items and routes by role (Dispatcher/Supervisor/Hospital/OrgAdmin/SysAdmin/Announcer). Hospital users see only the hospital portal.
3. Design primitives in frontend/components/ui/ (Radix + Tailwind + clsx/tailwind-merge + lucide): Button, Badge, PriorityBadge, StatusChip, Card, StatCard, DataTable, Tabs, Dialog, Drawer, Select, Toast, Skeleton, EmptyState. Use tokens agap.{pearl,green,greenSoft,surface,textMain,textMid,textSub,border,danger,amber,info}, priority.{critical,high,medium,low} — all from the design system §5.4. Map incident status → chip tones per the design doc.

Acceptance: nav renders and highlights active route; unauthorized routes redirect; primitives render in a temporary /ops/kitchen-sink preview (or re-skin operations/dispatch to the tokens). Typecheck + lint pass.
```

## PROMPT 4 — WS-3.3/3.4 Ops data layer + realtime provider

```
Implement WS-3.3 and WS-3.4 of the Master Completion Plan for frontend/.

1. Data layer: expand lib/api.ts and fill features/<domain>/{api.ts,hooks.ts} with typed TanStack Query hooks for: incidents, dispatch, resources, fleet, hospitals, facilities, escalations, analytics, risk, surge, announcements, audit, admin, organizations. Fetchers hit existing /api/v1 routes with the Bearer token; UI consumes publicReference, never DB ids. Every hook exposes loading/empty/error states.
2. Realtime provider: wire lib/websocket.ts into providers/socket-provider.tsx (mount in providers/providers.tsx). Connect /agap with the cookie JWT, join ops:all, and on shared/src/events events update the relevant Query cache via queryClient.setQueryData (so dashboard/queue/map update without refetch). Drive the Topbar ConnectionIndicator (connected/connecting/offline).

Acceptance: a backend incident.status_changed reflects in an open ops tab within ~1s with no manual refresh; connection state is always visible. Typecheck + lint pass.
```

---

# MILESTONE 2 — Dispatch loop (report → triage → recommend → dispatch → map)

## PROMPT 5 — WS-2.1 MOD-08 False Alerts (backend stub → real) + mobile cancel UX

```
Implement WS-2.1 and WS-5.3 of the Master Completion Plan.

Backend (MOD-08): implement backend/src/false-alerts/false-alerts.service.ts (currently an 8-line stub) + controller endpoints:
- cancel(incidentId, actorId, reason) and markFalseAlert(incidentId, actorId, reason).
- Use IncidentStatusService.validateTransition to CANCELLED / FALSE_ALERT; persist cancellation_reason enum; respect lifecycle (reporter may cancel own pre-dispatch; responder cannot close). Audit + emit incident.cancelled.

Mobile UX (pearl/green theme): add an explicit "Cancel emergency" action on the active incident screen with a reason picker (cancellation_reason), wired to the endpoint, offline-safe, with clear confirmation. Never allow a failed call to leave the UI in an ambiguous state (show error, keep incident).

Acceptance: cancelling a SUBMITTED incident transitions+audits+emits; invalid transition → 400; mobile shows reason picker + confirmation. Tests for the service; typecheck/lint.
```

## PROMPT 6 — WS-2.2 MOD-29 Capability Matrix + MOD-30 Unit Recommendation (backend)

```
Implement WS-2.2 of the Master Completion Plan.

Create backend/src/dispatch/resource-matching/resource-matching.service.ts (+ wire in dispatch.module.ts):
- Capability matrix: map IncidentType → required unit capabilities (seed in shared or a resource_capabilities table).
- Ranking: among AVAILABLE units, rank by capability match + PostGIS proximity (ST_DWithin / distance) + readiness. Expose GET /v1/dispatch/recommendations?incidentId=. Return a ranked list with score + human-readable rationale.
- ASSISTIVE ONLY: never auto-assign; dispatcher confirms (CLAUDE.md rule 8).

Acceptance: for a FIRE incident, fire/rescue-capable available units outrank medical-only; response includes rationale and distance; audited read. Unit tests for ranking. Typecheck/lint.
```

## PROMPT 7 — WS-4.1 MOD-21 Dashboard (live)

```
Implement WS-4.1 of the Master Completion Plan (Ops Center, pearl/green theme per docs/AGAP_System_Design_UIUX.md §5.4).

Replace frontend/app/dashboard/page.tsx placeholder with a live dashboard:
- KPI StatCards: Active Incidents, Responders On-Scene, Units Available, Pending Dispatch (live via the socket provider + Query hooks).
- Recent incidents list (publicReference, category icon, PriorityBadge, StatusChip, age).
- CRITICAL surge/announcement banner when present.
- Use components/ui primitives + tokens; skeleton while loading; EmptyState when none; never silently fail (show WS state).

Acceptance: tiles and list update live on incident events; matches the design system. Typecheck/lint.
```

## PROMPT 8 — WS-4.2/4.3 MOD-23/24 Incident Queue + MOD-22 Live Map

```
Implement WS-4.2 and WS-4.3 of the Master Completion Plan (Ops Center).

1. MOD-23/24 Queue: enrich frontend/app/operations/incidents into a DataTable (sortable/filterable by status, category, priority, barangay, age). Show MOD-24 priority recommendation chip. Row click opens a right Drawer with incident detail (timeline, reporter≠patient, location, media, status actions). Live insert/update via WS.
2. MOD-22 Map: build frontend/app/operations/map with Leaflet/react-leaflet — incident markers colored by priority, responder markers live via responder.location_updated, click → detail Drawer. Center on Bocaue; add flood-prone barangay overlays (Lolomboy, Bunlo, Igulot, Bambang).

Use design tokens + primitives. ETA fields labeled "est." with last-updated.

Acceptance: queue filters work and update live; map shows live incidents + responders; both open the same detail Drawer. Typecheck/lint.
```

## PROMPT 9 — WS-4.4 MOD-31 Dispatch (recommendations) + WS-4.5 MOD-25 Triage

```
Implement WS-4.4 and WS-4.5 of the Master Completion Plan (Ops Center).

1. MOD-31 Dispatch: enhance frontend/app/operations/dispatch with a recommendation panel consuming GET /v1/dispatch/recommendations (MOD-29/30): ranked units + rationale + distance; confirm-to-assign (assistive — dispatcher decides). Emit path already exists; reflect incident.assigned live.
2. MOD-25 Triage: build frontend/app/operations/triage — validate/assess queue; actions to mark ASSESSED or FALSE_ALERT (MOD-08); surface duplicate candidates (MOD-26) with a merge action.

Design-system consistent (pearl/green theme, primitives, status/priority color language per §5.4).

Acceptance: dispatcher sees ranked recommendations and confirms assignment; triage can assess/false-alert/merge with audit + live updates. Typecheck/lint.
```

## PROMPT 10 — WS-2.3 MOD-26 Duplicate Detection upgrade (PostGIS + merge)

```
Implement WS-2.3 of the Master Completion Plan.

Upgrade backend/src/incidents/duplicate-detection/duplicate-detection.service.ts:
- Replace the bounding-box approximation with a PostGIS ST_DWithin radius query using DUPLICATE_DETECTION_RADIUS_METERS and DUPLICATE_DETECTION_WINDOW_MINUTES; return candidates with distance.
- Add POST /v1/incidents/:id/merge (dispatcher-only): set status=DUPLICATE + duplicate_of_id, audited, emit incident.status_changed. ADVISORY — human confirms the merge (never auto-merge).

Acceptance: two nearby same-category reports within the window surface each other with distance; merge sets DUPLICATE + emits + audits. Unit test with seeded coords. Typecheck/lint.
```

---

# MILESTONE 3 — Field & field-back (assessment, chat, resources, escalations, hospitals)

## PROMPT 11 — WS-2.4 MOD-37 On-Scene Assessment (backend + mobile form)

```
Implement WS-2.4 and WS-5.1 of the Master Completion Plan.

Backend: add on-scene assessment to backend/src/incidents (sub-service + DTO). POST /v1/incidents/:id/assessment (Responder role) persisting consciousness_state, breathing_status (enums already in schema), vitals, number_of_patients, notes. Audit; emit incident.assessment_updated. Missing fields never block.

Mobile (responder, pearl/green theme): build mobile/app/responder/assessment/[id].tsx (link from assignment detail) — a clear form with the above fields, optional-friendly, offline-safe, with a visible save/sync state. Submits to the endpoint.

Acceptance: responder submits on-scene; dispatcher sees it live (assessment_updated) in the incident Drawer; optional fields never block. Service test; typecheck/lint (backend + mobile).
```

## PROMPT 12 — WS-2.5 + WS-5.2 MOD-33 Secure Incident Comms (WS chat, both surfaces)

```
Implement WS-2.5 and WS-5.2 of the Master Completion Plan.

Backend: in backend/src/communications, on sendMessage emit an incident-scoped message.created to incident:{id}; enforce participants-only (reporter, assigned responders, dispatchers). Keep insert/read/markRead. Never expose a bystander's identity to strangers (CLAUDE.md rule 15).

Mobile: incident chat UI on the active incident + responder assignment screens (pearl/green), live via WS.
Ops: chat panel inside the incident detail Drawer (pearl/green — white card, #0D6053 own-message bubble).

Acceptance: messages appear live only for incident participants; non-participants are blocked (test); identities protected. Typecheck/lint on all touched packages.
```

## PROMPT 13 — WS-4.6 MOD-27/28 Registries + Fleet board (Ops)

```
Implement WS-4.6 of the Master Completion Plan (Ops Center).

Build these pages with the pearl/green design system (§5.4) + Query hooks + live WS:
- frontend/app/organizations — org registry (MOD-27): list/create/edit orgs (MDRRMO, BFP, hospitals), org-scoped.
- frontend/app/resources — resource registry (MOD-27): units/equipment with capabilities.
- frontend/app/operations/fleet — unit availability board (MOD-28): live status (AVAILABLE/DISPATCHED/…) via resource.status_changed; filter by org/type/capability.

Acceptance: registries CRUD with RBAC/org scoping; fleet board updates live. Typecheck/lint.
```

## PROMPT 14 — WS-4.7 MOD-41 Escalations board + WS-4.8 MOD-38/39 Hospitals

```
Implement WS-4.7 and WS-4.8 of the Master Completion Plan (Ops Center).

1. MOD-41 Escalations: build an escalation board (SLA breaches from jobs/sla-monitor) with acknowledge/resolve actions; live escalation.created/updated; supervisor-scoped.
2. MOD-38/39 Hospitals: build frontend/app/hospitals — facility registry (MOD-39) + receiving coordination (MOD-38): incoming referrals, bed/status, accept/divert; scoped to Hospital User role (hospital portal). Reflect incident.transporting / facility arrival.

Design-system consistent; never silently fail.

Acceptance: escalations ack/resolve live+audited; hospital users manage referrals and receiving status. Typecheck/lint.
```

## PROMPT 15 — WS-2.6 MOD-34/35/36/40/44 backend workflows

```
Implement WS-2.6 of the Master Completion Plan (backend workflows; keep each audited + emit where stateful):
- MOD-34 Multi-Agency: org-to-org incident participation + BFP coordination endpoints (organizations).
- MOD-35 Mutual Aid: resource request lifecycle (resources/resource-request.dto.ts exists) → POST /v1/resources/requests + approve/deny.
- MOD-36 ICS: incident command roles/sections state on the incident; assign-IC endpoint.
- MOD-40 Transport: destination facility + status timeline (locations + hospitals); emit incident.transporting / incident.facility_arrival.
- MOD-44 Handover: complete backend/src/incidents/incident-handover (from/to responder/facility, timestamp, reason); audit; emit incident.handover.

Acceptance: each endpoint in Swagger, RBAC+org scoped, audited, emits where stateful; unit tests for the state transitions. Typecheck/lint.
```

---

# MILESTONE 4 — Governance & intelligence

## PROMPT 16 — WS-4.9 MOD-53 Announcements publisher + WS-4.15 MOD-46 Audit viewer

```
Implement WS-4.9 and WS-4.15 of the Master Completion Plan (Ops Center).

1. MOD-53 Announcements: build frontend/app/announcements publisher (Announcer role): compose/schedule/publish/archive with category/severity/scope; emits announcement.published; ONE-WAY broadcast only — never a dispatch channel (CLAUDE.md rule 16). Mirror live to the mobile announcements feed.
2. MOD-46 Audit: build frontend/app/audit — a read-only, filterable immutable log viewer (action, actor, entity, date). No edit/delete affordances.

Pearl/green design system (§5.4); EmptyState/Skeleton; RBAC.

Acceptance: publisher publishes (reflected live on mobile); audit viewer filters and is strictly read-only. Typecheck/lint.
```

## PROMPT 17 — WS-4.10 MOD-49 Admin + WS-4.14 MOD-36/34/35/44 command pages

```
Implement WS-4.10 and WS-4.14 of the Master Completion Plan (Ops Center).

1. MOD-49 Admin: frontend/app/administration — user/account management, org configuration, system health (from backend/src/administration + health). Sys-Admin scoped.
2. Command/coordination pages: frontend/app/operations/command (MOD-36 ICS), frontend/app/operations/multi-agency (MOD-34 BFP), mutual-aid requests (MOD-35), and a handover view (MOD-44) — each consuming the WS-2.6 backends, live where stateful.

Pearl/green design system (§5.4); RBAC/org scoping; audited actions reflected live.

Acceptance: admin manages users/orgs/health; command pages drive the MOD-34/35/36/44 workflows end-to-end. Typecheck/lint.
```

## PROMPT 18 — WS-4.11 MOD-50 Analytics + WS-4.12 MOD-51 Risk + WS-4.13 MOD-52 Surge

```
Implement WS-4.11, WS-4.12, WS-4.13 of the Master Completion Plan (Ops Center).

1. MOD-50 Analytics: frontend/app/analytics — response-time, volume by category/barangay, SLA compliance charts (recharts). Follow the docs dataviz guidance; map the chart palette to agap tokens (pearl/green theme); accessible in light theme.
2. MOD-51 Risk: risk heatmap (Leaflet heat layer) from backend/src/risk-intelligence (PostGIS); Bocaue overlays.
3. MOD-52 Surge: frontend/app/operations/surge — activate/deactivate mass-casualty mode, triage tags, resource surge view (backend/src/disaster-mode).

Design-system consistent; loading/empty/error states.

Acceptance: analytics render real aggregates; heatmap shows risk; surge mode toggles and is reflected (banner on dashboard). Typecheck/lint.
```

---

# MILESTONE 5 — Harden & finish

## PROMPT 19 — WS-6 Seed, infra, tests, cleanup

```
Implement WS-6 of the Master Completion Plan.

1. Seed: extend backend/prisma/seed/seed.ts with orgs (MDRRMO, BFP), units with capabilities (MOD-29), hospitals/facilities, demo incidents across all categories, and one account per role for Ops testing.
2. Infra: confirm infrastructure/ (docker/postgres+PostGIS/redis/minio/nginx) supports MOD-22/26/30/51 PostGIS, media bucket, /agap WS upgrade, /.well-known/* passkey routing. Fix config gaps.
3. Tests: add unit tests for all new backend services; ensure the emergency-flow E2E passes; add WS emit assertions. Frontend: component/smoke tests for key pages.
4. SMS backend-first check: verify sms.processor payload format AGAP|INC-…|lat,lng|ts|TYPE|C:Y stays <160 chars and never blocks an incident.
5. Cleanup: fill or delete empty frontend/features/* and unused empty route dirs so the tree matches reality. Document any new env vars in .env.example (placeholders only).

Acceptance: pnpm build + pnpm typecheck + pnpm lint + pnpm test all green across packages; seed produces a demo-able system; E2E green.
```

## PROMPT 20 — Final verification pass

```
Do a full-system verification against docs/AGAP_Master_Completion_Plan.md and docs/AGAP_System_Design_UIUX.md.

1. Walk the per-module Definition of Done checklist for every module touched in M1–M5; update docs/AGAP_Completion_Progress.md with ✅/🟡/🔴.
2. Verify the live loop end-to-end: mobile SOS → backend persists + emits → Ops dashboard/queue/map update live → dispatch recommend+assign → responder assignment+assessment+chat → status→closure, with citizen status screen live throughout. Backend-first SMS enqueued (not device-sent).
3. Confirm guardrails hold: Reporter≠Patient, optional-never-blocks, publicReference everywhere, audit on consequential actions, no sensitive data in logs/SMS, 911/MDRRMO always reachable, ETA labeled "est.", WS failures non-fatal.
4. Report any remaining 🟡/🔴 with the exact file + next step.

Do not change scope — only verify, fix small gaps found, and report.
```

---

## Usage notes

- Run prompts **in order**; M1 must land before M2 (nothing is live until WS-1 + the socket provider exist).
- If a prompt is too large for one session, split by its numbered sub-steps — keep the same acceptance criteria.
- After each prompt, commit with a message like `feat(MOD-XX): <summary>` and run the package's typecheck/lint/tests.
- Keep `docs/AGAP_Completion_Progress.md` updated so you always know what's left.
```
