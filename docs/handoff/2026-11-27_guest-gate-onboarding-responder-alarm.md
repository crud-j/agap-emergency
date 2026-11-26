# Guest "active report" gate + 10-min false-alert wait; onboarding once; responder photo/passkeys; cap/hat photo check; evidence-AI tests; responder re-buzz alarm; CI fixed (all pushed; nothing tested on a phone yet; one new APK needed)

**Date:** 2026-11-27
**Status:** IN PROGRESS (all code committed **and pushed** by the user; `main` = `origin/main` = `a65f5a9`; backend auto-deployed to Railway, web to Vercel; **no new APK built yet**, so every mobile change is untested on a device)
**Bead(s):** none (`bd` is not installed: `bash: bd: command not found`)
**Epic:** Deployment plan `docs/plans/DEPLOYMENT_PLAN.md` (Phase 6 end-to-end checks) + user-requested features
**Chain:** `standalone-953e4889` seq `8`
**Parent:** `docs/handoff/2026-11-26_guest-one-open-report.md`
**Prior chain:** `docs/handoff/2026-11-24_deployment-phases-1-3.md` > `docs/handoff/2026-11-24_deployment-phases-3-4.md` > `docs/handoff/2026-11-24_deployment-phase-5-eas-id-ocr.md` > `docs/handoff/2026-11-24_deployment-phase-5-admin-sms-tracking.md` > `docs/handoff/2026-11-26_guest-follow-and-guest-security.md` > `docs/handoff/2026-11-26_trust-proxy-and-admin-sidebar.md` > `docs/handoff/2026-11-26_guest-one-open-report.md` > this

---

## Stale References

- `openReportOf` — renamed to `blockOf` in `backend/src/emergency-alerts/guest-report-limit/guest-report-limit.service.ts`; the name survives only in a **code comment** at line 46 ("(see openReportOf)"). Cosmetic; fix the comment when next in that file.
- `GUEST_REPORT_ENDED_STATUSES` — no longer defined in the limiter; it now lives in `shared/src/constants/guest-report.ts` and the limiter re-exports it (`export { GUEST_REPORT_ENDED_STATUSES }`).

## Since Last Handoff

- **Parent step 1 (retest the open-report rule live): user said "(done) second report was blocked" but never sent the Security Events screenshot.** The plan box "One open report per guest phone" (DEPLOYMENT_PLAN.md ~line 357) is **still unticked**. Standing rule: tick only from a Security Events row reading "Earlier report still open · INC-…".
- **New user feature (mid-session):** a guest with an active report should be taken to that report instead of filling in a form that gets refused, see live status ("a transmission, not just the notification"), and after close get a countdown. Built as: entry gate → "Your report" screen with active-report notice / live countdown; **countdown only after FALSE_ALERT (10 min)** per the user's own suggestion (commit `f562332`).
- **New user request (pasted spec, 5 items):** onboarding re-appears every launch; responder passkeys; AI Photo Evidence "fully working"; citizen profile photo validation incl. cap/hat; responder profile photo. All done in `7d60724`.
- **New user feature:** responder phone keeps buzzing on an unanswered assignment while the app is closed (TikTok scenario). Built: server re-push every 30 s ×6, escalation after 3 min, alarm channel, in-app full-screen alarm (`aec3719`).
- **CI was red on every push** (GitHub Actions "Lint & Typecheck": `Cannot find module '@agap/shared'`), pre-existing, not caused by this session. Fixed by a "Build shared" step (`64b0298`). Then `pnpm --filter @agap/backend test` failed on a bcrypt timeout in `auth-phase3.spec.ts`; fixed with a file-level `jest.setTimeout(30_000)` (`a65f5a9`). Whether the next GitHub run is green was **not confirmed** (no `gh` CLI here).
- **Parent steps 2–7** (clean up test incidents 060/061/062, APK guest-follow test, admin-page screenshots, mobile-data sign-in, remaining Phase 6 boxes, rotate PostGIS/Redis passwords): **untouched**.
- Trajectory: still on the deployment plan, but this session was mostly new features. The single biggest pending item is **one new EAS preview APK** that carries four sessions' worth of mobile changes, then device testing.

## Reference Documents

- `docs/plans/DEPLOYMENT_PLAN.md` — **the** plan. Phase 6 boxes added this session (all unticked): "Wait after a false alert", "Guest is taken to their open report" (~lines 359–360), "Unanswered assignment keeps buzzing" (after "Dispatching from the web reaches the responder APK…").
- `CLAUDE.md` — Rules 8 (dispatcher decides), 9 (hotlines), 12 (idempotent), 13, 14 (guest reporting always available), 15 (never reveal another reporter), Reliability Rules (an outage never blocks help; no silent failures).
- `docs/handoff/2026-11-26_guest-one-open-report.md` — parent; the one-open-report rule's design (Redis `guestlim:open:*` key, fail-open, 429 shape).
- Memory: `project-backend-test-run.md` (updated this session: auth-phase3 timeout fix + CI build-shared note), `project-mobile-build-env.md` (mobile jest NODE_PATH workaround, EAS cloud builds), `feedback-git-bash-commits.md`, `feedback-no-backslash-shell-edits.md`.

## The Goal

Run AGAP (Bocaue MDRRMO emergency system, a student's school project heading toward a pilot) without the laptop: Vercel web console, Railway NestJS backend + PostGIS + Redis, Cloudflare R2, and an EAS preview APK. This session hardened the **guest** path (a guest can't spam, but is always shown their active report and the hotlines), fixed the **mobile onboarding** bug, brought the **responder** profile up to the citizen's (photo + passkeys), added a **cap/hat** profile-photo check, proved the **AI photo-evidence** pipeline with tests, made **unanswered responder assignments impossible to miss**, and made **GitHub CI** pass. The end state the user wants next: one APK with all of it, tested on real phones, then the remaining Phase 6 boxes and password rotation before a pilot.

