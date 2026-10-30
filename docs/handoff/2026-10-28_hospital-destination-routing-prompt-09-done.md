# Handoff: Hospital destination routing — 08B reviewed, Prompt 09 done (Phase 2 complete)

**Date:** 2026-10-28
**For:** the next agent, starting cold. Its first task: carry out the **approved decision below** (DPO gate waiver + reporter-sharing switch), then **Prompt 10**. The user may first ask for an independent review of Prompt 09; if so, do that before anything else.
**Earlier handoffs (their facts still hold):** [`2026-10-25_…prompts-00-03.md`](./2026-10-25_hospital-destination-routing-prompts-00-03.md), [`2026-10-26_…prompt-04-done.md`](./2026-10-26_hospital-destination-routing-prompt-04-done.md), [`2026-10-26_…prompt-05-done.md`](./2026-10-26_hospital-destination-routing-prompt-05-done.md), [`2026-10-28_…prompt-06-done.md`](./2026-10-28_hospital-destination-routing-prompt-06-done.md), [`2026-10-28_…prompt-08-done.md`](./2026-10-28_hospital-destination-routing-prompt-08-done.md), [`2026-10-28_…prompt-08b-done.md`](./2026-10-28_hospital-destination-routing-prompt-08b-done.md)
**Work:** [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md) through the prompt pack [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md). Progress log: [`docs/HOSPITAL_ROUTING_PROGRESS.md`](../HOSPITAL_ROUTING_PROGRESS.md). Its last two sections are the full write-ups of this session: "Independent review of Prompt 08B, and two fixes" and "Prompt 09 — …". Read them; this file is the summary.

---

## Where things stand

| Prompt | Status | Notes |
|---|---|---|
| 00–08 | DONE, reviewed | |
| 08B Crew-confirmed reporter-patient flag (C17) | DONE, **reviewed 2026-10-28** | 2 small fixes (below) |
| 09 Service-area geofence, audience rule, leg-aware tracking seed | DONE 2026-10-28, **not independently reviewed** | Completes plan Phase 2 |
| 10 Mobile responder UI (Phase 3) | **NEXT**, after the decision below | Gate: LGU DPO sign-off on C17 — not obtained; see decision |
| 11, 12–16, A1 | Not started | Original order kept |

