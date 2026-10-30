# Handoff: Hospital destination routing — Prompts 10 and 11 done, incident-access security fix

**Date:** 2026-10-29
**For:** the next agent, starting cold.
**First task:** ~~an independent review of everything done on 2026-10-29~~ **DONE 2026-10-29** (last section of the progress log; one gap fixed: `GET /incidents/:id/transport` crew check). **Now wait.** The user will paste **Prompt 12** themselves; do not start it on your own.
**Earlier handoffs (their facts still hold):** [`2026-10-28_…prompt-09-done.md`](./2026-10-28_hospital-destination-routing-prompt-09-done.md) and the ones it lists.
**Work:** [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md) through the prompt pack [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md). Progress log: [`docs/HOSPITAL_ROUTING_PROGRESS.md`](../HOSPITAL_ROUTING_PROGRESS.md). Its last six sections are the full write-ups of this session (the sixth is the review). This file is the summary.

---

## Where things stand

| Prompt | Status | Notes |
|---|---|---|
| 00–09 (incl. 08B) | DONE, reviewed | Prompt 09 reviewed 2026-10-29: correct, one geofence gap fixed |
| DPO waiver + `REPORTER_DESTINATION_SHARING_ENABLED` | DONE 2026-10-29, reviewed | Approved addition outside the pack |
| 10 Mobile responder UI | DONE 2026-10-29, reviewed | User ran it on an Android dev build: "it's working now". Per-row Table E results not recorded |
| 11 Mobile citizen tracking UI | DONE 2026-10-29, reviewed | Device check NOT RUN |
| Security fix: incident read access | DONE 2026-10-29, reviewed | Approved, outside the pack |
| Review of all the above + `GET :id/transport` crew check | DONE 2026-10-29 | Last progress-log section. Any responder could read any incident's transports; now staff/crew only (hospital users keep their own scoping) |
| 12 Dispatcher dashboard UI | **NEXT**, when the user pastes it | Completes plan Phase 3 |
| 13–16, A1 | Not started | Original order kept |

