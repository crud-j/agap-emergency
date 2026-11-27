# Responder assignment now rings with AGAP closed (native insistent notification), one way to open an assignment, guest gate verified on device, Railway reset + reseed for a demo, seed has no responder assignments (APK #2 built + installed; ringing tests a–d not yet reported; second reseed not confirmed)

**Date:** 2026-11-27
**Status:** IN PROGRESS (all code committed; `18ffc6a` pushed + live on Railway, CI green; `07dcb8b` (seed change) committed by the user, **not pushed**; ringing device tests a–d **not reported yet**; whether the user re-ran reset + seed with the new seed is **unknown**)
**Bead(s):** none (`bd` is not installed: `bash: bd: command not found`)
**Epic:** Deployment plan `docs/plans/DEPLOYMENT_PLAN.md` (Phase 6 end-to-end checks) + user-requested features + demo prep
**Chain:** `standalone-953e4889` seq `9`
**Parent:** `docs/handoff/2026-11-27_guest-gate-onboarding-responder-alarm.md`
**Prior chain:** `docs/handoff/2026-11-24_deployment-phases-1-3.md` > `docs/handoff/2026-11-24_deployment-phases-3-4.md` > `docs/handoff/2026-11-24_deployment-phase-5-eas-id-ocr.md` > `docs/handoff/2026-11-24_deployment-phase-5-admin-sms-tracking.md` > `docs/handoff/2026-11-26_guest-follow-and-guest-security.md` > `docs/handoff/2026-11-26_trust-proxy-and-admin-sidebar.md` > `docs/handoff/2026-11-26_guest-one-open-report.md` > `docs/handoff/2026-11-27_guest-gate-onboarding-responder-alarm.md` > this

---

## Stale References

- `openReportOf` — still only in a **code comment** at `backend/src/emergency-alerts/guest-report-limit/guest-report-limit.service.ts:46` ("(see openReportOf)"); the function is `blockOf`. Cosmetic, carried from the parent; fix when next in that file.
- Parent's "re-buzz = one 6 s vibration per push" description of the closed-app behaviour is superseded: assignment pushes are now **data-only** and the phone posts an **insistent** notification (see Code Analysis).
- Parent's plan-box name "Unanswered assignment keeps buzzing" was renamed in `DEPLOYMENT_PLAN.md` to **"Unanswered assignment keeps ringing"** (line 364).
- Seed: the two "ready-made offers" (dispatch ids `00000000-0000-0000-0006-000000000001` ALPHA-1→responder1 and `…0006-000000000005` CHARLIE-1→responder3) **no longer exist in the seed** after `07dcb8b`. `ctx.crew` was removed from `seedPresentationData`'s context type. An old handoff (`2026-11-24_deployment-phases-3-4.md:157`) still mentions the ready-made offers; historical, leave it.

## Since Last Handoff

- **Parent step 1 (build ONE new APK) — done.** First APK of the day built + installed (no EAS issue reported). Then a **second APK** was built + installed after the native alarm module (`18ffc6a`). The user said "(done) installed, testing now" but **never reported the a–d ringing results**.
- **Parent step 2 device tests:**
  - 2d onboarding: **passed** ("onboarding first time only").
  - 2a guest taken to open report: **passed by screenshot** (INC-2026-000064 "You already have an active report"; then False alert → "Marked a false alert", countdown 9:52, locked button "Report an emergency · 9:52", "Sign in to report now").
  - 2b/2c (Security Events rows): the new APK never sends the refused request, so they were tested with a **curl script** against the live API using a fake `X-Device-Id`. User: "(done) curl test, both rows show in Security Events" → boxes 357 and 359 **ticked**.
  - 2e responder photo/passkeys and HEADWEAR: **not tested**.
  - 2f re-buzz: user reported "**it only vibrates when the app is open**" → this triggered the main feature of this session (insistent ringing). The new behaviour is untested.
- **Parent step 3 (CI green after a65f5a9) — confirmed** via the public GitHub API: run 45863860591 `success`. `18ffc6a` CI also `success`.
- **Parent steps 4–6** (HEADWEAR tuning, Railway `OPENAI_API_KEY`, cleanup of test incidents): HEADWEAR/OPENAI untouched; **test incidents were wiped by the Railway reset** (060/061/062/064 and curl incidents are gone with it).
- **New, unplanned:** demo prep — the user asked for a reset + reseed of Railway, then asked that the seed **not give responders any demo assignments**.
- **Risk materialised:** the PostGIS password was printed in a PowerShell error and pasted into chat (see Risks). Rotation planned **after the demo**.

## Reference Documents

- `docs/plans/DEPLOYMENT_PLAN.md` — **the** plan. Phase 6 boxes at lines ~355–364 (357, 359 ticked this session; 360 partial note; 364 rewritten).
- `CLAUDE.md` — Rules 8 (dispatcher decides), 9 (hotlines), 12 (idempotent), 14 (guest reporting always available), Reliability Rules (no silent failures; failed push never cancels an incident).
- `docs/handoff/2026-11-27_guest-gate-onboarding-responder-alarm.md` — parent; re-buzz design (30 s × 6, escalation at 3 min), guest gate rule table, alarm channel definition.
- Memory: `project-railway-gotchas.md` (seed + rotate; updated this session with TCP-proxy/empty-host + leak), `project-mobile-build-env.md` (updated: local Expo module + custom entry), `project-backend-test-run.md`, `feedback-git-bash-commits.md`, `feedback-no-backslash-shell-edits.md`.

## The Goal

