# Handoff: Hospital destination routing — Prompt 05 reviewed, Prompt 06 done

**Date:** 2026-10-28
**For:** the next agent, starting cold. Its first task is an **independent review of Prompt 06**. The user will send: *"based on the plan and the progress log, verify Prompt 06 was accurately implemented: no errors, duplication or wrong executions."*
**Earlier handoffs (their facts still hold):** [`2026-10-25_…prompts-00-03.md`](./2026-10-25_hospital-destination-routing-prompts-00-03.md), [`2026-10-26_…prompt-04-done.md`](./2026-10-26_hospital-destination-routing-prompt-04-done.md), [`2026-10-26_…prompt-05-done.md`](./2026-10-26_hospital-destination-routing-prompt-05-done.md)
**Work:** [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md) through the prompt pack [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md). Progress log: [`docs/HOSPITAL_ROUTING_PROGRESS.md`](../HOSPITAL_ROUTING_PROGRESS.md). The sections "Independent review of Prompt 05…" and "Prompt 06…" there are the full write-ups.

---

## Where things stand

| Prompt | Status | Notes |
|---|---|---|
| 00–04 | DONE, reviewed | |
| 05 + post-05 fixes | DONE, **independently reviewed 2026-10-27** | 3 bugs fixed, 1 DB row reset (below) |
| **06 Shared contracts + realtime emitters** | DONE 2026-10-28, **not independently reviewed** | Implemented in the same session as the 05 review |
| 07 Transport leg service, route cache, leg-aware ETA job | **NEXT after the 06 review** | Gate: 06 |
| 08, 08B, 09 | Not started | Phase 2, in that order |
| 10, 11 | Not started | Phase 3. 10 also needs the LGU DPO sign-off on the C17 rule (not obtained) |
| 12–16, A1 | Not started | The user chose to keep the original order |

