# Guest phones limited to one open report at a time (deployed; the open-report path is still untested on the live system); daily guest cap 6 → 3; web Login Failed IP is real (TRUST_PROXY done)

**Date:** 2026-11-26
**Status:** IN PROGRESS (all code committed **and pushed**; the daily cap is proven live; the "earlier report still open" refusal is unit-tested but **has not fired on Railway yet**)
**Bead(s):** none (`bd` is not installed: `bash: bd: command not found`)
**Epic:** Deployment plan `docs/plans/DEPLOYMENT_PLAN.md` (Phase 6 end-to-end checks) + a user-requested guest anti-spam rule
**Chain:** `standalone-953e4889` seq `7`
**Parent:** `docs/handoff/2026-11-26_trust-proxy-and-admin-sidebar.md`
**Prior chain:** `docs/handoff/2026-11-24_deployment-phases-1-3.md` > `docs/handoff/2026-11-24_deployment-phases-3-4.md` > `docs/handoff/2026-11-24_deployment-phase-5-eas-id-ocr.md` > `docs/handoff/2026-11-24_deployment-phase-5-admin-sms-tracking.md` > `docs/handoff/2026-11-26_guest-follow-and-guest-security.md` > `docs/handoff/2026-11-26_trust-proxy-and-admin-sidebar.md` > this

---

## Since Last Handoff

- **Parent step 1 (web IP): done.** The user's Security Events screenshot shows a **Login Failed** row (12:14:03 PM, "Juan dela Cruz", Dispatcher, "Bad Password · Password") with IP **`152.233.15.120`**: public, same `152.233.15.x` block as the phone (`152.233.15.123`), not `100.64.x.x` and not a Vercel egress address. Ticked "Web path" in `DEPLOYMENT_PLAN.md` (Phase 6 → Client IP → Result). The TRUST_PROXY work is complete.
- **Parent step 2 (screenshots of the new admin Dashboard/Logs/Settings): not done.** Asked twice; the user sent only the Security Events table (which renders fine: 6 columns, filter icons on Account and IP, red "Guest report blocked" badge, amber "Login Failed" badge).
- **Parent step 3 (INC-2026-000060 closed as False alert?): never answered directly.** Later reports (061, 062) went through, which is consistent with it being closed, but this was not checked.
- **Parent step 4 (new APK guest-follow test): not started.** The user did not report on the new APK in this session. Unknown whether it's installed.
- **Parent steps 5–7 (mobile-data sign-in, other Phase 6 boxes, password rotation): untouched.**
- **New, user-requested mid-session:** "Can you ensure that i cannot report repeatedly as a guest?" → implemented **one open guest report per phone** (+ daily device cap 6 → 3). Commit `1fa51ce`, pushed and live.
- **My mistake, caught and corrected:** I ticked the new plan box (`f5a8566`) after the user said "second report was blocked". Their screenshot then showed the block was the **daily cap** (`LIMIT_DEVICE`, 3 per 1440 min), not the open-report rule, and INC-061/062 predated the deploy. Unticked in `0528f02` (both pushed).
- Trajectory: still on the deployment plan. Before a pilot: retest the open-report rule properly → APK guest-follow test → remaining Phase 6 boxes → rotate PostGIS/Redis passwords.

## Reference Documents

- `docs/plans/DEPLOYMENT_PLAN.md`: **the** plan. Phase 6 "Emergency path" now has a new unticked box at line ~357, "One open report per guest phone", with test steps and the 2026-11-26 note. The Phase 6 "Client IP and rate limits" Result block (line ~388-392) now has both boxes ticked.
- `CLAUDE.md`: Rule 14 (guest reporting must always be available), Reliability Rules (an infra failure never blocks help), Rule 12 (idempotent retries), "no internal IDs in public API responses" (the 429 body carries the **public reference** only).
- `docs/AGAP_Role_Rules_and_Dashboard_Content.md`: role spec (unchanged this session).
- Memory: `project-backend-test-run.md` (full backend jest command), `project-frontend-lint-broken.md` (use `tsc --noEmit`), `feedback-git-bash-commits.md` (give both shell forms), `project-railway-gotchas.md`, `project-deployment-plan.md`.

