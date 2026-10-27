# AGAP — Hospital Destination Routing: Step-by-Step Implementation Prompts

**Companion to:** [`HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`](./HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md) (the "plan")
**Prepared:** 2026-10-25 · **Baseline:** `main` @ `c9d03c1` + uncommitted working tree
**Modules:** MOD-38, MOD-39, MOD-40, MOD-43 (with MOD-13, MOD-20, MOD-22, MOD-32, MOD-42, MOD-46, MOD-47, MOD-48)

---

## How to use this file

1. Run the prompts **in order, one per fresh agent session**. Each prompt is sized for one session. Do not paste two prompts into one session.
2. Copy everything inside a prompt's fenced block and send it as one message.
3. Every prompt makes the agent read **§0 Shared rules** (below) first. You do not need to paste §0 separately.
4. Each prompt ends with a **STOP** line. The agent must stop there and report back. Review the report, then run the next prompt.
5. Progress is tracked in `docs/HOSPITAL_ROUTING_PROGRESS.md`. Prompt 00 creates it and every later prompt appends to it. If a session dies halfway, start a new session with the same prompt. The agent reads the progress log and continues from where it stopped.
6. Gates: do not start a phase before its gate passes.

| # | Prompt | Plan phase | Gate before starting |
|---|---|---|---|
| 00 | Preflight, baseline, DB checks | — | none |
| 01 | Prisma schema + migration (facility coordinates) | 1 | 00 green |
| 02 | Seed reference hospital + shared geo helpers | 1 | 01 applied |
| 03 | Hospitals API: coordinates, nearby, set/verify location | 1 | 02 |
| 04 | Transport correctness fixes (start, scope, ETA interim) | 1 | 03 |
| 05 | Hospital registry UI: coordinates + map pin + verify | 1 | 03 |
| 06 | Shared contracts + realtime emitters | 2 | Phase 1 merged |
| 07 | Transport leg service, route cache, leg-aware ETA job | 2 | 06 |
| 08 | Single `beginTransport` path, RESOLVED guard, referral sync, transport_updated | 2 | 07 |
| 08B | Crew-confirmed reporter-patient flag (schema + endpoint) | 2 | 08 |
| 09 | Locations: service-area fixes, extended tracking seed, reporter privacy | 2 | 08B |
| 10 | Mobile responder UI | 3 | Phase 2 merged + DPO sign-off on the C17 rule |
| 11 | Mobile citizen tracking UI | 3 | 10 |
| 12 | Dispatcher dashboard UI | 3 | Phase 2 merged |
| 13 | Forward geocoding, scoring, AI name assist, resolve endpoint | 4 | Phase 1 merged |
| 14 | Hospital registry UI: "Find location" + Org Admin create | 4 | 13 |
| 15 | Idempotent transport mutations + mobile outbox | 5 | Phase 3 merged |
| 16 | Self-hosted OSRM, E2E, final Definition-of-Done audit | 5 | 15 |
| A1 | (Optional, adjacent) `incident_locations.point` fix | — | any time |

---

## Corrections to the plan found while writing these prompts

These were checked against the code on 2026-10-25. The prompts below already include them. They override the plan where the two disagree.

| # | Plan says | Code reality | What the prompts do |
|---|---|---|---|
| C1 | Replace `facilities.location` with a `GENERATED ALWAYS … STORED` column | Prisma models `location` as `Unsupported("geography")?`. A generated column risks migrate drift and Prisma writes to it would fail. The repo already uses hand-written SQL migrations with triggers and partial indexes (`20261021000000_barangay_coordination`, `20261023000200_medical_encryption_audit_immutability`) | Keep `location` as a plain `geography` column, filled by a `BEFORE INSERT OR UPDATE` **trigger** from `latitude`/`longitude`. No drift, no code writes `location` |
| C2 | GIST index on `location` in raw SQL only | `schema.prisma` already declares GIST indexes on `Unsupported` columns, for example `@@index([point], map: "idx_locations_point", type: Gist)` | Declare `@@index([location], map: "idx_facilities_location", type: Gist)` in the schema **and** create it in the migration, so `migrate diff` stays clean |
| C3 | Seed with `upsert` | Existing facility upserts use `update: {}`, so a re-seed never repairs a row | The reference hospital upsert sets the coordinate fields in **both** `create` and `update` |
| C4 | "Cache the route in Redis" | There is no shared Redis provider. Services build their own `new Redis(config.get('REDIS_URL'))` and fail open (`backend/src/auth/sessions/session-revocation.service.ts`) | New `RouteCacheService` follows that pattern and fails open |
| C5 | Clients stop computing routes | `LocationsService.getLatestUnitPositions` also calls `maps.route` **on every REST request** (`estimateEta`) | Prompt 09 makes it read the cached route first and only route inline on a cache miss |
| C6 | Phase 2 must decide how to redact transport data for non-patient reporters | The gateway already has `user:{sub}` rooms and `emitToUser` (`backend/src/realtime/agap.gateway.ts`) | Prompt 09 fixes the design: during `TO_FACILITY`, leg-sensitive events go to `ops:all` plus `user:{id}` rooms of the crew and (only if the crew confirmed the reporter is the patient on that transport, C17) the reporter. The shared incident room gets no destination, position or route on that leg |
| C7 | `tests/backend/responders.service.spec.ts` is the responder test file | Backend Jest uses `rootDir: '..'` (= `backend/`) and `testMatch: **/test/**/*.spec.ts`, so the root `tests/` folder is **not** in `pnpm test` for the backend | New backend tests go under `backend/test/…`. Prompt 00 checks how `tests/backend` runs and records it |
| C8 | `GET /hospitals/nearby?lat=&lng=` | The controller turns missing params into `0,0` | Prompt 03 validates the query with a DTO and returns 400 when lat/lng are missing or invalid |
| C9 | ETA job "routes to the scene" | The processor also skips dispatches whose status is not `PENDING`/`SENT`/`ACCEPTED`. It reads the freshest crew fix | Keep both behaviours. Only the target and the write rule change |
| C10 | REST paths are `/api/v1/...` | `main.ts` uses URI versioning with no global prefix, so the backend serves `/v1/...` (found while verifying Prompt 03) | Read every `/api/v1/` in the plan and these prompts as `/v1/` when calling the backend directly. Client base URLs are unaffected |
| C11 | "`IncidentStatusService` records the transition" | `IncidentStatusService` only has `validateTransition`. The write (status + timestamp column + `IncidentEvent` row) is copied inline in `IncidentsService.updateStatus` and `ResponderService.updateStatus`. There is no `transporting_at` column | Prompt 04 adds one `recordTransition(tx, …)` to `IncidentStatusService` and switches both existing copies to it, so transport does not become a third copy |
| C12 | Transport checks facility type/review status itself | Prompts 02–03 already define the review rule (`UNREVIEWED_STATUSES` in `hospitals.service.ts`) | Prompt 04 moves that rule into one small hospitals-module file and reuses it. Do not redefine the status list |
| C13 | "Reuse `memberOrgIds`" | It is a private method of `HospitalsService` | Prompt 04 moves it into `backend/src/organizations/org-scope.ts` and both services import it |
| C14 | `EtaRefreshJobData` gains `leg` and `targetLat/targetLng` (§13.2) | Storing the target in the job lets a stale job route to an old destination | Prompt 07 resolves the leg when the job runs and adds only an optional `reason` |
| C15 | (C11) status writes are "copied twice" | Status + `IncidentEvent` writes are also hand-written in `IncidentsService.markFalseAlert` and the duplicate merge (same file), `false-alerts.service.ts`, `dispatch.service.ts`, `emergency-alerts.service.ts`, `barangay-callback.service.ts` (found in the 2026-10-26 review) | Prompt 04 still switches only the two named copies plus transport. The others are a recorded Follow-up, not part of this work. `IncidentsService.updateStatus` returns the updated row, so `recordTransition` returns it too. It also refuses a concurrent change (update `where { id, status: from }`) |
| C16 | "Open transport" = `arrived_at IS NULL` | A dispatcher may resolve an incident before arrival (Prompt 08 override). That record would stay "open" forever: Prompt 09 would accept that crew's fixes outside Bocaue and Prompt 08 would send facility events to finished incidents | One definition, `openTransportWhere()` in `backend/src/incidents/transport/open-transport.ts` (`arrived_at: null` AND incident status `TRANSPORTING`), created in Prompt 04 and used by every later "open transport" check. No other file writes its own version |
| C17 | §17: show the destination when **any** `incident_patients` row on the incident has `is_reporter = true` | `is_reporter` is only what the reporter ticked on the SOS form, and nobody confirms or corrects it. The check is per incident, so with two patients one reporter-patient would see the other patient's hospital. Mobile never sends `patientId` when starting a transport, so `transport_records.patient_id` is effectively always null. Guests (`incident_reporters.user_id` null) have no token and get no live tracking | **Reporters see no destination by default.** The only exception is a registered reporter whom the crew on that transport has **confirmed** is the patient being carried (`transport_records.reporter_patient_confirmed_at`, set by the crew, audited). New Prompt 08B adds the column and endpoint, Prompt 09 enforces the rule on the server, Prompts 10/11 add the UI. The reporter's self-claim is shown to the crew only as a hint |
| C18 | Redact the new `destination` field for non-patient reporters | `incident.transporting` already sends `destinationId` and `destinationName` to the incident room, and `incident.facility_arrival` sends `destinationId`. Any signed-in user can turn the id into a name with `GET /hospitals/:id` | Prompt 06 makes the incident-room copies of both events status-only: no `patientId`, `destinationId`, `destinationName` or `destination`. `incident.transport_updated` never goes to the incident room. Destination details reach a reporter only through their own `user:{id}` room after C17's confirmation (Prompt 09) |
| C19 | New request DTOs validate ids with `@IsUUID()` | `@IsUUID()` rejects the fixed seed ids (`00000000-0000-0000-0002-…`, version digit 0), while `ParseUUIDPipe` on path ids accepts them. This blocked every transport start on seeded data (found 2026-10-26) | Every id field in a request body uses `@IsRecordId()` from `backend/src/common/decorators/is-record-id.decorator.ts` (= `IsUUID('loose')`). Never add a bare `@IsUUID()` (Prompts 08B, 13, 15 and any new DTO) |
| C20 | New map components set up MapLibre themselves | The configured style references icons missing from its sprite, and its URL changes once `map-config` loads (found 2026-10-26) | Every web `<Map>` uses `ref={resolveMissingStyleImages}` from `frontend/components/map/missing-style-images.ts` and `styleDiffing={false}`, like `IncidentMapView`. Hospital markers use the one `frontend/components/map/HospitalMarker.tsx` (Prompt 12) |

**Reporter destination rule (C17, applies to every channel: REST, WebSocket, push, SMS, now and later):**

| Reporter | What they receive during transport |
|---|---|
| Guest (no account), whether bystander or patient | Nothing new (no tracking). Any future SMS or other channel carries status only, never the hospital |
| Registered bystander | Status only: "The patient is being taken to a hospital." No hospital name, unit position, route or ETA |
| Registered reporter who **claimed** to be the patient | Same as a bystander until the crew confirms |
| Registered reporter **crew-confirmed** as the patient on that transport | Hospital name, marker, route, ETA estimate, for that transport only |
| Family or anyone else | MDRRMO hotline or dispatcher, who checks identity first |

---

## §0 Shared rules (every prompt makes the agent read this)

These rules apply to every prompt in this file.

**Read first, every session**
- `CLAUDE.md` (root). Its Architectural Rules, Reliability Rules and "What NOT to do" are binding.
- `docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`: only the sections the prompt names.
- `docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`: the "Corrections" table and this §0.
- `docs/HOSPITAL_ROUTING_PROGRESS.md`: what earlier prompts did and any deviations they recorded.