**Git:** last commit `6a7635b` (Prompts 00–06). **Everything since (06 review, 07, 08, 08B, the reviews and fixes, Prompt 09) is uncommitted.** The user commits on `main` only when they ask.
- Not ours, do not touch or commit as ours: `mobile/app/home/index.tsx`, `mobile/src/components/emergency/HoldToSOS.tsx`, `mobile/src/components/emergency/SOSAlert.tsx`, `mobile/assets/login-page-background.png` (the user's own changes), `frontend/tsconfig.tsbuildinfo` (build cache).
- Untracked and ours: the 2026-10-28 handoffs, the 08B migration folder, `confirm-reporter-patient.dto.ts`, the Prompt 07 files (`transport-leg.service.ts`, `route-cache.service.ts`, `simplify-line.ts`, their specs, `backend/test/responders/`), and the Prompt 09 files: `transport-audience.service.ts`, `transport-leg.module.ts`, `locations/responder-fix-area.ts`, `test/locations/transport-privacy.spec.ts`, `test/realtime/transport-audience.spec.ts`.

---

## How the user works

1. One prompt per session, then an independent review that checks code, DB and tests directly (never only the summary), fixes what is wrong, and corrects later prompts or the plan when the code disagrees.
2. They care most about **no duplication**, **accurate `schema.prisma` / DB data**, and solutions to **real problems that will not cause trouble at launch** (not theory). When asked for a recommendation, give it first and wait for a yes before changing code.
3. §0 rule 1 is binding: do only what the prompt asks; anything else goes to Follow-ups (or is proposed and approved first).
4. They test on real devices and paste logs. Their terminal is **Git Bash**. They are not a privacy/legal specialist: explain terms like "DPO" plainly.
5. Commit only when asked.

---

## Decision for the next session (approved: the user answered "okay", then asked for this handoff)

**Context.** Prompt 10's gate requires the LGU Data Protection Officer's sign-off on the C17 reporter rule, or an explicit waiver. Neither exists. The DPO is a real person at the LGU (RA 10173), not an AGAP user or role. The user asked for the option that "actually solves a problem" and causes no trouble at launch.

**What was recommended and accepted:**
1. **Record a development waiver** in the progress log: the DPO gate is waived for Prompt 10 development; DPO review is still outstanding before production.
2. **Add a launch switch** (a small addition outside the prompt pack, approved): backend config `REPORTER_DESTINATION_SHARING_ENABLED`, **default off** (string flag like `TRANSPORT_ROUTING_ENABLED`; add to `config.validation.ts` and `.env.example`). While off:
   - `PATCH /incidents/:id/transport/:tid/reporter-patient` refuses with a clear message (e.g. 403 "Sharing the hospital with the reporter is not enabled yet.").
   - No reporter ever receives the destination, even if a confirmation is already stored: enforce it in **one place**, `TransportAudienceService` (treat `reporterConfirmedPatient` as false when off). That covers socket emits, `confirmedReporter(…)` and the REST seed (`getLatestUnitPositions` reads the same audience).
   - The mobile crew switch is hidden. Suggested: `GET /incidents/:id/transport` rows (staff/crew only) carry a boolean such as `reporterSharingEnabled`, and the Prompt 10 helper `shouldShowReporterPatientSwitch` also requires it.
   - Everything else is unaffected: crew navigation to the hospital, routes, ETA, dispatcher view, arrival.
   - Tests: flag off → endpoint refused, audience never includes the reporter (REST + emits); flag on → current behaviour.
3. Then **Prompt 10** as written (mobile responder UI), with the switch respected in step 7b. Record the switch and waiver as deviations.

Before coding, restate this plan in one or two lines to the user so they can correct it; they already approved it.

---

## This session

### Independent review of Prompt 08B: correct
Schema diff only the 08B lines; `migrate status` 22 up to date; `migrate diff` empty; `pg_constraint` FK + CHECK match the migration; `down.sql` reverses it; one open-transport definition; 192 incident tests passed. Fixes (user approved):
- `reporterClaimsPatient` uses `ReporterStatus.NEEDS_HELP` from `@agap/shared` instead of the literal.
- Two simultaneous identical confirmations: the conditional `updateMany` now also requires the opposite state; when it matches nothing the transaction re-reads (`openTransportWhere`): not open → 409, else returns the record with no write and no audit. Probed live (rolled back).

### Prompt 09 (summary; full write-up in the progress log)
- **Geofence (G4):** `assertResponderFixInArea` (one helper, `backend/src/locations/responder-fix-area.ts`) for `trackResponder` and `pushLocation`: Bocaue → OK; service area → OK only with an open transport on a dispatch the user crews; else 400. `pushLocation` had **no** geofence before. `getRouteBetween` uses the service area. Intake stays Bocaue-only.
- **Audience rule:** `TransportAudienceService` (`incidents/transport/`, provided by the new `TransportLegModule`, imported by `LocationsModule` and `IncidentsModule`, re-exported by the latter). TO_SCENE → incident room; hospital leg → crew `user:` rooms + the reporter only if crew-confirmed. 10 s per-incident cache with epoch-guarded invalidation (called by `TransportService` on start/destination/arrival/confirm); uncached `load` for REST; fails closed. Location, route, ETA, `transport_updated`, and confirmed-reporter copies of `transporting`/`facility_arrival` all go through it. Withdrawal sends `routeWithdrawn` to that reporter only.
- **REST seed:** `getLatestUnitPositions` adds `leg`, `destination`, `route` (from the route cache; inline only on a TO_SCENE miss) and redacts for an unconfirmed reporter on the hospital leg.
- **Shared:** `IncidentFacilityArrivalPayload.destination?`. Client `LatestUnitPosition` mirrors (mobile + frontend) gained optional `leg`/`destination`/`route`.
- Verification: focused 314 passed; full backend 1054 tests, 1053 passed (baseline `barangay-notify`); lint baseline (1 error / 285 warnings); typecheck backend/frontend/mobile passed; boot OK; 8/8 mutation checks caught; live probe (rolled back) with real OSRM/Redis: route to Joni Villanueva ends `[120.943519, 14.796745]` (Phase 2 acceptance).

## What to check if reviewing Prompt 09
- `grep -rn "arrived_at: null" backend/src` still shows only `open-transport.ts` and the arrival guard. `TransportLegService` is provided only by `TransportLegModule`.
- Every leg-sensitive emit passes through `roomsForDispatch` / `confirmedReporter`; no direct `emitToIncident` for location/route/ETA on the hospital leg.
- The deviations listed in the progress log are acceptable.

---

## Environment

- **Redis runs in WSL Ubuntu** (no Docker). If it stopped: `Start-Process wsl -ArgumentList '-d','Ubuntu','--','sleep','infinity' -WindowStyle Hidden` from PowerShell, then `wsl -d Ubuntu -- redis-cli ping` → `PONG`. It answered PONG this session. Restart the backend after Redis is up.
- PostgreSQL native on Windows (:5432). Routing uses the public OSRM demo server.
- Boot check: `cd backend && BACKEND_PORT=3999 PORT=3999 timeout 150 npx nest start`.
- The Bash tool sometimes rejects long heredocs ("unexpected EOF"); write the script/text to the scratchpad with the Write tool and run or `cat >>` it instead.
- `PrismaClient` needs the pg adapter; in probes use the app's `PrismaService` (`new PrismaService()`), or `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`. Cast Postgres `char` columns (e.g. `contype::text`) in raw queries.

## Baseline failures (pre-existing; do not "fix" as part of this work)

- Backend tests: `barangay-notify.spec.ts` › FALSE_ALERT; `auth-phase3` `BackupCodesService` timeouts (0–3 per run).
- Backend lint: 1 error `incidents.service.ts:91` unused `actorRole`; warnings 285.
- Frontend: typecheck with `npx tsc --noEmit --incremental false`; `pnpm lint` cannot run. Mobile lint: 7 errors.
- Root `tests/` runner: second `@nestjs/common` copy breaks `instanceof`. Not in CI.

## How to verify quickly

- Probe pattern (see `probe09.ts` approach in the progress log): real services over a `new Proxy(tx, …)` that routes `$transaction` to the outer transaction; throw `ROLLBACK`; compare `auditLog.count()`, `transportRecord.count()`, `location_history.count()` before/after; clear `route:dispatch:{id}` in Redis afterwards. A recording fake gateway passed to the real `RealtimeService` shows every room.
- Real ids: dispatch `00000000-0000-0000-0006-000000000001` (incident `…0005-000000000001`); hospitals Joni Villanueva `…0002-000000000006` (VERIFIED, inside Bocaue), Bocaue General `…0002-000000000001` (UNVERIFIED, no coordinates). Test points: Malolos `14.8433, 120.8114` (service area, outside Bocaue), Manila `14.5995, 120.9842` (outside both).
- Backend tsconfig uses `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Mutation check pattern: a scratchpad Python script that applies an exact-match replace, runs the spec, and restores the file in `finally` (run subprocess with `encoding='utf-8'`).

## Open items / follow-ups (full list in the progress log)

- Prompt 11 (mobile citizen): `mergeTrackingLocation` (`mobile/src/lib/incident-tracking.ts`) rebuilds units field by field and drops `leg`/`destination`/`route` on every location patch; keep them. An unconfirmed reporter's marker freezes at the last scene position until the status-only card exists.
- `GET tracking/:id/eta` is not leg-aware and routes per request (no destination leak).
- `incident.transporting` reporter copy cannot fire today (a new transport always starts unconfirmed).
- `transport_records` has only its primary key; recommended indexes `dispatch_id`, `destination_id`, `incident_id` (needs the user's go-ahead and its own migration).
- Org Administrator `setLocation` can re-route open transports to an unreviewed pin (suggested 409); `verifyLocation` / AT_CAPACITY do not notify open transports; REST start sends no reporter/dispatcher notification; remove `incident.updated { transportUpdated }` after Prompt 12; `dto.patientId` not checked against the incident; no deactivation path calls `notifyFacilityChanged(…, 'deactivated')`.
- Manual device checks pending from earlier prompts (see the 08 handoff).
- LGU DPO sign-off on C17 before production (see the decision above).
