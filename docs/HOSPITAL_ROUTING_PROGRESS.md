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

## Independent review of Prompt 06 — 2026-10-28

Status: DONE. Prompt 06 matches the prompt and Correction C18. No errors and no duplicate contracts. One fix made to make the code more robust, and one later prompt updated.

Checked (code, tests and builds, not the summary):
- Contracts: `TransportLeg`, `TransportDestinationView`, `RouteSnapshot`, `IncidentTransportUpdatedPayload`, `ResponderRouteUpdatedPayload`, the two new event names and the `AgapWebSocketPayloadMap` entries match prompt steps 1–4 field for field. The duplicate grep lists `shared/src` only; the local payload copies in `realtime.service.ts` are gone. `shared/dist/events/*.js` has `TRANSPORT_UPDATED`/`ROUTE_UPDATED`; a rebuild changed nothing.
- C18: the incident-room `incident.transporting` copy holds only `{ incidentId, transportId, dispatchId, transportStartedAt }`. `transportUpdated` never calls `emitToIncident`, removes `destination.id` without changing the caller's object, and sends one copy per user. `routeUpdated` sends to the room only when `incidentRoom` is true. Everything runs through `safe()`.
- Callers: only `TransportService` calls `incidentTransporting`/`facilityArrival`; nothing calls the two new emitters yet (as intended). Nothing else emits these event names. `updateTransport` sends `incident.updated { transportUpdated: <id> }` to the room, which has no destination, so it is fine.
- Other channels: the reporter's TRANSPORTING push says "a receiving facility" (no name). `GET /incidents/:id/transport` does not allow `CITIZEN`.
- `dispatchId` in the room copy of `incident.facility_arrival`: acceptable. It is not patient or destination data, and the room copy of `incident.transporting` already carries it.

Fixed:
- `facilityArrival` built its room copy by removing `destinationId` from the payload and keeping everything else. Any field added to the payload later (for example a destination name in Prompt 08) would then reach the incident room without anyone noticing. It now copies only named fields, like `incidentTransporting` (`dispatchId` is copied only when set, because of `exactOptionalPropertyTypes`). The spec now checks the exact room payload and a test proves an extra field never reaches the room.

Prompt pack: Prompt 08 step 1 now settles the open question about duplicate destination fields. It fills `destination` in the ops copy of `incident.transporting` and removes `destinationName` (it repeats `destination.name`; no client reads it), and keeps `destinationId`.

Verification:
- `pnpm --filter @agap/shared build` + `typecheck` → passed.
- `cd backend && npx jest --config ./test/jest.config.ts test/realtime test/incidents/transport.spec.ts` → 4 suites, 72 tests passed. `pnpm typecheck` → passed. `npx eslint` on the changed files → 0 errors (1 `as any` warning in the spec, the same pattern as neighbouring specs).
- `cd backend && pnpm test` → 63 suites, 917 tests: 915 passed, 2 failed, both baseline (`barangay-notify` FALSE_ALERT; `auth-phase3` `BackupCodesService` timeout).
- `npx nest start` → "Nest application successfully started" (then EADDRINUSE on :3000 because a dev server was already running).
- `cd frontend && npx tsc --noEmit --incremental false` → passed. `cd mobile && pnpm typecheck` → passed.

Follow-ups: none new. Prompt 07 may start.

## Prompt 07 — Transport leg service, route cache and leg-aware ETA job — 2026-10-28

Status: DONE (Phase 2). Gate: Prompt 06 done and reviewed (2026-10-28). One live check could not run: the local Redis does not answer (see Verification).

Files changed:
- `backend/src/config/config.validation.ts`, `.env.example`: `TRANSPORT_ROUTING_ENABLED` (a string flag like the others; unset or anything but `'false'` = on).
- `backend/src/incidents/transport/transport-leg.service.ts` (new): `resolve(dispatchId)` → `{ leg, target, destination, transportId, incidentId }`, or `null` for an unknown dispatch. Uses `openTransportWhere()` (C16) and `toFacilityView` (Decimal → number). Provided and exported by `IncidentsModule`.
- `backend/src/locations/route-cache.service.ts` (new): its own ioredis client with the same fail-open setup as `SessionRevocationService` (no offline queue, no retry, 250 ms timeout, warn once). `get` / `set` (TTL 120 s) / `clear`, key `route:dispatch:{id}`, value `{ leg, destination, route, fromFix }`. Provided and exported by `LocationsModule`.
- `backend/src/locations/maps/simplify-line.ts` (new): `simplifyLine(points, maxPoints = 300)`, Douglas–Peucker ranking. Keeps both ends and the order; a kept point's parent is always kept.
- `backend/src/jobs/processors/eta-refresh.processor.ts`: `EtaRefreshReason` and optional `reason`. The leg is resolved at run time; route, cache, `routeUpdated`, ETA write and stale fallback added. The old behaviour stays behind the flag.
- `backend/src/jobs/jobs.module.ts`: imports `IncidentsModule`. No cycle: nothing under `IncidentsModule` imports `JobsModule` or `LocationsModule`.
- `backend/src/locations/locations.service.ts`: `requestImmediateRefresh(dispatchId, incidentId, reason)`; `trackResponder` builds a typed `EtaRefreshJobData`.
- `backend/src/realtime/realtime.service.ts`: `notifyEtaUpdated` takes an optional `{ incidentRoom }` (default `true`, so existing callers are unchanged).
- `MapsService` unchanged: both routers (`osrm-routing.provider.ts`, `mapbox-routing.provider.ts`) already request `overview=full&geometries=geojson` and return `geometry` as `[lng, lat][]`.

Behaviour (flag on):
- The dispatch-status skip and the freshest-crew-fix logic are unchanged (C9). Dispatches stay `ACCEPTED` while transporting, so the hospital leg is not skipped.
- `target` null (AT_FACILITY, no destination yet, hospital without coordinates, scene without GPS) → cache cleared and `routeUpdated(route: null)`.
- Route found → a `RouteSnapshot` (simplified geometry, `isEstimate: true`, `stale: false`) is cached and `estimated_arrival_at` is written, then `routeUpdated` and `notifyEtaUpdated` are sent.
- `estimated_arrival_at` is written only on TO_FACILITY, through `updateMany({ where: openTransportWhere({ id: transportId }) })`, so a transport that arrived in the meantime is never touched (G3).
- Audience: `routeUpdated` gets `{ incidentRoom: leg === 'TO_SCENE', userIds: [] }`, and the ETA event follows the same rule. On the hospital leg both go to ops only until Prompt 09 adds the crew and reporter user rooms.
- Routing failure (the provider throws or returns no duration, or there is no fix at all) → the cached route is re-sent with `stale: true` if it is under 120 s old **and** for the same leg and destination; otherwise `route: null`. No ETA event, no cache write, no DB write. Never throws.

Flag off: exactly the Prompt 04 path (scene route from the job's `incidentLat/Lng`, `responder.eta_updated` to ops and the incident room, no leg lookup, no cache, no route event, no transport write).

Tests added/updated:
- New `backend/test/incidents/transport-leg.spec.ts` (11): open-transport filter shape; TO_FACILITY with a numeric target; unverified hospital (routed, `locationVerified: false`); hospital without coordinates; no destination yet; AT_FACILITY; arrived on RESOLVED/CLOSED → TO_SCENE; TO_SCENE with and without an incident location; unknown dispatch.
- Rewritten `backend/test/locations/eta-refresh.spec.ts` (21). Earlier cases are kept. New cases:
  - Scene leg: caches the route and sends it to the room; the route has at most 300 points.
  - Hospital leg: routes to the hospital; `estimated_arrival_at` only for the open transport (exact `where`); the hospital route and ETA never go to the incident room; a destination changed between enqueue and run is honoured.
  - No target → cache cleared and `route: null`. AT_FACILITY → cache cleared, `route: null`, no ETA.
  - Routing failure: stale re-send; no duration → null; cache over 120 s old → null; cache for another destination → null; no fix → null.
  - Flag off: old path with no leg, cache, route event or write; failures swallowed; an immediate job is skipped.
- New `backend/test/locations/route-cache.spec.ts` (5, ioredis mocked as in `session-revocation.spec.ts`): key and TTL, round trip, miss, Redis error or hang → `get` returns null, `set`/`clear` never throw, client closed on destroy.
- New `backend/test/maps/simplify-line.spec.ts` (5).
- `backend/test/locations/live-tracking.spec.ts` (+3): the ETA job is still enqueued when the scene has no GPS; `requestImmediateRefresh` uses `eta-now-{id}-{ms}` with no dedup and no `:`; it never throws.

Verification:
- `cd backend && npx jest --config ./test/jest.config.ts test/incidents test/locations test/jobs test/maps test/realtime` → 24 suites, 242 tests passed.
- `pnpm typecheck` → passed. `pnpm lint` → 1 error (baseline `incidents.service.ts:91`), 284 warnings (unchanged).
- `pnpm test` → 66 suites, 955 tests: 951 passed, 4 failed, all baseline (`barangay-notify` FALSE_ALERT; `auth-phase3` `BackupCodesService` ×3 timeouts).
- Boot on a spare port (`BACKEND_PORT=3999 npx nest start`): "JobsModule dependencies initialized", "Nest application successfully started".
- Live probe (real code, local DB, no DB writes): `transport_records` is empty. The newest dispatch (COMPLETED, incident RESOLVED) → TO_SCENE with a numeric scene target; unknown dispatch → `null`. Real OSRM (public demo server) from Bocaue to Joni Villanueva → 426 s, 3160 m, 123 points in 877 ms; first point `[120.926553, 14.798598]` confirms the [lng, lat] order. No active dispatch existed, so the processor was not run end to end against the DB.
- **Not verified live: Redis.** `localhost:6379` accepts TCP (WSL relay) but returns nothing to a raw `PING` within 5 s, so the client stays in `connect`. `RouteCacheService` failed open as designed: it warned once, `get` returned null, and `set`/`clear` stayed silent. BullMQ uses the same Redis, so ETA jobs do not run on this machine until Redis is restarted. The cache is covered by the mocked spec only.

Deviations from plan/prompt:
- `EtaRefreshJobData`: the four coordinates are now optional, because `requestImmediateRefresh` has no fix and no scene point. Old jobs still parse. With the flag off, a job without a scene point is skipped (Prompt 04 had no such jobs).
- `trackResponder` now enqueues even when the incident has no GPS location (Rule 5: GPS is optional), so the hospital leg still gets routes. The scene point is added only when it exists.
- `notifyEtaUpdated` gained the optional `{ incidentRoom }` argument. Keeping `notifyEtaUpdated` as it was would have sent the hospital-leg ETA to the shared incident room, which the C17 table forbids for bystander reporters.
- `TransportLegService.resolve` runs two queries in parallel instead of one: the open rule is a `where` filter (`openTransportWhere`), and checking it again in code would be a second definition (C16).
- AT_FACILITY also returns the arrived transport's `destination` (the target stays null), so clients can show "At <hospital>".
- The stale fallback also requires the same leg and destination, so a failed route after a destination change never shows the old hospital's route.
- The `estimated_arrival_at` write does not touch `transport_records.updated_at`: it is an estimate recomputed every 15 s, not an edit.

Follow-ups:
- The local Redis (WSL) is not answering. Restart it before Prompt 08 and re-run the probe (cache round trip, processor on an ACCEPTED dispatch).
  - **Update 2026-10-28:** found and fixed, but the probe has not been re-run yet. WSL was stuck (`Wsl/Service/0x80072747`); `wsl --shutdown` fixed that. Ubuntu also stops shortly after the last WSL process exits, taking Redis with it.
  - `redis-server` is now enabled with systemd. Ubuntu is kept awake with a hidden `wsl -d Ubuntu -- sleep infinity` (startup order in `docs/handoff/2026-10-28_hospital-destination-routing-prompt-08-done.md`).
  - Restart the backend after Redis is up: `SessionRevocationService` and `RouteCacheService` connect only at boot. Then run the probe.
- `RouteCacheService` copies `SessionRevocationService`'s `retryStrategy: () => null`: if Redis is down at boot, the cache stays off until the next restart (routes are still computed). This is the same trade-off as the existing service.
- `responder.location_updated` still reaches the incident room on the hospital leg; Prompt 09 owns that audience change.
- A dev server started before this change runs the old processor on the same queue. Restart it so jobs use the new code.

## Prompt 08 — Single `beginTransport` path, RESOLVED guard, referral sync, `transport_updated` — 2026-10-28

Status: DONE. Gate: Prompt 07 done.

Files changed:
- `backend/src/incidents/transport/transport.service.ts`:
  - New `beginTransport(tx, input)`: locks the incident row (`SELECT status FROM incidents … FOR UPDATE`), checks status ON_SCENE/TRANSPORTING, the dispatch, the crew and the destination (`assertSelectableDestination`), then either returns the dispatch's open record (`openTransportWhere`) or creates one and calls `recordTransition` from ON_SCENE. Audited with `logInTransaction`. Returns `{ record, statusChanged, previousStatus, warnings, outcome, destination }`.
  - New `announceTransportBegun(result)` for the post-commit side.
  - `startTransport`, `recordArrival` and `updateTransport` rewritten on top of these.
  - New `findOpenTransportsForFacility` and `notifyFacilityChanged(facilityId, 'moved' | 'deactivated')`.
- `backend/src/responders/responders.service.ts`:
  - TRANSPORTING goes through `beginTransport` inside the status transaction.
  - RESOLVED by the crew while this dispatch has an open transport → 409 `TRANSPORT_OPEN`.
  - The status audit, `incident.status_changed` and the reporter/dispatcher notifications run only when the incident actually moved.
- `backend/src/hospitals/hospitals.service.ts`: the Prompt 03 hook `onFacilityLocationChanged` now calls `transport.notifyFacilityChanged(id, 'moved')`.
- `backend/src/hospitals/facility-view.ts`: `DESTINATION_VIEW_SELECT` and `toTransportDestinationView` (one converter). The private copy in `transport-leg.service.ts` was removed; that file now uses this one.
- `backend/src/hospitals/destination-rules.ts`: `assertSelectableDestination` also selects the coordinates and returns `view: TransportDestinationView`.
- Modules: `IncidentsModule` imports `LocationsModule` and exports `TransportService`; `HospitalsModule` imports `IncidentsModule`. No cycle: `HospitalsModule` is imported only by `AppModule`, and `LocationsModule` imports neither. No `forwardRef` and no event emitter.
- `shared/src/events/incident.events.ts`: `destinationName` removed from `IncidentTransportingPayload` (no client reader, Prompt 06 grep); the ops copy carries `destination` (view) and `destinationId`.

Decision — `POST /incidents/:id/transport` when the dispatch already has an open record. The mobile app calls it right after `PATCH …/status TRANSPORTING`, often with a stale transport list (`app/responder/assignment/[id].tsx` `saveDestination`):
- The open record has no destination and one is requested → it is set on that record (audit `UPDATE`, `incident.transport_updated`, new route). No 409, no second record.
- No destination requested, or the same one → the record is returned unchanged; nothing is written or emitted.
- A **different** hospital is already set → 409 `TRANSPORT_ALREADY_OPEN` (with `transportId`). Changing hospitals goes through `PATCH /transport/:id`, which records the reason. The app shows the server message and refetches, so a retry uses PATCH.

Behaviour:
- Single entry: PATCH TRANSPORTING and POST both go through `beginTransport`. The record exists from the crew's tap, even if the picker is cancelled. The IncidentEvent stays as today (crew note, role RESPONDER). A second unit on a TRANSPORTING incident now gets its own record instead of the old "Cannot move incident from TRANSPORTING to TRANSPORTING" 409, as plan §12 intends. In that case nothing about the incident is announced, notified or audited again; its transport record is audited.
- After commit: `incident.transporting` (ops: `destination` view with numeric coordinates; incident room: status only, unchanged from Prompt 06) and `requestImmediateRefresh(…, 'transport_started')`.
- Arrival (one transaction): `arrived_at` is set through `updateMany where { id, arrived_at: null }`, so a second tap gets 400. Audit rows are written in the transaction (this closes the Prompt 04 follow-up), and the open referral is stamped. After commit: `facilityArrival` with `dispatchId`, route cache cleared, `requestImmediateRefresh(…, 'arrived')`.
- Referral match: same incident and hospital, `patient_arrived_at` null, and the same dispatch or no dispatch; the one bound to this dispatch wins. `HospitalsService.markArrived` has no notifications, only an audit row, so the same MOD-38 audit row is written here.
- Destination change (`updateTransport`): one transaction with the audit. After commit: `transportUpdated(…, [])` to ops only (destination view with `id`, plus `FACILITY_AT_CAPACITY` when relevant; never the incident room), route cache cleared, `requestImmediateRefresh(…, 'destination_changed')`. An ETA-only edit or the same hospital emits nothing new.
- The old `incident.updated { transportUpdated }` is **kept**: no client reads the field, but the web console (`socket-provider.tsx`) refetches the incident on `incident.updated` and does not listen to `incident.transport_updated` yet.
- Facility moved: each open transport to it gets `transportUpdated` and an immediate refresh (`'facility_moved'`). Deactivated: `transportUpdated` with `FACILITY_DEACTIVATED`, no refresh. Transports are never changed. The notice never throws into the facility write.
- RESOLVED: a crew with an open transport on its dispatch → 409 `{ code: 'TRANSPORT_OPEN', transportId, message: 'Record arrival at the hospital before resolving.' }`. Dispatcher/Supervisor resolution is unchanged (override).

Data-accuracy changes (found while moving the writes into transactions):
- `transport_records.updated_at` is now set when a destination is set or changed and on arrival (the column has no `@updatedAt`; before this it never changed).
- `destination_changed` now means "an already chosen hospital was replaced". Choosing the first hospital after "Decide later" no longer sets it, and a later edit never resets it to `false` (before this, re-sending the same id did).

Tests added/updated:
- `backend/test/incidents/transport.spec.ts` rewritten (59; checks now run inside the transaction behind the lock). New cases:
  - Start: the row-lock SQL; the ops payload has `destination` and no `destinationName`; refresh after commit; open record + first hospital → set (no 409, no create, audit, `transport_updated`, refresh); same hospital or no hospital → unchanged with nothing written; different hospital → `TRANSPORT_ALREADY_OPEN`; unknown incident → 404.
  - Arrival: conditional update; audit in the transaction; referral preference and exact `where`; no matching referral → untouched; no destination → no referral query; concurrent second arrival → 400 with nothing emitted; a replaced hospital → `destination_changed: true`.
  - Destination change: `transport_updated` payload, cache clear and refresh; `FACILITY_AT_CAPACITY` warning; first choice is not a "change"; ETA-only or same hospital → no event.
  - `notifyFacilityChanged`: moved, deactivated (rows untouched), nothing open, never throws; `findOpenTransportsForFacility` uses `openTransportWhere`.
- New `backend/test/responders/transport-status.spec.ts` (8, real `RespondersService` + real `TransportService`): PATCH TRANSPORTING creates an open record with destination null (same IncidentEvent, audit, notifications) and announces it; the following POST with a hospital sets it on that record; a second unit gets its own record without status effects; ASSISTING/EN_ROUTE → 409 with nothing written; rollback when the transaction fails (nothing announced); RESOLVED with an open transport → 409 `TRANSPORT_OPEN` (incident unchanged); after arrival → resolves as before.
- `backend/test/hospitals/hospital-location.spec.ts` (+2): a saved location notifies open transports after the write; a refused location does not. Both hospital specs provide a `TransportService` mock.
- `backend/test/notifications/reporter-status-push.spec.ts`, `backend/test/realtime/transport-events.spec.ts`, `tests/backend/responders.service.spec.ts`: constructor and mock plumbing only.

Verification:
- `pnpm --filter @agap/shared build` and `typecheck` → passed.
- `cd backend && npx jest --config ./test/jest.config.ts test/incidents test/hospitals test/responders test/locations` → 20 suites, 263 tests passed.
- `pnpm typecheck` → passed. `pnpm lint` → 1 error (baseline `incidents.service.ts:91`), 284 warnings (unchanged).
- `pnpm test` → 67 suites, 981 tests: 977 passed, 4 failed, all baseline (`barangay-notify` FALSE_ALERT; `auth-phase3` `BackupCodesService` ×3 timeouts).
- Root runner `pnpm --dir tests test -- backend/responders.service.spec.ts` → 11 passed, 12 failed. Every failure is the known "Expected constructor: X / Received constructor: X" `instanceof` problem (a second `@nestjs/common` copy, Prompt 04 follow-up).
- `cd frontend && npx tsc --noEmit --incremental false` → passed. `cd mobile && pnpm typecheck` → passed (the removed `destinationName` breaks no client).
- Boot (`BACKEND_PORT=3999 npx nest start`) → "Nest application successfully started" with the new module imports.
- Live probe, real code against the local DB, everything rolled back. On the newest dispatch's incident, set to ON_SCENE inside the transaction:
  - 1st `beginTransport` → `created`, `statusChanged: true`, destination null; incident TRANSPORTING; event `ON_SCENE → TRANSPORTING, "Transport started"`.
  - 2nd, with Joni Villanueva → `destination_set` on the same record; view `{ name, latitude: 14.79679, longitude: 120.94358, locationVerified: true }`.
  - 3rd, repeat → `unchanged`. 4th, another hospital → 409 `TRANSPORT_ALREADY_OPEN`. One record in the transaction.
  - After rollback: incident RESOLVED again and `transport_records` still 0. The raw `FOR UPDATE` query works on PostgreSQL.

Deviations from plan/prompt:
- `BeginTransportResult` also carries `previousStatus`, `outcome` and `destination`, so callers can announce the right event without re-reading.
- The PATCH path's IncidentEvent keeps the crew's note (`notes: dto.notes ?? null`), so `beginTransport` takes optional `notes`/`at` (default note "Transport started", as before for POST).
- No facility deactivation path exists: `UpdateHospitalDto` has no `isActive`, and `FacilitiesService` only changes receiving status. The `'deactivated'` branch is built and tested but has no caller yet (see Follow-ups).

Follow-ups:
- Wire `notifyFacilityChanged(id, 'deactivated')` into whatever deactivation endpoint is added later.
- `verifyLocation` (VERIFIED/REJECTED) does not notify open transports, although `locationVerified` in their view changes. A hospital REJECTED mid-transport stays the destination with no warning.
- An Org Administrator's `setLocation` puts the hospital in PENDING_REVIEW, but open transports are re-routed to the new, unreviewed coordinates (`TransportLegService` routes to any coordinates).
- `FacilitiesService.updateStatus` (receiving status → AT_CAPACITY/CLOSED) does not send `FACILITY_AT_CAPACITY` to open transports.
- The REST start path (`POST /transport` from ON_SCENE) still sends no reporter/dispatcher status notification (plan Table A gap (c)). The mobile app always PATCHes first, so the crew flow is unaffected.
- The RESOLVED guard is per dispatch, as the prompt says. Checked 2026-10-28 whether an incident-wide guard is needed: **not now**.
  - `DispatchService.create` is the only place dispatches are created. It accepts only ACKNOWLEDGED/ASSESSED/DISPATCH_PENDING and moves the incident to DISPATCHED, so the normal flow has one dispatch per incident.
  - Extra crew members share that dispatch, so the per-dispatch guard already covers them.
  - Two active units can only happen through UNABLE_TO_RESPOND → DISPATCH_PENDING → a new dispatch without cancelling the first. Nothing cancels active dispatches on UNABLE_TO_RESPOND (separate question for the dispatch module).
  - In that case a resolve would still complete the transporting unit's dispatch and set it AVAILABLE. Make the guard incident-wide (`openTransportWhere({ incident_id })`, message "Another unit is still transporting a patient") if multi-unit dispatch is added (e.g. MOD-52 surge).
- Remove `incident.updated { transportUpdated }` once the web console listens to `incident.transport_updated` (Prompt 12).
- Still open from Prompt 04: `dto.patientId` is not checked against the incident. Closed by this prompt: the open-transport race (now behind the row lock) and audits outside the transaction in arrival/update.
- Mobile (Prompt 11): show the `TRANSPORT_OPEN` message on "Mark Resolved". The app already shows `err.message` in an alert.

## Independent review of Prompts 07 and 08 — 2026-10-28

Status: DONE. Both prompts match the prompt text, Corrections C9/C14/C16/C17/C18 and the decisions in their reports. No duplicate rules or converters, no schema drift. One data-accuracy bug fixed, one comment corrected, plan §14 updated. Prompt 08B may start.

Checked (code, DB, Redis and tests directly, not the summaries):
- Duplication: `arrived_at: null` only in `open-transport.ts`, the arrival `updateMany` guard and the referral field `patient_arrived_at`. One `toTransportDestinationView` (in `facility-view.ts`). No `is_active` facility check outside `destination-rules.ts`. `destinationName` gone from backend, shared, frontend and mobile. No client reads `transportUpdated`, `transport_updated` or `route_updated` yet.
- Prompt 07: the flag-off path (`refreshSceneEta`) is the HEAD (Prompt 04) processor line for line, except that a job without a scene point is skipped. Stale fallback needs same leg + destination + age < 120 s. `estimated_arrival_at` is written only on TO_FACILITY through `openTransportWhere({ id })`. Hospital-leg route and ETA use `incidentRoom: false`.
- Prompt 08: `beginTransport` does lock → status → dispatch → crew → destination → open-or-create → `recordTransition` → `logInTransaction`, all on `tx`; emits only in `announceTransportBegun` after commit. The PATCH path skips the transition-map pre-check only for TRANSPORTING (re-checked under the lock) and gives the status audit, `status_changed` and reporter/dispatcher notifications only when the incident moved. Race check: a crew RESOLVED and another crew's transport start cannot both succeed (`FOR UPDATE` plus `recordTransition`'s `where { id, status: from }`). Referral stamping prefers the dispatch match, writes `updated_at` and a MOD-38 audit row (`facility_referrals.acknowledgment_status` has no declined value, so no status filter is missing). `onFacilityLocationChanged` runs after the facility write and cannot throw.
- Modules: `HospitalsModule` is imported only by `AppModule`; no cycle, no `forwardRef`.