**Working rules**
1. Do only what this prompt asks. If you notice something outside its scope, write it under "Follow-ups" in the progress log. Do not fix it.
2. Before editing a file, read it. Match the surrounding code: naming (Prisma fields are `snake_case`, DTO fields `camelCase`), comment density, error style (Nest exceptions with plain-English messages), and test style (look at a neighbouring spec first).
3. Respect domain boundaries. No new generic `utils`/`services` folders.
4. Never log secrets, JWTs, patient names, medical data or full route geometry.
5. Never put a patient identifier (`patientId`, patient name, assessment, triage) in a payload that reaches an incident room or the reporter.
6. Routing, geocoding and AI failures must never block transport start, arrival, resolution or dispatch. Fail soft and return `null`/`stale`.
7. ETA is always labelled an estimate (`isEstimate: true` on the wire, "estimate" or "est." in UI text).
8. Coordinates on the API are always named fields `latitude`/`longitude` (or `lat`/`lng` where the existing contract already uses them). Only GeoJSON uses `[lng, lat]`, built through the shared `toLngLat` helper once Prompt 02 adds it.
9. Prisma `Decimal` values are converted to JS `number` before they leave a service. Never send coordinates as strings.
10. Every consequential write (facility location set/verify/reject, transport start/change/arrival) writes an `AuditLog` row through `AuditService`.
11. Do not touch `frontend/public/assets/geojson/bocaue.geojson`, `frontend/lib/bocaue-geo.ts` or `shared/src/maps/bocaue-boundary.ts`. The incident geofence stays strict.
12. Do not add dependencies unless the prompt says so. `axios`, `openai`, `zod`, `ioredis`, BullMQ, `@nestjs/throttler` and PostGIS are already available.
13. Do not commit, push or run anything against a shared or production database. Migrations run on the local dev/scratch DB only.
14. If `shared/` changes, rebuild it before running other packages: `pnpm --filter @agap/shared build`.

**Verification commands (run the ones the prompt lists, and paste the summary lines in your report)**
```
pnpm --filter @agap/shared build
pnpm --filter @agap/shared typecheck
cd backend  && pnpm typecheck && pnpm lint && pnpm test
cd backend  && npx jest --config ./test/jest.config.ts <spec paths>     # focused run
cd frontend && pnpm typecheck && pnpm lint && pnpm test
cd mobile   && pnpm typecheck && pnpm lint && pnpm test
```
If a check fails for a reason that existed before your change, prove it with `git stash` (or by comparing with the Prompt 00 baseline) and record it in the progress log. Do not hide failures.

**End-of-prompt report (always)**
Append a section to `docs/HOSPITAL_ROUTING_PROGRESS.md`:
```
## Prompt NN — <title> — <date>
Status: DONE | PARTIAL (why)
Files changed: <list>
Tests added/updated: <list>
Verification: <command → result summary>
Deviations from plan/prompt: <none | list with reason>
Follow-ups: <none | list>
```
Then reply with the same summary. Then STOP.

---

## Prompt 00 — Preflight, baseline and database checks (no code changes)

```text
You are implementing the AGAP hospital destination routing plan, one prompt at a time.
This is Prompt 00 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.

First read: CLAUDE.md; the "Corrections" table and §0 Shared rules in
docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md; plan sections §1, §7, §10 and §20.

GOAL: record a trustworthy baseline before any change. Do NOT modify source code,
the Prisma schema or migrations in this prompt.

STEPS
1. Create docs/HOSPITAL_ROUTING_PROGRESS.md with a title, a link to the plan and
   the prompts file, and an empty "Follow-ups" section at the top.
2. Record the git state: `git rev-parse --short HEAD`, and `git status --short | wc -l`
   (count only; the working tree has many uncommitted files that are NOT ours to touch).
3. Run the baseline focused backend tests and record the result:
   cd backend && npx jest --config ./test/jest.config.ts test/incidents/transport.spec.ts test/locations/eta-refresh.spec.ts test/hospitals/referrals.spec.ts test/locations/location-bounds.spec.ts test/locations/live-tracking.spec.ts
   (The plan saw 4 suites / 50 tests pass without live-tracking; record what you see.)
4. Run the full suites once and record pass/fail counts (do not fix anything):
   backend: pnpm test, pnpm typecheck, pnpm lint
   frontend: pnpm test, pnpm typecheck
   mobile: pnpm test, pnpm typecheck
   shared: pnpm --filter @agap/shared build && pnpm --filter @agap/shared typecheck
   Record every pre-existing failure by file so later prompts can tell "already broken" from "we broke it".
5. Find out how the root tests/ folder runs (tests/backend/responders.service.spec.ts).
   Look at the root package.json, any jest config under tests/, and CI workflows in .github/workflows/.
   Record the exact command, or "not wired to any runner".
6. Database checks against the LOCAL dev database only (connection from backend/.env
   DATABASE_URL; do not print the URL or password). Use psql or `npx prisma db execute --stdin`.
   Record each result:
   a. SELECT count(*) FROM facilities WHERE location IS NOT NULL;
   b. SELECT lower(name), lower(coalesce(municipality,'')), count(*) FROM facilities
      WHERE facility_type='HOSPITAL' AND is_active GROUP BY 1,2 HAVING count(*)>1;
   c. SELECT id, name, facility_type, organization_id FROM facilities ORDER BY id;
   d. SELECT count(*) FROM transport_records; and
      SELECT count(*) FROM transport_records tr WHERE tr.arrived_at IS NULL;
   e. SELECT extversion FROM pg_extension WHERE extname='postgis';
   f. `cd backend && npx prisma migrate status` (record whether the DB is up to date
      with the 21 migration folders).
   If the DB is not reachable, record that and mark Prompt 01 as blocked until it is.
7. Write a "Gate for Prompt 01" line in the progress log:
   PASS only if (a) = 0 (or a backfill plan is written), (b) returns no rows
   (or the duplicates are listed for manual resolution), and (f) shows no pending
   or failed migrations.

VERIFICATION: the progress log contains every recorded number above.
Write the end-of-prompt report as described in §0.
STOP after the report. Do not start Prompt 01.
```

---

## Prompt 01 — Prisma schema and migration: facility coordinates

```text
This is Prompt 01 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0 and the Corrections table (C1, C2) in the prompts file;
docs/HOSPITAL_ROUTING_PROGRESS.md (check the Prompt 00 gate is PASS; if not, STOP and say why);
plan §6 and §10.
Also read: backend/prisma/schema.prisma (model Facility ~line 351, model User, the enums
near facility_receiving_status ~line 1754), backend/prisma.config.ts,
backend/prisma/migrations/20261021000000_barangay_coordination/migration.sql and
backend/prisma/migrations/20261023000200_medical_encryption_audit_immutability/migration.sql
(precedents for hand-written SQL, CHECKs, partial indexes and triggers).

GOAL: hospitals get real, Prisma-readable coordinates plus a verification status.
`facilities.location` (geography) stays, but is now derived from the decimals by a trigger.

STEP 1 — Edit backend/prisma/schema.prisma (keep the file's column alignment style).
In `model Facility`, add these fields directly after `address` (keep `location` where it is):

  latitude                Decimal?                 @db.Decimal(10, 7)
  longitude               Decimal?                 @db.Decimal(10, 7)

and directly after `location`:

  location_status         facility_location_status @default(UNVERIFIED)
  location_source         String?                  @db.VarChar(50)
  location_source_ref     String?                  @db.VarChar(100)
  location_confidence     Decimal?                 @db.Decimal(3, 2)
  location_verified_by_id String?                  @db.Uuid

Add the relation next to the other relations in Facility:

  location_verified_by    User?                    @relation("FacilityLocationVerifiedBy", fields: [location_verified_by_id], references: [id], onDelete: SetNull, onUpdate: NoAction)

Add indexes before `@@map("facilities")`:

  @@index([location], map: "idx_facilities_location", type: Gist)
  @@index([location_status], map: "idx_facilities_location_status")

In `model User`, add the back-relation (place it with the other relation lists, matching style):

  facilities_location_verified Facility[] @relation("FacilityLocationVerifiedBy")

Add the enum next to facility_receiving_status / facility_type (alphabetical neighbourhood):

  enum facility_location_status {
    UNVERIFIED
    PENDING_REVIEW
    VERIFIED
    REJECTED
  }

`last_verified_at` already exists. Reuse it; do not add a new timestamp.

STEP 2 — Create the migration folder by hand:
backend/prisma/migrations/20261025120000_facility_coordinates/migration.sql
Start with a header comment in the style of the barangay migration (what, why, why
hand-written). Contents, in this order:

  -- Enum
  CREATE TYPE "facility_location_status" AS ENUM ('UNVERIFIED','PENDING_REVIEW','VERIFIED','REJECTED');

  -- Columns
  ALTER TABLE "facilities"
    ADD COLUMN "latitude" DECIMAL(10,7),
    ADD COLUMN "longitude" DECIMAL(10,7),
    ADD COLUMN "location_status" "facility_location_status" NOT NULL DEFAULT 'UNVERIFIED',
    ADD COLUMN "location_source" VARCHAR(50),
    ADD COLUMN "location_source_ref" VARCHAR(100),
    ADD COLUMN "location_confidence" DECIMAL(3,2),
    ADD COLUMN "location_verified_by_id" UUID;

  -- FK (match the existing FK naming: <table>_<column>_fkey)
  ALTER TABLE "facilities" ADD CONSTRAINT "facilities_location_verified_by_id_fkey"
    FOREIGN KEY ("location_verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

  -- CHECKs (Prisma cannot express these)
  ALTER TABLE "facilities"
    ADD CONSTRAINT "facilities_lat_range_chk" CHECK ("latitude" BETWEEN -90 AND 90),
    ADD CONSTRAINT "facilities_lng_range_chk" CHECK ("longitude" BETWEEN -180 AND 180),
    ADD CONSTRAINT "facilities_latlng_pair_chk" CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
    ADD CONSTRAINT "facilities_verified_has_point_chk" CHECK ("location_status" <> 'VERIFIED' OR "latitude" IS NOT NULL),
    ADD CONSTRAINT "facilities_confidence_range_chk" CHECK ("location_confidence" IS NULL OR "location_confidence" BETWEEN 0 AND 1);

  -- Backfill (only matters if Prompt 00 found rows with location set; harmless otherwise)
  UPDATE "facilities"
     SET "latitude"  = ST_Y("location"::geometry)::numeric(10,7),
         "longitude" = ST_X("location"::geometry)::numeric(10,7)
   WHERE "location" IS NOT NULL AND "latitude" IS NULL;

  -- Keep location derived from the decimals (single source of truth; see Corrections C1)
  CREATE OR REPLACE FUNCTION facilities_sync_location() RETURNS trigger AS $$
  BEGIN
    IF NEW."latitude" IS NULL OR NEW."longitude" IS NULL THEN
      NEW."location" := NULL;
    ELSE
      NEW."location" := ST_SetSRID(ST_MakePoint(NEW."longitude"::float8, NEW."latitude"::float8), 4326)::geography;
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER "trg_facilities_sync_location"
    BEFORE INSERT OR UPDATE OF "latitude", "longitude", "location" ON "facilities"
    FOR EACH ROW EXECUTE FUNCTION facilities_sync_location();

  -- Indexes
  CREATE INDEX "idx_facilities_location" ON "facilities" USING GIST ("location");
  CREATE INDEX "idx_facilities_location_status" ON "facilities" ("location_status");
  CREATE UNIQUE INDEX "uq_facilities_location_source_ref"
    ON "facilities" ("location_source", "location_source_ref") WHERE "location_source_ref" IS NOT NULL;
  CREATE UNIQUE INDEX "uq_facilities_active_hospital_name"
    ON "facilities" (lower("name"), lower(coalesce("municipality", '')))
    WHERE "facility_type" = 'HOSPITAL' AND "is_active";

Also create backend/prisma/migrations/20261025120000_facility_coordinates/down.sql
(not run by Prisma; documented rollback) that drops, in reverse order: the two unique
indexes, the two indexes, the trigger, the function, the five CHECKs, the FK, the seven
columns and the enum. Header comment: "Manual rollback. Take `pg_dump -t facilities` first."

STEP 3 — Validate and apply (local DB only):
  cd backend
  npx prisma validate
  npx prisma format            (then confirm the diff only touches what you added)
  npx prisma migrate dev       (applies the new folder; if it proposes ANY extra
                                 SQL or a reset, STOP, do not accept, and record the
                                 proposal in the progress log)
  npx prisma generate
  npx prisma migrate diff --from-config-datasource --to-schema-datamodel prisma/schema.prisma --script
     (or the Prisma 7 equivalent flags; the expected output is an empty migration.
      If it shows changes, record them. Partial/expression unique indexes and CHECKs
      are expected to be invisible to Prisma; anything else is drift to fix in the
      schema, not in the DB.)

STEP 4 — Prove the database rules with SQL (local DB), and record results:
  - Insert-then-rollback a facility with latitude 14.79679, longitude 120.94358 inside
    a transaction: SELECT ST_AsText(location::geometry) returns POINT(120.94358 14.79679).
  - latitude 95 → CHECK violation. latitude set with longitude NULL → CHECK violation.
  - location_status 'VERIFIED' with NULL latitude → CHECK violation.
  - UPDATE latitude to NULL → location becomes NULL.
  Use BEGIN ... ROLLBACK so nothing persists.

STEP 5 — Make sure nothing else broke: cd backend && pnpm typecheck && pnpm test.
  The new fields are optional/defaulted, so existing code should compile unchanged.

DO NOT change any service, DTO, controller, seed or UI in this prompt.
Write the end-of-prompt report (§0). STOP.
```

