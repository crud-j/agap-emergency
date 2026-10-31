# AGAP — Unit-Specific Field Flow: Copilot Prompts and Context

**Companion to:** [UNIT_FIELD_FLOW_PLAN.md](UNIT_FIELD_FLOW_PLAN.md) (the "plan")
**Prepared:** 2026-10-31 · **Baseline:** `main` @ `2acafa5` + the uncommitted automation Phase 4 work
**Made for:** GitHub Copilot Chat in **Agent mode** (VS Code). Works with any coding agent that can read files and run terminal commands.

This file has four parts:

- **Part A — Context briefing.** Everything the agent must understand before touching code: the system, the problem, how the code works today, what we are building and why.
- **Part B — Decisions sheet.** Five answers **you** fill in before Phase 1 (and D1 before Phase 3).
- **Part C — Working protocol.** The steps every prompt follows: preflight, implement, self-check, verify, record, stop.
- **Part D — The prompts.** One per phase, plus a review prompt. Copy one, paste it, wait for the report.

---

## How to use this with Copilot

1. Open the `agap-emergency` folder in VS Code. Open Copilot Chat (`Ctrl+Alt+I`) and switch the mode selector to **Agent**.
2. **One prompt per new chat.** Click "New Chat" (`+`) before each prompt. Long chats make the agent forget the rules.
3. In each new chat, attach the context files so Copilot reads them in full. Type them in the chat box before the prompt:
   `#file:docs/plans/UNIT_FIELD_FLOW_PROMPTS.md #file:docs/plans/UNIT_FIELD_FLOW_PLAN.md #file:CLAUDE.md`
4. Paste the prompt's fenced block, unchanged, after those three references. Press Enter.
5. Copilot asks permission to run terminal commands. **Allow** the test, typecheck and `prisma migrate deploy` commands. **Deny** anything that says `migrate dev`, `migrate reset`, `git commit`, `git push`, `git checkout .`, `git reset` or `rm -rf`.
6. When it reports and stops, read the report. Then open a **new chat** and run **Prompt R** for that phase before starting the next one.
7. If a chat dies halfway, start a new chat with the **same** prompt. Part C step A makes the agent find what already exists and finish it.
8. You commit. The agent never commits.

