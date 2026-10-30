# Handoff: Hospital destination routing — Prompt 06 reviewed, Prompts 07 and 08 done

**Date:** 2026-10-28
**For:** the next agent, starting cold. Its first task is an **independent review of Prompts 07 and 08** (the user will ask to verify they were implemented accurately: no errors, duplication or wrong executions).
**Earlier handoffs (their facts still hold):** [`2026-10-25_…prompts-00-03.md`](./2026-10-25_hospital-destination-routing-prompts-00-03.md), [`2026-10-26_…prompt-04-done.md`](./2026-10-26_hospital-destination-routing-prompt-04-done.md), [`2026-10-26_…prompt-05-done.md`](./2026-10-26_hospital-destination-routing-prompt-05-done.md), [`2026-10-28_…prompt-06-done.md`](./2026-10-28_hospital-destination-routing-prompt-06-done.md)
**Work:** [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md) through the prompt pack [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md). Progress log: [`docs/HOSPITAL_ROUTING_PROGRESS.md`](../HOSPITAL_ROUTING_PROGRESS.md). The sections "Independent review of Prompt 06", "Prompt 07 …" and "Prompt 08 …" there are the full write-ups. Read them; this file is the summary.

---

## Where things stand

| Prompt | Status | Notes |
|---|---|---|
| 00–05 | DONE, reviewed | |
| 06 Shared contracts + realtime emitters | DONE, **independently reviewed 2026-10-28** | 1 robustness fix (below) |
| 07 Transport leg service, route cache, leg-aware ETA job | DONE 2026-10-28, **independently reviewed 2026-10-28** | Cache, processor and OSRM verified live with Redis up (rolled back) |
| 08 Single `beginTransport` path, RESOLVED guard, referral sync, `transport_updated` | DONE 2026-10-28, **independently reviewed 2026-10-28** | 1 fix: `change_reason` no longer erased by a same-hospital PATCH. See "Independent review of Prompts 07 and 08" in the progress log |
| 08B Reporter-patient confirmation (C17) | DONE 2026-10-28, **not independently reviewed** | Migration `20261028120000_transport_reporter_patient_confirmation` applied locally; `PATCH /incidents/:id/transport/:tid/reporter-patient`. Report in the progress log |
| 09 Audience rule (crew / confirmed reporter user rooms) | Not started | Fills the `userIds: []` that 07/08 pass today |
| 10, 11 | Not started | Phase 3. 10 also needs the LGU DPO sign-off on C17 (not obtained) |
| 12–16, A1 | Not started | Original order kept |