## The Goal

Run AGAP without the laptop for demos and the pilot (school project; the user is a student; the operator context is Bocaue MDRRMO). Web console on **Vercel** (`agap-emergency.vercel.app`, `PROXY_API=true`), NestJS backend + PostGIS + Redis on **Railway** (`agap-emergency-production.up.railway.app`), files on **Cloudflare R2**, an **EAS preview APK** for Android. This session closed the client-IP question (web too), and at the user's request made it so a guest (no account) **cannot keep sending reports from one phone**: while their report is being handled, a second one is refused with the hotlines and "Sign in to report", without ever blocking a real emergency because of an outage (Rule 14).

## Where We Are

- **Git:** `main` = `origin/main` = `0528f02` (verified with `git fetch` + `git log origin/main..HEAD` → empty). Uncommitted and **not ours, leave alone:** `frontend/tsconfig.tsbuildinfo` (M), `docs/presentation/Justine_Soliman_IPO_Report.md` (??).
- **Live backend health:** `{"status":"ok","timestamp":"2026-11-26T11:08:37.961Z","version":"1.0.0"}` after the last push.
- **Feature live (`1fa51ce`, committed 18:53:10 +0800):** `GuestReportLimitService.reserve()` refuses a guest report when this phone's (X-Device-Id) last guest report is still open, with HTTP **429**, `code: 'GUEST_REPORT_OPEN'`, `publicReference`, `retryAfterSeconds: 0`, no `Retry-After` header.
- **Daily cap proven live:** 19:03:07 PM, "Guest report blocked", Detail "Too many from one phone · limit 3 per 1440 min · Phone 0bfa0f12", IP `152.233.15.123`. Phone `0bfa0f12` had INC-2026-000060 (11:56), -000061 (18:39), -000062 (18:42) today.
- **Open-report refusal: NOT yet seen live.** At 19:03 the open check ran first and found nothing, because INC-062 was created by the **old** backend (before `1fa51ce`), which never called `rememberOpen`. So no Redis `guestlim:open:*` key existed for that phone.
- **Phone `0bfa0f12` is daily-capped until 08:00 PHT** (buckets are `floor(epochSeconds / 86400)`, i.e. UTC midnight = 08:00 Philippine time).
- **Web IP:** `152.233.15.120` on the Login Failed row → web path ticked in the plan.
- **Security Events label fix (`0528f02`, live on Vercel):** 1440-minute windows now read "limit 3 per day"; refusals for an open report read "Earlier report still open · INC-… · Phone …".
- **Tests (after `1fa51ce`):** backend `tsc --noEmit` exit 0; backend full jest **141 / 141 suites, 2502 / 2502 tests**; guest-limit spec **38 / 38** (22 new); frontend `tsc` exit 0; frontend jest **28 / 28 suites, 264 / 264** (was 263; +1). After `0528f02`: frontend tsc exit 0; `security-events-guest.spec.ts` **6 / 6** (+1 "per day").
- **Mobile untouched.** The existing APK screen (`mobile/app/emergency/transmission.tsx` `FailedView`, `limited` branch, lines ~356-373) already shows the server `message` on any 429 under "Report Not Sent", with `HotlineButtons` and "Sign in to report", and hides "Send by SMS" (`smsCanHelp(429) === false`). So the rule needed **no new APK**.
- **Dependency injection verified by reading:** `PrismaModule` is `@Global()` and imported in `backend/src/app.module.ts:68`, so the `@Optional()` `PrismaService` in `GuestReportLimitService` resolves in production (if it didn't, the open-report rule would silently be off; unit tests construct the service by hand and can't prove DI). Indirect proof it's on: none yet, because the live open refusal hasn't fired.
- **Old test reports possibly still open:** INC-2026-000062 (and maybe 060/061). The user was asked to mark 062 False alert; not confirmed.
- **Admin pages from the parent (10-link sidebar, Logs/Settings tabs, Page access matrix):** still not seen as screenshots by me, apart from the Security Events table.