| Order | Prompt | Gate before starting |
|---|---|---|
| 1 | Prompt 0: Verify findings + failing tests | none |
| 2 | Prompt R (Phase 0) | Prompt 0 reported |
| 3 | Prompt 1: Multi-unit safety | Phase 0 reviewed **and** D3 + D4 filled in (Part B) |
| 4 | Prompt R (Phase 1) | Prompt 1 reported |
| 5 | Prompt 2: Unit flow map, server rules, medical scoping, help request | Phase 1 reviewed |
| 5b | **Prompt 2b: finish Phase 2** (the phone's Request help button). Prompt 2 stopped at the Copilot credit limit on 2026-10-31; Claude reviewed and fixed what it left. Don't re-run Prompt 2. | Plan's "Review — 2026-10-31" read |
| 6 | Prompt R (Phase 2) | Prompt 2b reported |
| 7 | Prompt 3: Fire truck | Phase 2 reviewed **and** D1 + D5 filled in |
| 8 | Prompt R (Phase 3) | Prompt 3 reported |
| 9 | Prompt 4: Rescue boat / truck | Phase 3 reviewed **and** D2 filled in |
| 10 | Prompt R (Phase 4) | Prompt 4 reported |
| 11 | Prompt 5: Ops view, docs, seed | Phase 4 reviewed |
| 12 | Prompt R (Phase 5) | Prompt 5 reported |

Phases 3 and 4 don't depend on each other and can swap. Phases 1 and 2 must come first.

---

# Part A — Context briefing

Read all of Part A before writing any code. It explains *why* each rule exists, so you can make correct choices the plan doesn't spell out.

## A1. What AGAP is

AGAP is an emergency alert and dispatch system for the **Bocaue MDRRMO** (the municipal disaster office of Bocaue, Bulacan, Philippines). It is a **pnpm monorepo**:

| Package | Stack | What it is |
|---|---|---|
| `backend/` | NestJS (TypeScript), Prisma 7 → PostgreSQL + PostGIS, Redis + BullMQ, Socket.io | **One** API server for every app (modular monolith). Routes are `/api/v1/...`; in controllers they are declared as `@Controller({ path: 'x', version: '1' })` |
| `frontend/` | Next.js + React, Tailwind, TanStack Query, Socket.io client | The **Operations Center** web app (dispatchers, supervisors, hospitals) |
| `mobile/` | Expo + React Native, Expo Router (file-based routes in `mobile/app/`) | The **Citizen app** and the **Responder app** (same binary; the role decides which screens) |
| `shared/` | TypeScript | Enums, constants, event names and types used by all three. **Backend and frontend read the compiled `shared/dist`**, so after editing `shared/src` you must run `cd shared; pnpm build` |

The **Incident** is the central object. Everything else (dispatches, assessments, transports, notifications) hangs off an incident.

## A2. Words you must use precisely

| Word | Meaning in this codebase | Where |
|---|---|---|
| **Incident** | One emergency. Has one `status` (the lifecycle below) | `Incident` model, `backend/src/incidents/` |
| **Resource** / **unit** | A vehicle or team: ambulance, fire truck, rescue boat… It has a `resource_type` and belongs to an organization (MDRRMO or BFP) | `resources` model, `enum resource_type` in `backend/prisma/schema.prisma:2000` |
| **Dispatch** | One unit sent to one incident by a dispatcher. Status only `PENDING → SENT → ACCEPTED → COMPLETED` (or `REJECTED`/`CANCELLED`) | `dispatches` model, `schema.prisma:677` |
| **Crew** | The responders (people) riding on a dispatch | `dispatch_crew` (user_id + dispatch_id) |
| **Responder** | A person with role `RESPONDER`. There is only one responder role | `UserRole.RESPONDER` in `shared/src/enums/user-role.enum.ts` |
| **Field flow** *(new, this plan)* | Which on-scene tools a crew gets, decided by the **unit's** `resource_type`: `MEDICAL_TRANSPORT`, `MEDICAL_FIRST`, `FIRE`, `RESCUE`, `GENERAL` | to be created: `shared/src/constants/unit-field-flow.ts` |
| **Assessment** | A crew's patient check: vitals, GCS, triage colour (MOD-37) | `on_scene_assessments`, `backend/src/incidents/assessment/` |
| **Transport** | Taking a patient to a **hospital** | `TransportRecord` model, `backend/src/incidents/transport/` |
| **MOD-xx** | One of 53 numbered modules in the spec (e.g. MOD-32 = Responder mobile interface). Use the number in audit `moduleId` | `CLAUDE.md` module table |

**Reporter ≠ patient** (CLAUDE.md). Never assume the person who reported is the patient.

## A3. The incident lifecycle today

```
DRAFT → SUBMITTED → RECEIVED → ACKNOWLEDGED → ASSESSED → DISPATCH_PENDING → DISPATCHED
  → EN_ROUTE → ON_SCENE → TRANSPORTING or ASSISTING → RESOLVED → CLOSED
```

- The allowed moves are in `INCIDENT_STATUS_TRANSITIONS`, `shared/src/enums/incident-status.enum.ts` (around line 90). Example: `ON_SCENE → [TRANSPORTING, ASSISTING, …]`, `TRANSPORTING → [RESOLVED]`, `ASSISTING → [RESOLVED]`.
- `ASSISTING` means "treating on scene" (no transport).
- A **responder** can move the incident up to `RESOLVED`. Only a **dispatcher** can `CLOSE` (MOD-45).
- Responder status changes come in through `PATCH /v1/responders/assignments/:id/status` → `RespondersService.updateStatus` → `applyStatus` (`backend/src/responders/responders.service.ts:386`). `STATUS_TO_INCIDENT` (line 53) maps the crew's button to an incident status.
- **The dispatch row does not track en route / on scene.** Field progress is written only to the **incident** status. This is the root of the multi-unit problems below.

## A4. The problem we are fixing

There are three seeded responders: `responder1@mdrrmo.bocaue.gov.ph` (Jose Mendoza, MDRRMO), `responder2@mdrrmo.bocaue.gov.ph` (Ana Garcia, MDRRMO) and `responder3@bfp.bocaue.gov.ph` (Carlos Bautista, **BFP** = Bureau of Fire Protection). Seeded units: MDRRMO Ambulance 1 and 2, MDRRMO Rescue Boat 1, BFP Fire Truck 1, BFP Rescue Truck 1.

All three get **exactly the same responder app**, built for an **ambulance crew**:

- `mobile/app/responder/_layout.tsx` only checks `role === RESPONDER`.
- `nextAssignmentActions` (`mobile/src/lib/assignment-progress.ts:53`) offers **"Transporting"** and **"Treating on Scene"** to every unit at `ON_SCENE`.
- The only on-scene form is the patient assessment (`mobile/app/responder/assessment/[id].tsx`).
- The unit type **does** reach the phone (`resources.resource_type` on each assignment, `mobile/src/services/api/responders.api.ts:38`), but nothing uses it.

So, as Input → Process → Output:

| Unit | Input (crew enters) | Output (system produces) | Verdict |
|---|---|---|---|
| Ambulance | Patient assessment | Assessment record, hospital transport, handover | Good |
| Fire truck | Patient form only. **Nothing about the fire** | A "Transporting" button that doesn't apply. **Nothing for ops about the fire** | Poor |
| Rescue boat / truck | Patient form only. **No count of people rescued** | Only hospital transport. **No rescue totals, nothing for surge mode** | Poor |

The **Process** (accept → en route → on scene → finish) is the same for all units and stays shared.

## A5. Why Bocaue makes this urgent

- **Fireworks industry** in barangays **Bundukan** and **Biñang 1st**: an industrial fire or explosion is a realistic mass-casualty event. A BFP fire truck **and** MDRRMO ambulances respond to **the same incident**.
- **Flood-prone barangays** Lolomboy, Bunlo, Igulot, Bambang: in a typhoon, rescue boats ferry people to evacuation centers, trip after trip. The ops room needs "how many rescued, how many still waiting".
- Connectivity is poor in floods, so field forms must work **offline** (the app already has an outbox pattern: `mobile/src/services/offline/transport-outbox.ts`).

## A6. The multi-unit defects (fix these first: Phase 1)

Because progress lives only on the incident status, several units on one incident interfere with each other. I read these in the code; Phase 0 proves each with a test.

- **F5a. One crew's Resolve ends every unit.** In `applyStatus`, before resolving, the open-transport check looks only at **this crew's** dispatch (`openTransportWhere({ dispatch_id: dispatchId })`). Then it completes **every** active dispatch on the incident and frees their units. Scenario: the fire is out, the BFP crew taps Resolve while the ambulance is still driving a patient to hospital → the incident becomes `RESOLVED` and the ambulance's dispatch is ended mid-transport.
- **F5b. "Treating on Scene" by one unit blocks another unit's transport.** `beginTransport` (`backend/src/incidents/transport/transport.service.ts:284`) only starts from `ON_SCENE` or `TRANSPORTING`. If the fire crew taps "Treating on Scene" (incident → `ASSISTING`), the ambulance can no longer start its transport.
- **F5c. The second unit can't report its own progress.** Once the first unit is `ON_SCENE`, a second unit's "Mark En Route" asks for `ON_SCENE → EN_ROUTE`, which isn't an allowed transition → `409`. There is no per-dispatch `en_route_at` / `on_scene_at`.

## A7. Other findings the plan fixes

- **F6. Medical profiles aren't scoped.** `GET /v1/medical-profiles/:userId` (`backend/src/medical-profiles/medical-profiles.controller.ts:62`) lets **any** responder read **any** consenting user's medical profile. `findForResponder` (`medical-profiles.service.ts:99`) checks consent and logs access, but not that the responder is on an incident involving that person. Medical data is the most sensitive class in CLAUDE.md.
- **F7. BFP isn't added to the incident** when a BFP unit is dispatched. MOD-34 agency participants (`incident_agency_participants`) are only added by hand (`incidents.service.ts:1101`, `addAgency`).
- **F8. Transport is hospital-only.** `destination-rules.ts:47` refuses any facility that isn't `HOSPITAL`. Rescue drop-offs at evacuation centers need their own record (Phase 4), not transport.
- **F9. Crews can't ask for help in the app.** MOD-35 resource requests (`POST /v1/resources/requests`) are Dispatcher/Supervisor only.

## A8. The target design (what "done" looks like)

- **Still one role, one app, one backend.** No `FIRE_RESPONDER` role, no second app, no second API. CLAUDE.md forbids separate backends per role.
- **The dispatched unit's `resource_type` picks the field flow**, from one shared map (`fieldFlowFor(resourceType)`). The app shows the right buttons **and the server enforces them** (e.g. a fire truck can't start a hospital transport).
- **Each unit's progress lives on its own dispatch** (`en_route_at`, `on_scene_at`, `field_done_at`). The incident status moves **forward only**. The incident becomes `RESOLVED` only when the **last** active unit finishes, or a dispatcher resolves it.
- **Fire truck:** a **fire report** (alarm level, fire status, hazards, counts), many per incident (append-only, latest = current), shown live to ops. Dangerous findings (fireworks, trapped people, casualties without an ambulance) **notify** dispatchers; they never dispatch by themselves. BFP is listed as a participating agency.
- **Rescue boat / truck:** a **rescue trip log** (people rescued, vulnerable counts, still waiting, water level, where taken), with running totals for ops and per-barangay totals on the surge page.
- **Every crew can ask for help** ("need ambulance / more units") → a notice to dispatchers, who decide.
- **Medical profiles** only for crews on an incident involving that person.