Fixed:
- `updateTransport` wrote `change_reason: dto.changeReason ?? null` whenever `destinationId` was sent, even for the hospital already set. The mobile picker re-sends the current hospital with no reason (`saveDestination` → `updateTransportDestination`), so a reason a dispatcher recorded was erased. This bug predates Prompt 08, but Prompt 08 rewrote the method and fixed the same problem for `destination_changed` only. `change_reason` is now written only when the hospital actually changes. The "same hospital" test now asserts it (ran red first).
- `simplify-line.ts` comment said a kept point's parent is "always kept". With equal ranks at the cut-off the earlier point wins, so a child can be kept without its parent. The order and both ends are still kept. The comment now states what the code guarantees.
- Plan §14: `responder.eta_updated` and `responder.route_updated` rows said "ops + incident". Since Prompt 07 the incident room gets them only on TO_SCENE.

Not changed (low, recorded):
- After arrival the unit is AT_FACILITY until RESOLVED, and every throttled crew fix sends `route_updated { route: null }` to ops (one per 15 s). Harmless; Prompt 12 can ignore repeats.
- A dispatcher who changes the destination after arrival does not move the referral stamp to the new hospital (dispatcher correction path, rare).
- `beginTransport` re-validates the destination on a repeated start of the same hospital, so if that hospital went PENDING_REVIEW in between, the repeat gets 400 instead of `unchanged`.

Verification:
- `cd backend && pnpm test` → 67 suites, 981 tests: 980 passed, 1 failed (baseline `barangay-notify` FALSE_ALERT; the auth timeouts did not occur). After the fix: `test/incidents test/responders test/hospitals` 16 suites / 220 passed; `pnpm typecheck` passed; eslint on the changed file clean.
- Focused counts match the reports: transport 59, transport-status 8, transport-leg 11, eta-refresh 21, route-cache 5, simplify-line 5.
- `pnpm lint` → 1 error (baseline `incidents.service.ts:91`), 284 warnings.
- `npx prisma migrate status` → 21 migrations, up to date. `migrate diff --from-config-datasource --to-schema` → empty.
- Redis: Ubuntu was stopped at the start of this review; started with the keep-alive from the handoff. `redis-cli ping` → PONG, and Windows reaches it.
- Boot `BACKEND_PORT=3999 npx nest start` → Jobs/Hospitals/Incidents modules initialised, "successfully started", **no Redis warning** (first boot with Redis up since Prompt 07).
- **Live probe (first end-to-end run of 07+08)**: real `RouteCacheService` on Redis, real `TransportLegService`, `EtaRefreshProcessor`, OSRM and `beginTransport`, inside one rolled-back transaction on the newest dispatch (set to ACCEPTED / ON_SCENE inside it):
  - Cache set/get/clear round trip exact.
  - TO_SCENE: 273 s, 78 points, `route_updated` and ETA to the incident room; cached leg TO_SCENE.
  - `beginTransport` to Joni Villanueva → `created`, `statusChanged: true`, view with numeric coordinates, `locationVerified: true`.
  - TO_FACILITY: 365 s, 82 points, route and ETA with `incidentRoom: false`; `estimated_arrival_at` written on the open record; cached leg TO_FACILITY.
  - Arrival → AT_FACILITY: `route: null`, ops only, cache cleared.
  - After rollback: incident RESOLVED, dispatch COMPLETED, `transport_records` 0. Probe cache keys cleared.

Follow-ups: none new beyond the three "Not changed" items. Next: Prompt 08B.

## Fix: destination after arrival, and re-sent hospitals in review — 2026-10-28

Status: DONE. Two of the three "Not changed" items above, at the user's request. The AT_FACILITY "no route" repeats stay deferred to Prompt 12 (no listener yet; a parked unit sends few fixes because the GPS watch uses `distanceInterval: 15`).

Files changed: `backend/src/incidents/transport/transport.service.ts`, `backend/test/incidents/transport.spec.ts`, plan §12 "Destination selected / changed" row.

- **Destination change after arrival (data accuracy):** `updateTransport` now refuses a hospital change once `arrived_at` is set, for every role, with 409 `{ code: 'TRANSPORT_ARRIVED', transportId }`. The arrival already stamped that hospital's referral, so moving the destination would leave hospital A showing a patient who never came and hospital B's referral pending forever. The web drawer already hid "Change destination" after arrival (`IncidentDetailDrawer.tsx:370`); the backend now matches it. A dispatcher can still edit the ETA after arrival, and re-sending the same hospital is accepted. The responder's existing 400 after arrival is unchanged.
- **Re-sent hospital in review:** the destination rule now runs only when the hospital changes. One helper, `selectNewDestination(client, current, requested)`, is used by `updateTransport` and `recordArrival` and calls the one `assertSelectableDestination`. `beginTransport` handles "unchanged" and `TRANSPORT_ALREADY_OPEN` before validating. Re-picking the current hospital (mobile picker), repeating a start, or re-sending it on arrival no longer fails with 400 if an Org Administrator's pin move put it in PENDING_REVIEW meanwhile. Changing to a hospital in review is still refused.
- Side effects: an "unchanged" start now returns `warnings: []` (the hospital was not chosen again; no client reads `warnings`). A same-hospital PATCH no longer rewrites `destination_id`.

Tests: 4 new (re-sent hospital in review accepted on PATCH and on arrival with no facility lookup; dispatcher change after arrival → 409 with no transaction or emit; ETA edit / same hospital after arrival allowed). Repeated start and `TRANSPORT_ALREADY_OPEN` now also assert no facility lookup. The five "refuses an invalid destination" tests now request a different hospital, as the rule applies to a change. Mutation check: putting the old behaviour back makes 5 tests fail; restored → 63/63.

Verification:
- `cd backend && pnpm test` → 67 suites, 985 tests: 984 passed, 1 failed (baseline `barangay-notify`). `npx tsc --noEmit` passed. `pnpm lint` → baseline (1 error, 284 warnings).
- Live probe, real `TransportService` on the local DB in one rolled-back transaction: start to Joni Villanueva, then Joni set to PENDING_REVIEW → repeated start `unchanged`; PATCH same hospital OK and `change_reason` kept; PATCH to a different hospital in review → 400; arrival re-sending Joni → arrived, referral stamped; dispatcher change to Bocaue General after arrival → `TRANSPORT_ARRIVED`, row still Joni; ETA edit OK. After rollback: 0 transport records, Joni VERIFIED.

Schema review (`TransportRecord`, `facility_referrals`), no change made:
- The columns match what the code writes: `updated_at` has no `@updatedAt`, so every transport write sets it by hand (deliberately not the 15 s ETA write); `destination_changed` default false; `change_reason` unbounded in the DB but capped at 500 by the DTO; `destination_id` FK `ON DELETE SET NULL` matches the optional relation. `migrate diff` empty.
- `transport_records` has **only its primary key**. The ETA job looks up the open transport by `dispatch_id` on every run (about 4 per minute per moving unit), `findOpenTransportsForFacility` filters by `destination_id`, and `listTransports` by `incident_id`. Small table today, so not urgent. **Recommend adding `@@index([dispatch_id])`, `@@index([destination_id])`, `@@index([incident_id])` in Prompt 08B's migration**, which already alters this table.
- A DB-level "one open transport per dispatch" unique index is not recommended: "open" also depends on the incident status (C16), which a partial index cannot see. The `FOR UPDATE` lock in `beginTransport` covers it.

Still open (from Prompt 08): an Org Administrator's `setLocation` can put an in-use hospital into PENDING_REVIEW and re-route ambulances to the unreviewed pin. Suggested fix: 409 while open transports head there.

## Prompt 08B — Crew-confirmed reporter-patient flag (schema + endpoint) — 2026-10-28

Status: DONE. Gate: Prompt 08 done and reviewed (2026-10-28).

Files changed:
- `backend/prisma/migrations/20261028120000_transport_reporter_patient_confirmation/migration.sql` + `down.sql` (new, hand-written in the `20261025120000_facility_coordinates` style): two columns, FK `transport_records_reporter_patient_confirmed_by_id_fkey` → `users(id) ON DELETE SET NULL`, CHECK `transport_records_reporter_patient_confirmed_pair_chk` (`(at IS NULL) = (by_id IS NULL)`).
- `backend/prisma/schema.prisma`: `TransportRecord.reporter_patient_confirmed_at` (`Timestamptz(6)`), `reporter_patient_confirmed_by_id`, relation `reporter_patient_confirmed_by` (`"TransportReporterPatientConfirmedBy"`, SetNull); back-relation `User.transport_reporter_patient_confirmations`. `prisma format` only re-aligned the `TransportRecord` block (`git diff -w` shows only the new lines).
- `backend/src/incidents/transport/transport.service.ts`: `confirmReporterIsPatient`, `ReporterPatientHint`, private `reporterClaimsPatient`; `listTransports` adds the hint.
- `backend/src/incidents/transport/dto/confirm-reporter-patient.dto.ts` (new): `confirmed` with `@IsBoolean()` (no id field, so C19 does not apply).
- `backend/src/incidents/incidents.controller.ts`: `PATCH /v1/incidents/:id/transport/:transportId/reporter-patient`, roles DISPATCHER, SUPERVISOR, RESPONDER.

Behaviour:
- Checks, in order: transport exists on this incident (404) → crew check for responders (`assertCrew`, 403) → transport open (`openTransportWhere`, else 409 `TRANSPORT_NOT_OPEN`) → registered reporter (`incident_reporters.user_id` not null, else 400 "This report was sent without an account, so there is no reporter to share with."; also when there is no reporter row).
- `confirmed: true` sets both columns (now, actor); `false` clears both. One `$transaction`: a conditional `updateMany` on `openTransportWhere({ id })` (an arrival in between → 409, nothing written) + `audit.logInTransaction` (`UPDATE`, `transport_record`, `MOD-40`, `{ reporter_patient_confirmed: old }` → `new`; no patient data). `updated_at` is set.
- Asking for the state already recorded writes nothing and returns the record, so the first confirmer and time are kept.
- `listTransports`: every record already carries `reporter_patient_confirmed_at` (and `_by_id`) through the row spread. Staff (not hospital users) also get `reporterClaimsPatient` (`incident_patients.is_reporter` count > 0, or `incident_reporters.reporter_status = 'NEEDS_HELP'`). The hint is computed from a count and the status only; no patient name is read for it. The `ReporterPatientHint` doc comment says it is the reporter's own unconfirmed claim and never unlocks the destination.
- No realtime event and nothing reaches a reporter yet: Prompt 09 enforces the rule.

Tests added/updated (`backend/test/incidents/transport.spec.ts`, now 81):
- `confirmReporterIsPatient` (12): crew confirm (exact `updateMany` where/data, exact audit row in the transaction, nothing written outside it); withdraw clears both; same state → no transaction or audit; DISPATCHER/SUPERVISOR without crew check; non-crew responder → 403; guest report and missing reporter row → 400 with the exact message; closed transport → 409 `TRANSPORT_NOT_OPEN`; closed between check and write → 409, no audit; other incident → 404; DTO requires a boolean.
- `listTransports` (+5): staff get both fields and the hint queries are a count + `select: { reporter_status }`; NEEDS_HELP → true, SAFE/none → false; hospital users get no hint and the hint queries do not run.
- Route roles (+1). Mock Prisma gained `incident_patients.count`, `incidentReporter.findUnique`, `transportRecord.count`; `mockTransportRecord` has the two new columns.
- Mutation check: disabling the guest check (2 fail), the open check (1 fail) or the hospital-user exclusion (1 fail) is caught; restored → 81/81.

