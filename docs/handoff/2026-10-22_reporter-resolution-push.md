# Handoff: Push the reporter when their incident is resolved or closed

**Date:** 2026-10-22
**For:** a fresh session (or a teammate) building this feature from scratch.
**Modules:** MOD-16 (notifications), MOD-42 (user-facing status), MOD-45 (resolution and closure).
**Status:** built 2026-10-22, not yet committed and not yet tested on a device. Built as designed below with the defaults for the open decisions (two pushes for resolved-then-closed; no push for CANCELLED / FALSE_ALERT / UNABLE_TO_RESPOND / REFERRED; no SMS fallback). New files: `backend/src/notifications/push-token.ts`, `backend/src/notifications/incident-status-notifier.ts`, `backend/test/notifications/reporter-status-push.spec.ts`. The device checks under "Done when" are still open.

**Current state and next steps:** see [2026-10-22_incident-timeline-push-and-verified-reporter.md](2026-10-22_incident-timeline-push-and-verified-reporter.md).

**Round 2 (2026-10-22, after push worked on the dev APK):**
- **Whole timeline:** the reporter now gets a feed row and a push for ACKNOWLEDGED, DISPATCHED (replaces the old "Help is on the way" job), EN_ROUTE, ON_SCENE, TRANSPORTING, ASSISTING, RESOLVED, CLOSED, REFERRED, UNABLE_TO_RESPOND, FALSE_ALERT and DUPLICATE. CANCELLED is skipped (only the reporter cancels). The calls are in `incidents.service` (`notifyReporterOfStatus`), `false-alerts.service`, `responders.service` and `dispatch.service`.
- **Dispatcher:** responder steps (en route, on scene, transporting, assisting, resolved) create an in-app notification for the dispatcher who assigned the unit (`dispatches.dispatcher_id`, always set). RESOLVED reads "Awaiting closure". The web bell shows a live toast that opens the incident, and `/operations/incidents?id=` now opens the drawer.
- **Resolve & Close dialog:** the dropdowns opened behind the dialog (`z-50` under `z-[1310]`), so no outcome could be picked. Also fixed: edge insets and scrolling, title clear of the close button, stale form on reopen, and a retry after a failed close (the resolution is now an upsert until CLOSED).
- **Mobile refresh:** `useLiveIncidentRefresh` (root layout) refetches home, history, SOS state, badge and responder tabs on `notification.created` or a foreground push. `activeIncidentId` is now cleared once the incident ends; before, the SOS button stayed on "View active" forever.
- **Verified Reporter:** `GET /incidents/mine/standing` (citizen) and `GET /incidents/:id/reporter-standing` (Dispatcher, Supervisor); counts only, no migration. A report is verified once its incident is CLOSED. Shown on the profile, as a thank-you card on a closed incident, and in the dispatcher drawer with the false-alert count.

---

## The request

When a reporter's incident becomes **RESOLVED** or **CLOSED**, send a push notification to the reporter's phone, so they learn about it even with the app closed.

**Why it's needed:** today the reporter only finds out over the live connection. The backend emits `incident.status_changed` and `incident.resolved` / `incident.closed` to the `incident:{id}` room (`realtime.service.ts` `statusChanged()`, lines 95–111), and only an app that is open and connected receives them. Nothing is queued for a closed app.

**Who sets these statuses** (keep this split; CLAUDE.md: "Responder cannot close"):

| Status | Set by | Code path |
|---|---|---|
| `RESOLVED` | Responder crew in the mobile app | `responders.service.ts` `updateStatus()` (line 341; `resolving` at line 371) |
| `RESOLVED` or `CLOSED` | Dispatcher / Supervisor in the web console | `incidents.service.ts` `updateStatus()` (line 443); `close()` (line 812) calls it |
| `CLOSED` from `REFERRED` | Barangay callback | `barangay-callback.service.ts` line 287 calls `incidents.updateStatus()` |

`createResolution()` (`incidents.service.ts` line 787) only writes `incident_resolutions`; it does not change the status. So the two `updateStatus()` methods are the only places to hook.

---

## Read this first: push is broken today, for every feature

Two findings, both blocking. Fix them as part of this work, or the feature can't be tested.

### 1. Token shape mismatch (code bug)

- `notifications.service.ts` `registerToken()` (line ~94) stores the device token as **an object**: `system_configurations` row `fcm_token:{userId}`, `config_value = { fcmToken: "<token>" }`.
- `jobs/processors/notification.processor.ts` `sendPush()` (line ~70) reads `tokenRecord?.config_value as string` and passes **the object** to Firebase as the token. Every send through this worker fails.
- `announcement-push.processor.ts` (lines ~125–135) already accepts both shapes (raw string or `{ fcmToken }`). That's why announcements were written correctly and the others weren't.
- **Affected today:** every push through `QUEUE_NAMES.NOTIFICATIONS`, including "Help is on the way" (`dispatch.service.ts` ~line 197), the SOS push (`emergency-alerts.service.ts` ~line 157) and escalation pushes (`escalation.processor.ts` ~line 57).
- **Fix:** one small shared helper (e.g. `tokenFromConfig(value): string | null`) used by both processors, plus a unit test for both shapes.

