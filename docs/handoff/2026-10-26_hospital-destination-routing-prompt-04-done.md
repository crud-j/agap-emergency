# Handoff: Hospital destination routing — pack revised (C14–C18, Prompt 08B), Prompt 04 implemented

**Date:** 2026-10-26
**For:** the next agent continuing this work cold. **Nothing has been committed.** The user did not ask for a commit.
**Previous handoff (read it too, its facts still hold):** [`2026-10-25_hospital-destination-routing-prompts-00-03.md`](./2026-10-25_hospital-destination-routing-prompts-00-03.md)
**Work:** implementing [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md) (MOD-38/39/40/43) through the prompt pack [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md). Progress log: [`docs/HOSPITAL_ROUTING_PROGRESS.md`](../HOSPITAL_ROUTING_PROGRESS.md).

---

## How the user works

1. The user runs one prompt per fresh agent session. That agent appends a report to the progress log.
2. The user brings the summary back and asks: **"verify it was accurately implemented: no errors, duplication or wrong executions."** Check the code, DB and tests directly, never just the summary. Fix what is wrong when asked, and correct later prompts or the plan when the code disagrees with them.
3. The user cares most about **no duplication** and **accurate `schema.prisma` / DB data**.
4. This session broke the pattern once: the user pasted Prompt 04 here and this session implemented it. **Prompt 04 has not had an independent review.** Offer one if the user wants it.

**Likely next request:** the user runs **Prompt 05** (hospital registry UI) and/or **Prompt 06** in another session, then asks for a review. Or the user asks for an independent review of Prompt 04 first.

---

## Where things stand

| Prompt | Status | Notes |
|---|---|---|
| 00–03 | DONE, reviewed | See previous handoff |
| Pack revision | DONE (docs only) | Corrections C14–C18, new Prompt 08B, plan §10/§13.2/§14/§17/Table E updated |
| 04 Transport correctness | **DONE by this session, not independently reviewed** | Report in the progress log |
| 05 Hospital registry UI | Not started | Gate: 03 (met). Completes Phase 1 |
| 06–09, 08B | Not started | 06 gate: Phase 1 (01–05) done |
| 10–16, A1 | Not started | 10 gate also needs DPO sign-off on the C17 rule |

**Baseline failures (pre-existing; do not "fix" as part of this work):**
- `backend/test/barangay-coordination/barangay-notify.spec.ts` › closes notices on FALSE_ALERT (`tx.false_alerts` undefined in the mock).
- `backend/test/auth/auth-phase3.spec.ts` (sometimes `auth-phase2`) may time out in the full run and pass alone. It did not occur in the last run.
- backend lint: 1 error, `src/incidents/incidents.service.ts:91` unused `actorRole`. Warnings now **284** (were 288).
- frontend `pnpm typecheck` fails with TS5033 (cannot write tsbuildinfo). Use `npx tsc --noEmit --incremental false`.
- **New finding:** the root `tests/` runner (`pnpm --dir tests test -- backend/...`) has 15 failures because `tests/` loads a second copy of `@nestjs/common`, so `toThrow(NotFoundException)` / `instanceof` fail ("Expected constructor: NotFoundException / Received constructor: NotFoundException"). Not caused by this work. Not in CI.

Last full backend run (after Prompt 04): **60/61 suites, 897/898 tests**. The only failure is the barangay-notify one above.

The working tree had ~268 uncommitted files before this work started (referrals, announcements, auth, …). Do not attribute them to this work.

---

## What this session did

### 1. Plan/prompt review and pack revision (docs only)
New corrections in the prompts file, which override the plan:
- **C14**: ETA job resolves the leg when it runs and adds only `reason`. It does not store `leg`/`targetLat`/`targetLng`.
- **C15**: status + `IncidentEvent` writes are also hand-written in `markFalseAlert`, the duplicate merge, `false-alerts.service.ts`, `dispatch.service.ts`, `emergency-alerts.service.ts` and `barangay-callback.service.ts`. Out of scope; recorded as a follow-up.
- **C16**: one "open transport" definition, `openTransportWhere()` = `arrived_at: null` AND incident status `TRANSPORTING`. Prompts 07/08/09 must import it.
- **C17 (privacy, reporter destination rule)**: reporters get **status only** by default. The only exception is a registered reporter whom the **crew confirmed** as the patient on that transport (`transport_records.reporter_patient_confirmed_at/_by_id`, audited). The reporter's own "I am the patient" (`is_reporter`, `reporter_status`) never unlocks anything; it is a hint for the crew only. Guests have no token and no tracking. Applies to REST, WS, push and SMS.
  - Why it lives on `transport_records`: mobile never sends `patientId` when starting a transport, so `transport_records.patient_id` is effectively always null.
  - Reporter link: `incident_reporters.user_id` (null for guests).