## A9. Non-negotiable rules (from CLAUDE.md; breaking one fails the review)

1. **Automation never decides.** Nothing you build dispatches a unit, activates surge, closes or cancels an incident. It records, shows and notifies; a person acts.
2. **Optional data never blocks.** Every field in the fire and rescue forms is optional. "Finish" without a report is allowed (show a confirm dialog, never block).
3. **Failures never change an incident.** A failed audit write, realtime emit or notification is caught and logged; the report or status change still stands.
4. **Privacy.** Fire and rescue reports hold **counts, never names**. Free-text `notes` never go into a WebSocket payload, a push body or an SMS. Don't log personal data.
5. **Everything consequential is audited** (`AuditService.log`).
6. **Offline retries are idempotent**: every field submit carries a client request ID; the server stores it and returns the same result for a repeat.
7. **Don't expose internal IDs to citizens.** (Staff routes already use IDs; that's fine.)
8. **Never weaken the emergency path**: SOS, intake, dispatch, the ambulance flow and citizen status must behave exactly as before, except for the multi-unit fixes.

## A10. Code patterns to copy (don't invent new ones)

**Crew check** (is this responder on an active dispatch of this incident?) — `backend/src/incidents/assessment/assessment.service.ts:29`:
```ts
const crewed = await this.prisma.dispatches.findFirst({
  where: {
    incident_id: incidentId,
    dispatch_crew: { some: { user_id: responderId } },
    status: { in: ['PENDING', 'SENT', 'ACCEPTED'] as any[] },
  },
  select: { id: true },
});
if (!crewed) throw new ForbiddenException('You are not on an active crew for this incident.');
```

**Audit, best-effort** — same file, around line 100:
```ts
try {
  await this.audit.log({
    action: 'CREATE', actorId: responderId, entityType: 'on_scene_assessment',
    entityId: assessment.id, moduleId: 'MOD-37', incidentId, newValues: { /* no notes, no names */ },
  });
} catch (err) {
  this.logger.warn(`Audit log failed for assessment ${assessment.id}: ${String(err)}`);
}
```

**Realtime to the ops room** — `backend/src/realtime/realtime.service.ts:156`. Add a method like this; event names go in `shared/src/events/incident.events.ts` (e.g. `ASSESSMENT_UPDATED: 'incident.assessment_updated'`), payload types in `shared/src/events/websocket-event.types.ts`:
```ts
assessmentUpdated(incidentId: string, payload: Record<string, unknown>): void {
  const envelope = { incidentId, ...payload };
  this.safe('assessmentUpdated', () => {
    this.gateway.emitToOps(INCIDENT_EVENTS.ASSESSMENT_UPDATED, envelope);
    this.gateway.emitToIncident(INCIDENT_EVENTS.ASSESSMENT_UPDATED, incidentId, envelope);
  });
}
```
The web listens in `frontend/providers/socket-provider.tsx` (see the `incident.assessment_updated` block near line 218) and calls `qc.invalidateQueries(...)`.

**Staff notice** — `backend/src/disaster-mode/surge-detector.service.ts:99-127`:
- recipients from `findEscalationRecipients(prisma, roles)` (`backend/src/jobs/escalation-recipients.ts:20`);
- `this.notifications.create({ userId, eventType, title, body, channel: 'IN_APP', dataPayload })` for each, inside `Promise.allSettled`;
- dedup with `prisma.notification.findFirst({ where: { event_type, created_at: { gte: since }, data_payload: { path: ['incidentId'], equals: id } } })`.
- Add a click route for each new `eventType` in `frontend/components/layout/NotificationBell.tsx` (both the list click and the toast link).

**Modules (NestJS DI).** `RealtimeModule` is global. `NotificationsModule` and `AuditModule` are **not**: import them into your feature module's `imports`. **Never** put another module's service in your module's `providers` (that creates a second instance). Never add another `ScheduleModule.forRoot()`.

**DTOs:** class-validator decorators, every field `@IsOptional()` for field reports, enums via `@IsIn(SHARED_CONSTANT)` from `@agap/shared`. Roles via `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.RESPONDER, …)`.

**Mobile:** screens are files in `mobile/app/responder/...` (Expo Router). API calls live in `mobile/src/services/api/*.api.ts`. Offline queueing: copy `mobile/src/services/offline/transport-outbox.ts`. Pure logic goes in `mobile/src/lib/` with tests in `mobile/src/lib/__tests__/`.

## A11. Commands (Windows PowerShell 5.1: chain with `;`, not `&&`)

| What | Command |
|---|---|
| Build shared (after any `shared/src` edit) | `cd shared; pnpm build; cd ..` |
| Typecheck | `cd backend; pnpm typecheck; cd ..` (same in `frontend`, `mobile`) |
| Backend tests (full) | `cd backend; npx jest --config ./test/jest.config.ts --testTimeout=30000; cd ..` |
| One backend spec | `cd backend; npx jest --config ./test/jest.config.ts test/responders/multi-unit.spec.ts; cd ..` |
| Mobile tests | `cd mobile; npx jest; cd ..` |
| Frontend tests | `cd frontend; npx jest; cd ..` |
| Apply migrations | `cd backend; pnpm prisma migrate deploy; pnpm prisma generate; cd ..` |
| Prepare the e2e database (after a new migration) | `cd backend; pnpm test:e2e:db; cd ..` |
| Emergency-flow e2e | `cd backend; pnpm test:e2e; cd ..` |
| Undo the typecheck's cache change | `git checkout -- frontend/tsconfig.tsbuildinfo` |