**Git:** last commit `6a7635b` (Prompts 00–06). **Everything from the Prompt 06 review, Prompt 07 and Prompt 08 is uncommitted.** The user commits on `main` when they ask.
- Not part of this work, do not touch or commit as ours: `mobile/app/home/index.tsx`, `mobile/src/components/emergency/HoldToSOS.tsx`, `mobile/src/components/emergency/SOSAlert.tsx`, `mobile/assets/login-page-background.png` (the user's own changes), `frontend/tsconfig.tsbuildinfo` (build cache).
- `docs/handoff/2026-10-28_…prompt-06-done.md` and this file are untracked.

---

## How the user works

1. One prompt per session; the agent appends a report to the progress log. Then an independent review that checks code, DB and tests directly (never just the summary), fixes what is wrong, and corrects later prompts when the code disagrees.
2. The user cares most about **no duplication** and **accurate `schema.prisma` / DB data**. They asked this session to make sure a problem is real before acting on it ("not just hallucinations"): verify reachability in code before proposing a change.
3. The user tests on real devices and pastes logs.
4. Their terminal is **Git Bash** (MINGW64). Give Bash commands when they will run them.
5. Commit only when asked.

---

## Prompt 06 review (done): result

Correct. One fix: `RealtimeService.facilityArrival` built the incident-room copy by removing `destinationId` (a deny list); it now copies named fields only, like `incidentTransporting`, so a field added later cannot reach the reporter. Spec asserts the exact room payload. Prompt 08's step 1 in the prompts file was amended to settle the duplicate destination fields (fill `destination`, drop `destinationName`, keep `destinationId`).

---

## Prompt 07: what was done (review all of it)

- `TRANSPORT_ROUTING_ENABLED` (string flag, default on; `'false'` = exact Prompt 04 behaviour) in `config.validation.ts` and root `.env.example`.
- `backend/src/incidents/transport/transport-leg.service.ts` (new, `IncidentsModule`, exported): `resolve(dispatchId)` → TO_SCENE / TO_FACILITY / AT_FACILITY with `target`, `destination`, `transportId`, `incidentId`; `null` for an unknown dispatch. Two parallel queries (open rule via `openTransportWhere`, plus dispatch/incident/latest transport). AT_FACILITY also returns the destination.
- `backend/src/locations/route-cache.service.ts` (new, `LocationsModule`, exported): own ioredis client, fail-open like `SessionRevocationService`, key `route:dispatch:{id}`, TTL 120 s.
- `backend/src/locations/maps/simplify-line.ts` (new): Douglas–Peucker ranking to ≤ 300 points. `MapsService` unchanged (both routers already return `[lng, lat]` geometry).
- `eta-refresh.processor.ts`: leg resolved at run time; route → cache → `estimated_arrival_at` (TO_FACILITY only, `updateMany` with `openTransportWhere({ id })`) → `routeUpdated` + `notifyEtaUpdated`. Audience `{ incidentRoom: leg === 'TO_SCENE', userIds: [] }`. Failure → stale cached route (< 120 s, same leg **and** destination) or `route: null`. Job coordinates are now optional.
- `LocationsService.requestImmediateRefresh(dispatchId, incidentId, reason)` (job id `eta-now-{id}-{ms}`, no dedup). `trackResponder` now enqueues even without scene GPS.
- `RealtimeService.notifyEtaUpdated` gained optional `{ incidentRoom }` (default true) so the hospital-leg ETA stays out of the incident room (C17).
- `JobsModule` imports `IncidentsModule`.

## Prompt 08: what was done (review all of it)

- `TransportService.beginTransport(tx, input)`: `SELECT status FROM incidents … FOR UPDATE`, status ON_SCENE/TRANSPORTING, dispatch, crew, `assertSelectableDestination`, then open record (`unchanged` / `destination_set`) or create (+ `recordTransition` from ON_SCENE). Audited in the transaction. `announceTransportBegun(result)` does the post-commit emits + immediate refresh.
- **POST-after-PATCH decision:** open record without destination + destination requested → set it (no 409, no second record); none/same → unchanged; a different hospital already set → 409 `TRANSPORT_ALREADY_OPEN` (change goes through PATCH).
- `RespondersService.updateStatus`: TRANSPORTING calls `beginTransport` inside the status transaction (a second unit on a TRANSPORTING incident now gets its own record with no status side effects); RESOLVED by the crew with an open transport on its dispatch → 409 `TRANSPORT_OPEN`. Constructor: `TransportService` inserted before the optional notifier (positional test callers updated).
- `recordArrival`: one transaction, conditional `updateMany where { id, arrived_at: null }`, audit in the transaction, stamps the matching `facility_referrals.patient_arrived_at` (same incident + hospital, dispatch match preferred over null dispatch) with a MOD-38 audit row; then `facilityArrival` (with `dispatchId`), cache clear, refresh `'arrived'`.
- `updateTransport`: transaction + in-transaction audit; on a real hospital change `transportUpdated(…, [])` (ops only), cache clear, refresh `'destination_changed'`. The old `incident.updated { transportUpdated }` is **kept** (the web console refetches on it).
- `notifyFacilityChanged(facilityId, 'moved' | 'deactivated')` + `findOpenTransportsForFacility`; `HospitalsService.setLocation`'s hook calls it with `'moved'`. **No deactivation path exists** in the code, so `'deactivated'` has no caller yet.
- One converter `toTransportDestinationView` + `DESTINATION_VIEW_SELECT` in `hospitals/facility-view.ts` (the private copy in `transport-leg.service.ts` was removed). `assertSelectableDestination` returns `view`.
- Shared: `destinationName` removed from `IncidentTransportingPayload`.
- Modules: `IncidentsModule` imports `LocationsModule`, exports `TransportService`; `HospitalsModule` imports `IncidentsModule`. No cycle, no `forwardRef`.
- Data accuracy: `transport_records.updated_at` now set on destination set/change and arrival; `destination_changed` = an already-chosen hospital was replaced (first choice is not a change; never reset to false).

**Verification recorded (Prompt 08):** focused suites 20/263 passed; full backend 981 tests, 977 passed, 4 baseline failures; lint baseline (1 error, 284 warnings); backend/frontend/mobile typecheck passed; boot OK; live probe on the real DB inside a rolled-back transaction: created → destination_set (same record) → unchanged → 409 `TRANSPORT_ALREADY_OPEN`; after rollback nothing remained.

## What to check when reviewing 07 and 08

- No duplicate rule: `grep -rn "arrived_at: null" backend/src` (only `open-transport.ts` plus the arrival `updateMany` guard and `patient_arrived_at` in the referral match); one destination-view converter; no second `is_active`/review check outside `destination-rules.ts`.
- C18/C17: nothing on the hospital leg reaches the incident room (`routeUpdated`, ETA, `transportUpdated`); incident-room `incident.transporting` stays status-only.
- The processor's flag-off path really equals Prompt 04 behaviour.
- `beginTransport` audit/transition all inside the transaction; emits only after commit; rollback leaves nothing (probe pattern below).
- Referral stamping picks the right row and writes `updated_at`.
- DB: `cd backend && npx prisma migrate status` and `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` should still be empty (no schema change in 07/08).
- Boot: `BACKEND_PORT=3999 timeout 150 npx nest start` (a dev server usually holds :3000).

---

## Decision made this session

**RESOLVED guard stays per dispatch** (no code change). Verified: `DispatchService.create` is the only dispatch creator, accepts only ACKNOWLEDGED/ASSESSED/DISPATCH_PENDING and moves the incident to DISPATCHED, so the normal flow has one dispatch per incident; extra crew share it. Two active units are only reachable via UNABLE_TO_RESPOND → DISPATCH_PENDING → re-dispatch without cancelling the first (nothing auto-cancels). Make the guard incident-wide if multi-unit dispatch (e.g. MOD-52 surge) is added. Open question for the dispatch module: should UNABLE_TO_RESPOND cancel active dispatches?

---

## Environment problems

- **Redis runs inside WSL (Ubuntu), not Docker** (the user has no Docker). PostgreSQL runs natively on Windows (`postgres.exe`, :5432), so WSL restarts never touch the DB. Windows reaches Redis through `wslrelay.exe` on `localhost:6379`.
- **Fixed 2026-10-28, but not yet re-verified from the backend.** Two causes were found:
  1. WSL was stuck (error `Wsl/Service/0x80072747`, "insufficient buffer space"): the relay accepted TCP but nothing answered. Fixed with `wsl --shutdown`.
  2. **WSL stops Ubuntu shortly after the last WSL process exits, and Redis stops with it.** One-off `wsl -d Ubuntu -- …` commands are not enough. `redis-server` is now enabled with systemd, so it starts whenever Ubuntu starts; Ubuntu just has to be kept running.
- **Startup order after every Windows restart:**
  1. Keep Ubuntu awake (PowerShell): `Start-Process wsl -ArgumentList '-d','Ubuntu','--','sleep','infinity' -WindowStyle Hidden`. Check with `wsl -d Ubuntu -- redis-cli ping` → `PONG`. The relay can take up to a minute to appear on Windows.
  2. Object storage (README), from **inside** Ubuntu (`wsl -d Ubuntu`, then `~/.config/agap-object-storage/start-garage`). In Git Bash or PowerShell, `~` is the Windows home. Garage runs in the foreground and does not conflict with the keep-alive.
  3. Backend last (`pnpm start:dev`). `SessionRevocationService` and `RouteCacheService` connect only once, at boot (`retryStrategy: () => null`), so a backend started before Redis keeps logging "Redis unavailable" until restarted.
- **Done in the 07/08 review:** the backend boots without the Redis warning; the route cache round trip and the processor (TO_SCENE → TO_FACILITY → AT_FACILITY) ran live against Redis, OSRM and the DB (rolled back). Ubuntu had stopped again before that review, so run the keep-alive after every Windows restart.
- Routing uses the public OSRM demo server (worked: Bocaue → Joni Villanueva 426 s, 3160 m, 877 ms).

## Baseline failures (pre-existing; do not "fix" as part of this work)

- Backend: `barangay-notify.spec.ts` › FALSE_ALERT (`tx.false_alerts` undefined); `auth-phase3` `BackupCodesService` ×3 timeouts.
- Backend lint: 1 error `incidents.service.ts:91` unused `actorRole`; 284 warnings.
- Frontend: use `npx tsc --noEmit --incremental false` (TS5033 on `pnpm typecheck`); `pnpm lint` cannot run.
- Mobile lint: 7 errors, pre-existing.
- Root `tests/` runner: second `@nestjs/common` copy breaks `instanceof` (responders spec: 11 pass, 12 fail). Not in CI.

## How to verify quickly (patterns that worked)

- Real code against the local DB: a scratchpad `.ts` that `require`s `process.cwd() + '/src/...'`, run from `backend/` with
  `npx ts-node -r dotenv/config -T -O '{"module":"commonjs","experimentalDecorators":true,"emitDecoratorMetadata":true}' <script>`.
  `new PrismaService()` works directly.
- Roll back writes: `prisma.$transaction(async (tx) => { …; throw ROLLBACK })`. Audit rows written inside it roll back too; never let a probe commit one (audit logs are immutable).
- `IncidentEvent` has `occurred_at`, not `created_at`.
- Backend tsconfig uses `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (optional fields need conditional spreads).
- Bash: quoted heredocs containing `'` inside `$(…)`-free text can still break the tool; use the Edit tool for long Markdown appends. CRLF files defeat multi-line `sed`; use Edit or a short Python replace with exact-match asserts.

## Open items / follow-ups (full list in the progress log)

- Independent review of Prompts 07 and 08 (next session), then Prompt 08B.
- Redis is back (see Environment problems). Verify the route cache and processor live once the backend boots without the Redis warning.
- Manual device checks still pending from earlier prompts (Hospitals page swap check on Joni Villanueva; browser console after reload; responder app picks a hospital after "Transporting" → card and dispatcher drawer show it). After 08, also: tap Transporting, cancel the picker → a transport record exists with "Not set"; "Mark Resolved" before arrival → shows "Record arrival at the hospital before resolving."
- From 08: `verifyLocation` does not notify open transports; Org Admin `setLocation` (PENDING_REVIEW) re-routes open transports to unreviewed coordinates; receiving status AT_CAPACITY does not warn open transports; REST start path sends no reporter/dispatcher notification; remove `incident.updated { transportUpdated }` after Prompt 12; `dto.patientId` not checked against the incident; mobile (Prompt 11) should present `TRANSPORT_OPEN`.
- LGU DPO sign-off on C17 (gates Prompt 10).