---

## Prompt 02 — Seed the reference hospital and add shared geo helpers

```text
This is Prompt 02 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0 and Corrections C3 in the prompts file; the progress log
(Prompt 01 must be DONE); plan §6, §13.3, §13.4.
Also read: backend/prisma/seed/seed.ts (the "── Facilities ──" block ~line 287, and how
hospitalOrg is created), shared/src/maps/bocaue-boundary.ts (how its polygon and source
string are recorded), shared/src/maps/index.ts, shared/src/maps/map.types.ts,
shared/src/index.ts.

GOAL A — Seed "DOH — Joni Villanueva General Hospital" idempotently.
In seed.ts, right after the facility 000000000005 upsert, add:

  await prisma.facility.upsert({
    where: { id: '00000000-0000-0000-0002-000000000006' },
    update: { <same coordinate/status fields as below, so a re-seed repairs the row> },
    create: {
      id: '00000000-0000-0000-0002-000000000006',
      name: 'DOH — Joni Villanueva General Hospital',
      facility_type: facility_type.HOSPITAL,
      barangay: 'Igulot',
      municipality: 'Bocaue',
      province: 'Bulacan',
      address: 'North Luzon Expressway, Igulot, Bocaue, Bulacan 3018',
      receiving_status: facility_receiving_status.OPEN,
      has_emergency_room: true,
      is_active: true,
      latitude: 14.79679,
      longitude: 120.94358,
      location_status: facility_location_status.VERIFIED,
      location_source: 'manual+osm-crosscheck',
      location_source_ref: 'osm:way:1290448946',
      location_confidence: 0.95,
      last_verified_at: new Date('2026-10-25T00:00:00Z'),
    },
  });

Rules:
- Import facility_location_status from the generated client the same way the file
  imports facility_type.
- Do NOT link it to hospitalOrg (organization_id stays null; it is a DOH facility, not
  the demo org). Do NOT invent phone numbers.
- Do NOT add coordinates to the fictional "Bocaue General Hospital" (…0001). It stays
  UNVERIFIED with no coordinates (plan §6).
- Add a one-line comment above the block: coordinates cross-checked against OSM way
  1290448946 (~7 m); ER entrance still to be field-verified before production.

Run the seed twice: `cd backend && pnpm prisma db seed` (twice). Then record:
  SELECT id, latitude, longitude, location_status, ST_AsText(location::geometry)
  FROM facilities WHERE name LIKE '%Joni Villanueva%';
Exactly one row, POINT(120.94358 14.79679).

GOAL B — Shared geo helpers (pure, unit-tested).
1. shared/src/maps/map.types.ts: add
     export function toLngLat(p: { latitude: number; longitude: number }): [number, number]
   returning [longitude, latitude]. One-line doc comment: "The only place API
   coordinates become GeoJSON order."
2. Create shared/src/maps/service-area.ts:
   - export const FACILITY_SERVICE_AREA_SOURCE (string, like BOCAUE_BOUNDARY_SOURCE)
   - export const FACILITY_SERVICE_AREA: readonly (readonly [number, number])[]
     The Bulacan province (ADM2) polygon from geoBoundaries PHL ADM2 (simplified),
     [lng, lat] order, generated the same way as BOCAUE_BOUNDARY. Write the small
     generator script you use to scripts/dev/generate-service-area.ts (or .mjs) so the
     constant is reproducible, and pin the geoBoundaries commit in the source string.
     If you cannot download the data in this environment, use a rectangular fallback
     polygon covering Bulacan plus the NLEX corridor to northern Metro Manila
     (approximately lng 120.70–121.35, lat 14.60–15.25), mark it clearly as
     "FALLBACK bbox — replace with ADM2 polygon" in the source string, and add a
     Follow-up in the progress log.
   - export function isCoordinateInServiceArea(latitude: number, longitude: number): boolean
     Reuse the point-in-polygon approach of bocaue-boundary.ts (read it; do not copy-paste
     a second implementation if you can import its helper — refactor the helper into a
     shared internal function only if it is not exported).
   - export function looksSwapped(latitude: number, longitude: number): boolean
     true when (lat,lng) is outside the service area but (lng,lat) treated as (lat,lng)
     is inside.
   - Optional override hook: export a function that accepts extra polygons, so the backend
     can add referral corridors from config later. Keep it minimal.
3. Export the new module from shared/src/maps/index.ts.
4. Tests: add shared-level or backend-level Jest tests (backend/test/maps/service-area.spec.ts
   is fine; @agap/shared maps to shared/src in backend Jest):
   - toLngLat({latitude:14.79679, longitude:120.94358}) → [120.94358, 14.79679]
   - isCoordinateInServiceArea(14.79679, 120.94358) → true; also true for the Bocaue
     scene (14.7969, 120.9268); false for Cebu (10.3157, 123.8854)
   - looksSwapped(120.94358, 14.79679) → true; looksSwapped(14.79679, 120.94358) → false
   - isCoordinateInBocaue unchanged (existing bocaue-boundary spec still passes)

VERIFICATION: pnpm --filter @agap/shared build && pnpm --filter @agap/shared typecheck;
cd backend && npx jest --config ./test/jest.config.ts test/maps && pnpm typecheck.
Write the end-of-prompt report (§0). STOP.
```

---

## Prompt 03 — Hospitals API: coordinates, nearby search, set/verify location

```text
This is Prompt 03 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0 and Corrections C8 in the prompts file; the progress log;
plan §9.4, §10 (Audit paragraph), §11 (the /hospitals contracts), §18.
Also read: backend/src/hospitals/{hospitals.controller,hospitals.service,hospitals.module}.ts,
backend/src/hospitals/dto/*.ts, backend/src/organizations/org-scope.ts,
backend/src/audit/audit.service.ts (log signature), backend/test/hospitals/referrals.spec.ts
(test style and how Prisma is faked), shared/src/maps/service-area.ts.

GOAL: the hospital registry exposes validated coordinates and a review workflow.
No geocoding/AI yet (that is Prompt 13). No transport changes (Prompt 04).

1. Serialization. Add a private `toHospitalView(facility)` mapper in HospitalsService
   that converts latitude, longitude, location_confidence (Prisma Decimal) to number|null
   and leaves everything else as-is (keep snake_case keys, as today). Use it in findAll,
   findNearby, findById, create, update and the new methods. Never return `location`.

2. findAll(actor, { includeUnreviewed }):
   - Default: facility_type HOSPITAL, is_active, location_status NOT IN (PENDING_REVIEW, REJECTED).
   - `?includeUnreviewed=true` is honoured only for SYSTEM_ADMINISTRATOR, SUPERVISOR and
     ORG_ADMINISTRATOR (Org Admin sees unreviewed only for their own orgs). Other roles: ignored.
   - Controller passes req.user.

3. findNearby(lat, lng, limit):
   - New DTO backend/src/hospitals/dto/nearby-query.dto.ts: lat (-90..90), lng (-180..180)
     required numbers (class-transformer @Type(() => Number)), limit optional 1..25 default 10.
     Missing/invalid → 400 (Corrections C8).
   - Query with $queryRaw (tagged template, never string-concatenated), VERIFIED + active
     hospitals only, ordered by ST_Distance(location, ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography),
     returning the hospital columns plus distance_meters. Map to the view and add
     `distanceMeters` (number, rounded) and `distanceKind: 'STRAIGHT_LINE'`.

4. DTOs:
   - create-hospital.dto.ts: add optional address, province (IsString, MaxLength 255/100),
     organizationId (IsUUID), and optional nested `location` (ValidateNested, @Type) of a new
     class HospitalLocationInput { latitude: number (-90..90); longitude: number (-180..180);
     source: string (IsIn ['manual','nominatim','manual+osm-crosscheck']); sourceRef?: string (MaxLength 100);
     confidence?: number (0..1) }. Name: Length 2..255.
   - New dto/set-location.dto.ts: latitude, longitude, source, sourceRef?, confidence?, reason? (MaxLength 500).
   - New dto/verify-location.dto.ts: decision IsIn ['VERIFIED','REJECTED'], note? (MaxLength 500).
   - update-hospital.dto.ts: must NOT allow `location` or `organizationId` through PATCH /:id
     (use OmitType) — location changes go only through the dedicated endpoint.

5. A private `assertValidLocation(lat, lng)`:
   - Not in service area and looksSwapped → UnprocessableEntityException with body
     { code: 'COORDINATES_LIKELY_SWAPPED', message, suggested: { latitude: lng, longitude: lat } }.
   - Not in service area → 422 { code: 'COORDINATES_OUT_OF_SERVICE_AREA', message }.
   Check how other services shape coded errors (grep for `code:` in backend/src exceptions)
   and match that.

6. Duplicate checks (before writing, and also map Prisma P2002 on the two unique indexes):
   - Same (location_source, location_source_ref) → 409 { code: 'DUPLICATE_FACILITY', existingFacilityId, existingName }.
   - Same lower(name)+lower(municipality) among active hospitals → same 409.
   - Same name, different municipality → allowed.

7. create(dto, actor) — permissions (plan §9.4):
   - SYSTEM_ADMINISTRATOR: any org or none. With `location` → status VERIFIED,
     location_verified_by_id = actor, last_verified_at = now. Without → UNVERIFIED.
   - ORG_ADMINISTRATOR: organizationId required and must pass assertCanManageOrg; the org's
     organization_type must be HOSPITAL (else 403). Status is PENDING_REVIEW when a location
     is given, else UNVERIFIED. Never VERIFIED.
   - Controller @Roles: SYSTEM_ADMINISTRATOR, ORG_ADMINISTRATOR. Pass req.user (not just id).
   - Audit newValues includes name, organization_id, latitude, longitude, location_status.

8. New PATCH /hospitals/:id/location (setLocation):
   - Roles: SYSTEM_ADMINISTRATOR, SUPERVISOR, ORG_ADMINISTRATOR (own org only via assertCanManageOrg).
   - Validate (5), duplicates (6). SYSTEM_ADMINISTRATOR/SUPERVISOR → VERIFIED (+ verifier,
     last_verified_at). ORG_ADMINISTRATOR → PENDING_REVIEW (clear verifier).
   - Audit oldValues {latitude, longitude, location_status} and newValues (+ reason).
   - Leave a clearly named no-op hook `onFacilityLocationChanged(facilityId)` (private,
     with a TODO "Prompt 08 emits incident.transport_updated for open transports"). Do not
     import transport code here.

9. New POST /hospitals/:id/location/verify:
   - Roles: SUPERVISOR, SYSTEM_ADMINISTRATOR.
   - VERIFIED requires coordinates (else 422 { code: 'LOCATION_MISSING' }). REJECTED keeps
     coordinates but sets status REJECTED. Stamp verifier + last_verified_at. Audit with note.

10. Route order: register `nearby`, `:id/location`, `:id/location/verify` so they do not
    collide with `:id` (the controller already puts `nearby` and `referrals/...` before `:id`).
    Add @ApiOperation summaries.

11. Tests — new backend/test/hospitals/hospital-location.spec.ts (follow referrals.spec.ts style):
    - findAll returns numbers (not Decimal/strings) for latitude/longitude; hides PENDING_REVIEW
      and REJECTED by default; includeUnreviewed honoured for SYSTEM_ADMINISTRATOR, ignored for DISPATCHER.
    - nearby: invalid query → 400 (DTO validation test with class-validator `validate`).
    - setLocation: out-of-area → 422 code; swapped → 422 with suggested; duplicate source ref → 409.
    - create as ORG_ADMINISTRATOR of a HOSPITAL org → PENDING_REVIEW; other org → 403;
      non-HOSPITAL org → 403. As SYSTEM_ADMINISTRATOR with location → VERIFIED.
    - verify: SUPERVISOR VERIFIED → status + verifier set + audit called; VERIFIED without
      coordinates → 422.
    - Same name different municipality → allowed.
    Keep referrals.spec.ts green (constructor or findAll signature changes may need small
    test updates — update, do not delete, assertions).

VERIFICATION: cd backend && npx jest --config ./test/jest.config.ts test/hospitals &&
pnpm typecheck && pnpm lint && pnpm test. Then, with the backend running locally, record
`GET /v1/hospitals` (Corrections C10) for the seeded hospital showing latitude 14.79679 / longitude 120.94358
as JSON numbers (redact the token).
Write the end-of-prompt report (§0). STOP.
```

---