## What We Tried (Chronological)

1. **Onboarding (paste prompt; standing rule: narrate, then wait).** `bd` missing. `git fetch` → 1 ahead (`98d7585` handoff commit), 0 behind. Health ok. `GET /v1/guest-reports/status` (no header) → **401** (guest-follow code live). Read `AdminTabs.tsx`, `AccessMatrix.tsx`, `logs/page.tsx`, `AdminDashboard.tsx`, plus adjacent `settings/page.tsx`, `SecurityEvents.tsx` (`SECURITY_ACTIONS` lines 17-28, only `LOGIN_FAILED` for sign-ins), `DEPLOYMENT_PLAN.md` open boxes. Spotted a cosmetic issue: `AccessMatrix.tsx:55` sticky row header stays `bg-white` when the row hovers to `bg-agap-surface/50` (not fixed; waiting on screenshots).
2. **User: "go ahead".** Ran frontend `tsc` (exit 0) + jest (28 / 263) baseline → matched the handoff. Asked the user for the web Login Failed IP, screenshots, and the INC-060 status.
3. **User asked: "Can you ensure that i cannot report repeatedly as a guest?"** Read `guest-report-limit.service.ts` (rules, Redis/memory store, `reserve`), `guest-report-limit.interceptor.ts`, `incidents.api.ts` (the app sends `X-Device-Id` from `getDeviceId()` on guest submits, `POST /v1/incidents`), the existing spec. Found the old limits: device 2 / 10 min and 6 / day; IP 20 / 10 min and 100 / day; phone (SMS) 3 / 10 min and 10 / day; spot 3 / 10 min.
4. **Asked the user one question (AskUserQuestion)** with 3 options: "One open report (Recommended)", "Fixed cooldown" (1 per 30 min, 3 per day), "Both". **User picked "One open report".**
5. **Explored for the design:** `guest-follow.service.ts` (merge chain following via `duplicate_of_id`, `MAX_MERGE_DEPTH = 3`), `guest-follow.constants.ts` (`GUEST_FINISHED_STATUSES` = CLOSED, CANCELLED, FALSE_ALERT), `prisma.module.ts` (global), shared `IncidentStatus` enum (has RESOLVED, CLOSED, CANCELLED, FALSE_ALERT, UNABLE_TO_RESPOND, REFERRED, DUPLICATE). The `schema.prisma` grep showed incidents store **no device id**, so the phone → incident link went in Redis rather than a DB migration.
6. **Checked the APK's 429 handling** (`transmission.tsx:679-681` sets `limited` on any 429; `FailedView` shows `error` = server message). → Backend-only change is enough.
7. **Implemented** (see Code Analysis). First draft of `openReportOf` had a pointless `if (id !== undefined)` before deleting the key; replaced with an early `if (!id) return null` and an unconditional `del`.
8. **Tests:** added a `fakePrisma(rows)` helper and a 14-case "One open guest report per phone" describe block (plus `it.each` expansions → 22 new tests). Guest-limit spec 38 / 38. Backend tsc 0. Full backend jest 141 / 2502. Frontend tsc 0, jest 28 / 264 (new `LIMIT_OPEN` detail test).
9. **Added a Phase 6 plan box** "One open report per guest phone" with test steps. Gave commit commands for both shells.
10. **User's first commit attempt failed:** they ran only `git commit` (no `git add`) and dropped the Co-Authored-By line → "no changes added to commit". Re-sent `git add` + `git commit` + `git status --short` check. User then pushed ("already deployed"). Verified `origin/main` = `1fa51ce`, health ok. Declined to probe live myself (it would create a fake emergency) and gave the user a 5-step phone test.
11. **User: "(done) second report was blocked" → then "(done) security event shows, and new report went through after false alert and its blocked as second alert".** I took this at face value and **ticked the box** (`f5a8566`, user committed).
12. **User sent a Security Events screenshot.** Reading it showed the claims didn't hold for the new rule: the only post-deploy refusal (19:03) was `LIMIT_DEVICE` "limit 3 per 1440 min"; 061 (18:39) and 062 (18:42) were 2.3 min apart and both accepted; `git log` showed `1fa51ce` at 18:53 → both were the **old** backend (2 per 10 min). No "Earlier report still open" row exists. **Corrected openly**, unticked the box with an explanatory note, ticked the web IP box from the same screenshot, and changed the "1440 min" wording to "per day". Committed as `0528f02`, user pushed.
13. **Gave a retest recipe:** the phone is daily-capped until 08:00 PHT, so clear the AGAP app's data (Android Settings → Apps → AGAP → Storage → Clear data) for a fresh install id, then A (goes) → B (blocked "Earlier report still open · A") → False alert A → C (goes) → False alert C. Not done yet.