**Never run:** `prisma migrate dev`, `prisma migrate reset`, `prisma db push`, `git commit`, `git push`, `git reset`, `git checkout .`. **Never open or print `backend/.env`.** **Don't start a second backend** (`pnpm start:dev`): the user's own instance may be running and shares Redis, which holds queued real SMS.

**Known Windows quirks:**
- **Expo** may not see a new route file until restarted: `cd mobile; npx expo start -c`.
- **Next.js dev** may serve a stale module ("X is not a function" for a new export) until a hard reload or a restart of `pnpm dev`.

## A12. Baseline numbers (2026-10-31)

Before Phase 0: backend 1406/1406 tests (87 suites), frontend 140/140, mobile 98/98, e2e 1/1, 28 migrations applied.
After the Phase 0–2 review (2026-10-31): backend **1424/1424 (89 suites)**, frontend 140/140, mobile **116/116**, e2e 1/1, 29 migrations (`20261031010000_dispatch_field_progress` is the newest). Start Prompt 2b from these numbers. Every phase must end fully green. If a test fails before you change anything, record it and don't "fix" it unless it's yours.

---

# Part B — Decisions sheet (you fill this in)

Copilot must **not** decide these. Write your answer under each one (or "OK" to accept the proposal). Prompt 1 checks D3 and D4, Prompt 3 checks D1 and D5, and Prompt 4 checks D2.

### D1. Fire report fields (confirm with BFP Bocaue) — needed before Phase 3
Proposed:
- **Alarm level:** `FIRST_ALARM`, `SECOND_ALARM`, `THIRD_ALARM`, `FOURTH_ALARM`, `FIFTH_ALARM`, `TASK_FORCE_ALPHA`, `TASK_FORCE_BRAVO`, `TASK_FORCE_CHARLIE`, `TASK_FORCE_DELTA`, `TASK_FORCE_ECHO`, `GENERAL_ALARM`. *(BFP terms; confirm the list BFP Bocaue uses.)*
- **Fire status:** `ACTIVE`, `UNDER_CONTROL`, `FIRE_OUT`.
- **Structures involved:** a count. **Occupancy:** `RESIDENTIAL`, `COMMERCIAL`, `INDUSTRIAL`, `GRASS_OR_VEHICLE`, `OTHER`.
- **Hazards (multi-select):** `FIREWORKS_EXPLOSIVES`, `LPG`, `CHEMICALS`, `LIVE_WIRES`, `STRUCTURAL_COLLAPSE`.
- **Yes/no:** spreading to neighbours; area evacuation needed.
- **Counts:** casualties seen, trapped persons. **Notes:** free text.
- **Notify dispatchers at or above alarm level:** `THIRD_ALARM`.

Your answer: OK (provisional, 2026-10-31). Use the proposed list and the `THIRD_ALARM` threshold; BFP Bocaue still to confirm the alarm terms.

### D2. Rescue trip fields — needed before Phase 4
Proposed:
- **Counts:** people rescued this trip; of them children, elderly, PWD, pregnant; people still waiting here (estimate, may be blank).
- **Water level:** `ANKLE`, `KNEE`, `WAIST`, `CHEST`, `ABOVE_HEAD`. **Access:** `BOAT_ONLY`, `HIGH_VEHICLE`, `PASSABLE`.
- **Taken to:** `EVACUATION_CENTER` (pick an active evacuation-center facility), `HANDED_TO_AMBULANCE`, `STAYED`, `OTHER` (text).
- **Notes:** free text.

Your answer: OK (2026-10-31), with clarifications: "children" = under 18 and "elderly" = 60 and over (Senior Citizens Act age). Add an optional **families** count (DSWD reports in families and persons; ≤ people rescued). The water level is the depth where the crew is standing, not the Bocaue River gauge reading. MDRRMO Bocaue still to confirm the water-level and access terms the boat crews use.

### D3. Which unit type gets which flow — needed before Phase 1
Proposed:

| `resource_type` | Flow | On-scene buttons |
|---|---|---|
| `AMBULANCE` | `MEDICAL_TRANSPORT` | Transporting, Treating on Scene (as today) |
| `MOTORCYCLE_RESPONDER` | `MEDICAL_FIRST` | Treating on Scene, Request ambulance (no transport) |
| `FIRE_TRUCK` | `FIRE` | Fire report, Assess casualty, Request help |
| `RESCUE_BOAT`, `RESCUE_TRUCK` | `RESCUE` | Log rescue trip, Assess casualty, Request help |
| `CLEARING_EQUIPMENT`, `COMMAND_VEHICLE`, `OTHER` | `GENERAL` | Finish only |

May a `RESCUE_TRUCK` take a patient to a hospital itself? Proposed: **no**, it requests an ambulance.

Your answer: OK

### D4. Incident status with several units — needed before Phase 1
Proposed:
- Each unit's progress is stamped on **its own dispatch** (`en_route_at`, `on_scene_at`, `field_done_at`).
- The incident moves **forward only**, to the furthest step any unit reached.
- Only `MEDICAL_TRANSPORT` units can move it to `TRANSPORTING`; only `MEDICAL_*` units get "Treating on Scene" (`ASSISTING`).
- A crew's **Finish** completes **its own** dispatch. The incident becomes `RESOLVED` only when the **last** active dispatch finishes. A dispatcher can still resolve at any time (override, as today).
- Also allow `ASSISTING → TRANSPORTING` in `INCIDENT_STATUS_TRANSITIONS` (treated on scene, then needed transport)? Proposed: **yes**.

Your answer: OK

### D5. Add the unit's organization to the incident's agencies automatically — needed before Phase 3
Proposed: **yes.** When a unit of an organization not yet on the incident is dispatched, add it to `incident_agency_participants` with `role_in_incident` = the unit type. Idempotent and audited.

Your answer: OK

---

# Part C — Working protocol (every prompt follows this)

