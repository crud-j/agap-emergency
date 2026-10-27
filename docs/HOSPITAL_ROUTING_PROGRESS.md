# AGAP Hospital Destination Routing Progress

Plan: [HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md](./HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md)

Prompts: [HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md](./HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md)

## Follow-ups

- The adjacent `incident_locations.point` issue described in plan §7 remains outside this prompt.
- Backend full-suite baseline failure remains in `test/barangay-coordination/barangay-notify.spec.ts`.
- Backend baseline lint has one pre-existing error in `backend/src/incidents/incidents.service.ts:91`.
- Frontend baseline typecheck cannot write `frontend/tsconfig.tsbuildinfo` (use `npx tsc --noEmit --incremental false`).

## Prompt 00 — Preflight, baseline and database checks — 2026-10-25

Status: PARTIAL (baseline checks completed; pre-existing backend test/lint and frontend typecheck failures recorded)

Files changed:
- `docs/HOSPITAL_ROUTING_PROGRESS.md`

Tests added/updated: None

Baseline git state:
- `git rev-parse --short HEAD` → `c9d03c1`
- `git status --short | wc -l` equivalent count → `268`

Focused backend baseline:
- `cd backend && npx jest --config ./test/jest.config.ts test/incidents/transport.spec.ts test/locations/eta-refresh.spec.ts test/hospitals/referrals.spec.ts test/locations/location-bounds.spec.ts test/locations/live-tracking.spec.ts`
  → 5 suites passed; 60 tests passed; 0 failed.

Full baseline verification:
- `cd backend && pnpm test` → 59 suites total; 58 passed; 1 failed. 843 tests total; 842 passed; 1 failed. Pre-existing failure: `backend/test/barangay-coordination/barangay-notify.spec.ts`, `incident status closes the barangay notice › closes notices on FALSE_ALERT`; `tx.false_alerts` is undefined in the test mock.
- `cd backend && pnpm typecheck` → passed.
- `cd backend && pnpm lint` → failed: 1 error and 285 warnings. Pre-existing error: `backend/src/incidents/incidents.service.ts:91`, unused `actorRole`; warnings are primarily existing explicit-`any` diagnostics.
- `cd frontend && pnpm test` → passed; 4 suites and 60 tests passed.
- `cd frontend && pnpm typecheck` → failed with `TS5033`: unable to write `frontend/tsconfig.tsbuildinfo` (`UNKNOWN: unknown error`).
- `cd mobile && pnpm test` → passed; 2 suites and 8 tests passed.
- `cd mobile && pnpm typecheck` → passed.
- `pnpm --filter @agap/shared build` → passed.
- `pnpm --filter @agap/shared typecheck` → passed.

Root `tests/` runner:
- `tests/backend/responders.service.spec.ts` exists.
- Exact runner command: `pnpm --dir tests test -- backend/responders.service.spec.ts`
- The root `tests/` runner is not referenced by `.github/workflows/ci.yml`.
- Not run in Prompt 00 because this step required determining the wiring, not changing or validating the unrelated runner.

Local database checks:
- Database connection: reachable through `backend/.env` `DATABASE_URL`; credentials and URL were not printed.
- a. `SELECT count(*) FROM facilities WHERE location IS NOT NULL;` → `0`
- b. Duplicate active hospital name/municipality query → no rows.
- c. `SELECT id, name, facility_type, organization_id FROM facilities ORDER BY id;` → 5 rows:
  - `00000000-0000-0000-0002-000000000001` — Bocaue General Hospital — `HOSPITAL` — organization `00000000-0000-0000-0001-000000000003`
  - `00000000-0000-0000-0002-000000000002` — Lolomboy Barangay Hall Evacuation Center — `EVACUATION_CENTER` — no organization
  - `00000000-0000-0000-0002-000000000003` — Bambang Evacuation Center — `EVACUATION_CENTER` — no organization
  - `00000000-0000-0000-0002-000000000004` — Bunlo Barangay Hall — `BARANGAY_HALL` — no organization
  - `00000000-0000-0000-0002-000000000005` — Igulot Evacuation Center — `EVACUATION_CENTER` — no organization
- d. `SELECT count(*) FROM transport_records;` → `0`
- d. `SELECT count(*) FROM transport_records WHERE arrived_at IS NULL;` → `0`
- e. `SELECT extversion FROM pg_extension WHERE extname='postgis';` → PostGIS `3.6.0`
- f. `cd backend && npx prisma migrate status` → database schema is up to date; Prisma found 20 migration folders and reported no pending or failed migrations.

