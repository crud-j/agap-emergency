# Handoff: Gap audit, Medical incident type, dispatch recall/replace, crew medical profile

**Date:** 2026-11-13
**For:** the next agent, starting cold. This is the current handoff; read it first.
**First task:** ask the user how the **device and browser checks** went (section "Waiting on the user"), and whether they want dispatchers to read medical profiles (section "Open decision"). Then ask which item from "Next, from the gap audit" to do. Don't start one on your own.
**Earlier handoff:** [`2026-10-29_hospital-destination-routing-prompt-14-done.md`](./2026-10-29_hospital-destination-routing-prompt-14-done.md). Its facts about routing, the Prisma drift command and the frontend lint workaround still hold.

---

## Where things stand

| Item | Status | Notes |
|---|---|---|
| Risk map (MOD-51) questions | Answered, no code | Explained purpose and who uses it. Suggested: let Supervisors approve hotspot proposals (today System Admin only). Not done; user didn't answer |
| Gap audit ("what is still trash / solves no real problem") | DONE (report in chat, summarised below) | |
| 1. **Medical** incident type for citizens | DONE, tested, **not checked on a device** | |
| 2. Second unit on a Dispatched incident | **Already existed** (commit `1a52f28`) | The module reports were stale and said it was refused (finding P3-F1). Reports corrected |
| 2b. **Recall / replace a unit** (cancel / reassign) | DONE, tested, **not checked in a browser or on a device** | |
| 4. **Crew sees the patient's medical profile** | DONE, tested, **not checked on a device** | One open decision (below) |
| 3, 5, 6 from the audit | Not started | See "Next, from the gap audit" |

**Git:** last commit `8808917`. **Nothing from this session is committed**; the user commits on `main` only when asked.

