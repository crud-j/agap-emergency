# Handoff: incident timeline push, dispatcher alerts, Resolve & Close fix, Verified Reporter

**Date:** 2026-10-22
**For:** the next session (or a teammate) picking this up cold.
**Modules:** MOD-16 (notifications), MOD-42 (user-facing status), MOD-45 (resolution and closure), MOD-21/23 (dispatch console).
**Status:** built and unit-tested; **not committed**; device and browser walkthrough **not done** (see "What's left").
**Earlier handoff for the same feature:** [2026-10-22_reporter-resolution-push.md](2026-10-22_reporter-resolution-push.md). It covers the push-token fix and the Firebase setup and is still accurate. This file is the current state.

---

## What the user asked for

1. A push for every step of the incident timeline, not just resolved and closed.
2. Notify the dispatcher too, not only the citizen.
3. Fix the **Resolve & Close Incident** dialog on the web console ("not well aligned") and make sure it works.
4. The citizen and responder apps should refresh home, incident history and the SOS button by themselves.
5. After an incident is successfully resolved, give the citizen a "token" showing they are a legitimate reporter, as thanks.

**Decisions the user made** (asked 2026-10-22):
- The token is a **Verified Reporter badge** derived from existing data. No certificate and no migration.
- Dispatcher alerts go to **the dispatcher who assigned the unit** (`dispatches.dispatcher_id`).

**Defaults I chose (not asked; easy to change):**
- CANCELLED sends nothing, because only the reporter cancels.
- A report counts as verified only when its incident reaches **CLOSED**. RESOLVED isn't enough: it can still be reviewed.
- Guest reporters get no badge and no thank-you card, because they have no lasting account.
- The dispatcher gets an in-app bell notification and a toast only. The web console has no device push.

---

## Confirmed working before this round

On the user's new dev APK, the citizen account registered its token (a `system_configurations` row `fcm_token:<userId>` holding `{"fcmToken":"..."}`), and the user confirmed push arrives. So Firebase, the token fix and the dev build are all good.

---

## What was built

### Backend
| File | Change |
|---|---|
| `src/notifications/incident-status-notifier.ts` | `notifyReporter(incidentId, status)` covers ACKNOWLEDGED, DISPATCHED, EN_ROUTE, ON_SCENE, TRANSPORTING, ASSISTING, RESOLVED, CLOSED, REFERRED, UNABLE_TO_RESPOND, FALSE_ALERT and DUPLICATE: a feed row first, then a push with `jobId reporter-status:{id}:{status}`. `notifyDispatcher(incidentId, status, dispatchId)` creates an IN_APP row for the assigning dispatcher on EN_ROUTE, ON_SCENE, TRANSPORTING, ASSISTING, and RESOLVED (event type `INCIDENT_AWAITING_CLOSURE`). Neither method throws. Messages contain only the `INC-…` reference and the unit call sign. |
| `src/incidents/incidents.service.ts` | New public `notifyReporterOfStatus()`, called from `updateStatus`, `markFalseAlert`, `markDuplicate` and `mergeDuplicate`. `createResolution` is now an **upsert** and refuses a CLOSED incident (see the bug below). New `getReporterStanding(userId)` and `getReporterStandingForIncident(id)`, both counts only. |
| `src/incidents/incidents.controller.ts` | `GET /v1/incidents/mine/standing` (any signed-in user, own counts). `GET /v1/incidents/:id/reporter-standing` (Dispatcher and Supervisor; `{ guest, standing }`). |
| `src/responders/responders.service.ts` | Every responder status calls `notifyReporter` and `notifyDispatcher`. |
| `src/dispatch/dispatch.service.ts` + `dispatch.module.ts` | The old hand-built "Help is on the way" push job is replaced by `notifyReporter(DISPATCHED)`, which adds a feed row and deduplication. The emergency-contacts SMS job is unchanged. |
| `src/false-alerts/false-alerts.service.ts` | Calls `incidents.notifyReporterOfStatus(FALSE_ALERT)`. |
| `test/notifications/reporter-status-push.spec.ts` | Covers the token helper, the processor, every timeline step, the dispatcher messages, both `updateStatus` paths, the resolution upsert and the standing counts. |
| `test/false-alerts/false-alerts.spec.ts` | Mock gains `notifyReporterOfStatus`. |