### A. Preflight (no edits yet)
1. Read `CLAUDE.md`, Part A of this file, the plan's **Findings**, **Rules for every phase** and **Phase N** in full, Part B's answers for this phase, and every file in the phase's "Read first" list.
2. Read the plan's **Progress log**. If Phase N already has a dated section, this is a **resume**: continue from what it records.
3. Run `git status --short` and keep the output. Never revert, reformat or "clean up" files you didn't change in this phase.
4. **Inventory before writing.** List every thing the phase adds: files, classes, functions, migrations, columns, constants, enum values, routes, events, notification `eventType`s, tests. Search the repo for each (`Ctrl+Shift+F` or `grep`). Mark each **exists / partial / missing**. If it exists or is partial, extend that one. **Never create a second copy.** If this phase's migration already exists and is applied (`pnpm prisma migrate status`), never edit it.
5. Run the backend suite once and record the counts (the baseline for this phase).
6. If a "Read first" file or symbol isn't where this plan says, follow the code and note the difference for the report. If a needed decision in Part B is blank, **stop and say which one**.

### B. Implement
- Follow the phase's numbered steps in order.
- **One source per concept:** constants and enums in `shared/src/constants/`, event names in `shared/src/events/*.events.ts`, never retyped elsewhere.
- **Reuse before writing** (Part A10). If a helper exists, import it. No new distance function (`haversineMeters` exists in `@agap/shared`).
- Match the surrounding code: naming, comment density, `try/catch` + `this.logger.warn`, DTOs with class-validator, `@Roles(...)`.
- **No new npm dependencies.** If one seems needed, stop and ask.
- Stay inside the phase. Unrelated problems you notice go in the report, not in the code.
- Migrations: write SQL by hand in `backend/prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql` (timestamp later than every existing folder), update `schema.prisma` to match **without reformatting other lines**, then `pnpm prisma migrate deploy; pnpm prisma generate`.

### C. Self-check before verifying
- Each new event name, constant, route and `eventType` is defined exactly once (search for it).
- `grep -rn "ScheduleModule.forRoot" backend/src` → exactly 1 line.
- No module lists another module's service in `providers`.
- **Privacy:** no names, phones, addresses, coordinates or notes in any WebSocket payload, notification body or log line you added.
- **Guardrails:** nothing you added calls dispatch creation, surge activation, incident close/cancel, or a MOD-35 request create on its own.
- No existing test was deleted, skipped or loosened.
- For Phase 1, `grep -n "dispatch_id: dispatchId" backend/src/responders/responders.service.ts` must not find an incident-level resolve open-transport check.
- For Phase 1, confirm the Phase 0 tests are plain `it(...)`, not `it.failing(...)`.

### D. Verify
1. If `shared/src` changed: `cd shared; pnpm build; cd ..`.
2. `pnpm typecheck` in every touched package.
3. Backend full suite; mobile and frontend Jest if touched; after a migration `pnpm test:e2e:db`, then `pnpm test:e2e`.
4. `pnpm prisma migrate status` → up to date.
5. Fix every failure you caused and re-run until green. Never weaken a test to make it pass.
6. `git checkout -- frontend/tsconfig.tsbuildinfo` if the frontend typecheck touched it.

### E. Record
- Tick only the plan's **Done when** boxes that are now true.
- Fill in the plan's **Progress log** row for Phase N and add a `### Phase N — <date>` section under the table: files added/changed, migrations (applied or not), the inventory result, deviations and why, what needs a person or a device.
- Update the matching rows in `docs/100%ModulesFunctionalities+AdditionalModules.md`, marked **walkthrough pending**.
- **Don't commit.**

### F. Report, then STOP
Reply with: (1) what was built, per step; (2) test counts before → after, per package; (3) deviations and inventory findings; (4) what needs a person or a device. Then stop. Don't start the next phase.

---

# Part D — The prompts

Paste each fenced block **after** the three `#file:` references (see "How to use").

## Prompt 0 — Verify the findings and prove the multi-unit defects

```
You are working on the AGAP monorepo. Read #file:CLAUDE.md, then Part A and Part C of
docs/plans/UNIT_FIELD_FLOW_PROMPTS.md, then the Findings and "Phase 0" of
docs/plans/UNIT_FIELD_FLOW_PLAN.md. Follow Part C (A → F) exactly.

Goal: confirm every finding F1–F9 against the current code, and prove F5a, F5b and F5c
with tests. Do NOT fix anything and do NOT make the Part B decisions.

1. For each finding F1–F9, open the cited file and line. Record "confirmed" or "differs:
   <what the code actually does>" with file:line evidence.
2. Create backend/test/responders/multi-unit.spec.ts. Build RespondersService with mocked
   Prisma/Transport/Status/Realtime/Audit the same way the existing responders specs do
   (search backend/test for "new RespondersService(" and copy that setup). One incident,
   two dispatches: an AMBULANCE crew and a FIRE_TRUCK crew. Write one test per defect,
   each using Jest 29's `it.failing(...)` so the suite stays green while the bug exists:
   - F5a: the fire crew resolves while the ambulance's transport is open → expected
     (correct) behaviour: the incident is NOT moved to RESOLVED and the ambulance's
     dispatch is NOT completed.
   - F5b: the incident is ASSISTING (fire crew tapped Treating on Scene) → expected: the
     ambulance can still begin a transport.
   - F5c: the incident is ON_SCENE (first unit arrived) → expected: the second unit's
     EN_ROUTE and ON_SCENE succeed.
   Each test asserts the CORRECT behaviour, so `it.failing` passes today. Add a comment
   above each: "Phase 1 turns this into it(...)".
3. Run the full backend suite; it must stay green.
4. Record in the plan's Progress log (Phase 0 row + section): each finding's result,
   and the three failing tests. Leave the Part B decisions untouched.

Report per Part C F, then STOP.
```

## Prompt 1 — Multi-unit safety