## Prompt 04 — Transport correctness fixes (Phase 1 part)

```text
This is Prompt 04 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0 and Corrections C9, C11, C12, C13, C15, C16; the progress log (Prompts 01–03
DONE, including the post-review fixes); plan §3 (rows "Destination assignment", "Responder
pickup and transport lifecycle", "Authorization"), §7 (G3, G6, G8), §11 (POST/GET
/incidents/:id/transport), §12, §18 (Fix G8).
Also read: backend/src/incidents/transport/transport.service.ts and dto/*,
backend/src/incidents/incidents.controller.ts (the "---- Transport (MOD-40) ----" block ~line 557),
backend/src/incidents/incident-status/incident-status.service.ts (validateTransition only),
backend/src/incidents/incidents.service.ts (updateStatus ~line 518: the inline status write),
backend/src/responders/responders.service.ts (updateStatus ~line 364: the second inline copy),
backend/src/audit/audit.service.ts (logInTransaction ~line 34),
backend/src/hospitals/hospitals.service.ts (UNREVIEWED_STATUSES, memberOrgIds),
backend/src/organizations/org-scope.ts, backend/src/jobs/processors/eta-refresh.processor.ts,
shared/src/enums/incident-status.enum.ts (INCIDENT_STATUS_TRANSITIONS),
backend/test/incidents/transport.spec.ts, backend/test/locations/eta-refresh.spec.ts, and the
responder status tests (find them: grep -rl "updateStatus" backend/test tests/backend).

GOAL: existing transport data stops being wrong, without adding a third copy of any rule.
The single shared begin-transport path for the responder status endpoint comes later
(Prompt 08); here we fix startTransport itself and prepare the shared pieces.

1. One status-transition writer (Corrections C11). In IncidentStatusService add:
     statusTimestampFields(status, at): Partial<{ acknowledged_at, assessed_at, dispatched_at,
       en_route_at, on_scene_at, resolved_at, closed_at }>
       (the union of the two existing inline maps; TRANSPORTING/ASSISTING have no column)
     async recordTransition(tx: Prisma.TransactionClient, { incidentId, from, to, actorId,
       actorRole?, notes?, at = new Date() }): Promise<Incident>
       → validateTransition(from, to);
         tx.incident.update({ where: { id: incidentId, status: from }, data: { status,
           ...statusTimestampFields } })   ← the status condition refuses a concurrent change:
           catch Prisma P2025 (record not found) and throw ConflictException
           { code: 'INCIDENT_STATUS_CHANGED', message: 'The incident status changed. Refresh and try again.' };
         tx.incidentEvent.create({ from_status, to_status, triggered_by_id, triggered_by_role, notes });
         return the updated incident (IncidentsService.updateStatus returns this row today).
   Then replace the inline update + incidentEvent.create in IncidentsService.updateStatus and
   ResponderService.updateStatus with recordTransition. Keep everything else in those methods
   (the FALSE_ALERT row, dispatch completion, audit, realtime, notifications). ResponderService
   keeps its own pre-check that returns 409 "Cannot move incident from X to Y" before the
   transaction, so its error contract does not change. Their existing tests must stay green
   without weakening assertions. If IncidentStatusService is not injectable in RespondersModule,
   add the provider the way IncidentsModule does it.
   Scope (Correction C15): do NOT switch the other hand-written transition writes
   (IncidentsService.markFalseAlert, the duplicate merge, false-alerts.service.ts,
   dispatch.service.ts, emergency-alerts.service.ts, barangay-callback.service.ts). List them
   under Follow-ups in the progress log as "candidates for recordTransition".

1b. One "open transport" definition (Correction C16). Create
   backend/src/incidents/transport/open-transport.ts exporting
     openTransportWhere(extra?: Prisma.TransportRecordWhereInput): Prisma.TransportRecordWhereInput
     → { ...extra, arrived_at: null, incidents: { status: IncidentStatus.TRANSPORTING } }
   with a doc comment saying why (a transport on an incident resolved before arrival is not
   open). Use it for the startTransport "already has an open transport" check. Later prompts
   (07, 08, 09) must import it. No other file may write its own `arrived_at: null` open check.

2. One destination rule (Corrections C12). Create backend/src/hospitals/destination-rules.ts:
   - move UNREVIEWED_STATUSES there (export it) and import it back into hospitals.service.ts;
   - export assertSelectableDestination(prisma | tx, facilityId) → { id, name, receiving_status,
     warnings: 'FACILITY_AT_CAPACITY'[] }. Rules: exists, is_active, facility_type HOSPITAL,
     location_status not in UNREVIEWED_STATUSES → else BadRequestException with a clear message.
     receiving_status CLOSED or AT_CAPACITY → allowed, warnings ['FACILITY_AT_CAPACITY'].
   Use it in startTransport, updateTransport and recordArrival, replacing their three copies of
   the is_active check. No other module may redefine the status list.

3. One membership helper (Corrections C13). Move HospitalsService.memberOrgIds into
   backend/src/organizations/org-scope.ts as `activeMemberOrgIds(prisma, userId)` and use it from
   HospitalsService (all current callers) and TransportService.

4. startTransport preconditions and ordering (fixes G6):
   - Allowed incident statuses: ON_SCENE (will transition) or TRANSPORTING (additional
     unit/patient; no transition, so do NOT call validateTransition for it). Anything else →
     ConflictException { code: 'TRANSPORT_NOT_ALLOWED_IN_STATUS', status }. ASSISTING is
     therefore rejected (the lifecycle forbids ASSISTING → TRANSPORTING); delete `transitionable`.
   - All checks (incident status, dispatch belongs to incident, crew, open-transport conflict,
     destination via assertSelectableDestination) run BEFORE any write.
   - One prisma.$transaction: transportRecord.create, recordTransition (only when ON_SCENE),
     and audit.logInTransaction for the transport row (fail-closed, like the existing
     duty-availability pattern). Keep the existing 409 for an already-open transport on the
     dispatch (Prompt 08 revisits it).
   - After commit only: realtime.statusChanged (only when the status moved) and
     incidentTransporting. Use the existing payloads; Prompt 06 trims patientId.
   - Response: the record plus `warnings` (empty array when none). This is additive for the
     mobile caller (mobile/src/services/api/transport.api.ts): check its type and add the
     optional field there only if TypeScript requires it.

5. listTransports scope (fixes G8):
   - Controller passes req.user (id + role) to listTransports.
   - HOSPITAL_USER: only transports whose destination facility's organization_id is in
     activeMemberOrgIds; if that leaves none → ForbiddenException (do not leak existence).
     Other allowed roles: unchanged.
   - Extend the `facilities` select with latitude, longitude (Decimal → number in the response),
     location_status, receiving_status. Never select `location`.

6. ETA processor interim fix (fixes G3 until Prompt 07):
   - Only remove the transportRecord.updateMany write of the scene-route ETA, leaving the comment
     "Prompt 07 writes estimated_arrival_at only for the TO_FACILITY leg". Everything else
     (dispatch-status skip, freshest fix, responder.eta_updated emit) is unchanged.

7. Tests (write the failing test first for each bug, then fix). The transport.spec.ts Prisma mock
   has no $transaction: add `$transaction: jest.fn((fn) => fn(mockPrisma))` plus the
   incidentEvent / auditLog delegates that recordTransition and logInTransaction need.
   - startTransport on EN_ROUTE → 409 TRANSPORT_NOT_ALLOWED_IN_STATUS; on ASSISTING → 409 AND
     transportRecord.create never called.
   - ON_SCENE → record + incident status TRANSPORTING + IncidentEvent written inside the
     transaction; statusChanged emitted after commit.
   - Rollback: if recordTransition throws inside the transaction, no emit happens and the error
     propagates.
   - TRANSPORTING (second unit) → record created, no transition, no statusChanged.
   - Destination EVACUATION_CENTER → 400; PENDING_REVIEW → 400; AT_CAPACITY → success with
     warnings ['FACILITY_AT_CAPACITY']; same rule enforced in updateTransport and recordArrival.
   - listTransports: HOSPITAL_USER of destination org → rows with numeric lat/lng; other org → 403;
     DISPATCHER → all rows.
   - recordTransition unit test: timestamp column set for ON_SCENE/RESOLVED, none for TRANSPORTING,
     invalid transition throws before any write; returns the updated incident; a P2025 from the
     status-conditioned update → 409 INCIDENT_STATUS_CHANGED and no incidentEvent written.
   - IncidentsService.updateStatus still returns the updated incident.
   - openTransportWhere: a record with arrived_at null on a RESOLVED incident does not block a
     new start; one on a TRANSPORTING incident does (409).
   - ETA processor no longer calls transportRecord.updateMany.
   - Existing IncidentsService / ResponderService status tests still pass unchanged in intent.

VERIFICATION: cd backend && npx jest --config ./test/jest.config.ts test/incidents test/locations
test/hospitals test/responders && pnpm typecheck && pnpm lint && pnpm test (compare failures with
the Prompt 00 baseline: barangay-notify and the auth timeout flake are pre-existing).
Duplication check, paste the output of:
  grep -rn "PENDING_REVIEW" backend/src   (only destination-rules.ts plus DTO/enum usages)
  grep -n "incidentEvent.create" backend/src/incidents/incidents.service.ts backend/src/responders/responders.service.ts
  (expected: no hit inside updateStatus in either file; the hits in incident creation,
  markFalseAlert and the duplicate merge remain — they are the C15 Follow-up, not a regression)
  grep -rn "arrived_at: null" backend/src   (only open-transport.ts)
Write the end-of-prompt report (§0). STOP.
```

---

## Prompt 05 — Hospital registry UI: coordinates, map pin, status, verify (Phase 1 UI)

```text
This is Prompt 05 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0; the progress log; plan §9.4, §11 (/hospitals contracts), §16 item 6.
Also read: frontend/app/(ops)/hospitals/page.tsx (CreateHospitalDialog, canCreate ~line 287),
frontend/features/hospitals/{api,hooks}.ts, frontend/components/incidents/IncidentMapView.tsx
(how react-map-gl/MapLibre and the map style are set up), frontend/lib/bocaue-geo.ts,
frontend/components/map/* (marker style), and any existing frontend tests for hospitals.

GOAL: an authorized user can give a hospital validated coordinates by typing them or by
placing a pin, see its location status, and (Supervisor/System Admin) verify or reject it.
No "Find location" search yet (Prompt 14).

1. features/hospitals/api.ts: extend the Hospital type with latitude, longitude (number|null),
   location_status, location_source, last_verified_at, address, province. Add
   setHospitalLocation(id, body) → PATCH /hospitals/:id/location and
   verifyHospitalLocation(id, body) → POST /hospitals/:id/location/verify.
   Add createHospital fields address, province, organizationId?, location?.
   hooks.ts: mutations that invalidate the hospitals list query on success.
   Surface API error codes (COORDINATES_LIKELY_SWAPPED with the suggestion, 
   COORDINATES_OUT_OF_SERVICE_AREA, DUPLICATE_FACILITY with existingName) as readable
   messages. For the swap error, offer a one-click "Use suggested coordinates".

2. New component frontend/components/hospitals/HospitalLocationPicker.tsx:
   - Latitude and longitude number inputs (labelled, 7 decimals max) + a small MapLibre map
     using the same style source as IncidentMapView. Click/drag sets a marker and fills
     the inputs; typing moves the marker. Initial view: Bocaue.
   - Show "Latitude, Longitude" order explicitly next to the inputs.
   - Accessible: inputs work without the map (keyboard-only path).
   - Reuse the existing marker visual language (frontend/components/map/*). If a hospital
     marker does not exist yet, create frontend/components/map/HospitalMarker.tsx here
     (it is reused in Prompt 12).

3. Hospitals page:
   - CreateHospitalDialog: add Address, Province (default "Bulacan"), and the location picker
     (optional). Keep canCreate for SYSTEM_ADMINISTRATOR; ALSO allow ORG_ADMINISTRATOR when
     the user belongs to an org with organization_type HOSPITAL (find how the frontend knows
     the user's orgs — auth store / profile query; if it cannot know, show the button to
     ORG_ADMINISTRATOR and let the API 403). Org Admin dialog requires choosing their org
     and shows "Will be reviewed by MDRRMO before ambulances can select it."
   - Each hospital row/card shows a location status badge: Unverified (grey),
     Pending review (amber), Verified (green), Rejected (red), plus coordinates when set.
   - "Set location" action (System Admin, Supervisor, Org Admin for own org) opens the picker
     prefilled and calls setHospitalLocation with source 'manual' and optional reason.
   - "Verify / Reject" action (Supervisor, System Admin) on PENDING_REVIEW or UNVERIFIED-with-
     coordinates rows, with an optional note.
   - Fetch the list with includeUnreviewed=true for roles that may see it.

4. Tests: add or extend a frontend Jest test for the API error-message mapping (swap
   suggestion, duplicate) and for badge selection by status. Keep tests pure where possible.

VERIFICATION: cd frontend && pnpm typecheck && pnpm lint && pnpm test. Then run the frontend
against the local backend, sign in as the seeded System Administrator (see docs/USER_ACCOUNTS.md),
and confirm: Joni Villanueva shows "Verified" with 14.7967900, 120.9435800; setting a swapped
pair shows the suggestion. Record what you saw (no screenshots of secrets).
Write the end-of-prompt report (§0). STOP. (This completes plan Phase 1.)
```

