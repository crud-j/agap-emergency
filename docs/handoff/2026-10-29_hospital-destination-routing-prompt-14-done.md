# Handoff: Hospital destination routing — Prompt 13 verified, Prompt 14 done, two device-run fixes

**Date:** 2026-10-29
**For:** the next agent, starting cold. This is the current handoff; read it first.
**First task:** ask the user how the **re-check on device and browser** went (section "Waiting on the user"). Do not start Prompt 15 until they say so, and then **wait for the user to paste Prompt 15**.
**Earlier handoffs (their facts still hold):** [`…prompt-13-done.md`](./2026-10-29_hospital-destination-routing-prompt-13-done.md), [`…prompt-12-done.md`](./2026-10-29_hospital-destination-routing-prompt-12-done.md) (Prisma 7 drift command, frontend lint workaround), [`…prompts-10-11-done.md`](./2026-10-29_hospital-destination-routing-prompts-10-11-done.md) (real ids, test points).
**Work:** [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md) via the prompt pack [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md). Progress log: [`docs/HOSPITAL_ROUTING_PROGRESS.md`](../HOSPITAL_ROUTING_PROGRESS.md). Its last four sections are this session's full write-ups.

---

## Where things stand

| Item | Status | Notes |
|---|---|---|
| 00–13 (incl. 08B), DPO waiver, read-access fixes | DONE, reviewed | |
| Verification of Prompt 13 | DONE 2026-10-29 | Correct; no errors or duplication from it |
| Fix C21: one facility per OSM ref | DONE 2026-10-29 (user-approved) | Migration `20261029120000_facility_source_ref_unique`; `assertNoDuplicate` matches the ref alone |
| 14 "Find location", Org Admin / Supervisor flow, hospital deactivation | DONE 2026-10-29, **reviewed 2026-10-29** (correct; see the progress log's review section) | Backend + web + mobile. Manual Table E rows: see below |
| Fix: stopped units "signal lost" and lost route; MapLibre warnings | DONE 2026-10-29, **not re-checked on device** | Mobile GPS heartbeat; SDF placeholders |
| 15 Idempotent transport mutations + mobile outbox | **NEXT**, when the user pastes it | |
| 16, A1 | Not started | |

**Git:** last commit `6a7635b`. **Everything since is uncommitted**; the user commits on `main` only when asked. Not ours: `mobile/app/home/index.tsx`, `mobile/src/components/emergency/HoldToSOS.tsx`, `mobile/src/components/emergency/SOSAlert.tsx`, `mobile/assets/login-page-background.png`, `frontend/tsconfig.tsbuildinfo`.

## Waiting on the user

> **Corrected by the independent review (2026-10-29):** INC-2026-000013 is **CLOSED** (13:43 UTC), not TRANSPORTING, and the dev DB has **no open transport**. Its first deactivation attempt (13:46) came after the close, so row 3 never had a transport to warn about. Items 1 and 2 need a **new incident taken to TRANSPORTING with Joni Villanueva as destination**. The audit log holds five `is_active` toggles (Supervisor, 13:46–14:13), all on Bocaue General, none on Joni.

1. **Re-check after the two fixes** (reload the responder app; if stale, `npx expo start -c`; hard-reload the web console). With a **new** incident TRANSPORTING to Joni Villanueva, leave the responder phone still for 2 min: the unit should not show "signal lost", and the dashed hospital route should stay on **Operations → Map** and **Operations → Dispatch**. The console should no longer show `Image " " could not be loaded` or `Cannot mix SDF and non-SDF icons`.
2. **Table E "Dispatcher" row 3** (deactivate during a transport). The earlier attempts deactivated **Bocaue General Hospital** (`…0002-000000000001`), not Joni, and no transport was open. **Bocaue General is still `is_active = false` in the dev DB**; reactivate it from the registry (Deactivated chip). Steps: with the new incident TRANSPORTING, select Joni in the list (the registry shows the first hospital, Bocaue General, until one is clicked; the dialog now names the hospital in its title and button), Deactivate → dispatcher toast + drawer warning on that incident, responder banner, transport continues → Reactivate Joni.
3. **Table E "Hospital registration" rows 1–4: NOT RUN.** Joni already exists, so test "Find location" from its **Set location** dialog (AUTO_SELECTABLE, saves `nominatim`); creating it again must give 409.
4. ~~Unanswered offer: hospital name in the deactivate dialog.~~ **Done 2026-10-29 (user-approved, review):** `ActiveStatusDialog` title "Deactivate <name>?" / "Reactivate <name>?" and the button "Deactivate <name>" / "Reactivate <name>".

## How the user works

1. One prompt per session, then an independent review that checks code, DB and tests directly, fixes what is wrong (after approval), and corrects later prompts or the plan when the code disagrees.
2. Cares most about **no duplication**, **accurate `schema.prisma` / DB data**, and **real problems that would hurt at launch** (not theory).
3. **Give the recommendation first and wait for a yes** before changing code outside the pasted prompt. Out-of-prompt decisions go through AskUserQuestion.
4. Tests on real Android devices (development build) and in the browser; reports problems by pasting console output. Terminal: **Git Bash**. Not a privacy/legal specialist: explain plainly.
5. Commit only when asked.

## What this session changed (details in the progress log)

**C21 (before Prompt 14):** `uq_facilities_location_source_ref` is now `UNIQUE (location_source_ref) WHERE NOT NULL` (raw SQL, `schema.prisma` unchanged, `migrate diff` empty, applied locally). `HospitalsService.assertNoDuplicate(name, municipality, sourceRef, excludeId)` (no `source` parameter). Plan §6/§10 and prompt pack C21 updated. Probe: a `nominatim` insert of `osm:way:1290448946` now fails `23505`.

**Prompt 14:**
- Backend: `PATCH /hospitals/:id/active` (`dto/set-active.dto.ts`, roles SYSADMIN/SUPERVISOR), `HospitalsService.setActive` (one `$transaction` with `audit.logInTransaction`; notify `'deactivated'` after commit only on true → false; no-op when unchanged; reactivation re-checks the active-name rule → may 409). `findAll(actor, includeUnreviewed, includeInactive)`; `?includeInactive=true` honoured for reviewers only.
- Web: `features/hospitals/{api,hooks,location}.ts` (`resolveHospitalLocation`, `setHospitalActive`, `useResolveHospitalLocation`, `useSetHospitalActive`, `locationForSave`, `isPinOnCandidate` (25 m, shared `haversineMeters`), `finderView`, `candidateRegistration`, `scorePercent`); new `components/hospitals/HospitalLocationFinder.tsx`; candidate markers in `HospitalLocationMap/Picker`; registry page: finder in both dialogs, reviewer filter chips (Pending review / Deactivated with counts), inline Verify/Reject on pending rows, Status panel + `ActiveStatusDialog`, "Deactivated" badge. Triage page now imports `haversineMeters` from `@agap/shared` (its private copy is gone; the shared one is the only distance helper now).
- Mobile: `DestinationWarning` + `FACILITY_DEACTIVATED`, `TransportFacility.is_active`; `isDestinationDeactivated` + `DestinationNotice` in `src/lib/transport-target.ts`; `useIncidentTracking` keeps `destinationNotices` per dispatch and invalidates `['incident-transports', id]` on `transport_updated`; `useTransportRoute().destinationDeactivated`; banner in `transport-banners.tsx` on assignment and Map screens; `transport.destinationDeactivated` (en + fil).
- Deviations (accepted, recorded): a picked candidate is saved as `nominatim` + ref even from NEEDS_CONFIRMATION (prompt over plan §9.3); a registered best match is not preselected; the "already registered" link shows only for hospitals in the user's list ("not visible to you" otherwise, no 404); filter chips for reviewers only; candidate markers on the map added.

**Device-run fixes:**
- `mobile/src/hooks/useResponderLocationShare.ts`: `LOCATION_HEARTBEAT_MS` 20 s heartbeat (checked every 10 s) reads the GPS once and sends via `sendFix` when the 15 m watch has been quiet. Cause: a stopped phone sent fixes 2–4 min apart → "signal lost" (60 s) and the server route (Redis `route:dispatch:<id>`, TTL 120 s, renewed only per fix) expired; the Map page draws server routes only.
- `frontend/components/map/missing-style-images.ts`: placeholders added with `{ sdf: true }` (all 252 MapTiler Streets sprite icons are SDF) and `" "` resolved (the style's "Town labels" use a space as "no icon"). Only `""` is skipped.
- Explained, not changed: `/auth/refresh` and `/auth/login` 401 console lines (expired cookie → login; wrong password).

## Open follow-ups (full list in the progress log)

- Prompt 14: reactivation sends no event (crew banner clears on the 10 s transport poll); the mobile event path needs `useIncidentTracking` running; the finder's result list is not cleared when the typed name changes.
- Prompt 13: shared Nominatim limiter for multi-instance; cache the AI normalization per input; four hand-built Redis clients could become one; per-user throttling; untuned scoring thresholds; a name that normalizes to empty.
- Earlier, unchanged: remove `incident.updated { transportUpdated }` (check ETA-only PATCHes first); `transport_records` indexes; `GET tracking/:id/eta` not leg-aware; Org Admin `setLocation` can re-route open transports; `verifyLocation` / AT_CAPACITY do not notify open transports; `dto.patientId` not checked against the incident; the transport list cannot tell a guest report; tracking-screen strings still English; remaining MapLibre warnings (`source must have tiles`, `<Layer style>` deprecated); frontend lint toolchain cannot run; full object-level access review of POST/PATCH routes (propose, do not start unasked).
- The heartbeat makes one OSRM route per unit about every 20 s while stopped (public router in dev); Prompt 16's self-hosted OSRM covers production.
- The LGU DPO sign-off on C17 is still required before production; keep `REPORTER_DESTINATION_SHARING_ENABLED` off.

## Baselines after this session

- **Backend:** `pnpm test` → 1147 tests, baseline failure `barangay-notify` › FALSE_ALERT. Bcrypt `auth-phase2/3` may time out when other suites run at the same time (alone they pass); run the backend suite alone. `pnpm typecheck` passes. Lint 1 error (`incidents.service.ts:91`) / 284 warnings. DB: 23 migrations, `migrate diff` empty. `test/hospitals` 4 suites / 82 tests.
- **Frontend:** typecheck (`npx tsc --noEmit --incremental false`) passes; `pnpm test` 7 suites / 134 passed; `pnpm lint` cannot run (pre-existing).
- **Mobile:** `pnpm typecheck` passes; `pnpm test` 7 suites / 73 passed; lint 6 errors / 53 warnings (pre-existing).
- **Shared:** unchanged this session; rebuild (`pnpm --filter @agap/shared build`) after any `shared/` change.

## Environment (additions; the rest is in the earlier handoffs)

- Redis in WSL Ubuntu: `MSYS_NO_PATHCONV=1 wsl -d Ubuntu -- redis-cli …`. Route cache keys: `route:dispatch:<dispatchId>`. Postgres native on :5432.
- Read-only DB probes: a temporary `.ts` in `backend/` with `PrismaClient` + `PrismaPg({ connectionString: process.env.DATABASE_URL })`, run `npx ts-node --transpile-only -r dotenv/config ./file.ts`, then delete it. Column names: `audit_logs.occurred_at` (not `created_at`); `dispatches` has `resource_id` and crew in `dispatch_crew`; fixes are in `location_history`.
- Boot probe for route mapping: `NestFactory.create(AppModule)` + `enableVersioning(URI)` + `init()`, run with `-r tsconfig-paths/register -r dotenv/config`; grep `Mapped {`.
- Heredocs in Git Bash: a long `cat >> file <<'EOF'` with mixed quotes failed once; append long Markdown with the Edit tool instead.
- `MAP_STYLE_URL` (backend `.env`) is MapTiler Streets v2 with a key in the URL: never print it.
- Nominatim policy: at most 1 request/s, no automated loops; tests use the recorded fixture.

## When the user pastes Prompt 15

- Gate: "Phase 3 DONE" (yes). Ask first whether they want an independent review of Prompt 14 before Prompt 15 (their usual order is build → review).
- Read the prompt's backend steps 1–4 and mobile steps 5–7. Do not touch the SOS flow (AGAP does not queue SOS on mobile).
- `clientRequestId` is client-generated, so `@IsUUID()` is fine for it; every **record id** field still uses `@IsRecordId()` (C19).
- Reuse, do not duplicate: the fail-open Redis client pattern (`RouteCacheService`), `openTransportWhere()` (C16), `AuditService`; on mobile, `useTransportRoute`, `transport.api.ts`, the network-status hook, Expo Secure Store usage already in `mobile/src`. New outbox file: `mobile/src/services/offline/transport-outbox.ts`.
- Verification: backend + mobile typecheck/lint/test, and the device check (airplane mode → Arrived → reconnect → exactly one arrival in `transport_records` + audit).
