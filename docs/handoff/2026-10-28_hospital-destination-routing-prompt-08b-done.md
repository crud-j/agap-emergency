# Handoff: Hospital destination routing — 07/08 reviewed and fixed, Prompt 08B done

**Date:** 2026-10-28
**For:** the next agent, starting cold. Its first task is an **independent review of Prompt 08B** (the user will ask to verify it was implemented accurately: no errors, no duplication, correct `schema.prisma` and DB data). Then Prompt 09.
**Earlier handoffs (their facts still hold):** [`2026-10-25_…prompts-00-03.md`](./2026-10-25_hospital-destination-routing-prompts-00-03.md), [`2026-10-26_…prompt-04-done.md`](./2026-10-26_hospital-destination-routing-prompt-04-done.md), [`2026-10-26_…prompt-05-done.md`](./2026-10-26_hospital-destination-routing-prompt-05-done.md), [`2026-10-28_…prompt-06-done.md`](./2026-10-28_hospital-destination-routing-prompt-06-done.md), [`2026-10-28_…prompt-08-done.md`](./2026-10-28_hospital-destination-routing-prompt-08-done.md) (environment notes, baseline failures and probe patterns there are still current)
**Work:** [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md) through the prompt pack [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md). Progress log: [`docs/HOSPITAL_ROUTING_PROGRESS.md`](../HOSPITAL_ROUTING_PROGRESS.md). Its last three sections are the full write-ups of this session: "Independent review of Prompts 07 and 08", "Fix: destination after arrival, and re-sent hospitals in review", "Prompt 08B — …". Read them; this file is the summary.

---

## Where things stand

| Prompt | Status | Notes |
|---|---|---|
| 00–06 | DONE, reviewed | |
| 07 Leg service, route cache, leg-aware ETA job | DONE, **reviewed 2026-10-28** | Verified live (Redis + OSRM + DB, rolled back) |
| 08 `beginTransport`, RESOLVED guard, referral sync, `transport_updated` | DONE, **reviewed 2026-10-28** | 3 fixes this session (below) |
| 08B Crew-confirmed reporter-patient flag (C17) | DONE 2026-10-28, **not independently reviewed** | Migration applied to the local DB only |
| 09 Locations: service-area fixes, tracking seed, reporter privacy | **NEXT after the 08B review** | Enforces C17 using the 08B flag; fills the `userIds: []` that 07/08 pass today |
| 10, 11 | Not started | Phase 3. Prompt 10 needs the LGU DPO sign-off on C17 (not obtained) |
| 12–16, A1 | Not started | Original order kept |

