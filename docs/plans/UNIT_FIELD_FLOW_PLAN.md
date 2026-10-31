# Plan: Unit-Specific Field Flow (Fire Truck and Rescue Boat)

> **Status (2026-10-31):** Phases 0–3 done and reviewed (Phase 3 review: 2026-10-31, one mobile fix). Phase 4 (rescue boat / truck) is done; next: Prompt R for Phase 4 (in a fresh chat), then P3-F1 and Prompt 5. D1 (OK, provisional until BFP Bocaue confirms the alarm terms), D3, D4 and D5 are answered. D2 answered 2026-10-31 (OK + clarifications: age cutoffs, an optional families count; terms to confirm with MDRRMO Bocaue). **Blocker for every multi-unit walkthrough:** a second unit can't be dispatched to an incident today (see Phase 3, finding P3-F1).
> **Problem:** every responder gets the ambulance crew's on-scene tools, whatever unit they are on. A BFP fire truck crew and an MDRRMO rescue boat crew can't report what they actually do, and they see buttons that don't apply to them.
> **Approach:** keep **one** `RESPONDER` role, **one** responder app and **one** backend (CLAUDE.md: "Do not create separate backends per role or client surface"). The **dispatched unit's `resource_type`** decides which on-scene inputs and outputs the crew gets.
> **Run it:** use [UNIT_FIELD_FLOW_PROMPTS.md](UNIT_FIELD_FLOW_PROMPTS.md): the full context briefing (Part A), the decisions sheet you fill in (Part B), the working protocol (Part C) and one Copilot prompt per phase plus a review prompt (Part D).
> **Checked against the code:** 2026-10-31, `main` @ `2acafa5` + the uncommitted Phase 4 automation work. Every finding below has a file reference; re-check them in Phase 0 if the code has moved.

| Phase | What | Modules | Needs from a human first |
|---|---|---|---|
| 0 | Decisions + prove the multi-unit defects with failing tests | — | D1–D5 below |
| 1 | **Multi-unit safety** (prerequisite): one unit can't end or block another | MOD-15, MOD-32, MOD-40 | D4 |
| 2 | Shared unit→flow map, server rules, medical-profile scoping | MOD-32, MOD-47, MOD-48 | D3 |
| 3 | **Fire truck** Input/Output | MOD-32, MOD-34, MOD-36 | D1 (BFP review of the fields) |
| 4 | **Rescue boat / truck** Input/Output | MOD-32, MOD-52 | D2 |
| 5 | Ops web view, docs, walkthrough | MOD-21, MOD-23 | — |

Run the phases in order. Phase 1 comes first because a fire truck and an ambulance on the same incident is the normal case in Bocaue (fireworks fires in Bundukan and Biñang 1st), and today that case is unsafe (F5).

---

## Current vs target (Input → Process → Output)

| Unit | Input today | Output today | Input target | Output target |
|---|---|---|---|---|
| Ambulance | Patient assessment (vitals, GCS, triage) | Assessment, hospital transport, handover | *(unchanged)* | *(unchanged)* |
| Fire truck | The patient form only | "Transporting" to a hospital (wrong); nothing on the fire | Fire size-up report: alarm level, fire status, hazards, exposures, casualty count; patient form kept for casualties | Fire status card and timeline for ops, BFP shown as a participating agency, "need ambulance / more units" request to the dispatcher. No transport button |
| Rescue boat / truck | The patient form only | Only hospital transport; nothing on people rescued | Rescue trip log: people rescued, still waiting, vulnerable counts, water level, where they were taken | Running totals for ops (rescued / still waiting), feeds surge mode by barangay, "need ambulance" request |

The **Process** (accept → en route → on scene → finish) stays shared.

---

## Findings (checked 2026-10-31)

- **F1. One role, routed by role only.** `UserRole` has only `RESPONDER`; `mobile/app/responder/_layout.tsx` checks `user.role !== UserRole.RESPONDER` and nothing else. Seed: `responder1`/`responder2` (MDRRMO), `responder3` (BFP) in `backend/prisma/seed/seed.ts:94-135`.
- **F2. The unit type reaches the phone but is unused.** `getMyAssignments` / `getAssignment` include `resources: true` (`backend/src/responders/responders.service.ts:254-282`); the mobile type has `resource_type` (`mobile/src/services/api/responders.api.ts:38`). No screen branches on it.
- **F3. Every unit gets "Transporting" and "Treating on Scene".** `nextAssignmentActions` (`mobile/src/lib/assignment-progress.ts:53`) returns both for `ON_SCENE`, for any unit.
- **F4. Field input is patient-only.** `SubmitAssessmentDto` (`backend/src/incidents/assessment/dto/submit-assessment.dto.ts`) and `on_scene_assessments` (`schema.prisma:1066`) hold vitals, GCS, triage and injuries. There is no table for a crew's observation of a fire or a rescue. The caller's intake answers have `fire_spreading`, `water_level_note` and `people_affected` (`incident_details`, `schema.prisma:836`), but those are the **caller's** report, not the crew's.
- **F5. Multi-unit incidents are unsafe** (read in code; Phase 0 proves each with a failing test):
  - **a. One crew's Resolve ends every unit.** `applyStatus` (`responders.service.ts:386+`) checks for an open transport on **this crew's** dispatch only (`openTransportWhere({ dispatch_id: dispatchId })`), then completes **every** active dispatch on the incident. A fire crew finishing while the ambulance is transporting moves the incident to `RESOLVED` and ends the ambulance's dispatch mid-transport.
  - **b. "Treating on Scene" by one unit blocks another's transport.** `ON_SCENE → ASSISTING` is allowed, but a transport can start only from `ON_SCENE` or `TRANSPORTING` (`backend/src/incidents/transport/transport.service.ts:284`). If the fire crew taps "Treating on Scene" first, the ambulance can't start its transport.
  - **c. The second unit can't record its own arrival.** Progress lives on the **incident** status. Once the first unit is `ON_SCENE`, a second unit's `EN_ROUTE` is refused (`ON_SCENE → EN_ROUTE` is not in `INCIDENT_STATUS_TRANSITIONS`, `shared/src/enums/incident-status.enum.ts:90`). `dispatches` has no per-unit `en_route_at` / `on_scene_at` (`schema.prisma:677`).
- **F6. Medical profiles aren't scoped to the incident.** `GET /v1/medical-profiles/:userId` allows any `RESPONDER` (`backend/src/medical-profiles/medical-profiles.controller.ts:62`). `findForResponder` (`medical-profiles.service.ts:99`) checks consent and logs the access, but not that the responder is crewed on an incident where that user is the reporter or a patient. No mobile screen calls it today.
- **F7. Dispatching a BFP unit doesn't add BFP to the incident.** Nothing in `backend/src/dispatch` writes `incident_agency_participants`; MOD-34 participants are only added by hand (`incidents.service.ts:1101`, `addAgency`).
- **F8. Hospital-only transport.** A transport destination must be a `HOSPITAL` facility (`backend/src/hospitals/destination-rules.ts:47`). A rescue boat dropping people at an evacuation center can't record it through transport. (`EVACUATION_CENTER` exists as a facility type, and `TRANSPORTED_TO_EVACUATION_CENTER` exists as a closure outcome, `create-resolution.dto.ts:7`.)
- **F9. Requests for more help exist, but only for dispatchers.** MOD-35 resource requests (`POST /v1/resources/requests`) are Dispatcher/Supervisor only. A crew has no way to ask for an ambulance or another unit except by radio.

---

## Rules for every phase

1. **Read first:** `CLAUDE.md`, this plan's Findings and the phase's "Read first" files. Check every path and symbol before editing; if the code moved, follow the code and note it in the Progress log.
2. **Guardrails:**
   - A crew's report never dispatches, cancels, closes or escalates by itself. Requests for help go to a dispatcher, who decides (CLAUDE.md rule 8).
   - Optional field data never blocks a status step (rule 5). Finishing without a fire or rescue report is allowed, with a confirm dialog.
   - A failed realtime emit, notification or audit write never undoes the report or the status change (existing `try/catch` + `this.logger` pattern).
   - **Counts only, no names,** in fire and rescue reports. Free-text notes are treated like assessment notes: never in a WebSocket payload, push body or SMS.