Verification:
- `npx prisma validate` → valid. `npx prisma migrate dev` → applied `20261028120000_transport_reporter_patient_confirmation`, "Your database is now in sync with your schema" (no extra migration generated). `npx prisma generate` → OK. `npx prisma migrate status` → 22 migrations, up to date.
- `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `-- This is an empty migration.`
- CHECK probe (local DB, each case rolled back): both set → accepted; both null → accepted; only `_at` → refused by `transport_records_reporter_patient_confirmed_pair_chk`; only `_by_id` → refused by the same. `pg_constraint` shows the FK with `ON DELETE SET NULL`. 0 transport records afterwards.
- `cd backend && npx jest --config ./test/jest.config.ts test/incidents` → 13 suites, 192 passed.
- `pnpm typecheck` → passed. `cd frontend && npx tsc --noEmit --incremental false` → passed. `cd mobile && pnpm typecheck` → passed.
- `pnpm lint` → 1 error (baseline `incidents.service.ts:91`), 285 warnings (baseline 284; +1 is `@Request() req: any` on the new route, the pattern of all 33 routes in that controller).
- `pnpm test` → 67 suites, 1003 tests: 1001 passed, 2 failed, both baseline (`barangay-notify` FALSE_ALERT; `auth-phase3` `BackupCodesService` timeout).
- Boot (`BACKEND_PORT=3999 npx nest start`) → "Mapped {/incidents/:id/transport/:transportId/reporter-patient, PATCH} (version: 1)", "Nest application successfully started", no Redis warning.
- Live probe, real `TransportService` + real `AuditService`, one rolled-back transaction: guest reporter → 400; registered reporter → hint false; confirm → both columns set, by = actor; repeat → time unchanged; reporter status NEEDS_HELP → hint true; withdraw → both null; exactly 2 audit rows (`UPDATE`, `transport_record`, `MOD-40`, `false→true`, `true→false`); after arrival → `TRANSPORT_NOT_OPEN`. After rollback: audit rows 21 → 21, transport records 0 → 0.

Deviations from plan/prompt:
- Audit `entityType` is `'transport_record'`, not `'TransportRecord'`: every other transport audit row uses `'transport_record'`, and one name lets one query find all of a transport's rows (§0 rule 2).
- The open check is also a conditional update inside the transaction, so a transport that arrives between the check and the write is never confirmed.
- A request for the state already recorded is a no-op (no write, no audit), so the original confirmer is kept.
- `reporterClaimsPatient` is not sent to hospital users (the prompt calls it a hint for the crew; least privilege). They still get `reporter_patient_confirmed_at` with the row.
- The 400 for a missing registered reporter also applies to `confirmed: false`; on a guest report there is never anything to clear.

Follow-ups:
- Prompt 09: read the flag when each event is emitted, so a withdrawal mid-transport stops the reporter's copies at once. Changing the flag emits nothing today; the crew and dispatcher screens see it on their next fetch (Prompts 10/12 may want an event).
- Schema: `transport_records` still has only its primary key (see the 07/08 review). Not added here; §0 rule 1 keeps this prompt to its own migration.
- The new CHECK and `ON DELETE SET NULL` would refuse deleting a user who confirmed a transport (SET NULL leaves `_at` without `_by_id`). Not reachable: `AdministrationService.deleteUser` refuses any account with audit history, and every confirmation writes one with that user as actor. If hard deletes ever widen, change the FK to `NO ACTION` or relax the CHECK.
- LGU DPO sign-off on C17 is still needed before Prompt 10.

---

## Independent review of Prompt 08B, and two fixes — 2026-10-28

Review (code, DB and tests checked directly): **correct.** `git diff -w schema.prisma` shows only the 08B lines (no duplicate field or relation). `migrate status` 22 up to date; `migrate diff` → `-- This is an empty migration.`; `pg_constraint` FK (`ON DELETE SET NULL`) and `transport_records_reporter_patient_confirmed_pair_chk` match `migration.sql`; `down.sql` reverses it (not run). One open-transport definition (`openTransportWhere`). Hint reads counts and `reporter_status` only. No realtime emit. The five recorded deviations are accepted. CHECK + `ON DELETE SET NULL` user-delete interaction confirmed unreachable (`administration.service.ts` `deleteUser` refuses accounts with audit history; every confirmation writes one).

Fixes (user approved):
1. `reporterClaimsPatient` compared `reporter_status` with the literal `'NEEDS_HELP'`; now `ReporterStatus.NEEDS_HELP` from `@agap/shared` (one definition).
2. Two identical requests at the same moment (two crew members tapping "confirm") both passed the pre-check outside the transaction and both wrote: two audit rows, and the second replaced the first confirmer. The conditional `updateMany` now also requires the other state (`reporter_patient_confirmed_at: confirmed ? null : { not: null }`). When it matches nothing, the transaction re-reads with `openTransportWhere`: not open → 409 `TRANSPORT_NOT_OPEN`; open → another request already recorded this state, so its record is returned with no write and no audit. Under READ COMMITTED Postgres re-checks the WHERE after waiting for the row lock, so the second request matches 0 rows.

Verification:
- `test/incidents` → 13 suites, 193 passed (new test: the request that confirms second gets the first confirmer's record and no audit row; the "closed in between" test now asserts the re-read).
- `pnpm typecheck` (backend) → passed. `eslint` on `transport.service.ts` and `transport.spec.ts` → clean.
- Live probe on the local DB (temporary transport row, rolled back): confirm 1 row, repeated confirm 0, withdraw 1, repeated withdraw 0. Transport records 0 → 0, audit rows 21 → 21.

---

## Prompt 09 — Locations: service-area fixes, reporter privacy, leg-aware tracking seed — 2026-10-28

Status: DONE. This completes plan Phase 2. Gate: Prompt 08B done and reviewed (2026-10-28).

Files changed:
- New `backend/src/incidents/transport/transport-leg.module.ts`: `TransportLegModule` provides and exports `TransportLegService` and `TransportAudienceService`. It depends only on the global Prisma module, so `LocationsModule` can import it even though `IncidentsModule` imports `LocationsModule` (no cycle, no `forwardRef`, one instance). `IncidentsModule` no longer provides `TransportLegService` itself; it imports the module and re-exports it to `JobsModule`/`RespondersModule`.
- New `backend/src/incidents/transport/transport-audience.service.ts`: `TransportAudienceService`.
  - Per incident it returns `{ reporterUserId, dispatches → { leg, crewUserIds, reporterConfirmedPatient } }`. `reporterConfirmedPatient` = the dispatch's latest transport (open or arrived) has `reporter_patient_confirmed_at`. `is_reporter`/`reporter_status` are never read.
  - `forIncident` is cached in memory for 10 s per incident; `load` is uncached (REST). `invalidate` bumps an epoch, so a lookup that overlapped an invalidation is not cached.
  - `roomsForDispatch(incidentId, dispatchId, leg?)` is the one rule (`audienceRooms`): TO_SCENE → incident room; TO_FACILITY/AT_FACILITY → crew `user:` rooms plus the reporter's only when confirmed and registered. It fails closed: when the lookup fails, or the dispatch is unknown, a hospital or unknown leg goes to ops only. `confirmedReporter(…)` returns the user id or null.
- New `backend/src/locations/responder-fix-area.ts`: `assertResponderFixInArea` is the one geofence rule for responder fixes. Bocaue → OK. Service area → OK only if the user is crew on a dispatch of this incident with an open transport (`openTransportWhere`, C16). Otherwise 400 with the existing message. Used by `trackResponder` and `pushLocation`.
- `backend/src/locations/locations.service.ts`:
  - `capture`/`reverseGeocode` stay Bocaue-only.
  - `getRouteBetween` checks both ends against the service area (400 "Route points must be within the service area.").
  - `trackResponder` uses the geofence helper and sends the location to `roomsForDispatch`.
  - `getLatestUnitPositions` adds `leg`, `destination` and `route`. The route comes from `RouteCacheService` when it matches the leg and destination. On a cache miss on TO_SCENE with a fix it routes inline (simplified like the job); on a cache miss on the hospital leg the route is null. It redacts for a reporter who is neither staff nor crew and not confirmed on that unit's dispatch, on TO_FACILITY/AT_FACILITY: position, route, destination null, `eta` null, leg kept. `estimateEta` → `routeInline` (returns route and ETA).
- `backend/src/locations/route-cache.service.ts`: `isRouteFor(cached, leg, destination)` (one rule, also used by the processor's stale fallback).
- `backend/src/realtime/realtime.service.ts`:
  - `RealtimeAudience` type. `responderLocation`/`notifyResponderLocationUpdated` take an audience (incident room only on TO_SCENE, plus user rooms). `notifyEtaUpdated` sends to user rooms. `routeUpdated` uses the type.
  - `incidentTransporting`/`facilityArrival` take an optional confirmed reporter id and send that user the status copy plus `destination`.
  - New `routeWithdrawn` (user room only).
- `backend/src/jobs/processors/eta-refresh.processor.ts`: route and ETA go to `roomsForDispatch(…, leg.leg)` (the leg resolved by this run wins over the cached one). New reason `audience_changed`.
- `backend/src/incidents/transport/transport.service.ts`: invalidates the audience on transport start (created), destination set/changed, arrival and confirm/withdraw. `incident.transporting`/`incident.facility_arrival` pass the confirmed reporter. `transport_updated` goes to the hospital-leg audience. A change of the confirmation invalidates, sends `routeWithdrawn` to the reporter on withdrawal, and requests an immediate refresh. The arrival payload carries the destination view. New private `destinationView` (also used by `notifyFacilityChanged`).
- `backend/src/responders/responders.service.ts`: `pushLocation` uses the geofence helper and the audience. `TransportAudienceService` is injected before the optional notifier.
- `shared/src/events/incident.events.ts`: `IncidentFacilityArrivalPayload.destination?` (ops and confirmed-reporter copies only); comment on `IncidentTransportingPayload.destination`.
- `mobile/src/services/api/locations.api.ts`, `frontend/features/map/api.ts`: `LatestUnitPosition` mirrors gain optional `leg`, `destination`, `route` (type only).
- Plan §14: `responder.location_updated` and `incident.facility_arrival` rows now match the code.

Tests added/updated:
- New `backend/test/locations/transport-privacy.spec.ts` (19). Real `LocationsService` + real `TransportAudienceService`.
  - A confirmed reporter gets destination, route, position and ETA on TO_FACILITY, and the hospital on AT_FACILITY.
  - A bystander gets nulls on both legs. A reporter with `is_reporter`/NEEDS_HELP who is not confirmed gets nulls, and `incident_patients` is never queried.
  - Two units to two hospitals with the reporter confirmed on one: the other is redacted and its hospital name is absent from the JSON.
  - Scene leg unchanged. Staff, crew and a reporter who also crews get full data. Guest report.
  - No patient or responder identifiers (JSON regex).
  - Route source: cache hit with no inline routing; TO_FACILITY miss → null with no routing; TO_SCENE miss → inline; cached route for another hospital not served; a redacted unit does not read the cache.
- New `backend/test/realtime/transport-audience.spec.ts` (16). Real `TransportAudienceService` + real `RealtimeService` over a mocked gateway.
  - TO_FACILITY/AT_FACILITY: nothing in the incident room, crew get every event, an unconfirmed reporter gets none. A confirmed reporter gets all four (user copy of `transport_updated` without the facility id). TO_SCENE unchanged.
  - Guest: no reporter emit. Caller leg wins. Fail closed. Unknown dispatch → ops only.
  - Transporting/arrival copies.
  - Cache: one lookup within the TTL, expiry, confirm then withdraw then new audience, transport start, epoch race, uncached `load`.
- `location-bounds.spec.ts` rewritten (14): intake stays Bocaue-only; Malolos with an open transport → accepted (exact `openTransportWhere` filter); without → 400 before persisting; Manila → 400 without querying; Bocaue skips the query; route endpoint service area (both ends); `pushLocation` same three cases.
- `transport.spec.ts` (86, +4): confirm → invalidate then refresh; withdraw → `routeWithdrawn` to the reporter; no-op or lost race → nothing; transporting → invalidate and `confirmedReporter`; arrival passes the confirmed reporter after invalidation and carries the destination; `transport_updated` goes to the audience's crew. The "re-sent hospital" arrival test now checks that the rule's query did not run (the only read is the view).
- `reporter-status-push.spec.ts` (+1): the reporter's TRANSPORTING feed row and push carry no hospital name/id and read no transport.
- Plumbing: `eta-refresh.spec.ts` (audience mock follows the leg rule; the hospital-leg test now expects crew user rooms), `live-tracking.spec.ts`, `transport-status.spec.ts`, `dispatch-tracking.spec.ts`, root `tests/backend/responders.service.spec.ts` (provider only).
- Mutation check: 8 rule breaks were each caught by a failing test, then restored. The breaks: no redaction; reporter-who-crews ignored; unconfirmed reporter in user rooms; hospital-leg location to the incident room; lookup failure failing open; epoch guard removed; geofence ignoring the open transport; confirm not invalidating.

Verification:
- `pnpm --filter @agap/shared build` and `typecheck` → passed.
- `cd backend && npx jest --config ./test/jest.config.ts test/locations test/realtime test/incidents` → 22 suites, 314 passed (with responders/dispatch/notifications: 27 suites, 411 passed).
- `pnpm typecheck` → passed. `pnpm lint` → 1 error (baseline `incidents.service.ts:91`), 285 warnings (baseline).
- `pnpm test` → 69 suites, 1054 tests: 1053 passed, 1 failed (baseline `barangay-notify` FALSE_ALERT).
- `cd frontend && npx tsc --noEmit --incremental false` → passed. `cd mobile && pnpm typecheck` → passed.
- Boot (`BACKEND_PORT=3999 npx nest start`) → `TransportLegModule`, Jobs, Locations, Responders, Incidents initialised; "Nest application successfully started".
- Live probe: real services on the local DB (one rolled-back transaction), real OSRM and Redis, fake socket gateway. Newest dispatch set to ACCEPTED/ON_SCENE, a registered reporter:
  1. TO_SCENE fix → ops + incident room. Malolos fix with no transport → 400.
  2. Start to Joni Villanueva → incident-room copy keys `incidentId,transportId,dispatchId,transportStartedAt`.
  3. Bocaue and Malolos fixes on the hospital leg → ops + crew `user:` room only. Manila → 400.
  4. ETA job → `route_updated` and `eta_updated` to ops + crew; 123 points, 426 s. **Last coordinate `[120.943519, 14.796745]` ≈ `[120.9436, 14.7968]` (Phase 2 acceptance).**
  5. REST: reporter all null with leg TO_FACILITY; dispatcher full (route from the Redis cache); no patient fields.
  6. Confirm → next route also reaches the reporter's room; reporter REST full.
  7. Withdraw → reporter gets `{ destination: null, route: null }`; next route ops + crew only; reporter REST null again.
  8. Re-confirm + arrival → `facility_arrival` to ops, incident (status only), reporter (with destination).
  9. Counts before/after rollback identical (transport records 0, audit 21, fixes 1); probe cache key cleared.

Deviations from plan/prompt:
- Module wiring: the prompt suggests the audience service beside `IncidentParticipantService` (RealtimeModule). It lives in `incidents/transport` in a new `TransportLegModule`, because it needs `TransportLegService` and RealtimeModule cannot import from IncidentsModule.
- The audience entry also carries the dispatch's leg (not in the prompt's shape). The location emit needs the leg, and the cache avoids two leg queries per GPS fix. The ETA job passes its freshly resolved leg, which wins.
- REST uses the uncached `load` (a seed must match the DB); events use the 10 s cache plus explicit invalidation at every leg or confirmation change.
- Fail closed: an audience lookup error sends a hospital or unknown leg to ops only (a scene leg still reaches the room).
- Withdrawal: the immediate refresh cannot reach a reporter who just lost access, so `routeWithdrawn` tells only that reporter to drop the destination and route ("switches within seconds").
- `IncidentFacilityArrivalPayload.destination` added (ops and confirmed-reporter copies) so the reporter copy can carry the view; the incident room copy is still built field by field without it.
- `pushLocation` had **no** geofence before (the prompt says "as today"). It now uses the same rule as `/locations/track`; no client calls `/responders/location` (mobile uses `/locations/track`).
- The prompt quotes the dispatcher's TRANSPORTING text. The reporter's is "Responders are taking the patient to a receiving facility for {ref}." The new test pins that one.
- A reporter who also crews a unit on the incident gets the crew view ("not staff, not crew").
- Client mirrors: the new fields are optional, because units first seen over the socket do not have them.
- Manual check run through the real `RealtimeService` with a recording gateway instead of a Socket.io client (same payload and rooms; no committed seed data needed).

Follow-ups:
- Mobile `mergeTrackingLocation` (`mobile/src/lib/incident-tracking.ts`) rebuilds a unit field by field, so every location patch drops `leg`/`destination`/`route` from the REST seed. Prompt 11 must keep them (spread `current`).
- On the hospital leg an unconfirmed reporter now receives no positions (intended), so the mobile marker freezes at its last scene position until Prompt 11 shows the status-only card.
- `GET tracking/:id/eta` (`getEta`) is reporter-accessible, always routes to the scene from the newest fix of anyone, and routes on every request. It leaks no destination, but it is neither leg-aware nor cached. Not in this prompt.
- The `incident.transporting` reporter copy cannot fire today: confirmation needs an open record, and a new transport always starts unconfirmed. It is built as the prompt asks.
- The audience cache is per process; a second backend instance would see a change at most 10 s late (documented in the class).
- An inline REST route (scene leg, cache miss) is not written to the route cache.
- Probe only: pg logs "client.query() when the client is already executing a query" because parallel reads share one transaction connection. Production uses the pool.

## Independent review of Prompt 09, and one geofence fix — 2026-10-29

Status: Prompt 09 reviewed, correct. One gap fixed (user approved; outside the prompt pack).

Review (code, DB and tests checked directly):
- Schema: only the 08B lines differ from `6a7635b`. `migrate status` 22 up to date; `migrate diff` empty; `_prisma_migrations` has no duplicate rows; the 08B FK and pair CHECK exist and no row violates the CHECK.
- Data: `transport_records` 0 rows (the Prompt 09 probe rolled back), no dispatch with two open transports, no TRANSPORTING incident without an open transport, no `route:dispatch:*` keys left in Redis.
- `arrived_at: null` only in `open-transport.ts` and the arrival guard; `TransportLegService`/`TransportAudienceService` provided only by `TransportLegModule` (one instance, one cache). Every leg-sensitive emit goes through `roomsForDispatch`/`confirmedReporter`; audience invalidations run after commit.
- User delete vs the 08B CHECK (`ON DELETE SET NULL` on the confirmer): not reachable, because a confirmer always has an audit row and `deleteUser` refuses accounts with audit history.

Gap: the Prompt 09 geofence accepted a fix outside Bocaue (inside the service area) only during an **open** transport. After arrival at a hospital outside Bocaue every fix was refused with 400, the crew app showed the upload error, and the dispatcher's marker froze at the last fix before arrival until the unit re-entered Bocaue.

Fix:
- `backend/src/incidents/transport/open-transport.ts`: `AT_FACILITY_ENDED_STATUSES` (RESOLVED, CLOSED) and `atFacilityTransportWhere(extra)` (arrived, incident not RESOLVED/CLOSED) beside `openTransportWhere`. `TransportLegService` now reads its AT_FACILITY end statuses from there (one definition).
- `backend/src/locations/responder-fix-area.ts`: one count with `OR: [openTransportWhere(crewed), atFacilityTransportWhere(crewed)]`. Inside Bocaue, outside the service area, no transport, not crew, and RESOLVED/CLOSED behave as before. The reporter's audience is unchanged (AT_FACILITY already goes to ops + crew + a confirmed reporter only).
- `backend/test/locations/location-bounds.spec.ts` (17, +3): exact OR filter for both endpoints, the two filter shapes, at-hospital accepted on `/locations/track` and `/responders/location`.

Verification:
- `location-bounds.spec.ts` 17 passed. Mutation (at-facility branch removed) → 3 failed, restored.
- Live probe on the local DB (one rolled-back transaction, Malolos fix, dispatch `…0006-000000000001`): no transport → refused; open → accepted; arrived + TRANSPORTING → accepted; arrived + ASSISTING → accepted; not crew → refused; RESOLVED → refused; CLOSED → refused. `transport_records` 0 before and after.
- `pnpm test` (backend): 1057 tests, 1051 passed, 6 failed, all baseline: `barangay-notify` FALSE_ALERT and bcrypt-heavy `auth-phase2`/`auth-phase3` timeouts under full-suite load (`auth-phase2` alone: 9/9 passed).
- `pnpm typecheck` passed (backend, frontend, mobile); frontend `npx tsc --noEmit --incremental false` passed. Lint baseline (1 error / 285 warnings).

Follow-ups:
- The service area is Bulacan only. Transports to hospitals outside Bulacan (e.g. Valenzuela, Caloocan) are still refused; add a referral corridor in config if MDRRMO uses them.
- A newly dispatched unit's scene-leg positions reach only ops for up to 10 s (the audience cache does not know the dispatch yet). Fails closed; no leak.

## DPO gate waiver (development) and the reporter-sharing launch switch — 2026-10-29

Status: DONE. Prerequisite for Prompt 10 (approved in the 2026-10-28 session, confirmed by the user in this session).

**Waiver.** The Prompt 10 gate (LGU Data Protection Officer sign-off on plan §17 / Correction C17) is **waived for development only**: the user answered "yes" on 2026-10-29 to "Do you waive the DPO sign-off for development". The DPO review is **still required before production**; until then the launch switch below stays off.

**Launch switch** (addition outside the prompt pack, user approved): `REPORTER_DESTINATION_SHARING_ENABLED`, a string flag like `TRANSPORT_ROUTING_ENABLED`, **off unless exactly `'true'`**.
- `backend/src/incidents/transport/transport-audience.service.ts`: `reporterSharingEnabled()` (the one read of the flag). `load` sets `reporterConfirmedPatient` false while it is off, even when a confirmation is stored. Socket emits (`roomsForDispatch`), `confirmedReporter(…)` and the REST seed (`getLatestUnitPositions`) all read `load`, so this is the one enforcement point. `ConfigService` injected (global ConfigModule).
- `backend/src/incidents/transport/transport.service.ts`: `PATCH /incidents/:id/transport/:tid/reporter-patient` → 403 "Sharing the hospital with the reporter is not enabled yet." while off, before any read or write (confirm and withdraw). `GET /incidents/:id/transport` rows for staff/crew carry `reporterSharingEnabled` (hospital users get neither hint).
- `backend/src/config/config.validation.ts`, `.env.example` (`REPORTER_DESTINATION_SHARING_ENABLED=false`).
- Unaffected: crew navigation, routes, ETA, the dispatcher view, arrival.

Tests:
- `transport-audience.spec.ts` (+6): flag unset/`'false'`/`'TRUE'`/`'1'`/`''` → a stored confirmation never puts the reporter in any emit, `confirmedReporter` null, `load` false; `'true'` → current behaviour. Existing tests run with the flag on.
- `transport-privacy.spec.ts` (+2): flag off → a confirmed reporter gets nulls on TO_FACILITY/AT_FACILITY (no hospital name in the JSON); staff still get the destination.
- `transport.spec.ts` (+2): flag off → 403 for confirm and withdraw with no read, write, audit, invalidation or event; `listTransports` carries `reporterSharingEnabled` true/false; hospital users do not get it.
- Mutation: audience guard removed → 7 failed; endpoint guard removed → 1 failed; `=== 'true'` loosened to `!== 'false'` → 4 failed. Restored.

## Prompt 10 — Mobile responder UI (Phase 3) — 2026-10-29

Status: DONE (code and automated checks). Device check NOT RUN (no Android device in this session). Gate: Phase 2 done (Prompts 00–09 incl. 08B); DPO sign-off waived for development by the user in this session (section above). The C17 crew switch respects `REPORTER_DESTINATION_SHARING_ENABLED` and is hidden while it is off (default).

Files changed:
- `mobile/src/services/api/transport.api.ts`: facility types gain `latitude`/`longitude` (numbers), `location_status`, `receiving_status`, `municipality`; `TransportRecord` gains `reporter_patient_confirmed_at`, `reporterClaimsPatient`, `reporterSharingEnabled`; start/update return `warnings`. New `getNearbyHospitals(lat, lng)` (`GET /hospitals/nearby`) and `confirmReporterPatient(…)` (`PATCH …/reporter-patient { confirmed }`). (`locations.api.ts` already had `leg`/`destination`/`route` from Prompt 09.)
- New `mobile/src/lib/transport-target.ts` (pure): `selectRouteTarget` (SCENE / FACILITY / NONE), `shouldShowReporterPatientSwitch`, `buildDestinationList`, `isRouteLastKnown` (stale or > 120 s), `SERVICE_AREA_BOUNDS` (bbox of the shared `FACILITY_SERVICE_AREA`), `needsServiceAreaBounds`, `formatDistance`/`formatDuration` (moved from the assignment screen).
- New `mobile/src/hooks/useTransportRoute.ts`: the one leg-aware rule for both responder screens. This crew's transports (`['incident-transports', id]`), the target, the hospital marker, and the route: the server route for this dispatch when it matches the target's leg and hospital (seed + `responder.route_updated` via `useIncidentTracking`), else `useRouteLine(myPoint, target.point)`.
- `mobile/src/hooks/useIncidentTracking.ts`: handles `responder.route_updated` and `incident.transport_updated` by patching `['incident-tracking-latest', id]`; 15 s REST poll only while the socket is disconnected; returns `units`. Room joins are reference-counted per incident, so closing one screen does not take another (the Map tab) out of the room.
- `mobile/src/lib/incident-tracking.ts`: `mergeTrackingLocation` keeps `leg`/`destination`/`route`; new `mergeRouteUpdate` and `mergeTransportUpdate` (drops the route only when the hospital changed; never keeps a facility id).
- `mobile/src/components/tracking/live-tracking-map.tsx`: props `destination` (hospital marker, built with `toLngLat`), `incidentDimmed`, `routeDimmed`. With a destination, fit-route (and a first fit when it appears) frames responder + hospital + route, not the scene. `maxBounds` widens to the service area (min zoom 9) when the destination or route leaves Bocaue.
- `mobile/src/components/responder/navigate-button.tsx`: `title`, `searchQuery` (Google Maps name search) and `warning`. `mobile/src/services/navigation/external-nav.ts`: `openGoogleMapsSearch`, chooser `title`.
- `mobile/src/components/responder/DestinationPicker.tsx`: nearest VERIFIED hospitals from `/hospitals/nearby` (server order, "{x} km straight-line") then the other selectable hospitals from `/hospitals` alphabetically; receiving-status badge (Open / ER only / At capacity / Closed / Unknown) and "Location not verified" badge; defensive PENDING_REVIEW/REJECTED drop; "Decide later" kept; strings translated.
- New `mobile/src/components/responder/transport-banners.tsx`: "Route unavailable — using last known", "Hospital location not verified", "Keep AGAP open during transport".
- `mobile/app/responder/assignment/[id].tsx`: uses `useTransportRoute`; ETA chip "{km} • ~{min} est. to {hospital}" (scene: "… est."), dimmed when last known; scene pin dimmed and hospital marker during transport; banners; Navigate targets the hospital ("Navigate to {hospital}"), or a name + municipality search with the warning when the location is not verified or missing. Card: "Destination not set", Set/Change destination → PATCH only ("Decide later" saves nothing; the server opened the record), FACILITY_AT_CAPACITY warning from the API, "Arrived {time} — complete handover, then Mark Resolved". Footer: "Arrived at hospital" (confirmation dialog) is the primary action while the transport is open; Mark Resolved only after arrival; 409 TRANSPORT_OPEN → readable message and a transport reload. C17 switch (off by default, never pre-enabled), hint when `reporterClaimsPatient`, confirmation dialog on turning on, none on turning off, API message on error.
- `mobile/app/responder/map.tsx`: same hook; hospital marker, dimmed scene pin, leg-aware ETA line and banners; the destination card shows the hospital during transport.
- `mobile/src/lib/assignment-progress.ts`: `nextAssignmentActions(dispatch, incident, transport?, labels?)` — TRANSPORTING: open → `{ kind: 'arrive' }`, arrived/none → Resolve, not loaded → nothing. `isTransportOpenError`.
- `mobile/src/i18n/translations.ts`: new `transport` namespace (en + fil), function style like `readiness`.
- Backend (small, additive; see deviations): `PATCH /incidents/:id/transport/:tid` returns `warnings` (same shape as POST); `GET /incidents/:id/transport` facility rows include `municipality`.

Tests added/updated:
- New `mobile/src/lib/__tests__/transport-target.test.ts` (20): the three required `selectRouteTarget` cases plus not-TRANSPORTING, "Decide later", arrived, unverified-with-coordinates; switch shown only open + sharing on (off, missing flag, arrived, none, claim-only → hidden); destination list order/dedup/defensive filter; 120 s rule; bounds; formatters.
- New `mobile/src/lib/__tests__/assignment-progress.test.ts` (13; none existed): the flow, open → Arrived only, arrived → Resolve, none → Resolve, not loaded → nothing, translated label; `isTransportOpenError`; `shouldShareLocation`.
- `mobile/src/lib/__tests__/incident-tracking.test.ts` (+10): location patch keeps the leg; route merge/add/withdraw/other units; transport_updated new vs same hospital, no facility id, before seed.
- `backend/test/incidents/transport.spec.ts` (+1, 1 updated): PATCH returns `FACILITY_AT_CAPACITY` / `[]`; list selects `municipality`.

Verification:
- `cd mobile && pnpm typecheck` → passed. `pnpm lint` → 6 errors / 53 warnings (baseline 7 / 53; the removed one was the unused `TransportRecord` import in the assignment screen; the other 6 are pre-existing in untouched files). ESLint on the touched files: 0 errors, 1 pre-existing warning (`as any` on the 3D buildings layer). `pnpm test` → 4 suites, 50 passed (baseline 8).
- Backend `pnpm test` → 1068 tests, 1067 passed, 1 failed (baseline `barangay-notify` FALSE_ALERT). `pnpm typecheck` passed; lint baseline (1 error / 285 warnings). Frontend `npx tsc --noEmit --incremental false` passed.
- Boot (`BACKEND_PORT=3999 npx nest start`): `TransportLegModule` initialised (ConfigService resolves), "Nest application successfully started".
- Read-only probe in the real app context: flag unset → `reporterSharingEnabled()` false; confirm → 403 "Sharing the hospital with the reporter is not enabled yet." before any read; audit count unchanged.
- Device check (plan Table E "Responder" rows), all **NOT RUN** (no Android dev build/device in this session):
  1. Accept → En Route → route to scene, "To scene" ETA estimate — NOT RUN
  2. On Scene → Transporting → picker sorted by distance with receiving status — NOT RUN
  3. Cancel picker → "Destination not set"; dispatcher drawer shows the record — NOT RUN
  4. Select Joni Villanueva → marker + road route within 20 s, last vertex ≈ `[120.9436, 14.7968]` — NOT RUN (server side verified in Prompt 09)
  5. Navigate opens Waze/Maps to the hospital — NOT RUN
  6. Fixes → route shortens, ETA updates, `estimated_arrival_at` changes — NOT RUN
  7. Arrived → confirm → arrival time; Mark Resolved available; resolve before arrival refused — NOT RUN

Deviations from plan/prompt:
- Backend additions (outside a mobile prompt, additive, no schema change): PATCH destination returns `warnings` so the crew sees FACILITY_AT_CAPACITY "returned by the API" (only POST returned it, and Set destination is always PATCH now); `municipality` added to the transport list's facility select for the "name + municipality" search.
- Picker: `/hospitals/nearby` lists only VERIFIED hospitals with a location, so the picker also lists the remaining selectable hospitals from `/hospitals` after them; otherwise an UNVERIFIED hospital (e.g. Bocaue General) could not be chosen, and dispatch must never be blocked.
- `mergeTrackingLocation` now keeps `leg`/`destination`/`route` (a Prompt 09 follow-up for Prompt 11, pulled forward): without it every GPS fix would erase the server route this prompt patches in.
- `useIncidentTracking` reference-counts room joins (found while wiring the Map tab and assignment screen to the same incident).
- "Arrived at hospital" moved from a card button to the footer primary action (one button, as `assignment-progress` now decides); the card keeps Set/Change destination.
- `assignment-progress` had no tests; a new test file was created.
- C17 switch: shown only when `reporterSharingEnabled` (launch switch) — not visible on a default dev backend. A guest report cannot be detected from the transport data; the API's 400 message is shown.
- After arrival the route target is NONE (no route, no navigation); the hospital marker stays until the incident leaves TRANSPORTING.
- A hospital with coordinates but not VERIFIED: the in-app route is drawn to its coordinates (with the banner), while Navigate uses the name search as the prompt asks.

Follow-ups:
- Device check (Table E Responder rows) on an Android dev build; with `REPORTER_DESTINATION_SHARING_ENABLED=true` on a dev backend to see the C17 switch.
- The transport list cannot say whether the reporter is registered; a `reporterRegistered` hint on `GET /incidents/:id/transport` would hide the switch for guest reports instead of showing the 400.
- Until the first ETA job lands, the hospital leg uses the client route (`POST /locations/route` every 20 s); it stops once the server route arrives.
- Citizen UI (Prompt 11) can now read `leg`/`destination`/`route` from `useIncidentTracking().units`; the reporter's hook already receives scene-leg route events into the cache (unused until Prompt 11).

Prompt 10 device note (2026-10-29): the user ran the responder flow on the Android development build and reported "it's working now". Per-row Table E results were not recorded. Logs showed only MapLibre warnings (see Prompt 11 follow-ups).

## Prompt 11 — Mobile citizen tracking UI (Phase 3) — 2026-10-29

Status: DONE (code and automated checks). Device check NOT RUN. Gate: Prompt 10 DONE.

Files changed:
- New `mobile/src/lib/transport-view.ts`: `deriveTransportView(status, units)` → `{ view, unit }`, view one of TO_SCENE / TO_FACILITY_VISIBLE / TO_FACILITY_REDACTED / AT_FACILITY_VISIBLE / AT_FACILITY_REDACTED / COMPLETE. VISIBLE only when the server sent a `destination`; a position alone never counts. TRANSPORTING with no hospital-leg unit in the cache yet → TO_FACILITY_REDACTED (status only, never the scene ETA). Several units: visible first, then travelling before arrived.
- `mobile/src/hooks/useIncidentTracking.ts`: returns `transportView` and `transportUnit` (units with `leg`/`destination`/`route` were already returned since Prompt 10).
- `mobile/app/tracking/[id].tsx`: during transport the "Responders on scene" card is replaced:
  - TO_FACILITY_VISIBLE → "Being taken to {hospital}" + "~{min} (estimate)", ambulance marker, server route line, hospital marker; own scene pin stays.
  - TO_FACILITY_REDACTED → "The patient is being taken to a hospital." + "For details, contact MDRRMO" with a call button (the Bocaue MDRRMO hotline used by the bottom nav). No route, no ambulance marker (even a position cached from the scene leg), no hospital name, no "last seen" hint.
  - AT_FACILITY → "Arrived at {hospital}" / "The patient has arrived at a hospital."; RESOLVED/CLOSED → the existing "Response complete" card.
  - On the hospital leg the client route (`useRouteLine` to the scene) is not requested; the signal-lost / last-seen hints use the unit actually shown. No patient field is read or rendered.
- New `mobile/src/config/hotlines.ts`: `MDRRMO_HOTLINE` / `MDRRMO_HOTLINE_DISPLAY`, moved from `mobile/src/components/ui/bottom-nav.tsx` (which now imports them), so the number is defined once.
- `mobile/src/i18n/translations.ts`: new `tracking` namespace (en + fil; all translations known, none copied from English).
- Not changed: `mobile/app/emergency/transmission.tsx`.

Tests added/updated:
- New `mobile/src/lib/__tests__/transport-view.test.ts` (11): every branch (TO_SCENE, both VISIBLE, both REDACTED, COMPLETE), TRANSPORTING before a hospital-leg unit is known, a cached position never makes it visible, a withdrawal turns visible back to redacted, two-unit ordering, scene-leg units ignored.
- Mutation: "position counts as visible" → 2 failed; "no hospital-leg unit ever" → 6 failed. Restored.

Verification:
- `cd mobile && pnpm typecheck` → passed. `pnpm lint` → 6 errors / 53 warnings (unchanged from after Prompt 10; none in touched files — ESLint on them: clean). `pnpm test` → 5 suites, 61 passed.
- Device check (plan Table E "Citizen" rows, three registered reporters), all **NOT RUN**:
  1. Crew-confirmed reporter: ambulance to scene, then "Being taken to DOH — Joni Villanueva General Hospital" with route and estimate — NOT RUN. Needs `REPORTER_DESTINATION_SHARING_ENABLED=true` on the dev backend; with the default (off) this reporter correctly sees the redacted view.
  2. Reporter who ticked "I am the patient", not confirmed: same as a bystander — NOT RUN
  3. Bystander: only "The patient is being taken to a hospital"; no name, position or route in UI, `tracking/latest` or WS frames — NOT RUN (server side verified by the Prompt 09 probe and `transport-privacy.spec.ts` / `transport-audience.spec.ts`)
  4. No patient name, id or medical data in WS frames / `tracking/latest` — NOT RUN (server side covered by Prompt 09 tests)
  5. After Resolved: "Response complete" and the unit disappears — NOT RUN

Deviations from plan/prompt:
- TRANSPORTING with no hospital-leg unit in the cache (seed not loaded, or a unit seen only over the socket) shows the redacted status card rather than the scene UI, so the scene ETA is never shown during transport.
- The redacted card's call action uses the MDRRMO hotline constant, moved to `src/config/hotlines.ts` so it is not duplicated.
- The "estimate" tag is not repeated on the transport card; its ETA line already says "(estimate)".

Follow-ups:
- MapLibre logs `[ParseStyle]: source must have tiles` (from the configured map style, not the transport layers) and "The `style` prop is deprecated. Use `paint` and `layout`" for `<Layer style={…}>` in `live-tracking-map.tsx` (needed before MapLibre v12). Neither is a crash.
- The existing tracking-screen strings (status card, hints) are still hard-coded English; only the new transport strings go through i18n.
- Prompts 10 and 11 have not had an independent review.

## Security fix: incident read access and the shared-phone guest incident — 2026-10-29

Status: DONE. Outside the prompt pack; recommended and approved by the user before Prompt 12.

Found by the user on a device: after a guest report, signing in to a registered account on the same phone showed the guest's incident as that account's active incident. Two causes:
1. Mobile: the in-memory incident store (`activeIncidentId`) was cleared on logout but not on login, so the guest flow's "Sign in" carried the guest incident into the account. Device memory only, not a server sync; other citizens' phones never have the id.
2. Backend (the real hole): `GET /incidents/:id` returned the full record (reporter name/phone, patients, on-scene assessments, caller answers, attachments, events, dispatches) to any signed-in user, because a non-participant fell through to `return incident`. `GET :id/assessments`, `:id/resolution`, `:id/events` and `:id/timeline` had no object-level check at all. The incident's own reporter also received patients and assessments from `GET :id`, against plan §17.

Fix:
- `backend/src/incidents/incidents.controller.ts`: `requireParticipation(req, id, allowed)` (staff / crew / reporter from `IncidentParticipantService.getParticipation`), 403 "You do not have access to this incident" otherwise, checked before any read.
  - `GET :id`: staff and crew → full record (unchanged); reporter → `findReporterView`; anyone else → 403.
  - `GET :id/assessments`, `:id/resolution`, `:id/events` → staff and crew only.
  - `GET :id/timeline` → staff, crew and the reporter (citizen-facing).
  - `GET :id/status` (guest status screen: reference, status, category, timestamps) and `GET :id/detail` (already ownership-scoped) unchanged.
- `backend/src/incidents/incidents.service.ts`: `findReporterView(id)` — an explicit `select` allow-list: status, reference, category, priority, trigger, description, patient count, status timestamps, scene location (numbers), event statuses/times (no notes, no actors). Covers every field the citizen app reads from this route (Home active card: id, status, public_reference; tracking: reference, status, category, priority, scene coordinates).
- `mobile/src/stores/auth.store.ts`: `login` resets the incident store when the account changes (previous user missing or different). A token refresh (`authed-fetch.ts` re-calls `login` for the same user) keeps the active incident.
- Callers checked: the web console uses these routes as staff only; mobile calls only `GET :id` (Home, tracking); no client calls `/assessments`, `/events` or `/timeline`; `/resolution` is web staff only.

Tests:
- New `backend/test/incidents/incident-read-access.spec.ts` (23): each of the four routes × staff/crew/reporter/non-participant (allowed → read; denied → 403 and no read); `GET :id` non-participant 403 before any read, reporter → reporter view only, staff/crew → full; `findReporterView` selects no patient/assessment/reporter/attachment/dispatch/notes relation, returns numeric coordinates, 404 when missing.
- `backend/test/incidents/reporter-sex.spec.ts`: a non-participant now gets 403 (was: a record without `reporter_sex`).
- New `mobile/src/stores/__tests__/auth-incident-reset.test.ts` (3): guest incident not carried into the account; another account does not inherit it; a same-user refresh keeps it.
- Mutation: guard disabled → 8 failed; reporter view bypassed → 1 failed; mobile reset removed → 2 failed. Restored.

Verification:
- Live, read-only, real app context and local DB: another citizen → 403 on `GET :id`, `/assessments`, `/resolution`, `/events`, `/timeline` for a guest incident; the incident's own reporter → reporter-view keys only (no `incident_patients`, `on_scene_assessments`, `incident_reporters`, `dispatches`, `incident_attachments`), 403 on `/assessments`, timeline OK; a dispatcher → full record.
- Backend `pnpm test` → 1091 tests, 1089 passed, 2 failed (baseline `barangay-notify` FALSE_ALERT and an `auth-phase3` bcrypt timeout). `pnpm typecheck` passed; lint baseline (1 error / 285 warnings; the new parameters use a small `AuthedRequest` type instead of `any`).
- Mobile `pnpm typecheck` passed; `pnpm test` 64 passed; lint 6 errors / 53 warnings (unchanged).

Follow-ups:
- Only the GET routes listed above were checked and fixed. The POST/PATCH routes in `incidents.controller.ts` and the sibling controllers (locations, responders, hospitals, chat) were not audited for the same object-level gap; a full access review is recommended.
- Device re-check: guest report → "Sign in" → the account's Home shows no active incident.

## Independent review of the 2026-10-29 work, and one access fix — 2026-10-29

Status: reviewed. The Prompt 09 geofence fix, the DPO waiver + `REPORTER_DESTINATION_SHARING_ENABLED`, Prompt 10, Prompt 11 and the incident read-access fix are correct. One gap found and fixed (user approved; outside the prompt pack).

Review (code, DB and tests checked directly):
- Schema/DB: `migrate status` 22 applied, up to date; `migrate diff --from-config-datasource --to-schema` empty. No schema change today.
- Duplication: `arrived_at: null` only in `open-transport.ts` and the arrival guard; the sharing flag read only in `reporterSharingEnabled()`; the leg rule on mobile only in `selectRouteTarget` / `useTransportRoute` (both responder screens use the hook) and `deriveTransportView` (citizen); the MDRRMO number only in `mobile/src/config/hotlines.ts`.
- Privacy: every reporter path (socket rooms, `confirmedReporter`, the REST seed's `load`) goes through the one flag check. `GET :id/detail` carries no destination. The citizen screen draws no unit, route or hospital name in a REDACTED view, including a position cached from the scene leg.
- Callers of the read-access fix: the web console calls `GET :id` and `:id/resolution` only from DISPATCHER/SUPERVISOR pages; no hospital page calls `GET :id`. `findReporterView` keeps every field the Home card and tracking screen read. The mobile incident store is in memory only, so a cold start cannot carry an incident into another account.
- Correctness: "Decide later" saves nothing; Set/Change destination is PATCH only; arrival is confirmed then `recordArrival`; the 409 `{ code: 'TRANSPORT_OPEN' }` body reaches `ApiError.body` (no global filter reshapes it); `mergeTransportUpdate` drops the route only when the hospital changed.

Gap: `GET /incidents/:id/transport` checked only the role. Any RESPONDER could read any incident's transport records (patient names, hospital) without being crew; the write routes on the same records already called `assertCrew`. Same object-level gap as the read-access fix; present since before `6a7635b`, now called by the Prompt 10 screens.

Fix:
- `backend/src/incidents/incidents.controller.ts` `listTransports`: `requireParticipation(req, id, ['staff', 'crew'])` for every role except HOSPITAL_USER, whose scoping (own facilities' transports, 403 otherwise) stays in `TransportService.listTransports`. A reporter is never allowed (no destination outside the C17 path). Parameter typed `AuthedRequest` instead of `any`.
- `backend/test/incidents/incident-read-access.spec.ts` (30, +7): responder not crew / responder that is only the reporter / citizen reporter → 403 before any read; crew responder, dispatcher, supervisor → list; hospital user → not a participation check, service called.

Verification:
- `incident-read-access.spec.ts` 30 passed. Mutation (guard removed) → 6 failed, restored.
- Live, read-only, real app context and local DB (incident `…0005-000000000001`): a responder not on its crew → 403 "You do not have access to this incident"; its crew responder → list; a dispatcher → list. Probe file deleted.
- Backend `pnpm test` → 1098 tests, 1094 passed, 4 failed, all baseline: `barangay-notify` FALSE_ALERT and 3 `auth-phase3` bcrypt timeouts under full-suite load (`auth-phase3` alone: 59/59 passed). `pnpm typecheck` passed; lint 1 error (baseline) / 284 warnings (one `any` fewer).
- Mobile (unchanged by the fix): `pnpm test` 64 passed; `pnpm typecheck` passed; lint 6 errors / 53 warnings (baseline). Frontend `npx tsc --noEmit --incremental false` passed.

Follow-ups (not changed):
- Both responder screens derive "the open transport" with the same two lines; `useTransportRoute` could return it.
- The picker's nearest list stays empty when the sheet opens before the first GPS fix (all hospitals are still listed).
- For the full access review: `GET :id/detail` returns event notes to the reporter; a dispatcher's free-text note could name the hospital (the code itself writes none).
- Device checks still NOT RUN: Table E Responder rows one by one, Table E Citizen rows, guest → "Sign in" re-check.

## Prompt 12 — Dispatcher dashboard UI (Phase 3) — 2026-10-29

Status: DONE (code and automated checks). Manual run (Table E "Dispatcher" rows) NOT RUN: no browser in this session. Gate: Phase 2 done; the 2026-10-29 review done. Prompts 10–12 complete plan Phase 3.

Decisions asked and approved before coding (user, 2026-10-29):
- **Outside Bocaue:** the web maps were clamped to Bocaue and dropped every unit outside it, so a transport to a hospital outside Bocaue (e.g. Malolos) would vanish. Approved: "Widen when needed", the same rule as mobile Prompt 10.
- **Ops-map list:** the Real-Time Incident Map had no list for "list rows show the leg". Approved: a small "Units on mission" panel.

Files changed:
- `shared/src/maps/map.types.ts`: `ROUTE_LAST_KNOWN_AFTER_MS` + `isRouteLastKnown` (moved from mobile). `shared/src/maps/service-area.ts`: `FACILITY_SERVICE_AREA_BOUNDS` (moved from mobile's `SERVICE_AREA_BOUNDS`). One copy for web and mobile.
- `mobile/src/lib/transport-target.ts`: re-exports the two shared rules (same names, no behaviour change; mobile tests unchanged and passing).
- `frontend/features/map/live-tracking.ts` (pure):
  - `applyRouteUpdate`, `applyTransportUpdate` (destination swapped, route dropped only when the hospital changed, facility id never kept).
  - `transportUpdateNotices` (toast text, old name from the unit cache, else the transport list).
  - `legChip`, `unitRoutePlan` (server route first; client route only as a fallback, to the leg's target; none after arrival).
  - `destinationFacilities`, `isUnitOnMap` (inside Bocaue, or inside the service area where the backend accepts only crew-in-transport fixes).
- `frontend/features/map/hooks.ts`:
  - `useLiveResponders` / `useIncidentUnits` poll every 15 s while the socket is offline (30 s / 60 s otherwise, as before).
  - New `useIncidentsUnits(ids)`: the same `['incident-units', id]` caches for the ops map.
- `frontend/providers/socket-provider.tsx`:
  - `responder.route_updated` → patch `['incident-units', id]`.
  - `incident.transport_updated` → toasts ("Destination changed: A → B" / "Destination set: B"; a warning toast for FACILITY_DEACTIVATED / FACILITY_AT_CAPACITY), patch the unit cache, invalidate `['incident-transports', id]` and `['audit-incident', id]`.
  - The existing `incident.transporting` / `facility_arrival` invalidations are kept.
  - `frontend/providers/providers.tsx`: `ToastProvider` now wraps `SocketProvider`, so the provider can render toasts.
- New `frontend/components/map/LegChip.tsx`: `LEG_COLORS` (scene green `#0D6053`, hospital purple `#7C3AED`) and the chip, used by the pill, the popup and the ops list.
- `frontend/components/incidents/IncidentMapView.tsx`:
  - New props: `facilities`, `routeStyle`, `routeLastKnown`, `routes` (several units, ops map), `unitLegs`.
  - Source `unit-route` now holds a FeatureCollection with two layers: scene solid, hospital dashed purple; faded when last known.
  - Hospitals use the one `HospitalMarker` (C20), placed with `toLngLat`.
  - Bounds widen to `FACILITY_SERVICE_AREA_BOUNDS` (min zoom 9) only while a destination, route or unit is outside Bocaue.
  - "Fit scene + unit" also frames the destination.
  - The boundary source, mask and incident markers are unchanged.