- **C18**: incident-room copies of `incident.transporting` and `incident.facility_arrival` become status-only (no `patientId`, `destinationId`, `destinationName`, `destination`). `incident.transport_updated` never goes to the incident room. The hospital-leg route never goes to the incident room, even before Prompt 09.
- **New Prompt 08B** (run after 08, before 09): migration + `PATCH /incidents/:id/transport/:tid/reporter-patient { confirmed }` + `reporterClaimsPatient` hint in `listTransports`.
- Prompt 09 enforces C17 server-side. Prompt 10 adds the crew switch. Prompt 11's device check uses three reporters (bystander / claimed-not-confirmed / crew-confirmed).
- Plan §17 is rewritten with the rule table. The DPO sign-off gate before Prompt 10 now covers this rule.

### 2. Prompt 04 implemented
Files: see the "Prompt 04" section of the progress log. Key facts:
- `IncidentStatusService.statusTimestampFields(status, at)` and `recordTransition(tx, { incidentId, from, to, actorId, actorRole?, notes?, at? }) → Incident`. The update uses `where: { id, status: from }`; P2025 → `ConflictException { code: 'INCIDENT_STATUS_CHANGED' }`. **Verified on the real DB that Prisma 7 accepts the non-unique `status` condition.**
- `IncidentsService.updateStatus` and `RespondersService.updateStatus` both call it. RespondersService keeps its own 409 pre-check.
- `RespondersService` constructor is now `(prisma, realtime, audit, statusService, statusNotifier?)`. `RespondersModule` imports `IncidentsModule` (which exports `IncidentStatusService`), the same pattern as `false-alerts.module.ts`.
- New `backend/src/incidents/transport/open-transport.ts` (`openTransportWhere`).
- New `backend/src/hospitals/destination-rules.ts`: `UNREVIEWED_STATUSES` (moved from hospitals.service), `assertSelectableDestination(prismaOrTx, facilityId) → { id, name, receiving_status, warnings }`. It requires active + `HOSPITAL` + not PENDING_REVIEW/REJECTED; AT_CAPACITY/CLOSED → warning `FACILITY_AT_CAPACITY`. An UNVERIFIED hospital (e.g. seed "Bocaue General Hospital", no coords) **is** selectable by design.
- New `backend/src/hospitals/facility-view.ts`: `toFacilityView` (moved from private `HospitalsService.toHospitalView`). It converts Decimals only for fields present on the input and drops `location`.
- `backend/src/organizations/org-scope.ts`: `activeMemberOrgIds(prisma, userId)`. Private `memberOrgIds` removed from HospitalsService.
- `TransportService.startTransport`: status gate (ON_SCENE/TRANSPORTING else 409 `TRANSPORT_NOT_ALLOWED_IN_STATUS`), then dispatch/crew/open-transport/destination checks, then one `$transaction` (create + `recordTransition` when ON_SCENE + `audit.logInTransaction`), then emits after commit. Returns `{ ...record, warnings }`.
- `listTransports(incidentId, actor)`: HOSPITAL_USER scoped by `facilities.organization_id in activeMemberOrgIds`, 403 if none. Facilities include numeric lat/lng, `location_status`, `receiving_status`.
- `recordArrival` / `updateTransport` use `assertSelectableDestination` but still audit with fire-and-forget `audit.log` (Prompt 08 moves them into transactions).
- ETA processor: the `transportRecord.updateMany` write is removed, with a comment pointing to Prompt 07.
- Test plumbing changed (constructor args only): `dispatch-tracking.spec.ts`, `reporter-sex.spec.ts`, `reporter-status-push.spec.ts`, `barangay-notify.spec.ts` (real status service with `validateTransition` stubbed), `tests/backend/responders.service.spec.ts`.

