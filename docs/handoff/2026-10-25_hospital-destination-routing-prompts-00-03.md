# Handoff: Hospital destination routing — prompt pack, Prompts 00–03 verified and fixed

**Date:** 2026-10-25
**For:** the next agent continuing this conversation cold. Everything below happened in one session. **Nothing has been committed.** The user did not ask for a commit.
**What this work is:** implementing [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md) (MOD-38/39/40/43) through a step-by-step prompt pack, [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md). The user runs each prompt in a **separate** coding agent, then comes back here for an independent review before running the next prompt.

---

## How the user works with this

1. This session wrote the prompt pack. It has 17 prompts (00–16 plus optional A1), one per fresh agent session, each ending with STOP.
2. The user pastes one prompt into another agent. That agent implements it and appends a report to [`docs/HOSPITAL_ROUTING_PROGRESS.md`](../HOSPITAL_ROUTING_PROGRESS.md).
3. The user brings the agent's summary back and asks: **"verify it was accurately implemented: no errors, duplication or wrong executions."** The review must check the code, the DB and the tests directly, never just the agent's summary. Then fix what is wrong when asked, and correct later prompts or the plan if the code disagrees with them.
4. The user cares a lot about **no duplication** and **accurate data in `schema.prisma` / the DB**.

**Expected next request:** the user runs **Prompt 04**, then asks for a review of it. Prompt 04 was rewritten this session (see below). Review against the new text.

---

## Where things stand

| Prompt | Status | Notes |
|---|---|---|
| 00 Preflight/baseline | DONE, verified | Baseline numbers are in the progress log |
| 01 Schema + migration | DONE, verified independently | See "Prompt 01 facts" |
| 02 Seed + shared geo helpers | DONE, then **fixed by this session** (duplication) | |
| 03 Hospitals API | DONE, then **fixed by this session** (2 bugs + minor) | |
| 04 Transport correctness | **Not started.** Prompt text corrected this session | Next to run |
| 05–16, A1 | Not started | |

**Pre-existing failures (not ours; do not "fix" them as part of this work):**
- backend `test/barangay-coordination/barangay-notify.spec.ts`: `tx.false_alerts` is undefined in the mock.
- backend `test/auth/auth-phase3.spec.ts`: times out in the full run, passes alone (59/59). `auth-phase2` occasionally does the same.
- backend lint: 1 error, `src/incidents/incidents.service.ts:91` unused `actorRole`. Hundreds of `any` warnings.
- frontend `pnpm typecheck` fails with TS5033 (cannot write `tsconfig.tsbuildinfo`). Use `npx tsc --noEmit --incremental false` instead, which passes.

Last full backend run: **59/61 suites, 863/866 tests**. The failures are exactly the ones above.

**The working tree had about 268 uncommitted files before this work started** (referrals, announcements, auth, and more). Do not attribute those to this work. The diffs of `hospitals.controller.ts` / `hospitals.service.ts` vs HEAD include pre-existing referral changes (`findReferralFor`, `assertHospitalAccess`, `REFERRAL_READERS`, …). `transport.service.ts` also has a pre-existing diff (crew checks, `role` param, open-transport 409).

---

## Files belonging to this work

**Docs (untracked):**
- `docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`: the plan (pre-existing). This session added 2 correction notes (§11 API prefix, §12 status writer).
- `docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`: the prompt pack (written this session). Its **Corrections table C1–C13** overrides the plan where they disagree.
- `docs/HOSPITAL_ROUTING_PROGRESS.md`: progress log (created by Prompt 00). Ends with a "Post-review fixes for Prompts 02 and 03" section written by this session.

**Prompt 01:** `backend/prisma/schema.prisma` (Facility fields, enum, relation, indexes), `backend/prisma/migrations/20261025120000_facility_coordinates/{migration.sql,down.sql}`.
**Prompt 02:** `backend/prisma/seed/seed.ts`, `shared/src/maps/{map.types.ts (toLngLat), polygon.ts, service-area.ts, service-area.data.ts, index.ts, bocaue-boundary.ts}`, `scripts/dev/generate-service-area.ts`, `backend/test/maps/service-area.spec.ts`.
**Prompt 03:** `backend/src/hospitals/{hospitals.controller.ts, hospitals.service.ts}`, `backend/src/hospitals/dto/{create-hospital, update-hospital, nearby-query, set-location, verify-location}.dto.ts`, `backend/test/hospitals/hospital-location.spec.ts`.