3. **Conventions:** routes are `/v1/…`; event names only in `shared/src/events/*.events.ts`, payload types in `websocket-event.types.ts`; ops events via `RealtimeService` inside `this.safe(...)`; staff notices via `NotificationsService.create(...)` with `findEscalationRecipients`; audit via `AuditService.log({ … moduleId })`; DTOs with class-validator; `@Roles(...)` guards; crew checks reuse the existing "crewed on an active dispatch" query (`assessment.service.ts:29-36`, `assertCrewMember`).
4. **One source per concept:** the unit→flow map, fire statuses, alarm levels, hazard codes and water levels live once in `shared/src/constants/`. After a `shared/src` edit run `cd shared && pnpm build` (backend and frontend read `shared/dist`). Edit only `.ts` files in `shared/src/constants/`.
5. **Migrations:** hand-written SQL in `backend/prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql`, matching `schema.prisma`, then `pnpm prisma migrate deploy && pnpm prisma generate`. **Never** `migrate dev` or `migrate reset`. After a migration, run `pnpm test:e2e:db` before `pnpm test:e2e`.
6. **Verify:** `pnpm typecheck` in each touched package; `cd backend && npx jest --config ./test/jest.config.ts --testTimeout=30000`; `cd mobile && npx jest`; `cd frontend && npx jest` if touched; `cd backend && pnpm test:e2e`. Restore `frontend/tsconfig.tsbuildinfo` after a frontend typecheck. Don't start a second backend (the user's watch-mode instance shares Redis).
7. **Don't commit.** Fill in the Progress log and update the `docs/100%ModulesFunctionalities+AdditionalModules.md` rows, marked **walkthrough pending**.

---

## Phase 0 — Decisions and proof

**Decisions (the user answers; record them in the Progress log):**

- **D1. Fire report fields.** Proposed default, to confirm with BFP Bocaue:
  - alarm level: `FIRST` … `FIFTH`, `TASK_FORCE_ALPHA` … `TASK_FORCE_ECHO`, `GENERAL` (BFP alarm terms; confirm the exact list BFP Bocaue uses);
  - fire status: `ACTIVE`, `UNDER_CONTROL`, `FIRE_OUT`;
  - structures involved (count) and occupancy type (`RESIDENTIAL`, `COMMERCIAL`, `INDUSTRIAL`, `GRASS_OR_VEHICLE`, `OTHER`);
  - hazards (multi): `FIREWORKS_EXPLOSIVES`, `LPG`, `CHEMICALS`, `LIVE_WIRES`, `STRUCTURAL_COLLAPSE`;
  - spreading to neighbours (yes/no); evacuation of the area needed (yes/no);
  - casualties seen (count), trapped persons (count);
  - notes.
- **D2. Rescue trip fields.** Proposed default:
  - people rescued this trip (count); of them children, elderly, PWD, pregnant (counts);
  - people still waiting at this location (estimate, may be blank);
  - water level: `ANKLE`, `KNEE`, `WAIST`, `CHEST`, `ABOVE_HEAD`; access: `BOAT_ONLY`, `HIGH_VEHICLE`, `PASSABLE`;
  - taken to: an `EVACUATION_CENTER` facility, `HANDED_TO_AMBULANCE` (on scene), `STAYED` (refused or safe), `OTHER` (text);
  - notes.
- **D3. Which units get which flow.** Proposed: `AMBULANCE` → `MEDICAL_TRANSPORT`; `FIRE_TRUCK` → `FIRE`; `RESCUE_BOAT`, `RESCUE_TRUCK` → `RESCUE`; `MOTORCYCLE_RESPONDER` → `MEDICAL_FIRST` (assessment, no transport); `CLEARING_EQUIPMENT`, `COMMAND_VEHICLE`, `OTHER` → `GENERAL` (notes and finish only). Also: may a `RESCUE_TRUCK` transport a patient to a hospital in an emergency? Proposed: no; it requests an ambulance.
- **D4. How the incident status moves with several units.** Proposed:
  - each unit's progress is kept on its own dispatch (`en_route_at`, `on_scene_at`, `field_done_at`);
  - the incident moves **forward only**, to the furthest step any unit has reached (first `EN_ROUTE`, first `ON_SCENE`);
  - only units with the `MEDICAL_TRANSPORT` flow move it to `TRANSPORTING`; "Treating on Scene" (`ASSISTING`) is offered only to medical units;
  - a crew's **Finish** completes its own dispatch; the incident moves to `RESOLVED` only when the **last** active dispatch finishes (a dispatcher can still resolve as an override, as today).
  - Alternative to decide: also allow `ASSISTING → TRANSPORTING` in `INCIDENT_STATUS_TRANSITIONS` (treated on scene, then needs transport).
- **D5. Auto-add the unit's organization to the incident's agencies (F7)** when a unit of another organization is dispatched? Proposed: yes, with `role_in_incident` = the unit type, audited.

**Proof:** add failing specs (skipped with a clear `it.todo`/`it.failing` marker, or kept in a branch of the spec, so the suite stays green) that reproduce F5a, F5b and F5c with two crews on one incident. Phase 1 turns them green.

**Done when:** D1–D5 are answered in the Progress log, and F5a–c are each reproduced by a test.

---

## Phase 1 — Multi-unit safety (MOD-15, MOD-32, MOD-40)

**Read first:** `backend/src/responders/responders.service.ts` (`applyStatus`, `STATUS_TO_INCIDENT`, `RESPONDER_STATUS_STEP`, `assertCrewMember`), `backend/src/incidents/transport/transport.service.ts` (`beginTransport`), `backend/src/incidents/incident-status/` (`recordTransition`), `shared/src/enums/incident-status.enum.ts`, `mobile/src/lib/assignment-progress.ts`, `mobile/app/responder/assignment/[id].tsx`.

1. **Migration** `…_dispatch_field_progress`: `dispatches.en_route_at`, `on_scene_at`, `field_done_at` (`timestamptz`, nullable). Backfill nothing (old dispatches keep null).
2. **`applyStatus`** (per D4):
   - `EN_ROUTE` / `ON_SCENE`: always stamp this dispatch. Move the incident only if it is behind that step; otherwise return success without an incident transition (no 409 for the second unit).
   - `RESOLVED` from a crew: stamp `field_done_at`, complete **this** dispatch, free **this** unit. If another dispatch on the incident is still active, the incident status is unchanged and an incident event records "<call sign> finished". If it was the last, keep today's path (transition to `RESOLVED`, existing open-transport check).
   - The open-transport check for the incident-level `RESOLVED` covers **every** dispatch of the incident, not only the caller's.
   - `ASSISTING` and `TRANSPORTING` per D4 (Phase 2 adds the unit-type rule; here only the "last unit resolves" and "forward only" rules).
3. **Mobile:** `nextAssignmentActions` reads this crew's progress from the dispatch (`en_route_at`, `on_scene_at`) first, and the incident status second, so the second unit sees "Mark On Scene" for itself. Its `Mark Resolved` text says "Finish (your unit)" when other units are still active.
4. **Realtime:** reuse `dispatch.updated` for the per-unit stamps (no new event).

**Tests:** `backend/test/responders/multi-unit.spec.ts`: two crews on one incident:
- the fire crew finishing while the ambulance transports leaves the incident `TRANSPORTING` and the ambulance's dispatch `ACCEPTED`;
- the last crew finishing resolves the incident and completes only what is still active;
- a second unit's `EN_ROUTE`/`ON_SCENE` succeeds and stamps its own dispatch without moving the incident back;
- the open-transport check covers any crew's transport.
Mobile: `assignment-progress` cases for a second unit. The Phase 0 failing tests now pass.

**Done when:** the tests pass; the e2e emergency flow is green; a two-crew walkthrough (ambulance + fire truck on one incident) is listed for a person.

---

## Phase 2 — Unit→flow map, server rules, medical scoping (MOD-32, MOD-47, MOD-48)

**Read first:** `shared/src/constants/index.ts`, `backend/src/medical-profiles/*`, `backend/src/incidents/transport/transport.service.ts`, `mobile/src/lib/assignment-progress.ts`.

1. **`shared/src/constants/unit-field-flow.ts`:** `UNIT_FIELD_FLOWS` (`MEDICAL_TRANSPORT | MEDICAL_FIRST | FIRE | RESCUE | GENERAL`) and `fieldFlowFor(resourceType)` per D3. Export it from the constants index; rebuild shared.
2. **Server rules** (the app hides buttons, the server enforces):
   - `TRANSPORTING` only for `MEDICAL_TRANSPORT` units; others get `409 { code: 'TRANSPORT_NOT_FOR_UNIT' }`.
   - `ASSISTING` only for `MEDICAL_*` units (per D4).
   - A dispatcher's own transport and status routes are unchanged.
3. **Mobile:** `nextAssignmentActions` takes the flow. `ON_SCENE` actions:
   - `MEDICAL_TRANSPORT`: as today (Transporting, Treating on Scene); from `ASSISTING` it can still start Transporting (D4);
   - `MEDICAL_FIRST`: "Treating on Scene" + "Finish" + "Request help";
   - `FIRE`: "Fire report" (primary), "Finish" + "Request help";
   - `RESCUE`: "Log rescue trip" (primary), "Finish" + "Request help";
   - `GENERAL`: "Finish" + "Request help".
   **Every flow has Finish**, or the crew is stuck at the scene (rule 2: a missing report never blocks a status step). "Assess casualty" is the existing "On-Scene Assessment" link on the assignment screen, shown for every unit; it is not an ON_SCENE button.
   The assignment header shows the unit type ("BFP Fire Truck 1 · Fire unit").