- `frontend/app/(ops)/operations/dispatch/page.tsx`:
  - The tracked unit's server route; `useRouteLine` is only the fallback, and it targets the hospital on the hospital leg (never the scene).
  - ETA pill: leg chip, distance, ETA + "estimate", and "last known route" when stale. No ETA after arrival.
  - Destination hospital markers and the popup chip.
- `frontend/app/(ops)/operations/map/page.tsx`:
  - Routes for every tracked unit with leg styling, plus their destination hospitals.
  - "Show hospitals" toggle: VERIFIED hospitals from `GET /hospitals`, cached 5 min.
  - "Units on mission" list: call sign, reference, leg chip; a row opens the incident.
  - Legend entries for the new elements. The "omitted" count uses `isUnitOnMap`.
- `frontend/components/incidents/IncidentDetailDrawer.tsx` TransportPanel:
  - Receiving-status badge; "Est. arrival … (estimate, routed)".
  - Warnings banner while open: deactivated / at capacity or closed / location not verified.
  - "Destination changes" history from the existing `GET /audit/incidents/:id` (read only when `destination_changed`); falls back to `change_reason` when no audit row is readable.
- `ChangeTransportDialog`:
  - Receiving status (and "location not verified") per hospital.
  - Inline warning for a full or closed choice.
  - The API's FACILITY_AT_CAPACITY shown after save.
  - Save errors shown instead of an unhandled rejection.