**Git:** everything up to and including Prompt 06 is committed as `6a7635b` on `main` (one large commit, not pushed). Uncommitted now: only `frontend/tsconfig.tsbuildinfo` (build cache, deliberately left out) and `mobile/assets/login-page-background.png` (the user's new file, not part of this work). Review Prompt 06 with `git show 6a7635b -- <path>`, or read the files directly. The working tree matches the commit for every file below.

---

## How the user works

1. One prompt per fresh agent session; that agent appends a report to the progress log.
2. Then an independent review: check code, DB and tests directly, never just the summary. Fix what is wrong, and correct later prompts or the plan when the code disagrees.
3. The user cares most about **no duplication** and **accurate `schema.prisma` / DB data**.
4. The user tests on real devices and pastes logs; expect bug reports between prompts.
5. The user's terminal is **Git Bash** (MINGW64). Give Bash commands, not PowerShell, when they will run them.
6. Commit only when asked. The user commits on `main`.

---

## Review of Prompt 05 (2026-10-27): result

Correct overall. Fixed during the review:
- `CreateHospitalDialog` never reset: its reset ran only on `onOpenChange(true)`, which Radix never calls when the page opens the dialog through state. It now resets when `open` turns true.
- `ReviewLocationDialog`: a note typed and then cancelled was prefilled on the next hospital's decision (and could reach the audit log). It now resets per hospital + decision.
- `HospitalsService.update`, `setLocation` and `verifyLocation` never set `updated_at` (the column has no `@updatedAt`). All three now set it.

**DB data fix (user approved):** seeded **Bocaue General Hospital** (`00000000-0000-0000-0002-000000000001`) had been set to VERIFIED at Joni Villanueva's point (`14.79679, 120.94358`) during the manual check, on the wrong row: the page pre-selects the first hospital alphabetically. Plan §6 says keep it UNVERIFIED with no coordinates. It was reset in one transaction with an audit `UPDATE` (no actor, MOD-39, reason recorded). The handoff manual check now says "click Joni Villanueva first".

Current hospital rows: Bocaue General (UNVERIFIED, no coordinates), DOH — Joni Villanueva (VERIFIED, `14.7967900, 120.9435800`, `manual+osm-crosscheck`), Dr. Yanga's Hospital (VERIFIED, `14.8007783, 120.9218925`, created by the user as test data, no address or municipality). `transport_records` was empty at the review.

---

## Prompt 06: what was done (check all of it)

**Shared (`shared/src`)**
- `maps/map.types.ts`: `TransportLeg`, `TransportDestinationView`, `RouteSnapshot`, exactly as the prompt specifies, plus doc comments.
- `events/incident.events.ts`: `INCIDENT_EVENTS.TRANSPORT_UPDATED = 'incident.transport_updated'`; new `IncidentTransportUpdatedPayload`. In `IncidentTransportingPayload`, `patientId`, `destinationId` and `destinationName` are now **optional** and marked "ops copy only", and an optional `destination` was added. `IncidentFacilityArrivalPayload` gained optional `dispatchId`, and `destinationId` became optional so the room copy type-checks.
- `events/responder.events.ts`: `RESPONDER_EVENTS.ROUTE_UPDATED = 'responder.route_updated'`; new `ResponderRouteUpdatedPayload`.
- `events/websocket-event.types.ts`: `AgapEventName` already derives from the event objects, so the new names were accepted without change. `incident.transporting`, `incident.facility_arrival`, `incident.transport_updated` and `responder.route_updated` were added to `AgapWebSocketPayloadMap`.

**Backend**
- `backend/src/realtime/realtime.service.ts`:
  - **Removed** its local copies of `IncidentTransportingPayload` / `IncidentFacilityArrivalPayload` (comment said "defined locally to avoid requiring a shared rebuild"). It now imports the shared types. This was not asked for explicitly; it was done to avoid two definitions.
  - `incidentTransporting`: ops gets the full payload; the incident room gets `{ incidentId, transportId, dispatchId, transportStartedAt }` built field by field.
  - `facilityArrival`: ops gets the full payload; the incident room gets the payload minus `destinationId` (rest spread, so `dispatchId` stays).
  - New `transportUpdated(payload, userIds)`: ops full; one copy per **deduplicated** user (`new Set`) with `destination.id` removed via a module-level `withoutId` helper; never `emitToIncident`.
  - New `routeUpdated(payload, { incidentRoom, userIds })`: ops always; incident room only when `incidentRoom`; each deduplicated user once. A doc comment states that callers pass `incidentRoom: true` only for TO_SCENE.
  - All via `this.safe(...)`. **No caller of the two new emitters exists yet** (Prompts 07–09 add them).
- `backend/src/incidents/transport/transport.service.ts`: the `facilityArrival` call now passes `dispatchId: record.dispatch_id`. This is additive; check that it is acceptable in the incident-room copy (it is not a patient or destination field, and the room copy of `incident.transporting` already carries `dispatchId`).

**Tests**
- New `backend/test/realtime/transport-events.spec.ts` (10 tests). It serializes the incident-room copies to JSON and asserts no `patientId` / `destinationId` / `destinationName` / `destination` keys or values; ops copies equal the input. `transportUpdated` never calls `emitToIncident`, strips `destination.id`, dedups users, does not mutate the input and handles a null destination. `routeUpdated` checks the room-only-when-true rule and per-user dedup, and both emitters are best-effort.

**Client grep done before trimming:** `frontend/providers/socket-provider.tsx` listens to `incident.transporting` / `incident.facility_arrival` and reads only `incidentId` (then refetches). Mobile subscribes to neither. Every other `destinationId` hit in `frontend/` and `mobile/` is a REST request body.

**Verification recorded**
- `pnpm --filter @agap/shared build` + `typecheck` passed.
- `npx jest --config ./test/jest.config.ts test/realtime test/incidents/transport.spec.ts`: 4 suites, 71 tests passed. Backend `pnpm typecheck` passed.
- Backend `pnpm test`: 63 suites, 916 tests, 911 passed, 5 failed (all baseline, below).
- Backend `pnpm lint`: 1 error (baseline), 284 warnings (unchanged).
- Frontend `npx tsc --noEmit --incremental false` passed; mobile `pnpm typecheck` passed.

## What to check when reviewing Prompt 06

- **C18 exactly:** incident-room copies of `incident.transporting` / `incident.facility_arrival` are status-only; `transportUpdated` never calls `emitToIncident`; `routeUpdated` emits to the room only when `incidentRoom` is true.
- **No duplicate contracts:** `grep -rn "interface IncidentTransportingPayload\|interface IncidentFacilityArrivalPayload\|interface IncidentTransportUpdatedPayload\|interface ResponderRouteUpdatedPayload\|type TransportLeg\|interface RouteSnapshot\|interface TransportDestinationView" backend/src frontend mobile/src mobile/app shared/src` should list `shared/src` only.
- **No duplicate destination field in a new contract.** The ops copy of `incident.transporting` still has old `destinationName`/`destinationId` next to the new optional `destination`. This is recorded as a Prompt 08 follow-up, not removed (the prompt said additive only). Decide whether that is right.
- **The shared build output is current:** `shared/dist/events/*.js` contains `TRANSPORT_UPDATED` / `ROUTE_UPDATED`. After any `shared/` change, run `pnpm --filter @agap/shared build`, then mobile `pnpm typecheck` and frontend `npx tsc --noEmit --incremental false`.
- **Gateway rooms:** `emitToOps` → `ops:all`, `emitToIncident` → `incident:{id}`, `emitToUser` → `user:{id}` (`backend/src/realtime/agap.gateway.ts`). The incident room includes the reporter.
- **Boot check (DI unchanged, but cheap):** `cd backend && timeout 150 npx nest start` → "Nest application successfully started".
- **Do not edit** `bocaue.geojson`, `frontend/lib/bocaue-geo.ts` or `shared/src/maps/bocaue-boundary.ts`.

## Before Prompt 07 (for after the review)

- Prompt 07 needs Redis. It was running at `redis://localhost:6379` (PONG) on 2026-10-28.
- Routing uses the **public OSRM demo server** (`MAP_PROVIDER_ROUTING_URL=http://router.project-osrm.org`, `MAP_PROVIDER=maplibre`). It may be slow or rate-limited; rule that out before blaming code. Prompt 16 self-hosts OSRM.
- Prompt 07 must keep the dispatch-status skip and freshest-fix logic in `eta-refresh.processor.ts` (C9), store no target in the job (C14), and fail open on Redis (C4).

---

## Baseline failures (pre-existing; do not "fix" as part of this work)

- Backend: `barangay-notify.spec.ts` › FALSE_ALERT (`tx.false_alerts` undefined).
- Backend: `auth-phase3` `BackupCodesService` ×3 and `MfaService` login decision ×1 time out (5 s default, hashing-heavy). On the latest full run only `auth-phase3` failed. Earlier runs also listed `auth-phase2`.
- Backend lint: 1 error `incidents.service.ts:91` unused `actorRole`; 284 warnings.
- Frontend: `pnpm typecheck` sometimes fails with TS5033 (use `npx tsc --noEmit --incremental false`); `pnpm lint` cannot run (`next lint` options rejected; ESLint 9 crashes in the v14 Next and react-hooks plugins).
- Mobile lint: 7 errors, all pre-existing.
- Root `tests/` runner: a second `@nestjs/common` copy breaks `instanceof` (15 failures). Not in CI.

## How to verify quickly (patterns that worked)

- **Real code against the local DB:** a scratchpad `.ts` that `require`s `process.cwd() + '/src/...'`, run from `backend/` with
  `npx ts-node -r dotenv/config -T -O '{"module":"commonjs","experimentalDecorators":true,"emitDecoratorMetadata":true}' <script>`.
  `new PrismaService()` works directly. A bare `new PrismaClient()` fails on Prisma 7 ("driver adapter is required"); pass `{ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) }`.
- **Schema vs DB drift:** `cd backend && npx prisma migrate status` and `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (empty = in sync; it was empty on 2026-10-27).
- **Roll back writes:** run inside `prisma.$transaction(async (tx) => { …; throw ROLLBACK })`. Audit logs are immutable, so never let a probe commit an audit row.
- **Frontend page compile without signing in:** `npx next dev -p 3100`, then `curl -H "Cookie: agap_refresh=dummy" http://localhost:3100/<page>`.
- Do not sign in as the seeded admin (`admin@agap.local` changed its password; the `.env` value is stale).
- Bash gotcha: never leave a stray `python3 - <<'EOF'` in a command; it hangs until the 2-minute timeout. Files with CRLF line endings defeat multi-line `perl`/`sed` edits; use the Edit tool.
- `git … index.lock: File exists`: a stale lock was found on 2026-10-28 (0 bytes, three days old, no git process). Check for a running git process before deleting it.

## Open items / decisions pending with the user

- Independent review of Prompt 06 (next session).
- Manual checks still not done: (1) web Hospitals page as System Administrator: **click Joni Villanueva first**, then run the swap check with `120.94358` / `14.79679` → "Use suggested coordinates", then Cancel; map pin click and drag never exercised; (2) browser console after reload: sprite and style-diff warnings gone; (3) responder app: pick a hospital after "Transporting" → transport card and dispatcher drawer show it.
- LGU Data Protection Officer sign-off on the C17 reporter rule (gates Prompt 10).
- Follow-ups in the progress log, including: receiving-status badge values wrong on the hospitals page (Prompt 10/12); `GET /facilities` returns Decimal strings; `FacilitiesService.updateStatus` leaves `updated_at` stale; no same-point duplicate warning for hospitals (Prompt 13); ops copy of `incident.transporting` carries both old and new destination fields (Prompt 08); frontend lint toolchain; auth test timeouts; C15 `recordTransition` candidates; `incident_locations.point` NULL (Prompt A1).