Gate for Prompt 01: PASS — facilities with existing geography are `0`, duplicate active hospitals returned no rows, and Prisma reported no pending or failed migrations. Prompt 01 may proceed; the migration-count discrepancy (20 found versus the prompt's stated 21) is recorded under Follow-ups.

Verification: all Prompt 00 baseline commands and database checks above were run; no source code, Prisma schema, or migration files were modified.

Deviations from plan/prompt: Root `tests/` test command was identified but not executed because the step requested runner discovery; the migration status reported 20 folders rather than the prompt's stated 21, with no pending or failed migrations.

Follow-ups: See the top-level Follow-ups section.

## Prompt 01 — Facility coordinate schema and synchronization — 2026-10-25

Status: DONE

Files changed:
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20261025120000_facility_coordinates/migration.sql`
- `backend/prisma/migrations/20261025120000_facility_coordinates/down.sql`
- `docs/HOSPITAL_ROUTING_PROGRESS.md`

Tests added/updated: None

Implementation:
- Added nullable decimal latitude/longitude fields, location verification metadata, the `facility_location_status` enum, verifier relation, and Prisma indexes to `Facility`.
- Added the matching verifier back-relation to `User`.
- Added the hand-written local migration with the enum, columns, foreign key, five CHECK constraints, geography synchronization trigger/function, indexes, and requested partial unique indexes.
- Added the documented manual rollback script.

Verification:
- `cd backend && npx prisma validate` → passed.
- `cd backend && npx prisma format` → passed.
- `cd backend && npx prisma migrate dev` → passed; local database reported already in sync with no reset or extra SQL proposed.
- `cd backend && npx prisma generate` → passed.
- `cd backend && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `-- This is an empty migration.`
- `cd backend && npx prisma migrate status` → passed; 21 migrations found and database schema up to date.
- Transactional PostGIS probe → passed; coordinates `14.79679, 120.94358` produced `POINT(120.94358 14.79679)`, clearing both coordinate fields cleared `location`, latitude `95` violated `facilities_lat_range_chk`, an unpaired coordinate violated `facilities_latlng_pair_chk`, and `VERIFIED` without coordinates violated `facilities_verified_has_point_chk`. All probe changes were rolled back. The pair CHECK means latitude and longitude must be cleared together.
- `cd backend && pnpm typecheck` → passed.
- `cd backend && pnpm test` → 59 suites total; 57 passed and 2 failed. The known pre-existing `backend/test/barangay-coordination/barangay-notify.spec.ts` failure remained (`tx.false_alerts` is undefined in the test mock). `backend/test/auth/auth-phase3.spec.ts` timed out during the full run, but an isolated rerun passed 1 suite and 72 tests, so it was treated as a transient test-run failure rather than a Prompt 01 regression.

Deviations from plan/prompt:
- Prisma 7 generated an empty duplicate migration during the initial create-only validation attempt; that specifically generated folder was removed, leaving only the requested hand-written migration. No extra database migration was retained.
- Prisma format aligned several existing schema blocks in addition to the new fields; no semantic schema changes outside Prompt 01 were made.
- The exact instruction “UPDATE latitude to NULL” cannot succeed alone because the required latitude/longitude pair CHECK rejects an unpaired coordinate. The probe cleared both fields together and verified the intended null-location behavior.

Follow-ups: Existing backend lint/test failures and the frontend typecheck filesystem failure remain documented in the Prompt 00 baseline; no Prompt 02 work was started.

## Prompt 02 — Seed reference hospital and shared geo helpers — 2026-10-25

Status: DONE

Files changed:
- `backend/prisma/seed/seed.ts`
- `shared/src/maps/map.types.ts`
- `shared/src/maps/service-area.ts`
- `shared/src/maps/index.ts`
- `scripts/dev/generate-service-area.ts`
- `backend/test/maps/service-area.spec.ts`
- `docs/HOSPITAL_ROUTING_PROGRESS.md`

Tests added/updated:
- `backend/test/maps/service-area.spec.ts`

Implementation:
- Added the idempotent fixed-UUID upsert for `DOH — Joni Villanueva General Hospital`, with coordinate and verification fields in both `create` and `update`.
- Kept the fictional Bocaue General Hospital unverified and without coordinates, and left `organization_id` unset for the DOH facility.
- Added `toLngLat`, the pinned Bulacan ADM2 service-area polygon, service-area membership and swapped-coordinate detection helpers, and the optional extra-polygon hook.
- Added the reproducible geoBoundaries generator pinned to commit `9469f09592ced973a3448cf66b6100b741b64c0d`.

Verification:
- `cd backend && pnpm prisma db seed` → passed.
- `cd backend && pnpm prisma db seed` (second run) → passed; reseed remained idempotent.
- Database query for `%Joni Villanueva%` → exactly one row: id `00000000-0000-0000-0002-000000000006`, latitude `14.7967900`, longitude `120.9435800`, status `VERIFIED`, geometry `POINT(120.94358 14.79679)`.
- `pnpm --filter @agap/shared build` → passed.
- `pnpm --filter @agap/shared typecheck` → passed.
- `cd backend && npx jest --config ./test/jest.config.ts test/maps` → 2 suites passed; 7 tests passed.
- `cd backend && pnpm typecheck` → passed.
- Generator execution via `backend/node_modules/.bin/ts-node.cmd scripts/dev/generate-service-area.ts` → passed; generated 500 polygon points.

Deviations from plan/prompt: None. The real pinned Bulacan ADM2 polygon was downloaded and used; no fallback polygon or follow-up was needed.

Follow-ups: None.

## Prompt 03 — Hospital registry coordinates and review workflow — 2026-10-25

Status: PARTIAL (implementation and focused verification passed; full backend checks retain baseline failures)

Files changed:
- `backend/src/hospitals/hospitals.controller.ts`
- `backend/src/hospitals/hospitals.service.ts`
- `backend/src/hospitals/dto/create-hospital.dto.ts`
- `backend/src/hospitals/dto/update-hospital.dto.ts`
- `backend/src/hospitals/dto/nearby-query.dto.ts`
- `backend/src/hospitals/dto/set-location.dto.ts`
- `backend/src/hospitals/dto/verify-location.dto.ts`
- `backend/test/hospitals/hospital-location.spec.ts`
- `docs/HOSPITAL_ROUTING_PROGRESS.md`

Tests added/updated:
- Added `backend/test/hospitals/hospital-location.spec.ts` covering coordinate serialization, visibility filtering, DTO validation, service-area and swapped-coordinate errors, duplicate detection, role-specific creation, verification, audit calls, and same-name/different-municipality behavior.
- Existing `backend/test/hospitals/referrals.spec.ts` remained green.

Implementation:
- Hospital responses now omit the unsupported `location` field and serialize Prisma Decimal coordinates/confidence as numeric values or `null`.
- Added role-aware `includeUnreviewed`, validated nearby queries with PostGIS straight-line distance, coordinate input DTOs, duplicate conflict responses, service-area validation, create/set/verify location workflows, organization checks, audit entries, and the Prompt 08 no-op hook.
- Registered the nearby and location routes before the parameterized hospital route.

Verification:
- `cd backend && npx jest --config ./test/jest.config.ts test/hospitals` → 2 suites passed; 32 tests passed.
- `cd backend && pnpm typecheck` → passed.
- `cd backend && pnpm lint` → failed only on the pre-existing `backend/src/incidents/incidents.service.ts:91` unused `actorRole` error; 288 existing warnings.
- `cd backend && pnpm test` → 61 suites total; 58 passed and 3 failed. 858 tests total; 853 passed and 5 failed. Failures were the known `backend/test/barangay-coordination/barangay-notify.spec.ts` mock failure and auth timeout failures in `backend/test/auth/auth-phase2.spec.ts` and `backend/test/auth/auth-phase3.spec.ts`; these are unrelated to the hospital changes and the phase-3 suite had also shown transient timeout behavior in the prior prompt.
- Local backend API smoke test with a redacted token → `GET /v1/hospitals` returned `200`. The seeded DOH hospital appeared exactly once with JSON numbers `latitude: 14.79679`, `longitude: 120.94358`, `location_status: "VERIFIED"`, and no `location` field. The API uses `/v1/hospitals` in this repository (there is no `/api` global prefix).

Deviations from plan/prompt:
- Status is PARTIAL because the required full backend lint/test commands retain pre-existing failures; no hospital-related failure was observed.
- The API smoke token was generated and used locally without printing it; the recorded response is token-redacted.

Follow-ups:
- Resolve the pre-existing backend lint error and unrelated full-suite failures separately.
- Prompt 13 still owns geocoding and AI-assisted location lookup; no geocoding or AI was added here.

## Post-review fixes for Prompts 02 and 03 — 2026-10-25

Status: DONE (independent review found one duplication in Prompt 02 and two bugs plus minor issues in Prompt 03)

Prompt 02 fixes (duplication):
- New `shared/src/maps/polygon.ts` holds the single point-in-polygon implementation (`isPointInRing`, `LngLatRing`). `bocaue-boundary.ts` keeps its bounding-box pre-check and now calls it; `service-area.ts` calls it too. The private `isPointOnSegment` copy is gone from both files.
- The generated polygon moved to `shared/src/maps/service-area.data.ts`; `service-area.ts` is hand-written helpers only and re-exports the data.
- `scripts/dev/generate-service-area.ts` writes only the data file (it no longer embeds helper code as a string). Re-run from the network → byte-identical output; polygon numbers identical to the Prompt 02 version.

Prompt 03 fixes:
- `POST /hospitals` now allows `ORG_ADMINISTRATOR` (was System Administrator only, so the Org Admin → PENDING_REVIEW path was unreachable over HTTP).
- `findAll(includeUnreviewed)` for an Org Administrator returns the shared directory plus their own orgs' unreviewed hospitals (it previously returned only their own orgs). One `reviewVisibility` helper is used by `findAll` and by `GET /hospitals/:id` (new `findVisibleById`), which now hides PENDING_REVIEW/REJECTED hospitals from non-reviewers. The membership lookup runs only when needed.
- Duplicate check treats a missing municipality as NULL or '' (same as the DB unique index), so the 409 carries `existingFacilityId`/`existingName`; the source-ref check spans all facilities like `uq_facilities_location_source_ref`.
- `create`: missing `organizationId` for an Org Admin → 400 (was 403); unknown organization → 400 (was a foreign-key 500); audit stores numeric lat/lng (was Decimal strings); indentation repaired.
- Merged the duplicate `@agap/shared` import.
- 8 new tests in `backend/test/hospitals/hospital-location.spec.ts` (route roles metadata, Org Admin visibility, membership lookup skipped, GET :id visibility, NULL-municipality duplicate, 400/403 Org Admin create, unknown org, numeric audit), and the same-name/different-municipality test now asserts the query shape.

Verification:
- `pnpm --filter @agap/shared build` and `typecheck` → passed.
- `cd backend && npx jest --config ./test/jest.config.ts test/hospitals test/maps` → 4 suites, 47 tests passed.
- `cd backend && pnpm typecheck` → passed; `npx eslint src/hospitals test/hospitals` → 0 errors.
- `cd backend && pnpm test` → 59/61 suites, 863/866 tests; failures are the pre-existing `barangay-notify.spec.ts` and the `auth-phase3.spec.ts` timeout (passes alone: 59/59).
- `cd mobile && pnpm typecheck` → passed; `cd frontend && npx tsc --noEmit --incremental false` → passed (avoids the known tsbuildinfo write error).
- Live local DB (real `HospitalsService`, no writes): nearby returns numeric coordinates ordered by distance without `location`; Org Admin unreviewed list includes the shared directory; case-insensitive name+municipality duplicate and the OSM source-ref duplicate both → 409 with the existing facility id/name.

Prompt and plan corrections made for Prompt 04 onward (see Corrections C10–C13 in the prompts file):
- C10: backend paths are `/v1/...`, not `/api/v1/...` (plan §11 note added).
- C11: `IncidentStatusService` only validates; Prompt 04 now adds one `recordTransition` and removes the two inline copies (plan §12 note added).
- C12/C13: Prompt 04 now shares the destination rule (`destination-rules.ts`) and the membership helper (`activeMemberOrgIds` in `org-scope.ts`) instead of re-creating them. Prompt 08 updated to reuse both.

Follow-ups: none new.

## Prompt pack revision before Prompt 04 — 2026-10-26

Status: DONE (docs only; no code, schema or database changes)

Files changed:
- `docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`
- `docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`
- `docs/HOSPITAL_ROUTING_PROGRESS.md`

Why: an independent review of the plan and prompts against the code found two Prompt 04 gaps, two privacy gaps in Prompts 06/09, and an "open transport" definition that later prompts would each have re-created.

Changes (Corrections C14–C18 in the prompts file):
- Prompt 04: `recordTransition` returns the updated incident (`IncidentsService.updateStatus` returns it) and refuses a concurrent change (`where { id, status: from }`, P2025 → 409 `INCIDENT_STATUS_CHANGED`). The other hand-written status writes stay as they are and go to Follow-ups (C15). New `openTransportWhere()` in `backend/src/incidents/transport/open-transport.ts` (C16). Duplication-check expectations corrected.
- Prompts 06/07/08: incident-room copies of `incident.transporting` and `incident.facility_arrival` are status-only (no `patientId`, `destinationId`, `destinationName`, `destination`); `incident.transport_updated` never goes to the incident room; the hospital-leg route never goes to the incident room, even before Prompt 09 (C18).
- Reporter destination rule (C17, plan §17 rewritten): reporters get status only by default. The only exception is a registered reporter the crew confirmed as the patient on that transport. The reporter's own "I am the patient" answer never unlocks it. Guests have no tracking. New **Prompt 08B** adds `transport_records.reporter_patient_confirmed_at/_by_id` and a crew endpoint; Prompt 09 enforces the rule; Prompts 10/11 add the crew switch and the three-reporter device check.
- Plan: correction notes on §10 (trigger, not generated column) and §13.2 (C14/C16); §14 event rows, §17, Scenario C and Table E citizen rows updated.

Gate reminder: the LGU Data Protection Officer sign-off before Prompt 10 now covers the C17 rule.

Follow-ups: none new.

## Prompt 04 — Transport correctness fixes (Phase 1 part) — 2026-10-26

Status: DONE

Files changed:
- `backend/src/incidents/incident-status/incident-status.service.ts` (`statusTimestampFields`, `recordTransition`)
- `backend/src/incidents/incidents.service.ts` (`updateStatus` uses `recordTransition`)
- `backend/src/responders/responders.service.ts` (`updateStatus` uses `recordTransition`; `IncidentStatusService` injected before the optional notifier)
- `backend/src/responders/responders.module.ts` (imports `IncidentsModule`, same pattern as `false-alerts.module.ts`; no cycle)
- `backend/src/incidents/transport/open-transport.ts` (new: `openTransportWhere`)
- `backend/src/hospitals/destination-rules.ts` (new: `UNREVIEWED_STATUSES` moved here, `assertSelectableDestination`)
- `backend/src/hospitals/facility-view.ts` (new: `toFacilityView`, moved from the private `HospitalsService.toHospitalView`)
- `backend/src/hospitals/hospitals.service.ts` (imports the three moved pieces; private `memberOrgIds` and `toHospitalView` removed)
- `backend/src/organizations/org-scope.ts` (`activeMemberOrgIds`)
- `backend/src/incidents/transport/transport.service.ts`
- `backend/src/incidents/incidents.controller.ts` (`listTransports` receives the actor)
- `backend/src/jobs/processors/eta-refresh.processor.ts` (scene ETA no longer written to `transport_records`)
- Tests: `backend/test/incidents/transport.spec.ts` (rewritten setup + new cases), `backend/test/incidents/incident-status.spec.ts`, `backend/test/locations/eta-refresh.spec.ts`; constructor plumbing only in `backend/test/dispatch/dispatch-tracking.spec.ts`, `backend/test/incidents/reporter-sex.spec.ts`, `backend/test/notifications/reporter-status-push.spec.ts`, `backend/test/barangay-coordination/barangay-notify.spec.ts`, `tests/backend/responders.service.spec.ts`
- `docs/HOSPITAL_ROUTING_PROGRESS.md`

Implementation:
- `recordTransition(tx, …)` validates, updates `where { id, status: from }` (P2025 → 409 `INCIDENT_STATUS_CHANGED`), writes the `IncidentEvent`, and returns the updated incident. Both former inline copies call it. `ResponderService` keeps its own 409 pre-check, so its error contract is unchanged.
- `startTransport`: only ON_SCENE (transitions) or TRANSPORTING (no transition); anything else → 409 `{ code: 'TRANSPORT_NOT_ALLOWED_IN_STATUS', status }`. `transitionable` (which wrongly included ASSISTING) is deleted. Status, dispatch, crew, open-transport and destination checks run before any write. One `$transaction` covers record create + `recordTransition` (ON_SCENE only) + `audit.logInTransaction` (fail-closed). `statusChanged` / `incidentTransporting` are emitted after commit only. Response = record + `warnings`.
- `assertSelectableDestination` replaces the three `is_active` copies in start/update/arrival: active, `facility_type = HOSPITAL`, not PENDING_REVIEW/REJECTED → else 400. AT_CAPACITY/CLOSED are allowed with `warnings: ['FACILITY_AT_CAPACITY']`.
- `listTransports(incidentId, actor)`: HOSPITAL_USER is limited to transports whose destination facility belongs to their active orgs, 403 when none. Facilities now include numeric `latitude`/`longitude`, `location_status`, `receiving_status`. `location` is never selected.
- Mobile `transport.api.ts` unchanged: `warnings` is an additive response field and TypeScript did not require a type change.

Tests added/updated (written first; they ran red before the code: missing module, missing `recordTransition`, ETA write):
- `recordTransition`: timestamp per status, none for TRANSPORTING/ASSISTING, invalid transition throws before writes, returns the row, P2025 → 409 with no event, other DB errors rethrown.
- `startTransport`: ON_SCENE writes record/transition/event/audit through the transaction client only and emits after commit. TRANSPORTING second unit. EN_ROUTE/DISPATCHED/ASSISTING/RESOLVED → 409 with no `$transaction` and no record. Rollback on transition failure, audit failure and concurrent change (no emits). Missing/inactive/non-hospital/pending/rejected destination → 400 before writes. AT_CAPACITY/CLOSED → warning. Crew member allowed.
- `openTransportWhere` shape (incident must be TRANSPORTING; the extra filter cannot widen it); the conflict check uses it.
- `updateTransport` / `recordArrival` enforce the same destination rule.
- `listTransports`: dispatcher gets all rows with numeric coordinates; hospital user scoped by org with the exact query; other org → 403.
- ETA processor no longer calls `transportRecord.updateMany`.

Verification:
- `cd backend && npx jest --config ./test/jest.config.ts test/incidents test/locations test/hospitals test/responders test/dispatch test/notifications test/maps test/barangay-coordination test/rbac test/organizations test/oversight` → 36 suites; only the baseline `barangay-notify` FALSE_ALERT failure. (`backend/test/responders` does not exist.)
- `cd backend && pnpm typecheck` → passed.
- `cd backend && pnpm lint` → 1 error (baseline `incidents.service.ts:91` unused `actorRole`), 284 warnings (baseline 288; no new `any`).
- `cd backend && pnpm test` → 61 suites: 60 passed, 1 failed. 898 tests: 897 passed, 1 failed. The failure is the baseline `barangay-notify.spec.ts` › closes notices on FALSE_ALERT (`tx.false_alerts` undefined). The auth timeout flake did not occur.
- Root runner `pnpm --dir tests test -- backend/responders.service.spec.ts backend/incidents.service.spec.ts` → 23 passed, 15 failed. Every failure is an exception class check reporting "Expected constructor: NotFoundException / Received constructor: NotFoundException": the `tests/` package loads a second copy of `@nestjs/common`, so `instanceof` fails. Not caused by this prompt (it also hits untouched methods such as `getMySummary` and `acceptAssignment`); the status-update behaviour tests pass. See Follow-ups.
- Live local DB, real code, all writes rolled back: Joni Villanueva → selectable, no warnings. Lolomboy evacuation center → 400 "Destination must be a hospital.". Unknown id → 400. The `openTransportWhere()` relation filter executes (0 open, 0 records). `activeMemberOrgIds` returns memberships. `recordTransition` with a stale `from` → 409 `INCIDENT_STATUS_CHANGED`. ON_SCENE → TRANSPORTING inside a transaction returns the row and writes event `[ON_SCENE, TRANSPORTING, RESPONDER]`; after rollback the incident is still ON_SCENE with 0 probe events.

Duplication check:
- `grep -rn "PENDING_REVIEW" backend/src` → `destination-rules.ts:6` (the one list), plus `hospitals.service.ts` status assignments (114, 211) and comments (88, 325).
- `grep -n "incidentEvent.create" backend/src/incidents/incidents.service.ts backend/src/responders/responders.service.ts` → `incidents.service.ts:227` (incident creation), `:799` (`markFalseAlert`), `:895` (duplicate merge). None in either `updateStatus` and none in `responders.service.ts`. The three remaining are the C15 Follow-up.
- `grep -rn "arrived_at: null" backend/src` → `open-transport.ts:14`, plus `hospitals.service.ts:394` `patient_arrived_at: null` (the referral field, a substring match, not a transport check).
- `memberOrgIds` and `toHospitalView` no longer exist. `UNREVIEWED_STATUSES` is defined only in `destination-rules.ts`.

Deviations from plan/prompt:
- New `backend/src/hospitals/facility-view.ts`: the prompt asked for numeric lat/lng in `listTransports`, and the only converter was private in `HospitalsService`, so it was moved (not copied) and both services import it. It converts only fields present on the input, so the transport response does not gain an unselected `location_confidence`.
- `RespondersModule` imports `IncidentsModule` (which exports `IncidentStatusService`) instead of providing a second instance, following `false-alerts.module.ts`.
- `barangay-notify.spec.ts` status tests now build the real `IncidentStatusService` with `validateTransition` stubbed (the old mock had no `recordTransition`). Its baseline FALSE_ALERT failure is unchanged.
- Test constructor calls of `RespondersService` gained the status-service argument (positional; the notifier moved from 4th to 5th).

Follow-ups:
- Candidates for `recordTransition` (C15): `IncidentsService.markFalseAlert` and the duplicate merge, `false-alerts.service.ts`, `dispatch.service.ts`, `emergency-alerts.service.ts`, `barangay-callback.service.ts`.
- Root `tests/` runner: a second `@nestjs/common` instance breaks `instanceof` assertions (15 failures in the responders/incidents specs). Needs a module alias or dedupe in the `tests/` jest config. Not wired into CI.
- An UNVERIFIED hospital without coordinates (seed "Bocaue General Hospital") is a selectable destination by design (only PENDING_REVIEW/REJECTED are blocked). Prompt 07 treats "no coordinates" as target null and Prompt 10 shows "Location not verified".
- `recordArrival` / `updateTransport` still audit with fire-and-forget `audit.log`; Prompt 08 moves them into transactions.

## Independent review of Prompt 04 — 2026-10-26

Status: DONE. Prompt 04 is implemented correctly: no errors, no duplication, no wrong behaviour found. Prompt 05 may start (its gate, Prompt 03, was already met).

Files changed: `docs/HOSPITAL_ROUTING_PROGRESS.md` only (this section). No code, schema or database changes.

Tests added/updated: none.

What was checked (code read directly, not the summary):
- `IncidentStatusService.recordTransition` / `statusTimestampFields`: validates first, updates `where { id, status: from }`, P2025 → 409 `INCIDENT_STATUS_CHANGED`, writes the `IncidentEvent`, returns the row. The timestamp map is the union of the two old inline maps. `IncidentsService.updateStatus` still writes no `triggered_by_role` (same as before) and keeps the FALSE_ALERT row, audit and realtime. `RespondersService.updateStatus` keeps its own 409 pre-check.
- `startTransport`: only ON_SCENE/TRANSPORTING, all checks before any write, one `$transaction` (create + `recordTransition` on ON_SCENE + `audit.logInTransaction`), emits after commit, returns `warnings`. `transitionable` is gone.
- `listTransports`: HOSPITAL_USER limited by `facilities.organization_id in activeMemberOrgIds`, 403 when none; facilities return numeric lat/lng through `toFacilityView`, `location` never selected.
- `assertSelectableDestination` used by start, update and arrival; no other `is_active` copy left in `incidents/transport/`.
- ETA processor: only the `transportRecord.updateMany` write was removed.
- Dependency injection: the unit specs build services by hand, so the new `RespondersModule → IncidentsModule` import was checked by booting the backend (`npx nest start`): `RespondersModule` and `IncidentsModule` initialise, "Nest application successfully started". No module cycle (nothing under `IncidentsModule` imports `RespondersModule`).
- §0 rules: no new log lines in the changed files (rule 4); transport start/change/arrival all audited (rule 10); decimals converted (rule 9).

Verification:
- `cd backend && pnpm typecheck` → passed.
- `cd backend && pnpm lint` → 1 error (baseline `incidents.service.ts:91` unused `actorRole`), 284 warnings (same as the Prompt 04 report).
- `cd backend && pnpm test` → 61 suites: 60 passed, 1 failed; 898 tests: 897 passed, 1 failed. The failure is the baseline `barangay-notify.spec.ts` › FALSE_ALERT (`tx.false_alerts` undefined).
- `cd backend && npx jest --config ./test/jest.config.ts test/incidents test/locations test/hospitals test/maps` → 18/18 suites, 203/203 tests.
- Duplication greps: `PENDING_REVIEW` list only in `destination-rules.ts:6` (other hits are assignments/comments in `hospitals.service.ts`); `incidentEvent.create` only at `incidents.service.ts` 227/799/895 (C15 follow-up), none in `responders.service.ts`; `arrived_at: null` only in `open-transport.ts:14` (plus the referral field `patient_arrived_at: null`); `memberOrgIds` and `toHospitalView` no longer exist; `UNREVIEWED_STATUSES` defined once.

Deviations from plan/prompt: none.

Follow-ups:
- For Prompt 08 (`beginTransport`): the "already has an open transport" check runs before the transaction. Two simultaneous starts for different crews of the same dispatch on an incident already TRANSPORTING could both pass. On ON_SCENE the status-conditioned update already makes the second one fail with 409. Move the check inside the transaction (or rely on a DB constraint).
- For Prompt 08: `startTransport` does not check that `dto.patientId` belongs to the incident. Pre-existing; mobile never sends `patientId` today.
- Known until Prompt 06 (C18), not a Prompt 04 defect: `incident.transporting` still sends `patientId`, `destinationId` and `destinationName` to the incident room, as Prompt 04 told it to ("use the existing payloads"). `patientId` is null in practice because mobile never sends it, but the destination still reaches every incident-room participant until Prompt 06 runs.

## Prompt 05 — Hospital registry UI: coordinates, map pin, status, verify — 2026-10-26

Status: DONE (plan Phase 1 complete). Two checks could not run as written: `pnpm lint` (frontend toolchain broken before this work) and the in-browser sign-in check (replaced by the checks below). See Verification.

Files changed:
- `frontend/features/hospitals/api.ts`: `Hospital` gains `latitude`/`longitude` (number|null), `location_status`, `location_source`, `last_verified_at` (`address`/`province` already existed). `CreateHospitalBody` gains `address`, `province`, `organizationId?`, `location?`. New `setHospitalLocation` (PATCH `/hospitals/:id/location`), `verifyHospitalLocation` (POST `/hospitals/:id/location/verify`). `fetchHospitals({ includeUnreviewed })`.
- `frontend/features/hospitals/hooks.ts`: `useHospitals({ includeUnreviewed, enabled })` (default unchanged, so the drawer pickers and AdminDashboard still get reviewed hospitals only; separate cache key `['hospitals','with-unreviewed']`), `useSetHospitalLocation`, `useVerifyHospitalLocation` (both invalidate every `['hospitals', …]` list and `['hospital', id]`).
- `frontend/features/hospitals/location.ts` (new, pure): status badge map, coordinate parse/round/format, `readCoordinates`, `canReviewLocation`, `describeHospitalError` (COORDINATES_LIKELY_SWAPPED with `suggested`, COORDINATES_OUT_OF_SERVICE_AREA, DUPLICATE_FACILITY with `existingName`, LOCATION_MISSING; other errors keep the backend sentence).
- `frontend/lib/api.ts`: `ApiError` gains an optional third field `body` (the parsed error body). Additive; it was the only way to read `code`/`suggested`/`existingName`, which the client previously dropped.
- `frontend/components/map/HospitalMarker.tsx` (new, the only hospital marker; Prompt 12 reuses it): white disc + ring like `AmbulanceMarker`; dashed grey when not verified.
- `frontend/components/hospitals/HospitalLocationPicker.tsx` (new): labelled Latitude/Longitude inputs under "Location (Latitude, Longitude)", 7-decimal limit, inline errors, works without the map. Loads `HospitalLocationMap.tsx` (new) with `dynamic(..., { ssr: false })`, the same way the dispatch page loads `IncidentMapView`: same `useMapStyle()` source, starts on Bocaue, click or drag sets the pin (rounded to 7 dp), typed/suggested points off-screen are eased into view, tile error → `MapErrorOverlay`. Not clamped to Bocaue (a hospital may be anywhere in the service area).
- `frontend/app/(ops)/hospitals/page.tsx`: create dialog adds Address, Province (default "Bulacan"), the picker (optional) and, for an Org Administrator, a required organization choice plus "Will be reviewed by MDRRMO before ambulances can select it."; list cards show the location status badge and coordinates; detail panel has a Location row with "Set location" (System Admin, Supervisor, Org Admin for own org) and "Verify"/"Reject" (Supervisor, System Admin; PENDING_REVIEW or UNVERIFIED-with-coordinates; Verify only when coordinates exist); swap error offers "Use suggested coordinates"; the list uses `includeUnreviewed=true` for System Admin, Supervisor and Org Admin.
- `frontend/lib/role-access.ts`: `/hospitals` route and "Hospitals & Facilities" sidebar link now include `ORG_ADMINISTRATOR`.
- `docs/AGAP_Role_Rules_and_Dashboard_Content.md` §6: Org Administrator dashboard content and sidebar updated to match.
- `docs/HOSPITAL_ROUTING_PROGRESS.md`

Tests added/updated:
- New `frontend/__tests__/hospital-location.spec.ts` (23 tests): badge per status + fallback; swap suggestion (and a malformed one ignored); duplicate with and without `existingName`; out-of-area; LOCATION_MISSING; backend sentence and validation-array passthrough; 7-decimal and range parsing; rounding; empty/half/full `readCoordinates`; latitude-first formatting; `canReviewLocation`.
- `frontend/__tests__/role-access.spec.ts`: Org Admin opens `/hospitals`; Org Admin sidebar includes "Hospitals & Facilities".

Verification:
- `cd frontend && npx tsc --noEmit --incremental false` → passed. `pnpm typecheck` → passed.
- `cd frontend && pnpm test` → 5 suites, 83 tests, all passed.
- `cd frontend && pnpm lint` → fails before linting any file ("Invalid Options: Unknown options: useEslintrc, extensions, …"). Pre-existing, already recorded in `docs/handoff/2026-10-22_role-dashboards-phase1.md`. Running ESLint directly (`ESLINT_USE_FLAT_CONFIG=false npx eslint …`) also crashes inside `@next/next/no-duplicate-head` and `react-hooks/rules-of-hooks` (`context.getAncestors/getScope is not a function`: ESLint 9 with the v14 Next plugin). Lint could not be run on any frontend file. Hooks in the new code were checked by hand: all called unconditionally at the top of components; the Set-location dialog prefill uses the "adjust state while rendering" pattern, not a conditional hook.
- Contract check against the local DB with the real `HospitalsService` (System Administrator actor, no writes, audit stubbed to throw if called): `findAll(includeUnreviewed=true)` returns "DOH — Joni Villanueva General Hospital" with `latitude: 14.79679`, `longitude: 120.94358` (JSON numbers), `location_status: VERIFIED`, `location_source: manual+osm-crosscheck`, no `location` field, so the page shows "Verified" and `14.7967900, 120.9435800`. `setLocation` with the swapped pair (120.94358, 14.79679) → 422 `{"code":"COORDINATES_LIKELY_SWAPPED","message":…,"suggested":{"latitude":14.79679,"longitude":120.94358}}`; out of area → 422 `COORDINATES_OUT_OF_SERVICE_AREA`; the row was unchanged afterwards. These are the exact bodies the new spec feeds to `describeHospitalError`.
- `next dev` on port 3100 with a dummy session cookie (middleware only checks presence): `/hospitals` compiled (1592 modules) and rendered 200 with no compile or server error.
- Not done: signing in as the seeded System Administrator in a browser. Its password is a real `.env` secret and first login forces a password change, so it was not used from this session. The map half (`HospitalLocationMap`) loads only in the browser, so the pin click/drag was not exercised. **Manual check still needed:** sign in, open Hospitals, confirm the Joni Villanueva badge/coordinates, open Set location, type `120.94358` / `14.79679`, Save → the swap message and "Use suggested coordinates" button appear; click it, then Cancel (to avoid re-saving).

Deviations from plan/prompt:
- Org Administrators could not open `/hospitals` at all, so the prompt's Org Admin create was unreachable. The route and sidebar now include them (role spec doc updated). A non-hospital Org Admin sees the directory read-only, which `GET /hospitals` already allows any signed-in user.
- The frontend knows only one organization per user (`session.orgId`). The page looks up its type with `GET /organizations/:id`; the Org Admin dialog offers that organization as the only choice. If the lookup fails, the button is shown and the API decides (as the prompt allows). "Set location" for an Org Admin is offered only on hospitals of that one organization (the backend accepts any active membership).
- The map moved into its own `HospitalLocationMap.tsx` so the picker's inputs render on the server and work even when MapLibre does not load.
- `ApiError` (shared client) gained the optional `body` field; needed to surface the error codes.

Follow-ups:
- `frontend/app/(ops)/hospitals/page.tsx` `receivingVariant` expects `ACCEPTING/LIMITED/DIVERTING/FULL`, but the DB enum is `OPEN/AT_CAPACITY/CLOSED/EMERGENCY_ONLY/UNKNOWN`, so every receiving badge is grey. Pre-existing; fix with Prompt 10/12 when receiving status is shown in pickers.
- `GET /facilities` (`backend/src/facilities/facilities.service.ts`) returns raw Prisma rows, so `latitude`/`longitude` arrive as Decimal strings there (§0 rule 9). Its one frontend caller (`CommandSections`) does not read coordinates. Use `toFacilityView` there when facilities get a map.
- Frontend lint toolchain: `next lint` options and the v14 Next/react-hooks plugins are incompatible with the installed ESLint 9. Needs a flat config or an ESLint 8 pin. Not part of this work.
- Prompt 14 should reuse `HospitalLocationPicker`, `describeHospitalError` and `LocationError` (in the page) rather than adding new ones.

## Post-Prompt 05 fix: map console warnings — 2026-10-26

Status: DONE

Reported by the user from the browser console after Prompt 05:
- "Unable to perform style diff: Style is not done loading" → `HospitalLocationMap` lacked `styleDiffing={false}` (the style URL switches from the fallback to the configured one when `map-config` loads). Added, as `IncidentMapView` and `RiskHeatmapView` already do.
- "Image "exit_2" / "pet" / … could not be loaded" → the configured style references icons missing from its sprite. Only `IncidentMapView` resolved them, inline and on `load` (too late for the first tiles). Moved into one helper, `frontend/components/map/missing-style-images.ts` (`resolveMissingStyleImages`, used as the `<Map ref>` callback, idempotent per map), now used by `IncidentMapView`, `RiskHeatmapView` and `HospitalLocationMap`. An empty icon name (`" "`) cannot be registered, so MapLibre may still log that one.
- Not code issues: "WELLDONE Wallet is not initialized" (a browser wallet extension's `inject.js`); 401 on `/v1/auth/refresh` before sign-in (no session cookie yet); 401 on `/v1/auth/login` (a refused sign-in attempt).

Files changed: `frontend/components/map/missing-style-images.ts` (new), `frontend/components/incidents/IncidentMapView.tsx`, `frontend/components/risk/RiskHeatmapView.tsx`, `frontend/components/hospitals/HospitalLocationMap.tsx`.

Verification: `cd frontend && npx tsc --noEmit --incremental false` → passed; `pnpm test` → 5 suites, 83 tests passed. Browser console not re-checked from this session (needs the user's reload).

## Fix: responder could not select a hospital (seed ids rejected) — 2026-10-26

Status: DONE

Reported: on the responder app, tapping a Verified hospital in the destination picker did nothing.

Root cause (reproduced):
- The DB had **no transport records at all**, although the user's test went ON_SCENE → TRANSPORTING → RESOLVED (06:50 UTC). Every save from the picker had failed.
- Calling the real `TransportService.startTransport` on the local DB (inside a rolled-back transaction) with that incident, dispatch and crew member and Joni Villanueva **succeeded**, so the service and destination rule were fine.
- The HTTP layer rejected it: request DTOs used `@IsUUID()`, which accepts only RFC versions 1–8. Seeded ids (`00000000-0000-0000-0002-000000000006`, version digit 0) fail it: `destinationId must be a UUID` (and `dispatchId` for seeded dispatches, so even "Decide later" failed). `ParseUUIDPipe` on path ids accepts them, so the same ids worked in URLs. Production ids (`gen_random_uuid`, v4) were never affected.
- The mobile screen showed its "Destination not saved, tap to retry" on the card hidden behind the open picker, so the tap looked dead.

Fix:
- New `backend/src/common/decorators/is-record-id.decorator.ts`: `IsRecordId()` = `IsUUID('loose')`, the same rule as `ParseUUIDPipe` (any 8-4-4-4-12 hex id Postgres stores as `uuid`).
- All 32 `@IsUUID()` in backend request DTOs (19 files: transport, referral, hospital create, incident actions/create, assessment, handover, dispatch, triage, surge, communications, barangay callback, announcements, permissions, auth MFA/WebAuthn) now use `@IsRecordId()`. One rule; no `IsUUID` left in `backend/src` outside the decorator. Changed lines are only the import and the decorator.
- Mobile: `DestinationPicker` takes `saveError` and shows "Destination not saved: <server reason> Choose again to retry." inside the sheet; `app/responder/assignment/[id].tsx` keeps the server message instead of a boolean.

Tests: new `backend/test/incidents/record-id-validation.spec.ts` (8): seed and v4 ids accepted by transport start/update/arrival, referral and hospital-create DTOs; malformed ids (short, injection-like, empty) still rejected; ParseUUIDPipe parity.

Verification:
- `cd backend && pnpm typecheck` → passed. `pnpm lint` → 1 error (baseline `incidents.service.ts:91`), 284 warnings.
- `cd backend && pnpm test` → 62 suites, 906 tests: 899 passed, 7 failed. Failures: baseline `barangay-notify`, and `auth-phase2`/`auth-phase3` timeouts (`BackupCodesService` ×3, `MfaService` login decision ×1, "Exceeded timeout of 5000 ms"). The same 4 auth failures occur with the three auth DTO files temporarily restored to `@IsUUID()`, so they are not caused by this change (hashing-heavy tests on this machine; previously recorded as a flake, now failing alone too).
- `cd mobile && pnpm typecheck` → passed; `pnpm test` → 2 suites, 8 tests passed. `pnpm lint` → 7 errors, all pre-existing; the one in a changed file is the unused `TransportRecord` import at `app/responder/assignment/[id].tsx:37`, not touched here.

Follow-ups:
- Auth `BackupCodesService` / `MfaService` specs time out at the default 5 s on this machine even alone; give them a longer timeout or fewer hash rounds in tests.
- Mobile lint errors (7, pre-existing), including the unused `TransportRecord` import in the assignment screen.

## Prompt pack update and handoff — 2026-10-26

Status: DONE (docs only)

- Corrections **C19** (request-body ids use `@IsRecordId()`, never a bare `@IsUUID()`) and **C20** (every web `<Map>` uses `resolveMissingStyleImages` + `styleDiffing={false}`; one `HospitalMarker`) added to the prompts file so Prompts 08B, 12, 13 and 15 follow today's fixes.
- Handoff: [`docs/handoff/2026-10-26_hospital-destination-routing-prompt-05-done.md`](./handoff/2026-10-26_hospital-destination-routing-prompt-05-done.md).
- Next: independent review of Prompt 05 and the post-05 fixes, then **Prompt 06**.

## Independent review of Prompt 05 and the post-05 fixes — 2026-10-27

Status: DONE. Prompt 05, the map-warning fix and the `IsRecordId` fix match the prompt and Corrections C19/C20. Three small bugs fixed, one data problem left for the user.

Checked (code, DB, tests, not the summary):
- Duplication: one `HospitalMarker` (used only by `HospitalLocationMap`); `setMissingStyleImageResolver` only in `missing-style-images.ts`, used by all three web `<Map>`s, each with `styleDiffing={false}`; no bare `IsUUID` in `backend/src`; 32 `@IsRecordId()` in 19 files. HEAD had 11 `@IsUUID()`, all without options; none of the 32 is on an array field, so no `each: true` was lost.
- `useHospitals()` defaults: `IncidentDetailDrawer` ×2 and `AdminDashboard` still get reviewed-only hospitals; the page's `with-unreviewed` key is invalidated by every `['hospitals']` invalidation.
- Page role checks mirror the controller/service (create, set location, verify/reject). `GET /organizations/:id` allows Org Administrators, so the Org Admin lookup works. TanStack v5: a disabled query has `isLoading=false`, so the create button logic is right.
- `missing-style-images.ts`: `Map.setMissingStyleImageResolver` exists in maplibre-gl 6.14; react-map-gl 8.1.3 sets the ref via `useImperativeHandle(…, [mapInstance])`, so the callback runs once per map.
- Mobile `DestinationPicker`: `saveError` shown in the sheet, cleared on success and when the picker opens after TRANSPORTING.
- Protected geo files: `bocaue.geojson` and `frontend/lib/bocaue-geo.ts` untouched; `shared/src/maps/bocaue-boundary.ts` diff is the Prompt 02 `polygon.ts` refactor only.
- DB: `prisma migrate status` up to date (21 migrations); `migrate diff --from-config-datasource --to-schema prisma/schema.prisma` → empty. Every facility's `location` matches `latitude`/`longitude` (trigger `trg_facilities_sync_location`, 0 mismatches).

Fixed:
- `CreateHospitalDialog` never reset: its reset ran only on `onOpenChange(true)`, which Radix never calls when the page opens the dialog by state. A second "Add Hospital" showed the previous name and coordinates (→ 409 on save) and the Org Admin's organization was never preselected. Now resets whenever `open` turns true (same render-time pattern as `SetLocationDialog`). Pre-existing pattern, but Prompt 05 added coordinates/organization to it.
- `ReviewLocationDialog`: Cancel kept the typed note, so it was prefilled (and could be sent to the audit log) on the next Verify/Reject of another hospital. Now resets per hospital + decision.
- `HospitalsService.update`, `setLocation`, `verifyLocation` never set `updated_at` (the column has no `@updatedAt`; the same file sets it by hand on referrals). Bocaue General Hospital showed `updated_at` 2026-10-24 after a 2026-10-26 location change. All three now set it.

Data problem (reset 2026-10-27 at the user's request, see the last bullet):
- Seeded **Bocaue General Hospital** (`…0002-000000000001`) is now `VERIFIED` at `14.7967900, 120.9435800`, Joni Villanueva's point (audit: System Administrator `setLocation`, 2026-10-26 14:25 UTC, reason null). Plan §6 says keep it `UNVERIFIED` with no coordinates. Likely the manual check ran on the page's default selection (the first hospital alphabetically) instead of Joni Villanueva. A crew choosing it would be routed to Joni Villanueva. "Dr. Yanga's Hospital" (created 14:34 UTC, `14.8007783, 120.9218925`, no address/municipality) is user test data.
- **Reset done (2026-10-27):** Bocaue General Hospital is back to `UNVERIFIED` with no coordinates (`location` cleared by the trigger); source, verifier and `last_verified_at` are null. Done in one transaction with an audit `UPDATE` (no actor, MOD-39, old VERIFIED point → UNVERIFIED, reason recorded). Joni Villanueva and Dr. Yanga's are untouched.

Tests: frontend `npx tsc --noEmit --incremental false` passed, `pnpm test` 5 suites / 83 passed. Backend `pnpm typecheck` passed; `test/hospitals` + `test/incidents` 14 suites / 183 passed. Mobile `pnpm typecheck` passed.

Follow-ups:
- `FacilitiesService.updateStatus` (`backend/src/facilities/facilities.service.ts`) also leaves `updated_at` stale.
- Duplicate detection does not catch two hospitals at the same point under different names. The plan only asks for name+municipality and OSM ref; a proximity warning could go with Prompt 13's scoring.
- The Set-location marker stays solid after the pin is moved off a verified point (cosmetic; the save is still reviewed per role).

## Prompt 06 — Shared event contracts and realtime emitters — 2026-10-28

Status: DONE (Phase 2 start). Gate: Phase 1 (Prompts 01–05) done and reviewed (2026-10-27).

Files changed:
- `shared/src/maps/map.types.ts`: `TransportLeg`, `TransportDestinationView`, `RouteSnapshot` (geometry in [lng, lat], `isEstimate: true`, `stale`).
- `shared/src/events/incident.events.ts`: `INCIDENT_EVENTS.TRANSPORT_UPDATED = 'incident.transport_updated'`; `IncidentTransportUpdatedPayload`; `IncidentTransportingPayload`: `patientId`, `destinationId`, `destinationName` now optional and marked "ops copy only", new optional `destination`; `IncidentFacilityArrivalPayload`: optional `dispatchId`, `destinationId` optional (ops copy only).
- `shared/src/events/responder.events.ts`: `RESPONDER_EVENTS.ROUTE_UPDATED = 'responder.route_updated'`; `ResponderRouteUpdatedPayload`.
- `shared/src/events/websocket-event.types.ts`: `AgapEventName` already derives from the event objects, so the new names are accepted by `emit()`; added `incident.transporting`, `incident.facility_arrival`, `incident.transport_updated`, `responder.route_updated` to `AgapWebSocketPayloadMap`.
- `backend/src/realtime/realtime.service.ts`:
  - Removed the local copies of `IncidentTransportingPayload` / `IncidentFacilityArrivalPayload` ("defined locally to avoid a shared rebuild"); the service imports the shared ones. One definition each.
  - `incidentTransporting`: ops gets the full payload; the incident room gets `{ incidentId, transportId, dispatchId, transportStartedAt }` only (C18; closes the `patientId` and destination leaks).
  - `facilityArrival`: ops full; incident-room copy without `destinationId`.
  - New `transportUpdated(payload, userIds)`: ops full; each deduplicated user gets a copy without `destination.id`; never the incident room.
  - New `routeUpdated(payload, { incidentRoom, userIds })`: ops always; incident room only when `incidentRoom` (callers pass true only for TO_SCENE); each deduplicated user once. Doc comment states the rule.
  - All through `this.safe(...)`. Nothing calls the two new emitters yet.
- `backend/src/incidents/transport/transport.service.ts`: `facilityArrival` call passes `dispatchId: record.dispatch_id` (new optional field; ops and incident room both get it, it is not sensitive).

Client check before trimming (prompt step 5): `frontend/providers/socket-provider.tsx` listens to `incident.transporting` and `incident.facility_arrival` and reads only `incidentId` (then refetches over REST). No other reader of `destinationId`/`destinationName` from a socket payload in `frontend/` or `mobile/` (the other hits are REST request bodies). Mobile does not subscribe to either event. Nothing breaks.

Tests added:
- `backend/test/realtime/transport-events.spec.ts` (10): incident-room copies of `incident.transporting` and `incident.facility_arrival` serialized to JSON contain none of `patientId`/`destinationId`/`destinationName`/`destination` (nor the patient id, hospital name or facility id values); ops copies are the full payloads; `transportUpdated` never calls `emitToIncident`, sends each user once without `destination.id`, does not mutate the caller's object, handles a null destination; `routeUpdated` emits to the incident room only when `incidentRoom` is true, to ops always, to each user once; both new emitters are best-effort.

Verification:
- `pnpm --filter @agap/shared build` and `typecheck` → passed.
- `cd backend && npx jest --config ./test/jest.config.ts test/realtime test/incidents/transport.spec.ts` → 4 suites, 71 tests passed. `pnpm typecheck` → passed.
- `cd backend && pnpm test` → 63 suites, 916 tests: 911 passed, 5 failed, all baseline (`barangay-notify` FALSE_ALERT; `auth-phase3` `BackupCodesService` ×3 and `MfaService` login decision ×1 timeouts).
- `cd backend && pnpm lint` → 1 error (baseline `incidents.service.ts:91`), 284 warnings (unchanged).
- `cd frontend && npx tsc --noEmit --incremental false` → passed. `cd mobile && pnpm typecheck` → passed.

Deviations: none. The `dispatchId` on the arrival call and the removal of the local payload copies are the only changes outside the listed files; both follow the prompt (additive field; no duplicate contracts).

Follow-ups:
- `incident.transporting` still carries `destinationName` and `destinationId` in the ops copy alongside the new optional `destination`. Prompt 08 (single `beginTransport` path) should fill `destination` and decide whether ops clients move to it; until then there is no client reader of either.
