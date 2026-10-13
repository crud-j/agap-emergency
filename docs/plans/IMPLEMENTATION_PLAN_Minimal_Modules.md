# AGAP — Implementation Plan: Minimal / Scaffold-Only Modules

**Scope:** 7 modules that exist only as backend scaffolding (controller + thin service) with **no working feature and no client UI**.
**Goal:** complete the backend logic where it's a stub, then build the client UI, wiring to the existing route surface (per `CLAUDE.md`).
**Difference vs the Partial plan:** here the backend itself may be incomplete, so each item includes a **backend-hardening** step before the UI.

> Companion doc: `IMPLEMENTATION_PLAN_Partial_Modules.md`. The shared prerequisites there (§0: Ops shell, session context, `api.del`, conventions) apply here too — **do §0 first**.

> Phase alignment (`CLAUDE.md`): most of these are Phase 4–5 (field coordination, risk, surge).

---

## Epic F — Incident collaboration & accuracy

### MOD-26 · Duplicate Incident Detection & Merging
- **Backend (exists):** `DuplicateDetectionService.findNearbyRecent(lat,lng,type)` (called on create but result only logged); `POST /v1/incidents/:id/duplicate`; `POST /v1/dispatch/duplicates/:incidentId/merge`. Seed config `duplicate_detection_radius_meters = 200`.
- **Backend-harden:** on incident create, **persist** candidate duplicates (don't just log) and emit a signal the dashboard can read; add a `GET /v1/incidents/:id/duplicates` (candidates within radius/time) if not present.
- **Build (frontend, dispatcher):** a "Possible duplicate" banner on the incident detail (dispatch + command queue) listing nearby-recent incidents; actions: **Merge** (`dispatch/duplicates/:incidentId/merge` → master) or **Mark duplicate** (`incidents/:id/duplicate`). Show merged incidents collapsed in the queue.
- **Rules:** dedup assists the dispatcher; never auto-merge (Rule 8). Unknown patient/location must not block (Rule 3/5).
- **Effort:** M.

### MOD-33 · Secure Incident Communication (chat)
- **Backend (exists):** `GET/POST /v1/communications/:incidentId`, `PATCH /v1/communications/:incidentId/messages/:messageId/read`; also `GET/POST /v1/incidents/:id/messages`, `PATCH :id/messages/:msgId/read`. `incident_messages` model.
- **Backend-harden:** confirm messages emit a realtime event to the incident room (add `incident.message_created` if missing) so chat is live; enforce participant scoping (dispatcher/supervisor/assigned responder/hospital on that incident only).
- **Build (frontend):** an incident-scoped chat panel on the dispatch/command incident detail (message list + composer + read receipts), live over WS.
- **Build (mobile, responder):** a chat tab on the assignment detail using `communications/:incidentId`.
- **Rules:** incident-scoped, authenticated, least-privilege (Rule 10); no sensitive personal data leakage; attributable (Rule 11).
- **Effort:** M–L.

### MOD-34 · Multi-Agency Coordination
- **Backend (exists):** `GET /v1/incidents/:id/agencies`, `POST /v1/incidents/:id/agencies` (supervisor), `DELETE /v1/incidents/:id/agencies/:orgId` (supervisor); organizations module; BFP is the seeded partner org.
- **Backend-harden:** ensure adding an agency scopes that org's responders/visibility to the incident; emit a realtime update.
- **Build (frontend, supervisor):** an "Agencies" panel on the incident detail — add/remove participating orgs (e.g., BFP for fire/industrial), show each agency's units on the map (reuse `IncidentMap`). 
- **Rules:** org-scoped visibility (Security model step 3); BFP coordination is Bocaue operational context.
- **Effort:** M.

### MOD-36 · Incident Command / ICS Support
- **Backend (exists):** `POST /v1/incidents/:id/ics/activate` (supervisor), `GET /v1/incidents/:id/ics`, `PATCH :id/ics`, `POST :id/ics/positions`, `DELETE :id/ics/positions/:posId`, `POST :id/ics/deactivate`. `incident_command_structures` model.
- **Backend-harden:** complete the ICS state service (positions, assignees, status) if stubbed.
- **Build (frontend):** an ICS panel + a dedicated `frontend/app/(ops)/operations/command/page.tsx` (per CLAUDE map): activate ICS, assign command positions (IC, Ops, Planning, Logistics), org chart view. Supervisor-only.
- **Effort:** M.

---

## Epic G — Resource coordination

### MOD-35 · Resource Request & Mutual Aid
- **Backend (exists):** `POST /v1/resources/request` (dispatcher/supervisor), `PATCH /v1/resources/request/:id/respond` (org-admin/sysadmin).
- **Backend-harden:** add `GET /v1/resources/requests` (list inbound/outbound) if missing; emit realtime on request create/respond.
- **Build (frontend):** a Mutual Aid panel — dispatcher raises a resource request to another org; receiving org-admin approves/declines (`request/:id/respond`). Inbox + outbox views; surface on the fleet/registry page (MOD-27/28).
- **Rules:** inter-org, org-scoped, audited.
- **Effort:** M.

---

## Epic H — Intelligence & surge (Phase 5)

### MOD-51 · Risk Intelligence / Visualization
- **Backend (exists):** `GET /v1/risk-intelligence/heatmap`, `GET /flood-zones`, `GET /areas`, `POST/PATCH/DELETE /areas` (sysadmin), `GET /patterns`. PostGIS available.
- **Backend-harden:** ensure heatmap/flood-zones/patterns return real aggregates from PostGIS (incident density, Bocaue river level, flood-prone barangays: Lolomboy/Bunlo/Igulot/Bambang).
- **Build (frontend):** `frontend/app/(ops)/operations/map` (or a Risk tab) — Leaflet heatmap layer (incident density) + flood-zone polygons + risk-area CRUD (sysadmin). Reuse the `IncidentMap`/Leaflet setup (dynamic import, `ssr:false`). Tie flood zones to the 11.50 m river critical level.
- **Effort:** L.

### MOD-52 · Disaster Surge / Mass-Casualty Mode
- **Backend (exists):** `GET /v1/disaster-mode/status`, `POST /activate` + `/deactivate` (supervisor/sysadmin), `POST /incidents` (supervisor), `POST/GET/PATCH /triage` (START/mass-casualty tags), `GET /resources`, `POST /broadcast`.
- **Backend-harden:** complete surge state + triage-tag logic if stubbed.
- **Build (frontend):** `frontend/app/(ops)/operations/surge/page.tsx` (per CLAUDE map) — activate/deactivate surge mode (supervisor), mass-casualty incident board, triage-tag counts (RED/YELLOW/GREEN/BLACK), resource overview, and broadcast composer. Surge banner across the Ops shell when active.
- **Build (mobile, responder):** START triage tagging screen using `disaster-mode/triage` (POST/PATCH) for field mass-casualty tagging.
- **Rules:** fireworks-industry explosion (Bundukan/Biñang) is the real mass-casualty scenario; broadcast ≠ MOD-53 announcements.
- **Effort:** L.

---

## Sequencing (recommended)

| Phase | Modules | Rationale |
|---|---|---|
| **1** | MOD-26 | Improves dispatch accuracy; small, high value |
| **2** | MOD-33 | Secure comms unlocks field coordination |
| **3** | MOD-34, MOD-35, MOD-36 | Multi-agency + mutual aid + ICS (Phase 4 field coordination) |
| **4** | MOD-51 | Risk visualization (Phase 5) |
| **5** | MOD-52 | Surge / mass-casualty mode (Phase 5, depends on 51 map + 34 agencies) |

## Per-module definition of done
1. **Backend hardened** — service returns real data (not a stub), scoped by role + org, emits realtime where collaborative, and is unit-tested.
2. **Client UI** built on the Ops shell / mobile, RBAC-gated, wired to the listed endpoints, live over WS where applicable.
3. `typecheck` + `next build` (frontend) and mobile `typecheck` clean; emergency-flow E2E green.
4. Honors non-negotiables: no autonomous dispatch, least-privilege, auditable, no internal IDs exposed, 911/MDRRMO complementary.