Run AGAP (Bocaue MDRRMO GPS emergency alert system, a student project heading toward a pilot) without the laptop: Vercel web console, Railway NestJS backend + PostGIS + Redis, Cloudflare R2, EAS preview APK. This session verified the guest gate on a real phone, made a **new responder assignment impossible to miss even with AGAP closed** (continuous ring + vibration until opened, the user's explicit ask), cleaned up assignment navigation, and prepared the live database for a **demo later today**: a full reset + reseed with rotated passwords, then a seed change so **no responder starts with an assignment** (the dispatcher dispatches live and the phone rings). End state the user wants next: the demo goes smoothly, then the ringing is confirmed on the device, the remaining Phase 6 boxes, and password rotation (PostGIS now urgent-ish) before a pilot.

## Where We Are

- **Git:** `main` at `07dcb8b` (seed change, committed by the user, **not pushed**); `origin/main` = `18ffc6a`. Plus this handoff's `session:` commit (made at close, not pushed). Untouched, not ours: `frontend/tsconfig.tsbuildinfo` (M), `docs/presentation/Justine_Soliman_IPO_Report.md` (??).
- **Railway backend** runs `18ffc6a` (health ok `2026-11-27T01:56:43Z`; CI success). Assignment pushes are now **data-only**.
- **APK #2** (built after `18ffc6a`, with the `agap-alarm` native module) is installed on the test phone. The Kotlin compiled on EAS (the build succeeded; the user said "(done) installed").
- **Database (Railway PostGIS):** reset + seeded once this session (`pnpm db:reset-data; pnpm db:seed`), then `pnpm db:rotate-seeded-passwords` → "Done: 17 of 18 accounts now use NEW_DEMO_PASSWORD." That first reseed still **contains the two ready-made offers** (responder1 ALPHA-1 Turo chest pain; responder3 CHARLIE-1 Bundukan fire). The user was given commands to **reset + seed again** with the new seed (no offers) — **not confirmed done**.
- **PostGIS TCP Proxy:** the user had to turn it **on** for the laptop to reach the DB (URL had an empty host `@:/railway` while it was off). Told to turn it **off** after seeding — **not confirmed**.
- **Plan boxes:** 357 "One open report per guest phone" `[x]` (curl, 2026-11-27); 359 "Wait after a false alert" `[x]` (curl); 360 "Guest is taken to their open report" `[ ]` with a note: active screen + 9:52 countdown confirmed by screenshots; still to see unlock at 0:00, red button after Close, data off → form; "See your report" on 429 can't be triggered from this APK; 364 rewritten as "Unanswered assignment keeps ringing" (needs APK #2) `[ ]`.
- **Backend change (`18ffc6a`):** `buildFcmMessage(token, data)` exported from `backend/src/jobs/processors/notification.processor.ts`; `NotificationJobData` gained `androidDataOnly?` and `androidTtlMs?`; `assignmentPush('ASSIGNMENT', …)` sets `androidDataOnly: true, androidTtlMs: ASSIGNMENT_PUSH_TTL_MS (120 000)`; cancellations unchanged (notification push on `assignments`, same tag).
- **Mobile change (`18ffc6a`):** local Expo module `mobile/modules/agap-alarm` (Kotlin `AgapAlarmModule`: `ring(tag,title,body,url)`, `stop(tag)`; channel `assignments-ring`, `FLAG_INSISTENT`, alarm sound, `setTimeoutAfter(5 min)`); `expo-task-manager ~57.0.24` added; background task `agap-assignment-ring` in `mobile/src/services/push/assignment-ring-task.ts`; new entry `mobile/index.ts` (`main: "index.ts"`).
- **Navigation (`18ffc6a`):** `mobile/src/lib/assignment-navigation.ts` (`openAssignment`, `assignmentPath`, `assignmentNotificationTag`) used by the in-app alarm and the push-tap handler in `mobile/app/_layout.tsx`; `mobile/app/responder/_layout.tsx` exports `unstable_settings = { initialRouteName: 'home' }`; `AssignmentAlarm` waits `ALARM_SETTLE_MS = 900` before showing, and stops native ringing for all pending offers while the app is active.
- **Seed change (`07dcb8b`):** `backend/prisma/seed/presentation-data.ts` — incidents `…0005-000000000001` (Turo MEDICAL) and `…0005-000000000005` (Bundukan FIRE) are now `ASSESSED` with no `dispatched_at` and **no dispatch**; `ctx.crew` removed. `backend/prisma/seed/seed.ts` — `crew:` arg removed, comment + summary lines changed ("No responder starts with an assignment…").
- **Tests:** backend full 144 suites / 2550 tests (3 auth/ID suites timed out under load → pass alone 129/129); new `backend/test/jobs/fcm-message.spec.ts` (4 tests); mobile tsc 0, 28 suites / 321 tests; backend tsc 0; seed files tsc 0.
- **Not tested on a device:** insistent ringing, tap → assignment with Home underneath, stop on open, cancellation silencing, 900 ms settle.

## What We Tried (Chronological)

1. **Onboarding narration (standing rule).** Read parent handoff; `bd` missing; `git fetch` → 1 ahead (handoff commit `3fb268d`), 0 behind; health ok `2026-11-27T00:27:39Z`. Read `assignment-reminder.ts`, `assignment-alarm.tsx`, `guest-report.ts`; explored `mobile/eas.json` (preview: APK, `environment: "preview"`, `appVersionSource: "remote"`, no autoIncrement), `assignment-push.ts`, `.github/workflows/ci.yml`. Waited for go-ahead.
2. **"go ahead, APK not built yet."** Checked CI via public GitHub API (no `gh` CLI): `a65f5a9` run success (the 3 earlier runs failed). Gave `eas build --profile preview --platform android`; warned not to generate a new keystore (passkeys depend on SHA-256).
3. **"(done) installed."** Designed the 2b/2c problem: the new APK's gate stops the refused request, so no Security Events row can come from the phone → planned a curl test. Gave 2d + 2a steps.
4. **Screenshots for 2a + "onboarding first time only".** Both passed. Built the curl test: `send()` function with `X-Device-Id: curltest-<epoch>` (must match `/^[A-Za-z0-9_-]{8,64}$/`), body `{"type":"OTHER","idempotencyKey":<uuid via node crypto.randomUUID()>,"description":"CURL TEST X, ignore","lat":14.7963,"lng":120.9272}`. `/proc/sys/kernel/random/uuid` doesn't exist in Git Bash → used node.
5. **"(done) curl test, both rows show" + ringing request.** User: "it only vibrates when the application is open … i want it to works to even when the mobile app is close or on tab … and ensure its navigation process are good and not scattered".
6. **Root-cause investigation (read expo-notifications 57.0.23 Android sources).** Findings: FCM *notification* messages with the app in background are drawn by the system → one alert per post (channel pattern ≈ 5.8 s); expo-notifications has no `FLAG_INSISTENT`. Data-only messages: `FirebaseMessagingDelegate.onMessageReceived` → `NotificationsService.receive` (presents it itself in background **if `data.title` or `data.message` is set**, via `ExpoHandlingDelegate.shouldPresent`) **and** `runTaskManagerTasks` (background task, needs expo-task-manager). Expo posts with `notify(identifier = data["tag"], id = 0)`; channel from `data["channelId"]`; `data["body"]` is parsed as JSON (never set it).
7. **Rejected Notifee** (legacy native module, uncertain with RN 0.86 / new arch) and **headless `Vibration.vibrate`** (Android 10+ blocks background vibration not tied to a notification). Chose: data-only push + background task + tiny local Expo module that posts an insistent notification with the same tag/id, replacing Expo's copy.
8. **Backend implemented** (`buildFcmMessage`, data-only for ASSIGNMENT, TTL 2 min). First run of `npx jest --config jest.config.js` failed ("Can't find a root directory") → the config is `./test/jest.config.ts`. One existing test (`responder-assignment-push.spec.ts:99` `toEqual`) failed on the new fields → updated. 17/17 + tsc 0.
9. **Mobile implemented.** `npx expo install expo-task-manager` → `~57.0.24`. Verified autolinking scans `mobile/modules` (`nativeModulesDir` default `./modules`; no package.json needed; name = folder) and `npx expo-modules-autolinking resolve -p android` lists `agap-alarm` → `expo.modules.agapalarm.AgapAlarmModule`. Found Expo's `dismissNotificationAsync` only cancels notifications it recognises → added native `stop(tag)`. First mobile tsc: `TS2367` (AppState narrowed after `!== 'active'`) → `onScreen()` helper. Then tsc 0, jest 28/321.
10. **Full backend run:** `npx jest --config ./test/jest.config.ts` (all) gave a `<rootDir>` validation error; `pnpm --filter @agap/backend test` → 3 failed / 141 passed (2547/2550): `auth-phase2.spec.ts`, `id-register.spec.ts`, `id-national.spec.ts`, all "Exceeded timeout of 5000 ms" (6 occurrences). Alone: 3/3 suites, 129/129.
11. **User pushed `18ffc6a`** ("(done) pushed, building the APK now"). Verified origin, health `01:56:43Z`, CI success.
12. **"(done) installed, testing now" + reset/reseed request** for a demo. Read `project-railway-gotchas` memory, `scripts/db/reset-data.sql` (TRUNCATE all public tables except `_prisma_migrations`, `geo_regions`, `spatial_ref_sys`; audit trigger disabled inside the block; restores `surge_rules` + `surge_settings`), `rotate-seeded-passwords.ts`, `prisma.config.ts` (dotenv doesn't override an existing `DATABASE_URL`), seed env vars (`DATABASE_URL`, `ID_PIN_PEPPER`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `NODE_ENV`). Gave PowerShell (`Read-Host -AsSecureString`) and Git Bash (`read -rsp`) commands with a host check.
13. **First attempt failed:** the copied URL was `postgres://postgres:<pw>@:/railway` (empty host) → `[uri]` cast error **printed the full URL incl. password** to the terminal, which the user pasted into chat. Cause: PostGIS **TCP Proxy off**. Fix: turn TCP Proxy on, recopy `DATABASE_URL`, safer host check `"host: " + ($env:DATABASE_URL -replace '^[^@]*@([^/]*)/.*$', '$1')`, turn proxy off afterwards; rotate PostGIS password after the demo.
14. **Second attempt succeeded:** rotate printed 17 changed accounts → "Done: 17 of 18 accounts now use NEW_DEMO_PASSWORD." (the 18th is almost certainly `admin@agap.local`, whose password comes from `INITIAL_ADMIN_PASSWORD` in local `backend/.env`, not public). User asked "should i redeploy latest commit on railway?" → **No** (DB data is live without redeploy; only check Deployments shows `18ffc6a` Active).
15. **"please do not include an demo assignments on the responders."** Found responders see assignments only via `dispatch_crew: { some: { user_id } }` (`responders.service.ts:217,279,319,818`); only 2 seeded dispatches had `crewUserId`. Removed both dispatches (incidents → `ASSESSED`), removed `ctx.crew`. tsc 0 (backend + seed files). User committed it as `07dcb8b`; gave reset + seed + rotate again (not confirmed run).

## Key Decisions

- **Data-only FCM for new assignments, with `title` + `message` + `channelId` + `tag` inside `data`** — so expo-notifications still presents a normal notification (fallback for APK #1, for a failed background task, and for force-stopped apps once FCM delivers), while the background task replaces it with an insistent one. Rejected: data-only **without** text (old APKs and task failures would show nothing).
- **Cancellation stays a notification message** on `assignments` with the same tag → it replaces (silences) the insistent ring. Not data-only.
- **Insistent (`FLAG_INSISTENT`) notification via a local Expo module** rather than Notifee (compat risk on RN 0.86) or a foreground service/full-screen intent (`USE_FULL_SCREEN_INTENT` Play-restricted; heavier). Stops when the shade is opened, the notification is tapped/swiped/replaced/cancelled, or after `setTimeoutAfter(5 min)`.
- **Server repeats every 30 s stay** (×6, escalation at 3 min): if the responder pulls the shade (stops insistent ring) but doesn't act, the next repeat rings again.
- **Ring 1200 ms after the push (`RING_AFTER_MS`)** so Expo's own copy (posted on an IO coroutine) lands first and ours replaces it, not the reverse.
- **Skip ringing when `AppState === 'active'`** (checked before and after the wait) — the in-app full-screen alarm rings instead; and the in-app alarm calls `stopRinging` for every pending offer whenever the app is active.
- **New channel id `assignments-ring`** created natively with `TYPE_ALARM` sound + `USAGE_ALARM` + `IMPORTANCE_HIGH` + pattern `[0,1000,500,1000,500]` + bypass DnD; Android channel sound/vibration are immutable after creation.
- **Push TTL 2 min** (`ASSIGNMENT_PUSH_TTL_MS`) so a phone back online much later doesn't ring for a stale offer; the 15 s in-app poll + repeats cover a live one.
- **Navigation: one helper `openAssignment()`** (no-op if already on that assignment); `initialRouteName: 'home'` for the responder stack so a deep link / notification gives Back → Home; alarm waits 900 ms of stable pathname to avoid flashing over Home on a cold-start tap; `alarmOffer` no longer pulls the responder from one waiting offer's screen to another.
- **Seed: drop the two crew dispatches entirely** (incidents → ASSESSED, units free) rather than keeping dispatches with no crew (a SENT dispatch with no crew would sit forever on the console). Demo flow: dispatcher sends ALPHA-1 to Turo live → responder1's phone rings.
- **No Railway redeploy needed for a reseed**; seed commit need not be pushed before the demo (push redeploys backend/web — avoid during demo).
- **PostGIS password: mitigate now (TCP proxy off → only private network), rotate after the demo** — rotating right before the demo risks breaking the backend connection.

## Evidence & Data

### Commits this session

| Hash | Author | Pushed | Summary |
|---|---|---|---|
| `18ffc6a` | user (Claude co-author) | yes, CI success, live | feat(responder): assignment keeps ringing with the app closed; one way to open an assignment |
| `07dcb8b` | user (Claude co-author) | **no** | seed: no responder starts with an assignment; Turo and Bundukan calls wait for a unit |
| this handoff | Claude | no | session: responder-ringing-and-demo-reseed |

### CI runs (GitHub API, `crud-j/agap-emergency`, branch main)

| Commit | Conclusion |
|---|---|
| `7d60724`, `aec3719`, `64b0298` | failure (before the CI fix) |
| `a65f5a9` | success (run 45863860591) |
| `18ffc6a` | success |

### Device test status (test phone, APK #1 then APK #2)

| Test | Result | Evidence |
|---|---|---|
| 2d onboarding once | pass | user "(done) onboarding first time only" |
| 2a active-report screen | pass | screenshot 09:02, INC-2026-000064, "You already have an active report", "Waiting for a dispatcher" |
| 2a false-alert countdown | pass | screenshot 09:04, "Marked a false alert", 9:52, locked "Report an emergency · 9:52", "Sign in to report now", "Closed as a false alert" |
| 2a unlock at 0:00 / red after Close / data off → form | **not reported** | — |
| 2b open-report row (curl) | pass | user "both rows show in Security Events" |
| 2c false-alert wait row (curl) | pass | same |
| 2e responder photo/cap, passkeys | not tested | — |
| Ringing a: closed → keeps ringing | **not reported** | — |
| Ringing b: tap → assignment, Back → Home | **not reported** | — |
| Ringing c: pull shade stops, rings again ~30 s | **not reported** | — |
| Ringing d: open from launcher → quiet + red alarm; Accept stops | **not reported** | — |

### Test runs

| Run | Result |
|---|---|
| backend fcm-message + responder-assignment-push (+reminder, reporter-status) first | 1 failed / 79 (old `toEqual` at spec:99) |
| same after fix | 17/17 (2 suites); backend tsc 0 |
| mobile tsc first | TS2367 at assignment-ring-task.ts(70,9) |
| mobile tsc + jest after fix | tsc 0; 28 suites / 321 tests |
| backend full (`pnpm --filter @agap/backend test`) | 141 pass / 3 fail suites; 2547 / 2550 tests; failures = 5000 ms timeouts |
| 3 failing suites alone | 3/3, 129/129 |
| backend tsc after seed change | 0; seed.ts standalone tsc 0 |

### Guest limits (from `guest-report-limit.service.ts` ~lines 47–58) — matter for the demo

| Scope | Window | Max |
|---|---|---|
| device | 10 min | 2 |
| device | 24 h | 3 |
| ip | 10 min | 20 |
| ip | 24 h | 100 |
| spot (ip + rounded lat/lng) | 10 min | 3 |

Kept in Redis → **not cleared by the DB reset**. Clearing AGAP app data gives a new device id (resets device limits; onboarding shows again).

### Rotate output (2026-11-27, first reseed)

```
changed citizenaccountdemo@demo.com (CITIZEN) · citizen@demo.agap (CITIZEN)
changed dispatcher1@ / dispatcher2@mdrrmo.bocaue.gov.ph (DISPATCHER)
changed orgadmin@bfp.bocaue.gov.ph · orgadmin@bocauehospital.gov.ph · orgadmin@mdrrmo.bocaue.gov.ph (ORG_ADMINISTRATOR)
changed receiving@bocauehospital.gov.ph (HOSPITAL_USER)
changed responder1,2,4,5@mdrrmo… · responder3,6@bfp… (RESPONDER)
changed supervisor@mdrrmo.bocaue.gov.ph (SUPERVISOR)
Done: 17 of 18 accounts now use NEW_DEMO_PASSWORD.
```
(15 lines visible in the screenshot; announcements@lgu… and bystander@demo.agap presumably above the visible area.)

### FCM message shapes (`buildFcmMessage`)

```jsonc
// New assignment (data-only)
{ "token": "…", "data": { "type": "ASSIGNMENT", "dispatchId": "disp-1", "title": "New assignment",
  "message": "ROAD ACCIDENT · INC-2026-001234. Open AGAP to accept or decline.",
  "channelId": "assignments-alarm", "tag": "assignment-disp-1" },
  "android": { "ttl": 120000, "priority": "high" } }
// Repeat: title "New assignment: still waiting", data.reminder "3"
// Cancellation (unchanged notification push)
{ "notification": { "title": "Assignment cancelled", "body": "… cancelled; no action needed." },
  "data": { "type": "ASSIGNMENT_CANCELLED", "dispatchId": "disp-1" },
  "android": { "priority": "high", "notification": { "channelId": "assignments", "tag": "assignment-disp-1" } } }
// Any other push: { token, notification:{title,body}, data } — no android block unless channel/tag/ttl
```

### Closed-app behaviour by APK

| Phone | What a new assignment does with AGAP closed |
|---|---|
| APK #1 (morning) | Expo presents the data-only push on `assignments-alarm` (one ~6 s vibration), repeated every 30 s |
| APK #2 (native module) | Expo's copy, then ~1.2 s later an insistent notification on `assignments-ring` rings + vibrates continuously until opened; repeats every 30 s; 5 min timeout |
| Force-stopped app (OEM swipe-kill without Autostart) | nothing until FCM can deliver again (unchanged risk) |

### Approaches weighed for "keep vibrating with the app closed"

| Option | Works closed? | Cost / risk | Verdict |
|---|---|---|---|
| Keep notification push, longer channel pattern / shorter interval | yes, but still discrete buzzes | backend + new channel id | rejected: not "until noticed" |
| Notifee (`loopSound` → insistent) + data-only + headless handler | yes | legacy native module; RN 0.86 / new-arch compat unknown; can't build locally | rejected |
| Headless JS `Vibration.vibrate(pattern, true)` | no | Android 10+ blocks background vibration not tied to a notification | rejected |
| Foreground service / full-screen intent (call-style) | yes | `USE_FULL_SCREEN_INTENT` Play-restricted; big native change | rejected (as in parent) |
| **Data-only push + expo-task-manager task + local Expo module posting `FLAG_INSISTENT`** | yes | ~120 lines Kotlin, compiled only on EAS | **built** |

### expo-notifications 57.0.23 internals relied on (Android sources under `node_modules/.pnpm/expo-notifications@57.0.23__…/android/src/main/java/expo/modules/notifications/`)

| File | Fact |
|---|---|
| `service/delegates/FirebaseMessagingDelegate.kt:107` | `onMessageReceived` → `NotificationsService.receive(...)` **and** `runTaskManagerTasks(...)` for every message |
| `service/delegates/ExpoHandlingDelegate.kt:118-148` | background + data-only → presented only if title or text non-empty (`shouldPresent`) |
| `notifications/model/RemoteNotificationContent.kt:34-45` | title = `notification?.title ?: data["title"]`, text = `notification?.body ?: data["message"]` |
| `notifications/model/triggers/FirebaseNotificationTrigger.kt:24-26` | channel = `notification?.channelId ?: data["channelId"]` |
| `FirebaseMessagingDelegate.getNotificationIdentifier` | id = `data["tag"] ?: messageId` |
| `service/delegates/ExpoPresentationDelegate.kt:37,108,127` | `notify(identifier, 0, …)` (`ANDROID_NOTIFICATION_ID = 0`) on an IO coroutine |
| `ExpoPresentationDelegate.dismissNotifications:143` | only cancels notifications it can map → native `stop(tag)` added |
| `notifications/model/NotificationData.kt:22` | `data["body"]` parsed as JSON → never send a `body` data key |
| `build/Notifications.types.d.ts:747` | task payload `{ notification, data: { dataString?, …fcmData } }`; JobService path wraps under `notification` |
| no `INSISTENT` / `setOnlyAlertOnce` anywhere in the module | why a native module was needed |

### Curl test used for 2b/2c (Git Bash, one terminal)

```bash
API=https://agap-emergency-production.up.railway.app/v1/incidents
DEV=curltest-$(date +%s)
send() { curl -s -w '\nHTTP %{http_code}\n' -X POST "$API" -H 'Content-Type: application/json' -H "X-Device-Id: $DEV" -d "{\"type\":\"OTHER\",\"idempotencyKey\":\"$(node -e 'console.log(crypto.randomUUID())')\",\"description\":\"CURL TEST $1, ignore\",\"lat\":14.7963,\"lng\":120.9272}" | grep -oE '"(public_reference|publicReference|code|retryAfterSeconds|message)":("[^"]*"|[0-9]+)|HTTP [0-9]+'; }
send A   # 201 → INC
send B   # 429 GUEST_REPORT_OPEN → "Earlier report still open"
# mark A False alert on the console
send C   # 429 GUEST_REPORT_WAIT, retryAfterSeconds ≈ 600 → "Wait after a false alert"
```
Reusable for any future server-side guest-limit check (new `DEV` = fresh device counters).

### Reset + reseed commands (PowerShell; Git Bash equivalent uses `read -rsp`)

```powershell
# Railway → PostGIS → Settings → Networking → TCP Proxy ON first; copy Variables → DATABASE_URL (…proxy.rlwy.net:PORT)
cd $HOME\Music\agap-emergency\backend
$s = Read-Host "Railway PostGIS DATABASE_URL" -AsSecureString; $env:DATABASE_URL = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
"host: " + ($env:DATABASE_URL -replace '^[^@]*@([^/]*)/.*$', '$1')   # must contain proxy.rlwy.net; never prints the password
pnpm db:reset-data; if ($?) { pnpm db:seed }
$p = Read-Host "New demo password (12+ chars)" -AsSecureString; $env:NEW_DEMO_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p))
pnpm db:rotate-seeded-passwords
Remove-Item Env:DATABASE_URL, Env:NEW_DEMO_PASSWORD
# TCP Proxy OFF again
```
Do NOT use `([uri]$env:DATABASE_URL).Host` — on a bad URL its error prints the whole URL with the password (that is how the leak happened).

### After any reset (demo checklist given to the user)

1. Everyone signs in again (sessions, FCM tokens, passkeys are truncated); the responder phone must sign in for its push token.
2. Guest demo phone: Settings → Apps → AGAP → Storage → Clear data (Redis guest counters survive).
3. More than 3 guest reports from one spot/network in 10 min → use a signed-in citizen.
4. Demo flow: dispatch ALPHA-1 to the Turo chest-pain call from the web → responder1's phone rings with AGAP closed.

### Railway reset — the leak

`[uri]` cast error printed `postgres://postgres:<password>@:/railway`. Host empty because the PostGIS **TCP Proxy was off**. The password is now in the chat transcript. Mitigation: TCP Proxy off; rotate after demo.

## Code Analysis

- `backend/src/jobs/processors/notification.processor.ts`: `export function buildFcmMessage(token: string, data: NotificationJobData): Message` (imports `type Message` from `firebase-admin/messaging`). Data-only branch → `{ token, data: {...payload, title?, message: body, channelId?, tag?}, android: { ttl?, priority: 'high' } }`. Normal branch unchanged except `android` also appears when `androidTtlMs` is set. `sendFcm` = `getMessaging().send(buildFcmMessage(token, data))`.
- `backend/src/dispatch/assignment-push.ts`: `ASSIGNMENT_PUSH_TTL_MS = 2 * 60_000`; `assignmentPush` spreads `...(kind === 'ASSIGNMENT' && { androidDataOnly: true, androidTtlMs: ASSIGNMENT_PUSH_TTL_MS })`. Reminder constants unchanged (`INTERVAL 30_000`, `MAX 6`, waiting `PENDING|SENT`).
- `mobile/modules/agap-alarm/android/src/main/java/expo/modules/agapalarm/AgapAlarmModule.kt`: `Name("AgapAlarm")`; `Function("ring") { tag, title, body, url -> Boolean }`; `Function("stop") { tag -> Boolean }`; `CHANNEL_ID = "assignments-ring"`, `NOTIFY_ID = 0`, `RING_TIMEOUT_MS = 300_000`; returns false below API 26 or when notifications are disabled; content intent = `ACTION_VIEW agap://responder/assignment/{id}` with `setPackage`, `NEW_TASK|SINGLE_TOP`, `PendingIntent.FLAG_UPDATE_CURRENT|FLAG_IMMUTABLE`, request code `tag.hashCode()`; small icon from meta-data `expo.modules.notifications.default_notification_icon` else app icon; `CATEGORY_ALARM`, `VISIBILITY_PUBLIC`, `setAutoCancel(true)`.
- `mobile/modules/agap-alarm/android/build.gradle`: plugins `com.android.library` + `expo-module-gradle-plugin`, namespace `expo.modules.agapalarm` (copied from expo-application 57.0.3's pattern). `expo-module.config.json`: platforms `["android"]`, module `expo.modules.agapalarm.AgapAlarmModule`.
- `mobile/modules/agap-alarm/index.ts`: `requireOptionalNativeModule<AgapAlarmNative>('AgapAlarm')` from `'expo'` (Android only); `ringUntilOpened(tag,title,body,url): boolean`, `stopRinging(tag): void`; both swallow errors.
- `mobile/src/services/push/assignment-ring-task.ts`: `ASSIGNMENT_RING_TASK = 'agap-assignment-ring'`, `RING_AFTER_MS = 1200`; `assignmentRingFromPayload(payload)` finds the first object (depth ≤ 3) with `type === 'ASSIGNMENT'` and non-empty `dispatchId`; url `agap://responder/assignment/${encodeURIComponent(id)}`; defines task + `Notifications.registerTaskAsync` at module scope (Android only).
- `mobile/index.ts`: `import './src/services/push/assignment-ring-task'; import 'expo-router/entry';` — `package.json` `"main": "index.ts"` (was `expo-router/entry`).
- `mobile/src/components/responder/assignment-alarm.tsx`: `ALARM_SETTLE_MS = 900`; `alarmOffer` returns null if pathname is **any** pending offer's screen; `stopRinging(assignmentNotificationTag(o.id))` for all pending offers while active (effect keyed on `pendingKey`); "Open assignment" → `openAssignment(router, pathname, offer.id)`.
- `mobile/app/_layout.tsx`: `usePathname()` in `AuthGuard`; tapped ASSIGNMENT → `openAssignment(router, pathname, tapped.id)`; foreground handler unchanged (ASSIGNMENT → no banner/sound, invalidate `['responder-assignments']`), works for data-only too since `content.data.type` is present.
- Responder assignment lookup is **crew-only**: `responders.service.ts` lines 217/279/319/818 `dispatch_crew: { some: { user_id: userId } }` — a dispatch without crew never appears on any phone.

## Files Changed

### Source code
- `backend/src/jobs/processors/notification.processor.ts` — `buildFcmMessage`, `androidDataOnly`, `androidTtlMs` (`18ffc6a`).
- `backend/src/dispatch/assignment-push.ts` — `ASSIGNMENT_PUSH_TTL_MS`, data-only for new assignments (`18ffc6a`).
- `mobile/modules/agap-alarm/{expo-module.config.json, index.ts, android/build.gradle, android/src/main/AndroidManifest.xml, android/src/main/java/expo/modules/agapalarm/AgapAlarmModule.kt}` — new (`18ffc6a`).
- `mobile/src/services/push/assignment-ring-task.ts` (new), `mobile/index.ts` (new), `mobile/package.json` (main + `expo-task-manager ~57.0.24`), `pnpm-lock.yaml` (`18ffc6a`).
- `mobile/src/lib/assignment-navigation.ts` (new), `mobile/src/components/responder/assignment-alarm.tsx`, `mobile/app/_layout.tsx`, `mobile/app/responder/_layout.tsx` (`18ffc6a`).
- `backend/prisma/seed/presentation-data.ts`, `backend/prisma/seed/seed.ts` — no responder assignments (`07dcb8b`).

### Tests
- `backend/test/jobs/fcm-message.spec.ts` (new, 4): data-only shape, repeat, cancellation, other pushes unchanged.
- `backend/test/dispatch/responder-assignment-push.spec.ts` — expects `androidDataOnly` + `androidTtlMs`.
- `mobile/src/services/push/__tests__/assignment-ring-task.test.ts` (new, 3): direct/wrapped payloads, fallbacks + URL encoding, ignores non-assignments.
- `mobile/src/lib/__tests__/assignment-navigation.test.ts` (new, 4).
- `mobile/src/components/responder/__tests__/assignment-alarm.test.ts` — +2 cases (other waiting offer's screen → null; accepted mission's screen → rings).

### Docs
- `docs/plans/DEPLOYMENT_PLAN.md` — 357/359 ticked with curl notes; 360 progress note; 364 rewritten (`18ffc6a`).
- Memory: `project-railway-gotchas.md`, `project-mobile-build-env.md` updated at close.

### Not changed
- No Prisma migration. No Railway/Vercel env vars changed. Redis untouched (guest limit counters survive the reset).

## User Feedback & Preferences (REQUIRED — never omit)

- Standing rule at session start: **narrate onboarding, then wait** for "go ahead" (pasted prompt).
- Reports tersely with "(done)" plus screenshots; this time screenshots were sent for 2a. **"(done)" claims still need evidence** for plan boxes (curl rows accepted on the user's word "both rows show" — ticked with a note).
- **Ringing request (verbatim gist):** "can you please fix on the responders mobile app the vibrator? Because it only works when the application is open … i want it to works to even when the mobile app is close or on tab. when there's a new assignement the vibrator will activate to alert the responders … and ensure its navigation process are good and not scattered".
- **Demo:** "can you please give me a reset to reseed again, because we're going to have a demo later".
- **Seed:** "can you please do not include an demo assignments on the responders".
- Asked "should i redeploy latest commit on railway?" → wants a direct yes/no.
- Commits and pushes himself; this session he committed `18ffc6a` and `07dcb8b` correctly with the chained one-liners. Keep giving **both** Git Bash and PowerShell forms.
- Pastes raw terminal output (including, once, a secret by accident) → **every secret prompt must use `-AsSecureString` / `read -s`, and checks must never echo a URL with credentials**.
- Carried: phase by phase; public repo; $0 preference; numbered steps answerable with "(done)"; push only when nobody is testing (pushes redeploy Railway + Vercel).
- Ended with: "use the /handoff to summarize everything so far and close this session and give me the prompt for the fresh session".

## Where We're Going

1. **Demo readiness (today):** ask whether the second reset + seed + rotate (no responder assignments) was run and whether the **PostGIS TCP Proxy is off**. If not run: same commands as before (TCP proxy on → `Read-Host -AsSecureString` URL → safe host check → `pnpm db:reset-data; if ($?) { pnpm db:seed }` → rotate → `Remove-Item Env:…` → proxy off). Then everyone signs in again (web + responder phone so the push token is re-registered); guest demo phone → Clear data.
2. **Ringing tests a–d on APK #2** (box 364): a closed → keeps ringing; b tap → assignment, Back → Home; c pull shade → stops, rings again ~30 s; d open from launcher → quiet + red full-screen alarm; Accept → stops; plus cancel from web → "Assignment cancelled" quiet. Get the phone model. If a fails, debug in order: did the task register (app opened once after install)? Battery Unrestricted / Autostart? notification permission? Does "New assignment (ringing)" channel exist in Settings → Apps → AGAP → Notifications (created only on the first ring)?
3. **After the demo: rotate the PostGIS password** (leaked in chat) and Redis password; update `DATABASE_PRIVATE_URL` reference if needed; verify backend health. Then **push `07dcb8b`** (+ handoff commit) when nobody is testing.
4. **Finish box 360** on APK #2: countdown unlock at 0:00, red button after Close, data off → form.
5. **2e:** responder Profile → Add Photo (cap → refused with cap message), Passkeys; tune `PROFILE_PHOTO_HEADWEAR_THRESHOLD` with `backend/scripts/photo-check-scores.ts`.
6. Parent leftovers: confirm Railway `OPENAI_API_KEY` exists (evidence AI), admin-page screenshots (`AccessMatrix.tsx:55`), mobile-data sign-in, remaining Phase 6 boxes (356, 362, 363).

## Gotchas Learned This Session

- Backend jest config is `backend/test/jest.config.ts`: single files run with `npx jest --config ./test/jest.config.ts <files>` from `backend/`; the **full** suite only via `pnpm --filter @agap/backend test` (direct `npx jest --config …` on everything gave a `<rootDir>` validation error).
- Git Bash has no `/proc/sys/kernel/random/uuid` → `node -e 'console.log(crypto.randomUUID())'`.
- TS narrows `AppState.currentState` after a `=== 'active'` early return → re-read through a function (`onScreen()`) after an `await`.
- Local Expo modules: any folder under `mobile/modules/` with `expo-module.config.json` is autolinked (no package.json; name = folder). Check with `npx expo-modules-autolinking resolve -p android`.
- Background notification tasks must be defined in a module imported **before** `expo-router/entry` → custom `mobile/index.ts` entry.
- Railway PostGIS `DATABASE_URL` resolves to `…@:/railway` (empty host) when the **TCP Proxy is off**.
- `[uri]` casts in PowerShell echo the full input on failure → never use them on secrets.
- GitHub Actions status without `gh`: `curl -s "https://api.github.com/repos/crud-j/agap-emergency/actions/runs?branch=main&per_page=1"` (public repo).

## Risks & Blockers

- **PostGIS password exposed** in the chat transcript. Only exploitable while the TCP Proxy is on. Rotate after the demo.
- **Insistent ringing is untested on a device.** The Kotlin compiled (EAS build succeeded) but behaviour (task wake-up from killed state, the 1.2 s replace race, deep-link tap, Back → Home via `initialRouteName`) is unverified. Fallback if the task never runs: Expo's normal notification every 30 s (same as before).
- **OEM swipe-kill** (Xiaomi/Oppo/Vivo without Autostart) stops all FCM delivery; Samsung "sleeping apps" too → Battery Unrestricted + Autostart required.
- **Data-only pushes have no iOS path** (no APNs payload) — Android-only deployment for now.
- **Guest limits live in Redis and survive DB resets** → demo guest reports can be refused (3 per 10 min per spot; 2/10 min, 3/day per phone).
- **Backend test timeouts** (auth-phase2, id-register, id-national) under full parallel load locally; CI was green, but they could flake there too.

## Open Questions

- Were ringing tests a–d done, and with what result / phone model?
- Was the second reset + seed (no responder assignments) run? Is the TCP Proxy off again?
- Was the 18th unrotated account `admin@agap.local`? (likely; not verified)
- Does Railway have `OPENAI_API_KEY`? HEADWEAR threshold for real selfies?
- Is `18ffc6a` the Active deployment on Railway (it should be; health ok, but the deploy-stuck issue happened before)?

## Quick Start for Next Session

```bash
# Restore context (bd not installed)
docs/handoff/2026-11-27_responder-ringing-and-demo-reseed.md   # this file
docs/plans/DEPLOYMENT_PLAN.md                                  # Phase 6 boxes ~355-364
CLAUDE.md

# Key files to read first (not exhaustive — explore adjacent code too)
mobile/modules/agap-alarm/android/src/main/java/expo/modules/agapalarm/AgapAlarmModule.kt
mobile/src/services/push/assignment-ring-task.ts
mobile/src/components/responder/assignment-alarm.tsx
backend/src/jobs/processors/notification.processor.ts         # buildFcmMessage
backend/prisma/seed/presentation-data.ts                       # current-shift incidents

# Verify current state (read-only)
git fetch && git log origin/main..HEAD --oneline   # expect 07dcb8b + session handoff commit (unpushed)
curl -s https://agap-emergency-production.up.railway.app/v1/health

# Tests
pnpm --filter @agap/shared build
pnpm --filter @agap/backend test                    # 144 suites / 2550; rerun auth/ID suites alone on timeout
cd mobile && NODE_PATH="$(cd ../node_modules/.pnpm/$(ls ../node_modules/.pnpm | grep '^@babel+traverse@' | head -1)/node_modules && pwd -W)" npx jest   # 28 / 321

# Next action
Ask: second reseed done? TCP proxy off? ringing a–d results + phone model?
Then (after the demo) rotate the PostGIS password and push 07dcb8b.
```

## Session Closed
**Closed at:** 2026-11-27 (local, GMT+8)
**Commit:** the `session: responder-ringing-and-demo-reseed` commit that includes this note (not pushed: a push to main redeploys Railway and Vercel; the user pushes, after the demo)
**Session status:** Handed off to next session