Duplication check results after Prompt 04 (expected state):
- `grep -rn "PENDING_REVIEW" backend/src` → the list only in `destination-rules.ts`; `hospitals.service.ts` has status assignments (114, 211) and comments.
- `grep -n "incidentEvent.create"` in incidents/responders services → only `incidents.service.ts` 227 (creation), 799 (markFalseAlert), 895 (merge). These are the C15 follow-up.
- `grep -rn "arrived_at: null" backend/src` → `open-transport.ts` plus `patient_arrived_at: null` in hospitals.service (the referral field).

---

## What to check when reviewing Prompt 05 (frontend hospital registry UI)

- Uses the API shapes from Prompt 03: numeric `latitude`/`longitude`, `location_status`, the 422 `COORDINATES_LIKELY_SWAPPED` (with `suggested`), `COORDINATES_OUT_OF_SERVICE_AREA`, and 409 `DUPLICATE_FACILITY` (`existingFacilityId`, `existingName`).
- Paths: the frontend calls through its base URL. The backend serves `/v1/...` (C10).
- `HospitalMarker.tsx` created once under `frontend/components/map/` (reused in Prompt 12). No second marker component.
- Status badges for all four statuses. Verify/Reject only for Supervisor/System Admin. `includeUnreviewed=true` only for roles allowed by `reviewVisibility`.
- Org Admin create: backend requires `organizationId` (400 if missing), membership (403) and a HOSPITAL-type org (403).
- Frontend checks: `cd frontend && npx tsc --noEmit --incremental false && pnpm lint && pnpm test`.
- No edits to `bocaue.geojson`, `frontend/lib/bocaue-geo.ts` or `shared/src/maps/bocaue-boundary.ts`.

## What to check when reviewing Prompt 06 (shared contracts + emitters)

- C18 is applied exactly: incident-room copies of `transporting`/`facility_arrival` are status-only; `transportUpdated(payload, userIds)` never calls `emitToIncident`; `routeUpdated(payload, { incidentRoom, userIds })`.
- No duplicate destination field (the old `destinationName` vs the new `destination.name`) in the incident-room copy.
- After any `shared/` change: `pnpm --filter @agap/shared build`, then mobile `pnpm typecheck` and frontend `npx tsc --noEmit --incremental false`.

---

## How to verify quickly (patterns that worked)

- **Real code against the local DB:** write a `.ts` script to the scratchpad that `require`s `process.cwd() + '/src/...'`, construct `new PrismaService()`, and run it from `backend/` with `npx ts-node -T -O '{"module":"commonjs"}' <script>`. Wrap writes in `prisma.$transaction` and throw a sentinel error to roll back. `incidentEvent` orders by `occurred_at` (it has no `created_at`).
- **Focused tests:** `cd backend && npx jest --config ./test/jest.config.ts test/incidents test/locations test/hospitals test/maps`.
- **Tests are transpiled per file** (`isolatedModules`), so constructor-signature mistakes in specs show only at run time. `pnpm typecheck` checks `src/` only.
- **`exactOptionalPropertyTypes` is on:** pass optional fields as `...(value && { key: value })`, not `key: maybeUndefined`.
- The shared `IncidentStatus` enum is assignable to Prisma's `incident_status`, so no `as any` is needed for status fields. `triggered_by_role` is the `user_role` enum.
- **Bash gotchas:** a long heredoc with backticks/quotes in the Bash tool can fail to parse. Use the Edit/Write tools for docs. `node -e` with `$` or backticks breaks; write a file instead.

---

## Open items / decisions pending with the user

- **LGU Data Protection Officer sign-off** on the C17 rule (plan §17) gates Prompt 10. Not obtained yet.
- **Independent review of Prompt 04** has not happened (this session implemented it).
- Follow-ups recorded in the progress log: C15 `recordTransition` candidates; the root `tests/` runner `@nestjs/common` duplication; transport audit for arrival/update moves into transactions in Prompt 08.
- Still open from before: `incident_locations.point` NULL (optional Prompt A1); the service area is Bulacan only (Metro Manila referral corridor via config, Prompt 07/09 area).
