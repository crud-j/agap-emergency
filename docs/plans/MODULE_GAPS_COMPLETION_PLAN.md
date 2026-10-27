# Plan: Close the Module Gaps Before the Report Check-Up

> **Status (2026-10-23):** All five phases built; typecheck clean; backend 48 suites / 763 tests, frontend 60, mobile 8. **Manual walkthroughs ("Done when") still to do** before each report is signed. Each phase has a status note below. Planned after the module review in [../100%ModulesFunctionalities+AdditionalModules.md](../100%ModulesFunctionalities+AdditionalModules.md).
> **How to use:** build one phase at a time. Each phase ends with a **Done when** checklist that must pass before the module's report is signed. The phases don't depend on each other, so they can be split between members.
> **Modules:** MOD-07 (Justine), MOD-50 (Arjar), MOD-38 and MOD-40 (Aldrin), MOD-51 (Jhobert).
> **Out of scope:** MOD-19 Offline Queue, which is eliminated (see [Decision: MOD-19](#decision-mod-19-is-eliminated)).

## Context

The 2026-10-22 review found five modules whose backend works but which fail the "100% functional" rule of the Individual Module Report. Either no screen uses the backend, or a screen shows empty data:

| Phase | MOD | Gap | Size |
|---|---|---|---|
| 1 | 07 Shake-to-Alert | The detector is never started. The "Shake on" chip is only a label. Phone reports are always saved as `MANUAL_REPORT`. | S |
| 2 | 50 Analytics | The response-time and SLA charts read `incident_metrics`, which nothing fills. Filters are ignored. | S–M |
| 3 | 38 Hospital Receiving | No screen calls `POST /hospitals/:id/referrals`. | M |
| 4 | 40 Transport | No screen calls `/incidents/:id/transport`; no destination or arrival can be recorded. | M |
| 5 | 51 Risk Intelligence | The backend can add, edit and delete risk areas; the web page can only list them. | S–M |

**Rules that apply to every phase (from `CLAUDE.md`):**
- Optional data never blocks an emergency (Rule 5). A destination, a referral or a shake setting must never stop a report or a dispatch.
- Every consequential action is audited (Rule 11).
- ETAs are labeled as estimates (Rule 13).
- Recommendations assist people; they never decide (Rule 8).
- No migrations are needed for any phase.

**After each phase:** run `pnpm typecheck`, the package tests (backend: `pnpm jest --config ./test/jest.config.ts --testTimeout=30000`), and a manual walkthrough. Then update the module's TO-BE in the member's report.

---

## Decision: MOD-19 is eliminated

**Date:** recorded 2026-10-22 (the code was removed in an earlier session; see [../SESSION_HANDOFF.md](../SESSION_HANDOFF.md)).

**Reason:** a report queued offline would be sent only when the phone reconnects. By then the reporter may have handled the emergency, or may have died. A late alert sends responders to a stale scene while live emergencies wait.

**What replaces it:** an immediate send with a clear failure message, the 911 and MDRRMO hotlines on failure, and a unique key per report so a manual resend never duplicates.

**Cleanup (optional, low priority, separate commit):**
- [ ] Remove MOD-19 references from `CLAUDE.md` (module table, mapping, "Offline Queue" section), `README.md` and `tests/http/sos-flow.http`. Mark the module as eliminated, not deleted, so the 53-module numbering stays.
- [ ] Leave the `offline_event_queue` table in place. Dropping it needs a destructive migration and buys nothing for the check-up.

---

## Phase 1 — MOD-07 Shake-to-Alert

**Goal:** shaking the phone on the home screen starts the same SOS flow as the button, after a short countdown that can be cancelled, and the incident is saved with `trigger_method = SHAKE_GESTURE`.

### What exists
- `mobile/src/services/shake-detector/shake-detector.service.ts`: `start(onShake)` and `stop()`, with a threshold of 2.5 g and a 2-second debounce. **Never called.**
- `mobile/src/components/emergency/SOSAlert.tsx`: `handleHoldComplete()` calls `startSOS()` and opens `/emergency/location`. The shake chip has no `onPress`, and its on/off state comes from `reducedMotion`.
- `backend/src/incidents/incidents.service.ts:121` hard-codes `trigger_method: 'MANUAL_REPORT'`. The phone submits through `POST /v1/incidents`, not `/v1/alerts/shake`.

### Steps
1. **Setting.**
   - Add `shakeToAlert: boolean` (default `true`) to `AccessibilityPrefs` in `mobile/src/stores/accessibility.store.ts`.
   - Add a toggle in `mobile/app/profile/accessibility.tsx`.
   - Add English and Filipino strings to `mobile/src/i18n/translations.ts`.
   - Stop deriving the chip from `reducedMotion`. Tapping the chip toggles the setting.
2. **Hook** `mobile/src/hooks/useShakeToAlert.ts` (new):
   - Starts `ShakeDetectorService` only while the home screen is focused (`useFocusEffect`), the app is in the foreground, `shakeToAlert` is on, and there is **no active incident**.
   - Stops on blur, background or unmount.
   - On a shake, opens the countdown.
3. **Countdown modal** `mobile/src/components/emergency/ShakeCountdown.tsx` (new):
   - A 5-second countdown with vibration (`expo-haptics`, if installed; otherwise `Vibration`), a large **Cancel** button, and **Send now**.
   - On timeout or Send now, call `startSOS('SHAKE_GESTURE')` and open `/emergency/location`, exactly like the button. GPS and every later step stay optional.
4. **Carry the trigger.**
   - In `mobile/src/stores/incident.store.ts`, add `triggerMethod: 'SOS_BUTTON' | 'SHAKE_GESTURE' | 'MANUAL_REPORT'` to the draft, and have `startSOS(trigger = 'SOS_BUTTON')` set it.
   - Include it in the `submitIncident` payload.
5. **Backend.**
   - Add optional `triggerMethod` to `CreateIncidentDto` (`@IsOptional() @IsIn(['SOS_BUTTON','SHAKE_GESTURE','MANUAL_REPORT'])`).
   - In `incidents.service.ts`, use `dto.triggerMethod ?? 'MANUAL_REPORT'`. Never accept `DISPATCHER_CREATED` or `SYSTEM_GENERATED` from the phone.
   - The idempotency check stays unchanged.
6. **Show it to dispatchers.** Display the trigger ("Shake", "SOS button", "Manual") in the incident drawer's Overview, if it isn't shown already.
7. **Tests.**
   - Backend: the DTO accepts the three allowed values, rejects others, and defaults to `MANUAL_REPORT`.
   - Mobile: the hook doesn't start when the setting is off or an incident is active (mock `expo-sensors`).

### Done when
- [ ] With the setting on, shaking the phone on the home screen shows the countdown; Cancel returns home without creating anything.
- [ ] Letting it run out opens Confirm Location. Submitting creates an incident with `trigger_method = SHAKE_GESTURE`, visible in the drawer.
- [ ] Holding the SOS button now saves `SOS_BUTTON`.
- [ ] No countdown appears with the setting off, on other screens, with the app in the background, or while an incident is active.
- [ ] The chip shows the real setting, and tapping it toggles.

### Phase 1 status (2026-10-23)

**Built.** `shakeToAlert` setting (store, Accessibility toggle, home chip), `useShakeToAlert` (home focused + foreground + setting on + no active incident), `ShakeCountdown` (5 s, haptics, Cancel / Send now), `startSOS('SHAKE_GESTURE')`, `triggerMethod` on the payload, DTO (`@IsIn` the three phone values) and service (`dto.triggerMethod ?? 'MANUAL_REPORT'`), trigger shown in the drawer Overview. The setting is device-only (not synced to the account).

**Open.** Step 7 tests are not written (DTO values, hook start conditions). The countdown text is English only; it is not yet in `translations.ts`.

---

## Phase 2 — MOD-50 Analytics: response times and SLA from incidents

**Goal:** the response-time and SLA-compliance charts show real numbers computed from the timestamps already on `incidents`. Every analytics chart honors the date range.

### What exists
- `backend/src/analytics/analytics.service.ts`:
  - `getResponseTimes` and `getSlaCompliance` query `incident_metrics`, which nothing fills.
  - `getPerformanceFromIncidents` already shows the correct pattern (`AVG(EXTRACT(EPOCH FROM (acknowledged_at - submitted_at)))`).
  - Every method takes `_filters` and ignores it.
- `sla_policies`: `acknowledge_threshold_secs` (default 120), `dispatch_threshold_secs` (300) and `on_scene_threshold_secs` (900), optionally per category or priority.
- `incidents` has `submitted_at`, `acknowledged_at`, `dispatched_at`, `on_scene_at` and `resolved_at`.

### Steps
1. **Response times.** Rewrite `getResponseTimes` as one `$queryRaw` grouped by `category`.
   - Keep the **same response shape** the frontend already reads (`category`, `_avg.{acknowledge,dispatch,response,total}_duration_secs`, `_count._all`), so `frontend/app/(ops)/analytics/page.tsx` needs no change.
   - Definitions:
     - acknowledge = `acknowledged_at − submitted_at`
     - dispatch = `dispatched_at − submitted_at`
     - response = `on_scene_at − submitted_at`
     - total = `resolved_at − submitted_at`
   - Exclude `DRAFT` and `DUPLICATE`. A missing timestamp is skipped (`AVG` ignores nulls); null is returned, never 0.
2. **SLA compliance.** Rewrite `getSlaCompliance`:
   - For each incident, pick the threshold from the most specific active `sla_policies` row: category and priority, then category, then the default row with both null. Fall back to 120 and 300 seconds.
   - "Met" means the interval ≤ the threshold. The total counts only incidents that reached that step.
   - Keep the returned keys (`total`, `acknowledgeSlaMet`, `dispatchSlaMet`, `acknowledgeCompliancePct`, `dispatchCompliancePct`). With nothing to count, return the percentages as `null` and have the page show "No data" instead of 0%.
3. **Date range.**
   - Read `from` and `to` (ISO dates) in `analytics.controller.ts` for `response-times`, `volume`, `sla-compliance`, `false-alert-rate` and `resource-utilization`, and apply `submitted_at BETWEEN from AND to`.
   - Default to the last 30 days.
   - Add a 7 / 30 / 90-day selector to the analytics page and pass it through `frontend/features/analytics/api.ts` and `hooks.ts` (include the range in the query keys).
4. **Leave `incident_metrics` alone.** Remove the code that reads it, and add a one-line comment that the figures come from `incidents`.
5. **Tests** in `backend/test/analytics/`: seed incidents with known timestamps and one category policy. Check the averages, the SLA counts, null handling, and the date filter.

### Done when
- [ ] After a test incident goes through acknowledge → dispatch → on scene → resolve, the response-time chart shows its category with plausible seconds.
- [ ] The SLA ring gauges show real percentages. One incident acknowledged slower than its threshold lowers the acknowledge percentage.
- [ ] Changing the range changes the numbers; an empty range shows "No data", not 0%.
- [ ] The volume and false-alert charts still render.

### Phase 2 status (2026-10-23)

**Built.** `getResponseTimes` and `getSlaCompliance` read `incidents` (same response shape; null, never 0, when nothing is measured); the SLA threshold comes from the most specific active `sla_policies` row, falling back to 120 / 300 s. `from`/`to` on all five endpoints (default last 30 days; bad or reversed dates → 400). 7 / 30 / 90-day selector; "No data" instead of 0%.

**Fixed in review.** The page rebuilt the range on every render, so the query keys changed each render and the page kept refetching. The range is now memoized per selection.

**Open.** Step 5 tests (`backend/test/analytics/`) are not written. A category-only and a priority-only policy currently rank equally. The false-alert rate counts `false_alerts` rows, not distinct incidents.

---

## Phase 3 — MOD-38 "Refer to hospital"

**Goal:** a dispatcher or supervisor creates a hospital referral from the incident drawer. The hospital user sees it on the Hospitals page within about 20 seconds and can acknowledge it and mark the patient arrived (both already work).

### What exists
- `POST /v1/hospitals/:id/referrals` (Responder, Dispatcher, Supervisor). Its body type is `CreateReferralDto & { incidentId }`. With an intersection type, Nest's `ValidationPipe` gets `Object` as the type, so **the body isn't validated at all**.
- `HospitalsService.createReferral` doesn't check the incident, doesn't audit, and allows duplicates.
- The Hospitals page lists referrals with a 20-second refresh, and has acknowledge and arrived actions.

### Steps
1. **Backend hardening** (`backend/src/hospitals`):
   - Add `@IsUUID() incidentId: string` to `CreateReferralDto`, change the controller body type to the DTO, and make `dispatchId` and `patientId` `@IsUUID()`.
   - Make `etaMinutes` `@Min(0) @Max(600)` and `preArrivalNotes` `@MaxLength(1000)`.
   - In `createReferral`:
     - Check that the incident exists and isn't terminal (CLOSED, CANCELLED, FALSE_ALERT, DUPLICATE).
     - If a dispatch is given, check that it belongs to the incident.
     - Refuse a second PENDING referral for the same incident and hospital (409).
   - Write an audit row (`moduleId: 'MOD-38'`, entity `facility_referral`).
   - Create an IN_APP notification for the hospital's users (via `NotificationsService`, if it supports per-organization recipients; otherwise skip and rely on the 20-second refresh).
   - Make `GET /v1/incidents/:id/referrals` (or reuse an existing route) list an incident's referrals for the drawer.
2. **Web** (`frontend/components/incidents/IncidentDetailDrawer.tsx`):
   - Add a **Refer to hospital** button for Dispatcher and Supervisor while the incident is between DISPATCHED and TRANSPORTING.
   - The dialog contains:
     - a hospital select (`useHospitals()`)
     - a dispatch select, defaulting to the active dispatch
     - pre-arrival notes, with a hint not to put names in them
     - an ETA in minutes, labeled "estimated"
   - On success, show a toast and add a "Referrals" list to the Overview: hospital, status (Pending, Acknowledged, Arrived) and time.
   - Add `createReferral` and `useCreateReferral` to `frontend/features/hospitals/api.ts` and `hooks.ts`. Invalidate the incident's and the hospital's referral queries.
3. **Tests.** Backend: validation rejects a bad `incidentId`, refuses terminal incidents, returns 409 on a duplicate pending referral, and writes an audit row.

### Done when
- [ ] The dispatcher refers a dispatched test incident to a seeded hospital; the drawer shows it as Pending.
- [ ] Signed in as the hospital user, the referral appears within 20 seconds. Acknowledge, then Arrived, both update the drawer.
- [ ] A second referral to the same hospital while the first is pending is refused with a clear message.
- [ ] The audit viewer shows the referral creation.

### Phase 3 status (2026-10-23)

**Built.** `CreateReferralDto` now carries `incidentId` and is validated; the service checks hospital, incident (not terminal), dispatch and patient ownership, refuses a second pending referral (409), audits (`MOD-38`, `facility_referral`) and sends an in-app notification to the hospital organization's members. The incident's referrals are listed at `GET /v1/hospitals/referrals/incident/:incidentId` (not under `/incidents`). Drawer: **Refer to hospital** (Dispatcher, Supervisor; DISPATCHED → TRANSPORTING) and a Referrals list.

**Fixed in review (access).** The older referral routes only required a sign-in, so any account could read pre-arrival notes or mark arrival.
- Reading referrals: Dispatcher, Supervisor, Responder, Hospital User. A hospital user only sees hospitals whose organization they belong to.
- Acknowledge: Hospital User (own hospital). Arrived: Hospital User (own hospital), Dispatcher, Supervisor. A second arrival is refused.
- Acknowledge and arrival now write audit rows and refresh the drawer.
- The Hospitals page no longer loads referrals for the System Administrator, and shows **Acknowledge** to hospital users only.
- Tests: `backend/test/hospitals/referrals.spec.ts` (DTO, terminal incidents, 409, audit, hospital scope, route roles).

**Open.** No success toast. The pending-duplicate check has no unique index behind it.

---

## Phase 4 — MOD-40 Transport destination picker

**Goal:** when a responder taps **Transporting**, they can pick the destination hospital, or choose **Decide later**. Arrival is recorded with one tap. Dispatchers see the transport and can change the destination.

### What exists
- `POST /v1/incidents/:id/transport` (`dispatchId` required; `destinationId`, `patientId` and `estimatedArrivalAt` optional). It moves the incident to TRANSPORTING only if it is ON_SCENE or ASSISTING; otherwise it just records the transport.
- `PATCH /:id/transport/:transportId/arrive` and `PATCH /:id/transport/:transportId` (change the destination; Dispatcher and Supervisor). `GET /:id/transport`.
- Responder app: `mobile/src/lib/assignment-progress.ts` offers "Transporting", and `mobile/app/responder/assignment/[id].tsx` calls `updateAssignmentStatus(dispatchId, 'TRANSPORTING')`. That path sends the reporter and dispatcher notifications, which must be kept.
- Hospital rows are `facility` rows, so their IDs are valid `destinationId`s.

### Steps
1. **Order of calls (keeps the existing notifications, avoids a double status change):**
   1. `updateAssignmentStatus(dispatchId, 'TRANSPORTING')`, unchanged.
   2. Then `POST /incidents/:id/transport { dispatchId, destinationId? }`. The incident is already TRANSPORTING, so the service only records the transport and emits `incident.transporting`.
   - If step 2 fails, keep the status, show "Destination not saved, tap to retry" on the assignment screen, and never roll back the status.
2. **Mobile picker** `mobile/src/components/responder/DestinationPicker.tsx` (new):
   - A bottom sheet listing hospitals from `GET /v1/hospitals`, sorted by distance from the responder's last position when coordinates exist, with a search box.
   - **Decide later** is always the first option.
   - Add `listHospitals`, `startTransport`, `recordArrival` and `listTransports` to a new `mobile/src/services/api/transport.api.ts`.
3. **Assignment screen.** While TRANSPORTING:
   - Show the destination (or "Not set" with **Set destination**).
   - Show an **Arrived at hospital** button that calls `/arrive`.
   - Show the estimated arrival, labeled "est.", if set.
4. **Web drawer.** Add a Transport section in Overview for any incident with transport records:
   - destination, started, est. arrival, arrived
   - **Change destination** for Dispatcher and Supervisor (hospital select → `PATCH`, with an optional reason)
   - Add hooks in `frontend/features/incidents`. Refresh on `incident.transporting` and `incident.facility_arrival` in `socket-provider.tsx` (invalidate the incident's transport query).
5. **Backend checks.**
   - In `startTransport`: refuse a second open transport (no `arrived_at`) on the same dispatch (409), and check that `destinationId`, if given, is an active facility.
   - Add an audit row for `recordArrival` and `updateTransport`, if they don't write one already.
6. **Tests.** Backend: a duplicate open transport is refused; a bad destination is refused; arrival sets `arrived_at`. Mobile: the order of calls, and that a failed transport call keeps TRANSPORTING.

### Done when
- [ ] The responder taps Transporting and picks a hospital. The incident is TRANSPORTING, and the drawer's Transport section shows the hospital within a few seconds.
- [ ] Choosing Decide later still sets TRANSPORTING; **Set destination** works afterwards.
- [ ] Arrived at hospital records the arrival time in the app and in the drawer.
- [ ] The dispatcher changes the destination, and the responder's screen shows the new hospital after it refreshes.
- [ ] The reporter still gets exactly one "Transporting" push.

### Phase 4 status (2026-10-23)

**Built.** Call order as planned (status first, then `POST /transport`; a failed transport call keeps TRANSPORTING and shows "Destination not saved, tap to retry"). `DestinationPicker` (Decide later first, distance sort, search), destination / est. arrival / **Arrived at hospital** on the assignment screen, drawer Transport section with **Change destination**, socket refresh on `incident.transporting` and `incident.facility_arrival`. Backend: second open transport → 409, inactive destination → 400, crew check for responders, `UpdateTransportDto`, audit on arrival and update. Responders may set the destination after "Decide later" (crew only, before arrival).

**Fixed in review.**
- The assignment screen used every transport on the incident. With several units it could show another crew's hospital, or fail with 403. It now uses only this dispatch's transports.
- After arrival, **Change destination** stayed visible and opened a second transport. After arrival the card now shows the arrival time only.

**Open.** Mobile tests (call order) are not written. A destination change made by another dispatcher sends `incident.updated`, which does not refresh the drawer's transport list (the 20 s refresh or reopening the drawer does).

---

## Phase 5 — MOD-51 Risk-area management dialog

**Goal:** a System Administrator adds, edits, deactivates and deletes risk areas from the Risk page. Everyone else keeps read-only access.

### What exists
- `POST /v1/risk-intelligence/areas`, `PATCH /areas/:id` and `DELETE /areas/:id` (System Administrator). Their bodies are inline object types, so **nothing validates them**.
- `risk_areas` columns: `name`, `description`, `risk_type` (incident category), `risk_level` (text, default `MODERATE`), `barangay`, `flood_threshold_meters`, `is_active`, and `area_boundary` (geography).
- `frontend/app/(ops)/operations/risk/page.tsx` lists the areas in a side panel; `frontend/features/risk/api.ts` only has GET.

### Steps
1. **Backend DTOs** in `backend/src/risk-intelligence/dto/`:
   - `CreateRiskAreaDto`:
     - `name`: `@IsString @MaxLength(255)`
     - `riskType`: `@IsEnum(IncidentCategory)`
     - `riskLevel`: `@IsIn(['LOW','MODERATE','HIGH','CRITICAL'])`
     - `barangay`: optional, from the Bocaue barangay list
     - `floodThresholdMeters`: optional, `@Min(0) @Max(30)`
     - `description`: optional, `@MaxLength(1000)`
   - `UpdateRiskAreaDto` (partial, plus `isActive`).
   - Use them in the controller. Write an audit row on create, update and delete (`moduleId: 'MOD-51'`).
2. **Frontend API and hooks:** `createRiskArea`, `updateRiskArea` and `deleteRiskArea`, plus mutations that invalidate the areas and heatmap queries.
3. **UI** (System Administrator only, using `useAuthUser()`):
   - An **Add risk area** button in the side panel, and **Edit** and **Delete** on each row.
   - A dialog with name, type, level, barangay select, flood threshold (shown only for FLOOD, hinted "Bocaue River critical level: 11.50 m"), description and an Active switch.
   - Delete asks for confirmation. Prefer **Deactivate**, and offer Delete as the secondary action.
4. **Boundary drawing is out of scope.** `area_boundary` stays as seeded. New areas show in the list and attach to a barangay. Say so in the TO-BE.
5. **Tests.** Backend: an unknown `riskLevel` and a negative threshold are rejected, a non-administrator gets 403, and an audit row is written.

### Done when
- [ ] Signed in as the System Administrator: add a FLOOD area for Lolomboy with a threshold of 11.50 m; it appears in the list.
- [ ] Edit its level; deactivate it; delete a test area. Each change shows immediately and appears in the audit viewer.
- [ ] Signed in as a Supervisor or Dispatcher: no add, edit or delete controls; the page still shows the map and the list.

### Phase 5 status (2026-10-23)

**Data review.**
- **Role conflict:** since role dashboards Phase 5b, the System Administrator cannot open `/operations/risk`, and `GET /areas`, `/heatmap` and `/map-points` refuse it. "From the Risk page" was no longer possible without undoing 5b. **Decision (Jhobert, 2026-10-23):** manage risk areas on a new **Administration → Risk Areas** page; open only `GET /areas` to the System Administrator.
- **The dev `risk_areas` table is empty**, so "boundary stays as seeded" has nothing to keep; every area starts without a boundary. Nothing references `risk_areas` (no foreign keys), so delete is safe.
- `updated_at` has no `@updatedAt`, so updates never moved it. The service now sets it.
- `flood_threshold_meters` is a Prisma `Decimal` and reaches the browser as a string (`"11.50"`). The frontend type now says so and converts it.
- **Barangay spelling:** the database says **Tambubong**; `frontend/features/announcements/templates.ts` says *Tambobong*. The dialog uses the database list (`GET /barangays/contacts`), and the backend checks the name against `geo_regions` and stores the official spelling. The announcement constant is not changed here.

**Built.**
- `backend/src/risk-intelligence/dto/risk-area.dto.ts` (`CreateRiskAreaDto`, `UpdateRiskAreaDto`); the controller uses them, so the global `ValidationPipe` now rejects bad levels, types, thresholds and unknown fields.
- Service: barangay checked against `geo_regions` (empty clears it), audit rows on create, update and delete (`moduleId: 'MOD-51'`, entity `risk_area`, old and new values; a delete keeps what was removed).
- Frontend: `createRiskArea`/`updateRiskArea`/`deleteRiskArea` and hooks that refresh the areas, flood zones and heatmap; `components/admin/RiskAreasTab.tsx` and `/administration/risk-areas` with the add/edit dialog (flood threshold only for FLOOD, with the 11.50 m hint; Active switch on edit) and a remove dialog that offers **Deactivate** first and **Delete** second; a "Risk Areas" sidebar link for the System Administrator.
- Risk page: still read-only for everyone; it now shows **active** areas only, so a deactivated area disappears from the map and the "Other Risk Areas" list.

**Verified.** `backend/test/risk-intelligence/risk-areas.spec.ts` (13 tests: unknown level, negative and >30 m thresholds, unknown type and fields rejected; only the System Administrator may write; it gets the list but not the heatmap; audit rows; barangay check). Backend 47 suites / 742 tests; frontend 60 tests; both typechecks clean.

**Done when, adjusted.** Read "Signed in as the System Administrator" as **Administration → Risk Areas**, and check the result on the Risk page as a Supervisor.

---

## After all phases

- [x] Update [../100%ModulesFunctionalities+AdditionalModules.md](../100%ModulesFunctionalities+AdditionalModules.md): move each finished module to ✅ and update its "What works" text. Done 2026-10-23, marked "walkthrough pending" until each **Done when** list passes.
- [ ] Each owner updates their report's TO-BE inputs, steps and outputs to match, takes screenshots, and asks the leader to sign.
- [ ] Commit each phase on its own (for example `feat(mobile): shake-to-alert with countdown (MOD-07)`).