---

## Prompt 06 — Shared event contracts and realtime emitters (Phase 2 start)

```text
This is Prompt 06 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0 and Corrections C17, C18 (and the reporter destination rule table under
them); the progress log (Phase 1 prompts 01–05 must be DONE);
plan §8, §11 (tracking/:incidentId/latest contract), §12 (Leg row), §14, §17.
Also read: shared/src/events/{incident,responder,index,websocket-event.types}.ts,
shared/src/maps/map.types.ts, backend/src/realtime/realtime.service.ts (MOD-40 block ~line 171,
notifyEtaUpdated ~line 320), backend/src/realtime/agap.gateway.ts (emitToOps/emitToIncident/
emitToUser), backend/test/realtime/*.

GOAL: typed contracts and emitter methods exist, additive only. Nothing calls the new emitters
yet except where this prompt says.

1. shared/src/maps/map.types.ts — add:
   export type TransportLeg = 'TO_SCENE' | 'TO_FACILITY' | 'AT_FACILITY';
   export interface TransportDestinationView { kind: 'FACILITY'; name: string;
     latitude: number | null; longitude: number | null; locationVerified: boolean; }
   export interface RouteSnapshot { geometry: [number, number][]; distanceMeters: number | null;
     durationSeconds: number | null; isEstimate: true; calculatedAt: string; stale: boolean; }

2. shared/src/events/incident.events.ts:
   - INCIDENT_EVENTS.TRANSPORT_UPDATED = 'incident.transport_updated'
   - IncidentTransportUpdatedPayload { incidentId; dispatchId; transportId;
       destination: (TransportDestinationView & { id?: string }) | null;
       destinationWarning?: 'FACILITY_DEACTIVATED' | 'FACILITY_AT_CAPACITY'; changedAt: string }
   - IncidentTransportingPayload: make patientId OPTIONAL (ops copy only) and add
     optional `destination?: TransportDestinationView | null`.
   - IncidentFacilityArrivalPayload: add optional dispatchId.
3. shared/src/events/responder.events.ts:
   - RESPONDER_EVENTS.ROUTE_UPDATED = 'responder.route_updated'
   - ResponderRouteUpdatedPayload { incidentId; dispatchId; leg: TransportLeg;
       destination: TransportDestinationView | null; route: RouteSnapshot | null }
4. Register the new event names wherever the event-name union / AgapEventName is built
   (websocket-event.types.ts / index.ts), so emit() accepts them.

5. backend/src/realtime/realtime.service.ts — add, in the MOD-40 block, using this.safe(...):
   - transportUpdated(payload, userIds: string[]): ops → emitToOps(full payload); userIds →
     emitToUser for each (deduplicated) with destination.id removed. It NEVER emits to the
     incident room (Correction C18: a destination change only exists on the hospital leg).
   - routeUpdated(payload, audience) where audience is { incidentRoom: boolean; userIds: string[] }.
     Ops always receives the full payload. incidentRoom → emitToIncident(payload). userIds →
     emitToUser for each (deduplicated). Callers pass incidentRoom: true only for leg TO_SCENE;
     Prompt 09 fills userIds. Add a doc comment stating this rule.
   - incidentTransporting: full payload to ops. To the incident room send a STATUS-ONLY copy:
     { incidentId, transportId, dispatchId, transportStartedAt } — no patientId, destinationId,
     destinationName or destination (Correction C18; fixes the patientId leak and the
     destination leak now). Make destinationId/destinationName optional in the shared type if
     TypeScript needs it for the reduced copy.
   - facilityArrival: full payload to ops; incident-room copy without destinationId.
   - Before trimming, grep frontend/ and mobile/ for destinationName, destinationId and the
     TRANSPORTING / FACILITY_ARRIVAL event constants. If a client reads a removed field from the
     incident-room copy, record it in the progress log (staff clients are in ops:all and still get
     the full payload). Do not keep a field in the incident-room copy for a client's sake.
6. Tests (backend/test/realtime/…): incident-room copies of incident.transporting and
   incident.facility_arrival contain none of patientId, destinationId, destinationName,
   destination (serialize to JSON and assert); ops copies keep them; transportUpdated never calls
   emitToIncident and strips destination.id for user rooms; routeUpdated emits to each userId
   once and to the incident room only when incidentRoom is true.

VERIFICATION: pnpm --filter @agap/shared build && pnpm --filter @agap/shared typecheck;
cd backend && npx jest --config ./test/jest.config.ts test/realtime && pnpm typecheck && pnpm test;
cd frontend && pnpm typecheck; cd mobile && pnpm typecheck (additive types must not break clients).
Write the end-of-prompt report (§0). STOP.
```

---

## Prompt 07 — Transport leg service, route cache and leg-aware ETA job

```text
This is Prompt 07 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0 and Corrections C4, C9; the progress log; plan §8, §12 (Leg row),
§13.2, §14 (fallback paragraph), §21 Phase 2 (feature flag).
Also read: backend/src/jobs/processors/eta-refresh.processor.ts, backend/src/jobs/jobs.module.ts,
backend/src/locations/locations.service.ts (trackResponder enqueue ~lines 163–245,
ETA_REFRESH_THROTTLE_MS), backend/src/locations/maps/{maps.service,interfaces}.ts,
backend/src/locations/maps/providers/osrm-routing.provider.ts (does route() return geometry?),
backend/src/auth/sessions/session-revocation.service.ts (Redis pattern),
backend/src/config/config.validation.ts, .env.example, backend/test/locations/eta-refresh.spec.ts.

GOAL: the server knows where each dispatch is heading now, routes there, caches the route
and pushes it. Clients are not changed yet.

1. Config: add TRANSPORT_ROUTING_ENABLED (boolean, default true) to config.validation.ts and
   .env.example (with a one-line comment). When false, the processor behaves exactly as after
   Prompt 04 (scene route, no route events, no cache).

2. New backend/src/incidents/transport/transport-leg.service.ts (provided by IncidentsModule
   or wherever TransportService is provided; export it so JobsModule/LocationsModule can use it
   — check module imports for cycles and use the existing pattern, e.g. forwardRef, only if needed):
   resolve(dispatchId) → {
     leg: TransportLeg;
     target: { lat, lng } | null;          // scene coords for TO_SCENE, facility coords for TO_FACILITY, null for AT_FACILITY or unknown
     destination: TransportDestinationView | null;
     transportId: string | null;
     incidentId: string;
   }
   Rules ("open" means openTransportWhere() from Prompt 04 — Correction C16; do not write a new check):
   - Open transport for the dispatch with a destination that has coordinates
     → TO_FACILITY, target = facility coords, locationVerified = location_status === 'VERIFIED'.
   - Open transport with no destination, or a destination without coordinates → leg TO_FACILITY
     but target null (route null; clients show "destination not set / location not verified").
   - Latest transport for the dispatch has arrived_at and incident not RESOLVED/CLOSED → AT_FACILITY, target null.
   - Otherwise → TO_SCENE, target = incident_locations lat/lng (null if missing).
   One query with selects; Decimal → number.

3. New backend/src/locations/route-cache.service.ts (LocationsModule, exported):
   - Own ioredis client from REDIS_URL, the same fail-open style as SessionRevocationService
     (short timeout, warn once, never throw).
   - get(dispatchId), set(dispatchId, snapshot, ttlSeconds = 120), clear(dispatchId).
     Key: route:dispatch:{dispatchId}. Value: { leg, destination, route: RouteSnapshot, fromFix }.
   - onModuleDestroy closes the client.

4. MapsService/route geometry: confirm MapsService.route returns geometry as [lng,lat][]
   (OSRM overview=full&geometries=geojson). If it does not expose geometry, add it to the
   return type without changing other callers' behaviour. Add a pure helper
   simplifyLine(points, maxPoints = 300) (Douglas–Peucker or a simple tolerance loop) in
   backend/src/locations/maps/ (name it for what it does) with a unit test.

5. EtaRefreshProcessor:
   - EtaRefreshJobData: keep existing fields (old jobs in Redis must still parse); add optional
     `reason?: 'fix' | 'transport_started' | 'destination_changed' | 'facility_moved' | 'arrived'`.
   - At run time call TransportLegService.resolve(dispatchId) (the job's incidentLat/Lng are only
     a fallback when the flag is off).
   - Keep the dispatch-status skip and freshest-fix logic (Corrections C9).
   - target null → clear the cache, emit routeUpdated with route null, return.
   - Otherwise route(from, target). On success: build RouteSnapshot (simplified geometry,
     stale false), set cache, emit realtime.routeUpdated(...) with audience
     { incidentRoom: leg === 'TO_SCENE', userIds: [] } (Prompt 09 adds crew/reporter user rooms;
     the hospital leg never reaches the shared incident room, even before Prompt 09),
     and keep notifyEtaUpdated for compatibility.
   - Write transport_records.estimated_arrival_at ONLY when leg = TO_FACILITY, only for the open
     transport id (fixes G3 fully).
   - On routing failure: if a cached route exists and is < 120 s old, re-emit it with stale: true;
     otherwise emit route null. Never throw (Reliability Rules).

6. Immediate refresh helper: add to LocationsService (or a small dedicated EtaRefreshScheduler in
   locations, whichever matches the code better) `requestImmediateRefresh(dispatchId, incidentId, reason)`
   that enqueues 'eta-refresh' with a distinct jobId `eta-now-{dispatchId}-{Date.now()}` (no dedup),
   so the throttle cannot swallow it. Prompt 08 calls it.

7. Tests:
   - New backend/test/incidents/transport-leg.spec.ts: the four leg cases above, facility without
     coordinates, unverified facility.
   - Update backend/test/locations/eta-refresh.spec.ts: routes to hospital when a transport is
     open; writes estimated_arrival_at only on TO_FACILITY; destination changed between enqueue
     and run uses the new target; AT_FACILITY clears cache and emits route null; routing failure
     with fresh cache → stale re-emit; flag off → old behaviour.
   - RouteCacheService: Redis error → get returns null, set does not throw (mock ioredis).

VERIFICATION: cd backend && npx jest --config ./test/jest.config.ts test/incidents test/locations
test/jobs test/maps && pnpm typecheck && pnpm lint && pnpm test.
Write the end-of-prompt report (§0). STOP.
```

---

## Prompt 08 — Single `beginTransport` path, RESOLVED guard, referral sync, `transport_updated`