---

## Key facts already verified (do not re-derive)

### Prompt 01 (DB)
- Migration applied and recorded in `_prisma_migrations`. The checksum matches the file (`9fc2d7d531fd…`). `prisma migrate diff` returns an empty migration (no drift). `migrate status` reports 21 migrations, up to date.
- `facilities` has `latitude/longitude numeric(10,7)`, `location_status facility_location_status NOT NULL DEFAULT 'UNVERIFIED'`, `location_source`, `location_source_ref`, `location_confidence numeric(3,2)`, `location_verified_by_id` (FK users, ON DELETE SET NULL).
- It also has 5 CHECKs (lat range, lng range, lat/lng pair, VERIFIED requires a point, confidence 0–1), GIST `idx_facilities_location`, `idx_facilities_location_status`, partial unique `uq_facilities_location_source_ref`, and the expression unique `uq_facilities_active_hospital_name` (lower name + lower coalesce municipality, active hospitals).
- **`location` (geography) is filled by trigger `trg_facilities_sync_location` from lat/lng.** Direct writes to `location` are overwritten. Never write `location` from code. This was a deliberate deviation from the plan's generated column (Correction C1).
- The pair CHECK means lat and lng must be cleared together.

### Prompt 02
- Seed: "DOH — Joni Villanueva General Hospital", id `00000000-0000-0000-0002-000000000006`, 14.79679 / 120.94358, VERIFIED, source `manual+osm-crosscheck`, ref `osm:way:1290448946`. The upsert writes coordinates in both `create` and `update`. Exactly one row in the DB.
- "Bocaue General Hospital" (`…0001`) stays UNVERIFIED with no coordinates. It is fictional; do not add coordinates.
- Service area = real Bulacan ADM2 polygon (geoBoundaries commit `9469f095…`), 500 points, bbox lng 120.687–121.348, lat 14.688–15.272. **Metro Manila is outside it**, which is expected; referral corridors come later via `extraPolygons`.
- After this session's fix there is **one** point-in-polygon implementation (`shared/src/maps/polygon.ts` → `isPointInRing`). Both `isCoordinateInBocaue` (keeps its bbox pre-check) and `isCoordinateInServiceArea` use it. The generator writes only `service-area.data.ts` and was re-run from the network with byte-identical output.

### Prompt 03 (after this session's fixes)
- `reviewVisibility(actor, includeUnreviewed)` is the single visibility rule:
  - Default: hide PENDING_REVIEW/REJECTED.
  - Reviewers (SYSTEM_ADMINISTRATOR, SUPERVISOR) with `includeUnreviewed`: see everything.
  - ORG_ADMINISTRATOR with `includeUnreviewed`: shared directory OR their own orgs.
  - It is used by `findAll` and `findVisibleById` (`GET /hospitals/:id`). `findById` stays the internal unfiltered lookup used by update/setLocation/verify.
- `POST /hospitals` roles: SYSTEM_ADMINISTRATOR, ORG_ADMINISTRATOR. Org Admin needs `organizationId` (400 if missing), must be a member (403), and the org type must be HOSPITAL (403). An unknown org returns 400. SysAdmin + location → VERIFIED; Org Admin + location → PENDING_REVIEW.
- The duplicate check mirrors the DB indexes: missing municipality = NULL or `''`, and the source-ref check spans all facilities. A 409 body is `{ code: 'DUPLICATE_FACILITY', existingFacilityId, existingName }`.
- `findNearby` was run against the real DB: numbers, ordered by `ST_Distance`, `location` stripped, `distanceKind: 'STRAIGHT_LINE'`.
- `UNREVIEWED_STATUSES` and `LOCATION_REVIEWERS` are constants at the top of `hospitals.service.ts`. **Prompt 04 is supposed to move `UNREVIEWED_STATUSES` into `backend/src/hospitals/destination-rules.ts`.**
- Tests: `test/hospitals` + `test/maps` = 4 suites / 47 tests passing.