### 2. Firebase credentials: what exists, what's missing

Checked 2026-10-22 (secret values were never printed).

**Firebase project:** `agap-emergency` (project number `624197658996`).

**Mobile side: done.**
- `mobile/google-services.json` exists for project `agap-emergency`, with Android package `com.agap.emergency`. That matches `mobile/app.json` (`android.package` and `ios.bundleIdentifier` are both `com.agap.emergency`).
- This file is the Android **client** config. It is committed (`git ls-files` lists it), which is normal for Firebase. It does **not** contain the server credentials the backend needs: its `api_key` is a client key, not a service account.
- Optional hardening: restrict that API key to the Android app in Google Cloud console → APIs & Services → Credentials.

**Backend: the code reads `FIREBASE_*` only.**
- Both `jobs/processors/notification.processor.ts` (lines 30–32) and `announcement-push.processor.ts` (lines 29–31) read exactly `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`. The private key has `\n` turned into newlines.
- The `FCM_PROJECT_ID` / `FCM_CLIENT_EMAIL` / `FCM_PRIVATE_KEY` names in the root `.env.example` (and in `backend/.env`, set to placeholders) are **read by nothing**. They're stale names. **Task:** rename them to the `FIREBASE_*` names in `.env.example` (placeholders only), and delete the unused `FCM_*` lines from `backend/.env`, so nobody fills in the wrong ones.

**State of `backend/.env` (gitignored; confirmed by `git check-ignore`):**

| Line | Variable | State |
|---|---|---|
| 85 | `FIREBASE_PROJECT_ID` | ✅ `agap-emergency` (spaces around `=` removed) |
| 86 | `FIREBASE_CLIENT_EMAIL` | ✅ set (`firebase-adminsdk-fbsvc@agap-emergency.iam.gserviceaccount.com`) |
| 87 | `FIREBASE_PRIVATE_KEY` | ✅ set, one line, double-quoted, `
` escapes |

**Update 2026-10-22: credentials are in place and verified.** The values were copied from the service-account key file (key id `98d8ac11…`) into `backend/.env`, and the credential check below printed `Firebase credentials OK for agap-emergency`. The backend should now log `Firebase Admin initialized` on start.

**Rotation pending:** this key's contents were pasted into an AI chat session, so treat it as exposed. When the feature works, the user should generate a new key (Firebase console → Service accounts → Generate new private key), delete key `98d8ac11…` under Google Cloud console → IAM → Service accounts → `firebase-adminsdk-fbsvc` → Keys, replace lines 86–87, and re-run the check. Never paste the replacement key into chat.

If lines 86–87 are ever empty again, the processor logs "Firebase Admin not initialized" and skips every push. That's the safe failure (the incident is never affected), but nothing is delivered.

**How the user gets the two missing values** (they come from a **service account key**, not from `google-services.json`):
1. Firebase console → project **agap-emergency** → ⚙ Project settings → **Service accounts** → **Generate new private key**. A JSON file downloads.
2. Copy three fields from that JSON into `backend/.env`:
   ```
   FIREBASE_PROJECT_ID=agap-emergency
   FIREBASE_CLIENT_EMAIL=<client_email from the JSON, e.g. firebase-adminsdk-xxxxx@agap-emergency.iam.gserviceaccount.com>
   FIREBASE_PRIVATE_KEY="<private_key from the JSON, kept on ONE line with its \n escapes>"
   ```
   - Keep the private key exactly as it appears in the JSON: one line, starting `-----BEGIN PRIVATE KEY-----\n` and ending `\n-----END PRIVATE KEY-----\n`, **in double quotes**. The code converts `\n` to real newlines.
   - No spaces around `=`.
3. Store the downloaded JSON outside the repo, or delete it after copying. **Never commit it**, and never paste the private key into chat, a handoff or a commit message.
4. Restart the backend. The log should say `Firebase Admin initialized` instead of the warning.