```text
This is Prompt 08 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0; the progress log; plan §4 (step 4), §11 (PATCH /responders/assignments
contract), §12 (Single entry path, Destination change, Hospital deactivated).
Also read: backend/src/responders/responders.service.ts (status map ~lines 45–70, the update
assignment status method, the RESOLVED branch ~line 394), backend/src/incidents/transport/
transport.service.ts (after Prompt 04), transport-leg.service.ts, backend/src/hospitals/
hospitals.service.ts (markArrived, setLocation hook, update), tests/backend/responders.service.spec.ts
and whatever runs it (see progress log Prompt 00), backend/test/incidents/transport.spec.ts.

GOAL: one way into TRANSPORTING, no incident left TRANSPORTING without a record, no resolve
before arrival, and every destination change reaches viewers.

1. TransportService.beginTransport(tx, { incidentId, dispatchId, actor, destinationId?, patientId? }):
   the internal core extracted from startTransport (Prompt 04 logic): lock the incident row
   (SELECT ... FOR UPDATE via tx.$queryRaw), assert status ON_SCENE/TRANSPORTING, assert crew
   for responders, upsert the open record for the dispatch (return the existing one if open —
   when a destinationId is passed and the open record has none, set it), transition when
   ON_SCENE via IncidentStatusService.recordTransition (Prompt 04), validate destinations via
   assertSelectableDestination (Prompt 04), audit via logInTransaction. Do not write a new copy
   of any of these. Returns { record, statusChanged, warnings }.
   startTransport becomes: $transaction(beginTransport) → post-commit emits → immediate refresh
   (Prompt 07 helper, reason 'transport_started').
   Keep the existing 409 "already has an open transport" behaviour for the REST start when a
   record is already open AND a different destination was requested? Decide by reading the
   mobile caller (mobile/src/services/api/transport.api.ts + assignment screen): the mobile app
   calls POST /transport after PATCH status TRANSPORTING. After this change the PATCH already
   created the record, so POST must NOT 409 in that case — it should set the destination on the
   open record (idempotent) and return it. Document the decision in the progress log.

2. ResponderService status update:
   - TRANSPORTING: run the incident transition and beginTransport in the same transaction (or call
     beginTransport, which performs the transition) so the record exists even if the picker is
     cancelled. Notifications/IncidentEvent behaviour must stay as today (check the existing tests).
   - RESOLVED by a RESPONDER while the dispatch has an open transport (openTransportWhere from
     Prompt 04 — Correction C16) → 409 { code: 'TRANSPORT_OPEN' }. Dispatcher/Supervisor
     resolution paths are unaffected (dispatcher override); after such an override the record is
     no longer "open" by definition, so no later prompt treats it as live.

3. Arrival: recordArrival also stamps facility_referrals.patient_arrived_at for the open referral
   with the same incident + facility (+ dispatch when set) and patient_arrived_at null, in the same
   transaction. Emit facilityArrival with dispatchId. Clear the route cache and request an
   immediate refresh (reason 'arrived') so viewers see AT_FACILITY. If HospitalsService.markArrived
   has side effects (notifications), reuse them rather than duplicating.

4. Destination change (updateTransport with destinationId): after commit emit
   realtime.transportUpdated(payload, []) (destination view + warning FACILITY_AT_CAPACITY when
   relevant; ops only for now — Prompt 09 adds the crew/confirmed-reporter user rooms; it never
   goes to the incident room, Correction C18),
   clear the route cache, request an immediate refresh (reason 'destination_changed').
   Replace the old generic incidentUpdated({transportUpdated}) only if no client depends on it
   (grep frontend/ and mobile/ for "transportUpdated"); otherwise keep both and add a Follow-up.

5. Facility side effects (implement the Prompt 03 hook):
   - setLocation on a facility that is the destination of open transports → for each:
     transportUpdated + immediate refresh (reason 'facility_moved').
   - Facility deactivated (update with is_active false, wherever that happens — find it) →
     transportUpdated with destinationWarning 'FACILITY_DEACTIVATED' for each open transport. Never
     cancel or modify the transport (Reliability Rules).
   Avoid a circular import between HospitalsModule and IncidentsModule: put a small query method
   in TransportService (findOpenTransportsForFacility, built on openTransportWhere) and inject it where needed using the
   repo's existing module pattern; if a cycle is unavoidable, emit a Nest EventEmitter event only
   if @nestjs/event-emitter is already installed — otherwise use forwardRef and note it.

6. Tests (backend/test/incidents/transport.spec.ts, a responders spec under backend/test/ —
   create backend/test/responders/transport-status.spec.ts if the root tests/ file is not run):
   - PATCH status TRANSPORTING creates an open record with destination null.
   - Following POST /transport with destinationId sets the destination on that record (no 409,
     no second record).
   - Responder RESOLVED with open transport → 409 TRANSPORT_OPEN; after arrival → OK.
   - Arrival stamps the matching referral; non-matching referral untouched.
   - Destination change emits transportUpdated and requests an immediate refresh.
   - Facility moved / deactivated → transportUpdated for each open transport; transport rows unchanged.
   - Rollback: failure inside beginTransport leaves no record and no status change.

VERIFICATION: cd backend && npx jest --config ./test/jest.config.ts test/incidents test/hospitals
test/responders test/locations && pnpm typecheck && pnpm lint && pnpm test (and the root tests/
command recorded in Prompt 00, if any).
Write the end-of-prompt report (§0). STOP.
```

---

## Prompt 08B — Crew-confirmed reporter-patient flag (schema + endpoint)

```text
This is Prompt 08B of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0 and Corrections C1 (hand-written migration style), C16, C17 and the
reporter destination rule table; the progress log (Prompt 08 DONE); plan §17.
Also read: backend/prisma/schema.prisma (model TransportRecord, model IncidentReporter,
model incident_patients), the latest migration folder
(backend/prisma/migrations/20261025120000_facility_coordinates — copy its style, including
down.sql), backend/src/incidents/transport/transport.service.ts (after Prompt 08),
backend/src/incidents/incidents.controller.ts (Transport block), backend/test/incidents/transport.spec.ts.

GOAL: the crew on a transport can record, with an audit trail, that the person they are carrying
is the registered reporter. This is the ONLY thing that may unlock the destination for a
reporter (Prompt 09 enforces it). The reporter's self-claim never unlocks it.

1. Migration <timestamp>_transport_reporter_patient_confirmation (hand-written SQL + down.sql)
   and matching schema.prisma fields on TransportRecord:
     reporter_patient_confirmed_at    TIMESTAMPTZ NULL
     reporter_patient_confirmed_by_id UUID NULL REFERENCES users(id) ON DELETE SET NULL
     CHECK ((reporter_patient_confirmed_at IS NULL) = (reporter_patient_confirmed_by_id IS NULL))
   Add the back-relation on User. Run prisma validate, migrate dev (local only), generate, and
   `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → empty.
   Probe the CHECK inside a rolled-back transaction.

2. TransportService:
   - confirmReporterIsPatient(incidentId, transportId, actor, confirmed: boolean).
     Who: crew of the transport's dispatch (reuse assertCrew), DISPATCHER, SUPERVISOR.
     Rules: the transport must be open (openTransportWhere) and belong to the incident; the
     incident must have a registered reporter (incident_reporters.user_id not null) → otherwise
     400 "This report was sent without an account, so there is no reporter to share with."
     confirmed true → set both columns (now, actor); false → clear both.
     One $transaction: update + audit.logInTransaction (action UPDATE, entityType
     'TransportRecord', moduleId 'MOD-40', old/new confirmed flag; never patient names).
   - listTransports adds per record: reporter_patient_confirmed_at, and reporterClaimsPatient
     (boolean: any incident_patients row on the incident has is_reporter = true, or
     incident_reporters.reporter_status = 'NEEDS_HELP'). It is a hint for the crew only and is
     labelled as the reporter's own claim in the response type's comment.
3. Controller: PATCH /incidents/:id/transport/:tid/reporter-patient { confirmed: boolean }
   (DTO with class-validator), roles RESPONDER, DISPATCHER, SUPERVISOR.
4. Tests (backend/test/incidents/transport.spec.ts or a new reporter-patient.spec.ts):
   crew confirm sets both columns + audit in the transaction; unconfirm clears both; non-crew
   responder → 403; guest report (no reporter user) → 400; closed transport → 400/409 per the
   existing style; listTransports exposes the two fields and never a patient name for this hint.

VERIFICATION: cd backend && npx prisma validate && npx jest --config ./test/jest.config.ts
test/incidents && pnpm typecheck && pnpm lint && pnpm test. Paste the empty migrate diff line.
Write the end-of-prompt report (§0). STOP.
```

---

## Prompt 09 — Locations: service-area fixes, extended tracking seed, reporter privacy

```text
This is Prompt 09 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0 and Corrections C5, C6, C16, C17, C18 and the reporter destination rule
table; the progress log (Prompt 08B DONE); plan §7 (G4, G5),
§11 (tracking/:incidentId/latest, /locations/route, /locations/track), §14, §17 (whole
"Destination visibility rule"), §18.
Also read: backend/src/locations/locations.service.ts (assertBocaueCoordinate and all callers,
getLatestUnitPositions, estimateEta), backend/src/responders/responders.service.ts pushLocation
(~line 531), backend/src/realtime/{realtime.service,incident-participant.service,agap.gateway}.ts,
backend/test/locations/{location-bounds,live-tracking}.spec.ts.

GOAL: tracking keeps working when a transport leaves Bocaue, every viewer gets the same server
route, and a reporter who is not the patient never learns the destination.

1. Geofence (fixes G4):
   - capture() and reverseGeocode() stay Bocaue-only (incident intake).
   - getRouteBetween: both endpoints must be in the SERVICE AREA (isCoordinateInServiceArea).
   - trackResponder and responders pushLocation: inside Bocaue → accept (as today). Outside Bocaue
     but inside the service area → accept ONLY if the user is crew on a dispatch with an open
     transport (openTransportWhere from Prompt 04 — Correction C16). Otherwise keep today's 400.
     Put the "crew has an open transport" query in one place and reuse it from both callers.

2. Audience rule (Corrections C6, C17, C18; plan §17). Add a method in IncidentParticipantService
   (or a small new TransportAudienceService beside it) that returns, per dispatch:
   { reporterUserId: string | null;          // incident_reporters.user_id; null for guests
     crewUserIds: string[];
     reporterConfirmedPatient: boolean }     // the dispatch's latest transport (open or arrived)
                                             // has reporter_patient_confirmed_at set (Prompt 08B)
   The reporter's own claim (is_reporter, reporter_status) is NOT an input. Never use it here.
   Then:
   - leg TO_SCENE: unchanged — responder.location_updated / route_updated / eta_updated go to
     ops + incident room.
   - leg TO_FACILITY or AT_FACILITY for that dispatch: responder.location_updated,
     responder.route_updated, responder.eta_updated and incident.transport_updated go to
     ops + user:{crewUserIds} + (reporterConfirmedPatient && reporterUserId ? user:{reporterUserId}
     : nobody). The incident room receives none of them for that dispatch.
   - incident.transporting and incident.facility_arrival: the incident room keeps the status-only
     copy from Prompt 06. When reporterConfirmedPatient, ALSO send the full reporter-safe copy
     (destination view, no patientId) to user:{reporterUserId}.
   - When the crew confirms or unconfirms (Prompt 08B endpoint), clear the audience cache entry
     for that incident and request an immediate refresh (Prompt 07 helper) so the reporter's view
     switches within seconds.
   Implement by passing the audience into the Prompt 06 emitters from the ETA processor,
   trackResponder/pushLocation (location emits) and TransportService emits. Cache the audience
   lookup per incident briefly (in-memory Map with ~10 s TTL) to avoid a query per GPS fix.
   Push notifications: check backend/src/notifications/incident-status-notifier.ts. The reporter's
   TRANSPORTING text is status-only today ("… is transporting the patient for {ref}"); add a test
   that it never contains a facility name, so a future edit cannot leak it.

3. GET /locations/tracking/:incidentId/latest (getLatestUnitPositions):
   - Authorization unchanged (assertParticipant).
   - For each unit add leg, destination and route (from RouteCacheService; on cache miss and
     leg TO_SCENE with a fix, fall back to the existing inline estimateEta and route; on cache
     miss for TO_FACILITY, return route null — the next job fills it). Fixes C5.
   - If the actor is the reporter (not staff, not crew) and the unit's leg is
     TO_FACILITY/AT_FACILITY and reporterConfirmedPatient is false for that unit's dispatch:
     return position null, route null, destination null, eta { seconds: null, isEstimate: true,
     calculatedAt: null }, and leg as-is. Server-side, not a client filter. This includes a
     reporter who ticked "I am the patient" but was not confirmed by the crew.
   - Never include patientId, patient names, assessment or responder names.
   Update the LatestUnitPosition type and the shared/mobile/frontend type mirrors if they exist
   (grep for 'LatestUnitPosition' and 'speedKmh').

4. Tests:
   - location-bounds.spec.ts: outside Bocaue + inside service area + open transport → accepted;
     without open transport → 400; outside service area → 400; route endpoint uses service area.
   - live-tracking.spec.ts (or a new backend/test/locations/transport-privacy.spec.ts):
     crew-confirmed reporter gets destination/route on TO_FACILITY and AT_FACILITY for that
     dispatch only; bystander reporter gets nulls; reporter with is_reporter = true but NOT
     confirmed gets nulls; with two dispatches to two hospitals and the reporter confirmed on one,
     the other unit is redacted; staff and crew get full data; no payload/response contains
     patientId or patient_name (serialize to JSON and assert with a regex).
   - Emit routing: on TO_FACILITY nothing is emitted to the incident room for that dispatch;
     crew user rooms receive it; an unconfirmed reporter's user room does not; a confirmed
     reporter's does; incident-room transporting/facility_arrival stay status-only.
   - Guest report (incident_reporters.user_id null): no user-room emit is attempted for a reporter.
   - Confirm/unconfirm clears the audience cache (next emit uses the new audience).

