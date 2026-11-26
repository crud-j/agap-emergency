# Deploying AGAP: Phase 5 push + Phase 6 checks passed; guests follow their own report; open alert routes removed; guest anti-spam with IP in Security Events

**Date:** 2026-11-26 (work done 2026-11-25 evening → 2026-11-26)
**Status:** IN PROGRESS (all work committed, **4 commits NOT pushed**; new APK not built yet; TRUST_PROXY still undecided)
**Bead(s):** none (`bd` is not installed: `bd : The term 'bd' is not recognized`)
**Epic:** Deployment plan `docs/plans/DEPLOYMENT_PLAN.md` (plus two user-requested features: guest report notifications, guest anti-spam/security events)
**Chain:** `standalone-953e4889` seq `5`
**Parent:** `docs/handoff/2026-11-24_deployment-phase-5-admin-sms-tracking.md`
**Prior chain:** `docs/handoff/2026-11-24_deployment-phases-1-3.md` > `docs/handoff/2026-11-24_deployment-phases-3-4.md` > `docs/handoff/2026-11-24_deployment-phase-5-eas-id-ocr.md` > `docs/handoff/2026-11-24_deployment-phase-5-admin-sms-tracking.md` > this

---

## Since Last Handoff

- Parent step 1 (confirm SMS Activity + Configuration pages) **done by the user**: "SMS Activity shows the ops alert row as Accepted". Configuration: no `fcm_token:` rows, both oversight timers "In use" (user: "(checked)").
- Parent step 2 (Phase 5 push check) **passed**: Health → Integrations "registered devices" ≥ 1 after the demo citizen signed in on the APK; a dispatcher's Acknowledge produced an "Incident updates" notification on the phone; test incident closed. Ticked in the plan.
- Parent step 3 (new preview APK with the refresh fix `9e5e7d0`) **not confirmed done**. The APK must now also carry the guest-follow mobile code (`90a7137`), so build it **after** the push.
- Parent step 4 (mobile-data sign-in on a SIM with load) **still blocked**: "my sim does not have load yet".
- Parent step 5 (Phase 6) **partly done**: ops SMS box ticked (the user said "yesterday when i tested the SOS i have receive an SMS so the sms is working" + today's `Accepted` row); guest SOS live-map box ticked ("the pin appeared on the map without reloading"). The TRUST_PROXY "bonus" IP check I gave was **never run**.
- Parent steps 6 (rotate PostGIS/Redis passwords) and 7 (optional follow-ups) **not started**.
- **New, user-requested:** guest report notifications (live status card + push, incl. merged/cancelled) → commit `90a7137`.
- **New, user-requested:** fixed the two open `/emergency-alerts/:id/*` routes I flagged, closed a guest GPS bypass, added a "same network + same place" guest limit, and put every guest report (with IP) into Security Events → commit `2db2763`.

## Related Handoffs

- `docs/handoff/2026-11-15_session-handoff.md`, `docs/handoff/2026-11-15_risk-pin-place-finding.md`, `docs/handoff/2026-11-15_risk-areas-pin-automation.md`: separate feature streams (SMS, AI, risk areas), not this chain.

## Reference Documents

- `docs/plans/DEPLOYMENT_PLAN.md`: **the** plan. Phase 5 push box ticked; Phase 6 ops SMS + guest SOS boxes ticked; a new unticked "guest follows their report" box; the TRUST_PROXY section now explains the Security Events IP check and the new spot limit.
- `CLAUDE.md`: project rules. Relevant this session: Rule 9 (hotlines), Rule 13 (ETA is an estimate), Rule 14 (guest reporting always available), Rule 15 (never reveal another reporter), "Do not expose internal database IDs", Reliability Rules (notification failure never touches the incident), MOD-42 / MOD-46 / MOD-49 / MOD-06 / MOD-26.
- Memory: `feedback-no-backslash-shell-edits.md` (**updated this session**: PowerShell 5.1 Get/Set-Content mangles UTF-8 and adds a BOM), `project-mobile-build-env.md` (mobile jest NODE_PATH workaround), `project-backend-test-run.md`, `feedback-git-bash-commits.md`, `project-railway-gotchas.md`, `project-frontend-lint-broken.md`.

## The Goal

Run AGAP without the laptop for demos and pilot testing (school project; the user is a student). Web console on **Vercel** (`agap-emergency.vercel.app`), NestJS backend + PostGIS + Redis on **Railway** (`agap-emergency-production.up.railway.app`), files on private **Cloudflare R2**, and an **EAS preview APK** for Android phones. The user works phase by phase: Phase 5 = APK (only "sign-in on mobile data" left), Phase 6 = end-to-end checks (in progress, incl. the `TRUST_PROXY` decision). This session also made **guest reporting (Rule 14) safer and friendlier**: a guest now sees and gets pushed what happens to their report, and guest spam is capped and visible to the System Administrator with the client IP.

## Where We Are

- **Git:** `main` at `2db2763`. `origin/main` at `4cadca7`. **Unpushed (4):** `a8460e5` (previous handoff), `408d031` (plan ticks), `90a7137` (guest follow), `2db2763` (security). Uncommitted and **not ours, leave alone:** `frontend/tsconfig.tsbuildinfo`, `docs/presentation/Justine_Soliman_IPO_Report.md`.
- **Live backend** (old code, `4cadca7`): `/v1/health` → `{"status":"ok","timestamp":"2026-11-25T14:52:13.981Z","version":"1.0.0"}` at session start.
- **Pushing will redeploy Railway + Vercel and run 2 new migrations:** `20261125120000_guest_report_followers` (new table) and `20261125130000_guest_report_security_events` (3 `audit_action` enum values).
- **Guest follow (backend, `90a7137`):** new `backend/src/incidents/guest-follow/` (`guest-follow.service.ts`, `guest-follow.controller.ts`, `guest-follow.constants.ts`). `POST /v1/incidents` returns `guest_status_token` to guests (controller `create`). New `GET /v1/guest-reports/status` + `PUT /v1/guest-reports/push-token` (token in header `x-guest-report-token`). Daily cron `guest-follow-retention` (`40 3 * * *`).
- **Guest push (backend):** `IncidentStatusNotifier.notifyReporter` now runs `notifyAccountReporter` (old behaviour) then `notifyGuestFollowers` (new). `NotificationProcessor.sendPush` routes `guestFollowerId` jobs to `sendGuestPush`.
- **Guest follow (mobile, `90a7137`):** success screen (`mobile/app/emergency/transmission.tsx`) shows `GuestReportStatusCard` (polls every 15 s), asks for notification permission once **after** the report is saved, saves the token in Secure Store (`agap.guest_report.v1`). New screen `mobile/app/emergency/guest-status.tsx` ("Your report", hotlines, "Stop following"). Sign-in screen card "Your report INC-… · See its status". Tapping a guest push opens the screen without a session (`mobile/app/_layout.tsx`).
- **Security (`2db2763`):** removed `POST /v1/emergency-alerts/:id/cancel` and `GET /v1/emergency-alerts/:id/status` + `EmergencyAlertsService.cancel/getStatus`. Guest `POST /v1/emergency-alerts/sos|shake` now need GPS inside Bocaue.
- **Guest anti-spam:** new limit rule `{ scope: 'spot', windowSeconds: 600, max: 3 }` (same IP + ~200 m grid cell). Refusal message for spot points to 911/MDRRMO and says MDRRMO already has it.
- **Security Events:** new audit actions `GUEST_REPORT`, `GUEST_REPORT_REPEAT` (amber), `GUEST_REPORT_BLOCKED` (red), written by `GuestReportLimitInterceptor` with `ip_address`, `user_agent`, a short phone code, counts. Web page `frontend/components/admin/SecurityEvents.tsx` shows them, labels them, and has a **filter-by-IP** button + chip. Audit API `GET /v1/audit?ip=` (validated with `net.isIP`).
- **Tests (final runs):** backend affected folders 41 suites (761 pass + 1 known timeout, see Evidence) then `test/audit test/emergency-alerts` 7 / 83; frontend 28 / 261; mobile 23 / 294 (with NODE_PATH workaround). `tsc --noEmit` clean in shared, backend, frontend, mobile. ESLint 0 errors.
- **Not verified on a device or live:** nothing from `90a7137` / `2db2763` has run outside jest (not pushed; no APK). Visual check of the new mobile screens and the Security Events page has not happened.
- **TRUST_PROXY:** still the default (`'loopback, linklocal, uniquelocal'` in `backend/src/config/config.validation.ts:96`, applied in `backend/src/main.ts:39-42`). Unknown whether `req.ip` is the phone or Railway's proxy. **Every IP limit (old and new) depends on it.**
- **APK on the user's phone:** still the first preview build. It lacks `9e5e7d0` (refresh fix) and all of `90a7137` (guest follow UI). Backend-only parts of `2db2763` need no APK.
- **Mobile-data sign-in:** untested (no load).
- **Plan file:** Phase 5 boxes: APK installs ✓, push ✓, mobile-data sign-in ☐. Phase 6: guest SOS live ✓, ops SMS ✓, guest follow ☐ (new), the rest ☐.

## What We Tried (Chronological)

1. **Onboarding (paste prompt).** `bd` missing. Live health 200. Read `system-health.service.ts`, `sms.processor.ts` (first 140 lines), `authed-fetch.ts`. Adjacent: `mobile/src/services/push/push-registration.ts` (silently returns false on failure → we used the "registered devices" count as the signal), `mobile/app.json` (`googleServicesFile: ./google-services.json`), `git ls-files mobile/google-services.json` → tracked, so EAS includes it (rules out the common "no FCM token" cause), `mobile/eas.json` (preview profile, Node 22.14.0, pnpm 11.1.1, `environment: preview`). Proposed one SOS covering 3 checks. User said go.
2. **Combined admin + push test (user ran it).** Steps 1, 2, 4, 5, 6 passed; step 3 (SMS Activity) "not yet check" → I explained no new SOS needed, the row already exists → user: "SMS Activity shows the ops alert row as Accepted". Ticked Phase 5 push in `DEPLOYMENT_PLAN.md:346`.
3. **Ops SMS box.** I refused to tick on "Accepted" alone (Accepted ≠ delivered) and asked if the ops phone received it. User: SIM has no load, but received the SMS yesterday. Receiving needs no load → ticked with an honest note (received 2026-11-24, Accepted 2026-11-25).
4. **Guest SOS live map.** Read login guest button (`login.tsx:500`), `socket-provider.tsx:194` (`incident.created` invalidates `incidents`, `dispatch-incidents`, `incident-locations`…), guest limits (2 / device / 10 min). Also designed a TRUST_PROXY "bonus" check (compare phone's public IP with Security Events login IP). User: pin appeared live → ticked. **The bonus IP check was not run.**
5. **Guest notifications request.** Explored: mobile guest reports go to `POST /v1/incidents` with no token and `X-Device-Id`; the success screen got nothing afterwards; `notifyReporter` returned early when `incident_reporters.user_id` is null (`incident-status-notifier.ts:139`); merge stores `duplicate_of_id` (`schema.prisma:235`); no global JWT guard (`APP_GUARD` is only `ThrottlerGuard` + `PasswordChangeGuard`); `GET /v1/incidents/:id/status` already public-by-UUID with status-only data. Asked 2 questions (AskUserQuestion): SMS too? → **Push + in-app only**; after merge? → **Keep following**.
6. **Guest follow implementation.** Capability token design (random 32 bytes, hash stored), table + migration, service/controller, notifier guest path, processor guest path, shared types, mobile API/storage/card/screen/login card/tap routing. First backend `tsc` failed: `TS2305 Module '"@agap/shared"' has no exported member 'GUEST_REPORT_TOKEN_HEADER'` (backend reads `@agap/shared` from `shared/dist`) → fixed by `npx tsc -p tsconfig.json` in `shared/`. Moved constants out of the service into `guest-follow.constants.ts` so `notifications/` doesn't import a service file.
7. **Guest follow tests.** New `backend/test/incidents/guest-follow.spec.ts`; updated `reporter-status-push.spec.ts` mock prisma (added `guest_report_followers: { findMany: [], updateMany }`). 2 suites / 91 tests pass; wider run 30 / 577.
8. **Mobile jest problems.** New `saved-guest-report.test.ts` failed: "The module factory of `jest.mock()` is not allowed to reference any out-of-scope variables. Invalid variable access: store". Renamed with `sed 's/\bstore\b/mockStore/g'` → it **also renamed `'expo-secure-store'` to `'expo-secure-mockStore'`** → fixed with Edit. Then 23 / 23 suites, 294 tests.
9. **Flagged pre-existing holes** in the handoff message: `GET /v1/emergency-alerts/:id/status` returned the whole incident incl. `incident_reporters` (name + phone) to anyone with the UUID; `POST /v1/emergency-alerts/:id/cancel` let anyone cancel in the 15 s window. User: "yes fix it" + anti-spam request.
10. **Security investigation.** grep: neither web nor mobile calls `/emergency-alerts/*` (mobile cancels through `PATCH /v1/false-alerts/:id/cancel`, which checks ownership: "You can only cancel your own incidents"). Also found `createFromSos` accepted guest reports with **no GPS and no Bocaue check** (bypass of the `/v1/incidents` guest rule). `audit_logs.action` is the Postgres enum `audit_action` → new values need a migration. Security Events reads `GET /v1/audit` with a fixed action list.
11. **Decision: delete, not patch, the two routes**, then add spot limit + security events + IP filter (details in Key Decisions).
12. **Security round type errors.** `exactOptionalPropertyTypes`: TS2375 (`createdIncident` return type) and TS2379 (`incidentId: string | undefined` into `AuditLogEntry`) → typed `{ id: string | undefined; ref: string | undefined }` and spread `...(created.id && { incidentId })`.
13. **PowerShell encoding accident.** Replaced `void this.audit?.log(` with `this.record(` using `(Get-Content -Raw) -replace … | Set-Content -Encoding utf8`. Result: a BOM (`ef bb bf`) and `—` → `â€”` in the interceptor comment (line 49). Fixed with `sed` (strip BOM, restore `—`). Saved to memory.
14. **SOS spec break.** `sos-priority.spec.ts` called `createFromSos` as a guest without GPS → now 400. Changed those calls to pass `'citizen-1'` and added guest GPS tests + a "routes removed" test.
15. **auth-phase3 timeout.** Big run: 1 fail "MfaService — login decision › asks enrolled users for a second step" (`Exceeded timeout of 5000 ms`). Alone: still times out. With `--testTimeout=60000`: passes in 1842 ms. Not related (MFA code untouched); laptop is slow.
16. **Frontend.** Security Events extended; new `frontend/__tests__/security-events-guest.spec.ts`; 28 / 261 pass; `tsc` clean.
17. **User committed both features** (messages I gave) but has **not pushed**. Final check this session: `git log origin/main..HEAD` = 4 commits.

## Key Decisions

- **Guest follow uses a capability token, not the incident UUID.** Random 32 bytes (`base64url`, 43 chars), SHA-256 stored in `guest_report_followers.token_hash`, sent in header `x-guest-report-token` (never URL: URLs land in proxy logs). Rejected: reuse `GET /v1/incidents/:id/status` with the UUID (the UUID is shared with staff/WS events and the CLAUDE.md "no internal IDs" rule; and push registration needs proof of being the reporter).
- **Token only for app guest reports** (`report_channel = APP`, reporter `is_guest` with no `user_id`), max 5 per incident (resends each get one). **SMS reports never get one**: their event id is printed in the SMS text, same reasoning as `completeSmsReport` (`incidents.service.ts:409-412`).
- **Push + in-app only, no SMS** (user choice): no Textbee load cost; SMS reporters already get their reference texted back.
- **After a merge the guest keeps following** (user choice): followers of incidents whose `duplicate_of_id` (1 or 2 levels) is the changing incident get its pushes, each with **their own** reference; status words only; the main report's reference/reporter never sent (Rule 15). `status()` follows up to `MAX_MERGE_DEPTH = 3`.
- **Guest wording differs from account wording:** CLOSED without "You are a Verified Reporter"; EN_ROUTE without "Open AGAP for the estimated arrival" (guest screen has no ETA); CANCELLED added for guests (account reporters still skip it: "only the reporter cancels"); DUPLICATE says "you will keep getting updates here".
- **Expiry:** 7 days max (`GUEST_FOLLOW_TTL_MS`); when the report finishes (`CLOSED | CANCELLED | FALSE_ALERT`) links shrink to 24 h (`GUEST_FOLLOW_AFTER_END_MS`); daily prune deletes rows (and device tokens). DUPLICATE, UNABLE_TO_RESPOND, REFERRED are not "finished".
- **Push job carries only `guestFollowerId`**, never the device token (token stays in Postgres; expiry and "stop following" apply at send time). Dead tokens (`messaging/registration-token-not-registered`, `messaging/invalid-registration-token`) are cleared; temporary errors keep the token.
- **Permission is asked only after the report is saved** (never delays the SOS). If refused, the card shows "Notifications are off for AGAP…".
- **Delete the two open routes instead of adding auth.** Unused by every client; the real cancel path exists with ownership checks; deleting removes the exposure entirely. Left a comment in the controller saying where cancel/status live now.
- **New "spot" limit = IP + ~200 m cell, 3 per 10 min.** Targets one person with several phones on one connection. Neighbours on other networks are unaffected (Rule 14). Rejected: blocking the 2nd report (CGNAT neighbours report the same fire legitimately); a lower IP-wide limit (hurts unrelated reporters).
- **Record every guest report in Security Events** (not only blocked ones), with a **short phone code** (`sha256('device:'+id).slice(0,8)`), not the device id. The 2nd+ from the same spot is `GUEST_REPORT_REPEAT`. A retry with the same idempotency key is not recorded twice (`lease.repeat`). Audit writes are fire-and-forget (`record()`), a failure never fails a report.
- **When the limiter is disabled** (`GUEST_REPORT_LIMIT_DISABLED=true`) reports are still recorded (`repeat: false`, empty counts).
- **No SMS-SOS security events** (CitizenSmsSosService path): it has its own per-number limit and the sender number is sensitive; not added.
- **Left alone (low risk):** `GET /v1/incidents/:id/status` (OptionalJwt) still returns `publicReference/status/category/submittedAt/dispatchedAt` to anyone holding the UUID; no personal data.

## Evidence & Data

### Commits this session

| Hash | Summary | Pushed? |
|---|---|---|
| `a8460e5` | session: deployment-phase-5-admin-sms-tracking (previous handoff) | **no** |
| `408d031` | docs(deploy): Phase 5 push and Phase 6 ops SMS checks passed | **no** |
| `90a7137` | feat(guest): guests follow their own report (live status + push) | **no** |
| `2db2763` | fix(security): remove open alert cancel/status routes; guest reports in Security Events | **no** |
| this handoff | session: guest-follow-and-guest-security | **no** |

### Live checks done by the user (2026-11-25)

| Check | Result |
|---|---|
| APK sign-in (Wi-Fi) + allow notifications | done |
| Health → Integrations "registered devices" | ≥ 1 ("working") |
| SOS from phone → SMS Activity | "Ops alert (MDRRMO)" row, `Accepted` |
| Dispatcher Acknowledge → phone | "Incident updates" notification ("working") |
| Close test incident (false alert / cancel) | "working" |
| Configuration page | no `fcm_token:` rows; oversight timers "In use" |
| Ops phone receives `AGAP|INC-…` | yes, on 2026-11-24 |
| Guest SOS → Live Dispatch | pin appeared without reload |
| TRUST_PROXY IP check | **not done** |
| Mobile-data sign-in | **not done** (no load) |

### Test runs

| Run | Result |
|---|---|
| backend `tsc` (first, before shared build) | 3× TS2305 missing `@agap/shared` exports |
| shared `npx tsc -p tsconfig.json` then backend `tsc` | exit 0 |
| backend `guest-follow.spec.ts` + `reporter-status-push.spec.ts` | 2 / 2 suites, 91 / 91 |
| backend `test/incidents test/notifications test/emergency-alerts test/jobs` | 30 / 30 suites, 577 / 577 |
| backend eslint (guest-follow files) | 0 errors, 55 warnings (`no-explicit-any` in tests) |
| mobile `tsc --noEmit -p tsconfig.json` | exit 0 |
| mobile jest (first) | 22 pass + 1 FAIL (`jest.mock` out-of-scope `store`) |
| mobile jest (after rename + module-name fix) | 23 / 23 suites, 294 / 294 |
| backend `tsc` (security round, first) | TS2375 + TS2379 (`exactOptionalPropertyTypes`) |
| backend `test/emergency-alerts test/incidents test/notifications test/audit test/administration test/auth` | 40 pass, 1 FAIL (auth-phase3 timeout); 761 / 762 tests |
| `auth-phase3.spec.ts` alone | still 1 timeout (58 / 59) |
| same test `--testTimeout=60000` | passes in 1842 ms |
| frontend `tsc` | exit 0 |
| frontend jest | 28 / 28 suites, 261 / 261 |
| backend `test/audit test/emergency-alerts` (after audit IP tests) | 7 / 7 suites, 83 / 83 |
| backend eslint (emergency-alerts, audit, guest-follow) | 0 errors, 26 warnings |

### Guest limit rules (`GUEST_REPORT_RULES`, after this session)

| Scope | Window | Max | Key |
|---|---|---|---|
| device | 10 min | 2 | `X-Device-Id` (random per install) |
| device | 24 h | 6 | same |
| ip | 10 min | 20 | `req.ip` |
| ip | 24 h | 100 | same |
| phone | 10 min | 3 | SMS sender (SMS SOS only) |
| phone | 24 h | 10 | same |
| **spot (new)** | **10 min** | **3** | `${ip}|round(lat/0.002)|round(lng/0.002)` |

All keys are SHA-256-hashed in Redis (`guestlim:` prefix); in-memory fallback if Redis is down. Idempotency key → `admitted` flag 24 h (retries free).

### Security Events rows for the user's "2 phones, same Wi-Fi" scenario (from the spec)

| # | action | ip | newValues |
|---|---|---|---|
| 1 | `GUEST_REPORT` | 203.0.113.30 | `{publicReference, device: <8 hex>, networkReports10m: 1, samePlaceReports10m: 1}` |
| 2 | `GUEST_REPORT_REPEAT` | 203.0.113.30 | `{…, device: <different 8 hex>, networkReports10m: 2, samePlaceReports10m: 2}` |
| 4th same spot | `GUEST_REPORT_BLOCKED` | same | `{reason: 'LIMIT_SPOT', device, limit: 3, windowMinutes: 10, retryAfterSeconds}` |

`moduleId: 'MOD-06'`; success rows `entityType: 'incident'`, `entityId = incidentId`; blocked rows `entityType: 'guest_report'`.

### Guest push messages (`GUEST_MESSAGES` in `incident-status-notifier.ts`)

| Status | Title | Body (`ref` = guest's own reference) |
|---|---|---|
| ACKNOWLEDGED | Report received | MDRRMO has received your report {ref} and is reviewing it. |
| DISPATCHED | Help is on the way | Responders have been dispatched for {ref}. |
| EN_ROUTE (guest override) | Responders on the way | Responders are travelling to the scene for {ref}. |
| ON_SCENE | Responders have arrived | Responders are now at the scene for {ref}. |
| TRANSPORTING / ASSISTING / RESOLVED / REFERRED / UNABLE_TO_RESPOND / FALSE_ALERT | same as account reporter | — |
| CLOSED (guest override) | Incident closed | {ref} is now closed. Thank you for reporting through AGAP. |
| CANCELLED (guest only) | Report cancelled | {ref} was cancelled. If you still need help, call 911 or the MDRRMO hotline. |
| DUPLICATE (guest override) | Report merged | {ref} matched another report of the same emergency. Responders are handling it there, and you will keep getting updates here. |

Push `data`: `{ type: 'GUEST_REPORT_STATUS', status, publicReference }`; Android channel `incident-updates`; jobId `guest-status:{followerId}:{status}`.

### Mobile card wording (`guest-status-text.ts`)

| Status | Title | Tone |
|---|---|---|
| SUBMITTED / RECEIVED | Waiting for a dispatcher | progress |
| ACKNOWLEDGED | Report accepted | progress |
| ASSESSED / DISPATCH_PENDING | Arranging a response | progress |
| DISPATCHED | Help is on the way | progress |
| EN_ROUTE | Responders on the way | progress |
| ON_SCENE / TRANSPORTING / ASSISTING | Responders have arrived / Patient being transported / Responders assisting | progress |
| RESOLVED / CLOSED | Responders have finished / Report closed | done |
| CANCELLED / FALSE_ALERT / UNABLE_TO_RESPOND | … (body names 911) | warn |
| REFERRED | Referred to a partner agency | progress |
| unknown | Report sent | progress |

### `guest_report_followers` (migration `20261125120000_guest_report_followers`)

```sql
CREATE TABLE "guest_report_followers" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(), "incident_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL, "push_token" VARCHAR(512),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), "expires_at" TIMESTAMPTZ(6) NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION);
-- unique token_hash; idx_guest_report_followers_incident; idx_guest_report_followers_expires
```

Migration `20261125130000_guest_report_security_events`: `ALTER TYPE "audit_action" ADD VALUE IF NOT EXISTS 'GUEST_REPORT' / 'GUEST_REPORT_REPEAT' / 'GUEST_REPORT_BLOCKED'`.

### API changes

| Route | Auth | Change |
|---|---|---|
| `POST /v1/incidents` | optional JWT | guests get `guest_status_token` (app reports only) |
| `GET /v1/guest-reports/status` | `@Public`, header token | new; throttle burst 3/s, 30/min; 401 unknown/expired |
| `PUT /v1/guest-reports/push-token` | `@Public`, header token | new; body `{ pushToken: string | null }` (≤512, `^[A-Za-z0-9_:\-.]+$`); throttle 2/s, 10/min |
| `POST /v1/emergency-alerts/sos`, `/shake` | optional JWT | guests now need GPS inside Bocaue (400 otherwise) |
| `POST /v1/emergency-alerts/:id/cancel` | — | **removed** |
| `GET /v1/emergency-alerts/:id/status` | — | **removed** |
| `GET /v1/audit` | SUPERVISOR, SYS_ADMIN | new `ip` filter; 400 "ip must be an IPv4 or IPv6 address" |

## Code Analysis

- **`backend/src/incidents/guest-follow/guest-follow.service.ts`:** `GuestFollowService(prisma)`. `issue(incidentId, now)` → token or null, never throws (selects `report_channel`, `incident_reporters{user_id,is_guest}`, `_count.guest_followers`). `status(token, now)` → `GuestReportStatus`; `updatedAt` = newest `incident_events.occurred_at` (fallback `submitted_at`). `setPushToken(token, pushToken|null, now)`. `@Cron('40 3 * * *', { name: 'guest-follow-retention' }) prune(now)`. Private `resolve()` (TOKEN_PATTERN `^[A-Za-z0-9_-]{43}$`, refuses before DB), `mergedInto(id)`. Export `hashGuestToken`.
- **`guest-follow.constants.ts`:** `GUEST_FOLLOW_TTL_MS = 7 d`, `GUEST_FOLLOW_AFTER_END_MS = 24 h`, `MAX_GUEST_FOLLOWERS_PER_INCIDENT = 5`, `GUEST_FINISHED_STATUSES = {CLOSED, CANCELLED, FALSE_ALERT}`.
- **`guest-follow.controller.ts`:** `GuestFollowController` path `guest-reports` v1; `GuestPushTokenDto` (`@IsOptional @ValidateIf(v !== null) @IsString @MaxLength(512) @Matches`).
- **`incidents.controller.ts`:** constructor 11th arg `@Optional() guestFollow?: GuestFollowService` (tests constructing with 9–10 args still work). `create()` returns `{ ...incident, guest_status_token }` only when `!actorId` and a token was issued.
- **`incident-status-notifier.ts`:** `GUEST_PUSH_LIMIT = 50`; `notifyGuestFollowers` query: `push_token not null`, `expires_at > now`, `OR [incident_id = X, incident.duplicate_of_id = X, incident.duplicate_of.duplicate_of_id = X]`; on finished status `updateMany expires_at = now+24h where expires_at > that`.
- **`notification.processor.ts`:** `NotificationJobData.guestFollowerId?`; `sendGuestPush()` + shared `sendFcm(token, data)`.
- **`guest-report-limit.service.ts`:** `GuestLimitScope = 'device'|'ip'|'phone'|'spot'`; `spotKey(ip, lat, lng)` (`SPOT_CELL_DEGREES = 0.002`); `GuestReportLease { release, repeat, counts }`; counts = the first (10-minute) rule per scope; `GuestReportLimitExceeded(retryAfterSeconds, scope='device', rule?)`.
- **`guest-report-limit.interceptor.ts`:** `GuestReportLimitInterceptor(limiter, @Optional() audit?)`; reads coords from `lat/lng` (incidents) or `latitude/longitude` (SOS); IP only if `net.isIP`; `createdIncident(result)` handles both `{id, public_reference}` and `{incident:{…}}`; exported `deviceCode()`, `isGuestRequest()`, `DEVICE_ID_HEADER = 'x-device-id'`; private `record(entry)`.
- **`guest-report-limit.module.ts`:** imports **and re-exports** `AuditModule` so every module using the interceptor can resolve `AuditService` (IncidentsModule already imports AuditModule; EmergencyAlertsModule did not).
- **Mobile `GuestReportStatusCard.tsx`:** `guestReportStatusKey(token)`; `refetchInterval` false when `finished` or expired (ApiError 401/404); `retry` skips expired; calls `onExpired` once; push button → `enableGuestReportPush` then invalidate.
- **Mobile `push-registration.ts`:** `getDevicePushToken({requestPermission})` (channels `default`, `incident-updates`, `assignments` + FCM token, null on failure) now shared by `registerPushToken` and guests; `isGuestReportNotification(response)`.
- **`_layout.tsx`:** `tapped` state `{ pathname, id?, guest? }`; guest taps push `/emergency/guest-status` without waiting for auth (`emergency` is in `PUBLIC_SEGMENTS`).

## Discoveries & Gotchas

- **No global JWT guard.** `APP_GUARD`s are only `ThrottlerGuard` (`app.module.ts:106`) and `PasswordChangeGuard` (`auth.module.ts:49`). A route without `JwtAuthGuard` is open even without `@Public()`. That is how the two `/emergency-alerts/:id/*` routes were reachable by anyone.
- **`GET /v1/incidents/:id/status`** (`incidents.controller.ts` `citizenStatus`, `OptionalJwtAuthGuard`) returns only `publicReference, status, category, submittedAt, dispatchedAt, etaNote` → left open on purpose.
- **Mobile guest reports never used `/emergency-alerts/*`**: they use `submitIncident` → `POST /v1/incidents` with `X-Device-Id` (`mobile/src/services/api/incidents.api.ts:30-54`, 20 s `SUBMIT_TIMEOUT_MS`). `/auth/register/guest` (BYSTANDER account, 2 h token) is also unused by the app.
- **The mobile cancel path** is `PATCH /v1/false-alerts/:id/cancel` (`incidents.api.ts:205-211`); `FalseAlertsService.cancel` forbids responders, checks the citizen owns the incident, allows pre-dispatch statuses only.
- **The removed `EmergencyAlertsService.cancel`** also skipped transition validation, realtime emit and the notifier — another reason to delete it.
- **Status transitions**: `REFERRED → CLOSED` only; `CLOSED/CANCELLED/FALSE_ALERT/DUPLICATE` have no exits (`shared/src/enums/incident-status.enum.ts:99-103`). `TERMINAL_INCIDENT_STATUSES` includes DUPLICATE, so guest code uses its own `GUEST_FINISHED_STATUSES`.
- **Who calls `notifyReporter`**: `IncidentsService.updateStatus` (every status) and `markFalseAlert` and `mergeDuplicate` via `notifyReporterOfStatus` (`incidents.service.ts:928`), `DispatchService` (DISPATCHED, `dispatch.service.ts:261`), `RespondersService.updateStatus` (`responders.service.ts:756`). So guest pushes cover every path account pushes cover.
- **Nest interceptor DI:** `@UseInterceptors(Class)` resolves the class's deps in the host module. `GuestReportLimitModule` re-exports `AuditModule` so `EmergencyAlertsModule` (which doesn't import AuditModule) still gets `AuditService`; it's `@Optional` so a miss would silently skip logging, not crash.
- **`audit_logs.ip_address` is `INET`**: a malformed string would be a DB error → interceptor writes only `net.isIP` values; audit controller validates `ip`.
- **`PowerShell 5.1`**: `Get-Content -Raw` reads BOM-less UTF-8 as ANSI; `Set-Content -Encoding utf8` writes a BOM. Check with `head -c3 file | od -An -tx1` (`ef bb bf` = BOM) and grep `â€`.
- **`sed 's/\bword\b/…/'`** also changes string literals (`'expo-secure-store'`).
- **Jest `jest.mock` factories** may only reference variables named `mock*`.
- **mobile `@/src/...` alias** works in app and src (used by `transmission.tsx`); new files use it.
- **TanStack Query** `refetchInterval` accepts `(query) => number | false` (used in the guest card; tsc clean).
- **`mobile/android` is committed**, so EAS builds from it; the guest feature is JS-only (no new native module/permission), no prebuild needed.

### Security Events UI mapping (`SecurityEvents.tsx`)

| Action | Badge | Label |
|---|---|---|
| `GUEST_REPORT` | muted | Guest report |
| `GUEST_REPORT_REPEAT` | amber | Guest report (repeat) |
| `GUEST_REPORT_BLOCKED` | red | Guest report blocked |
| reason `LIMIT_DEVICE` / `LIMIT_IP` / `LIMIT_SPOT` / `LIMIT_PHONE` | — | Too many from one phone / Too many from one network / Same place, same network / Too many SMS from one number |

Detail text (`guestDetailOf`, exported for tests): e.g. `Phone a1b2c3d4 · 2 from this network at this place in 10 min · 2 from this network in 10 min`; blocked: `Same place, same network · limit 3 per 10 min · Phone ffff0000`. Account column shows "Guest (no account)" + the INC reference. IP column has a filter button → chip "IP: x".

## Files Changed

### Backend (`90a7137`)
- `backend/prisma/schema.prisma`: `model guest_report_followers`; `Incident.guest_followers`; moved the misplaced `barangay_sms_inbound` doc comment (it sat above `sms_log` since `4cadca7`).
- `backend/prisma/migrations/20261125120000_guest_report_followers/migration.sql` (new).
- `backend/src/incidents/guest-follow/{guest-follow.service.ts, guest-follow.controller.ts, guest-follow.constants.ts}` (new).
- `backend/src/incidents/incidents.module.ts`: controller + provider.
- `backend/src/incidents/incidents.controller.ts`: `Optional` import, `GuestFollowService`, `create()`.
- `backend/src/notifications/incident-status-notifier.ts`: `GUEST_MESSAGES`, split notifier.
- `backend/src/jobs/processors/notification.processor.ts`: guest push path.
- `shared/src/constants/guest-report.ts` (new) + `shared/src/constants/index.ts` export.

### Mobile (`90a7137`)
- `mobile/src/services/api/guest-report.api.ts` (new), `mobile/src/services/api/incidents.api.ts` (`guest_status_token?`).
- `mobile/src/services/guest-report/saved-guest-report.ts` (new).
- `mobile/src/services/push/push-registration.ts` (refactor + `isGuestReportNotification`).
- `mobile/src/components/guest-report/{GuestReportStatusCard.tsx, guest-status-text.ts}` (new).
- `mobile/app/emergency/transmission.tsx` (ScrollView `successScroll`, guest token flow, card).
- `mobile/app/emergency/guest-status.tsx` (new screen).
- `mobile/app/auth/login.tsx` (card via `useFocusEffect`).
- `mobile/app/_layout.tsx` (guest tap routing).

### Backend + shared + web (`2db2763`)
- `backend/src/emergency-alerts/emergency-alerts.controller.ts` (routes removed, imports trimmed), `emergency-alerts.service.ts` (guest GPS rule; `cancel`/`getStatus` removed; `NotFoundException` import removed).
- `backend/src/emergency-alerts/guest-report-limit/{guest-report-limit.service.ts, guest-report-limit.interceptor.ts, guest-report-limit.module.ts}`.
- `backend/src/audit/audit.controller.ts` (`ip` query + validation), `audit.service.ts` (`ip` filter).
- `backend/prisma/schema.prisma` (3 enum values) + `migrations/20261125130000_guest_report_security_events/migration.sql`.
- `shared/src/enums/audit-action.enum.ts` (3 values).
- `frontend/components/admin/SecurityEvents.tsx`, `frontend/features/audit/api.ts`.

### Tests
- `backend/test/incidents/guest-follow.spec.ts` (new: issue/status/merge/expiry/controller/notifier/processor).
- `backend/test/notifications/reporter-status-push.spec.ts` (mock prisma gains `guest_report_followers`).
- `backend/test/emergency-alerts/guest-report-limit.spec.ts` (spot rule, counts, spotKey, Security Events scenario, blocked event, SOS shape, retry not double-logged, no raw device id, audit failure safe).
- `backend/test/emergency-alerts/sos-priority.spec.ts` (signed-in calls; guest GPS; routes removed).
- `backend/test/audit/audit-filter.spec.ts` (IP filter + controller validation).
- `mobile/src/services/push/__tests__/push-registration.test.ts` (guest push recognition).
- `mobile/src/services/guest-report/__tests__/saved-guest-report.test.ts` (new).
- `frontend/__tests__/security-events-guest.spec.ts` (new).

### Docs
- `docs/plans/DEPLOYMENT_PLAN.md`: ticks (Phase 5 push; Phase 6 ops SMS, guest SOS), new guest-follow box, TRUST_PROXY section (spot limit + how to read the IP in Security Events).

### Memory (outside repo)
- `C:\Users\githu\.claude\projects\c--Users-githu-Music-agap-emergency\memory\feedback-no-backslash-shell-edits.md` + `MEMORY.md` hook: PowerShell encoding + sed-in-strings lessons.

## User Feedback & Preferences (REQUIRED — never omit)

- Started with the paste prompt and the standing rule: **narrate onboarding, then wait for go-ahead**.
- Reports test results as a numbered list with short status words ("(done)", "(working)", "(Not yet check)", "(checked)") — give numbered, click-by-click steps they can answer the same way.
- "SMS Activity shows the ops alert row as Accepted."
- "my sim does not have load yet, but yesterday when i tested the SOS i have receive an SMS so the sms is working." (→ accepted as delivery evidence)
- "let's start with the guest SOS live on the map" — picks the next Phase 6 item themselves when offered a list.
- **Feature request:** "the pin appeared on the map without reloading and can you please include an notification to a guess if possible if their report already accepted, cancelled, duplicate report(been merge with citizen account same report), and so on".
- Chose **Push + in-app only (Recommended)** and **Keep following (Recommended)** in the question dialog — accepts recommended options when explained.
- **Security request:** "yes fix it, ensure that the guess too have a security features so they do not spam the report, for example, i have 2 devices, and i report the same incident, ensure its getting its security events the IP, o avoid spamming."
- Commits themselves with the messages given (both commits used my text). **Pushes themselves**, only when nobody is testing; "i haven't push it yet".
- Ends sessions with "/handoff … close this session and give me the prompt" + asks to verify the commit state.
- Standing preferences (carried): phase by phase; both **PowerShell and Git Bash** command forms; never repeat secrets; secret prompts with `Read-Host -AsSecureString`; public repo; $0 preference; no domain yet; asks before scope expansions that need a new APK.

## Where We're Going

1. **Push the 4 commits** (when nobody is testing): `git push`. Railway runs both migrations and redeploys; Vercel redeploys. Then check `https://agap-emergency-production.up.railway.app/v1/health`, and prove the new code is live (Railway once deployed stale code): `GET /v1/guest-reports/status` with no header → **401** (not 404); `POST /v1/emergency-alerts/<any-uuid>/cancel` → **404**.
2. **TRUST_PROXY check (do before any pilot):** send one guest SOS from the APK, open System Administration → Security Events → "Guest report", read the IP. Public carrier/home IP = fine. Starts with `10.`, `100.`, `172.`, `192.168.` = Railway's proxy → set `TRUST_PROXY=1` on Railway, redeploy, repeat. Record the decision in `DEPLOYMENT_PLAN.md` Phase 6.
3. **Build the new preview APK** (carries `9e5e7d0` refresh fix + `90a7137` guest follow): from `mobile/`: `eas build --profile preview --platform android`; install over the old one (same package/key) or uninstall first.
4. **Test guest follow on the new APK** (plan box): guest SOS → live card + permission prompt → Acknowledge → "Report received" push and card "Report accepted" → merge into another report → "Report merged" then dispatch/arrival pushes → False alert / Cancel pushes → tap opens "Your report" → sign-in screen card. Then the **2-phones same Wi-Fi** test: second report must appear as "Guest report (repeat)" with the same IP and a different phone code.
5. **Mobile-data sign-in** once the SIM has load (Chrome `/v1/health` on data first). Ticks the last Phase 5 box.
6. **Remaining Phase 6 boxes:** signed-in citizen live status; dispatch → responder push + location; SMS fallback with data off (needs load to send); every role signs in; sign-out across tabs; passkeys web + APK; photo upload → R2 (no `stored … on local disk`), then `STORAGE_LOCAL_FALLBACK=true`; `/b` barangay page.
7. **Before a real pilot:** rotate PostGIS + Redis passwords. Optional follow-ups: fix mobile jest (`@babel/traverse` devDependency or `public-hoist-pattern`); wire or delete "Stored only" config keys; `sms_log` delivery updates; Manila-time days in SMS chart; Vercel Node 22.x check; consider guest follow for `/emergency-alerts/sos` (app doesn't use it).

## Risks & Blockers

- **TRUST_PROXY unknown.** If `req.ip` is Railway's proxy, every guest shares the IP limits (20 / 10 min town-wide) and the new spot limit (3 / ~200 m / 10 min town-wide). Emergency switch: `GUEST_REPORT_LIMIT_DISABLED=true` (reports are still recorded in Security Events).
- **Nothing from `90a7137`/`2db2763` has run live or on a device.** Expect possible UI polish issues (ScrollView + map on the success screen, permission prompt timing).
- **Migration on push:** `ALTER TYPE … ADD VALUE` inside Prisma's migration transaction; Postgres ≥ 12 allows it (the repo already uses this pattern, e.g. `20261018150000_caller_intake`). If it fails, Railway logs will show it on deploy.
- **Railway can deploy stale code** (seen once): verify with the two 401/404 probes above.
- **Mobile jest needs the NODE_PATH workaround**; **backend auth suites time out under load** (auth-phase3 needs `--testTimeout=60000` or a quiet machine).
- **Backend reads `@agap/shared` from `shared/dist`**: after changing shared, run `npx tsc -p tsconfig.json` in `shared/` before backend `tsc`/jest. `shared/dist` is not tracked; Railway builds it.

## Open Questions

- Is `req.ip` the real client on Railway? (Decides TRUST_PROXY.)
- Does the carrier reach the IPv4-only Railway host on mobile data with load? Which carrier/promo? (Asked in parent, still unanswered.)
- Has the user already started an EAS build since the parent session? If so, it lacks guest follow; rebuild.
- Should the "Stored only" config keys be wired in or removed? (Not discussed.)
- Should guests reporting via `/emergency-alerts/sos|shake` also get a follow token? (App doesn't use these routes; not done.)

## Quick Start for Next Session

```bash
# Restore context (bd not installed)
docs/handoff/2026-11-26_guest-follow-and-guest-security.md   # this file
docs/plans/DEPLOYMENT_PLAN.md                                 # Phase 5/6 boxes, TRUST_PROXY section
CLAUDE.md

# Key files to read first (not exhaustive — explore adjacent code too)
backend/src/emergency-alerts/guest-report-limit/guest-report-limit.interceptor.ts
backend/src/emergency-alerts/guest-report-limit/guest-report-limit.service.ts
backend/src/incidents/guest-follow/guest-follow.service.ts
backend/src/notifications/incident-status-notifier.ts
mobile/src/components/guest-report/GuestReportStatusCard.tsx

# Verify current state (read-only)
git log origin/main..HEAD --oneline        # expect 5 unpushed (incl. this handoff) unless the user pushed
curl -s https://agap-emergency-production.up.railway.app/v1/health

# Tests
cd shared && npx tsc -p tsconfig.json
cd backend && npx jest --config ./test/jest.config.ts test/incidents/guest-follow.spec.ts test/emergency-alerts test/audit
cd frontend && npx jest
cd mobile && NODE_PATH="$(cd ../node_modules/.pnpm/@babel+traverse@7.29.8/node_modules && pwd -W)" npx jest

# Next action
Ask whether the user pushed. If yes: run the 401/404 probes, then the TRUST_PROXY IP check via Security Events.
If no: tell them to push when nobody is testing (both shells: `git push`), then do the above.
```

## Session Closed
**Closed at:** 2026-11-26 (local, GMT+8)
**Commit:** the `session: guest-follow-and-guest-security` commit that includes this note (not pushed: a push to main redeploys Railway and Vercel and runs 2 migrations; the user pushes)
**Session status:** Handed off to next session