- New `frontend/features/incidents/transport-history.ts` (pure `destinationHistory`).
- `frontend/features/incidents/api.ts`: `TransportFacility` type (the fields the API already sends) and `TransportUpdateResult` (`warnings`).
- `frontend/features/hospitals/location.ts`: `RECEIVING_STATUS_BADGE` / `receivingStatusBadge` / `isAtCapacity`. `frontend/components/command/CommandSections.tsx` now uses it (its own copy removed). `frontend/features/hospitals/hooks.ts`: `useHospitals` takes `staleTime`.
- Backend (additive, one field): `GET /incidents/:id/transport` facility select includes `is_active`, so the drawer warns about a deactivated destination after a reload too. `backend/test/incidents/transport.spec.ts` select assertion updated.

Tests added/updated:
- `frontend/__tests__/live-tracking.spec.ts` (49, +34):
  - route_updated cache patch: replace, withdraw, unseeded unit, no cache.
  - transport_updated swaps the destination: route dropped / kept, no facility id, other dispatch untouched.
  - Toast text: changed, list fallback, set, moved-only, both warnings.
  - Stale route: fresh, exactly 120 s, 121 s, server stale, none.
  - Leg chip text: six cases.
  - `unitRoutePlan`: server first; fallback to scene / hospital / none; nothing after arrival.
  - `destinationFacilities` dedupe; `isUnitOnMap` (Joni, Malolos, Manila).
  - `destinationHistory` (order, reason, actor, other transports, unlisted hospital, ETA-only update).

Verification:
- `pnpm --filter @agap/shared build` and `typecheck` → passed.
- `cd frontend && pnpm typecheck` → passed. `pnpm test` → 5 suites, 115 passed.
- `pnpm lint` → cannot run (pre-existing, as in the baseline): `next lint` passes options ESLint 9 removed. Running ESLint directly fails too: `@next/eslint-plugin-next` 14 and `eslint-plugin-react-hooks` crash on ESLint 9 (`context.getAncestors` / `getScope`). The changed files were linted with the project's TypeScript rules and `no-console` only. No finding; 7 "rule definition not found" lines come from existing `eslint-disable` comments for the plugins that config cannot load.
- Mobile: `pnpm typecheck` passed; `pnpm test` 6 suites, 64 passed; lint 6 errors / 53 warnings (baseline).
- Backend: `transport.spec.ts` 89 passed; `pnpm typecheck` passed. `pnpm test` → 1098 tests, 1093 passed, 5 failed, all baseline: `barangay-notify` FALSE_ALERT and 4 bcrypt-heavy `auth-phase3` timeouts under full-suite load. This run was slower (120 s for that file); `auth-phase3` alone: 59/59 passed. The only backend change is one select field.
- Manual run, plan Table E "Dispatcher" (web), all **NOT RUN** (no browser in this session):
  1. Selected incident shows unit, dashed "To hospital" route and hospital marker; a unit en route to another scene shows "To scene" — NOT RUN
  2. Change destination in the drawer → marker, route and toast update without reload; the responder app updates too — NOT RUN
  3. Deactivate the hospital → warning on dispatcher and responder; transport continues — NOT RUN
  - Also from Table E "Failure": kill the dispatcher socket → 15 s polling; reconnect → re-seed — NOT RUN

Deviations from plan/prompt:
- Bounds widen outside Bocaue on the web maps, and units in the service area are kept (approved above).
- "Units on mission" panel added for the leg per row (approved above).
- `IncidentMapView` also takes `routes` (several units, ops map), `routeLastKnown` and `unitLegs`. These go beyond the two named props, because the ops map draws several routes and the popup needs the chip.
- Hospital points are DOM markers (`HospitalMarker`, C20) placed with `toLngLat`, not a GL symbol layer.
- Toasts: "Destination set: B" when there was no previous hospital. No change toast when only the hospital's position moved (same name), since the map redraws anyway.
- `ToastProvider` moved outside `SocketProvider`, so the socket provider can show toasts.
- The 120 s rule and the service-area bounds moved to `@agap/shared`; mobile re-exports them (no duplicate between web and mobile).
- The receiving-status label map moved to `features/hospitals/location.ts`, and `CommandSections` uses it.
- Backend: `is_active` added to the transport list's facility select.
- ChangeTransportDialog relies on `GET /hospitals` for "selectable" (it already returns only active, non-pending, non-rejected hospitals). No second copy of the rule on the web.

Follow-ups:
- Remove `incident.updated { transportUpdated }` from `TransportService.updateTransport`. Prompt 12 makes it unnecessary for destination changes, but it also fires on ETA-only PATCHes, which do not emit `transport_updated`; check that before removing.
- `frontend/app/(ops)/hospitals/page.tsx` `receivingVariant` uses statuses that do not exist (ACCEPTING/LIMITED/DIVERTING/FULL), so every receiving badge there is grey. It could use `receivingStatusBadge`.
- Frontend lint cannot run: `eslint-config-next` 14 / `eslint-plugin-react-hooks` with ESLint 9. Upgrade the plugins or pin ESLint 8 for the frontend.
- `GET /locations/responders` carries no leg. The ops map fetches `tracking/:id/latest` once per incident with a unit on mission; fine for normal load, but in surge mode one ops-feed field would be cheaper.
- Manual Table E Dispatcher rows on the local backend.

## Independent review of Prompt 12, one fix and one prompt-pack correction — 2026-10-29

Status: reviewed. Prompt 12 is correct. One recorded follow-up fixed and one gap moved into Prompt 14 (both user-approved). Device check recorded: the guest → "Sign in" re-check passes (user, on device: the guest report and its transmission no longer show in the registered account).

Review (code, DB and tests checked directly):
- Schema/DB: `prisma validate` passes; `migrate status` 22 applied, up to date; `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` empty. Read-only DB probe: no failed migrations, the C17 pair CHECK exists with no violations, no dispatch+patient with two open transports, no transport whose dispatch or patient belongs to another incident, no duplicate facility names or coordinates, user emails or phone numbers, or incident references. `transport_records` still has only its primary key (recorded follow-up). The C17 FK is `ON DELETE SET NULL` while the CHECK needs both columns null together; not reachable, because `AdministrationService.deleteUser` refuses any account with audit history and the confirmation writes its audit row in the same transaction.
- Duplication: the 120 s rule and the service-area bounds only in `@agap/shared` (mobile re-exports); leg colours only in `LegChip.tsx`; one `HospitalMarker`; receiving-status labels only in `features/hospitals/location.ts` (after the fix below). The removed `destinationName` field has no reader left. "Selectable hospital" is not re-implemented on the web: `GET /hospitals` filters `is_active` and `reviewVisibility` hides PENDING_REVIEW/REJECTED unless `includeUnreviewed` is asked for, which the dialog does not.
- Correctness: `transportUpdateNotices` reads both caches before the patch; `applyTransportUpdate` strips `destination.id` and drops the route only for a different hospital; setting `leg: 'TO_FACILITY'` is right because `transport_updated` is only emitted for unarrived transports (PATCH after arrival is refused, `notifyFacilityChanged` uses `openTransportWhere`). `unitRoutePlan` never targets the scene on the hospital leg. After arrival the backend's immediate ETA job emits `route_updated { leg: 'AT_FACILITY', route: null }` and `GET …/latest` never returns a route for AT_FACILITY (route cache matched by leg), so nothing is drawn. `allUnits` (the `combine`) is module-level. TransportPanel calls its hooks before `return null`. `toast` from `useToast` is a `useCallback([])`, so the socket effect does not re-subscribe on each toast. The destination history is complete (`AuditService.findByIncident` is unpaginated) and ignores ETA-only and C17 audit rows.
- Bounds: MapLibre 6.14 `setMaxBounds` calls `constrainInternal()` and `setMinZoom` re-applies the zoom constraint, so returning to `BOCAUE_BOUNDS` pulls the camera back inside; it cannot stay outside. (Code-checked, not run in a browser.)
- Privacy: no new data reaches a reporter; the audit read stays DISPATCHER/SUPERVISOR/SYSTEM_ADMINISTRATOR.
- Breakage: `NotificationBell` still renders its toasts inside `ToastProvider`; `UnitTrackingCard` and `SupervisorDashboard` use the unchanged hook signatures (`useWsState` is self-contained).

Fix (approved): `frontend/app/(ops)/hospitals/page.tsx` used its own `receivingVariant` with statuses that do not exist (ACCEPTING/LIMITED/DIVERTING/FULL), so every receiving badge was grey. Both badges now use `receivingStatusBadge` (variant and label); the local function is removed.

Gap → Prompt 14 (approved): nothing in the app can deactivate a hospital. No endpoint or screen writes `facilities.is_active = false`, so `notifyFacilityChanged(…, 'deactivated')` has no caller, and the mobile responder app does not handle `FACILITY_DEACTIVATED` (`DestinationWarning` is `'FACILITY_AT_CAPACITY'` only). Plan §9.4 gives the Supervisor this action, and Table E "Dispatcher" row 3 and the Definition of Done depend on it. Prompt 14 in the prompt pack now has steps 5–8: `PATCH /hospitals/:id/active` (verify roles, audited, notifies only on true → false), a registry "Deactivate / Reactivate" with an opt-in inactive listing for reviewers, the mobile responder banner, tests, and row 3 in its manual run.

Verification:
- Backend: `pnpm typecheck` passed; lint 1 error (baseline) / 284 warnings; `pnpm test`: only baseline failures (`barangay-notify` FALSE_ALERT, bcrypt `auth-phase2`/`auth-phase3` timeouts; this run had more because mobile and frontend suites ran at the same time; both files alone: 67/68, and the one timeout passed alone; no auth file is changed).
- Frontend: `pnpm typecheck` passed; `pnpm test` 5 suites, 115 passed (before and after the fix). Lint cannot run (baseline).
- Mobile: `pnpm typecheck` passed; `pnpm test` 64 passed; lint 6 errors / 53 warnings (baseline). Shared: `typecheck` passed.
- Table E Dispatcher rows 1 and the socket-kill row: still NOT RUN. Row 2: the user reported it working. Row 3: blocked until Prompt 14.

Follow-ups (not changed):
- `unitRoutePlan` returns a server route on AT_FACILITY if one were cached; unreachable today (see Correctness), while the ops map filters AT_FACILITY itself. Harmless; could be made one rule.
- `isWithinBocaue` (web, rectangle) and `isCoordinateInBocaue` (shared, polygon) differ near the edges; pre-existing, rule 11 forbids touching `bocaue-geo.ts`.

## Prompt 13 — Forward geocoding, candidate scoring, AI name assist, resolve endpoint (Phase 4 backend) — 2026-10-29

Status: DONE. Gate: Phase 1 DONE; the Prompt 12 review done (section above). Backend only, no schema or DB change.

Files:
- `backend/src/locations/maps/interfaces.ts`: `GeocodeSearchQuery`, `GeocodeCandidate`, `GeocodingProvider.search` (throws on provider failure, so "none" and "down" differ).
- `backend/src/locations/maps/providers/nominatim-geocoding.provider.ts`:
  - `search()` → `/search` with `format=jsonv2`, `addressdetails=1`, `namedetails=1`, `countrycodes`, `viewbox`, `bounded=1`, `limit`.
  - Pure `toGeocodeCandidate` (numeric lat/lng, `category` = `class=type`, `sourceRef` = `osm:{type}:{id}`, municipality = town/city/municipality, province = province/state).
  - `RequestSpacer` (1 request/s). The one User-Agent constant is shared by both methods; no new env var.
- New `backend/src/locations/maps/geocode-cache.service.ts`: Redis, 24 h, key = normalized text + options, fails open (the `RouteCacheService` pattern). `MapsService.search` reads it, asks the provider on a miss, caches only successful answers. Provider in `MapsModule`.
- New `backend/src/hospitals/location-resolution/`:
  - `candidate-scoring.ts` (pure): `normalizeName`, `nameSimilarity` (mean of token-set Jaccard and trigram Dice), `categoryMatch`, `scoreHospitalCandidate` (0.55/0.20/0.15/0.10 with `reasons`), `decide` (≥ 0.85, hospital, inside, no ≥ 0.70 rival > 150 m).
  - `hospital-name-assist.service.ts`: OpenAI client like `EvidenceAiReviewService` (null without a key), model `OPENAI_GEOCODE_ASSIST_MODEL` || `OPENAI_EVIDENCE_REVIEW_MODEL`. `normalize` and `tieBreak` are zod-validated; any coordinate-like string (`looksLikeCoordinate`) is dropped, unknown keys are stripped, and every error falls back to `deterministicNormalization` with `aiAssisted: false`. Only the typed name, address, municipality and province are sent; the tie-break gets candidate names, display names and categories, never coordinates.
  - `hospital-location-resolver.service.ts`: normalize → search each query (merge by `sourceRef`) → service-area filter → score → decide → AI tie-break between candidates within 0.05 of the top. Every query failing → `PROVIDER_UNAVAILABLE` (200). `alreadyRegistered` = id of the facility with that `location_source_ref` (any status).