4. **Medical profile scoping (F6):** `findForResponder` refuses (403) unless the responder is crewed on an active dispatch of an incident whose reporter or a patient is that user. The access log's `purpose` names the incident reference. Dispatcher/Supervisor access is unchanged. Audit the refusal.
5. **Crew help request (F9):** `POST /v1/responders/assignments/:id/help-request` `{ need: 'AMBULANCE' | 'FIRE_UNIT' | 'RESCUE_UNIT' | 'MORE_PERSONNEL', count?, note? }` → one IN_APP notice to on-duty Dispatchers (`findEscalationRecipients`), an incident event and an ops event. It never creates a dispatch or a MOD-35 request; the dispatcher does (rule 8). Dedup per incident + need for 5 minutes.

**Tests:** `fieldFlowFor` covers every `resource_type`; transport refused for a fire truck, allowed for an ambulance; medical profile refused off-incident and allowed on it (with the access log purpose); the help request notifies dispatchers, dedups, creates no dispatch. Mobile: actions per flow.

**Done when:** a fire truck crew no longer sees Transporting, and the server refuses it; the medical route is incident-scoped; a help request reaches the dispatcher bell.

---

## Phase 3 — Fire truck Input/Output (MOD-32, MOD-34, MOD-36)

**Read first:** `backend/src/incidents/assessment/assessment.service.ts` (the crew check, audit and realtime pattern to copy), `frontend/components/incidents/IncidentDetailDrawer.tsx` (how assessments are shown), `backend/src/incidents/incidents.service.ts` (`addAgency`).