### Web console (`frontend/`)
| File | Change |
|---|---|
| `components/ui/select.tsx` | **Root cause of "not working":** the dropdown sat at `z-50`, behind the dialog (`z-[1310]`) and its overlay, so no outcome could be selected and the incident could never be closed. Now `z-[1320]`. |
| `components/ui/dialog.tsx` | Insets of 1 rem from the screen edges, scrolls when taller than the window, header `pr-8` so the title clears the ✕, and the footer stacks on narrow screens. **This is shared by every dialog in the console.** |
| `components/incidents/IncidentDetailDrawer.tsx` | `ResolutionDialog` rewritten: shows the reference and when it was marked resolved, uses labelled fields, resets the form when opened (before, Radix never called the reset), and shows a separate message when the outcome saved but the close failed. The Reporter section gains a `ReporterStandingLine` ("Verified reporter · N closed reports · M false alerts"). |
| `components/layout/NotificationBell.tsx` | Icons for `RESPONDER_*` and `INCIDENT_AWAITING_CLOSURE`, plus a live toast for each `notification.created`. Clicking the toast opens the incident. |
| `app/(ops)/operations/incidents/page.tsx` | `?id=<incidentId>` now opens the drawer. The bell always linked there, but the page ignored the parameter. Wrapped in `Suspense` because it uses `useSearchParams`. |
| `features/incidents/api.ts`, `hooks.ts` | `fetchReporterStanding` / `useReporterStanding`. |

### Mobile (`mobile/`)
| File | Change |
|---|---|
| `src/hooks/useLiveIncidentRefresh.ts` (new; mounted in `app/_layout.tsx`) | On `notification.created` (socket) or a push received while the app is open, it refreshes the notification feed, incident history, the active incident on home, the badge, the responder assignments and the responder's own status, plus that incident's detail screens (query keys in the code). |
| `src/hooks/useActiveIncident.ts` | **Bug fix:** `activeIncidentId` was never cleared, so home and the SOS button showed "View active incident" forever. It's now cleared once the incident leaves `ACTIVE_INCIDENT_STATUSES`; a failed fetch keeps it. |
| `app/incidents/[id].tsx` | Clears the active ID when the incident being viewed has ended. Shows `ReporterThanksCard` when the incident is CLOSED. |
| `src/components/reporter/verified-reporter.tsx` (new) | `useMyStanding`, `VerifiedReporterBadge` (profile) and `ReporterThanksCard`. |
| `app/profile/index.tsx` | Shows the badge below the identity card (signed-in citizens only). |
| `src/i18n/translations.ts` | New `reporter` section in English and Filipino. |
| `app/notifications/index.tsx` | Icons and labels for the new `INCIDENT_*` event types. |
| `app/responder/assignment/[id].tsx` | Also refreshes the responder's own status after an action, so the duty card shows Available right after a resolve. |
| `src/services/api/incidents.api.ts` | `getMyStanding()`. |

### Docs
- The earlier handoff has a "Round 2" summary of all of the above.

---

## Verification done

- Backend: `pnpm typecheck` clean; `pnpm jest --config ./test/jest.config.ts --testTimeout=30000` → **40 suites, 643 tests passed**.
  - With the default 5 s timeout, the bcrypt-heavy auth suites (BackupCodes, MFA, password sessions) can time out when the machine is busy (for example with the backend and Metro running). They don't touch this work and pass with the longer timeout.
- Frontend: `pnpm typecheck` clean; `pnpm test` → 59 passed.
- Mobile: `pnpm typecheck` clean; `pnpm test` → 8 passed.
- **Not done:** any manual check in the browser or on a phone. In particular, nobody has looked at the new dialog layout yet; it was fixed from the code alone.

---

## What's left