- New `backend/src/hospitals/dto/resolve-location.dto.ts` (name 2–255, address ≤ 255, municipality/province ≤ 100). `hospitals.controller.ts`: `POST /hospitals/resolve-location`, roles SYSTEM_ADMINISTRATOR / ORG_ADMINISTRATOR / SUPERVISOR, `@HttpCode(200)`, `@Throttle({ sustained: { ttl: 60000, limit: 10 } })`. `hospitals.module.ts` imports `MapsModule`.
- `backend/src/config/config.validation.ts` + `.env.example`: `OPENAI_GEOCODE_ASSIST_MODEL` (optional, empty placeholder); the `MAP_GEOCODER_URL` comment now covers search.
- `shared/src/maps/distance.ts`: `haversineMeters`, moved from `backend/src/media/media.service.ts` (its private copy removed, same formula). Correction (2026-10-29 verification): it is not the only one; `frontend/app/(ops)/operations/triage/page.tsx` keeps an older private copy, which Prompt 14 replaces.

Tests:
- New `backend/test/hospitals/location-resolution.spec.ts` (22):
  - Reference fixture → AUTO_SELECTABLE, score 0.93 (0.55 + 0.20 + 0.15 + 0.10 × 0.286), preselected `c1`, `alreadyRegistered` = the seeded id `…0002-000000000006`.
  - Two same-name candidates 1 km apart → NEEDS_CONFIRMATION, nothing preselected; way + node 50 m apart stays AUTO.
  - Outside the service area (Manila) and an empty answer → NO_RESULTS; every query failing → PROVIDER_UNAVAILABLE; one failing query is not an outage.
  - Key unset → deterministic, no AI call.
  - AI coordinate output (queries, name, extra `latitude` key, rationale) is ignored; an unknown tie-break id is ignored. The prompts carry no coordinates. The AI reorders a near-tie without changing any score, coordinate or the result. No tie-break call for AUTO.
  - Roles, HTTP 200, throttle metadata, DTO limits.
- New `backend/test/maps/geocode-search.spec.ts` (9): `/search` params and User-Agent; fixture mapping; skipped rows; throws on error / non-array; 1 s spacing while reverse geocoding does not wait; `RequestSpacer`; cache key, 24 h TTL, fail-open read; `MapsService.search` hit / miss / failure.
- Fixture `backend/test/hospitals/fixtures/nominatim-search-joni-villanueva.json`: one real `/search` recorded 2026-10-29 with the provider's exact parameters. One result, `osm:way:1290448946`, `14.7968505, 120.9435893`, the same OSM ref the seed stores. The two-candidate cases are derived from it in the spec.
- Mutation checks (scratchpad script, files restored): AI-query coordinate filter removed → 1 failed; 150 m rival rule removed → 3 failed; service-area filter removed → 1 failed.

Verification:
- `pnpm --filter @agap/shared build` / `typecheck` passed.
- Backend `pnpm typecheck` passed; lint 1 error (baseline) / 284 warnings (baseline; the one new `any` was typed away). `npx jest … test/hospitals/location-resolution.spec.ts test/maps/geocode-search.spec.ts` → 31 passed. `pnpm test` → 1129 tests, 1128 passed, 1 failed: `barangay-notify` FALSE_ALERT (baseline). No auth timeouts this run.
- Mobile `pnpm typecheck` passed, `pnpm test` 64 passed. Frontend `pnpm typecheck` passed.
- Boot: `Mapped {/hospitals/resolve-location, POST} (version: 1)`, application started.
- Manual call (real app context, local DB, Redis, real Nominatim and OpenAI; the key is set in `backend/.env`), "DOH — Joni Villanueva General Hospital", Bocaue, Bulacan: AUTO_SELECTABLE, `normalizedName` "Joni Villanueva General Hospital", `aiAssisted` true, `c1` = `osm:way:1290448946` at 14.7968505, 120.9435893, score 0.93, `alreadyRegistered` the seeded id. A later call also listed "Dr. Yanga General Hospital" (`osm:relation:14708560`, 0.60, below the 0.70 rival line), still AUTO. Redis then held 6 `geocode:search:*` keys with TTL ≈ 86 300 s. Probe file deleted.
- Nominatim use: 1 fixture request plus 6 distinct queries over 4 resolve calls (the probe ran twice), all spaced ≥ 1 s. That is more than the prompt's "one real request", because each resolve searches up to 3 queries and the AI wrote different ones each time.

Deviations from plan/prompt:
- **Throttle is per IP, not per user.** The app's `ThrottlerGuard` is global and runs before `JwtAuthGuard`, with the default IP tracker, so 10/min counts per client IP (staff on one office network share it). For a click-only admin action this is enough; per-user tracking needs a user-keyed guard (follow-up).
- Validation errors are 400 (the app-wide `ValidationPipe`), not the plan's 422.
- Scores use the typed name, never the AI's normalized name, so an AI rewrite cannot push a wrong hospital over 0.85. The AI only chooses search queries and breaks near-ties.
- The deterministic query is always one of the ≤ 3 queries, so a poor AI rewrite cannot hide the hospital.
- The tie-break runs only for NEEDS_CONFIRMATION with at least two candidates within 0.05 of the top. It moves its pick first and adds "AI suggested: …" to its reasons. `selectedCandidateId` stays null, as in the plan's example and Prompt 14's "nothing preselected".
- One failing query among several is not PROVIDER_UNAVAILABLE; the answers that came back are used.
- The response lists at most 5 candidates; `decide` sees all of them.
- Reverse geocoding calls `spacer.note()`: it never waits (incident path), but a search right after it waits its turn.
- The OpenAI client here uses an 8 s timeout and no retries (interactive endpoint); the evidence review keeps the SDK defaults.
- `haversineMeters` moved to `@agap/shared` instead of a second copy (`media.service.ts` imports it).
- No Mapbox geocoder exists, so `search` is Nominatim only (the token always resolves to it).

Follow-ups:
- Multi-instance deployments need a shared Nominatim limiter (Redis or BullMQ); `RequestSpacer` is per process.
- The AI writes different queries for the same input, so repeat clicks miss the 24 h cache and cost up to 3 new Nominatim requests. Caching the normalization per typed input (24 h) would make repeats free.
- Four hand-built fail-open Redis clients now exist (`session-revocation`, `mfa-state`, `route-cache`, `geocode-cache`); one shared provider would remove the copies.
- Per-user throttling for staff endpoints (a guard keyed on `req.user.id` after JWT).
- The 0.85 / 0.70 / 150 m thresholds are not yet tuned against a labelled set of real Bulacan facilities (plan §9.3).

## Review of Prompt 13 — 2026-10-29

Status: reviewed (same session as the build, code and DB checked directly). Prompt 13 is correct. One gap found, **not fixed: awaiting the user's decision** (recommendation below). No code changed by the review.

Checked:
- Only `NominatimGeocodingProvider` calls Nominatim (`maps.search` only from the resolver, `reverseGeocode` only from `LocationsService`). `MapsModule` is imported by Locations, Jobs and Hospitals; Nest shares one instance, so there is one spacer and one cache client.
- AI: no coordinate reaches or leaves the model (filters, zod key stripping, tie-break input without coordinates); scores come from the typed name; the tie-break never preselects or changes a number. Key unset → deterministic.
- Fail soft: provider error → 200 `PROVIDER_UNAVAILABLE`; 429/HTML answers throw and are not cached; logs carry error messages only (no query text, no key).
- DB (read-only): only one facility has a `location_source_ref` (Joni Villanueva, `manual+osm-crosscheck`, `osm:way:1290448946`); no ref is shared by two rows.

Gap (**resolved 2026-10-29**, see the next section): **duplicate hospitals by OSM ref.** `uq_facilities_location_source_ref` (raw SQL in `20261025120000_facility_coordinates`, not in `schema.prisma`) and `HospitalsService.assertNoDuplicate` both key on **(location_source, location_source_ref)**. The seeded hospital is `manual+osm-crosscheck`; a Prompt 14 "Find location" pick of the same place sends `nominatim` + the same ref. With a name spelled differently (so the active-name index does not match either), it is accepted as a second facility for one real hospital: two map markers, split referrals. `alreadyRegistered` (ref only) lets the UI warn, but the server does not refuse. Not reachable before Prompt 14 (no UI sends `nominatim` yet).
- Recommended fix (before or inside Prompt 14): a migration replacing the index with `UNIQUE (location_source_ref) WHERE location_source_ref IS NOT NULL`, and `assertNoDuplicate` matching on `location_source_ref` alone. Current data passes it (one row with a ref). `schema.prisma` unchanged (the index is raw SQL; `migrate diff` must stay empty). Plus a test: same ref, other source → 409 DUPLICATE_FACILITY.