**Credential check before building the feature** (proves the three values work, sends nothing). Run from `backend/` in **Git Bash**, once the values are in place. The backslash escaping is written for bash; in PowerShell, save the JavaScript to a file and run `node file.js` instead.
```bash
node -e "require('dotenv').config(); const {initializeApp,cert}=require('firebase-admin/app'); const app=initializeApp({credential:cert({projectId:process.env.FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_CLIENT_EMAIL,privateKey:(process.env.FIREBASE_PRIVATE_KEY||'').replace(/\\\\n/g,'\n')})}); app.options.credential.getAccessToken().then(()=>console.log('Firebase credentials OK for',process.env.FIREBASE_PROJECT_ID)).catch(e=>{console.error('Firebase credentials FAILED:',e.message);process.exit(1)})"
```
`firebase-admin` 14.4.0 is installed in `backend/node_modules`. If it fails with `invalid_grant` or a PEM error, the private key lost its `\n` escapes or its quotes.

**Mobile build:** `getDevicePushTokenAsync()` returns a native FCM token, which needs a development build (`npx expo run:android` or an EAS dev build). It does not work in Expo Go. The token is registered for project `agap-emergency` via `google-services.json`, so it matches the backend service account only if both are the same project, which they are.

---

## How push works today (reuse this, don't build a new path)

1. **Registration:** `mobile/app/_layout.tsx` (line ~49) calls `registerPushToken(accessToken)` whenever the user is signed in. `mobile/src/services/push/push-registration.ts` gets `Notifications.getDevicePushTokenAsync()` and calls `POST /v1/notifications/register-token`. Guest reporters are signed in too (a `BYSTANDER` user with `is_guest = true` and a 2-hour token, `auth.service.ts` ~line 338), so they register as well.
2. **Queueing:** a service adds a job to `QUEUE_NAMES.NOTIFICATIONS` with `{ userId, channel: 'PUSH', title, body, data }`. **Pattern to copy:** `dispatch.service.ts` lines ~197–213. It reads `incident.incident_reporters?.user_id`, queues after the database commit, and wraps it in try/catch ("Dispatch unaffected").
3. **Sending:** `notification.processor.ts` looks up `fcm_token:{userId}` and calls `getMessaging().send()`. Errors are logged, never thrown.
4. **In-app feed:** `NotificationsService.create()` (`notifications.service.ts` lines ~20–55) saves a `notifications` row (`event_type`, `incident_id`, `title`, `body`) and emits `notification.created` to the private `user:{id}` room. The mobile bell reads `GET /v1/notifications`. The dispatch push does **not** do this; the new feature should, so the message survives in the feed if the push is missed.

**Reporter lookup:** `incident_reporters.user_id` (nullable), `incident_reporters.is_guest`. Push only when `user_id` is set and that user has a token. `reporter_phone` exists, but SMS is **out of scope** unless the user asks (it costs Textbee load).

---

## Suggested design

1. **Fix the token bug** (above).
2. **One notifier,** e.g. `backend/src/notifications/incident-status-notifier.ts` (or a method on `NotificationsService`). `notifyReporter(incidentId, newStatus)`:
   - Load `incident_reporters.user_id` and `incidents.public_reference` (select only those).
   - No reporter user → return.
   - `NotificationsService.create()` the in-app row (`event_type` `INCIDENT_RESOLVED` / `INCIDENT_CLOSED`, `channel: 'PUSH'`).
   - Queue the push job with a **stable BullMQ `jobId`**, e.g. `reporter-status:${incidentId}:${newStatus}`, so retries and double calls don't send twice.
   - Everything in try/catch. Never throw into the caller.
3. **Call it after the transaction commits** in both `incidents.service.ts updateStatus()` (when `newStatus` is `RESOLVED` or `CLOSED`) and `responders.service.ts updateStatus()` (when `resolving`). Next to the existing `realtime.notifyIncidentStatusChanged(...)` call is the natural place. Check module imports: `IncidentsModule` and the responders module need `NotificationsModule` (watch for circular imports).
4. **Message text** (no names, medical data or addresses; CLAUDE.md "no sensitive data in … payloads"). Use Filipino or English, matching the app's existing strings (check `mobile/src/i18n/`):
   - Resolved: title "Incident resolved", body "Responders have finished at the scene for {INC-…}."
   - Closed: title "Incident closed", body "{INC-…} is now closed. Thank you for reporting through AGAP."
   - `data: { incidentId, publicReference, type: 'INCIDENT_RESOLVED' | 'INCIDENT_CLOSED' }` (FCM data values must be strings; the processor already converts them).
5. **Mobile:**
   - A notification tap should open the incident. There is **no** `addNotificationResponseReceivedListener` or `setNotificationHandler` anywhere in `mobile/` today. Add one in `app/_layout.tsx` that routes on `data.incidentId`.
   - The citizen screens are `app/incidents/[id].tsx` and `app/history/[id].tsx` (the incidents list pushes to `/history/[id]`). Check which one is the live status screen before choosing. CLAUDE.md's `mobile/app/emergency/status.tsx` **does not exist**.
   - Android's only channel is `default`, named "AGAP announcements" (`push-registration.ts`). Consider an `incident-updates` channel (importance HIGH) and set `android.notification.channelId` in the FCM message to match.
   - Foreground display needs `Notifications.setNotificationHandler` (otherwise iOS shows nothing while the app is open). The live socket already updates the screen, so this is optional.