```
You are working on the AGAP monorepo. Read #file:CLAUDE.md, then Part A, Part B (D3, D4)
and Part C of docs/plans/UNIT_FIELD_FLOW_PROMPTS.md, then "Phase 1" and the Progress log
of docs/plans/UNIT_FIELD_FLOW_PLAN.md. Follow Part C (A → F) exactly. If D3 or D4 is
blank in Part B, stop and tell me.

Implement Phase 1 of the plan as Part B's D4 answer says.

Must reuse (do not re-create):
- RespondersService.applyStatus / updateStatus and STATUS_TO_INCIDENT; extend them.
- IncidentStatusService.recordTransition for every incident status change.
- openTransportWhere(...) for the open-transport check (now across ALL dispatches of the
  incident, not only the caller's).
- The existing `dispatch.updated` event for the new per-unit stamps (no new event).
- nextAssignmentActions in mobile/src/lib/assignment-progress.ts (extend; no second
  action builder).

Traps:
- The incident status only moves FORWARD. A second unit's EN_ROUTE / ON_SCENE stamps its
  own dispatch and returns success without an incident transition (no 409).
- A crew's RESOLVED completes only ITS dispatch and frees only ITS unit, unless it is the
  last active dispatch; then today's resolve path runs (all checks kept).
- A dispatcher's own resolve/close routes must keep working exactly as before.
- The ambulance-only flow (one unit) must behave exactly as today: run the e2e test.
- Migration: add en_route_at, on_scene_at, field_done_at (timestamptz, nullable) to
  dispatches. No backfill. Edit schema.prisma without reformatting other lines.

Tests:
- Turn the three Phase 0 `it.failing` tests in backend/test/responders/multi-unit.spec.ts
  into `it(...)`; they must pass.
- Add: the last crew finishing resolves the incident; the open-transport check sees
  another crew's open transport; a single-unit incident behaves as before.
- Mobile: assignment-progress cases for a second unit (its own progress is read from the
  dispatch stamps first).

Phase self-checks (add to Part C C):
- `grep -n "dispatch_id: dispatchId" backend/src/responders/responders.service.ts` no
  longer appears in the incident-level resolve's open-transport check.
- No test file was deleted; the Phase 0 tests are now plain `it`.

Report per Part C F, then STOP.
```

## Prompt 2 — Unit flow map, server rules, medical scoping, help request

```
You are working on the AGAP monorepo. Read #file:CLAUDE.md, then Part A, Part B (D3, D4)
and Part C of docs/plans/UNIT_FIELD_FLOW_PROMPTS.md, then "Phase 2" and the Progress log
of docs/plans/UNIT_FIELD_FLOW_PLAN.md. Follow Part C (A → F) exactly.

Implement Phase 2 of the plan, using Part B's D3 table for the unit → flow map.

Must reuse (do not re-create):
- One map only: shared/src/constants/unit-field-flow.ts exporting UNIT_FIELD_FLOWS and
  fieldFlowFor(resourceType). Export it from shared/src/constants/index.ts. Backend and
  mobile both import it from @agap/shared. Run `cd shared; pnpm build` after editing.
- The crew check pattern from assessment.service.ts (Part A10) for the medical scoping
  and the help request.
- findEscalationRecipients + NotificationsService.create + the JSON-path dedup pattern
  (Part A10) for the help request. Import NotificationsModule/AuditModule; never put
  their services in your providers.
- nextAssignmentActions: give it the flow as a parameter; keep one function.

Traps:
- The server enforces the flow, not just the app: TRANSPORTING by a non-MEDICAL_TRANSPORT
  unit → 409 { code: 'TRANSPORT_NOT_FOR_UNIT' }; ASSISTING by a non-MEDICAL_* unit → 409.
  Dispatcher routes are unchanged.
- fieldFlowFor must cover EVERY value of enum resource_type in schema.prisma
  (AMBULANCE, RESCUE_BOAT, FIRE_TRUCK, RESCUE_TRUCK, CLEARING_EQUIPMENT,
  MOTORCYCLE_RESPONDER, COMMAND_VEHICLE, OTHER). Unknown → GENERAL.
- Medical profile (F6): GET /v1/medical-profiles/:userId for a RESPONDER requires an
  active dispatch crewed by them on an incident whose reporter or a patient
  (incident_patients.user_id) is that user. Otherwise 403, audited. The
  sensitive_data_access_log purpose names the incident's public_reference. Dispatcher
  and Supervisor behaviour unchanged.
- Help request: POST /v1/responders/assignments/:id/help-request
  { need: 'AMBULANCE' | 'FIRE_UNIT' | 'RESCUE_UNIT' | 'MORE_PERSONNEL', count?, note?,
  clientRequestId? }. It notifies Dispatchers (IN_APP, eventType 'CREW_HELP_REQUESTED'),
  writes an incident event, emits to ops, dedups per incident + need for 5 minutes. It
  NEVER creates a dispatch or a MOD-35 request. The note never goes into the
  notification body or the WebSocket payload.
- Add the 'CREW_HELP_REQUESTED' click route (→ the incident) in NotificationBell.tsx.
- Mobile: the assignment header shows the unit type; ON_SCENE buttons per D3. The fire
  report and rescue trip buttons may route to placeholder screens marked "Phase 3" /
  "Phase 4" — or be hidden until those phases; say which you chose.

Tests: fieldFlowFor for every resource_type; transport refused for a fire truck, allowed
for an ambulance; ASSISTING refused for a fire truck; medical profile refused off-incident
and allowed on it (with the access-log purpose); help request notifies, dedups, creates no
dispatch and puts no note in the payload; mobile actions per flow.

Report per Part C F, then STOP.
```

## Prompt 2b — Finish Phase 2: the crew's "Request help" button

Prompt 2 stopped partway (Copilot credit limit). The backend half is done, reviewed
and tested. **Do not redo or "improve" it.** Read the plan's "Review — 2026-10-31
(Claude, Phases 0–2)" first: it lists what was fixed and why.