### Codebase facts that affect later prompts
- **API prefix is `/v1/...`, not `/api/v1/...`** (URI versioning, no global prefix). Login body field is `identifier` (not `email`). Seed password is `AgapDev2026!`. Correction C10.
- `IncidentStatusService` **only** has `validateTransition`. The status write (incident update + timestamp column + `incidentEvent.create`) is duplicated inline in `IncidentsService.updateStatus` (~line 518) and `ResponderService.updateStatus` (~line 364). **No `transporting_at` column exists.** Correction C11. Prompt 04 adds `recordTransition(tx, …)` and removes both copies.
- `AuditService.logInTransaction(tx, entry)` exists (fail-closed).
- `RealtimeService.notifyIncidentStatusChanged` just calls `statusChanged`.
- `backend/test/incidents/transport.spec.ts` mock Prisma has **no `$transaction`** (19 tests).
- Backend Jest `rootDir` is `backend/`, so the root `tests/` folder is not in `pnpm test`. Run it with `pnpm --dir tests test -- backend/responders.service.spec.ts`. New backend tests go under `backend/test/`.
- No shared Redis provider exists. Services build their own `new Redis(REDIS_URL)` and fail open (`session-revocation.service.ts`). Correction C4.
- The gateway has `user:{sub}` rooms + `emitToUser`. Correction C6 uses them for bystander privacy (Prompt 09).
- Prisma 7 + `@prisma/adapter-pg`, config in `backend/prisma.config.ts`. Existing migrations are hand-written SQL when PostGIS/CHECK/partial indexes are involved.

---

## How to verify things quickly (patterns that worked)

- **Run real service code against the local DB** without Nest. Write a script to the scratchpad that `require`s `process.cwd() + '/src/...'`, and run it from `backend/` with:
  `npx ts-node -T -O '{"module":"commonjs"}' <script>`
  Construct `new PrismaService()` and the service with stub audit/notifications. Prefer calls that fail validation before any write. If a write is needed, wrap it in a transaction and roll it back.
- **Raw SQL checks:** from `backend/`, `node -e` with `require('dotenv').config({path:'.env'})` + `pg.Client`. Use `SAVEPOINT`/`ROLLBACK` for constraint probes. Never print `DATABASE_URL`.
- **Focused tests:** `cd backend && npx jest --config ./test/jest.config.ts test/hospitals test/maps`.
- **After any `shared/` change:** `pnpm --filter @agap/shared build`, then mobile `pnpm typecheck` and frontend `npx tsc --noEmit --incremental false`.
- **Bash quoting gotcha:** `node -e "..."` containing backticks or `$` inside the Bash tool breaks. Write a `.js` file to the scratchpad and run that instead.

---

## What to check when reviewing Prompt 04 (from the rewritten prompt)

1. `IncidentStatusService.recordTransition` + `statusTimestampFields` exist. Both inline copies in `incidents.service.ts` and `responders.service.ts` now call it. Their other behaviour (FALSE_ALERT row, dispatch completion, audit, realtime, notifications) is unchanged and their tests are still green.
2. `backend/src/hospitals/destination-rules.ts` exports `UNREVIEWED_STATUSES` (moved, not copied) and `assertSelectableDestination`. It is used in start/update/arrival. `grep -rn "PENDING_REVIEW" backend/src` shows no second list.
3. `activeMemberOrgIds` is in `org-scope.ts`, the private `memberOrgIds` is removed from `HospitalsService`, and transport uses it.
4. `startTransport`:
   - Only ON_SCENE (transitions) or TRANSPORTING (no transition) are allowed; otherwise 409 `TRANSPORT_NOT_ALLOWED_IN_STATUS`. ASSISTING is rejected and **no record is created**.
   - All checks run before writes. One `$transaction` covers create + recordTransition + `logInTransaction`.
   - Emits happen after commit only. The response carries `warnings`.
5. `listTransports`: HOSPITAL_USER is org-scoped, with 403 when nothing matches. Facilities include numeric lat/lng, `location_status` and `receiving_status`, never `location`.
6. The ETA processor no longer writes `transportRecord.updateMany`. Nothing else in it changed.
7. Run the real code against the DB (there are 0 transport records in the dev DB, so the agent's tests carry most of the weight; inspect the mocks for weakened assertions).

---

## Open items / decisions pending with the user

- **LGU Data Protection Officer sign-off** on the bystander-reporter privacy rule (plan §17) is a gate for Prompt 10. Not obtained yet.
- **Adjacent bug, out of scope:** `incident_locations.point` is NULL for every row, so proximity unit recommendations are likely empty. Optional Prompt A1 covers it.
- **The service area is Bulacan only.** If referrals into Metro Manila are needed, add a corridor polygon via config (Prompt 07/09 area).