**Git:** last commit `6a7635b` (Prompts 00–06). **Everything since (06 review, 07, 08, the 07/08 review fixes, 08B) is uncommitted.** The user commits on `main` only when they ask.
- Not ours, do not touch or commit as ours: `mobile/app/home/index.tsx`, `mobile/src/components/emergency/HoldToSOS.tsx`, `mobile/src/components/emergency/SOSAlert.tsx`, `mobile/assets/login-page-background.png` (the user's own changes), `frontend/tsconfig.tsbuildinfo` (build cache).
- Untracked and ours: the two 2026-10-28 handoffs before this one, this file, the 08B migration folder, `confirm-reporter-patient.dto.ts`, and the Prompt 07 files (`transport-leg.service.ts`, `route-cache.service.ts`, `simplify-line.ts`, their specs, `backend/test/responders/`).

---

## How the user works

1. One prompt per session, then an independent review that checks code, DB and tests directly (never only the summary), fixes what is wrong, and corrects later prompts or the plan when the code disagrees.
2. They care most about **no duplication** and **accurate `schema.prisma` / DB data**. Before proposing a fix, prove the problem is reachable from a real client (they asked for "a real problem", not theory). When asked for a recommendation, give it first and wait for a yes before changing code.
3. §0 rule 1 is binding: do only what the prompt asks; anything else goes to Follow-ups.
4. They test on real devices and paste logs. Their terminal is **Git Bash**.
5. Commit only when asked.

---

## This session

### Independent review of Prompts 07 and 08: correct
Checked code, tests, DB, Redis and a live end-to-end probe. Fixes made:
- `updateTransport` erased `change_reason` when the same hospital was re-sent (the mobile picker does this). Now written only on a real change.
- `simplify-line.ts` comment overstated a guarantee (ties at the cut-off). Comment corrected; code unchanged.
- Plan §14: `eta_updated` / `route_updated` rows now say the incident room gets them only on TO_SCENE.

### Fixes #2 and #3 (user approved)
- **#2:** once `arrived_at` is set, nobody can change the destination: 409 `TRANSPORT_ARRIVED` (the arrival already stamped that hospital's referral). The web drawer already hid the button; the backend now matches. ETA edits after arrival still allowed. Plan §12 row updated.
- **#3:** the destination rule runs only when the hospital actually changes. One helper `selectNewDestination` (bottom of `transport.service.ts`) used by `updateTransport` and `recordArrival`; `beginTransport` returns "unchanged" / 409 `TRANSPORT_ALREADY_OPEN` before validating. Re-sending a hospital that went to PENDING_REVIEW no longer fails. Changing **to** a hospital in review is still refused.
- Deferred on purpose: AT_FACILITY "no route" repeats (Prompt 12), and the Org Administrator pin-move guard (see Open items).

### Prompt 08B (review all of it)
- Migration `backend/prisma/migrations/20261028120000_transport_reporter_patient_confirmation/` (`migration.sql` + `down.sql`): `transport_records.reporter_patient_confirmed_at TIMESTAMPTZ(6)`, `reporter_patient_confirmed_by_id UUID` FK → `users` `ON DELETE SET NULL`, CHECK `transport_records_reporter_patient_confirmed_pair_chk` (both set or both null).
- `schema.prisma`: the two fields + relation `"TransportReporterPatientConfirmedBy"` on `TransportRecord`; back-relation `User.transport_reporter_patient_confirmations`.
- `TransportService.confirmReporterIsPatient(incidentId, transportId, actor, confirmed)`: 404 → crew check 403 → open check 409 `TRANSPORT_NOT_OPEN` → registered reporter 400 → one `$transaction` with a conditional `updateMany` on `openTransportWhere({ id })` + `logInTransaction`. Same state requested → no write, no audit.
- `listTransports`: rows carry the two columns; staff (not hospital users) also get `reporterClaimsPatient` (`ReporterPatientHint`), computed from `incident_patients.count(is_reporter)` and `incident_reporters.reporter_status = 'NEEDS_HELP'` only.
- `PATCH /v1/incidents/:id/transport/:transportId/reporter-patient { confirmed: boolean }`, roles DISPATCHER/SUPERVISOR/RESPONDER, DTO `confirm-reporter-patient.dto.ts` (`@IsBoolean`).
- Deviations recorded: audit `entityType 'transport_record'` (not `'TransportRecord'`, to match every other transport audit row); repeat = no-op; hint not sent to hospital users; the guest 400 also applies to `confirmed: false`.

**Verification recorded (08B):** `test/incidents` 192 passed (transport spec 81); full backend 1003 tests, 1001 passed, 2 baseline failures; typecheck backend/frontend/mobile passed; lint 1 error / 285 warnings (+1 is `@Request() req: any` on the new route, same as the controller's other 32 routes); `migrate status` 22 migrations up to date; `migrate diff` → `-- This is an empty migration.`; CHECK probe (rolled back) behaves; boot maps the new route; live probe with real `AuditService` (rolled back): guest 400, confirm/repeat/withdraw correct, exactly 2 audit rows, after arrival `TRANSPORT_NOT_OPEN`, audit count 21 → 21 after rollback. Mutation check: disabling the guest check, the open check or the hospital-user exclusion each fails a test.

## What to check when reviewing 08B

- `git diff -w backend/prisma/schema.prisma` shows only the 08B lines; `npx prisma migrate status` and `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` stay clean; the constraint names in the DB match the migration (`pg_constraint` query pattern in the 08B report).
- `down.sql` really reverses `migration.sql` (do not run it on the dev DB unless you re-apply afterwards).
- No second "open transport" definition (`grep -rn "arrived_at: null" backend/src`); no patient name read for the hint; no realtime emit added (that is Prompt 09).
- The deviations above are acceptable, or correct them.
- Known interaction: the CHECK + `ON DELETE SET NULL` would refuse deleting a user who confirmed a transport. Unreachable today because `AdministrationService.deleteUser` refuses accounts with audit history. Decide whether that is good enough.

---

## Environment

- **Redis runs in WSL Ubuntu** (no Docker). After any Windows restart, or if Ubuntu stopped (it had stopped again at the start of this session), keep it awake from PowerShell: `Start-Process wsl -ArgumentList '-d','Ubuntu','--','sleep','infinity' -WindowStyle Hidden`, then `wsl -d Ubuntu -- redis-cli ping` → `PONG`. A hidden keep-alive was started this session and may still be running. Restart the backend after Redis is up (`RouteCacheService` and `SessionRevocationService` connect only at boot).
- PostgreSQL is native on Windows (:5432). Routing uses the public OSRM demo server.
- Boot check: `cd backend && BACKEND_PORT=3999 PORT=3999 timeout 150 npx nest start` (a dev server usually holds :3000).

## Baseline failures (pre-existing; do not "fix" as part of this work)

- Backend tests: `barangay-notify.spec.ts` › FALSE_ALERT; `auth-phase3` `BackupCodesService` timeouts (0–3 per run).
- Backend lint: 1 error `incidents.service.ts:91` unused `actorRole`; warnings now 285.
- Frontend: typecheck with `npx tsc --noEmit --incremental false`; `pnpm lint` cannot run. Mobile lint: 7 errors.
- Root `tests/` runner: second `@nestjs/common` copy breaks `instanceof`. Not in CI.

## How to verify quickly

- Real code against the local DB: a scratchpad `.ts` that `require`s `process.cwd() + '/src/...'`, run from `backend/` with `npx ts-node -r dotenv/config -T -O '{"module":"commonjs","experimentalDecorators":true,"emitDecoratorMetadata":true}' <script>`.
- Roll everything back: `prisma.$transaction(async (tx) => { …; throw ROLLBACK }, { timeout: 60000 })`. To run service methods that open their own `$transaction` inside it, pass `new Proxy(tx, { get: (t, k) => k === '$transaction' ? (fn) => fn(tx) : t[k] })` as the service's Prisma. Never let a probe commit an audit row (audit logs are immutable); compare `auditLog.count()` before and after.
- Real ids: use an existing user for actor ids (FKs on `incident_events`); `audit_logs` orders by `occurred_at`; `IncidentEvent` has `occurred_at`. Hospitals: Joni Villanueva `…0002-000000000006` (VERIFIED), Bocaue General `…0002-000000000001` (UNVERIFIED, no coordinates).
- Backend tsconfig uses `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Mutation check pattern used this session: copy the file to the scratchpad, apply an exact-match Python replace, run the spec, copy it back.

## Open items / follow-ups (full list in the progress log)

- Independent review of 08B (next session), then Prompt 09. Prompt 09 should read the 08B flag at emit time so a withdrawal stops the reporter's copies at once.
- `transport_records` has only its primary key. Recommended indexes: `dispatch_id`, `destination_id`, `incident_id` (needs its own migration and the user's go-ahead).
- Org Administrator `setLocation` can put an in-use hospital into PENDING_REVIEW and re-route ambulances to the unreviewed pin. Suggested: 409 while open transports head there. Not done (the user approved only #2 and #3).
- Still open from Prompt 08: `verifyLocation` does not notify open transports; receiving status AT_CAPACITY does not warn open transports; REST start sends no reporter/dispatcher notification; remove `incident.updated { transportUpdated }` after Prompt 12; `dto.patientId` not checked against the incident; no deactivation path calls `notifyFacilityChanged(…, 'deactivated')`.
- Manual device checks still pending from earlier prompts (see the 08 handoff list).
- LGU DPO sign-off on C17 (gates Prompt 10).