**Uncommitted work that was already there before this session (not ours; don't revert or "fix" it):** ICS command history (`backend/prisma/migrations/20261112120000_ics_command_history/`, `backend/src/incidents/incident-command/`, `backend/src/notifications/ics-notifier.ts`, their specs, `frontend/features/incidents/ics-positions.ts`, command page/sections/hooks), `backend/prisma/schema.prisma`, `backend/src/incidents/{dto/incident-actions.dto,incidents.controller,incidents.module,incidents.service}.ts`, `backend/src/notifications/notifications.module.ts`, `backend/test/oversight/oversight.spec.ts`, the Sidebar / NotificationBell / socket-provider / role-access / oversight hooks on the web, mobile push registration (+ test), `docs/AGAP_Role_Rules_and_Dashboard_Content.md`, `docs/modules/MOD-36_*.md`, `DEMO.md`.
**Two files have both their edits and ours:** `mobile/app/responder/assignment/[id].tsx` (ours: the `PatientMedicalCard` import and render under the reporter photo) and `mobile/src/services/api/responders.api.ts` (ours: `patient_medical_shared`, `PatientMedicalProfile`, `getPatientMedicalProfile`).
`frontend/tsconfig.tsbuildinfo` was restored after typechecks.

## Waiting on the user

1. **Medical type (phone; reload Metro, no rebuild):** SOS → the type screen shows **Medical** first (2×2 grid) → details shows the 4 medical questions. Answer "not responding" or "chest pain": the incident arrives at **Immediate (CRITICAL)** with the reason on the dashboard.
2. **Recall / replace (web Dispatch screen + responder phone):** steps 3–5 in [MOD-31 report](../module-reports/MOD-31_Dispatcher_Assignment_and_Dispatch_Authorization.md) ("Test before signing (recall / replace)").
3. **Crew medical profile (phone):** the test in the "Crew access" note of [MOD-03](../module-reports/MOD-03_Medical_Profile.md), [MOD-32](../module-reports/MOD-32_Responder_Ambulance_Crew_Mobile_Interface.md) and [MOD-48](../module-reports/MOD-48_Privacy_Consent_and_Medical_Data_Protection.md).

## Open decision

**Dispatcher/Supervisor access to medical profiles was removed** together with the old `GET /v1/medical-profiles/:userId` route. Nothing called it, and the citizen's consent text says "responders… during an emergency". If the user wants dispatchers to read it (e.g. to brief the hospital), add it **incident-scoped**, logged the same way. Don't bring back the userId route.

## How the user works

1. Asks for one item at a time. Phrasing like "do this" or "investigate the current architecture" means **read the real code first, report what's actually there (including flaws), then implement**.
2. Always wants **typecheck on shared, backend, frontend and mobile**, **no errors, no duplication**, and checks against `schema.prisma`.
3. Cares about real launch problems, not theory. Wants plain explanations.
4. Tests on real Android devices (EAS dev build; JS-only changes need only a Metro reload) and in the browser. Commit only when asked.

## What this session changed

### Medical incident type (MOD-06/09/24)
- No schema change: `MEDICAL` already existed in `incident_category` and `IncidentType`, with HIGH default priority and an ambulance as base unit.
- [`shared/src/constants/incident-intake.ts`](../../shared/src/constants/incident-intake.ts):
  - `MEDICAL_QUESTIONS`: `conscious`, `breathing` (YNU), `condition` (multi: chest_pain, breathing_difficulty, stroke, bleeding, seizure, fall, labor, poisoning, other), `age`.
  - Raised to CRITICAL when not conscious, not breathing, chest pain, stroke signs or heavy bleeding.
  - Patient count isn't asked again (the details screen already has "How many people are affected?").
- Mobile: Medical card first in [`incident-type.tsx`](../../mobile/app/emergency/incident-type.tsx); `TYPE_META[MEDICAL]` in [`incident-details.tsx`](../../mobile/app/emergency/incident-details.tsx).
- Tests: 2 in `backend/test/incidents/incident-creation.spec.ts`.

### Recall / replace a unit (MOD-31, MOD-18, MOD-32)
- **Shared** [`shared/src/constants/dispatch-change.ts`](../../shared/src/constants/dispatch-change.ts):
  - `DISPATCH_CHANGE_REASONS` (OTHER needs a note, max 300 chars) and `CHANGEABLE_DISPATCH_STATUSES`.
  - `isDispatchChangeable`: open dispatch **and** `on_scene_at` null.
  - `describeDispatchChange`.
- **Backend** [`dispatch-release.ts`](../../backend/src/dispatch/dispatch-release.ts):
  - `lockIncidentAndDispatch`: incident lock, then dispatch. Same order as every other writer.
  - `releaseDispatchedUnit`: frees the unit only if `current_incident_id` is still this incident. If no active unit is left and the incident is DISPATCHED/EN_ROUTE, it goes back to **DISPATCH_PENDING**.
- **Backend** [`dispatch.service.ts`](../../backend/src/dispatch/dispatch.service.ts):
  - `create()` keeps its behaviour. Its two halves were split into `insertDispatch` (inside the transaction) and `announceDispatch` (after commit), so `reassign` reuses them.
  - `cancel(id, userId, {reason, notes})` and `reassign(id, {resourceId, reason, notes, crewIds}, userId)`.
  - Reassign is now **one transaction**: it locks the new resource, cancels the old dispatch, creates the new one with crew, and steps EN_ROUTE → DISPATCHED if nothing else is on the road.
  - Both refuse a unit already on scene (`UNIT_ON_SCENE`) or a closed dispatch (`DISPATCH_CLOSED`). Both write a timeline note and an audit entry with the reason.
  - DTOs: `CancelDispatchDto`, `ReassignDispatchDto` in `dto/dispatch-actions.dto.ts`. The controller passes the body through.
- **Backend** `responders.service.ts`:
  - Accept and decline require PENDING/SENT (`ASSIGNMENT_CLOSED`). A second accept is a no-op.
  - **Decline now frees the unit** and returns an incident left with no unit to DISPATCH_PENDING. Before, a declined unit stayed DISPATCHED forever.
  - `applyStatus` re-checks under the incident lock that the caller's dispatch is still active, so a late status update from a recalled unit is refused.
- **Web:**
  - [`UnitTrackingCard.tsx`](../../frontend/components/dispatch/UnitTrackingCard.tsx) now lists **every** active unit; before, pending ones were hidden when another unit was accepted. Each has **Replace / Recall** until on scene.
  - New [`UnitChangePanel.tsx`](../../frontend/components/dispatch/UnitChangePanel.tsx): reason chips, note, replacement unit with its on-duty home crew via `homeCrew`.
  - `useCancelDispatch` / `useReassignDispatch` share `invalidateDispatchViews` with `useCreateDispatch`.
  - The dispatch page shows the dispatch form again when a recall leaves the incident in DISPATCH_PENDING (`showTracking`).
- Tests: new `backend/test/dispatch/dispatch-change.spec.ts` (21). Updated mocks in `responder-assignment-push.spec.ts` and `dispatch-tracking.spec.ts`.

### Crew sees the patient's medical profile (MOD-03, MOD-32, MOD-48)
- **Flaw fixed:** the old route allowed access when the target was the incident's **reporter**, so a bystander's own allergies would have been shown for the stranger they reported (breaks rule 2). It also took an internal user id, let any dispatcher read any profile, allowed reads before accepting, and logged without `incident_id`.
- **The rule, in one place:** [`backend/src/medical-profiles/patient-medical-access.ts`](../../backend/src/medical-profiles/patient-medical-access.ts) `findSharedReporterProfile`. A profile is shared only when all of these hold:
  - the reporter is registered (not a guest);
  - `incident_patients.is_reporter` is true (the reporter chose "Also needs help");
  - medical consent is GRANTED and a profile exists;
  - the incident is in `ACTIVE_INCIDENT_STATUSES`.
  No `incident_patients.user_id` path (rule: never match another user as the patient).
- **Route:** `GET /v1/medical-profiles/assignments/:dispatchId` (RESPONDER only, `no-store`) → `MedicalProfilesService.findForAssignment`.
  - Requires the caller on an **ACCEPTED** dispatch.
  - Writes `sensitive_data_access_log` (with `incident_id`) and an audit READ.
  - Returns medical fields only, with `source: 'REPORTER_SELF_REPORTED'`.
  - 403 for a caller not on the crew (audited); 404 when nothing is shared.
- **Flag:** `getAssignment` adds `incidents.patient_medical_shared`, computed only when the dispatch is ACCEPTED. It is an existence check and reads no medical field.
- **Mobile:** new [`patient-medical-card.tsx`](../../mobile/src/components/responder/patient-medical-card.tsx) with `patientMedical` strings (en + fil). It stays closed until the crew taps **Show** (each read is logged), puts allergies first in red, says "self-reported", and Hide clears the data.
- Tests: new `backend/test/medical-profiles/patient-medical-access.spec.ts` (12). Old responder-route tests removed from `medical-encryption.spec.ts`.
- `mobile/app/emergency/reporter-patient.tsx` is an **orphan screen** (nothing navigates to it; it routes to a non-existent `/emergency/patient`). Left as is.

### Docs updated
Module reports MOD-03, 06, 09, 15, 18, 24, 31, 32, 48: stale "Do not claim" lines removed or rewritten, test steps added.

## Verification (last run)
- `pnpm typecheck`: shared, backend, frontend, mobile all exit 0. `shared` was rebuilt (`pnpm build`) after each change; backend and frontend read `shared/dist`, which is gitignored.
- Backend `npx jest --config ./test/jest.config.ts --maxWorkers=50%`: **2114 / 2115**. The one failure is `auth-phase3.spec.ts` "asks enrolled users for a second step", a **5 s timeout under load**. It and the other auth/ID-verification suites pass when run alone; this flake was seen before these changes too.
- Frontend `pnpm test`: 209 / 209. Mobile `pnpm test`: 260 / 260.
- Note: `pnpm test -- --maxWorkers=…` treats the flag as a test pattern; call jest directly as above.

## Next, from the gap audit (ask the user which)

Ordered by real-world impact:
1. **SMS fallback from the citizen's phone.** Today all Textbee SMS is sent **by the server after HTTPS succeeds**; the phone never sends SMS and the offline queue (MOD-19) was removed. With no data the citizen gets an error and hotlines ([`transmission.tsx`](../../mobile/app/emergency/transmission.tsx) ~L502). CLAUDE.md's "dual-path" claim isn't true on the phone. Idea: a "Send by SMS" button that opens the SMS app with the `AGAP|…` payload to the MDRRMO number, plus an inbound parser (see `backend/src/barangay-coordination/barangay-sms-poller.ts`).
2. **Announcement SMS ignores barangay.** `barangay_preference` is saved and never read; every subscriber gets every SMS (MOD-53). I wrongly told the user it was targeted, then corrected it.
3. **Dead code to wire or delete:**
   - the whole `emergency-alerts` controller (`/sos`, `/shake`, `/:id/cancel`, `/:id/status`; no client calls it);
   - `jobs/processors/escalation.processor.ts` and the `ESCALATION` queue (nothing enqueues);
   - `POST /incidents/:id/feedback`;
   - `DELETE`/`PATCH /users/me` (account deletion matters for the Data Privacy Act);
   - `deleteMedicalProfile()` (no screen);
   - contact priority, hospital edit, surge incident linking, announcement supersede.
4. **Same SLA timers for every priority** (MOD-24), so CRITICAL escalates no faster.
5. Lower value: Shake-to-Alert works only with the app open; AI photo review is off by default; settings aren't restored on a new phone (MOD-04); risk areas are owned by System Admin instead of MDRRMO.
6. Remaining gaps from this session: no **Decline** button on the responder app; no screen to change a dispatch's crew; the crew's "reporter is the patient" confirmation (transport, behind `REPORTER_DESTINATION_SHARING_ENABLED`) doesn't unlock the medical profile.

**Stale doc to fix when touched:** the MOD-29 report says nothing can verify a capability, but `PATCH /resources/:id/capabilities/:capId/verify` and the Registry tab now do. CLAUDE.md still describes the offline queue and phone-side dual path as working.