## Where We Are

- **Git:** `main` = `origin/main` = `a65f5a9` (verified `git fetch` + `git log origin/main..HEAD` → empty). Uncommitted and **not ours, leave alone:** `frontend/tsconfig.tsbuildinfo` (M), `docs/presentation/Justine_Soliman_IPO_Report.md` (??).
- **Live backend health** last seen ok: `{"status":"ok","timestamp":"2026-11-26T15:20:49.965Z","version":"1.0.0"}` after the `f562332` push. Later pushes (`7d60724`, `aec3719`, CI commits) redeployed Railway; health not re-probed after them.
- **Guest gate (backend, live since `f562332`):** `GuestReportLimitService.reserve()` order is: disabled → admitted-idempotency-key retry → `blockOf(deviceId)` → counters. `blockOf` returns `{reason:'open'}` (429 `GUEST_REPORT_OPEN`, `retryAfterSeconds 0`, no Retry-After) or `{reason:'wait', retryAfterSeconds}` (429 `GUEST_REPORT_WAIT`, with Retry-After) or null.
- **Shared rule:** `guestNewReportGate(effectiveStatus, changedAt, now)` in `shared/src/constants/guest-report.ts` → `{reason:'open'}` while not ended; `null` for RESOLVED/CLOSED/CANCELLED/UNABLE_TO_RESPOND/REFERRED; `{reason:'wait', until}` for FALSE_ALERT until `changedAt + GUEST_FALSE_ALERT_WAIT_SECONDS` (600).
- **`changedAt`** = newest `incident_events.occurred_at` (fallback `submitted_at`), same source the guest status screen uses. Both false-alert paths write an `incidentEvent` (`false-alerts.service.ts` ~line 193; `incidents.service.ts` `recordTransition` + `false_alerts.create` ~line 860).
- **Status endpoint** `GET /v1/guest-reports/status` now returns `newReportBlock: {reason:'open'} | {reason:'wait', until: ISO} | null` (`guest-follow.service.ts` `status()`).
- **Security Events (web, live on Vercel):** `LIMIT_WAIT` → "Wait after a false alert · INC-… · N min left · Phone …" (`SecurityEvents.tsx` `DETAIL_LABELS`, `guestDetailOf`).
- **Mobile guest gate (needs APK):** `useGuestReportEntry()` on both "Report an emergency" buttons (login + registration ×2) → `guestReportGate()` (3 s timeout, any doubt → `go`) → either the report flow or `/emergency/guest-status`. "Your report" screen now shows `GuestNewReportPanel` (active notice / m:ss countdown with locked button / red "Report an emergency"). "Report Not Sent" (429) has a "See your report" button when a saved report exists.
- **Onboarding (needs APK):** AsyncStorage flag `agap.onboarding_complete.v1`; `_layout.tsx` AuthGuard waits for it; signed-out at `/` → `/auth/login` once done, else `/onboarding/first-onbrd`; signed-in users get the flag set automatically. Skip on all 4 screens + Continue on screen 4 call `useFinishOnboarding()` (mark, then `router.replace('/auth/login')`).
- **Responder profile (needs APK):** `app/responder/profile.tsx` has Add/Change Photo (same `ChangePhotoModal` + `/profile/selfie`), photo fields refreshed via `getMe()` on focus, and a Passkeys row → `/profile/passkeys`. `selfie.tsx` back-fallback is role-aware (`/responder/profile` for RESPONDER).
- **Photo check (backend live):** new `HEADWEAR` issue (caps/hats; hijab/headscarf/turban on the pass side), default threshold **0.80, untuned**, env `PROFILE_PHOTO_HEADWEAR_THRESHOLD`. Mobile shows `reasonHeadwear` (EN/FIL). **Old APK shows a generic error for a cap-only refusal.**
- **AI photo evidence:** code path unchanged and confirmed by reading + 13 new tests. Live only if Railway has `OPENAI_API_KEY` (unknown). Local `backend/.env` has it set (value never printed).
- **Responder re-buzz (backend live since `aec3719`):** every assignment push also enqueues `responder-assignment-reminder` (delay 30 s). `runAssignmentReminder` re-pushes while dispatch status is PENDING/SENT, up to `ASSIGNMENT_REMINDER_MAX = 6`; at attempt 6 it raises one `Escalation` ("No answer to assignment — INC-…: {name} ({call sign}) has not accepted or declined in 3 min. Consider reassigning."), emits `notifyEscalation(… 'RESPONDER_NO_ANSWER')`, and queues supervisor pushes.
- **Assignment pushes now go to channel `assignments-alarm`** with FCM `android.notification.tag = assignment-{dispatchId}` (repeats replace). Cancellation uses `assignments` + same tag. **An APK without the new channel shows these on Android's fallback channel** (quieter) until updated.
- **Mobile alarm (needs APK):** `assignments-alarm` channel (MAX, vibration `[0,1000,400,1000,400,1000,400,1000]`, ALARM audio usage, PUBLIC lockscreen, bypassDnd). In-app `AssignmentAlarm` (root layout, responders only) — red full-screen modal + `Vibration.vibrate([0,1000,600], true)` while app active, until on `/responder/assignment/{id}`. Foreground ASSIGNMENT pushes: no banner/sound, invalidate `['responder-assignments']`.
- **CI:** `.github/workflows/ci.yml` builds `@agap/shared` before typecheck (lint-typecheck job) and before tests (test-backend job).
- **Tests at close:** backend `pnpm --filter @agap/backend test` 143 suites / 2546 tests pass (79–96 s); mobile 26 suites / 312; frontend 28 suites / 266 (last full run after `f562332`); `tsc` exit 0 in shared, backend, frontend, mobile.

## What We Tried (Chronological)