```
You are working on the AGAP monorepo. Read #file:CLAUDE.md, then Part A and Part C of
docs/plans/UNIT_FIELD_FLOW_PROMPTS.md, then "Phase 2" and the section "Review — 2026-10-31
(Claude, Phases 0–2)" in docs/plans/UNIT_FIELD_FLOW_PLAN.md. Follow Part C (A → F) exactly.

Already done and reviewed (read it; do NOT rewrite it):
- shared/src/constants/unit-field-flow.ts (UNIT_FIELD_FLOWS, fieldFlowFor) and
  shared/src/constants/notification-event-types.ts (CREW_HELP_REQUESTED).
- Server rules in RespondersService.applyStatus and TransportService.beginTransport
  (409 TRANSPORT_NOT_FOR_UNIT / ASSISTING_NOT_FOR_UNIT), the incident row lock
  (409 INCIDENT_STATUS_CHANGED), medical-profile scoping.
- POST /v1/responders/assignments/:id/help-request (RespondersService.requestHelp,
  HelpRequestDto) with backend/test/responders/help-request.spec.ts.
- mobile/src/lib/assignment-progress.ts: nextAssignmentActions(dispatchStatus,
  incidentStatus, transport, labels, progress, flow) and unitStep(). Every flow has
  Finish at ON_SCENE. Fire/rescue buttons are kind 'placeholder' until Phases 3/4.

Your job (mobile only, plus one tiny label helper):
1. mobile/src/services/api/responders.api.ts: add
   requestHelp(dispatchId, body: { need, count?, note?, clientRequestId? }, token)
   → POST /responders/assignments/:id/help-request, returning
   { deduplicated: boolean; incidentId: string }. Copy the style of updateAssignmentStatus.
   Import the need values from the backend contract by re-declaring
   CREW_HELP_NEEDS = ['AMBULANCE','FIRE_UNIT','RESCUE_UNIT','MORE_PERSONNEL'] in
   shared/src/constants/unit-field-flow.ts (export it, and the type CrewHelpNeed), then
   change backend/src/responders/dto/help-request.dto.ts to import it from @agap/shared
   instead of declaring its own copy. One source per concept (plan rule 4). Rebuild shared.
2. mobile/app/responder/assignment/[id].tsx: a "Request help" LinkRow under
   "On-Scene Assessment", shown while the assignment is ACCEPTED and the incident is not
   terminal, for EVERY unit type. Tapping it opens a simple chooser (Alert with buttons
   is fine, or a small modal): Ambulance / Fire unit / Rescue unit / More personnel,
   then an optional note (skip the note if a modal is too much; say which you chose).
   On success show "Dispatch has been told" (or "Dispatch was already told a few
   minutes ago" when deduplicated: true). On failure show the error and never lose the
   screen's state. Never block any status button while this runs.
   Default the chooser's first option by flow: FIRE/RESCUE/MEDICAL_FIRST/GENERAL →
   Ambulance first; MEDICAL_TRANSPORT → More personnel first.
3. The header subtitle shows a label instead of the raw enum: add
   UNIT_FIELD_FLOW_LABELS in unit-field-flow.ts (MEDICAL_TRANSPORT 'Ambulance',
   MEDICAL_FIRST 'First-aid unit', FIRE 'Fire unit', RESCUE 'Rescue unit',
   GENERAL 'Support unit') and use it: "BFP Fire Truck 1 · Fire unit".
4. Strings: add them to mobile/src/i18n/translations.ts in BOTH en and fil, like the
   existing transport strings. If you are unsure of the Filipino, write the English
   in fil and list it in your report for a person to translate.

Traps:
- Do NOT touch applyStatus, beginTransport, requestHelp, the medical service or their
  specs. If you think one is wrong, write it in the report instead.
- The note is free text: never put it in a log line (console.log, logger), and the
  phone must not echo it into any other request.
- Request help is NOT a status step: no outbox queueing, no change to
  nextAssignmentActions or its tests.
- No new npm dependencies.

Tests: mobile, a test for requestHelp() (method, path, body; copy an existing api test
if one exists, else a small fetch mock), and one that the label helper covers every
UNIT_FIELD_FLOWS value. Backend: the existing help-request.spec.ts must still pass after
the DTO import change. Then run everything in Part C D (backend, mobile, frontend,
typechecks, `cd shared; pnpm build`, `cd backend; pnpm test:e2e`).

Record: update the plan's Phase 2 row to "Complete" with today's date, add a
"Phase 2b" heading under the Progress log with what you did, and close O1/O2 in the
review section by writing "closed by Prompt 2b" next to them. Report per Part C F,
then STOP.
```

## Prompt 3 — Fire truck Input/Output

```
You are working on the AGAP monorepo. Read #file:CLAUDE.md, then Part A, Part B (D1, D5)
and Part C of docs/plans/UNIT_FIELD_FLOW_PROMPTS.md, then "Phase 3" and the Progress log
of docs/plans/UNIT_FIELD_FLOW_PLAN.md. Follow Part C (A → F) exactly. If D1 or D5 is
blank, stop and tell me.

Implement Phase 3 of the plan, with the fire fields exactly as Part B's D1 answer lists.

Must reuse (do not re-create):
- Constants in shared only: FIRE_ALARM_LEVELS, FIRE_STATUSES, FIRE_OCCUPANCY_TYPES,
  FIRE_HAZARDS (+ labels) in a new shared/src/constants/fire.constants.ts, exported from
  the constants index. The DTO uses @IsIn(...) with them.
- fieldFlowFor from Phase 2 for the "must be a FIRE unit" check.
- The assessment service's structure (crew check, transaction, best-effort audit,
  best-effort realtime) — copy its shape for FireReportService.
- One new event name `incident.field_report` in shared/src/events/incident.events.ts
  (Phase 4 reuses it with kind 'RESCUE'); its payload type in websocket-event.types.ts.
- addAgency's logic in incidents.service.ts for D5 (call or extract it; no second copy).
- The offline outbox pattern of mobile/src/services/offline/transport-outbox.ts.

Traps:
- Append-only: every report is a new fire_field_reports row; never UPDATE one. The
  latest row is the current picture.
- Every field optional; the endpoint accepts an empty report.
- clientRequestId: a repeat with the same ID returns the first result (idempotent).
- The WebSocket payload and notification bodies carry statuses, alarm level, hazard codes
  and counts only — never notes.
- Dangerous findings (FIREWORKS_EXPLOSIVES, trapped_persons > 0, alarm level ≥ D1's
  threshold, casualties_seen > 0 with no AMBULANCE dispatch on the incident) send an
  IN_APP notice to Dispatchers and Supervisors (eventType 'FIRE_REPORT_ALERT', deduped per
  incident + reason for 10 minutes, click → the incident). They NEVER dispatch, never
  activate surge.
- "Finish" on the phone shows a confirm if the latest fire status isn't FIRE_OUT; it never
  blocks.
- D5: dispatching a unit whose organization isn't yet on the incident adds it to
  incident_agency_participants (role_in_incident = the unit type), idempotent, audited,
  inside its own try/catch so a failure never breaks the dispatch.
- New mobile route file: tell me to restart Expo with `npx expo start -c` if it doesn't
  appear.

Tests: DTO validation; a non-fire unit and an off-incident responder are refused;
append-only; idempotent clientRequestId; payload has no notes; each alert reason notifies
once and never dispatches; the agency is added once and a failure there doesn't fail the
dispatch; mobile form body + offline queue; web drawer card renders the latest report.

Report per Part C F, then STOP.
```