Minor follow-ups (not changed):
- A name that is only a prefix/suffix ("DOH —", "Inc.") normalizes to an empty query; falling back to the trimmed typed name would avoid a pointless search.
- `alreadyRegistered` can name the id of a facility the caller cannot see (another org's PENDING_REVIEW for an Org Admin); `GET /hospitals/:id` still hides it. Prompt 14's link should handle a 404.

## Verification of Prompt 13, and fix: one facility per OSM ref — 2026-10-29

Status: Prompt 13 verified correct (new session, code, DB and tests checked directly). One user-approved fix applied (prompts C21). Prompt pack updated for Prompt 14.

Verified:
- Code matches the Prompt 13 write-up and the plan (§9.2–9.5, §11): coordinates only from Nominatim, AI output zod-checked and coordinate-filtered, scores from the typed name, `PROVIDER_UNAVAILABLE` as 200. `@Throttle({ sustained })` names a throttler that exists in `app.module.ts`, so the 10/min override takes effect.
- Tests: `test/hospitals` + `test/maps` 85 passed. Backend `pnpm test` 1129 tests: `barangay-notify` FALSE_ALERT (baseline) plus two `auth-phase3` bcrypt timeouts under load; `auth-phase3` alone 59 passed. Backend typecheck passed, `migrate diff` empty, 22 migrations applied. Frontend typecheck passed, test 115 passed. Mobile typecheck passed, test 64 passed.
- DB (read-only): one facility with a `location_source_ref` (Joni Villanueva, `manual+osm-crosscheck`, `osm:way:1290448946`); no ref shared.
- Duplication: one older private haversine in `frontend/app/(ops)/operations/triage/page.tsx` (from `f357a02`, not from Prompt 13). Prompt 14 now replaces it with the shared helper (user decision).

Fix (user-approved): **one facility per OSM ref.**
- New migration `backend/prisma/migrations/20261029120000_facility_source_ref_unique/` (`migration.sql` + manual `down.sql`): `uq_facilities_location_source_ref` is now `UNIQUE (location_source_ref) WHERE location_source_ref IS NOT NULL`. Same index name, so nothing else changes. `schema.prisma` unchanged (raw-SQL index), `migrate diff` empty after `migrate deploy`; 23 migrations.
- `HospitalsService.assertNoDuplicate` matches `location_source_ref` alone; its `source` parameter was removed (both callers updated).
- Test in `backend/test/hospitals/hospital-location.spec.ts`: a `nominatim` create of the seeded ref under another spelling → 409 `DUPLICATE_FACILITY` with the seeded id, query has no `location_source` filter, nothing created. `test/hospitals` 65 passed; typecheck passed; lint 1 error / 284 warnings (baseline).
- DB probe (in a rolled-back transaction): inserting `nominatim` + `osm:way:1290448946` now fails with `23505` on `uq_facilities_location_source_ref`; no row left.

Docs: plan §6 and §10 corrected; prompt pack C21 added; Prompt 14 step 2 now covers the 409 for a registered ref, the "already registered" link 404 case, and the shared `haversineMeters` (replacing the triage copy).

## Prompt 14 — Hospital registry UI: "Find location", Org Admin flow, hospital deactivation (Phase 4) — 2026-10-29

Status: DONE for code and automated checks. The manual Table E rows ("Hospital registration", "Dispatcher" row 3) are **NOT RUN**: they need the user's browser and Android devices. Gate: Prompts 05 and 13 DONE, the Prompt 13 review and verification done, C21 fixed.

Files changed:
- Backend: new `backend/src/hospitals/dto/set-active.dto.ts`; `hospitals.service.ts` (`setActive`, `findAll(actor, includeUnreviewed, includeInactive)`); `hospitals.controller.ts` (`PATCH /hospitals/:id/active`, `?includeInactive=true`).
- Web: `frontend/features/hospitals/{api,hooks,location}.ts`; new `frontend/components/hospitals/HospitalLocationFinder.tsx`; `HospitalLocationPicker.tsx` + `HospitalLocationMap.tsx` (optional candidate markers); `frontend/app/(ops)/hospitals/page.tsx`; `frontend/app/(ops)/operations/triage/page.tsx` (private haversine replaced by `@agap/shared`).
- Mobile: `mobile/src/services/api/transport.api.ts` (`DestinationWarning` + `FACILITY_DEACTIVATED`, `TransportFacility.is_active`); `mobile/src/lib/transport-target.ts` (`isDestinationDeactivated`, `DestinationNotice`); `mobile/src/hooks/{useIncidentTracking,useTransportRoute}.ts`; `mobile/src/components/responder/transport-banners.tsx`; `mobile/app/responder/assignment/[id].tsx`, `mobile/app/responder/map.tsx`; `mobile/src/i18n/translations.ts` (`transport.destinationDeactivated`, en + fil).

What it does:
- **Find location** (create dialog and "Set location"): a button that sends the typed name/address/municipality/province (the stored values in "Set location") to `POST /hospitals/resolve-location`, as a mutation on click only. `finderView` maps the result: AUTO_SELECTABLE → "Best match" preselected (pin moved there) with its reasons, the user still saves; NEEDS_CONFIRMATION → list, nothing preselected; NO_RESULTS / PROVIDER_UNAVAILABLE → message, manual pin. "AI-assisted" badge when `aiAssisted`. Each result shows name, address, "NN% match", reasons and its registration state. Unpicked results are faint markers on the map; clicking one picks it.
- **Save rule** `locationForSave`: a picked result while the pin is within 25 m (`haversineMeters` from `@agap/shared`) → `nominatim` + `sourceRef` + `confidence` (score); otherwise `manual`. A picked result whose pin moved away is labelled "will be saved as a manual location".
- **Already registered** (`candidateRegistration`): NEW / THIS (the hospital being edited) / OTHER (a hospital in the user's list: a link that selects it) / HIDDEN ("Already registered (not visible to you)", no request, so no 404). Only NEW and THIS can be picked; the server's 409 (C21) shows the existing duplicate message.
- **Org Admin**: create for own HOSPITAL org → server saves PENDING_REVIEW; the dialog keeps the Prompt 05 notice and the page now selects the new hospital, so its "Pending review" badge is in view.
- **Supervisor / System Admin**: filter chips "All / Pending review (n) / Deactivated (n)"; Verify / Reject buttons directly on Pending review rows (plus the existing detail panel).
- **Deactivation**: `PATCH /hospitals/:id/active` `{ isActive, reason? ≤ 500 }`, roles SYSTEM_ADMINISTRATOR / SUPERVISOR (as location verify). `is_active` + AuditLog (`facility`, MOD-39, old/new `is_active`, reason) in one `$transaction` via `AuditService.logInTransaction`; after commit, only on true → false, `notifyFacilityChanged(id, 'deactivated')`. Transports untouched. The registry lists inactive hospitals only with `?includeInactive=true` and only to reviewers; pickers, `/hospitals/nearby` and `ChangeTransportDialog` stay active-only; `destination-rules.ts` unchanged.
- **Web registry**: "Status" panel with Active / Deactivated badge and Deactivate / Reactivate for reviewers; the confirm dialog says open transports continue and crews and the dispatcher are warned; "Deactivated" badge on list rows. No new dispatcher toast or drawer warning (Prompt 12's are reused).
- **Mobile responder**: banner on the assignment and Map screens while the open transport's hospital is deactivated. `isDestinationDeactivated` reads `facilities.is_active === false` from `GET /incidents/:id/transport` (survives a reload) or a FACILITY_DEACTIVATED `transport_updated` received after the list's last fetch (so a failed refetch still warns; a newer fetch wins). `transport_updated` now also invalidates `['incident-transports', id]`, as the web console does. Route and destination stay.

Tests added/updated:
- Backend: new `backend/test/hospitals/hospital-deactivation.spec.ts` (17): roles via `RolesGuard` (SYSADMIN/SUPERVISOR allowed; ORG_ADMIN, DISPATCHER, RESPONDER, HOSPITAL_USER, CITIZEN → 403); DTO; one transaction + audit row data; notify after commit and only on true → false; reactivation not notified; unchanged → no write/audit/notice; reactivation duplicating an active name → 409; no transport write; inactive refused by `assertSelectableDestination`; default list active-only for every role, flag honoured for reviewers only; controller reads the query flag.
- Web: new `frontend/__tests__/hospital-location-finder.spec.ts` (15): 25 m rule (0, 20, 24.5 m → nominatim; 25.5, 30 m → manual; no pick → manual); result → UI state for all four results; a registered best match is not preselected, except in its own "Set location"; NEW/THIS/OTHER/HIDDEN; score percent.
- Mobile: `mobile/src/lib/__tests__/transport-target.test.ts` +6 for the banner rule.
- Mutation checks (scratchpad, files restored): notify on any change, inactive flag for any role, no reactivation name check, mobile event never expiring, 25 → 50 m, registered best match preselected: each made exactly 1 test fail.

Verification:
- Backend: `npx jest … test/hospitals test/incidents` → 18 suites, 312 passed. `pnpm typecheck` passed. `pnpm lint` 1 error / 284 warnings (baseline; the new route's `req` is typed, not `any`). `pnpm test` → 1147 tests, 1146 passed, 1 failed: `barangay-notify` FALSE_ALERT (baseline). Boot probe: `Mapped {/hospitals/:id/active, PATCH} (version: 1)`; probe deleted. No schema or migration change.
- Web: typecheck (`npx tsc --noEmit --incremental false`) passed; `pnpm test` 6 suites / 130 passed; `pnpm lint` cannot run (pre-existing ESLint option error).
- Mobile: `pnpm typecheck` passed; `pnpm test` 6 suites / 70 passed; `pnpm lint` 6 errors / 53 warnings (baseline).
- Manual Table E: "Hospital registration" rows 1–4 and "Dispatcher" row 3: **NOT RUN**.

Deviations from plan/prompt:
- Plan §9.3 says a NEEDS_CONFIRMATION pick is saved with `location_source = 'manual'`; the prompt says a picked candidate is saved as `nominatim` + `sourceRef` + score. The prompt was followed (the prompts override the plan): storing the ref is what lets C21 refuse a second registration of the same place.
- A best match already registered as another hospital is shown as a list (not preselected), because the server would refuse it.
- The "already registered" link is shown only for hospitals in the user's own list; others read "not visible to you", so the 404 case never arises.
- The reviewer filter chips are shown to Supervisor and System Administrator only (the roles that can verify or deactivate). Org Admins keep the per-row "Pending review" badge.
- `PATCH …/active` with the current value is a no-op (no audit row, no notice). Reactivation re-checks the active-name rule (inactive rows are outside `uq_facilities_active_hospital_name`), so it can return 409 DUPLICATE_FACILITY.
- Added beyond the prompt: unpicked results as faint markers on the picker map (plan §16 item 6, "map preview").

Follow-ups:
- Reactivation sends no event (the prompt notifies only true → false): the crew banner clears on the next 10 s transport poll and the dispatcher drawer on its next refetch. Consider a `transport_updated` without a warning on false → true.
- The mobile event path needs `useIncidentTracking` running (crew sharing location with a map shown); otherwise the banner comes from the 10 s transport poll.
- The finder's result list stays until the next click even if the typed name is edited; clearing it on edit would avoid saving a ref picked for a different name.

## Fix: stopped units showed "signal lost" and lost their route; two MapLibre warnings — 2026-10-29

Reported by the user during the Table E run: responder "signal lost", no route on the dispatcher map during transport, console warnings. A "deactivation shows no warning" report in the same run was not a bug: Bocaue General Hospital (no open transport) had been deactivated instead of Joni Villanueva (the open transport's destination).

Cause (checked in the DB and Redis): `location_history` for INC-2026-000013 held fixes 2–4 min apart, all at one spot. `useResponderLocationShare` watches with `distanceInterval: 15`, so a stopped phone sends nothing. The console marks a unit "signal lost" after 60 s (`RESPONDER_SIGNAL_LOST_MS`), and the server route (`route:dispatch:<id>`, TTL 120 s) is renewed only by fixes, so it expired: the Map page draws only server routes, so it showed none. The route itself was correct (TO_FACILITY → Joni Villanueva, seen in Redis with 8 s TTL left).

Fix:
- `mobile/src/hooks/useResponderLocationShare.ts`: heartbeat. Every 10 s, if no fix has been sent for `LOCATION_HEARTBEAT_MS` (20 s), the GPS is read once (`getCurrentPositionAsync`, High) and that fresh fix is sent through the same path as watch fixes (`sendFix`). Worst gap 30 s. A failed read sends nothing, so a real loss still shows. The watch settings are unchanged (moving units send as before). Cleared on teardown.
- `frontend/components/map/missing-style-images.ts`: placeholders are registered as SDF (all 252 MapTiler Streets sprite icons are SDF, so a non-SDF placeholder in the same layer caused "Cannot mix SDF and non-SDF icons in one buffer"), and `" "` is resolved too (the style's "Town labels" layer uses a space as "no icon" from zoom 12, which caused `Image " " could not be loaded`). Only `""` is skipped.
- Not changed: the `/auth/refresh` and `/auth/login` 401 lines are the browser logging expected answers (expired session cookie → login page; a wrong password). The Fast Refresh lines are Next.js dev output.

Tests: new `mobile/src/hooks/__tests__/responder-location-heartbeat.test.ts` (3) and `frontend/__tests__/missing-style-images.spec.ts` (4). Mobile typecheck passed, test 7 suites / 73 passed, lint 6 errors / 53 warnings (baseline). Frontend typecheck passed, test 7 suites / 134 passed. Not yet re-checked on the device and browser.

## Independent review of Prompt 14 and the two device-run fixes — 2026-10-29

Status: DONE. Prompt 14 and both fixes are correct: no code errors, no duplication. One handoff fact was wrong (corrected) and one user-approved text change was made.

Checked (code, DB and tests directly):
- Backend `setActive`: SYSADMIN/SUPERVISOR only; `is_active` + audit in one `$transaction`; notice after commit only on true → false (`notifyFacilityChanged` never throws, and `destinationView` does not filter on `is_active`, so the deactivated hospital is still described); no-op when unchanged; reactivation re-checks the active-name rule. `findAll` shows inactive rows only to reviewers with the flag. `listTransports` sends `facilities.is_active`.
- Web: `locationForSave` / `finderView` / `candidateRegistration` match the prompt; `useSetHospitalActive` invalidates every `['hospitals', …]` key, including `with-inactive`.
- Mobile: `isDestinationDeactivated`, `destinationNotices`, the `['incident-transports', id]` invalidation and one shared banner on both screens; en + fil strings. Heartbeat: one read at a time, cleared on teardown, a failed read sends nothing.
- Duplication: one distance helper (`@agap/shared` `haversineMeters`; used by triage, hospitals location, candidate scoring, media). No repeated section in the progress log or prompt pack.
- DB (read-only): 23 migrations, `migrate diff` empty; `uq_facilities_location_source_ref` is `UNIQUE (location_source_ref) WHERE NOT NULL`; no shared ref, no duplicate active hospital name.
- Tests: backend `test/hospitals test/incidents` 18 suites / 312 passed, typecheck passed. Frontend typecheck passed, 7 suites / 134 passed. Mobile typecheck passed, 7 suites / 73 passed. Full backend suite and lint not re-run.

Found:
- **Handoff fact wrong:** INC-2026-000013 is CLOSED (13:43 UTC), not TRANSPORTING; the dev DB has no open transport. The first deactivation (13:46) came after the close, so Table E "Dispatcher" row 3 never had a transport to warn about. All five `is_active` audit rows (Supervisor, 13:46–14:13) are on Bocaue General, none on Joni; Bocaue General is still inactive. The handoff now asks for a new TRANSPORTING incident to Joni.
- **Wrong-hospital risk:** the registry shows `list[0]` (Bocaue General) until a row is clicked, or when the selected one is hidden by search or a filter chip, and the dialog title and button did not name the hospital. Fix (user-approved): `ActiveStatusDialog` in `frontend/app/(ops)/hospitals/page.tsx` now reads "Deactivate <name>?" / "Reactivate <name>?" with the name on the button.

Follow-ups (not changed):
- `PATCH /hospitals/:id/active` uses `findById`, which does not check `facility_type = HOSPITAL`, so a reviewer with a non-hospital facility id could toggle it here. Reviewer-only; the page never shows those ids.
- Manual Table E "Hospital registration" rows 1–4 and "Dispatcher" row 3: still NOT RUN.

## Prompt 15 — Idempotent transport mutations and mobile outbox (Phase 5, part 1) — 2026-10-29

Status: DONE for code and automated checks. The device check (airplane mode → Arrived → reconnect → exactly one arrival) is **NOT RUN**: it needs the user's Android phone. Gate: Phase 3 DONE; the Prompt 14 review done. No schema or migration change.

User decisions (AskUserQuestion, before coding):
- An offline **start** is sent through the crew button's own endpoint (`PATCH /responders/assignments/:id/status` TRANSPORTING) with a `clientRequestId`, not `POST /transport`, so the reporter and dispatcher pushes and the incident audit row still happen. That DTO is outside the three the prompt lists.
- `generateUUID` moved from `mobile/src/stores/incident.store.ts` (private) to `mobile/src/lib/uuid.ts`; the SOS store only changed its import (behaviour unchanged).

Files changed:
- Backend:
  - New `backend/src/incidents/transport/transport-request-cache.service.ts`: Redis `transport:req:{dispatchId}:{clientRequestId}`, 24 h TTL, fail-open (the `RouteCacheService` pattern). Provided in `incidents.module.ts`.
  - `transport/dto/{start-transport,update-transport,record-arrival}.dto.ts` and `responders/dto/update-assignment-status.dto.ts`: optional `clientRequestId` (`@IsUUID()`; client-generated, not a record id, so C19 does not apply). `record-arrival.dto.ts`: optional `occurredAt` (`@IsISO8601()`).
  - `transport.service.ts`:
    - `once(dispatchId, incidentId, clientRequestId, run)`: a Redis hit for the same incident returns the stored answer; a miss runs the request and stores its answer.
    - `findReplayedRecord`: the Redis-free check. It finds the audit row (`entity_type 'transport_record'`, same incident, last 24 h, `new_values.clientRequestId`) and returns that record when it belongs to the dispatch (and to the transport, when given).
    - `beginTransport` checks it right after the incident row lock: a retried start returns its record unchanged, even after the arrival.
    - `arrive` checks it when the record is already arrived and when the conditional update loses a race (no second audit row, no second event).
    - `applyUpdate` checks it before writing, so a late retry of change A does not undo a later change B.
    - `clientRequestId` goes into the audit `newValues` of start, first destination, change (already `dto`) and arrival.
    - `arrivalTime(occurredAt, now, startedAt)`: older than 30 min → 400; more than 60 s ahead → 400; up to 60 s ahead → now; never before `transport_started_at`. The arrival audit keeps `occurredAt` and `receivedAt`; `updated_at` is the receipt time.
  - `responders/responders.service.ts`: `updateStatus` runs the crew check, then `transport.once` (TRANSPORTING only) around the former body, now `applyStatus`, which passes `clientRequestId` to `beginTransport`.
- Mobile:
  - New `mobile/src/services/offline/transport-outbox.ts`:
    - Pure core: `newOutboxItem` fixes the id and tap time at the tap; `enqueue` holds at most 3 per dispatch, refuses the same tap twice and a second start or arrival per dispatch; `flushOutbox` sends FIFO and stops at the first retryable failure; `isRetryable`; `applyFlush`; `loadOutbox` / `saveOutbox` with one Secure Store key per user (`agap_transport_outbox_<userId>`).
    - `sendOutboxItem`: start → status endpoint; destination → PATCH (a destination queued behind its start finds the open record first); arrival → PATCH with `occurredAt` = tap time.
    - A shared single-flight runtime (`openOutbox`, `queueOutboxItem`, `flushTransportOutbox`, `dismissOutboxDrops`).
    - Dropped only on 2xx or a 4xx other than 401/408/429; network errors, 401, 408, 429, 5xx and unknown errors are kept.
  - New `mobile/src/hooks/useTransportOutbox.ts`: `useTransportOutboxSender` (mounted in `app/responder/_layout.tsx`: sends on sign-in, on reconnect and every 15 s while something waits, from any tab; after a send, invalidates the assignment, transport and responder queries) and `useTransportOutbox(dispatchId)` (pending, drops, queue, flush, dismiss).
  - New `mobile/src/lib/uuid.ts`; `mobile/src/stores/incident.store.ts` imports it.
  - `mobile/src/services/api/{responders,transport}.api.ts`: optional `clientRequestId` (and `occurredAt` for arrival).
  - `mobile/app/responder/assignment/[id].tsx`:
    - Start, destination and arrival get an outbox item at the tap.
    - Offline, or with actions already waiting for this dispatch, the item is queued. Otherwise it is sent now with the same id, and queued on a `NetworkError`.
    - After a queued start the destination picker still opens; a destination picked then waits behind the start.
    - Footer actions are disabled while something waits, so nothing overtakes it.
  - `mobile/src/components/responder/transport-banners.tsx`: `OutboxBanner` ("Saved on this phone — sending when online", "N actions waiting to send", "Send now"; "Not sent: <server message>" + OK).
  - `mobile/src/i18n/translations.ts`: 7 `transport` strings, en + fil.

Tests added/updated:
- New `backend/test/incidents/transport-idempotency.spec.ts` (25), on stateful fakes (records, audit rows, Redis keys):
  - Same id twice: one record, one transition, the same answer (start, crew button, arrival, destination change).
  - Redis down: a start retried after the arrival creates no record; the crew-button retry starts nothing and pushes once; an arrival retry gets the record instead of 400; a concurrent loser gets the winner's record; a late retry of change A does not undo B.
  - Different ids: a repeat start is unchanged, a start after arrival opens a new transport, a second arrival gets 400.
  - A stored answer is refused to a non-crew user (403) and to another incident.
  - No id → no Redis call and no `clientRequestId` in the audit.
  - `occurredAt`: 10 min ago → arrived_at and audit; 31 min ago and 5 min ahead → 400 with no write.
  - Pure `arrivalTime` bounds (exactly 30 min accepted, 30 min 1 s refused, ≤ 60 s ahead → now, never before the start). DTO validation.
- Constructor plumbing only: `backend/test/incidents/transport.spec.ts`, `backend/test/responders/transport-status.spec.ts`, `backend/test/notifications/reporter-status-push.spec.ts`.
- New `mobile/src/services/offline/__tests__/transport-outbox.test.ts` (22):
  - v4 id and tap time fixed at the tap.
  - Cap of 3 per dispatch, double tap refused, FIFO order.
  - A network error keeps the item and those after it; 401/408/429/500/503 kept; 409/400/403 dropped with the server message, and the next item still sent.
  - Persistence round-trip on a per-user key; empty → key deleted; damaged → empty.
  - The start uses the button endpoint; the arrival sends `occurredAt`; a destination behind its start looks up the open record, and none → dropped.
  - Secure Store integration: an arrival is kept offline and removed after a 2xx.
- Mutation checks (scratchpad scripts, files restored):
  - Backend (each made ≥ 1 test fail): no audit fallback in `beginTransport`; the Redis answer ignored; the incident check skipped; no crew check before the replay; no replay after arrival; no replay on a concurrent arrival; no update replay; 30 → 31 min; no clock skew; `occurredAt` not audited.
  - Mobile (each made ≥ 1 test fail): cap 3 → 4; a network error dropped; 4xx kept; no stop on a retryable error; no `occurredAt`.

Verification:
- Backend:
  - `pnpm typecheck` passed. `pnpm lint` 1 error / 284 warnings (baseline: `incidents.service.ts:91`).
  - `pnpm test` → 74 suites, 1172 tests, 1171 passed, 1 failed: `barangay-notify` FALSE_ALERT (baseline). Focused `test/incidents test/responders test/notifications test/hospitals test/realtime test/locations test/dispatch` passed apart from the baseline.
  - Live probe (real `AppModule`, dev Postgres and Redis): the app boots (DI resolves `TransportRequestCacheService`); the audit `new_values` JSON-path query runs on Postgres; a Redis set/get round-trips with TTL 86 398 s. Probe file and key deleted. No other DB write.
- Mobile: `pnpm typecheck` passed; `pnpm test` 8 suites / 95 passed; `pnpm lint` 6 errors / 53 warnings (baseline; none in the changed files).
- Device check (airplane mode during transport → Arrived → reconnect → one arrival in `transport_records` + one audit row with `occurredAt`, `receivedAt`, `clientRequestId`): **NOT RUN**.

Deviations from plan/prompt:
- The offline start uses the crew button endpoint (user decision above); `POST /transport` also accepts `clientRequestId`.
- The audit-row check runs on every Redis miss, not only when Redis is down: one indexed query (`incident_id`), and it also covers lost keys and two copies arriving at once.
- `occurredAt` up to 60 s ahead of the server counts as now (phone clocks drift; a strict "not in the future" would refuse a fresh offline arrival and the outbox would drop it). It is also never earlier than `transport_started_at`.
- On a hit, the stored answer is the body only. The status code is the route's fixed one (POST 201, PATCH 200), so it is the same.
- The outbox also refuses a second start or arrival for a dispatch (double tap) and keeps unknown errors (not only network errors) rather than dropping a crew action.
- Added beyond the prompt: the sender lives in the responder layout (sends from any tab, not only the assignment screen), a 15 s retry while something waits (NetInfo reports "online" before the server is reachable), "Send now", and footer actions disabled while something waits.

Follow-ups:
- A fifth hand-built fail-open Redis client (`transport-request-cache`); the existing follow-up (one shared provider) now covers five.
- An arrival saved offline more than 30 min before reconnecting is refused (400) and dropped with its message; the crew taps Arrived again (recorded at the current time). Consider telling the dispatcher automatically.
- Only start, destination and arrival are queued. On Scene / Resolve etc. still need a connection, and are disabled while transport actions wait.
- `occurredAt` relies on the phone clock (±60 s tolerated); a phone with a wrong date gets 400 → dropped with "Check the phone's date and time".

## Device check of Prompt 15, and fix: offline assignment screen — 2026-10-29

Reported by the user: in airplane mode the assignment screen showed "Could not load this assignment"; no outbox banner appeared.

Server side (DB checked, read-only): **PASS.** INC-2026-000012, dispatch `355560ed-…`, transport `b983a838-…` to Joni Villanueva:
- Exactly one arrival.
- One arrival audit row: `occurredAt` 22:25:57 (the offline tap, PHT), `receivedAt` 22:26:58 (the reconnect), `clientRequestId` `95e06f82-…`.
- The start and destination audit rows carry their own `clientRequestId`s, so the online path sends them too.
- So the arrival was saved on the phone and sent once on reconnect, by the layout sender, while the screen showed the error.

UI: **FAIL, fixed.** The screen replaced everything with the error state whenever the 10 s assignment poll failed (`isError || !data`), even with the assignment already loaded. React Query keeps `data` after a failed refetch, so the screen now shows the error state only when nothing was ever loaded (`!data`). With data, it keeps the screen and shows "Can't reach the server — showing the last loaded details. Transport actions are saved on this phone." (`transport.showingLastLoaded`, en + fil). Pre-existing since before Prompt 15, but it hid the outbox banner and the Arrived button offline.

Files: `mobile/app/responder/assignment/[id].tsx`, `mobile/src/i18n/translations.ts`. Mobile typecheck passed, test 95 passed.

Re-check on the device after the fix: **PASS** (user confirmed the banner, 2026-10-29). DB (read-only):
- INC-2026-000010: exactly one arrival (tap 22:32:27 PHT, received 22:32:56).
- INC-2026-DEMO06: exactly one arrival (tap 22:36:06, received 22:36:29; then RESOLVED).
- Each has one arrival audit row with `occurredAt`, `receivedAt` and its `clientRequestId`.
- Prompt 15 device check: **PASS**.

Map tab (user-approved, same session): it had the same pattern (`if (isError)` → "Could not load assignments" on any failed poll). `useResponderAssignments` now also returns `hasData` (`query.data !== undefined`). `mobile/app/responder/map.tsx` shows the error screen only for `isError && !hasData`, and its stale strip shows `transport.showingLastLoaded` while the poll fails. Home and Missions use the same hook and are unchanged (not checked for the same pattern). Mobile typecheck passed, test 95 passed, lint 6 errors / 53 warnings (baseline).

## Prompt 16 — Self-hosted OSRM, E2E transport flow, final audit (Phase 5, part 2) — 2026-10-29

Status: DONE for the prompt's steps. Two things could not run in this session: the OSRM build and serving (Docker is not installed on this machine; the multi-GB build was not asked for anyway) and every manual Table E row still marked NOT RUN below. Gate: Prompt 15 DONE and its device check PASS.

User decision (AskUserQuestion): the E2E test runs against a **separate scratch database** `agap_e2e` (same local Postgres and credentials as the dev DB), never `agap_db`.

Files changed:
- OSRM (step 1):
  - New `infrastructure/osrm/README.md`, `build.sh` (download Geofabrik `philippines-latest.osm.pbf` → `osrm-extract -p /opt/car.lua` → `osrm-partition` → `osrm-customize`, MLD; `--no-download` to rebuild) and `refresh.sh` (monthly: build into `data.next/` while the service keeps serving, swap, restart; the old build stays in `data.previous/` for rollback).
  - `docker-compose.yml`: service `osrm` (`ghcr.io/project-osrm/osrm-backend:v5.27.1`, pinned; `profiles: ["routing"]`, so a plain `docker compose up` does not start it; `osrm-routed --algorithm mld` on internal port 5000, plus `127.0.0.1:5005` for a backend run on the host; data mounted read-only).
  - `.env.example`: `MAP_PROVIDER_ROUTING_URL` comment for the self-hosted router (`http://osrm:5000` in compose, `http://127.0.0.1:5005` on the host); the public demo server stays the dev default.
  - `.gitignore`: `infrastructure/osrm/data/`, `data.next/`, `data.previous/`.
- E2E (step 2):
  - New `backend/test/transport-flow.e2e-spec.ts`. No E2E setup existed, so it builds the smallest module that runs the whole flow through real wiring: `Test.createTestingModule({ imports: [AppModule] })` with overrides only for the outside world:
    - the router (straight line to the target);
    - the geocoder;
    - the SMS, push and announcement-push processors and the Textbee poller (no worker, so no real SMS or push can go out). The Textbee/Firebase env keys are also blanked.
  - The app is loaded with `require` after the environment is set, because ConfigModule reads it once.
  - New `backend/test/e2e/e2e-database.ts`: `e2eDatabaseUrl()` refuses a name without "e2e"/"test" or equal to `DATABASE_URL`'s. `e2eRedisUrl()` uses Redis database 15, so queues never mix with a running dev backend.
  - New `backend/test/e2e/setup-db.ts` and package script `pnpm test:e2e:db`: creates the database if missing, then `prisma migrate deploy` and `prisma db seed`. Safe to re-run.
  - `.env.example`: `E2E_DATABASE_URL` placeholder. `backend/.env`: `E2E_DATABASE_URL` added (database `agap_e2e`, credentials copied from `DATABASE_URL`, not printed).
  - The spec skips with a message when `E2E_DATABASE_URL` is unset. Each run creates its own incident and dispatch (fresh ids); the seeded Joni Villanueva, `responder2`, `dispatcher1` and `bystander@demo.agap` are reused.
- Scratch DB: `pnpm test:e2e:db` created `agap_e2e`, applied the 23 migrations and seeded it (one Joni Villanueva row). `agap_db` untouched.

E2E flow (what the spec checks, in order):
1. Accept → EN_ROUTE → crew fix at the scene → ON_SCENE.
2. TRANSPORTING: one open record with `destination_id` null; the incident is TRANSPORTING.
3. Destination: Joni Villanueva via `PATCH …/transport/:id` → `warnings: []`.
4. The real BullMQ ETA worker caches a TO_FACILITY route. Its last vertex is < 25 m from `[120.94358, 14.79679]`; the router was called with Joni's point; `estimated_arrival_at` is set; ops got `responder.route_updated` TO_FACILITY (positive control for the frame capture).
5. The bystander's `getLatestUnitPositions` (REST) has no Joni id or name and no position or route.
6. Crew RESOLVED before arrival → 409 `TRANSPORT_OPEN`.
7. Arrival → RESOLVED is allowed; the incident is RESOLVED.
8. One transport record and one arrival audit row.
9. Every frame to the incident room and the bystander's user room: never the Joni id or name. From transport start on: no coordinates or geometry. The status-only `incident.transporting` did reach the room.

Mutation check: sending hospital-leg frames to the incident room (`transport-audience.service.ts` `incidentRoom: false` → `true`) → the E2E fails ("Joni Villanueva" in a room frame); restored.

Verification (step 3; Prompt 00 baseline in brackets):
- `pnpm --filter @agap/shared build` / `typecheck` → passed [passed].
- Backend: `pnpm typecheck` passed [passed]. `pnpm lint` 1 error / 284 warnings [1 error `incidents.service.ts:91` / 285 warnings]. `pnpm test` → 74 suites, 1172 tests, 1164 passed, 8 failed, all baseline [1 failed in Prompt 00 plus the recorded auth timeouts]:
  - `barangay-notify` FALSE_ALERT;
  - 7 bcrypt timeouts in `auth-phase3` under full-suite load. Alone: 58/59, the one left is the `MfaService` login-decision 5 s timeout, recorded as failing alone since 2026-10-26.
  - `git status` shows no change under `src/auth` or `test/auth`.
- Backend `pnpm test:e2e` → 1 suite, 1 test passed (17 s in the full run, 37 s alone) [no E2E existed].
- Frontend: `npx tsc --noEmit --incremental false` and `pnpm typecheck` passed [Prompt 00: TS5033 tsbuildinfo write error; passes since Prompt 05]. `pnpm test` 7 suites / 134 passed [4 / 60]. `pnpm lint` fails before linting (ESLint 9 option errors: `rulePaths`, `reportUnusedDisableDirectives` removed; pre-existing since Prompt 05).
- Mobile: `pnpm typecheck` passed [passed]. `pnpm lint` 6 errors / 53 warnings (baseline, none in changed files). `pnpm test` 8 suites / 95 passed [2 / 8].
- No new failure against the baseline.
- OSRM: scripts pass `bash -n`; `docker-compose.yml` parses (js-yaml) with `osrm` under the `routing` profile. `docker compose config` and the build could not run (no Docker on this machine).

Deviations from plan/prompt:
- Step 2's "smallest Nest testing module" is the full `AppModule` with outside-world overrides: the flow crosses Responders, Incidents/Transport, Locations, Jobs (BullMQ worker), Realtime, Hospitals and Audit, and hand-wiring those would test a copy of the wiring, not the app.
- The ETA step uses the real queue and worker (the spec waits for the cached route), not a direct processor call.
- The bystander check reads the frames the app hands to the gateway (`emitToOps/Incident/User`), not a Socket.io client. Same payloads and rooms; no sockets to authenticate in a test.
- The OSRM port is also bound to `127.0.0.1:5005` (localhost only), so a backend run on the host can use it; inside compose it stays internal.
- Step 4 asks to copy DoD and Table E: copied below as tables with a status column (the checkbox lists are not repeated).

### Final audit — plan §24 Definition of Done (step 4)

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Hospitals store validated `latitude/longitude` with status, source, ref and verifier; `location` derived; constraints and indexes; migration with a **tested** rollback | PARTIAL | Prompt 01: columns, trigger, 5 CHECKs, indexes; PostGIS probe (trigger fills/clears `location`, CHECKs refuse bad rows). C21 unique ref (Prompt 13 verification probe `23505`). `migrate diff` empty (this session). **Rollback not tested:** `down.sql` exists for `20261025120000`, `20261028120000` and `20261029120000`, but none was run |
| 2 | Joni Villanueva seeded idempotently as VERIFIED with OSM ref, and field-checked for the ER entrance before production | PARTIAL | Seed twice → one row (Prompt 02); ref `osm:way:1290448946` (Prompt 13 verification); `agap_e2e` seeded with one row (this session). **ER entrance field check: NOT DONE** |
| 3 | Transport cannot start before ON_SCENE; no orphan records; one transactional path; RESOLVED requires arrival (responder) | DONE | `test/incidents/transport.spec.ts` (EN_ROUTE/DISPATCHED/ASSISTING/RESOLVED → 409, rollback cases), `test/responders/transport-status.spec.ts`, `transport-flow.e2e-spec.ts` (RESOLVED before arrival → 409, after → allowed); Prompt 08 live probe |
| 4 | ETA job routes to the current leg target; `estimated_arrival_at` reflects the hospital only | DONE | `test/locations/eta-refresh.spec.ts` (hospital leg, destination change mid-job, no scene write), `transport-leg.spec.ts`; Prompt 07/08 review live probe; E2E (TO_FACILITY route to Joni, `estimated_arrival_at` set) |
| 5 | Responder, dispatcher and citizen maps show the same hospital marker and server route during transport, update live, recover after reconnect | PARTIAL | Automated: `frontend/__tests__/live-tracking.spec.ts`, `mobile/src/lib/__tests__/incident-tracking.test.ts`, `transport-view.test.ts`. Device/browser: responder flow "working" (Prompt 10 note), dispatcher Table E row 2 working (Prompt 12 review); route-loss bug found and fixed in the Prompt 14 run; its re-check, the citizen rows and the reconnect rows are NOT RUN |
| 6 | Transport outside Bocaue (inside the service area) keeps tracking and routing working | DONE (server) | `test/locations/location-bounds.spec.ts` (Malolos with open / at-facility transport accepted, Manila refused, route endpoints); Prompt 09 and its review live probes (Malolos fixes accepted on the hospital leg and after arrival). No field drive outside Bocaue |
| 7 | Destination change and facility deactivation reach all authorized viewers within one throttle window | PARTIAL | Destination change: `transport.spec.ts`, `transport-audience.spec.ts`, Prompt 12 web tests, user reported Table E Dispatcher row 2 working. Deactivation: `test/hospitals/hospital-deactivation.spec.ts`, mobile `transport-target.test.ts`; **Table E Dispatcher row 3 NOT RUN** (the attempts hit Bocaue General with no open transport) |
| 8 | No patient identifiers in incident-room payloads or the reporter REST view; hospital-user transport reads org-scoped | DONE | `test/realtime/transport-events.spec.ts`, `test/locations/transport-privacy.spec.ts`, `test/realtime/transport-audience.spec.ts`, `transport.spec.ts` (`listTransports` other org → 403); E2E bystander frames and REST; Prompt 09 live probe |
| 9 | AI never produces coordinates; ambiguous matches need confirmation; works with `OPENAI_API_KEY` unset | DONE | `test/hospitals/location-resolution.spec.ts` (AI coordinate output ignored, same-name 1 km apart → NEEDS_CONFIRMATION, key unset → deterministic) + Prompt 13 mutation checks; `frontend/__tests__/hospital-location-finder.spec.ts` (nothing preselected) |
| 10 | No GeoJSON file edits needed to show a new hospital | PARTIAL | Code: hospitals come from `GET /hospitals` (`HospitalMarker`), `bocaue.geojson` untouched (rule 11, Prompt 05 review). "Appears on all three maps" for a newly registered hospital (Table E Hospital registration row 1) is NOT RUN |
| 11 | All §20 tests pass; `pnpm test`, `pnpm typecheck`, `pnpm lint` green; emergency-flow E2E run | PARTIAL | §20 tests exist and pass, except the baseline `barangay-notify` failure. Typecheck green everywhere. **Lint not green**: backend 1 error (baseline), mobile 6 errors (baseline), frontend lint cannot run (toolchain). E2E run green (this session). Migration rollback row of §20 not run |

### Final audit — plan Table E (step 4)

| Area | Row | Status | Evidence |
|---|---|---|---|
| Setup | Scratch DB migrated and seeded; `GET /hospitals` lists Joni with `14.79679`, `120.94358`, VERIFIED | DONE | `agap_e2e`: 23 migrations + seed (this session); the E2E asserts Joni VERIFIED at those coordinates; Prompt 03 API smoke (`GET /v1/hospitals`, JSON numbers) |
| Setup | Re-running the seed creates no second row | DONE | Prompt 02 (seed twice → exactly one row) |
| Responder | Accept → En Route → scene route, "To scene" ETA labelled estimate | PARTIAL | User ran the responder flow on device ("it's working now", Prompt 10 note); per-row result not recorded |
| Responder | On Scene → Transporting → picker sorted by distance with receiving status | PARTIAL | Same device note; `DestinationPicker` logic in Prompt 10 tests |
| Responder | Cancel picker → "Destination not set"; drawer shows the record | PARTIAL | Server: record with `destination_id` null on TRANSPORTING (E2E, `transport-status.spec.ts`); UI not recorded |
| Responder | Select Joni → marker + road route within 20 s; last vertex ≈ `[120.9436, 14.7968]` | PARTIAL | Server: Prompt 09 live probe `[120.943519, 14.796745]`; E2E last vertex < 25 m. On-device timing not recorded |
| Responder | Navigate opens Waze/Maps to the hospital | NOT RUN | Code: `NavigateButton` targets the hospital on TO_FACILITY (Prompt 10); no device record |
| Responder | Fixes → route shortens, ETA updates, `estimated_arrival_at` changes | PARTIAL | `eta-refresh.spec.ts`; E2E (`estimated_arrival_at` set); backend logs in this session show repeated TO_FACILITY ETA updates; "route shortens" not recorded on device |
| Responder | Arrived → confirm → arrival time; Mark Resolved available; resolve before arrival refused | DONE | Device: INC-2026-DEMO06 arrived and RESOLVED, INC-2026-000010 arrived (this session, DB); refusal: `transport-status.spec.ts`, E2E |
| Dispatcher | Unit, dashed "To hospital" route, hospital marker; another unit shows "To scene" | NOT RUN | The Prompt 14 run found the route disappearing (fixed: heartbeat); re-check after the fix not recorded |
| Dispatcher | Change destination in drawer → marker, route, toast without reload; responder updates | DONE | User reported working (Prompt 12 review) |
| Dispatcher | Deactivate the hospital → warning on dispatcher and responder; transport continues | NOT RUN | Attempts deactivated Bocaue General with no open transport (Prompt 14 review); covered by `hospital-deactivation.spec.ts` |
| Citizen | Crew-confirmed reporter sees "Being taken to …" with route and estimate | NOT RUN | Needs `REPORTER_DESTINATION_SHARING_ENABLED=true` on a dev backend; server: `transport-privacy.spec.ts`, Prompt 09 probe steps 6–8 |
| Citizen | Reporter who ticked "I am the patient", not confirmed: same as a bystander | NOT RUN | Server: `transport-privacy.spec.ts` (`is_reporter`/NEEDS_HELP not confirmed → nulls) |
| Citizen | Bystander: only "The patient is being taken to a hospital"; nothing in UI, `tracking/latest` or WS frames | NOT RUN (device) | Server: E2E (frames + REST), `transport-privacy.spec.ts`, `transport-audience.spec.ts` |
| Citizen | No patient name, id or medical data in WS frames or `tracking/latest` | NOT RUN (device) | Server: `transport-events.spec.ts`, `transport-privacy.spec.ts` (identifier regex) |
| Citizen | After Resolved: "Response complete"; unit disappears | NOT RUN | — |
| Hospital registration | System Admin "Find location" → auto-selectable → VERIFIED → all three maps | NOT RUN | Server: `location-resolution.spec.ts`; Prompt 13 live resolve call (AUTO_SELECTABLE, 0.93) |
| Hospital registration | Ambiguous name → explicit choice; geocoder down → manual pin | NOT RUN | `location-resolution.spec.ts`, `hospital-location-finder.spec.ts` |
| Hospital registration | Swapped coordinates → 422 with suggestion; duplicate OSM ref → 409 | NOT RUN (UI) | Server: `hospital-location.spec.ts` (swap 422 + suggestion, C21 ref 409); Prompt 05 contract check |
| Hospital registration | Org Admin create → PENDING_REVIEW, not selectable; Supervisor verifies → selectable | NOT RUN (UI) | Server: `hospital-location.spec.ts`, `destination-rules` tests in `transport.spec.ts` |
| Failure | Airplane mode during transport → "will retry" indicator; reconnect → replayed once | DONE | Prompt 15 device check PASS (INC-2026-000010, INC-2026-DEMO06: one arrival + one audit row each) |
| Failure | Stop OSRM → route stale then gone; ETA unknown; transport and arrival still work | NOT RUN | `eta-refresh.spec.ts` (stale ≤ 120 s, then null; never throws) |
| Failure | Kill the dispatcher socket → polling; reconnect → re-seed | NOT RUN | `frontend/__tests__/live-tracking.spec.ts` (re-seed) |
| Failure | Hospital user from another org → 403 on `GET /incidents/:id/transport` | DONE (test) | `transport.spec.ts` `listTransports` "other org → 403" |
| Failure | Migration rollback on scratch DB restores the previous schema | NOT RUN | `down.sql` files exist; not run. `agap_e2e` now makes this possible |

Plan Phase 5 acceptance: E2E transport flow green: DONE. Offline arrival replay idempotent: DONE (Prompt 15 tests and device). Self-hosted OSRM p95 < 300 ms: NOT RUN (no build yet).

### Remaining work (step 5): PARTIAL/NOT DONE items and every follow-up, de-duplicated

Before production:
1. **DPO sign-off on C17** (waived for development only). Next: get the LGU DPO's written OK; until then keep `REPORTER_DESTINATION_SHARING_ENABLED=false`.
2. **Joni Villanueva ER entrance field check** (DoD 2, plan §6). Next: visit or call the hospital, store the ER-entrance point and re-verify it.
3. **Self-hosted OSRM.** Next: on the routing host, run `infrastructure/osrm/build.sh`, then `docker compose --profile routing up -d osrm`. Point `MAP_PROVIDER_ROUTING_URL` at it, measure p95 < 300 ms, and schedule `refresh.sh` monthly.
4. **Migration rollback test** (DoD 1, Table E). Next: on `agap_e2e`, run the three `down.sql` files in reverse order, check the schema, then `migrate deploy` again.
5. **Manual Table E rows** NOT RUN or PARTIAL above. Next: one device + browser session: Responder rows one by one, Dispatcher rows 1 and 3 (new TRANSPORTING incident to Joni; reactivate Bocaue General first), the Citizen rows (with sharing on, on dev only), Hospital registration, and the OSRM-stop and socket-kill rows.
6. **Lint green** (DoD 11). Next: fix the backend `incidents.service.ts:91` unused `actorRole` and the 6 mobile errors. Repair the frontend lint toolchain (ESLint 9 vs `eslint-config-next` 14 plugins: upgrade the plugins or pin ESLint 8).
7. **CI does not migrate a database or run `test:e2e`.** Next: add a CI step (`prisma migrate deploy` + seed on the CI Postgres, `E2E_DATABASE_URL` set to it, `pnpm test:e2e`).
8. **Multi-instance deployment.** The Nominatim `RequestSpacer`, the 10 s transport-audience cache and in-process throttles are per process. Next: a Redis-backed limiter before running more than one backend.

Backend:
9. `transport_records` has only its primary key. Next: a migration adding indexes on `dispatch_id`, `destination_id`, `incident_id`.
10. `incident.updated { transportUpdated }` is still sent by `updateTransport`. Next: check ETA-only PATCHes (they emit no `transport_updated`), then remove it.
11. `GET tracking/:id/eta` is not leg-aware, not cached, and routes on every request. Next: serve it from the route cache by leg (or retire it for `tracking/latest`).
12. An Org Admin's `setLocation` can put an in-use hospital into PENDING_REVIEW and re-route open transports to the unreviewed pin. Next: 409 while open transports head there.
13. `verifyLocation` (REJECTED) and `FacilitiesService.updateStatus` (AT_CAPACITY/CLOSED) do not notify open transports; reactivation sends no event. Next: call `notifyFacilityChanged` with a warning (and a "cleared" notice on reactivation).
14. `dto.patientId` is not checked against the incident on transport start. Next: 400 when the patient belongs to another incident.
15. The transport list cannot tell a guest report (the C17 switch shows a 400 instead). Next: a `reporterRegistered` hint on `GET /incidents/:id/transport`.
16. The RESOLVED guard is per dispatch. Next: make it incident-wide if multi-unit dispatch arrives (MOD-52 surge).
17. The service area is Bulacan only. Next: a configurable referral corridor if MDRRMO transports to Valenzuela or Caloocan.
18. Object-level access review of the POST/PATCH routes (incidents, locations, responders, hospitals, chat), plus `GET :id/detail` event notes reaching the reporter. Next: a dedicated review pass (propose before starting).
19. Five hand-built fail-open Redis clients (`session-revocation`, `mfa-state`, `route-cache`, `geocode-cache`, `transport-request-cache`); `RouteCacheService` stays off until restart if Redis was down at boot. Next: one shared Redis provider with reconnect.
20. Throttling is per IP before JWT. Next: a user-keyed guard for staff endpoints.
21. Hospital "Find location": untuned 0.85/0.70/150 m thresholds; a name that normalizes to empty; AI normalization not cached (repeat clicks cost new Nominatim calls); the result list is kept after the typed name changes. Next: tune on a labelled Bulacan set, fall back to the trimmed name, cache the normalization 24 h, clear results on edit.
22. `PATCH /hospitals/:id/active` does not check `facility_type = HOSPITAL`. Next: 404 for non-hospital facilities.
23. Duplicate detection misses two hospitals at the same point under different names. Next: a proximity warning in `assertNoDuplicate` / the finder.
24. `FacilitiesService.updateStatus` leaves `updated_at` stale; `GET /facilities` returns Decimal strings. Next: set `updated_at`; map through `toFacilityView`.
25. An offline arrival saved more than 30 min before reconnecting is refused and dropped (message shown). Next: also notify the dispatcher automatically.
26. Adjacent (plan §23): `incident_locations.point` is never filled, so proximity-based unit recommendations may be empty. Next: a separate ticket (fill it from lat/lng).
27. Test tooling: baseline `barangay-notify` FALSE_ALERT failure (`tx.false_alerts` missing in the mock); bcrypt auth specs time out under full-suite load; root `tests/` runner loads a second `@nestjs/common` (`instanceof` failures) and is not in CI. Next: fix the mock, raise the auth test timeouts, dedupe `@nestjs/common` in `tests/` or retire it.
28. C15: other hand-written status writes (`markFalseAlert`, duplicate merge, `false-alerts`, `dispatch`, `emergency-alerts`, `barangay-callback`) do not use `recordTransition`. Next: move them one by one.

Mobile:
29. Background location (`expo-task-manager`, plan Phase 5, optional; new dependency): NOT DONE. Next: decide after a battery/store-policy review; the "Keep AGAP open" banner covers it meanwhile.
30. Home and Missions use the same assignments hook and were not checked for the offline error-screen pattern fixed on the assignment screen and Map tab. Next: same `hasData` check.
31. Tracking-screen strings are still hard-coded English. Next: move them to `translations.ts` (en + fil).
32. MapLibre warnings (`source must have tiles` from the style; `<Layer style>` deprecated before MapLibre v12). Next: switch to `paint`/`layout` props.
33. Both responder screens derive "the open transport" with the same two lines; the picker's nearest list is empty before the first GPS fix. Next: return it from `useTransportRoute`; show "Waiting for GPS" in the picker.
34. The stopped-unit heartbeat makes one route request about every 20 s per unit (public OSRM in dev). Next: covered by item 3 in production.

Web:
35. `unitRoutePlan` could return a cached route on AT_FACILITY (unreachable today); `isWithinBocaue` (rectangle) differs from the shared polygon near the edges (rule 11). Next: one AT_FACILITY rule; leave the geofence files alone.
36. `GET /locations/responders` carries no leg, so the ops map fetches `tracking/:id/latest` per incident. Next: add the leg to the ops feed before surge mode.
37. The Set-location marker stays solid after the pin moves off a verified point (cosmetic). Next: show it as unverified while edited.

Reviews: Prompts 15 and 16 have not had an independent review (the user's usual next step).