1. **Onboarding narration (standing rule).** Read parent handoff; `bd` missing; `git fetch` → 1 ahead (`b51f83e` handoff commit), 0 behind; health ok at 14:47 UTC. Read limiter service/interceptor, plan box, module wiring, `incidents.controller.ts:109-116` (confirmed the guest create response **includes `id`**, so `rememberOpen` gets it — ruled out a silent-failure hypothesis), `device-readiness.ts:34-52` (device id in SecureStore → clearing app data yields a new id). Waited for go-ahead.
2. **Baseline after "go ahead":** guest-limit spec 38/38, backend tsc 0. Gave a 7-step live retest (clear app data → A → B blocked → False alert A → C → screenshot).
3. **User: "(done) second report was blocked" + new feature ask** (navigate guest to active report; show a "transmission"; countdown after close). Did not tick the box (no screenshot). Explored `saved-guest-report.ts`, `guest-report.api.ts`, `guest-status.tsx`, `GuestReportStatusCard.tsx` (polls 15 s), `login.tsx` guest entry (`reportEmergencyAsGuest`), `transmission.tsx` success/429 paths, `guest-follow.service.ts`. Found no `expo-updates` → every mobile change needs a new APK.
4. **Asked countdown length (5 / 10 / 5+10 after false alert).** User replied: "What do you think is best? is it much better if it does not have a countdown when its successfully resolved or close, only when its flag as false alert?" → I agreed: **no wait after resolved/closed/cancelled/unable/referred; 10 min only after FALSE_ALERT**. Rationale: a genuine reporter may have a second real emergency (Rule 14); false alert is the spam case and a dispatcher judged it; cancelled is usually the reporter's own mistake.
5. **Implemented the guest gate** (shared rule → limiter `blockOf` → status `newReportBlock` → Security Events label → mobile gate/panel/See-your-report). First backend tsc failed only because `shared/dist` needed rebuilding (`npx tsc -p tsconfig.json` in `shared`). Tests: limiter+guest-follow 92/92; frontend tsc 0 + security-events 7/7; mobile tsc 0 + 24/304; backend full 140 pass + 1 timeout (auth-phase3, passes alone with `--testTimeout=30000` → 59/59).
6. **User pushed `f562332`** ("(done) pushed"). Verified `origin/main`, health ok; could not prove the new code was live without creating a real incident → gave a server-only test (false alert → immediate second report → "Wait after a false alert" row).
7. **User pasted a 5-item spec** (onboarding, responder passkeys, AI photo evidence, citizen photo validation incl. cap/hat, responder profile setup). Investigation: onboarding root cause in `_layout.tsx` AuthGuard (`atRoot && !isAuthenticated` → always onboarding; Skip/Continue only `router.push('/auth/login')`, nothing persisted). Backend passkey routes (`auth.controller.ts` ~268–360) and `POST /users/me/photo` are `JwtAuthGuard` only → any role. Photo check had only `SUNGLASSES` + `UNDRESSED`, though the app's tip already said "Avoid wearing a cap". Evidence AI = `EvidenceAiReviewService` (OpenAI `gpt-4o-mini`, off without key), wired in `media.service.ts` `runEvidenceAiReview`, shown in `IncidentDetailDrawer.tsx`; **zero tests existed**.
8. **A recursive `grep`/`find` over the repo hung >120 s** (node_modules) → stopped with TaskStop; used the Grep tool instead. No tuning script or sample photos exist in the repo.
9. **Implemented the 5 items.** Onboarding via AsyncStorage (chosen over SecureStore: non-secret flag). Responder profile mirrors citizen (photo + passkeys). `HEADWEAR` prompts + env threshold + `scripts/photo-check-scores.ts`. Smoke test on a generated blank grey 640×640 JPEG with the **locally cached** CLIP model (`backend/.cache/models/Xenova/clip-vit-base-patch32`): `SUNGLASSES 0.339 UNDRESSED 0.627 HEADWEAR 0.339 → passes` (proves loading/scoring only, not accuracy).
10. **Evidence-AI tests first failed 8/13** with `TypeError: openai_1.default is not a constructor` — my `jest.mock` used an arrow function (can't `new`). Fixed with a `function OpenAI(...)` mock → 42/42 (with profile-photo spec). Backend full 142/2533.
11. **User asked for "vibration until they notice"** (TikTok scenario). Explained the hard limit (closed app runs no JS → only server re-push + channel settings). Proposed: server re-push every 30 s until accepted/declined, escalate to ops after N, stronger channel, in-app alarm; rejected Notifee/full-screen-intent for now. **Asked interval → user picked "Every 30 s, 3 min (Recommended)".**
12. **Implemented re-buzz.** First tsc error: `exactOptionalPropertyTypes` on `job.userId` → widened to `string | undefined`. Two existing tests failed on new wording/channel → updated expectations + added 2. Wrote `assignment-reminder.spec.ts` (10 tests) → 24/24 for both specs. A stray `cat > /dev/null` in a Bash call hung on stdin → stopped. Mobile tsc 0, 26/312; backend 143/2546.
13. **User's commit failed** ("no changes added to commit": ran `git commit` without `git add`, again without Co-Authored-By). Re-sent a single `git add … && git commit … && git status --short` line.
14. **CI red:** user pasted GitHub Actions log (`Cannot find module '@agap/shared'` ×~180 + knock-on type errors). Root cause: `dist/` gitignored; Dockerfile:45 builds shared, CI never did. Tried to reproduce by `mv shared/dist` → `Permission denied` (Windows lock) — not reproduced, but cause certain. Added "Build shared" to both CI jobs. Local `pnpm --filter @agap/frontend typecheck` → exit 0.
15. **User: "run `pnpm --filter @agap/backend test`"** (BackupCodesService timeout). Reproduced (1 failed / 2545). Cause: bcryptjs cost 10, ~30 hash/compare calls per test under parallel load. Fix: `jest.setTimeout(30_000)` at the top of `auth-phase3.spec.ts` only → 143/2546 pass (96.5 s). Updated memory `project-backend-test-run.md`.

## Key Decisions

- **Countdown only after FALSE_ALERT (10 min); none after resolved/closed/cancelled/unable/referred** — user's suggestion, I endorsed. Rejected: 5 min after every close; 10 min after every close; "5 min, 10 after false alert".
- **One shared rule (`guestNewReportGate`) for the server refusal and the app's status screen** so they never disagree. The server remains the authority; the app gate fails open (no saved report, offline, >3 s, 401/404, older server without the field → `go`).
- **Guest gate stop condition = server data, not local state**: the panel reads `newReportBlock` from the polled status query (shared cache with `GuestReportStatusCard` via exported `useGuestReportStatus`).
- **Onboarding flag in AsyncStorage**, not SecureStore (not a secret; Expo-recommended). Unreadable storage → treated as done (never trap a user in onboarding). Signed-in users are marked done (covers pre-flag installs).
- **HEADWEAR check with religious coverings on the pass side**; default 0.80 so only clear caps are refused until tuned. Rejected: adding face-count/filter detection (tips stay advisory only); shipping without an env override.
- **Responders don't get "Show my photo to responders"** (citizen-reporter concept).
- **Re-buzz stop condition = dispatch answered (accepted/rejected/cancelled/completed), crew removed, or incident ended** — not "app opened" (could be accidental/another screen). Acceptance is per **dispatch**, so one crew member accepting silences the unit.
- **Escalation via the existing `Escalation` table + `notifyEscalation`** (shows on console Escalations page + Supervisor dashboard without frontend changes), raised **once per dispatch** (dedupe on `triggered_reason` prefix `No answer to assignment` + `created_at >= dispatch.created_at`). Rejected: pushing dispatchers (console staff have no FCM token).
- **New channel id `assignments-alarm`** because Android channel sound/vibration are immutable after creation. Old channel `assignments` kept for cancellations.
- **No Notifee / full-screen intent / looping ring** — Play-restricted `USE_FULL_SCREEN_INTENT`, big native change. Can revisit if field tests show 30 s pulses aren't enough.
- **CI timeout fix is per-file**, never a global `testTimeout`, so real hangs elsewhere still fail fast.

## Evidence & Data

### Commits this session (all pushed by the user)

| Hash | Summary |
|---|---|
| `f562332` | feat(guest): open report screen instead of a refused form; 10 min wait after a false alert |
| `7d60724` | fix(mobile): onboarding once per install; responder photo + passkeys; cap/hat photo check; evidence AI tests |
| `aec3719` | feat(responder): re-buzz unanswered assignments every 30 s, escalate after 3 min; in-app alarm |
| `64b0298` | ci: build @agap/shared before backend/frontend typecheck and tests |
| `a65f5a9` | ci: build shared before typecheck/tests; longer timeout for bcrypt-heavy auth tests |
| this handoff | session: guest-gate-onboarding-responder-alarm (committed at close, not pushed) |

### Guest new-report rule (shared `guestNewReportGate`)

| Last report's effective status | Server (POST /v1/incidents, guest) | App ("Report an emergency") |
|---|---|---|
| RECEIVED…TRANSPORTING/ASSISTING (open) | 429 `GUEST_REPORT_OPEN`, no Retry-After | opens "Your report": "You already have an active report" + sign-in button |
| FALSE_ALERT, < 10 min since marked | 429 `GUEST_REPORT_WAIT`, Retry-After = seconds left | "Your report": "Marked a false alert", m:ss countdown, locked button |
| FALSE_ALERT, ≥ 10 min | allowed | red "Report an emergency" |
| RESOLVED / CLOSED / CANCELLED / UNABLE_TO_RESPOND / REFERRED | allowed at once | red "Report an emergency" |
| DUPLICATE | follows merge chain (≤3 hops); guest's **own** reference named | same as the report it was merged into |
| any error / no saved report / >3 s | fail open | go to the form |

### Assignment re-buzz timeline (constants in `backend/src/dispatch/assignment-push.ts`)

| t | Event |
|---|---|
| 0 s | `ASSIGNMENT` push (title "New assignment") on `assignments-alarm`, tag `assignment-{dispatchId}`; reminder job attempt 1 queued (delay 30 000 ms) |
| 30–150 s | attempts 1–5: still PENDING/SENT → push "New assignment: still waiting", queue next |
| 180 s | attempt 6: push again + one Escalation `LEVEL_1_SUPERVISOR` + `notifyEscalation('RESPONDER_NO_ANSWER')` + supervisor pushes (`no-answer-escalation`), no further checks |
| any | dispatch ACCEPTED/REJECTED/CANCELLED/COMPLETED, crew removed, or incident RESOLVED/CLOSED/CANCELLED/FALSE_ALERT/DUPLICATE/UNABLE_TO_RESPOND/REFERRED → `'answered'`, stop |

Reminder job id: `assign-remind-{dispatchId}-{userId}-{chain}-{attempt}` (`chain` = `Date.now()` at first push; keeps ids unique on crew remove/re-add). Options: `removeOnComplete: true, removeOnFail: 100`.

### Profile photo check thresholds (`photo-content-check.service.ts` `DEFAULT_THRESHOLDS`)

| Issue | Default | Env | Tuned? |
|---|---|---|---|
| SUNGLASSES | 0.78 | `PROFILE_PHOTO_SUNGLASSES_THRESHOLD` | yes (earlier sessions) |
| UNDRESSED | 0.70 | `PROFILE_PHOTO_UNDRESSED_THRESHOLD` | yes |
| HEADWEAR | 0.80 | `PROFILE_PHOTO_HEADWEAR_THRESHOLD` | **no** — needs real selfies |

Blank-image smoke test: `SUNGLASSES 0.339 UNDRESSED 0.627 HEADWEAR 0.339 → passes`.

### Test runs

| Run | Result |
|---|---|
| guest-limit spec (baseline) | 38/38 |
| guest-limit + guest-follow specs after gate | 92/92 |
| frontend tsc + security-events-guest | exit 0; 7/7 |
| mobile after guest gate | tsc 0; 24 suites / 304 |
| backend full after guest gate | 140 pass + auth-phase3 timeout (59/59 with `--testTimeout=30000`) |
| frontend full after guest gate | 28 suites / 266 |
| evidence-ai + profile-photo specs | first 8 failed (arrow-fn mock) → 42/42 |
| backend full after 5-item spec | 142 / 2533 |
| mobile after 5-item spec | tsc 0; 25 / 308 |
| reminder + assignment-push specs | 24/24 |
| mobile after re-buzz | tsc 0; 26 / 312 |
| backend full after re-buzz (`--testTimeout=30000`) | 143 / 2546 |
| `pnpm --filter @agap/backend test` before fix | 1 failed / 2545 (BackupCodesService "regenerating invalidates the previous set", 5 s timeout) |
| same after `jest.setTimeout(30_000)` | 143 / 2546, 96.5 s |
| `pnpm --filter @agap/frontend typecheck` | exit 0 |

### Responder-alarm options weighed (TikTok scenario)

| Option | Works with app closed? | Cost | Verdict |
|---|---|---|---|
| A. Stronger channel only (long vibration, alarm sound) | yes, but buzzes once | mobile-only, new APK | part of the build |
| B. Server re-push every 30 s until answered, escalate at 3 min | yes | backend + no migration | **built** (with A) |
| C. Notifee / full-screen intent / looping ring (phone-call style) | yes | native lib + data-only FCM + headless JS; `USE_FULL_SCREEN_INTENT` is Play-restricted to call/alarm apps | rejected for now |
| D. Stop when app opened | — | — | rejected: opening ≠ seeing the mission; full-screen in-app alarm covers it anyway |
| Interval choices offered | 30 s / 3 min (chosen), 20 s / 2 min, 60 s / 5 min | | user picked 30 s / 3 min |

### Alarm channel as created on the phone (`push-registration.ts`)

```ts
setNotificationChannelAsync('assignments-alarm', {
  name: 'New assignments (alarm)',
  description: 'Rings and vibrates for a new assignment until you accept or decline it.',
  importance: AndroidImportance.MAX, enableVibrate: true,
  vibrationPattern: [0, 1000, 400, 1000, 400, 1000, 400, 1000],
  lockscreenVisibility: AndroidNotificationVisibility.PUBLIC, bypassDnd: true,
  audioAttributes: { usage: AndroidAudioUsage.ALARM, contentType: AndroidAudioContentType.SONIFICATION },
});
```
Channels are created in `getDevicePushToken()` (runs on `registerPushToken` after sign-in), so a responder must **sign in once on the new APK** for the channel to exist. `VIBRATE` is already in `app.json` permissions.

### Live probes this session

| Probe | Result |
|---|---|
| health at onboarding | `…2026-11-26T14:47:29.542Z` ok |
| health after `f562332` push | `…2026-11-26T15:20:49.965Z` ok (version string unchanged, so can't prove new code) |
| live guest POST | **not done on purpose** (would create a real incident in the dispatch queue) |

### Guest 429 bodies

```json
{ "statusCode": 429, "code": "GUEST_REPORT_OPEN", "retryAfterSeconds": 0, "publicReference": "INC-…",
  "message": "You already sent report INC-…, and MDRRMO is still handling it. You can send a new report once it is closed. If this is a different emergency, call 911 or the Bocaue MDRRMO hotline now, or sign in to report right away." }
{ "statusCode": 429, "code": "GUEST_REPORT_WAIT", "retryAfterSeconds": 412, "publicReference": "INC-…",
  "message": "Your last report INC-… was marked a false alert by MDRRMO. You can send a new report in about 7 minutes. If this is an emergency, call 911 or the Bocaue MDRRMO hotline now, or sign in to report right away." }
```

Audit `newValues` on refusal: `{ reason: 'LIMIT_OPEN' | 'LIMIT_WAIT', device: '<8-hex>', openReport: 'INC-…', retryAfterSeconds }`.

### CI failure (before fix)

`Error: src/…: error TS2307: Cannot find module '@agap/shared' or its corresponding type declarations.` on ~180 files, plus knock-ons (`administration.module.ts(19,30) TS2345`, `identity-verification-review.service.ts(72,52) 'rules' is of type 'unknown'`, `rescue-summary.ts(73,3) missing families, children…`). All from missing `shared/dist`.

## Code Analysis

- `shared/src/constants/guest-report.ts`: now imports `IncidentStatus` from `../enums/incident-status.enum`; exports `GuestNewReportBlock`, `GUEST_REPORT_ENDED_STATUSES`, `GUEST_FALSE_ALERT_WAIT_SECONDS = 600`, `guestNewReportGate()`; `GuestReportStatus.newReportBlock` added (required field).
- `guest-report-limit.service.ts`: `GuestBlockReason = GuestLimitScope | 'open' | 'wait'`; `GuestReportLimitExceeded` code map open→`GUEST_REPORT_OPEN`, wait→`GUEST_REPORT_WAIT`, else `GUEST_REPORT_LIMIT`; `limitMessage` has a `wait` branch; `blockOf(deviceId, now)` selects `status, public_reference, duplicate_of_id, submitted_at, incident_events(latest)`; key kept during wait, `del` when free.
- Interceptor unchanged: `Retry-After` only if `> 0`; audit reason is `LIMIT_${scope.toUpperCase()}` → `LIMIT_WAIT` automatically.
- `notification.processor.ts`: `NotificationJobData.androidTag?`; constructor gained `@Optional() @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) notificationQueue?` and `@Optional() realtime?: RealtimeService`; new `case 'ASSIGNMENT_REMINDER'` → `runAssignmentReminder({prisma, queue, realtime, push: sendPush, logger}, {userId, ...job.data.data})`; `sendFcm` adds `android.notification.tag`. Note `process()` swallows errors, so BullMQ `attempts` never retry (pre-existing).
- `dispatch.service.ts` `queueAssignmentPushes`: after the pushes, `Promise.allSettled` of reminder jobs for every job whose `data.type === 'ASSIGNMENT'` (covers `announceDispatch` and `addCrew`).
- `assignment-reminder.ts` selects `dispatches.findUnique({ status, incident_id, created_at, incidents{category, public_reference, status}, resources{name, call_sign}, dispatch_crew where user_id → users.full_name })`. Never throws (returns `'skipped'`).
- `mobile/app/_layout.tsx`: `setNotificationHandler` now takes `notification`; ASSIGNMENT → no banner/sound + invalidate `['responder-assignments']`; AuthGuard has `onboardingDone` state; `<AssignmentAlarm />` mounted between `OfflineBanner` and `LaunchSplash`.
- **Evidence AI (read, unchanged):** Tier 1 = `assessAuthenticity(capture, incident)` device-provenance score/flags stored on `incidentAttachment` (`authenticity_score`, `authenticity_flags`). Tier 2 = `EvidenceAiReviewService.review(buffer, mime)` → OpenAI Responses API, model `OPENAI_EVIDENCE_REVIEW_MODEL` (default `gpt-4o-mini`), `input_image` with `detail: 'low'`, prompt judges "genuine, live photo" (screenshot / stock / AI / photo of a screen / meme / no incident content → SUSPICIOUS or LIKELY_FAKE). Parses the first `{…}` JSON, labels `LIKELY_REAL | SUSPICIOUS | LIKELY_FAKE`, reason trimmed to 300. Fire-and-forget after `incidentAttachment.create`, images only; saves `ai_review_label/reason/checked_at`; emits `incidentUpdated(change:'attachment_ai_reviewed')`; `IncidentDetailDrawer.tsx` shows it. **Guests don't upload media** (transmission.tsx `mediaState 'guest'`: "Photos are only sent from signed-in accounts. Your report was still delivered.") and citizens never see the AI label (dispatcher-only, advisory).
- **Profile photo pipeline (read):** `POST /users/me/photo` (`users.controller.ts` ~97) requires `captureSource` = live camera; `ProfilePhotoService.upload` → refuse guests → `assertCanChange` (once per 5 months, 409 `PROFILE_PHOTO_COOLDOWN` with `nextChangeAt`) → `normalise` (sharp rotate, 640×640 cover, JPEG q85) → `contentCheck.check` (`unavailable` → 503 `PROFILE_PHOTO_CHECK_UNAVAILABLE`, `rejected` → 422 `PROFILE_PHOTO_REJECTED` with `issues`) → private object store → optimistic `updateMany` on `profile_photo_updated_at`. Model: CLIP ViT-B/32 q8 via `@huggingface/transformers`, `LOAD_WAIT_MS = 20_000`, cache `PROFILE_PHOTO_MODEL_DIR` (default `.cache/models`), `PROFILE_PHOTO_CHECKS=off` skips. Score = softmax mass on the flag prompts (`flagProbability`, logit scale 100).
- **Selfie screen** (`mobile/app/profile/selfie.tsx`): phases intro → camera → review; deletes the temp image on close; maps `issues` to `reasonSunglasses / reasonUndressed / reasonHeadwear`; 409 cooldown updates the store and goes back. Tips (`tipCap`, `tipFaces`, `tipFilters`, `tipCircle`, `tipLight`, `tipBackground`) are **advice only** except sunglasses/top/cap.
- **Passkey screen** (`mobile/app/profile/passkeys.tsx`) is role-agnostic: list / create (`passkeyBeginRegistration` → `createPasskey` → `passkeyCompleteRegistration`) / revoke; 401 → alert + logout; 403 → `guestNotAllowed`. Passkey sign-in on `login.tsx` routes by `homeRouteForRole`, so responders land on `/responder/home`.
- **In-app alarm edge cases:** the Modal covers every screen (including an active mission) until the first pending offer is opened; with several offers it shows "+N more waiting"; it's a native `Modal`, so on a cold start from a push tap it can flash before the router reaches the assignment screen. Vibration stops when the app backgrounds (AppState) — the server pushes take over.
- `useResponderAssignments` (unchanged) classifies `PENDING`/`SENT` as `pendingOffers`; refetch 15 s; it is enabled for any token, so `AssignmentAlarm` gates on role RESPONDER before calling it.

## Files Changed

### Source code
- `shared/src/constants/guest-report.ts` — gate rule, constants, `newReportBlock` type (`f562332`).
- `backend/src/emergency-alerts/guest-report-limit/guest-report-limit.service.ts` — `blockOf`, `wait` reason/message/code (`f562332`).
- `backend/src/incidents/guest-follow/guest-follow.service.ts` — `newReportBlock` in `status()` (`f562332`).
- `frontend/components/admin/SecurityEvents.tsx` — `LIMIT_WAIT` label, "N min left" (`f562332`).
- `mobile/src/services/guest-report/guest-report-gate.ts` (new), `mobile/src/hooks/useGuestReportEntry.ts` (new), `mobile/src/components/guest-report/GuestNewReportPanel.tsx` (new), `GuestReportStatusCard.tsx` (exported `useGuestReportStatus`), `guest-status-text.ts` (`secondsUntil`, `formatCountdown`), `mobile/app/auth/login.tsx`, `mobile/app/auth/registration.tsx`, `mobile/app/emergency/guest-status.tsx`, `mobile/app/emergency/transmission.tsx` (`onSeeReport`, `canFollowEarlier`) (`f562332`).
- `mobile/src/lib/onboarding-status.ts` (new), `mobile/src/hooks/useFinishOnboarding.ts` (new), `mobile/app/onboarding/{first,second,third,fourth}-onbrd.tsx`, `mobile/app/_layout.tsx` (`7d60724`).
- `mobile/app/responder/profile.tsx`, `mobile/app/profile/selfie.tsx` (role-aware fallback, HEADWEAR reason), `mobile/src/i18n/translations.ts` (`reasonHeadwear` EN/FIL, `tipHeadCover` wording) (`7d60724`).
- `backend/src/users/profile-photo/photo-content-check.service.ts` — HEADWEAR (`7d60724`).
- `backend/src/dispatch/assignment-push.ts`, `backend/src/dispatch/dispatch.service.ts`, `backend/src/jobs/assignment-reminder.ts` (new), `backend/src/jobs/processors/notification.processor.ts`, `mobile/src/services/push/push-registration.ts`, `mobile/src/components/responder/assignment-alarm.tsx` (new), `mobile/app/_layout.tsx` (`aec3719`).

### Tests
- `backend/test/emergency-alerts/guest-report-limit.spec.ts` — `fakePrisma` with `changed_at`; FALSE_ALERT wait cases; interceptor `LIMIT_WAIT` + Retry-After; `guestNewReportGate` describe.
- `backend/test/incidents/guest-follow.spec.ts` — `newReportBlock` open/null/wait(08:05).
- `frontend/__tests__/security-events-guest.spec.ts` — `LIMIT_WAIT` detail.
- `mobile/src/services/guest-report/__tests__/guest-report-gate.test.ts` (10), `mobile/src/lib/__tests__/onboarding-status.test.ts` (4), `mobile/src/components/responder/__tests__/assignment-alarm.test.ts` (4).
- `backend/test/users/profile-photo.spec.ts` — HEADWEAR cases, religious-coverings-on-pass-side, env threshold.
- `backend/test/media/evidence-ai-review.spec.ts` (new, 13).
- `backend/test/dispatch/responder-assignment-push.spec.ts` — alarm channel/tag, reminder chain, cancellation channel.
- `backend/test/jobs/assignment-reminder.spec.ts` (new, 10).
- `backend/test/auth/auth-phase3.spec.ts` — file-level `jest.setTimeout(30_000)`.

### Config / scripts / docs
- `.github/workflows/ci.yml` — "Build shared" in both jobs.
- `.env.example` — `# PROFILE_PHOTO_HEADWEAR_THRESHOLD=0.80`.
- `backend/scripts/photo-check-scores.ts` (new) — `npx ts-node --transpile-only scripts/photo-check-scores.ts <folder outside repo>`.
- `docs/plans/DEPLOYMENT_PLAN.md` — 3 new unticked boxes + note on the open-report box.
- Memory `project-backend-test-run.md` updated.

### Not changed
- No Prisma migration, no Railway/Vercel env vars changed, no APK built.

## User Feedback & Preferences (REQUIRED — never omit)

- Standing rule at session start: **narrate onboarding, then wait** for "go ahead".
- **Guest feature request (verbatim gist):** "how can i make it navigate to the current report … when its still on progress as a guess … it does not navigate or tells the users … that they still have an active report, and they should also have an transmission. not just the notification. and once the incident or the report is closed or already resolved, they can now sent again … with a '5 or 10 minutes countdown'".
- **User's refinement:** "is it much better if it does not have a countdown when its successfully resolved or close, only when its flag as false alert?" → adopted.
- Pasted a structured 5-item spec ("senior React Native / Expo engineer", onboarding, responder passkeys, AI Photo Evidence, profile photo validation with no-shirt/shades/cap, responder profile + passkey). Wants production-ready, existing conventions, Expo-recommended libraries.
- **Responder alarm request:** "when they sign in and close the app, their phone gets vibrated, when there's a new alert … vibration up to util they notice it, or when they open the app or accepted the mission (pick much better)" → I picked "until accepted/declined"; user chose "Every 30 s, 3 min (Recommended)".
- Reports tersely with "(done)". **"(done)" claims are unreliable in detail** — the open-report retest was declared done with no screenshot; always ask for the Security Events row.
- **Commits and pushes himself**; twice ran `git commit` without `git add` (and without Co-Authored-By). Give **one chained line** (`git add … && git commit … && git status --short [&& git push]`) for Git Bash and a `; if ($?) {…}` chain for PowerShell.
- Pastes raw terminal/CI logs and expects a direct fix ("run `pnpm --filter @agap/backend test` because i have encounter this").
- Ended with: "use the /handoff to summarize everything so far so i can start a new fresh session because the context window is now on 33 percent, and close this session and give me the prompt".
- Carried: phase by phase; both shells; never repeat secrets; public repo; $0 preference; numbered steps answerable with "(done)".

## Where We're Going

1. **Build ONE new EAS preview APK** (`cd mobile && eas build --profile preview --platform android`) — carries guest gate, onboarding fix, responder photo/passkeys, HEADWEAR reason text, alarm channel + in-app alarm. Install on the test phone(s).
2. **Device tests (tick plan boxes only from screenshots / Security Events rows):**
   a. Guest: report A → tap "Report an emergency" → lands on "Your report" ("You already have an active report"); False alert A → countdown m:ss; after Close → red button; "Report Not Sent" shows "See your report".
   b. Open-report box (~line 357): Security Events "Guest report blocked · Earlier report still open · INC-…".
   c. False-alert wait: "Wait after a false alert · INC-… · N min left".
   d. Onboarding: close/reopen app twice → onboarding only first time.
   e. Responder: Profile → Add Photo (selfie with cap → refused with cap message) and Profile → Passkeys.
   f. Re-buzz: responder closes AGAP, opens TikTok, dispatch from web → rings ~every 30 s; Accept stops it; leave another 3 min → Escalations shows "No answer to assignment". Set **Battery → Unrestricted** for AGAP first.
3. **Confirm GitHub Actions "AGAP CI" is green** after `a65f5a9` (Lint & Typecheck + Backend Tests). If another bcrypt-heavy suite times out on the runner, give it the same file-level `jest.setTimeout`.
4. **Tune HEADWEAR**: user runs `backend/scripts/photo-check-scores.ts` on own selfies (cap / no cap / head covering), sends scores only → set `PROFILE_PHOTO_HEADWEAR_THRESHOLD` on Railway. Until the new APK is everywhere, consider `PROFILE_PHOTO_HEADWEAR_THRESHOLD=0.99`.
5. **Ask the user to confirm Railway has `OPENAI_API_KEY`** (existence only) so evidence AI runs live.
6. Parent leftovers: clean up test incidents (INC-2026-000060/061/062 + new ones), admin-page screenshots (possible `AccessMatrix.tsx:55` sticky-column hover fix), mobile-data sign-in, remaining Phase 6 boxes, **rotate PostGIS + Redis passwords before a pilot**.

## Gotchas Learned This Session

- **Backend `tsc` and frontend `tsc` read `shared/dist`**, not `shared/src`; after editing shared, run `pnpm --filter @agap/shared build` (or `npx tsc -p tsconfig.json` in `shared/`) before typechecking. Jest (backend) and mobile map `@agap/shared` to source, so tests can pass while `tsc` fails.
- **`shared/dist` is gitignored**; the backend Dockerfile builds it (line 45); CI now does too.
- **Mobile jest** still needs the `NODE_PATH` → `@babel+traverse@…` workaround (Git Bash, `pwd -W`).
- **No `expo-updates`** in the mobile app → any JS change needs a new EAS APK (no OTA).
- **Android channel settings are immutable** after creation → new id for new sound/vibration.
- **jest.mock of a class used with `new`** must return a `function`, not an arrow (`openai_1.default is not a constructor`).
- **`exactOptionalPropertyTypes` is on** in the backend → optional props passed possibly-undefined values need `| undefined`.
- **Bash tool:** never `cat > /dev/null` or a bare heredoc without input (hangs on stdin); recursive `grep -r`/`find` from the repo root crawls `node_modules` (>120 s) → use the Grep tool.
- **Windows:** `mv shared/dist …` → Permission denied (file locked by a running process).
- **Dispatchers usually have no FCM token** (console only) → ops alerts must go through WebSocket/escalations, not pushes.
- `NotificationProcessor.process` catches every error, so the `attempts: 3` on push jobs never actually retries (pre-existing; left alone).

## Risks & Blockers

- **No mobile change has run on a device.** All four sessions of mobile work ride on one APK.
- **Old APK + new backend:** assignment pushes now target `assignments-alarm` → on an old APK they fall to Android's fallback channel (quieter); a cap-only photo refusal shows a generic error.
- **Re-buzz depends on FCM delivery to a "closed" app** — OEM battery optimisation (Xiaomi/Oppo/Vivo/Samsung) can delay it. Alarm uses alarm volume; DND bypass needs the user to allow it once.
- **HEADWEAR threshold untuned** → may refuse some non-cap photos or miss some caps.
- **Every push to `main` redeploys Railway + Vercel**; push only when nobody is testing.
- `GUEST_REPORT_LIMIT_DISABLED=true` turns off all guest limits incl. open/wait rules — don't use it to test them.

## Open Questions

- Did the live open-report refusal show "Earlier report still open · INC-…"? (still no screenshot)
- Is CI green on GitHub after `a65f5a9`?
- Does Railway have `OPENAI_API_KEY`?
- What HEADWEAR threshold fits real selfies?
- Were INC-2026-000060/061/062 closed / false-alerted?

## Quick Start for Next Session

```bash
# Restore context (bd not installed)
docs/handoff/2026-11-27_guest-gate-onboarding-responder-alarm.md   # this file
docs/plans/DEPLOYMENT_PLAN.md                                      # Phase 6 boxes (~357-362 + responder box)
CLAUDE.md

# Key files to read first (not exhaustive — explore adjacent code too)
shared/src/constants/guest-report.ts                                # guestNewReportGate
backend/src/emergency-alerts/guest-report-limit/guest-report-limit.service.ts   # reserve, blockOf
backend/src/jobs/assignment-reminder.ts                             # re-buzz + escalation
backend/src/dispatch/assignment-push.ts                             # channels, constants
mobile/app/_layout.tsx                                              # onboarding flag, notification handler, AssignmentAlarm
mobile/src/components/responder/assignment-alarm.tsx
mobile/app/responder/profile.tsx

# Verify current state (read-only)
git fetch && git log origin/main..HEAD --oneline    # expect only the session handoff commit
curl -s https://agap-emergency-production.up.railway.app/v1/health

# Tests
pnpm --filter @agap/shared build
pnpm --filter @agap/backend test                    # 143 suites / 2546
cd mobile && NODE_PATH="$(cd ../node_modules/.pnpm/$(ls ../node_modules/.pnpm | grep '^@babel+traverse@' | head -1)/node_modules && pwd -W)" npx jest   # 26 / 312

# Next action
Ask the user whether the new preview APK is built/installed; if not, give the eas build command.
Then walk the device tests in "Where We're Going" step 2, one at a time, ticking boxes only from screenshots.
```

## Session Closed
**Closed at:** 2026-11-27 (local, GMT+8)
**Commit:** the `session: guest-gate-onboarding-responder-alarm` commit that includes this note (not pushed: a push to main redeploys Railway and Vercel; the user pushes)
**Session status:** Handed off to next session