VERIFICATION: cd backend && npx jest --config ./test/jest.config.ts test/locations test/realtime
test/incidents && pnpm typecheck && pnpm lint && pnpm test.
Manual (local): with a Socket.io test client as ops and a seeded transport to Joni Villanueva,
record a responder.route_updated payload whose last coordinate ≈ [120.9436, 14.7968]
(acceptance for plan Phase 2).
Write the end-of-prompt report (§0). STOP. (This completes plan Phase 2.)
```

---

## Prompt 10 — Mobile responder UI (Phase 3)

```text
This is Prompt 10 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
GATE: the progress log must show Phase 2 DONE (including Prompt 08B) and a note that the LGU Data
Protection Officer confirmed the plan §17 / Correction C17 rule (or the user explicitly waived it
in this session). If not, STOP.
First read: CLAUDE.md; §0 and Correction C17 with its rule table; the progress log; plan §13.1
(turn-by-turn paragraph), §15, §17, §19 (GPS-unavailable row).
Also read: mobile/app/responder/assignment/[id].tsx (useRouteLine ~line 127, NavigateButton ~line 410,
transport card, destination picker flow), mobile/app/responder/map.tsx,
mobile/src/components/responder/{DestinationPicker,navigate-button}.tsx,
mobile/src/services/navigation/external-nav.ts, mobile/src/components/tracking/live-tracking-map.tsx,
mobile/src/hooks/{useRouteLine,useIncidentTracking,useResponderLocationShare}.ts,
mobile/src/services/api/{transport,locations}.api.ts, mobile/src/lib/assignment-progress.ts and its tests,
mobile/src/i18n/ (all new strings must be translatable — match how existing strings are added).

GOAL: during transport the responder sees and navigates to the hospital, not the scene.

1. API types: transport.api.ts and locations.api.ts gain latitude/longitude/location_status/
   receiving_status on facilities, and leg/destination/route on tracking units. Add
   getNearbyHospitals(lat, lng) → GET /hospitals/nearby.
2. Pure helper mobile/src/lib/transport-target.ts:
   selectRouteTarget({ status, myTransport, scene }) → { kind: 'SCENE'|'FACILITY'|'NONE', point, label, verified }.
   Unit-test it (open transport with coords → FACILITY; without coords → NONE with label; no transport → SCENE).
3. assignment/[id].tsx and map.tsx:
   - Prefer the server route for this dispatch (from useIncidentTracking seed + responder.route_updated);
     fall back to useRouteLine(myPoint, target.point) only when the server route is null.
   - During FACILITY: camera fits responder + hospital (not the scene); scene pin dimmed.
   - ETA chip: "{km} km • ~{min} min est. to {hospital}".
   - Banners: "Route unavailable — using last known" when route.stale; "Hospital location not verified"
     when verified is false; "Keep AGAP open during transport" while transporting (foreground GPS only).
4. LiveTrackingMap: new prop destination?: { lat; lng; label } | null rendering a hospital marker;
   when the destination or route is outside Bocaue, widen maxBounds to the service area
   (shared FACILITY_SERVICE_AREA bbox) instead of the Bocaue clamp. Build GeoJSON only through toLngLat.
5. NavigateButton: target the hospital during FACILITY ("Navigate to {hospital}"). Unverified/no coords →
   Google Maps search by hospital name + municipality, with the warning text.
6. DestinationPicker: server-sorted list from /hospitals/nearby using the responder's last fix (fallback
   /hospitals alphabetical); show "{x} km straight-line", receiving-status badge (Open / ER only /
   At capacity / Closed / Unknown) and "Location not verified" badge. Do not list PENDING_REVIEW/REJECTED
   (the API already filters — do not re-implement filtering beyond a defensive check). Keep "Decide later".
   Cancel no longer needs special handling (server creates the record); make sure the card shows
   "Destination not set" and the "Set destination" button calls PATCH update, not POST start.
   Show the FACILITY_AT_CAPACITY warning returned by the API.
7. Arrival: confirmation dialog before "Arrived at hospital"; after arrival show "Arrived {time} —
   complete handover, then Mark Resolved". assignment-progress.ts: while a transport is open, primary
   action is "Arrived at hospital"; Mark Resolved appears only after arrival. Handle 409 TRANSPORT_OPEN
   from the server with a readable message. Update its tests.