**Decisions to confirm with the user before building:**
- A responder-resolved incident later closed by the dispatcher produces **two** pushes (resolved, then closed). That's probably right; confirm.
- Should `CANCELLED`, `FALSE_ALERT`, `UNABLE_TO_RESPOND` or `REFERRED` also notify the reporter? Not requested. Ask; default no.
- SMS fallback to `reporter_phone` for reporters with no app token? Not requested; default no.

---

## Rules that apply (CLAUDE.md)

- A failed push must never delete, cancel or roll back an incident (Reliability rules). Queue **after** the status is committed.
- PostgreSQL first: save the in-app notification row, then queue the push.
- Notify only the **reporter**. Never the patient record or any nearby AGAP user (Architectural rules 2 and 15).
- No sensitive data in push payloads or logs. Log `userId` and `incidentId` only, never the token.
- No change to SOS intake, dispatch authorization or responder location paths beyond adding the notifier call.

---

## Tests to add (backend Jest: `pnpm jest --config ./test/jest.config.ts`)

- Token helper: raw string → token; `{ fcmToken }` → token; anything else → null.
- `notification.processor` sends with the string token when the stored value is `{ fcmToken }` (mock `firebase-admin/messaging`).
- Notifier: queues one job with `jobId` `reporter-status:{id}:{status}` and creates one in-app row; no reporter user → nothing queued; a queue error does not throw.
- `incidents.service.updateStatus` to `RESOLVED` and `CLOSED` calls the notifier; to other statuses it doesn't; a notifier failure still returns the updated incident.
- `responders.service.updateStatus` with `RESOLVED` calls the notifier.
- Baseline before this work: **39 suites, 593 tests** green (see State below).

**Done when**
- [x] `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` are filled in `backend/.env`, `FIREBASE_PROJECT_ID` has no spaces around `=`, and the credential check above prints "Firebase credentials OK" (done 2026-10-22).
- [ ] After the feature works: rotate the service-account key (see "Rotation pending" above) and re-run the check.
- [x] `.env.example` lists `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (placeholders) instead of the unused `FCM_*` names. The `FCM_*` placeholders are gone from `backend/.env`, and README / DEVELOPER_SETUP use the new names too.
- [x] Unit tests above pass; full suite green (40 suites, 618 tests); backend and mobile type checks clean.
- [ ] With Firebase configured and a dev build installed: a citizen reports, a responder marks it resolved, and the phone gets the "resolved" push with the app **closed**. Tapping it opens the incident.
- [ ] The dispatcher closes it, and the phone gets the "closed" push. Both appear in the in-app notification feed.
- [ ] With Firebase **unconfigured**, the same flow completes normally (status changes and closure work; only a log line about the skipped push).
- [ ] The existing "Help is on the way" push now arrives too (proves the token fix).

---

## State of the repo when this was written

- **Committed:** role dashboards Phases 1 and 2 (`f788ead`, `1f5ed1d`) and the rate-limit fix (`01aac21`).
- **Not committed:** Phase 3 (staged) and Phase 4 (unstaged on top). The user is committing them; the messages are in the previous session. Check `git log` / `git status` first. If they're still uncommitted, don't mix this feature into those commits.
- **Plan:** [ROLE_DASHBOARDS_PLAN.md](../plans/ROLE_DASHBOARDS_PLAN.md). Phases 1–4 are built; Phase 5a is next on that plan. This push feature is **separate** from it; commit it on its own, e.g. `feat(notifications): push the reporter when their incident is resolved or closed`.
- **Earlier handoff:** [2026-10-22_role-dashboards-phase1.md](2026-10-22_role-dashboards-phase1.md).

## Gotchas (carried over)

- Backend Jest config: `pnpm jest --config ./test/jest.config.ts`. It maps `@agap/shared` to `shared/src`; the backend and frontend runtimes use `shared/dist`, so run `pnpm --filter @agap/shared build` after changing `shared/`.
- Migrations: write SQL by hand, then `migrate deploy`; never `migrate dev`. **This feature needs no migration:** `notifications` and `system_configurations` already have every column.
- Don't edit files with PowerShell `Get-Content`/`Set-Content`; they garble UTF-8.
- Locked test account: five wrong passwords lock it for 15, 30, then 60 minutes. Unlock without resetting the password by doing what `AdministrationService.unlock()` does: set `failed_login_count = 0`, `locked_until = NULL`, `lockout_level = 0`, and write an `ACCOUNT_UNLOCKED` audit row. The last session used a local-only script for this.