## Prompt 4 — Rescue boat / truck Input/Output

```
You are working on the AGAP monorepo. Read #file:CLAUDE.md, then Part A, Part B (D2)
and Part C of docs/plans/UNIT_FIELD_FLOW_PROMPTS.md, then "Phase 4" and the Progress log
of docs/plans/UNIT_FIELD_FLOW_PLAN.md. Follow Part C (A → F) exactly. If D2 is blank,
stop and tell me.

Implement Phase 4 of the plan, with the rescue fields exactly as Part B's D2 answer lists.

Must reuse (do not re-create):
- Constants in shared only: WATER_LEVELS, RESCUE_ACCESS, RESCUE_TAKEN_TO (+ labels) in a
  new shared/src/constants/rescue.constants.ts.
- fieldFlowFor (RESCUE units only), the Phase 3 service shape, and the SAME
  `incident.field_report` event with kind 'RESCUE' (no new event name).
- haversineMeters from @agap/shared to sort evacuation centers by distance (no new
  distance function).
- The surge page's existing data source in backend/src/disaster-mode/ for per-barangay
  totals (extend it; no second surge endpoint if one fits).
- The offline outbox pattern.

Traps:
- One rescue_trip_reports row per trip; append-only. Counts ≥ 0; children + elderly +
  pwd + pregnant may overlap, but each ≤ rescued_count.
- taken_to = EVACUATION_CENTER requires taken_to_facility_id of an ACTIVE facility with
  facility_type EVACUATION_CENTER; otherwise 400.
- Rescue trips never create a TransportRecord (transport stays hospital-only).
- clientRequestId idempotency as in Phase 3.
- The crew's Finish with latest still_waiting > 0 → IN_APP notice to Dispatchers
  (eventType 'RESCUE_PEOPLE_WAITING', click → the incident). HANDED_TO_AMBULANCE with no
  AMBULANCE dispatch → a notice suggesting one. Neither dispatches anything.
- Payloads and notices carry counts and the destination facility name only; no notes,
  no names.
- Surge totals are per incident_locations.barangay, only while a surge is ACTIVE.

Tests: validation (counts, vulnerable ≤ rescued, evacuation center check); summary totals;
idempotency; Finish-with-waiting notice; handed-to-ambulance notice; surge per-barangay
totals; no notes in payloads; no TransportRecord written; mobile form + offline queue; web
drawer card.

Report per Part C F, then STOP.
```

## Prompt 5 — Ops view, docs, demo seed

```
You are working on the AGAP monorepo. Read #file:CLAUDE.md, then Part A and Part C of
docs/plans/UNIT_FIELD_FLOW_PROMPTS.md, then "Phase 5" and the Progress log of
docs/plans/UNIT_FIELD_FLOW_PLAN.md. Follow Part C (A → F) exactly.

Implement Phase 5 of the plan.

Traps:
- Ops view: show each unit's progress (en route / on scene / finished, with times) from
  the Phase 1 dispatch stamps in the incident drawer; reuse the existing queries and the
  `dispatch.updated` invalidation. No new endpoint unless the drawer's incident detail
  doesn't already include the dispatches; if you add one, say why.
- Seed (backend/prisma/seed/seed.ts): use upserts so re-running the seed is safe. Crew
  responder3 (BFP) with "BFP Fire Truck 1" on a demo FIRE incident in Bundukan, and
  responder2 with "MDRRMO Rescue Boat 1" on a demo FLOOD incident in Lolomboy. Use the
  exact barangay strings the seed already uses. Don't touch the existing demo dispatch
  (ALPHA-1 / INC-2026-DEMO01).
- Docs: update docs/modules/MOD-32_Responder_Ambulance_Crew_Mobile_Interface.md (scope now
  covers all unit types; add the unit → flow table from Part B D3), and the MOD-32, 34,
  36, 37, 52 rows in docs/100%ModulesFunctionalities+AdditionalModules.md, marked
  walkthrough pending.
- Write the walkthrough checklist (plan Phase 5) into the Progress log for a person.

Report per Part C F, then STOP.
```

## Prompt R — Independent review of a phase (run after each phase, in a new chat)

Replace `N` with the phase number.

```
You are reviewing Phase N of docs/plans/UNIT_FIELD_FLOW_PLAN.md, implemented in an
earlier chat (uncommitted). Do not re-implement it.

1. Read #file:CLAUDE.md, Part A, Part B and Part C of
   docs/plans/UNIT_FIELD_FLOW_PROMPTS.md, the plan's Rules and Phase N, Prompt N in Part
   D, and the Phase N section of the plan's Progress log.
2. Find the phase's changes with `git status --short` and `git diff`, limited to the files
   the Progress log lists plus new untracked files of this phase.
3. Check, with evidence (file:line), each of:
   a. Every numbered step, "Must reuse" item, trap and "Done when" box is really done;
      ticked boxes are true.
   b. Bugs: wrong conditions, missing awaits, unhandled promise rejections, wrong Prisma
      filters, route order, status-transition logic, dedup windows, null cases, offline
      idempotency.
   c. Duplication: two definitions of the same constant, event, route, eventType,
      helper or migration; a service provided in a second module; logic copied instead
      of reused.
   d. Part A9 rules: nothing dispatches/closes/activates by itself; optional data never
      blocks; a failing audit/emit/notification never changes the incident; no names or
      notes in payloads, notices or logs; medical access scoped.
   e. Tests assert behaviour (stored values, filters, refusals, payload contents), not
      just that a mock was called; no existing test was weakened, skipped or deleted.
   f. The single-ambulance emergency flow behaves exactly as before (e2e green).
4. Fix only confirmed problems, smallest change first. Then run Part C D in full.
5. Add a "### Review — <date> (Phase N)" section under Phase N in the Progress log:
   findings, fixes, test counts, anything left open. Don't commit.

Report the findings (fixed / open) and the test counts, then STOP.
```