### 1. Walkthrough (restart the backend, reload Metro; no APK rebuild needed, all mobile changes are JavaScript)
- [ ] The citizen reports. The dispatcher acknowledges → the phone gets "Report received".
- [ ] Dispatch → "Help is on the way" (exactly **one** push; the old job was removed).
- [ ] The responder goes en route → on scene → resolved. The phone gets each push, and the **dispatcher's** bell and toast show en route, on scene, and "Awaiting closure".
- [ ] Clicking the toast or the bell row opens the incident drawer.
- [ ] **Resolve & Close:** both dropdowns open on top and can be picked; the dialog is centred with margins; the title clears the ✕. Close a window to about 600 px tall to check scrolling.
- [ ] After closing: the phone gets "Incident closed"; the SOS button and the home card go back to "Report"; history shows Closed; the incident shows the thank-you card; the profile shows "Verified Reporter · 1 verified report".
- [ ] The drawer for that citizen's next report shows "Verified reporter · 1 closed report".
- [ ] Mark a test incident as a false alert → the citizen gets the false-alert push, and the drawer's false-alert count goes up.
- [ ] With the `FIREBASE_*` lines blanked and the backend restarted, the same flow still completes, with only a log line about the skipped push.

### 2. Commit (nothing is committed yet; don't mix features)
The working tree also holds **role-dashboards Phases 3–4** (partly staged) and leftovers from the EAS account switch. Suggested order:
1. **Phases 3–4 first** (the user's work; the messages are in an earlier session). `incidents.service.ts`, `incidents.controller.ts`, `IncidentDetailDrawer.tsx` and `socket-provider.tsx` contain changes from both pieces of work, so stage this feature's parts with `git add -p`.
2. **Native Firebase setup**, its own commit: the real content change is only the `com.google.gms.google-services` plugin in `mobile/android/app/build.gradle` and its classpath in `mobile/android/build.gradle`, plus the new `mobile/android/app/google-services.json` (the Firebase client config; the copy in `mobile/` is already committed). Every other file under `mobile/android/` shows as modified only because of line endings from `expo prebuild`; check with `git diff --ignore-all-space --stat mobile/android` before staging.
3. **This feature**, e.g. `feat(notifications): incident timeline push, dispatcher alerts and Verified Reporter badge`. It includes the push-token fix and the `FIREBASE_*` env and docs rename from the earlier handoff.
4. **Do not commit `mobile/app.json`** unless the team is moving to the `catchy-sql` Expo account. `eas init` changed `projectId` from `a4b8b258-4898-4421-a2f2-ee8dee1c6102` (account `crud-dev`) to `8ca010d9-…`, and added `"owner": "catchy-sql"` and `"router": {}`. The `crud-dev` free build quota resets on 1 November 2026.

### 3. Security follow-up (carried over)
- [ ] Rotate the Firebase service-account key (key id `98d8ac11…` was pasted into an AI chat). The steps are in the earlier handoff under "Rotation pending".

### 4. Next planned work
- [Role dashboards plan](../plans/ROLE_DASHBOARDS_PLAN.md) **Phase 5a** (System Administrator: health, integrations, security events). Phases 1–4 still need their signed-in walkthroughs.
- In 5a, `integrations.push.configured` must check the **`FIREBASE_*`** variables. The plan text says "FCM credentials", but the `FCM_*` names were removed.

---

## Gotchas

- **Dialog changes are global:** `dialog.tsx` and `select.tsx` are shared. Spot-check one or two other dialogs and dropdowns (e.g. dispatch, administration) in the walkthrough.
- **Two "false alert" code paths:** `IncidentsService.markFalseAlert` and `FalseAlertsService.markFalseAlert` both exist, and both now notify. If one is removed later, keep the notify call.
- **Event-type naming:** the reporter feed uses `INCIDENT_<STATUS>`; dispatcher rows use `RESPONDER_<STATUS>` and `INCIDENT_AWAITING_CLOSURE`. The old `DISPATCH_CREATED` type is no longer produced; old rows still render.
- **Push deduplication is per status:** the BullMQ `jobId` is `reporter-status:{incidentId}:{status}`. If an incident ever goes through the same status twice, the second push is skipped while the first job is still kept in Redis. The feed row is still written.
- **Responders are not pushed** about incident changes; their screens refresh via the 15 s poll and their own actions. Only reporters get device pushes.
- Backend Jest: `pnpm jest --config ./test/jest.config.ts` (add `--testTimeout=30000` on a busy machine). Migrations: none needed for this work.
- Don't edit files with PowerShell `Get-Content`/`Set-Content` (they garble UTF-8).