## Key Decisions

- **"One open report per phone" (user's choice) over a fixed cooldown or both.** A fixed 30-min cooldown would block a real second emergency even after the first is closed; "one open" ties the block to the actual emergency being handled. Rejected: "Fixed cooldown" (1 / 30 min, 3 / day) and "Both".
- **Daily device cap 6 → 3** (stated in the option the user picked: "max 3 per day"). The 2 / 10-min device cap stayed.
- **The phone → incident link lives in Redis** (`guestlim:open:<sha256('open:'+deviceId)[:32]>` → incident UUID, TTL 24 h), with the existing in-memory fallback, instead of a new DB column. Reason: no migration, the raw device id never reaches storage (hashed like every other key), and it rides the same `call()` Redis-or-memory path. Trade-off: a Redis outage moves the key to one instance's memory (acceptable; the limit then fails open-ish).
- **Status read live from Postgres on each guest report** (only when the phone has a stored key), so a dispatcher's False alert or Close frees the phone immediately, no event wiring needed.
- **"Ended" statuses = RESOLVED, CLOSED, CANCELLED, FALSE_ALERT, UNABLE_TO_RESPOND, REFERRED.** Broader than guest-follow's `GUEST_FINISHED_STATUSES` on purpose: a guest must never be stuck while ops re-dispatch (UNABLE_TO_RESPOND) or hand off (REFERRED); RESOLVED means responders are done.
- **DUPLICATE follows the merge chain** (up to 3 hops) and stays "open" while the report it was merged into is open. In the question I had said "duplicate" would count as ended; I changed this during implementation because otherwise merging would let the guest report again at once, and I told the user so. The refusal names the guest's **own** reference, never the other reporter's (Rule 15).
- **Fail open everywhere:** any Redis/DB error, a missing incident, or no Prisma → the report goes through (Reliability Rules, Rule 14). A retry with an already-admitted idempotency key is checked **before** the open rule, so the app's own resends/SMS dedupe are never refused (Rule 12).
- **429 (not 409)** so the already-shipped APK shows its "Report Not Sent" screen with hotlines + sign-in and hides SMS. `code` distinguishes `GUEST_REPORT_OPEN` from `GUEST_REPORT_LIMIT`.
- **No `Retry-After` when `retryAfterSeconds` is 0** (the wait depends on ops closing the report).
- **24 h cap on the link** (`OPEN_REPORT_TTL_SECONDS`): a report forgotten in the queue stops blocking after a day; the daily device cap still applies.
- **I did not probe the live API myself**: a real guest POST creates an incident in the live dispatch queue. Testing is by the user's phone.

## Evidence & Data

### Commits this session

| Hash | Time (+0800) | Summary | Pushed? |
|---|---|---|---|
| `1fa51ce` | 18:53:10 | feat(guest): one open guest report per phone; daily guest cap 3 | yes |
| `f5a8566` | 19:05:37 | docs(deploy): one-open-guest-report check passed on live (**wrong**, see next) | yes |
| `0528f02` | ~19:15 | docs(deploy): web IP is real; open-report rule still to test; daily limit reads per day | yes |
| this handoff | — | session: guest-one-open-report | (commit at close) |

### Guest limits before vs after (`GUEST_REPORT_RULES`)

| Scope | Window | Before | After |
|---|---|---|---|
| open report (new) | while open, ≤ 24 h | — | **1 at a time per phone** |
| device | 10 min | 2 | 2 |
| device | 24 h | 6 | **3** |
| ip | 10 min / 24 h | 20 / 100 | 20 / 100 |
| phone (SMS) | 10 min / 24 h | 3 / 10 | 3 / 10 |
| spot (IP + ~200 m) | 10 min | 3 | 3 |

### Security Events screenshot (user, ~19:10 PHT), newest first

| Time (PHT) | Event | Account | Detail | IP |
|---|---|---|---|---|
| 7:03:07 PM | Guest report blocked | Guest (no account) | Too many from one phone · limit 3 per 1440 min · Phone 0bfa0f12 | 152.233.15.123 |
| 6:42:11 PM | Guest report | Guest, INC-2026-000062 | Phone 0bfa0f12 | 152.233.68.98 |
| 6:39:53 PM | Guest report | Guest, INC-2026-000061 | Phone 0bfa0f12 | 152.233.68.98 |
| 12:14:03 PM | Login Failed | Juan dela Cruz, Dispatcher | Bad Password · Password | 152.233.15.120 |
| 11:56:06 AM | Guest report | Guest, INC-2026-000060 | Phone 0bfa0f12 | 152.233.15.123 |

Reading: 061/062 predate the 18:53 commit (old 2 / 10 min rule). The 19:03 block is the new 3 / day cap. The phone's IP changed between `152.233.15.123` and `152.233.68.98` (carrier/Wi-Fi reassignment), but the phone code stayed `0bfa0f12`, which is why the device limit is the one that catches a single phone.

### Tests

| Run | Result |
|---|---|
| frontend `tsc` + jest at onboarding | exit 0; 28 / 28 suites, 263 / 263 |
| `npx jest --config ./test/jest.config.ts test/emergency-alerts/guest-report-limit.spec.ts` | 38 / 38 |
| backend `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| backend full `npx jest --config ./test/jest.config.ts --maxWorkers=50%` | 141 / 141 suites, 2502 / 2502 |
| frontend `tsc` + jest after `1fa51ce` | exit 0; 28 / 28, 264 / 264 |
| frontend `tsc` + `security-events-guest.spec.ts` after `0528f02` | exit 0; 6 / 6 |

### Live probes

| Probe | Result |
|---|---|
| health at onboarding | `{"status":"ok","timestamp":"2026-11-26T09:18:40.179Z",...}` |
| `GET /v1/guest-reports/status` no header | 401 |
| health after `1fa51ce` push | `...10:57:30.966Z` ok |
| health at close | `...11:08:37.961Z` ok |

### The guest's 429 body for an open report (shape)

```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "code": "GUEST_REPORT_OPEN",
  "retryAfterSeconds": 0,
  "publicReference": "INC-2026-000401",
  "message": "You already sent report INC-2026-000401, and MDRRMO is still handling it. You can send a new report once it is closed. If this is a different emergency, call 911 or the Bocaue MDRRMO hotline now, or sign in to report right away."
}
```

Security event `newValues` for that refusal: `{ reason: 'LIMIT_OPEN', device: '<8-hex>', openReport: 'INC-…', retryAfterSeconds: 0 }` → shown as "Earlier report still open · INC-… · Phone …".

### Test cases added (`backend/test/emergency-alerts/guest-report-limit.spec.ts`, describe "One open guest report per phone")

| Case | Expectation |
|---|---|
| second report while first RECEIVED | 429, scope `open`, `retryAfterSeconds 0`, code `GUEST_REPORT_OPEN`, message has ref + 911 |
| still refuses at ACKNOWLEDGED / DISPATCHED / ON_SCENE / TRANSPORTING | rejects scope `open` |
| report again once RESOLVED / CLOSED / CANCELLED / FALSE_ALERT / UNABLE_TO_RESPOND / REFERRED | resolves `repeat: false` |
| merged (DUPLICATE → inc-2 DISPATCHED) | refused, `openReference` = own ref; after inc-2 CLOSED → allowed |
| same idempotency key retry | resolves `repeat: true` |
| other phone / no device id | allowed |
| DB error | allowed |
| incident deleted | allowed |
| interceptor end-to-end | remembers inc-1; 2nd refused; no `Retry-After`; audit `GUEST_REPORT_BLOCKED` with `LIMIT_OPEN`, `openReport`, device code |

## Code Analysis

- **`backend/src/emergency-alerts/guest-report-limit/guest-report-limit.service.ts`** (449 lines):
  - line 25 `export type GuestBlockReason = GuestLimitScope | 'open'` (kept separate so `LimitRule.scope` and the `source[...]` lookup stay typed).
  - lines 44-45 device rules (2 / 600 s, 3 / 86400 s), with a comment pointing to `openReportOf`.
  - line 77 `OPEN_REPORT_TTL_SECONDS = 24 * 60 * 60` (exported); line 84 `GUEST_REPORT_ENDED_STATUSES` (exported); line 93 `MAX_MERGE_DEPTH = 3`.
  - `GuestReportLimitExceeded(retryAfterSeconds, scope: GuestBlockReason = 'device', rule?, openReference?)`; `code` is `GUEST_REPORT_OPEN` for `open`, else `GUEST_REPORT_LIMIT`; message built by `limitMessage()` (line 142), which keeps the old texts for `spot` and the counters.
  - `CounterStore` gained `setText(key, text, ttl)` / `getText(key)`; `MemoryStore` entries now `{ value, text?, expiresAt }`; Redis: `SET key text EX ttl` / `GET key`.
  - constructor `(config: ConfigService, @Optional() private readonly prisma?: PrismaService)`.
  - `reserve()` (line 271) order: disabled → admitted-key retry (`NO_LEASE`) → **open check if `source.deviceId`** → counters.
  - `rememberOpen(deviceId?, incidentId?)` (line 343): no-op if disabled, no Prisma, or either id missing; never throws.
  - `openReportOf(deviceId)` (line 357): `getText(openKey)` → null if none; walk `incident.findUnique({ select: { status, public_reference, duplicate_of_id } })` up to 3 hops; DUPLICATE → follow; not ended → return the **first** (own) reference; otherwise `del` the key and return null; any throw → warn, return null.
  - `openKey(deviceId)` (line 439) = `guestlim:open:` + `hash('open:' + deviceId)`.
- **`guest-report-limit.interceptor.ts`:** line 85 `Retry-After` only if `> 0`; line 96 adds `openReport` to the BLOCKED audit; line 108 `void this.limiter.rememberOpen(deviceId, created.id)` runs in `tap` for **every** successful guest response (including idempotent retries, harmless) **before** the `lease.repeat` early return.
- **Applies to** `POST /v1/incidents` (`incidents.controller.ts:103`, the path the app uses) and the SOS/shake routes (`emergency-alerts.controller.ts:27,39`). **Not** the citizen SMS SOS path (it uses `phone` scope only; no device id).
- **`isGuestRequest`**: no user, or role BYSTANDER → guest. Signed-in citizens skip the interceptor entirely.
- **`frontend/components/admin/SecurityEvents.tsx`:** `DETAIL_LABELS.LIMIT_OPEN = 'Earlier report still open'` (line 61); `guestDetailOf` shows `openReport` (line 99) and "per day" for `windowMinutes === 1440` (line 100).
- **Day buckets:** `bucket = Math.floor(now / rule.windowSeconds)` → the 24 h windows reset at 00:00 UTC = **08:00 PHT**, not 24 h after the first report.

## Files Changed

### Source code
- `backend/src/emergency-alerts/guest-report-limit/guest-report-limit.service.ts` (`1fa51ce`): open-report rule, text store, Prisma injection, daily cap 3, `limitMessage`.
- `backend/src/emergency-alerts/guest-report-limit/guest-report-limit.interceptor.ts` (`1fa51ce`): `rememberOpen` call, `openReport` in audit, conditional `Retry-After`.
- `frontend/components/admin/SecurityEvents.tsx` (`1fa51ce`, `0528f02`): `LIMIT_OPEN` label, `openReport` detail, "per day".

### Tests
- `backend/test/emergency-alerts/guest-report-limit.spec.ts` (`1fa51ce`): `makeService(env, prisma?)`, `fakePrisma(rows)`, new describe block (22 tests).
- `frontend/__tests__/security-events-guest.spec.ts` (`1fa51ce`, `0528f02`): open-report detail; "per day".

### Docs
- `docs/plans/DEPLOYMENT_PLAN.md`: new box "One open report per guest phone" (unticked, with the 19:03 daily-cap note and test steps) (`1fa51ce`, `f5a8566`, `0528f02`); "Web path" ticked with `152.233.15.120` (`0528f02`).
- `docs/handoff/2026-11-26_guest-one-open-report.md`: this file.

### Not changed
- No mobile code, no migration, no env vars, no Railway/Vercel settings.

## User Feedback & Preferences (REQUIRED — never omit)

- Standing rule at session start: **narrate onboarding, then wait for go-ahead** ("go ahead").
- **Feature request (verbatim):** "Can you ensure that i cannot report repeatedly as a guest?"
- **Decision:** picked "One open report (Recommended)" from the 3 options.
- Reports tersely with "(done)". **Their "(done)" claims can be wrong in the details**: "second report was blocked" was the daily cap, not the new rule. **Always ask for (or read) the Security Events row**: the Detail column says which rule fired ("Earlier report still open" vs "Too many from one phone · limit …").
- Ran `git commit` without the `git add` line and without the Co-Authored-By line once. Keep the commands as one copy-paste block, and include a `git status --short` check.
- Commits and **pushes himself** ("already deployed", "(done) pushed").
- Prefers screenshots as evidence; sent the Security Events table.
- Ended with: "use the /handoff to summarize everything so far and close this session and give me the prompt i can use to the latest handoff created."
- Carried preferences: phase by phase; both Git Bash and PowerShell command forms; never repeat secrets; public repo; $0 preference; numbered steps they can answer "(done)/(working)".

## Where We're Going

1. **Retest the open-report rule on the live system** (Phase 6 box line ~357). Phone `0bfa0f12` is daily-capped until **08:00 PHT**, so either wait, or clear the AGAP app data for a new install id. Then: guest SOS **A** (goes) → **B** right away → "Report Not Sent" naming A → Security events row "Guest report blocked · **Earlier report still open** · INC-A" (no "limit … per …") → False alert A → **C** goes → False alert C. Tick the box only from the Security events row.
2. **Clean up test incidents:** confirm INC-2026-000060/061/062 (and any new ones) are False alert/closed.
3. **New APK guest-follow test** (plan box line ~356): fresh guest SOS on the new build → status card + notification prompt → Acknowledge → "Report received" push and "Report accepted" → False alert push → tap opens "Your report" → sign-in screen card. Note: with the new rule, a guest can't send a second report to test "Report merged" from the same phone; use a second phone or a signed-in account for the other report.
4. **Screenshots of the new admin pages** (Dashboard, Logs 3 tabs, Settings 3 tabs incl. Page access, `/administration/security` redirect). Possible fix: the `AccessMatrix.tsx:55` sticky column doesn't follow the row hover colour.
5. **Mobile-data sign-in** once the SIM has load (ticks the last Phase 5 box).
6. **Remaining Phase 6 boxes:** signed-in citizen live status; dispatch → responder push + location; SMS fallback with data off; every role signs in; sign-out across tabs; passkeys web + APK; photo upload → R2, then `STORAGE_LOCAL_FALLBACK=true`; `/b` barangay page.
7. **Before a pilot:** rotate the PostGIS + Redis passwords. Optional: remove unused `frontend/features/admin/permissions-hooks.ts`.

## Risks & Blockers

- **The open-report rule hasn't fired on Railway.** Unit tests pass and DI reads correct, but if Prisma weren't injected (`@Optional()`), the rule would silently do nothing. The retest in step 1 settles it.
- **Clearing app data / reinstalling gives a new install id** and bypasses the per-phone rules; only the network rules remain (spot 3 / 10 min, IP 20 / 10 min). Only an account fully prevents that. The user was told.
- **Carrier IPs change** (the phone showed `152.233.15.123` and `152.233.68.98` the same day), so IP-based limits are weak for one person; the device rules are what catch one phone.
- **Testing friction:** the daily cap of 3 is now small; repeated QA from one phone hits it quickly. Emergency switch `GUEST_REPORT_LIMIT_DISABLED=true` turns off **all** guest limits including the open-report rule, so don't use it for testing this rule.
- **Every push redeploys Railway and Vercel.** Push only when nobody is testing.

## Open Questions

- Does the live open-report refusal show "Earlier report still open · INC-…" (step 1)?
- Were INC-2026-000060/061/062 all closed or marked False alert?
- Is the new preview APK installed on the phone yet?
- Do the new admin pages look right (no screenshots yet)?

## Quick Start for Next Session

```bash
# Restore context (bd not installed)
docs/handoff/2026-11-26_guest-one-open-report.md     # this file
docs/plans/DEPLOYMENT_PLAN.md                         # Phase 6: box "One open report per guest phone" (~line 357)
CLAUDE.md