7b. Reporter-patient confirmation (Correction C17, Prompt 08B endpoint) on the transport card:
   - A switch "The person reporting this emergency is this patient", off by default.
     Only shown when the report came from a registered reporter (the API returns 400 for guest
     reports; hide the switch if the transport data says there is no registered reporter, or
     handle the 400 with the API's message).
   - When reporterClaimsPatient is true, show a hint under it: "The reporter said they are the
     patient. Confirm only if you have checked it is the same person." Never pre-enable the switch.
   - Turning it on asks for confirmation: "The reporter will see which hospital you are going to."
     Calls PATCH /incidents/:id/transport/:tid/reporter-patient { confirmed }. Turning it off needs
     no dialog. Show errors with the API message.
   - Add the call to transport.api.ts and the two fields to its types.
   - Pure helper (e.g. in transport-target.ts or a small reporter-patient.ts):
     shouldShowReporterPatientSwitch(transport) — unit-test it.
8. useIncidentTracking: handle responder.route_updated and incident.transport_updated by patching the
   ['incident-tracking-latest', id] cache (same pattern as location/ETA); add a 15 s REST poll only
   while the socket is disconnected; treat routes with calculatedAt older than 120 s as "last known"
   (dimmed). Update mobile/src/lib/__tests__/incident-tracking.test.ts.

VERIFICATION: cd mobile && pnpm typecheck && pnpm lint && pnpm test.
Device check (Android dev build — MapLibre does not run in Expo Go) following plan Table E
"Responder" rows; record each row PASS/FAIL. If no device is available, say so and list the rows
as NOT RUN.
Write the end-of-prompt report (§0). STOP.
```

---

## Prompt 11 — Mobile citizen tracking UI (Phase 3)

```text
This is Prompt 11 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0 and Correction C17 with its rule table; the progress log (Prompt 10 DONE);
plan §17 (all of it), §20 Scenario C.
Also read: mobile/app/tracking/[id].tsx (route ~line 94, the `arrived` logic that treats TRANSPORTING
as "Responders on scene"), mobile/src/hooks/useIncidentTracking.ts (after Prompt 10),
mobile/src/components/tracking/live-tracking-map.tsx, mobile/src/services/api/locations.api.ts,
mobile/src/i18n/. Do NOT change mobile/app/emergency/transmission.tsx.

GOAL: the reporter sees transport progress that is correct and privacy-safe. The server already
redacts (Prompt 09); the client must render both shapes gracefully.

1. useIncidentTracking returns, per unit, leg, destination and routeGeometry (already seeded/patched
   after Prompt 10). Add a derived `transportView` for the screen:
   - 'TO_SCENE' (existing UI)
   - 'TO_FACILITY_VISIBLE' (destination present)
   - 'TO_FACILITY_REDACTED' (leg TO_FACILITY but destination/position null)
   - 'AT_FACILITY_VISIBLE' / 'AT_FACILITY_REDACTED'
   - 'COMPLETE' (RESOLVED/CLOSED)
   Put the derivation in a pure function in mobile/src/lib/ and unit-test every branch.
2. tracking/[id].tsx:
   - Replace the "Responders on scene" card during TRANSPORTING:
     VISIBLE → "Being taken to {hospital}" + "~{min} min (estimate)", ambulance marker, route line,
     hospital marker, own scene pin stays.
     REDACTED → "The patient is being taken to a hospital." No map route, no ambulance marker, no name.
     Add a short line: "For details, contact MDRRMO" with the existing hotline call action if one exists.
   - AT_FACILITY → "Arrived at {hospital}" (visible) or "The patient has arrived at a hospital" (redacted).
   - RESOLVED/CLOSED → existing "Response complete" card.
   - Never render patient name, age, sex, assessment, triage or referral details (they are not in the
     payload; do not add them).
   - The client never decides visibility. Do NOT use the reporter's own "I am the patient" answer to
     show anything; render VISIBLE only when the server sent a destination.
3. All new strings through i18n (English + the existing second language file; if a translation is not
   known, copy English and add a Follow-up).

VERIFICATION: cd mobile && pnpm typecheck && pnpm lint && pnpm test.
Device check for plan Table E "Citizen" rows, with three registered reporters: a bystander; one who
ticked "I am the patient" but was NOT confirmed by the crew; one the crew confirmed (Prompt 10
switch). Inspect the WS frames/REST response in dev tools or logs and confirm the first two get no
destination/position/route after transport starts and the third does. Record PASS/FAIL/NOT RUN per row.
(Guests have no tracking screen; nothing to check for them here.)
Write the end-of-prompt report (§0). STOP.
```

---

## Prompt 12 — Dispatcher dashboard UI (Phase 3)

```text
This is Prompt 12 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0; the progress log (Phase 2 DONE); plan §16 items 1–5, §20 Scenario B.
Also read: frontend/app/(ops)/operations/dispatch/page.tsx (useRouteLine ~line 165, ETA pill),
frontend/app/(ops)/operations/map/page.tsx, frontend/components/incidents/IncidentMapView.tsx
(source 'unit-route', boundary source ~line 330), frontend/components/incidents/IncidentDetailDrawer.tsx
(TransportPanel, ChangeTransportDialog), frontend/features/map/{hooks,live-tracking}.ts,
frontend/providers/socket-provider.tsx (~lines 166–175), frontend/components/map/HospitalMarker.tsx
(from Prompt 05), frontend/__tests__/live-tracking.spec.ts.

GOAL: dispatchers see which units are going to a scene and which to a hospital, the hospital marker,
and live destination changes, without reloading.

1. features/map: the units cache (tracking/:id/latest) carries leg, destination, route. Patch it from
   responder.route_updated and incident.transport_updated in socket-provider.tsx; keep the existing
   invalidation of ['incident-transports', id] and add it for transport_updated. Show a toast
   "Destination changed: {old} → {new}" on transport_updated (old name from the cache).
   Show a warning toast for destinationWarning FACILITY_DEACTIVATED / FACILITY_AT_CAPACITY.
   Add the 15 s poll only while the socket is disconnected (if not already present).
2. IncidentMapView: new props `facilities?: { id; name; latitude; longitude; verified }[]` and
   `routeStyle?: 'TO_SCENE' | 'TO_FACILITY'`. TO_FACILITY = distinct colour + dashed line. Build point
   features at runtime (toLngLat). Do not touch the boundary GeoJSON source.
3. dispatch/page.tsx: use the unit's server route; keep useRouteLine only as a fallback when route is null.
   ETA pill/unit popup chip: "To scene" or "To hospital · {name}" (+ "estimate").
4. operations/map/page.tsx: draw routes for tracked units with leg styling; optional toggle
   "Show hospitals" listing VERIFIED hospitals from GET /hospitals (cache 5 min); list rows show the leg.
5. IncidentDetailDrawer TransportPanel: ETA labelled "estimate"; destination change history from
   destination_changed/change_reason (and audit if already exposed — do not add a new endpoint);
   warnings banner; ChangeTransportDialog lists only selectable hospitals with receiving status;
   surface the API's FACILITY_AT_CAPACITY warning.
6. Tests: extend frontend/__tests__/live-tracking.spec.ts — cache patch from route_updated; transport_updated
   swaps destination; stale route (> 120 s) flagged; leg chip text selection.

VERIFICATION: cd frontend && pnpm typecheck && pnpm lint && pnpm test.
Manual run against the local backend following plan Table E "Dispatcher" rows; record PASS/FAIL/NOT RUN.
Write the end-of-prompt report (§0). STOP. (Prompts 10–12 complete plan Phase 3.)
```

---

## Prompt 13 — Forward geocoding, candidate scoring, AI name assist, resolve endpoint (Phase 4 backend)

```text
This is Prompt 13 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0; the progress log (Phase 1 DONE); plan §9 (all), §11 (POST /hospitals/resolve-location),
§18 (rate limiting, AI data minimization), §23.
Also read: backend/src/locations/maps/{interfaces,maps.service,maps.module}.ts,
backend/src/locations/maps/providers/nominatim-geocoding.provider.ts (User-Agent, base URL),
backend/src/media/evidence-ai-review.service.ts (OpenAI client pattern, disabled when key unset),
backend/src/config/config.validation.ts (~lines 165–205), .env.example,
backend/src/announcements/announcements.controller.ts (@Throttle usage), backend/test/maps/*.

GOAL: "Find location" returns scored candidates from Nominatim; the LLM only normalizes names and
may pick a candidate id. It never produces coordinates. Everything works with OPENAI_API_KEY unset.

1. GeocodingProvider: add search(query: { text: string; countryCodes?: string; viewbox?: [w,s,e,n];
   bounded?: boolean; limit?: number }) → Promise<GeocodeCandidate[]> with { name, displayName,
   latitude, longitude, category (e.g. 'amenity=hospital'), sourceRef ('osm:way:123'), importance,
   address: { municipality?, province? } }. Implement in NominatimGeocodingProvider via /search
   (format=jsonv2, addressdetails=1, namedetails=1, countrycodes=ph, viewbox = service-area bbox,
   bounded=1, limit=5). Mapbox geocoding is out of scope (throw NotImplemented or omit if there is no
   Mapbox geocoder provider). Expose MapsService.search.
   Global Nominatim limiter: max 1 request/second (a small in-process promise queue is enough;
   note in Follow-ups that multi-instance needs a shared limiter).
   Redis cache 24 h keyed on the normalized query (reuse the RouteCacheService client pattern, or a
   tiny GeocodeCacheService; fail open).

2. New folder backend/src/hospitals/location-resolution/:
   - candidate-scoring.ts (pure): normalizeName(), nameSimilarity() (token-set Jaccard + trigram, 0–1),
     scoreHospitalCandidate(input, candidate) = 0.55·name + 0.20·category + 0.15·adminArea + 0.10·importance,
     with reasons[]; decide(candidates) → AUTO_SELECTABLE | NEEDS_CONFIRMATION | NO_RESULTS per plan §9.3
     (top ≥ 0.85, category = 1, inside service area, no second ≥ 0.70 more than 150 m away).
   - hospital-name-assist.service.ts: OpenAI client built like EvidenceAiReviewService; model from new
     env OPENAI_GEOCODE_ASSIST_MODEL (default same as OPENAI_EVIDENCE_REVIEW_MODEL). Two functions:
     normalize(name, address?) → { normalizedName, queries: string[] (≤3) } and
     tieBreak(input, candidates without coordinates) → { candidateId | null, rationale }.
     Validate outputs with zod; DROP any field that looks like a coordinate; on any error or no key →
     deterministic fallback (normalizeName + simple query list) and aiAssisted = false.
     Send only staff-typed name/address/municipality/province — never incident/patient data.
   - hospital-location-resolver.service.ts: orchestrates normalize → search (each query, merge by
     sourceRef) → filter to service area → score → decide → optional AI tie-break only between
     candidates within 0.05 of the top score (it may only reorder/select, never change numbers).
     Provider error → { result: 'PROVIDER_UNAVAILABLE', candidates: [] } (HTTP 200, never 503).
     Also flag candidates whose sourceRef already exists in facilities (alreadyRegistered: facilityId).

3. Endpoint POST /hospitals/resolve-location (dto/resolve-location.dto.ts: name 2..255, address?,
   municipality?, province?). Roles SYSTEM_ADMINISTRATOR, ORG_ADMINISTRATOR, SUPERVISOR.
   @Throttle 10 per minute per user (match the announcements controller style).
   Response shape exactly as plan §11. Candidates carry provider coordinates only.

4. Config: OPENAI_GEOCODE_ASSIST_MODEL (optional) and, if not present, GEOCODER_USER_AGENT reuse —
   check what the provider already uses. Update .env.example with placeholders/comments only.

5. Tests (no live network in CI — record fixtures):
   - backend/test/hospitals/location-resolution.spec.ts: scoring numbers for the reference hospital
     fixture (Nominatim JSON for "Joni Villanueva General Hospital" → AUTO_SELECTABLE); two same-name
     candidates > 150 m apart → NEEDS_CONFIRMATION; empty → NO_RESULTS; provider throws →
     PROVIDER_UNAVAILABLE; AI output containing "lat"/"latitude"/numbers in candidate fields is ignored;
     key unset → deterministic path, aiAssisted false; alreadyRegistered flag set for the seeded OSM ref.
   - Nominatim provider: builds the right query params; maps a fixture to GeocodeCandidate.
   Store fixtures under backend/test/hospitals/fixtures/.

VERIFICATION: cd backend && npx jest --config ./test/jest.config.ts test/hospitals test/maps &&
pnpm typecheck && pnpm lint && pnpm test. One manual call against local backend for the reference
hospital (this makes one real Nominatim request — acceptable, record the result summary only).
Write the end-of-prompt report (§0). STOP.
```

---

## Prompt 14 — Hospital registry UI: "Find location" and Org Admin flow (Phase 4 frontend)

```text
This is Prompt 14 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0; the progress log (Prompts 05 and 13 DONE); plan §9.2 (step 6), §9.4, §16 item 6,
§20 Scenario D.
Also read: frontend/app/(ops)/hospitals/page.tsx, frontend/components/hospitals/HospitalLocationPicker.tsx,
frontend/features/hospitals/{api,hooks}.ts.

GOAL: Scenario D passes end to end.

1. api.ts/hooks.ts: resolveHospitalLocation(body) → POST /hospitals/resolve-location (mutation, not a
   query — it runs only on an explicit click; no autocomplete, per Nominatim policy).
2. In the create dialog and the "Set location" dialog add a "Find location" button (uses name, address,
   municipality, province already typed). Show:
   - AUTO_SELECTABLE: the top candidate preselected on the map with "Best match" and its reasons; the user
     still clicks Confirm.
   - NEEDS_CONFIRMATION: candidate list (name, address, score %, reasons, "already registered" link when
     flagged) — the user must pick one or drop a pin; nothing preselected.
   - NO_RESULTS / PROVIDER_UNAVAILABLE: message + manual pin (existing picker).
   - "AI-assisted" small label when aiAssisted is true.
   Confirm sends setHospitalLocation / create with source 'nominatim' + sourceRef + confidence (score) for a
   picked candidate, or 'manual' when the user moved the pin away from the candidate (> 25 m) or dropped one.
3. Org Admin: create for own HOSPITAL org results in "Pending review" badge and the message from Prompt 05.
   Supervisor sees a "Pending review" filter/count and can Verify/Reject from the list.
4. Tests: pure tests for "candidate moved > 25 m → manual" and the result-state → UI-state mapping.

VERIFICATION: cd frontend && pnpm typecheck && pnpm lint && pnpm test. Manual run of plan Table E
"Hospital registration" rows; record PASS/FAIL/NOT RUN.
Write the end-of-prompt report (§0). STOP. (This completes plan Phase 4.)
```

---

## Prompt 15 — Idempotent transport mutations and mobile outbox (Phase 5, part 1)

```text
This is Prompt 15 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md (Offline Queue section, Rule 12); §0; the progress log (Phase 3 DONE); plan §19.
Also read: backend/src/incidents/transport/{transport.service.ts,dto/*}, the Redis client pattern
(RouteCacheService), mobile/src/services/api/transport.api.ts, mobile/app/responder/assignment/[id].tsx,
the mobile network-status hook (grep useNetworkStatus), Expo Secure Store usage in mobile/src.
Note: AGAP deliberately does NOT queue SOS submissions on mobile — do not touch that flow.

GOAL: start transport, destination change and arrival survive a dropped connection without duplicates.

Backend:
1. DTOs start-transport, update-transport, record-arrival accept optional clientRequestId (IsUUID).
2. Dedup by (dispatch_id, clientRequestId) for 24 h: Redis key transport:req:{dispatchId}:{clientRequestId}
   → stored response; on hit return the stored response with the same status. If Redis is down, fall back
   to a natural-key check (open record for the dispatch / arrived_at already set with the same
   clientRequestId in the audit newValues) — never create a second record. Store clientRequestId in audit
   newValues.
3. record-arrival accepts optional occurredAt: not in the future, not older than 30 min → else 400.
   arrived_at = occurredAt ?? now; audit both occurredAt and server receipt time.
4. Tests: same clientRequestId twice → one record, same response; different ids → normal rules;
   occurredAt bounds.

Mobile:
5. mobile/src/services/offline/transport-outbox.ts (the folder named in CLAUDE.md's module map for MOD-19):
   Secure-Store-persisted outbox, at most 3 pending transport mutations per dispatch, FIFO, each with its
   clientRequestId generated at tap time; flush on reconnect in order; drop an item only on 2xx or a
   4xx that is not retryable (record the message for the UI); never drop on network errors.
6. Wire assignment/[id].tsx transport actions through the outbox when offline (or when the request fails
   with a network error). UI: "Saved on this phone — sending when online" and a pending count.
   Arrival made offline sends occurredAt.
7. Tests: pure tests for the outbox (ordering, cap of 3, persistence round-trip with a mocked store,
   network error keeps item, 409/400 drops with message).

VERIFICATION: backend and mobile typecheck/lint/test. Device check: airplane mode during transport → tap
Arrived → reconnect → exactly one arrival recorded (check transport_records + audit). Record result.
Write the end-of-prompt report (§0). STOP.
```

---

## Prompt 16 — Self-hosted OSRM, E2E and final Definition-of-Done audit (Phase 5, part 2)

```text
This is Prompt 16 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0; the progress log (all earlier prompts); plan §13.1, §20, §21 Phase 5, §23, §24
(Definition of Done and Table E).
Also read: infrastructure/ (docker compose files, existing services), docker-compose*.yml at the root,
backend/test/**/*.e2e-spec.ts (if any), .github/workflows/.

GOAL: production-ready routing infrastructure, an E2E transport test, and an honest DoD checklist.

1. infrastructure/osrm/: a Docker setup (README + compose service) that downloads the Geofabrik
   philippines-latest.osm.pbf, runs osrm-extract/partition/customize with the car profile, and serves
   osrm-routed on an internal port. Add the service to the dev compose file behind a profile (e.g.
   `--profile routing`) so it does not start by default. Document MAP_PROVIDER_ROUTING_URL for it in
   .env.example (comment only; keep the public demo server as the dev default). Add a refresh script
   (scripts/dev or infrastructure/osrm) for monthly extract updates. Do not run the multi-GB build in
   this session unless the user asks; document the command.
2. E2E: add backend/test/transport-flow.e2e-spec.ts (runs with `pnpm test:e2e`) covering, with the routing
   provider mocked: dispatch accepted → ON_SCENE → TRANSPORTING (record exists) → destination set to the
   seeded hospital → ETA job produces a TO_FACILITY route ending near [120.94358, 14.79679] →
   arrival → responder RESOLVED allowed → bystander reporter never received destination. Follow the
   existing e2e setup if one exists; if none exists, build the smallest Nest testing module needed and
   record that in the progress log.
3. Run everything: pnpm --filter @agap/shared build; backend/frontend/mobile typecheck, lint, test;
   backend pnpm test:e2e. Compare against the Prompt 00 baseline; any new failure must be fixed or
   explained.
4. Final audit: copy plan §24 Definition of Done and Table E into the progress log and mark each item
   DONE / PARTIAL / NOT DONE / NOT RUN with evidence (test name, command output, or manual check from an
   earlier prompt). Do not mark anything DONE without evidence.
5. Remaining-work list: everything PARTIAL/NOT DONE, plus all Follow-ups collected across prompts,
   de-duplicated, each with a one-line next step.

Write the end-of-prompt report (§0). STOP.
```

---

## Prompt A1 — (Optional, adjacent) Fix unit recommendations: `incident_locations.point` is never written

The plan (§7 "Adjacent finding", §23 last risk row) flags this as a separate ticket. Run it any time. It is independent of the prompts above.

```text
This is optional Prompt A1 of docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md.
First read: CLAUDE.md; §0; plan §7 "Adjacent finding".
Also read: backend/src/dispatch/resource-matching/resource-matching.service.ts (fetchCandidates, the comment
~line 147 claiming `point` is set by the DB), backend/test/dispatch/resource-matching.spec.ts,
backend/prisma/schema.prisma model incident_locations, and the Prompt 01 migration (trigger precedent).

GOAL: proximity-based unit recommendations work for incidents that have latitude/longitude.

1. Confirm on the local DB: SELECT count(*) FILTER (WHERE point IS NULL), count(*) FROM incident_locations;
2. Fix at the source with a migration that mirrors Prompt 01's approach: a BEFORE INSERT OR UPDATE trigger
   on incident_locations that sets point from latitude/longitude, plus a one-time backfill UPDATE.
   Do not change the Prisma type of `point`.
3. Correct the misleading comment in resource-matching.service.ts.
4. Test: a resource-matching test where the incident has lat/lng returns candidates ordered by distance
   (adapt to how the spec fakes Prisma; if the query is raw SQL that cannot be unit-tested, add a SQL-level
   check in the progress log instead).
VERIFICATION: backend typecheck/lint/test; record the before/after NULL counts.
Write the end-of-prompt report (§0). STOP.
```