1. **Constants** (shared): `FIRE_ALARM_LEVELS`, `FIRE_STATUSES`, `FIRE_OCCUPANCY_TYPES`, `FIRE_HAZARDS` per D1, with labels.
2. **Migration** `…_fire_field_reports`: `fire_field_reports` (id, incident_id, dispatch_id, reported_by_id, alarm_level, fire_status, structures_involved, occupancy_type, hazards `text[]`, spreading, evacuation_needed, casualties_seen, trapped_persons, notes, reported_at). Append-only: each report is a new row, the latest is the current picture.
3. **`POST /v1/incidents/:id/fire-report`** (Responder, crewed on an active dispatch of a `FIRE` unit; Dispatcher/Supervisor may also file one from radio). Every field optional. Audit (`fire_field_report`, `MOD-36`). Emit `incident.field_report` `{ incidentId, kind: 'FIRE', fireStatus, alarmLevel, hazards, casualtiesSeen, trappedPersons }` (no notes) to the ops room.
4. **Alerts to people, not actions:**
   - `FIREWORKS_EXPLOSIVES` or `trapped_persons > 0` or alarm level ≥ the D1 threshold → IN_APP notice to Dispatchers and Supervisors ("consider ambulance / surge"). No automatic dispatch or surge (rule 8; surge stays a person's decision).
   - `casualties_seen > 0` with no ambulance dispatched → the same notice suggests an ambulance.
5. **MOD-34 (D5):** dispatching a unit of another organization adds that organization to `incident_agency_participants` (idempotent, audited).
6. **Mobile:** `mobile/app/responder/fire-report/[id].tsx`: chips and steppers, big targets, works offline through the existing outbox pattern (`transport-outbox`) with a client request ID; the assignment screen shows the latest fire status. "Finish" shows a confirm if the latest status isn't `FIRE_OUT` (never blocks).
7. **Web:** the incident drawer gets a **Fire** card: latest status, alarm level, hazards, counts, time and history. The incident queue row shows a fire-status badge.

**Tests:** DTO validation (all optional, enums from shared); crew check (a non-fire unit is refused, an off-incident responder is refused); append-only; the event payload has no notes; the notices fire on fireworks/trapped/casualties and never dispatch; the agency is added once. Mobile: the form builds the right body and queues offline.

**Done when:** a BFP crew can file and update a fire report from the phone; ops sees it live in the drawer; BFP shows as a participating agency; no Transporting button for a fire truck.

---

## Phase 4 — Rescue boat / truck Input/Output (MOD-32, MOD-52)

**Read first:** Phase 3's files, `backend/src/disaster-mode/` (surge page data), `backend/src/facilities/` (evacuation centers).

1. **Constants** (shared): `WATER_LEVELS`, `RESCUE_ACCESS`, `RESCUE_TAKEN_TO` per D2.
2. **Migration** `…_rescue_trip_reports`: `rescue_trip_reports` (id, incident_id, dispatch_id, reported_by_id, rescued_count, children, elderly, pwd, pregnant, still_waiting, water_level, access, taken_to, taken_to_facility_id → `facilities` (must be `EVACUATION_CENTER`), taken_to_other, notes, reported_at). One row per trip.
3. **`POST /v1/incidents/:id/rescue-trip`** (Responder on an active `RESCUE` unit; Dispatcher/Supervisor from radio). Audit (`rescue_trip_report`, `MOD-32`). `GET /v1/incidents/:id/rescue-summary` → totals (rescued, vulnerable counts, latest still-waiting, per destination).
4. **Output:**
   - ops event `incident.field_report` (`kind: 'RESCUE'`, counts and destination name only);
   - `still_waiting > 0` on the crew's **Finish** → IN_APP notice to Dispatchers ("people still waiting at INC-…: send another unit?");
   - `HANDED_TO_AMBULANCE` with no ambulance dispatched → notice suggesting one;
   - **surge (MOD-52):** while a surge is active, the surge page shows rescued / still waiting per barangay from these rows.
5. **Mobile:** `mobile/app/responder/rescue-trip/[id].tsx`: big steppers for counts, water level chips, an evacuation center picker (active `EVACUATION_CENTER` facilities, nearest first by `haversineMeters`), offline outbox. The assignment screen shows the running totals ("12 rescued · ~5 waiting"). "Finish" confirms when still-waiting > 0.
6. **Web:** drawer **Rescue** card (totals, trips, destinations); queue badge "12 rescued".

**Tests:** counts validated (≥ 0, vulnerable ≤ rescued); the destination must be an active evacuation center; summary totals; the still-waiting notice on Finish; surge per-barangay totals; no names anywhere in payloads. Mobile: the form and the outbox.

**Done when:** a rescue boat crew logs trips from the phone; ops sees totals live; a surge shows rescued/waiting by barangay; no Transporting button for a boat.

---

## Phase 5 — Ops view, docs, walkthrough (MOD-21, MOD-23)

1. Dispatcher dashboard: per-unit progress on the incident (which unit is en route, on scene, finished) from Phase 1's stamps.
2. Docs: update `docs/modules/MOD-32_Responder_Ambulance_Crew_Mobile_Interface.md` (rename the scope to all unit types; add the flow map), MOD-34, MOD-36, MOD-37, MOD-52, and the `docs/100%ModulesFunctionalities+AdditionalModules.md` rows (walkthrough pending).
3. Seed: crew `responder3` (BFP) on a demo fire incident with `BFP Fire Truck 1`, and `responder2` on a demo flood incident with `MDRRMO Rescue Boat 1`, so each flow can be walked through.

**Walkthroughs (a person, on devices):**
- Fireworks fire: BFP truck + ambulance on one incident; fire reports update the drawer; the fire crew finishes first and the ambulance's transport continues.
- Flood rescue in Lolomboy: two boat trips to an evacuation center; totals on the drawer and the surge page; finishing with people waiting alerts the dispatcher.
- Offline: file a fire report and a rescue trip with data off; both arrive once on reconnect.

---

## Out of scope (note, don't build)

- Evacuation center occupancy and capacity tracking (MOD-27/39 territory).
- Citizen-facing per-unit status (MOD-42): the citizen keeps seeing the incident status.
- SMS of fire or rescue reports to the MDRRMO ops phone.
- A crew roster linking responders to units outside a dispatch (see AUTOMATION_NEEDS_PLAN C5).

---

## Progress log

Fill in one row when a phase ends. Put details and deviations below the table, under a heading per phase.

| Phase | Date | Result | Deviations from this plan | Still needs a person / device |
|---|---|---|---|---|
| 0 | 2026-10-31 | Complete; F1–F9 confirmed, F5a–c reproduced | — | — |
| 1 | 2026-10-31 | Complete; multi-unit dispatch progress and forward-only responder status implemented and verified | Added the required per-dispatch migration and updated existing compatibility fixtures for the approved `ASSISTING → TRANSPORTING` transition. | Two-crew ambulance + fire-truck walkthrough |
| 2 | 2026-10-31 | **Complete** (after Prompt 2b). Flow map, server rules, medical scoping, the help-request route and the phone's "Request help" button are in | Fire/rescue buttons are placeholders (Alert "Phase 3/4"). Review fixes R1–R9 below. Prompt 2b: a modal chooser instead of an `Alert` (Android shows at most 3 `Alert` buttons) | Two-crew walkthrough; fire/rescue placeholders and Request help on a device; Filipino strings checked by a person |
| 3 | 2026-10-31 | Complete and reviewed (fix P3-R1: fire crew keeps Fire Report while another unit transports): fire reports (API, phone form with offline outbox, drawer card, queue badge, notices) and D5 agency auto-add | Fire reports share the transport outbox (a new item kind) instead of a copy; codes stored as text, not enums (D1 is provisional); `addAgency`'s body moved into one helper; manual "Add agency" is now idempotent. **Finding P3-F1:** a second unit can't be dispatched (not fixed; outside the phase) | Fire report walkthrough on a device (online and offline); BFP Bocaue to confirm D1; P3-F1 decision before the two-crew walkthrough |
| 4 | 2026-10-31 | Complete: rescue trip log (API, phone form with offline outbox, evacuation-center picker, running totals), drawer Rescue card, queue badge, surge per-barangay totals, still-waiting and ambulance notices | D2 clarifications added (families count, age cutoffs). Shared crew-report helpers extracted from Phase 3 instead of a second copy. New `GET /v1/facilities/evacuation-centers` (responders can't read `/facilities`). Notice type `RESCUE_AMBULANCE_SUGGESTED` named here (the prompt named only `RESCUE_PEOPLE_WAITING`). Surge totals ride the existing `GET /disaster-mode/status` | Rescue trip walkthrough on a device (online and offline); MDRRMO Bocaue to confirm the D2 water-level and access terms; surge page with a live surge; P3-F1 still blocks two-crew walkthroughs |
| 5 | | | | |

### Phase 0 — 2026-10-31

- **Result:** Findings F1–F9 confirmed against the current code. F5a, F5b and F5c are reproduced in [backend/test/responders/multi-unit.spec.ts](../../backend/test/responders/multi-unit.spec.ts) with `it.failing(...)`; all three currently pass as expected because the correct-behaviour assertions fail against the existing implementation.
- **F1 confirmed:** `UserRole.RESPONDER` is the only responder role used by the responder route guard in [mobile/app/responder/_layout.tsx](../../mobile/app/responder/_layout.tsx) (role check at line 28); seeded MDRRMO and BFP users all use `user_role.RESPONDER` in [backend/prisma/seed/seed.ts](../../backend/prisma/seed/seed.ts) (lines 94–135).
- **F2 confirmed:** [RespondersService.getMyAssignments](../../backend/src/responders/responders.service.ts) and `getAssignment` include `resources: true` (lines 254–282), and [mobile/src/services/api/responders.api.ts](../../mobile/src/services/api/responders.api.ts) exposes `AssignmentResource.resource_type` (line 38); no responder flow branches on that value.
- **F3 confirmed:** [mobile/src/lib/assignment-progress.ts](../../mobile/src/lib/assignment-progress.ts) returns both `TRANSPORTING` and `ASSISTING` actions for every accepted assignment at `ON_SCENE` (lines 53–57).
- **F4 confirmed:** [backend/src/incidents/assessment/dto/submit-assessment.dto.ts](../../backend/src/incidents/assessment/dto/submit-assessment.dto.ts) contains patient assessment fields only (lines 14–75), and [backend/prisma/schema.prisma](../../backend/prisma/schema.prisma) defines only patient assessment data in `on_scene_assessments` (lines 1066–1090); caller-only fire/water answers remain in `incident_details` (lines 836–846).
- **F5a confirmed:** [RespondersService.applyStatus](../../backend/src/responders/responders.service.ts) checks an open transport only for the resolving crew's dispatch (lines 440–452), then queries and completes every active dispatch on the incident (lines 461–488). The first proof test asserts that the ambulance must not be completed.
- **F5b confirmed:** [TransportService.beginTransport](../../backend/src/incidents/transport/transport.service.ts) permits only `ON_SCENE` or `TRANSPORTING` (lines 284–291), so `ASSISTING` rejects the ambulance transport proof.
- **F5c confirmed:** [INCIDENT_STATUS_TRANSITIONS](../../shared/src/enums/incident-status.enum.ts) allows `ON_SCENE` to move only to `TRANSPORTING`, `ASSISTING` or `RESOLVED` (lines 90–95); [dispatches](../../backend/prisma/schema.prisma) has no per-dispatch field-progress timestamps (lines 677–699). The proof test asserts the second unit can report both steps.
- **F6 confirmed:** [medical-profiles.controller.ts](../../backend/src/medical-profiles/medical-profiles.controller.ts) permits any responder to call `GET :userId` (lines 62–71), while [medical-profiles.service.ts](../../backend/src/medical-profiles/medical-profiles.service.ts) checks consent and logs access but does not check incident crew membership (lines 99–124).
- **F7 confirmed:** [DispatchService.create](../../backend/src/dispatch/dispatch.service.ts) creates the dispatch, resource update and incident status transition (lines 68–111) but does not create an `incident_agency_participants` row; agency creation exists separately in [incidents.service.ts](../../backend/src/incidents/incidents.service.ts) `addAgency` (lines 1101–1121).
- **F8 confirmed:** [destination-rules.ts](../../backend/src/hospitals/destination-rules.ts) rejects every facility whose type is not `HOSPITAL` (lines 42–49), so evacuation centers cannot be transport destinations.
- **F9 confirmed:** [resources.controller.ts](../../backend/src/resources/resources.controller.ts) restricts `POST /requests` to `DISPATCHER` and `SUPERVISOR` (lines 78–85); no responder help-request route exists.
- **Verification:** Backend baseline before edits: 87 suites / 1,406 tests passed. Focused Phase 0 spec after edits: 1 suite / 3 tests passed (`it.failing` expected-failure semantics). No production code, migration, Part B decision, or module implementation was changed.
- **Decisions and devices:** D1–D5 remain unanswered as required; Part B is untouched. No device or human walkthrough was needed for Phase 0, but BFP/human confirmation is still required before the later fire-field phase.

### Phase 1 — 2026-10-31

- **Step 1 — migration:** Added and applied `20261031010000_dispatch_field_progress`, adding nullable `en_route_at`, `on_scene_at`, and `field_done_at` timestamptz columns to `dispatches`; no backfill was performed. Prisma client was regenerated and both development and e2e migration status are up to date.
- **Step 2 — backend:** Extended [RespondersService](../../backend/src/responders/responders.service.ts) to stamp each dispatch, advance the incident only when its lifecycle is behind, finish only the caller's dispatch while other units remain active, and resolve only after the last active dispatch. The final resolve open-transport check now scopes to the entire incident. `ASSISTING → TRANSPORTING` is allowed through the existing status service and transport path.
- **Step 3 — mobile:** Extended [assignment-progress.ts](../../mobile/src/lib/assignment-progress.ts) to prefer this dispatch's stamps over incident status and show `Finish (your unit)` when other active units remain. Assignment responses now provide per-dispatch timestamps and active dispatch count.
- **Step 4 — realtime:** Reused `dispatch.updated`; its payload now optionally carries `enRouteAt`, `onSceneAt`, and `fieldDoneAt`. No new event was added.
- **Tests:** Converted all three Phase 0 proofs to plain `it(...)`; added last-unit resolve, cross-dispatch open-transport, single-unit compatibility, and second-unit mobile action coverage. Updated existing tests for the approved `ASSISTING → TRANSPORTING` behavior and expanded mocks for per-dispatch active-count reads.
- **Verification:** Backend baseline 88 suites / 1,409 tests → 88 / 1,412 passed. Mobile baseline 9 suites / 98 tests → 9 / 99 passed. Backend and mobile typechecks passed; shared build passed; e2e database preparation and emergency-flow e2e passed 1/1.
- **Inventory/deviations:** Existing responder status, transport, realtime, and mobile action paths were extended; no duplicate builders or events were created. The plan's D3 and D4 answers are `OK`; D1, D2, and D5 remain blank. No production dependencies were added.
- **Walkthrough:** A person still needs to exercise one incident with an ambulance and fire truck, confirming independent en-route/on-scene/finish progress and that the ambulance transport remains active when the fire crew finishes.

### Phase 2 — 2026-10-31

- **Step 1 — shared flow map:** Added `UNIT_FIELD_FLOWS` and `fieldFlowFor` in
  `shared/src/constants/unit-field-flow.ts`, covering every current Prisma
  `resource_type` and mapping unknown values to `GENERAL`. Added the shared
  notification event-type constant and rebuilt `shared`.
- **Step 2 — server enforcement:** Responder transport and treating-on-scene
  actions now enforce the unit flow and return structured 409 errors for
  unsupported unit actions. Dispatcher transport routes remain unchanged.
- **Step 3 — medical scoping:** Responder medical-profile access now requires an
  active dispatch crewed by the accessor on an incident where the target is the
  reporter or a patient. Denials are audited; successful sensitive-data access
  purposes include the incident public reference. Dispatcher and supervisor
  behavior remains unchanged.
- **Step 4 — help request:** Added `POST /v1/responders/assignments/:id/help-request`.
  It deduplicates by incident and need for five minutes, notifies dispatchers,
  writes an incident event, emits an ops incident update, and never creates a
  dispatch or resource request. Notes are excluded from notification, realtime,
  and audit payloads.
- **Step 5 — mobile and web:** Assignment headers show unit type and
  `nextAssignmentActions` now receives the shared flow. Fire-condition and
  rescue-trip actions are explicit Phase 3/4 placeholders. The operations
  notification bell routes `CREW_HELP_REQUESTED` to the incident dispatch view.
- **Tests/verification:** Mobile 9 suites / 99 tests → 9 / 111 passed;
  frontend 7 suites / 140 tests passed; backend focused Phase 2 regressions
  passed (17 tests), with the full 88-suite run reaching 1,411 passed and one
  unrelated transient MFA timeout; that suite passed on immediate retry (59/59).
  Backend, frontend, and mobile typechecks passed; shared build passed.
- **Walkthrough:** A person with responder and dispatcher accounts still needs
  to verify ambulance/fire/rescue unit behavior, help-request deduplication,
  medical access scope, and the notification click route on devices.

### Review — 2026-10-31 (Claude, Phases 0–2)

Read every changed file against the plan and the prompts, then fixed what was wrong. Before the fixes everything was green (backend 1414, mobile 111, typechecks), but four of the defects below were real breakages that no test covered.

**Phase 0:** correct. The three `it.failing` proofs reproduced F5a–c and Phase 1 turned them into plain `it(...)`. The empty Phase 0 row of the Progress log is now filled in.

**Phase 1 defects (fixed):**
- **R1, high, mobile.** `nextAssignmentActions` let this dispatch's `on_scene_at` override the incident status. Once an ambulance tapped On Scene and then Transporting, the screen kept showing "Transporting / Treating on Scene" and never "Arrived at hospital" or Resolve. That broke the normal single-ambulance flow. Fix: a `unitStep()` helper. Past the scene (`TRANSPORTING`, `ASSISTING`) and at a terminal status, the incident status wins; before that, this dispatch's stamps win.
- **R2, medium, mobile.** A second unit with no stamps of its own, on an incident another unit had already moved to `ON_SCENE`, was offered "Transporting" before it had left (the phone half of F5c). Fix: no stamps + other units active + incident moving → "Mark En Route". A dispatch that is alone on its incident (including ones from before the migration) still follows the incident.
- **R3, medium, backend.** Two crews tapping Finish at the same moment each saw the other as still active. Both completed only their own dispatch, leaving the incident open with no unit on it. Fix: `applyStatus` takes `SELECT … FOR UPDATE` on the incident row (the same lock as `beginTransport`). If the status changed since it was read, the call returns `409 INCIDENT_STATUS_CHANGED` and the phone refreshes.
- **R4, low, backend.** `progressRank` included `RESOLVED`, so a late `EN_ROUTE`/`ON_SCENE` on a resolved incident was accepted and stamped. Fix: removed it, so that case is refused. The guard expression was also simplified to the equivalent `!transporting && !alreadyAhead && !allowed`.

**Phase 2 defects (fixed; Copilot stopped before its report):**
- **R5, high, mobile.** `FIRE` and `RESCUE` at `ON_SCENE` got only the placeholder button, with no Finish. A fire or rescue crew could not end its work. Fix: every flow has Finish (the plan's Phase 2 step 3 now says so).
- **R6, high, mobile.** `MEDICAL_FIRST` (motorcycle) was offered "Transporting", which the server refuses with 409. Fix: "Treating on Scene" + Finish. An ambulance in `ASSISTING` now also gets "Transporting" (D4 allows `ASSISTING → TRANSPORTING`).
- **R7, high, privacy.** The help request wrote the crew's free-text note into `incident_events.notes`, which the **reporter's own timeline** returns (`GET /incidents/:id/timeline`). Fix: the event note is a fixed text (`Crew asked dispatch for help: AMBULANCE (2)`). The free text is kept only in the dispatchers' own notice `data_payload` (`notification.created` never carries `dataPayload`); the audit row records `hasNote`. The DTO caps the note at 500 characters.
- **R8, medium, reliability.** In the help request, notifications ran first, awaited one by one, and threw 500 if the service was missing. So a failed notice failed the request, and nothing was saved. Fix: save the event first, then the audit, then `Promise.allSettled` notices (best-effort), then emit. The 5-minute dedup is now keyed on the saved event, not on notices, so it also holds when no dispatcher is on duty.
- **R9, medium, audit.** A refused medical-profile read was audited as `'ACCESS_DENIED'`, which is not in the Postgres `audit_action` enum. The best-effort write failed silently, so refusals were never recorded. A test-only bypass (`&& this.prisma.dispatches`) also skipped the crew check when the mock lacked the model. Fix: `AuditAction.PERMISSION_DENIED`, the bypass is removed, and the spec mocks the crew lookup.
- **Small:** in `NotificationBell.tsx`, the `&tab=dispatch` that Copilot appended is a parameter the incidents page never reads. It was removed; the normal incident link already opens the incident.

**Tests added:**
- `backend/test/responders/help-request.spec.ts` (5): notifies every dispatcher; writes the event and the ops emit; creates no dispatch and no MOD-35 request; the note appears in no body, WS payload, audit row or event; dedup; a failed notice doesn't fail the request; crew and active checks.
- `medical-encryption.spec.ts` (+3): the crew/patient scope query and the access-log purpose; off-incident 403 audited as `PERMISSION_DENIED`, with nothing read; dispatcher unchanged.
- `multi-unit.spec.ts` (+2): the row lock / `INCIDENT_STATUS_CHANGED`; a late step on a resolved incident is refused.
- Mobile (+5): an ambulance after transport begins, an ambulance in `ASSISTING`, a second unit not yet moving, `MEDICAL_FIRST`, the "Finish (your unit)" confirm text.

**Verification:** backend 89 suites / 1424 tests; mobile 9 / 116; frontend 7 / 140; backend, mobile and frontend typechecks clean; e2e emergency flow 1/1. `frontend/tsconfig.tsbuildinfo` restored.

**Still open (Phase 2 → Prompt 2b):**
- O1. The phone has no "Request help" button or `requestHelp()` API call. The route exists and is tested, but no crew can reach it yet. **Closed by Prompt 2b.**
- O2. The header shows the raw enum (`FIRE TRUCK`); the plan wanted a label ("Fire unit"). Cosmetic. **Closed by Prompt 2b.**
- O3. `getMyAssignments` runs one `count` per dispatch (N+1). Fine at Bocaue's size; a `groupBy` would make it one query.

**Notes for later (not defects):**
- N1. A crew's last Finish no longer cancels other units that never accepted (`PENDING`/`SENT`): they keep the incident open until a dispatcher acts. That matches D4 ("only the last active dispatch resolves") and rule 8, but it is a change from before. Decide in the walkthrough whether "last" should mean last *accepted*.
- N2. `incident.updated` for a help request also reaches the incident room (the reporter's app). The payload is only `need`/`count`, not the note. Every incident emitter does this today, so an ops-only emit would be a new `RealtimeService` method; that is left for Phase 5 if wanted.
- N3. The crew's existing status `notes` (from before this plan) also go into `incident_events.notes` and so onto the reporter's timeline. That predates this plan; it is worth its own look under MOD-48.

### Phase 2b — 2026-10-31 (Claude, Prompt 2b)

- **Inventory:** `requestHelp()` on the phone, the Request help row and its strings, `UNIT_FIELD_FLOW_LABELS` and a shared `CREW_HELP_NEEDS` were all missing. `CREW_HELP_NEEDS` existed only in the backend DTO; it was moved, not copied.
- **Step 1 — shared + API:** `CREW_HELP_NEEDS`, `CrewHelpNeed` and `UNIT_FIELD_FLOW_LABELS` added to [shared/src/constants/unit-field-flow.ts](../../shared/src/constants/unit-field-flow.ts); shared rebuilt. [help-request.dto.ts](../../backend/src/responders/dto/help-request.dto.ts) now imports them from `@agap/shared` (its own copy removed; nothing else imported it). [responders.api.ts](../../mobile/src/services/api/responders.api.ts) `requestHelp(id, body, token)` → `POST /v1/responders/assignments/:id/help-request`, returning `{ deduplicated, incidentId }`. A blank note is left out and a note is trimmed.
- **Step 2 — screen:** [assignment/[id].tsx](../../mobile/app/responder/assignment/[id].tsx) shows a "Request help" row under On-Scene Assessment for every unit type while `shouldShareLocation` is true (accepted, incident not ended; reused rather than a second rule). It opens [help-request-sheet.tsx](../../mobile/src/components/responder/help-request-sheet.tsx), a bottom-sheet **modal**, not an `Alert`: Android shows at most three `Alert` buttons, and four needs plus Cancel don't fit. The modal includes the optional note (max 500, hint "Only dispatchers see this note. Do not write names."). Success → "Dispatch has been told" / "Dispatch was already told a few minutes ago"; failure keeps the sheet open with the choice and the note, and shows the server's reason. The sheet has its own busy state, so status buttons are never blocked; nothing is queued on the phone, and the note isn't logged or sent anywhere else. One `clientRequestId` per opening of the sheet; the server accepts it but doesn't use it yet (it dedups on incident + need for 5 minutes). The order of the needs comes from [help-request.ts](../../mobile/src/lib/help-request.ts) `helpNeedsFor(flow)`: an ambulance gets More personnel first, every other flow gets Ambulance first.
- **Step 3 — header:** "BFP Fire Truck 1 · Fire unit" from `UNIT_FIELD_FLOW_LABELS[fieldFlowFor(resource_type)]` (English only, as shared constants are).
- **Step 4 — strings:** `helpRequest` block in [translations.ts](../../mobile/src/i18n/translations.ts), en and fil. Filipino written by Claude, **for a person to check**: the subtitle, note hint and failure text; `FIRE_UNIT` / `RESCUE_UNIT` kept as "Fire unit" / "Rescue unit" in fil.
- **Not built:** no count stepper (the API accepts `count`, the sheet doesn't send one). Untouched as instructed: `applyStatus`, `beginTransport`, `requestHelp` (backend), the medical service, `nextAssignmentActions` and their specs.
- **Tests:** [responders-api.test.ts](../../mobile/src/services/api/__tests__/responders-api.test.ts) (method, URL, auth header, body; empty note left out; server error passed through) and [help-request.test.ts](../../mobile/src/lib/__tests__/help-request.test.ts) (labels cover every flow; order per flow; every need offered once; en/fil need labels).
- **Verification:** backend 89 suites / 1425 → 1425 passed (the baseline was 1425, one more than the review recorded). Mobile 9 / 116 → 11 / 131. Frontend 7 / 140 unchanged. Shared build and backend/mobile/frontend typechecks clean; e2e 1/1; `prisma migrate status` up to date; `frontend/tsconfig.tsbuildinfo` restored.
- **Needs a person / device (see also the review below):** on a phone, tap Request help as an ambulance and as a fire unit (check the order of the choices); send twice within 5 minutes and check the "already told" message; check the dispatcher's bell; turn data off and check the error keeps the sheet's state. If Expo shows nothing new, restart with `npx expo start -c` (no new route file was added, but there is a new component).

### Review — 2026-10-31 (Phase 2)

Prompt R for the whole of Phase 2 (Prompt 2, the earlier review's fixes, and Prompt 2b). **Not independent:** it ran in the same chat that wrote Prompt 2b, so 2b's code was re-read as strictly as the rest, but a fresh-chat review would still add value.

**Checked, no defect found (a–f):**
- **Steps and "Must reuse":** one flow map in `shared` (`fieldFlowFor` covers every `resource_type`, unknown → `GENERAL`); `CREW_HELP_NEEDS`, `UNIT_FIELD_FLOW_LABELS` and `NOTIFICATION_EVENT_TYPES.CREW_HELP_REQUESTED` are each defined once. Server rules: `applyStatus` refuses TRANSPORTING for non-`MEDICAL_TRANSPORT` and ASSISTING for non-`MEDICAL_*` (409 with codes); `beginTransport` refuses a responder on a non-`MEDICAL_TRANSPORT` unit and leaves dispatchers alone. A dispatch with no resource row skips both rules (keeps the old behaviour for legacy rows; deliberate).
- **Medical scoping (F6):** responders need an active crewed dispatch on an incident where the user is the reporter or a patient; refusal is a 403 audited as `PERMISSION_DENIED`; the access-log purpose names the incident reference; dispatcher/supervisor unchanged. `AuditModule` is imported, not provided.
- **Help request:** persist → audit (`AuditService.log` catches its own errors, so `void` is safe) → `Promise.allSettled` notices → emit, each failure caught. Dedup keyed on the saved event per incident + need for 5 minutes (no need is a prefix of another). The note is in no body, event, audit row or WS payload. It never creates a dispatch or a MOD-35 request.
- **A9:** nothing dispatches, closes or activates by itself; no status step waits on a report; `ScheduleModule.forRoot` = 1. The single-ambulance e2e is green.

**Found and fixed:**
- **P2-1, medium, function.** The crew's free-text note was stored in the dispatcher's notice `data_payload`, but no ops screen showed it, so it reached nobody, while the phone says "Only dispatchers see this note". Fix: the bell's notice row shows "Crew note: …" for `CREW_HELP_REQUESTED`, read through a new pure helper [frontend/lib/crew-help-note.ts](../../frontend/lib/crew-help-note.ts). It is still never in the notice body, a toast or a WS payload (`notification.created` carries no `dataPayload`).
- **P2-2, low, tests.** `beginTransport`'s `TRANSPORT_NOT_FOR_UNIT` branch (the direct `POST /incidents/:id/transport` path) had no test; only the `applyStatus` path did. Added to [transport.spec.ts](../../backend/test/incidents/transport.spec.ts): a fire-truck crew is refused with nothing written or emitted; a dispatcher on the same dispatch still can start it.
- **P2-3, low, duplication.** `RespondersService.requestHelp` retyped the four needs as an inline union. It now uses `CrewHelpNeed` from `@agap/shared` (type only; no behaviour change).
- **P2-4, low, mobile (2b).** The help sheet could be closed (Cancel / Android back) while sending; a failure after that was never seen. The sheet now stays open until the send finishes.

**Tests added:** `frontend/__tests__/crew-help-note.spec.ts` (3), `transport.spec.ts` (+2).

**Verification:** backend 89 suites / 1425 → 1427; mobile 11 / 131; frontend 7 / 140 → 8 / 143; shared build and backend/mobile/frontend typechecks clean; e2e 1/1; `prisma migrate status` up to date; `frontend/tsconfig.tsbuildinfo` restored.

**Left open (not defects of this phase):**
- `TRANSPORT_NOT_ALLOWED_IN_STATUS`'s message in `beginTransport` still says "ON_SCENE or TRANSPORTING" although Phase 1 also allows ASSISTING. Wording only; Phase 1 code.
- Two simultaneous help requests for the same need can both pass the dedup check (no lock). At worst dispatchers get two notices; acceptable.
- `clientRequestId` on the help request is accepted but unused by the server.
- O3 (N+1 count in `getMyAssignments`) and N1–N3 above are unchanged.

### Phase 3 — 2026-10-31

- **Decisions:** D1 = OK (provisional, 2026-10-31): the proposed fields and the `THIRD_ALARM` threshold; BFP Bocaue still to confirm the alarm terms. D5 = OK. Both written into Part B.
- **Inventory:** every Phase 3 item was missing (no fire constants, table, route, event, notice type, screen or card). Reused: `fieldFlowFor`, the assessment service's shape, `findEscalationRecipients` + `NotificationsService.create`, the transport outbox, `addAgency`'s logic (moved, not copied). Baseline: backend 1427, mobile 131, frontend 143 (the counts of the Phase 2 review; no code changed since).
- **Step 1 — constants:** [shared/src/constants/fire.constants.ts](../../shared/src/constants/fire.constants.ts): `FIRE_ALARM_LEVELS` (BFP order, lowest first), `FIRE_STATUSES`, `FIRE_OCCUPANCY_TYPES`, `FIRE_HAZARDS`, their labels, `FIRE_ALERT_ALARM_LEVEL` (`THIRD_ALARM`), `isAlarmLevelAtLeast`, `FIRE_REPORT_ALERT_REASONS`. `NOTIFICATION_EVENT_TYPES.FIRE_REPORT_ALERT`; `INCIDENT_EVENTS.FIELD_REPORT = 'incident.field_report'` with `IncidentFieldReportPayload` (`kind: 'FIRE' | 'RESCUE'`, for Phase 4 too) in the WS payload map.
- **Step 2 — migration** `20261031020000_fire_field_reports` (applied; e2e DB rebuilt): the plan's columns plus `client_request_id` (unique, for idempotent resends). Codes are `varchar` checked by the DTO against the shared constants, not Postgres enums, so a BFP change to D1 needs no enum migration. A `CHECK` keeps counts ≥ 0. A trigger refuses any `UPDATE` (append-only in the database too, like `audit_logs`); DELETE stays possible so an incident's rows go with it. `dispatch_id` uses `ON DELETE NO ACTION`: `SET NULL` would be an UPDATE the trigger refuses.
- **Step 3 — API:** `POST /v1/incidents/:id/fire-report` (Responder, Dispatcher, Supervisor) and `GET /v1/incidents/:id/fire-reports` (staff and crew; never the reporter). [FireReportService](../../backend/src/incidents/fire-report/fire-report.service.ts): a responder must be crewed on an active dispatch of the incident (403) and that unit must be a `FIRE` unit (409 `FIRE_REPORT_NOT_FOR_UNIT`); the report is filed on that dispatch whatever the phone sends. Staff relaying the radio skip the crew check; an optional `dispatchId` must belong to the incident (400). A repeat `clientRequestId` returns the first row (also when two copies race: the unique index + P2002); the same ID on another incident or by another person → 409 `CLIENT_REQUEST_ID_REUSED`. Then, each best-effort: audit (`fire_field_report`, `MOD-36`, `hasNote` instead of the note), the ops-only `incident.field_report` (`RealtimeService.fieldReport`: statuses, codes and counts), the notices. `GET /incidents/:id` includes the reports (newest first, with the unit's name and call sign); the list includes the latest status and alarm level only.
- **Step 4 — notices:** per dangerous finding (`FIREWORKS_EXPLOSIVES`, `TRAPPED_PERSONS`, `HIGH_ALARM` at or above `THIRD_ALARM`, `CASUALTIES_NO_AMBULANCE` when no active AMBULANCE dispatch is on the incident) one IN_APP `FIRE_REPORT_ALERT` to each Dispatcher and Supervisor, linked to the incident; deduplicated per incident + reason for 10 minutes. Bodies hold the reference, counts and the alarm label only. Nothing dispatches, activates surge or changes the incident.
- **Step 5 — D5:** [agency-participants.ts](../../backend/src/incidents/agency-participants.ts) `addAgencyParticipant` holds what `addAgency` did (create, audit `MOD-34`, `incidentUpdated`), now idempotent (an existing row is returned with no audit or event; a race returns the winner). `IncidentsService.addAgency` calls it; `DispatchService.create` calls it after the dispatch commits, with `role_in_incident` = the unit type, in its own `try/catch`. Deviation: the manual "Add agency" for an organization already on the incident now returns that row instead of failing with a unique-constraint error. Per D5's wording, the first organization dispatched is added too (MDRRMO included), since incidents have no owning organization.
- **Step 6 — mobile:** [fire-report/[id].tsx](../../mobile/app/responder/fire-report/[id].tsx) (`[id]` = the dispatch ID, like the assignment screen): chips for status, alarm level, hazards (multi) and occupancy; 52-pt steppers for trapped, casualties and structures; yes/no; notes. It starts from the latest report (never its note). Offline, or behind actions already waiting, it goes into the existing outbox as a new item kind `fireReport` (deduplicated by tap ID only, so several reports can wait; still max 3 per dispatch), with its client request ID fixed at the tap; a `NetworkError` during a send queues the same item. On the assignment screen, a fire unit's ON_SCENE button is now "Fire Report" (the Phase 2 placeholder is gone); a "Fire status" row shows the latest report; Finish adds a warning to its confirm when the last report isn't "Fire out" (or there is none), and never blocks. The Fire Report button stays usable while something waits in the outbox (it only opens the form). Strings are English, like the assessment screen (no `fil` yet).
- **Step 7 — web:** drawer **Fire** card (latest status, alarm, hazards, counts, flags, unit, notes for staff, earlier reports collapsible) from [fire-report-view.ts](../../frontend/lib/fire-report-view.ts); a fire badge next to the status in the incident queue (MOD-23); `incident.field_report` refreshes both; the bell shows `FIRE_REPORT_ALERT` with a flame and opens the incident.
- **Tests:** [fire-report.spec.ts](../../backend/test/incidents/fire-report.spec.ts): DTO (empty accepted, every bad code or count refused); threshold order; off-incident 403 and non-fire 409 with nothing saved; staff radio path; exact empty row; append-only (two rows, no update); idempotent repeat with no second audit, emit or notice; P2002 race; reused ID refused; exact WS payload and no note text anywhere; failures don't undo; each reason notifies Dispatchers and Supervisors once and never dispatches or activates surge; dedup query and 10-minute window; reasons deduplicated independently; quiet cases. [dispatch-agency.spec.ts](../../backend/test/dispatch/dispatch-agency.spec.ts): added with the unit type and audited; an existing organization not re-added; two units of one organization → one row; a failure doesn't fail the dispatch; race. Mobile: [fire-report.test.ts](../../mobile/src/lib/__tests__/fire-report.test.ts) (body, prefill without the note, steppers, summary, Finish warning) and outbox cases (several reports wait; endpoint, body and the same ID on retry; persistence; order behind a transport step). Frontend: [fire-card.spec.ts](../../frontend/__tests__/fire-card.spec.ts) (latest vs history, empty report, 0 counts, queue badge). Changed on purpose: the Phase 2 mobile test that expected the fire placeholder now expects the `fireReport` action; `incident-creation.spec.ts`'s exact list `include` now lists the fire badge's two columns.
- **Verification:** backend 89 suites / 1427 → 91 / 1465; mobile 11 / 131 → 12 / 145; frontend 8 / 143 → 9 / 148; shared build and backend/mobile/frontend typechecks clean; `prisma migrate status` up to date; `test:e2e:db` then e2e 1/1; `frontend/tsconfig.tsbuildinfo` restored.
- **Finding P3-F1 (not fixed, outside this phase):** `DispatchService.create` is the only way to create a dispatch, and it accepts only `ACKNOWLEDGED`, `ASSESSED` and `DISPATCH_PENDING` incidents. After the first unit the incident is `DISPATCHED`, so a second unit (fire truck + ambulance) can't be dispatched through the API. Phases 1–3 handle several units correctly once they exist, but the two-crew walkthroughs (Phase 1, Phase 5 "fireworks fire") can't be run until this is decided and fixed. It needs its own small change: allow adding a unit to an incident that is `DISPATCHED` … `ASSISTING`, without moving the incident status back.
- **Needs a person / device:** as `responder3` (BFP) on a fire-truck dispatch: file a report, update it twice, and check the drawer card and queue badge update live and the history keeps all three; file one with data off, reconnect, and check it arrives once; add fireworks / 2 trapped / 3rd alarm and check the dispatcher and supervisor bells (once each per 10 minutes); tap Finish before "Fire out" and check the warning. Dispatch a BFP unit and check BFP appears under agencies. If the new screen doesn't open on the phone, restart Expo with `cd mobile; npx expo start -c`. BFP Bocaue to confirm the D1 alarm terms.

### Review — 2026-10-31 (Phase 3)

Independent: run in a fresh session that didn't build Phase 3 (Prompt R). Read the Phase 3 diff (fire-report service, DTO, migration, `agency-participants.ts`, `DispatchService.create`, controller/module wiring, shared constants/events, drawer card, queue badge, bell, socket provider, phone form, outbox, assignment screen) and the five Phase 3 specs.

**Fixed:**
- **P3-R1 (bug, mobile).** A fire crew lost its Fire Report button as soon as another unit moved the incident past the scene. `unitStep` follows the incident to `TRANSPORTING` / `ASSISTING` once this unit is on scene, and those cases offered only Finish (or nothing while `transport` was still loading, since a fire unit never has one). In the fireworks case (the ambulance leaves with a casualty while the fire is still burning) the crew had no way to file or update a report from the phone. Fix in [assignment-progress.ts](../../mobile/src/lib/assignment-progress.ts): FIRE (and the RESCUE placeholder, same gap, ahead of Phase 4) get their on-scene pair (report + Finish) at `ON_SCENE`, `TRANSPORTING` and `ASSISTING`. Medical flows are unchanged. Tests: a new case for both flows × both statuses × `transport` undefined/null. Two Phase 2 assertions that encoded the bug were changed on purpose: the fire unit at `ASSISTING` now expects `['Fire Report', 'Mark Resolved']` (still no Transporting), and the "Finish (your unit)" test now picks the Finish action by kind instead of taking the first action.
- **P3-R2 (docs).** Row 32 of `docs/100%ModulesFunctionalities+AdditionalModules.md` still said fire actions were Phase 3 placeholders; it now names only the rescue placeholder and mentions the fix above.

**Checked, no change needed:** each new constant, event name, route and `eventType` is defined once. `FireReportService` is provided only in `IncidentsModule`, which imports `AuditModule` and `NotificationsModule`. There is one `ScheduleModule.forRoot`. The WS payload, audit row and notice bodies hold no notes (the spec checks the exact payload). The reporter's `GET /incidents/:id` returns `findReporterView`, so fire reports and notes never reach the citizen. `void audit.log(...)` in `addAgencyParticipant` is safe because `AuditService.log` catches its own errors. D5 runs after the dispatch transaction commits, inside its own `try/catch`. The notice dedup filters `incident_id` + `data_payload.reason` + 10 min. Fire reports wait in the outbox ahead of Finish, which stays disabled while anything waits. Outbox size: `expo-secure-store` 57.0.4 has no 2048-byte value limit any more (its changelog removed it), so 3 reports with 1000-character notes are fine. Nothing added dispatches, activates surge or changes the incident status.

**Left open (not bugs; for a person to decide):**
- O1. A Dispatcher/Supervisor radio report isn't checked against the incident being open, nor its optional `dispatchId` being a fire unit. Harmless today (staff only, audited).
- O2. A resource with fire reports can't be hard-deleted: `resources → dispatches` cascades, but `fire_field_reports.dispatch_id` is `NO ACTION` (deliberately, because of the no-UPDATE trigger). Resources are deactivated rather than deleted in practice.
- O3. The notice dedup is check-then-insert, like the surge and help-request notices: two reports within milliseconds can both notify.
- O4. The backend run printed Jest's "a worker process has failed to exit gracefully" warning; all suites passed.
- **P3-F1 is still open:** a second unit can't be dispatched. The two-crew walkthroughs (and P3-R1 on a device) need it.

**Tests:** backend 91 suites / 1465 (unchanged); mobile 12 / 145 → 12 / 146; frontend 9 / 148 (unchanged); backend, mobile and frontend typechecks clean; `prisma migrate status` up to date (30 migrations); e2e 1/1; `frontend/tsconfig.tsbuildinfo` restored. Shared unchanged (no rebuild needed).

### Phase 4 — 2026-10-31

Same session as the Phase 3 review, so Prompt R for Phase 4 should run in a fresh chat.

- **Decisions:** D2 = OK with clarifications (2026-10-31): children are under 18, elderly 60 and over; an optional **families** count; the water level is the depth where the crew stands, not the river gauge. MDRRMO Bocaue still to confirm the water-level and access terms. Written into Part B.
- **Inventory:** every Phase 4 item was missing (no rescue constants, table, routes, notice types, screen, cards or surge totals; the phone had a Phase 4 placeholder). Reused: `fieldFlowFor`, the Phase 3 service shape, `incident.field_report` (kind `RESCUE`, no new event), `findEscalationRecipients` + `NotificationsService.create`, the transport outbox, `haversineMeters`, the surge status endpoint. Baseline: backend 1465, mobile 146, frontend 148, e2e 1/1 (the Phase 3 review's run; no code changed in between).
- **Step 1 — constants:** [rescue.constants.ts](../../shared/src/constants/rescue.constants.ts): `WATER_LEVELS`, `RESCUE_ACCESS`, `RESCUE_TAKEN_TO` and their labels, `RESCUE_COUNT_LABELS` (the D2 age cutoffs are in the labels), `RESCUE_PART_COUNTS` (the counts that can't exceed people rescued). `NOTIFICATION_EVENT_TYPES.RESCUE_PEOPLE_WAITING` and `RESCUE_AMBULANCE_SUGGESTED`. `IncidentFieldReportPayload` gained the rescue fields (counts, codes, destination name).
- **Step 2 — migration** `20261031030000_rescue_trip_reports` (applied; e2e DB rebuilt; `migrate diff` shows no drift for the table): the plan's columns plus `families` (D2) and `client_request_id` (unique). Text codes checked by the DTO, `CHECK` counts ≥ 0, a trigger refusing `UPDATE`, and `NO ACTION` foreign keys for the same reason as Phase 3. `taken_to_facility_id` → `facilities`. There's also an index on `reported_at` for the surge totals.
- **Step 3 — API:**
  - `POST /v1/incidents/:id/rescue-trip` (Responder on an active `RESCUE` unit, else 409 `RESCUE_TRIP_NOT_FOR_UNIT`; off-incident 403; Dispatcher/Supervisor by radio). Every field is optional. 400 when a part (families, children, elderly, PWD, pregnant) is above people rescued, when `EVACUATION_CENTER` has no facility or one that isn't an active `EVACUATION_CENTER`, or when a facility / "other" text is sent with another destination. Idempotent `clientRequestId`, as in Phase 3. Audit `rescue_trip_report`, `MOD-32` (`hasNote`, no notes). The ops event carries counts, codes and the facility name: never notes or the free-text "other" place. It never writes a `TransportRecord` and never changes the incident.
  - `GET /v1/incidents/:id/rescue-summary` (staff and crew, never the reporter): totals, the latest still-waiting estimate (a blank later trip doesn't erase an earlier estimate), per-destination totals and every trip.
  - `GET /v1/facilities/evacuation-centers` (Responder, Dispatcher, Supervisor): active evacuation centers (id, name, barangay, coordinates; no contacts or capacity). New because responders can't read `GET /facilities`.
  - The incident list includes each trip's `rescued_count` for the queue badge (`incident-creation.spec.ts`'s pinned `include` updated explicitly).
- **Shared helpers (deviation: refactor, not copy):** [field-report-access.ts](../../backend/src/incidents/field-report-access.ts) holds what fire reports and rescue trips share: `assertFlowCrew`, `radioDispatch`, `findRepeatReport`, `hasActiveAmbulance`, `notifyStaffOnce` (10-minute dedup per incident + optional reason). `FireReportService` now uses them; its spec is unchanged and still passes (33 tests). Phone: `stepCount` moved to `field-counts.ts` (re-exported from `fire-report.ts`); the form widgets (`Section`, `Chips`, `Stepper`, `SaveBanner`) moved from the fire screen to [field-form.tsx](../../mobile/src/components/responder/field-form.tsx) for both screens.
- **Step 4 — output:**
  - The rescue crew's **Finish** with a latest estimate > 0 sends an IN_APP `RESCUE_PEOPLE_WAITING` notice to Dispatchers (call sign and count; deduplicated per incident for 10 minutes). It runs in `RespondersService.applyStatus` after the Finish is saved, through `notifyRescueStillWaiting`, which never throws.
  - `HANDED_TO_AMBULANCE` with no active ambulance on the incident sends `RESCUE_AMBULANCE_SUGGESTED` to Dispatchers (same dedup).
  - Neither notice dispatches anything.
  - **Surge (MOD-52):** `GET /disaster-mode/status` now also returns `rescueByBarangay` while a surge is active: trips logged since it was declared, grouped by `incident_locations.barangay` (rescued, trips, incidents, and the sum of each incident's latest still-waiting estimate). It's best-effort, so the status still loads if the totals fail. Choice: trips since activation, not only incidents linked to the surge, because linking is a manual step.
- **Step 5 — mobile:** [rescue-trip/[id].tsx](../../mobile/app/responder/rescue-trip/[id].tsx) (`[id]` = dispatch ID):
  - Steppers for people rescued and each part (parts can't step past people rescued, and lowering it lowers them), still waiting, water and access chips, and where taken.
  - Evacuation centers are listed nearest to the scene first by `haversineMeters`; offline with no list, the screen says so.
  - "Other" place text, and notes.
  - Water level, access and the last center carry over from the previous trip; counts start empty.
  - Offline (or behind waiting actions) the trip goes into the outbox as item kind `rescueTrip`.
  - On the assignment screen, "Record Rescue Trip" opens the form (the `placeholder` action kind is gone). A "Rescue trips" row shows "12 rescued · 3 trips · ~5 waiting". Finish adds a warning when the latest estimate is > 0, and never blocks.
  - English strings only, like the fire form.
- **Step 6 — web:**
  - Drawer **Rescue** card from the summary endpoint: totals, vulnerable counts, per destination, and every trip with unit, conditions and notes for staff.
  - A green "12 rescued" badge in the incident queue.
  - `incident.field_report` with `kind: 'RESCUE'` refreshes the card, the queue and the surge state; the fire path is unchanged.
  - The bell shows both new notice types and opens the incident.
  - The surge page has a **Rescue by Barangay** card (most waiting first).
- **Tests:**
  - [rescue-trip.spec.ts](../../backend/test/incidents/rescue-trip.spec.ts):
    - DTO and cross-field rules.
    - Who may file: off-incident 403; ambulance, fire and motorcycle 409; rescue truck on its own dispatch; radio.
    - Parts above rescued → 400 with nothing saved; inactive or non-evacuation facility → 400.
    - The exact empty row, with no `TransportRecord` or incident change; append-only; idempotent repeat with no second audit, emit or notice; P2002 race; reused ID refused.
    - Exact WS payload; no note or name anywhere; failures don't undo.
    - Handed-to-ambulance notice: with no ambulance, not with one, deduplicated.
    - Summary totals; still-waiting notice (> 0, 0, none, dedup, never throws).
    - `RespondersService` Finish: a rescue unit notifies and the Finish stands; a failed notice doesn't fail it; a fire unit never reads trips.
    - Surge per-barangay totals, only while active; status still loads on failure.
    - Evacuation-center query.
  - Mobile: [rescue-trip.test.ts](../../mobile/src/lib/__tests__/rescue-trip.test.ts) (body, carry-over, part clamping, center required, nearest-first, summary line, Finish warning) and four outbox cases (several wait, endpoint + body + same ID on retry, persistence, order).
  - Frontend: [rescue-card.spec.ts](../../frontend/__tests__/rescue-card.spec.ts) (card view, destinations, "other" place, queue badge).
  - Changed on purpose: the Phase 2 mobile test for the rescue placeholder now expects the `rescueTrip` action.
- **Verification:** backend 91 suites / 1465 → 92 / 1510; mobile 12 / 146 → 13 / 159; frontend 9 / 148 → 10 / 152; shared build and backend/mobile/frontend typechecks clean; `prisma migrate status` up to date (31 migrations); `test:e2e:db` then e2e 1/1; `frontend/tsconfig.tsbuildinfo` restored.
- **Needs a person / device:**
  - Dispatch MDRRMO Rescue Boat 1 (responder2) to a flood incident in Lolomboy and log two trips to an evacuation center; check the drawer card, the queue badge and the totals on the phone update.
  - Log one with data off, reconnect, and check it arrives once.
  - Hand people to an ambulance with none dispatched and check the dispatcher bell.
  - Finish with people waiting: check the phone warning and the dispatcher bell.
  - With surge mode active, check the Rescue by Barangay card.
  - If the new screen doesn't open, restart Expo with `cd mobile; npx expo start -c`.
  - MDRRMO Bocaue to confirm the D2 water-level and access terms.