# Key files to read first (not exhaustive — explore adjacent code too)
backend/src/emergency-alerts/guest-report-limit/guest-report-limit.service.ts      # reserve, openReportOf, rememberOpen
backend/src/emergency-alerts/guest-report-limit/guest-report-limit.interceptor.ts
backend/test/emergency-alerts/guest-report-limit.spec.ts
frontend/components/admin/SecurityEvents.tsx                                       # guestDetailOf
mobile/app/emergency/transmission.tsx                                              # FailedView `limited` (~356)

# Verify current state (read-only)
git fetch && git log origin/main..HEAD --oneline    # expect only the session handoff commit
curl -s https://agap-emergency-production.up.railway.app/v1/health

# Tests
cd backend && npx jest --config ./test/jest.config.ts test/emergency-alerts/guest-report-limit.spec.ts   # 38 / 38
cd frontend && npx tsc --noEmit -p tsconfig.json && npx jest                                         # 28 suites / 264

# Next action
Ask the user to run the open-report retest (clear AGAP app data or wait until 08:00 PHT),
then read the newest Security events row: it must say "Earlier report still open · INC-…".
Only then tick the plan box.
```

## Session Closed
**Closed at:** 2026-11-26 (local, GMT+8)
**Commit:** the `session: guest-one-open-report` commit that includes this note (not pushed: a push to main redeploys Railway and Vercel; the user pushes)
**Session status:** Handed off to next session