**Git:** last commit `6a7635b` (Prompts 00–06). **Everything since is uncommitted.** The user commits on `main` only when they ask.
- **Not ours, do not touch or commit as ours:** `mobile/app/home/index.tsx`, `mobile/src/components/emergency/HoldToSOS.tsx`, `mobile/src/components/emergency/SOSAlert.tsx`, `mobile/assets/login-page-background.png` (the user's own changes), `frontend/tsconfig.tsbuildinfo` (build cache).
- Everything else in `git status` is from the hospital-routing work (Prompts 06 to 11, the reviews and the fixes), including the 2026-10-28 handoffs and this one.

---

## How the user works

1. One prompt per session, then an independent review that checks code, DB and tests directly (never only the summary), fixes what is wrong, and corrects later prompts or the plan when the code disagrees.
2. They care most about **no duplication**, **accurate `schema.prisma` / DB data**, and solutions to **real problems that will not cause trouble at launch** (not theory). When you find a problem, **give the recommendation first and wait for a yes** before changing code.
3. §0 rule 1 is binding: do only what the prompt asks. Anything else goes to Follow-ups, or is proposed and approved first.
4. They test on real Android devices (development build, not Expo Go) and paste logs. Their terminal is **Git Bash**. They are not a privacy or legal specialist: explain terms plainly ("DPO" = the LGU's Data Protection Officer under RA 10173).
5. Commit only when asked.

---

## What was done on 2026-10-29 (review all of it)

### 1. Prompt 09 review and geofence fix
- Prompt 09 was correct. Schema and DB clean: `migrate status` 22 applied, `migrate diff` empty, no duplicate rows.
- Gap fixed: the crew's GPS outside Bocaue (inside Bulacan) was refused after **arrival** at a hospital outside Bocaue. It is now also accepted while the transport has arrived and the incident is not RESOLVED/CLOSED.
  - `atFacilityTransportWhere` + `AT_FACILITY_ENDED_STATUSES` in `backend/src/incidents/transport/open-transport.ts` (beside `openTransportWhere`).
  - `TransportLegService` reads the same constant. `assertResponderFixInArea` (`backend/src/locations/responder-fix-area.ts`) uses one `OR` count.

### 2. DPO waiver and the launch switch
- **Waiver** recorded: the DPO sign-off on C17 is skipped for **development only**. It is still required before production.
- **`REPORTER_DESTINATION_SHARING_ENABLED`**: a string flag, **off unless exactly `'true'`**. Enforced in one place, `TransportAudienceService.reporterSharingEnabled()`, with `load` setting `reporterConfirmedPatient` false while it is off. While off:
  - `PATCH …/transport/:tid/reporter-patient` → 403 "Sharing the hospital with the reporter is not enabled yet."
  - `GET /incidents/:id/transport` rows carry `reporterSharingEnabled` (staff/crew only), so the mobile switch hides.
- `ConfigService` injected into the audience service.

### 3. Prompt 10 (mobile responder)
- **New files:**
  - `mobile/src/lib/transport-target.ts`: `selectRouteTarget`, `shouldShowReporterPatientSwitch`, `buildDestinationList`, `isRouteLastKnown` (120 s), `SERVICE_AREA_BOUNDS`, `needsServiceAreaBounds`, `formatDistance`/`formatDuration`.
  - `mobile/src/hooks/useTransportRoute.ts`: the one leg-aware rule for both responder screens.
  - `mobile/src/components/responder/transport-banners.tsx`.
- **Changed:**
  - `assignment/[id].tsx`, `responder/map.tsx`, `DestinationPicker.tsx`, `navigate-button.tsx`, `external-nav.ts`, `live-tracking-map.tsx`.
  - `useIncidentTracking.ts`: route/transport events, 15 s poll only while disconnected, ref-counted room joins, returns `units`.
  - `incident-tracking.ts`: the location merge keeps `leg`/`destination`/`route`.
  - `assignment-progress.ts`: `arrive` action, `isTransportOpenError`.
  - `transport.api.ts`, `translations.ts` (`transport` namespace, en + fil).
- **Backend additions (deviations):**
  - `PATCH /incidents/:id/transport/:tid` returns `warnings`, the same shape as POST.
  - The transport list's facility select includes `municipality`.
- **Picker:** nearest VERIFIED hospitals from `/hospitals/nearby` first, then the other selectable ones from `/hospitals`. `/nearby` lists only VERIFIED hospitals, and an UNVERIFIED hospital must stay selectable.

### 4. Prompt 11 (mobile citizen)
- `mobile/src/lib/transport-view.ts`: `deriveTransportView(status, units)`. VISIBLE only when the server sent a `destination`. A cached position never counts. TRANSPORTING with no hospital-leg unit in the cache → the redacted view.
- `useIncidentTracking` returns `transportView` / `transportUnit`.
- `mobile/app/tracking/[id].tsx`:
  - VISIBLE: "Being taken to {hospital}" with ambulance, route and hospital marker.
  - REDACTED: status only + "For details, contact MDRRMO" with a call button. No ambulance, route or hospital name.
  - AT_FACILITY variants; COMPLETE.
- MDRRMO hotline moved to `mobile/src/config/hotlines.ts` (`bottom-nav.tsx` imports it). `transmission.tsx` unchanged.

### 5. Security fix: incident read access (found by the user on a device)
- **Cause, mobile:** a guest report's `activeIncidentId` stayed in memory after "Sign in", so the account showed the guest's incident.
- **Cause, backend:** `GET /incidents/:id` returned the full record (patients, assessments, reporter phone…) to **any** signed-in user. `/assessments`, `/resolution`, `/events` and `/timeline` had no object-level check at all.
- **Backend fix:** `requireParticipation` in `incidents.controller.ts`, with 403 otherwise.

  | Route | Allowed |
  |---|---|
  | `GET :id` | staff/crew → full record; reporter → `IncidentsService.findReporterView` (explicit allow-list, numeric coordinates) |
  | `:id/assessments`, `:id/resolution`, `:id/events` | staff/crew |
  | `:id/timeline` | staff/crew/reporter |

  `:id/status` (public guest status) and `:id/detail` (already ownership-scoped) unchanged.
- **Mobile fix:** `auth.store.ts` `login` resets the incident store only when the account changes. A token refresh re-calls `login` for the same user (`authed-fetch.ts`) and must keep the active incident.

## What to check in the review

- **Duplication:**
  - Open/at-facility rules live only in `open-transport.ts`: `grep -rn "arrived_at: null" backend/src` shows only `open-transport.ts` and the arrival guard.
  - The reporter-sharing flag is read only in `reporterSharingEnabled()`.
  - The leg rule on mobile lives only in `useTransportRoute` / `transport-target.ts`.
  - The MDRRMO number is defined only in `hotlines.ts`.
- **Privacy:**
  - No reporter path can show the destination while the flag is off (socket emits, `confirmedReporter`, REST seed).
  - The citizen screen never draws the ambulance or route in a REDACTED view.
  - `findReporterView` selects no sensitive relation.
- **Breakage risks:**
  - Every caller of the changed routes still works: mobile Home card and tracking use `GET :id`; the web console calls these routes as staff.
  - `findReporterView` keeps every field mobile reads (`id`, `status`, `public_reference`, `category`, `priority`, `incident_locations.latitude/longitude`).
- **Correctness:**
  - `saveDestination` (assignment screen) only PATCHes. "Decide later" saves nothing.
  - The arrival dialog → `recordArrival`; a 409 TRANSPORT_OPEN on resolve → readable message.
  - `mergeTransportUpdate` drops the route only when the hospital changed.
- **Deviations:** the ones listed in the progress log sections are acceptable, or need correcting.
- **Unverified claims:** anything marked NOT RUN.

## Environment

- **Redis runs in WSL Ubuntu** (no Docker). If it stopped: `Start-Process wsl -ArgumentList '-d','Ubuntu','--','sleep','infinity' -WindowStyle Hidden` from PowerShell, then `wsl -d Ubuntu -- redis-cli ping` → `PONG`. Restart the backend after Redis is up.
- PostgreSQL native on Windows (:5432). Routing uses the public OSRM demo server.
- Boot check: `cd backend && BACKEND_PORT=3999 PORT=3999 timeout 150 npx nest start`.
- **Mobile:** the Android development build works (no rebuild needed for JS changes). Expo Go cannot run MapLibre. After adding files, restart Metro with `npx expo start -c` (Metro on Windows drops new routes).
- **To see the C17 crew switch / a confirmed reporter's hospital view:** set `REPORTER_DESTINATION_SHARING_ENABLED=true` in `backend/.env` (dev only) and restart the backend. With the default (off), every reporter correctly sees the redacted view.
- **Bash tool:** long heredocs fail ("unexpected EOF"). Write scripts to the scratchpad with the Write tool and run them. Python edits on Windows: open with `newline=''` and keep the file's line endings (`core.autocrlf=true`).
- **Probes:**
  - Real DI: `NestFactory.createApplicationContext(AppModule, { logger: ['error'] })`, then `app.get(IncidentsController)` / services. Keep probes read-only, or roll back in a transaction.
  - Plain `PrismaClient` needs `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`.
  - Put probe `.ts` files in `backend/` (for module resolution) and delete them afterwards.
- **Mutation-check pattern:** a scratchpad Python script replaces an exact string, runs the spec (`npx.cmd jest …`, `encoding='utf-8'`), and restores the file in `finally`.

## Baselines after this session

**Backend:**
- `pnpm test` → 1098 tests (after the review fix). Pre-existing failures: `barangay-notify.spec.ts` › FALSE_ALERT; bcrypt-heavy `auth-phase2`/`auth-phase3` timeouts under full-suite load (0–3 per run; they pass alone).
- Lint: 1 error (`incidents.service.ts:91` unused `actorRole`), 284 warnings.

**Mobile:**
- `pnpm test` → 6 suites, 64 passed.
- `pnpm lint` → 6 errors / 53 warnings. All pre-existing, in files not touched by this work. It was 7 before Prompt 10, which removed one.
- `pnpm typecheck` passes.

**Frontend:**
- `npx tsc --noEmit --incremental false` passes.
- `pnpm lint` cannot run.

**Root `tests/` runner:** a second `@nestjs/common` copy breaks `instanceof`. Not in CI.

## Real ids and test points

- Dispatch `00000000-0000-0000-0006-000000000001` (incident `…0005-000000000001`; currently COMPLETED/RESOLVED).
- Hospitals: Joni Villanueva `…0002-000000000006` (VERIFIED, inside Bocaue, `14.79679, 120.94358`); Bocaue General `…0002-000000000001` (UNVERIFIED, no coordinates).
- Test points: Malolos `14.8433, 120.8114` (service area, outside Bocaue); Manila `14.5995, 120.9842` (outside both).
- MDRRMO hotline `0936 330 9020`.

## Open items / follow-ups (full list in the progress log)

- **Device checks:**
  - Table E "Responder" rows: the user reported "working", but the rows were not recorded one by one.
  - Table E "Citizen" rows with three registered reporters: NOT RUN.
  - The guest → "Sign in" re-check (Home should show no active incident): NOT RUN.
- **Security:** only the GET incident routes and (in the review) `GET :id/transport` were fixed. POST/PATCH in `incidents.controller.ts` and the sibling controllers (locations, responders, hospitals, chat) were not audited for the same object-level gap. A full access review is recommended; propose it, do not start it unasked.
- **MapLibre warnings** (not crashes):
  - `[ParseStyle]: source must have tiles`, from the configured style.
  - "`style` prop is deprecated, use `paint`/`layout`", for `<Layer style>` in `live-tracking-map.tsx` (needed before v12).
- `GET /incidents/:id/transport` cannot say whether the reporter is registered. A guest report shows the C17 switch and then the API's 400.
- The existing tracking-screen strings are still hard-coded English; only the new transport strings are translated.
- **Still open from earlier:**
  - `transport_records` has only its primary key (recommended indexes need the user's go-ahead and a migration).
  - `GET tracking/:id/eta` is not leg-aware.
  - Org Admin `setLocation` can re-route open transports.
  - `verifyLocation` / AT_CAPACITY do not notify open transports.
  - Remove `incident.updated { transportUpdated }` after Prompt 12.
  - `dto.patientId` is not checked against the incident.
  - No deactivation path calls `notifyFacilityChanged(…, 'deactivated')`.
- The LGU DPO sign-off on C17 is still required before production; until then keep `REPORTER_DESTINATION_SHARING_ENABLED` off.

## When the user pastes Prompt 12

- Gate: Phase 2 done (yes) and the review above done.
- Read the files the prompt lists. The web console must follow C20 (`resolveMissingStyleImages`, `styleDiffing={false}`, one `HospitalMarker`).
- `frontend/__tests__/live-tracking.spec.ts` is the test file to extend.
- Prompt 12 also expects the old `incident.updated { transportUpdated }` emit to become removable afterwards.
