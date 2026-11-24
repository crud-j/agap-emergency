# Deploying AGAP: APK works on Wi-Fi; offline-refresh fix; System Administration rebuilt with measured health, SMS log, paging

**Date:** 2026-11-24
**Status:** IN PROGRESS (Phase 5: APK installed and ID OCR confirmed; push check and mobile-data sign-in with load still open; a new APK is needed for the refresh fix. The admin work is deployed and confirmed live.)
**Bead(s):** none (`bd` is not installed: `bd: command not found`)
**Epic:** Deployment plan `docs/plans/DEPLOYMENT_PLAN.md` (plus an unplanned System Administration UI/UX pass the user asked for)
**Chain:** `standalone-953e4889` seq `4`
**Parent:** `docs/handoff/2026-11-24_deployment-phase-5-eas-id-ocr.md`
**Prior chain:** `docs/handoff/2026-11-24_deployment-phases-1-3.md` > `docs/handoff/2026-11-24_deployment-phases-3-4.md` > `docs/handoff/2026-11-24_deployment-phase-5-eas-id-ocr.md` > this

---

## Since Last Handoff

- Parent step 1 (finish the APK) **done by the user**: "I have now installed the preview apk and i can login." The EAS preview build succeeded (no build log needed). The dev client was replaced by the APK.
- Parent step 3 (real ID test on the APK): the user reports **"the ocr works too"**. Upside-down on a real card was **not reported separately**. The open question "what failed last time" is still unanswered, but OCR works now.
- Parent step 2, sign-in on mobile data: **failed, but not because of AGAP**. The user's SIM had **no load** ("my mobile data does not have a load"), and the health URL also failed in Chrome on data. Wi-Fi sign-in against Railway works, so the app doesn't depend on the laptop or LAN. **Still to test on a phone with load.**
- Parent step 2, push token: **not done yet**. The test procedure was given (send an SOS, Acknowledge it on the web, watch for an "Incident updates" notification). No result yet.
- Parent step 4 (update `DEPLOYMENT_PLAN.md` Phase 5) **done**: committed by the user as `3a4b8ae` "docs(deploy): Phase 5 APK notes; Railway stale-deploy lesson".
- **New, not in the parent plan:** found and fixed a real weak-signal bug. The app **signed users out when a token refresh couldn't reach the server**. Committed as `9e5e7d0` and pushed. **Not in any APK yet**: needs a new EAS preview build.
- **New, user request:** a full System Administration UI/UX pass: measured health with no hardcoded values (DB, Redis, storage, SMS), a new SMS log and SMS Activity page, pagination on every admin table, and a rebuilt Configuration page. Committed `4cadca7`, pushed, Railway and Vercel deployed. The user confirmed: **"deploy done and dashboard shows real numbers"**.
- **Privacy bug found and fixed along the way:** every user's FCM push token (`fcm_token:<userId>` rows in `system_configurations`, `is_sensitive=false`) was **listed and editable on the Config page**. Now hidden, and edits to those keys are refused.
- Parent step 5 (Phase 6) and step 6 (password rotation) **not started**. Parent step 7 (Vercel Node version) not checked.

## Related Handoffs

- `docs/handoff/2026-11-15_session-handoff.md`, `docs/handoff/2026-11-15_risk-pin-place-finding.md`, `docs/handoff/2026-11-15_risk-areas-pin-automation.md`: separate feature streams (SMS, AI, risk areas), not this chain.

## Reference Documents

- `docs/plans/DEPLOYMENT_PLAN.md`: **the** plan. Phase 5 now has a "Notes from the first build (2026-11-24, no domain yet)" block and the ticked "APK installs" box. §3.5 Railway lessons has the new stale-deploy row.
- `CLAUDE.md`: project rules. Relevant this session: Reliability Rules ("no silent failure", SMS < 160 chars GSM-7), "Do not expose internal database IDs in public API responses", Privacy/Data Classification, MOD-17 / MOD-49 mapping.
- Memory: `project-mobile-build-env.md` (updated this session with the mobile jest workaround), `project-railway-gotchas.md`, `feedback-git-bash-commits.md`, `project-backend-test-run.md`, `project-frontend-lint-broken.md` (frontend ESLint crashes; use `tsc --noEmit`).

## The Goal

Run AGAP without the laptop for demos and pilot testing (school project; the user is a student). Web console on **Vercel** (`agap-emergency.vercel.app`), NestJS backend + PostGIS + Redis on **Railway** (`agap-emergency-production.up.railway.app`), files on private **Cloudflare R2**, and an **EAS preview APK** for Android phones pointing at Railway. The user works phase by phase. Phase 5 = APK (nearly done); Phase 6 = end-to-end checks on the deployed system (including the `TRUST_PROXY` decision). This session also made the **System Administrator's console trustworthy**: every number on it is measured live, SMS sends are actually tracked, and every table pages so it scales.

## Where We Are

- **Backend live:** `https://agap-emergency-production.up.railway.app`, `/v1/health` → `{"status":"ok","timestamp":"2026-11-24T03:44:35.180Z","version":"1.0.0"}` early in the session. After the `4cadca7` deploy the user reported the dashboard shows real numbers (the migration ran and the new code is live).
- **Git:** `main` = `origin/main` at `4cadca7` (all three session commits pushed by the user). Uncommitted, **not ours, leave alone:** `frontend/tsconfig.tsbuildinfo`, `docs/presentation/Justine_Soliman_IPO_Report.md`.
- **APK (Phase 5):** installed; sign-in works on Wi-Fi; ID OCR works. Mobile-data sign-in is untested on a SIM with load. Push registration is unverified. The installed APK **does not have** the `9e5e7d0` refresh fix.
- **Mobile refresh fix** (`9e5e7d0`): `mobile/src/services/api/authed-fetch.ts` now returns `'refreshed' | 'ended' | 'unreachable'` from `refreshSession()`. It logs out only on ApiError 400/401/403 from `/v1/auth/refresh`. `authedFetch` throws `NetworkError` on `unreachable` and `Error('Session expired. Please log in again.')` on `ended`. `refreshAccessToken()` (used by the socket) still returns a boolean.
- **Offline session behaviour confirmed by reading code:** `mobile/src/stores/auth.store.ts:54` `loadFromStorage` reads tokens and user from Secure Store with **no server call**, so a signed-in user stays signed in with no internet and can reach SOS and Send by SMS.
- **Mobile tests:** 22 suites / 279 tests pass **only with the NODE_PATH workaround** (see Evidence). Without it, every suite fails with `Cannot find module '@babel/traverse'`. Mobile `tsc --noEmit -p tsconfig.json` exit 0.
- **Admin backend (`4cadca7`):** health now measures DB / Redis / storage / SMS / push. There's a new `sms_log` table and migration `20261124120000_sms_log`, new endpoints `GET /v1/administration/sms` and `/sms/summary`, a paginated `GET /v1/administration/config`, a registry of known config keys, and a daily retention cron.
- **Admin frontend (`4cadca7`):** redesigned `HealthTab` (4 service cards + queue table + overall banner + "Check now"), a new `/administration/sms` page, a shared `Pagination` component used on Users, Audit Log, Security Events, ID Reviews, Config, SMS Activity and Risk Areas, search on the Barangay Directory, a rebuilt Config page, and an SMS Activity nav item.
- **Backend tests:** `test/administration` 4 suites / 34 tests pass; SMS-related suites (`test/announcements/announcement-sms-delivery.spec.ts`, `test/barangay-coordination`, `test/notifications`) 14 suites / 327 tests pass. `tsc --noEmit -p tsconfig.json` exit 0. ESLint on the changed files: 0 errors, 40 warnings (all `no-explicit-any` in test mocks, the same style as the existing specs).
- **Frontend tests:** 27 suites / 257 tests (254 before + 3 new pagination tests). `tsc --noEmit -p tsconfig.json` clean. ESLint not run (known broken repo-wide).
- **Not visually verified by the assistant:** Docker Desktop was off locally (`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`), nothing was on :3000/:3001. The user's live check of the dashboard is the only visual confirmation. **SMS Activity and Config pages are not yet confirmed by the user.**
- **SMS log starts empty**: it only fills from sends after `4cadca7` went live. There's no historical backfill (the old sends were only in server logs).
- **Config keys actually read by code:** only `oversight.waiting_minutes` and `oversight.stale_location_minutes` (`backend/src/oversight/oversight.service.ts`). All other seeded keys (`bocaue_river_critical_level_meters`, `sms_enabled` "Semaphore", `default_language`, `sos_cancel_window_seconds`, `max_offline_queue_age_hours`, `eta_update_interval_seconds`, `duplicate_detection_radius_meters`) are **stored only**, and the page now labels them "Stored only".
- **`.env.example`** gained `SMS_LOG_RETENTION_DAYS=90` (optional; 7–730; default 90). **Not set on Railway** (the default applies).
- **Railway CLI** still not logged in; **`gh`** not installed; **eas-cli** 18.4.0.

## What We Tried (Chronological)

1. **Onboarding (paste prompt).** Read the parent handoff; `bd` missing. Live health 200. Read `mobile/src/hooks/useNetworkStatus.ts` (NetInfo only feeds the indicator, doesn't gate sign-in), `mobile/src/services/api/http.ts` (`apiFetch` plain fetch, `NetworkError` on throw, `ngrok-skip-browser-warning` header), `auth.api.ts` (`loginWithPassword` → `/v1/auth/login`), and `app/auth/login.tsx:166` `mapAuthError` (status undefined → `t.login.errorNetwork`; 400/401 → invalid credentials; else `t.common.error`). Conclusion: no Wi-Fi vs data code path.
2. **DNS check** for the mobile-data hypothesis: `nslookup` via 8.8.8.8 → A `153.52.255.112`, **no AAAA**. PH carriers are IPv6-heavy (464XLAT/CLAT), so an IPv4-only host was a candidate cause. Ranked causes: promo-only data > per-app data restriction > carrier can't reach the IPv4-only host > rate limit. Asked for the error text and a Chrome test of `/v1/health` on data.
3. **User answer: no load.** The health page failed in Chrome too → not an app bug. Then checked the important follow-on: does a signed-in user survive offline? Read `app/_layout.tsx` (redirect logic uses `isAuthenticated` from the store) and `auth.store.ts:54` (Secure Store only) → yes.
4. **Found the refresh bug** while reading `authed-fetch.ts`: `doRefresh()` had `catch { await logout(); return false; }`, so **any** failure, including a network drop, logged the user out. Checked the backend `POST /v1/auth/refresh` (`auth.controller.ts:143`): invalid or expired → `UnauthorizedException` (401); throttle burst 5/s, sustained 30/min. Checked the socket (`agap-socket.ts:74`): calls `refreshAccessToken()` once per server-disconnect episode and reconnects only if `ok`.
5. **Fix designed and implemented:** logout only on `ApiError` with status in {400, 401, 403}. NetworkError, 429, 5xx and SyntaxError (captive portal HTML through `JSON.parse`) all → `unreachable`, session kept. 13 new tests in `mobile/src/services/api/__tests__/authed-fetch-refresh.test.ts`. The user said "yes, make the refresh fix".
6. **Mobile jest broken:** every suite failed before running: `[BABEL]: Cannot find module '@babel/traverse'` from `react-native-worklets/plugin/index.js` (required by the `react-native-reanimated/plugin` Babel plugin). `@babel/traverse@7.29.8` **is** installed in `node_modules/.pnpm`, but pnpm doesn't hoist it to where the plugin resolves. **Workaround that worked:** `NODE_PATH` pointing at `node_modules/.pnpm/@babel+traverse@7.29.8/node_modules` → 5 targeted suites / 36 tests, then all 22 suites / 279 tests pass. Saved to memory. Not fixed in `package.json`.
7. **Push question:** the user asked "should i git push?" twice (after the mobile fix and after the admin work). Both times: checked `git log origin/main..HEAD`, explained that a push redeploys Railway + Vercel (backend restarts for about a minute), and said to push when nobody is testing and then check `/v1/health`. The user pushed both times.
8. **Admin request** ("make the system administration UI/UX Design more improvise and no hardcoded, specially on the Database, Redis, Storage, ensure that its actually tracking, and sms. and each pages that has a table ensure it has a pagination…"). Explored: `frontend/components/dashboard/AdminDashboard.tsx` (108 lines), `components/admin/HealthSections.tsx` (277), `AdminSections.tsx` (644), `backend/src/administration/system-health.service.ts`, the controller and module, `test/administration/health.spec.ts`.
9. **Findings from exploration:** DB = `SELECT 1`, Redis = `PING` (real but shallow, showing only "Healthy"); **no storage check at all**; SMS = only `configured` booleans + the newest failed BullMQ job (barangay alerts only, because ordinary SMS jobs swallow errors in `SmsProcessor.processSms`). **No outbound SMS record** except `incident_barangay_notices.sms_status` and `announcement_deliveries`. Pagination: Users, Audit, Security, ID Reviews had their own hand-built prev/next pagers; Config, Risk Areas and Barangays had none. Config listed `system_configurations` where `is_sensitive=false`, **which includes `fcm_token:<userId>` rows** (`notifications.service.ts:96 registerToken`) and `risk.hotspot_check.last_run`.
10. **SMS kind detection:** instead of editing every enqueue site, kinds come from the **BullMQ job name**, since every `smsQueue.add`/`addBulk` names its job. Mapped 12 job names (table in Evidence). Fallback: `noticeId` → BARANGAY_ALERT, `announcementDeliveryId` → ANNOUNCEMENT, else OTHER.
11. **Logging point:** wrapped `SmsProcessor.send(data, job)`, the single function that calls Textbee `POST /gateway/devices/{id}/send-sms`, used by `processSms`, `processCritical` and `processAnnouncement`. It records NOT_CONFIGURED (keys missing), FAILED (axios error; `gateway_status` = HTTP status, `error` = `describe(err)`, which never includes the API key), or ACCEPTED. `recordSmsAttempt` swallows its own errors (warns `Writing the SMS log row failed (...)`).
12. **Storage probe:** chose a small `StorageProbe` provider in `administration/` (own lazy `S3Client`, same env vars as `MediaService`, `maxAttempts: 1`) over importing `MediaModule` (avoids a module dependency and circular-import risk). `HeadBucketCommand` with a 4 s timeout (`STORAGE_CHECK_TIMEOUT_MS`). Provider name from the endpoint host; never returns the endpoint (an R2 endpoint contains the account ID) or the bucket name.
13. **Health test break:** the first run of `test/administration` → 1 failure: `health.spec.ts` "reports database, Redis, every queue and the integrations" did an exact `toEqual` on `integrations`. The new fields came back `null` because that mock prisma has only `$queryRaw`. Updated the expectation (null means "couldn't read", not zero). Wrote `health-metrics.spec.ts` (9 tests) and `sms-log.spec.ts` (13 tests).
14. **Chart colours (dataviz skill):** the first choice was brand green `#0D6053` vs danger `#CF3B4E` for accepted/failed → validator **FAILED** (protan CVD ΔE 2.4; green chroma 0.076 below floor). Green vs amber `#C96A00` passed CVD (14.4) but green still failed chroma. **Final: info blue `#2563EB` (accepted) + amber `#C96A00` (failed)**: all checks PASS (CVD ΔE 31.4, normal ΔE 36.5). The chart has a legend, value labels, hover tooltip and an `sr-only` table.
15. **Barangay Directory:** decided **not** to paginate (fixed list of Bocaue's 19 barangays in a master-detail layout; paging would hurt). Added a search box instead and told the user why.
16. **Frontend test break:** `__tests__/role-access.spec.ts` "sidebars match the agreed spec" pins the SYS_ADMIN nav labels → added `'SMS Activity'` between `'Integrations'` and `'Configuration'`. Then 26 suites / 254 pass; with the new `pagination.spec.ts`, 27 / 257.
17. **Local visual check attempted:** Docker Desktop not running, so no backend/frontend locally. Not started (heavy). The user verified live after deploy: "deploy done and dashboard shows real numbers".

## Key Decisions

- **Sign out only when the server refuses the refresh token** (400/401/403). Everything else (network, 429, 5xx, non-JSON) keeps the session. Rejected: keep logging out on any failure (signs citizens out in typhoon-time weak signal); retry loops inside `doRefresh` (the next 401 already retries; keeps it simple). Accepted edge case: if the refresh reached the server, rotated the token, and the response was lost, the old refresh token is now dead → the next refresh is 401 → logout. Same as before.
- **Socket on `unreachable`:** stays disconnected; screens poll REST every 15 s (`DISCONNECTED_POLL_MS`), and the next `connectSocket()` (`watchIncidentRoom`) reconnects. Rejected: forcing `s.connect()` with an expired token (server disconnects again; `retriedServerDisconnect` stops it anyway).
- **SMS log in PostgreSQL (`sms_log`), not Redis counters.** It's durable and paginable, which is what the user asked for ("ensure that its actually tracking"). Rejected: Redis INCR counters (lost on restart, no per-message list); Textbee stats API (an external call each refresh, unverified endpoint, can't show our kinds).
- **Privacy in the SMS log:** **no message text** (OTP codes), **last 4 digits only**, `error` scrubbed (`[number]`, `[redacted]` for 24+ char tokens, max 200 chars), `incident_id` stored but **never returned** (API returns `hasIncident: boolean`, per the CLAUDE.md "no internal DB IDs" rule). One row **per attempt** (retried critical jobs show `attempt` 2, 3).
- **Retention:** daily cron `30 3 * * *` (`sms-log-retention`), `SMS_LOG_RETENTION_DAYS` 7–730, default 90.
- **"ACCEPTED" is not "delivered".** Labelled honestly on the health card, the integrations page and the SMS page. Barangay/announcement delivery polling is unchanged and doesn't update `sms_log` (possible follow-up).
- **Health response stays backward compatible:** kept `database`/`redis` as `'ok'|'error'`; added `storage`, `details.{database,redis,storage}`, `checkDurationMs`, and optional SMS/push fields. The frontend types mark the new fields optional so an old backend doesn't break the new frontend during staggered deploys.
- **Missing metric = `null`, not 0.** Every extra query goes through `optional()` (2 s timeout, catch → null); the UI shows "—".
- **Config registry (`config-registry.ts`)** with `readBy` to label keys as "In use" or "Stored only". Rejected: wiring all seeded keys into real code now (big, risky; recorded as a follow-up). Hidden keys: prefix `fcm_token:` + `risk.hotspot_check.last_run`. `upsertConfig` refuses hidden keys and keys not matching `^[A-Za-z0-9_.-]{1,100}$`, and validates known keys by type/min/max (numbers sent as text are converted). Didn't block `is_sensitive` edits (kept previous behaviour).
- **Pagination:** one shared component (`components/ui/pagination.tsx`) with "Showing X–Y of N", page numbers (max 7 slots), rows-per-page (10/20/50/100). `keepPreviousData` added to the users, audit, ID-review, config and SMS queries so page changes don't flash a skeleton. Client-side `paginate()` for lists the server returns whole (Risk Areas).
- **Did not load `frontend-design`**: stayed in the existing AGAP design tokens (consistency over novelty). **Did load `dataviz`** for the chart (required by its rule).
- **Workflow:** the user commits and pushes. The assistant gives commands for both shells and never pushes. A docs-only push still redeploys Railway + Vercel, so commit now and push when nobody is testing.

## Evidence & Data

### Commits this session (all pushed by the user)

| Hash | Summary | Scope |
|---|---|---|
| `3a4b8ae` | docs(deploy): Phase 5 APK notes; Railway stale-deploy lesson | `docs/plans/DEPLOYMENT_PLAN.md` |
| `9e5e7d0` | fix(mobile): keep the session when a token refresh can't reach the server | `authed-fetch.ts`, `agap-socket.ts` (comment), new test (3 files, +137/−13) |
| `4cadca7` | feat(admin): measured health (DB, Redis, storage, SMS), SMS activity log, paginated admin tables, safe config page | 37 files, +2648/−395 (incl. migration) |
| this handoff | session: deployment-phase-5-admin-sms-tracking | `docs/handoff/…` |

### Mobile-data sign-in diagnosis

| Check | Result |
|---|---|
| Wi-Fi sign-in on the APK | works (user) |
| Mobile-data sign-in | fails (user) |
| Chrome `/v1/health` on mobile data | fails (user) |
| Cause | SIM had no load ("my mobile data does not have a load") |
| DNS A / AAAA (via 8.8.8.8) | `153.52.255.112` / none (IPv4-only host) |
| Remaining risk | carrier reaching the IPv4-only Railway host: test on a SIM with load |

### Refresh outcome matrix (`authed-fetch.ts`)

| Refresh result | `refreshSession()` | Logout? | `authedFetch` throws |
|---|---|---|---|
| tokens returned | `refreshed` | no | (retries the request with the new token) |
| no refresh token | `ended` | yes | `Session expired. Please log in again.` |
| ApiError 400 / 401 / 403 | `ended` | yes | same |
| NetworkError (fetch threw) | `unreachable` | **no** | `NetworkError` |
| ApiError 429 / 5xx | `unreachable` | **no** | `NetworkError` |
| SyntaxError (HTML portal page) | `unreachable` | **no** | `NetworkError` |
| other (e.g. SecureStore failure in `login`) | `unreachable` | **no** | `NetworkError` |

### Test runs

| Run | Result |
|---|---|
| mobile `npx jest src/services/api src/services/websocket src/stores` (no workaround) | 5 suites FAIL, 0 tests (`@babel/traverse`) |
| same, with NODE_PATH workaround | 5 / 5 suites, 36 / 36 tests |
| mobile full `npx jest` with workaround | 22 / 22 suites, 279 / 279 tests |
| mobile `tsc --noEmit -p tsconfig.json` | exit 0 |
| backend `tsc --noEmit -p tsconfig.json` (after `prisma generate`) | exit 0 |
| backend `test/administration` (first run) | 1 FAIL (`health.spec.ts` exact integrations shape), 3 suites pass, 65/66 incl. other picked suites |
| backend `test/administration` (after fix + new specs) | 4 / 4 suites, 34 / 34 tests |
| backend SMS-related: `announcement-sms-delivery.spec.ts`, `test/barangay-coordination`, `test/notifications` | 14 / 14 suites, 327 / 327 tests |
| backend eslint (changed files) | 0 errors, 40 warnings (`no-explicit-any` in tests) |
| frontend `tsc --noEmit -p tsconfig.json` | clean |
| frontend jest (first) | 1 FAIL `role-access.spec.ts` (new nav label), 25 pass, 253/254 |
| frontend jest (after spec update) | 26 / 26 suites, 254 / 254 |
| frontend `__tests__/pagination.spec.ts` | 3 / 3 |

### Chart palette validation (dataviz `validate_palette.js --mode light`)

| Pair | Chroma floor | CVD adjacent (protan) | Normal ΔE | Verdict |
|---|---|---|---|---|
| `#0D6053` green vs `#CF3B4E` red | FAIL (green 0.076) | FAIL ΔE 2.4 | 29.1 | rejected |
| `#0D6053` green vs `#C96A00` amber | FAIL (green) | PASS 14.4 | 27.3 | rejected |
| `#2563EB` blue vs `#C96A00` amber | PASS | PASS 31.4 (tritan 27.7) | 36.5 | **used** |

### SMS job name → kind (`backend/src/notifications/sms/sms-log.ts` `KIND_BY_JOB`)

| Job name | Enqueued in | Kind |
|---|---|---|
| `emergency-sms` | `emergency-alerts/ops-alert.service.ts:59` | OPS_ALERT |
| `barangay-alert-sms` | `barangay-coordination/barangay-notify.service.ts:604` (addBulk) | BARANGAY_ALERT |
| `barangay-followup-sms` | `barangay-notify.service.ts:420` (addBulk) | BARANGAY_ALERT |
| `barangay-reply-ack` | `barangay-reply.service.ts:283` | BARANGAY_REPLY |
| `citizen-sos-reply` | `emergency-alerts/sms-sos/citizen-sms-sos.service.ts:174` | SOS_REPLY |
| `contact-alert` | `emergency-contacts/emergency-contact-notification.service.ts:68` (addBulk) | CONTACT_ALERT |
| `emergency-contact-sms` | `jobs/processors/notification.processor.ts:120` | CONTACT_ALERT |
| `otp-sms` | `auth/auth.service.ts:366,668,859`, `auth/lockout/login-lockout.service.ts:93`, `auth/mfa/mfa.service.ts:209` | AUTH |
| `id-review-sms` | `identity-verification/id-review-notifier.ts:72` | ID_REVIEW |
| `announcement-sms` | `announcements/announcements.service.ts:482` | ANNOUNCEMENT |
| `sms-opt-out-confirm` | `announcements.service.ts:875` | ANNOUNCEMENT |
| `notification-sms` | `notification.processor.ts:44` | NOTIFICATION |
| (delivery-check jobs `barangay-sms-delivery-check`, `announcement-sms-delivery-check`, `BARANGAY_FOLLOWUP_JOB`) | `sms.processor.ts` | not sends → not logged |

### `sms_log` table (migration `20261124120000_sms_log`)

```sql
CREATE TABLE "sms_log" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(), "kind" VARCHAR(30) NOT NULL,
  "job_name" VARCHAR(60) NOT NULL, "recipient_last4" VARCHAR(4),
  "status" VARCHAR(20) NOT NULL,  -- CHECK IN ('ACCEPTED','FAILED','NOT_CONFIGURED')
  "gateway_status" SMALLINT, "error" VARCHAR(200), "attempt" SMALLINT NOT NULL DEFAULT 1,
  "chars" SMALLINT NOT NULL, "duration_ms" INTEGER, "incident_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(), PRIMARY KEY ("id"));
-- idx_sms_log_created (created_at DESC), idx_sms_log_status_created, idx_sms_log_kind_created
```

### New / changed API (all `@Roles(SYSTEM_ADMINISTRATOR)`, JWT)

| Route | Params | Returns |
|---|---|---|
| `GET /v1/administration/health` | — | old fields + `storage`, `details.{database,redis,storage}`, `integrations.sms.{last24h,lastAcceptedAt,inbound24h}`, `integrations.push.registeredDevices`, `checkDurationMs` |
| `GET /v1/administration/sms` | `page`, `perPage` (≤100, default 25), `status`, `kind`, `from`, `to` (bare date = whole day) | `{ data: SmsLogRow[], meta: {total,page,perPage,totalPages} }`; unknown status/kind → 400 |
| `GET /v1/administration/sms/summary` | — | `last24h`, `last7d` (accepted/failed/notConfigured/total), `byKind7d`, `daily` (7 UTC days), `inbound24h`, `lastAcceptedAt`, `lastAttemptAt` |
| `GET /v1/administration/config` | `page`, `perPage` (≤100, default 20), `search` (key or description, case-insensitive) | **paginated** (was a plain array); rows add `updated_by_name`, `label`, `value_type`, `min`, `max`, `unit`, `read_by` |
| `PUT /v1/administration/config/:key` | `{ value }` | now 400 for hidden keys / bad key pattern / type-range problems |

### Health measurements and tone thresholds (frontend `format.ts` `latencyTone`)

| Service | Source | Slow (warn) | Bad |
|---|---|---|---|
| Database | `SELECT 1` timed; `current_setting('server_version')`, `pg_database_size`, `pg_stat_activity` count, `max_connections`, `postgis_lib_version()` | 50 ms | 250 ms |
| Redis | `PING` timed; `INFO` (`redis_version`, `uptime_in_seconds`, `used_memory`, `maxmemory`, `maxmemory_policy`, `connected_clients`), `DBSIZE` | 25 ms | 150 ms |
| Storage | `HeadBucket` timed (4 s timeout); `incidentAttachment.aggregate` count + `file_size_bytes` sum | 400 ms | 1500 ms |
| Usage bars | connections, Redis memory | 80 % | 95 % |
| Eviction policy | warns if not `noeviction` (BullMQ needs it) | — | — |

### Config keys (registry `KNOWN_CONFIG`)

| Key | Type / range | Read by code? |
|---|---|---|
| `oversight.waiting_minutes` | number 1–240 minutes | **yes**: Supervisor oversight (unacknowledged incident alert) |
| `oversight.stale_location_minutes` | number 1–240 minutes | **yes**: Supervisor oversight (stale responder GPS) |
| `bocaue_river_critical_level_meters` | number 1–30 m | no |
| `sms_enabled` | boolean | no (description still says "Semaphore", outdated) |
| `default_language` | string | no |
| `sos_cancel_window_seconds` | number 0–120 s | no |
| `max_offline_queue_age_hours` | number 1–168 h | no |
| `eta_update_interval_seconds` | number 5–600 s | no |
| `duplicate_detection_radius_meters` | number 10–5000 m | no |
| `fcm_token:*`, `risk.hotspot_check.last_run` | — | hidden, edits refused |

### Mobile jest workaround (Git Bash, from `mobile/`)

```bash
NODE_PATH="$(cd ../node_modules/.pnpm/@babel+traverse@7.29.8/node_modules && pwd -W)" npx jest
# check the folder name first: ls ../node_modules/.pnpm | grep babel+traverse
#   → @babel+traverse@7.29.8 and @babel+traverse@7.29.8_supports-color@8.1.1
```

## Code Analysis

- **`mobile/src/services/api/authed-fetch.ts`:** `export type RefreshOutcome = 'refreshed' | 'ended' | 'unreachable'`; `SESSION_REFUSED = new Set([400, 401, 403])`; `doRefresh()`; `refreshSession()` dedupes concurrent calls through module-level `pendingRefresh`; `refreshAccessToken()` = `refreshSession().then(o => o === 'refreshed')`. `authedFetch(url, init)`: first fetch (NetworkError on throw); if status !== 401 return; else `refreshSession()` → `unreachable` → `throw new NetworkError()`, `ended` → `throw new Error('Session expired…')`, `refreshed` → refetch with the new token.
- **`backend/src/administration/system-health.service.ts`:** `SystemHealthService(prisma, config, @Inject(HEALTH_QUEUES) queues, @Optional() storageProbe?)`. Constants `HEALTH_CHECK_TIMEOUT_MS = 2000`, `STORAGE_CHECK_TIMEOUT_MS = 4000`. Private `timed(fn, ms)` → ms or null (min 1). `optional(fn)` → value or null. Exported helpers `parseRedisInfo`, `scrubReason`. `newest(a, b)` picks the later of the sms_log failure and the BullMQ failed job. Redis client = `await queues[0].client` (ioredis; `info()`/`dbsize()` optional-checked).
- **`backend/src/administration/storage-probe.ts`:** `StorageProbe.describe()` → `{configured, provider, localFallback}` (`configured` needs `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`); `headBucket()`; `storageProviderName(endpoint)` → 'Cloudflare R2' (`*.r2.cloudflarestorage.com`), 'Amazon S3', 'Local S3 (development)' (localhost/127.0.0.1/*.internal), 'S3-compatible', 'Not set'. `localFallback = STORAGE_LOCAL_FALLBACK !== 'false'` (same as MediaService).
- **`backend/src/administration/sms-activity.service.ts`:** `SMS_LOG_MAX_PER_PAGE = 100`; `list(query)`; `summary(now)` uses 3 `groupBy`s + a raw `date_trunc('day', created_at AT TIME ZONE 'UTC')` query + `barangay_sms_inbound.count`. Days are **UTC**, so the chart's day boundary is 08:00 Manila (possible follow-up).
- **`backend/src/notifications/sms/sms-log.ts`:** `SMS_LOG_KINDS` (10), `SMS_LOG_STATUSES` (3), `smsKindForJob`, `phoneLast4`, `scrubSmsError`, `recordSmsAttempt(prisma | undefined, entry)`. `incident_id` is kept only if UUID-shaped.
- **`backend/src/jobs/processors/sms.processor.ts`:** `send(data, job)` now logs every attempt; `message` is truncated to 160 (`slice(0,159)+'…'`, pre-existing) and `chars` = the sent length. `SmsProcessor` constructor: `(config, @Optional() barangayNotify, @Optional() smsQueue, @Optional() prisma)`; tests construct it with 4 args.
- **`backend/src/jobs/sms-log-retention.service.ts`:** `smsLogRetentionDays(raw)`; `@Cron('30 3 * * *', { name: 'sms-log-retention' }) prune(now)`. Registered in `JobsModule` providers (`ScheduleModule.forRoot()` already there).
- **`backend/src/administration/config-registry.ts`:** imports `OVERSIGHT_CONFIG` from `oversight/oversight.service.ts` and `LAST_RUN_KEY` from `risk-intelligence/hotspot-discovery.service.ts`. Exports `KNOWN_CONFIG`, `isHiddenConfigKey`, `HIDDEN_CONFIG_PREFIXES`, `HIDDEN_CONFIG_KEYS`, `CONFIG_KEY_PATTERN`, `configValueProblem`.
- **Frontend `components/ui/pagination.tsx`:** `Pagination({page,totalPages,total,perPage,onPageChange,onPerPageChange?,noun?,fetching?})` returns null when `total === 0`; `pageSlots(page,totalPages)` ≤ 7 slots; `paginate(rows,page,perPage)` clamps the page; `PAGE_SIZE_OPTIONS = [10,20,50,100]`. Exported from `components/ui/index.ts`.
- **Frontend `components/admin/HealthSections.tsx`:** `healthNeedsAttention(h)` now also flags `storage === 'error'`. `HealthTab` (overall banner, 4 `ServiceCard`s, `QueueTable` with Idle/Working/Has failures/Unreadable), `IntegrationsList` (SMS, Push with device count, Object storage, Maps). `QUEUE_LABELS` covers all 10 `QUEUE_NAMES` including `ai-assist`.

### Notes for the next agent (gap pass)

- **`frontend/components/dashboard/AdminDashboard.tsx` was NOT changed.** It still renders 3 StatCards (Staff accounts, Registered units, Hospitals & facilities) + `<HealthTab />` + "Newest accounts" (`useAdminUsers({ page: 1, perPage: 5 })`). The new health UI reaches it through `HealthTab`. The user had line 31 ("System Administration" heading) selected when asking.
- **Integrations page** (`app/(ops)/administration/integrations/page.tsx`) is unchanged as a shell; its content `IntegrationsList` now has 4 rows (SMS, Push, Object storage, Maps) with measured facts and an "SMS activity" link.
- **Other `useSystemHealth` consumers:** only `HealthSections.tsx` (grep of `useSystemHealth|healthNeedsAttention|SystemHealth` in `frontend/`). `DashboardBanners` doesn't read health.
- **`useAdminUsers` now uses `keepPreviousData`**, so the dashboard's "Newest accounts" is unaffected (one page).
- **Audit page** (`app/(ops)/audit/page.tsx`) still returns a whole-page skeleton only on the very first load (`isLoading`); later page changes keep data because of `keepPreviousData` in `features/audit/hooks.ts`. Roles: SUPERVISOR and SYSTEM_ADMINISTRATOR (`hasRole`).
- **Security Events** reuses `useAuditLog` with `action = SECURITY_ACTIONS.join(',')`, so the audit hook change covers it too.
- **SMS page refresh cadence:** `useSmsLog` and `useSmsSummary` `staleTime: 15_000`, `refetchInterval: 30_000`; health `refetchInterval: 60_000` (unchanged) + the "Check now" button calls `refetch()`.
- **Day labels in the SMS chart** are formatted with `timeZone: 'UTC'` to match the server's UTC day buckets (consistent, but not Manila days).
- **The mobile-data cause ranking given before the user's answer** (kept in case another tester hits it): 1) promo-only data (TikTok/FB-only bundles block general web), 2) Android per-app data / Data Saver, 3) carrier can't reach the IPv4-only Railway host, 4) per-IP rate limit (5 sign-ins/min; would show a generic error, not "no connection").
- **How to tell an app bug from a network problem in the field:** the login screen shows `t.login.errorNetwork` only when `fetch` throws (no HTTP response). Any other message means the server answered.

## Files Changed

### Source code (mobile, `9e5e7d0`)
- `mobile/src/services/api/authed-fetch.ts`: `RefreshOutcome`, `refreshSession`, logout only on refusal, NetworkError on unreachable.
- `mobile/src/services/websocket/agap-socket.ts`: comment only (unreachable refresh → REST polling, reconnect on the next `connectSocket()`).

### Source code (backend, `4cadca7`)
- `backend/prisma/schema.prisma`: `model sms_log` (before `barangay_sms_inbound`).
- `backend/prisma/migrations/20261124120000_sms_log/migration.sql`: new table + CHECK + 3 indexes.
- `backend/src/notifications/sms/sms-log.ts` (new): kinds, masking, recorder.
- `backend/src/jobs/processors/sms.processor.ts`: `send(data, job)` logs every attempt; 3 call sites pass `job`.
- `backend/src/jobs/sms-log-retention.service.ts` (new) + `backend/src/jobs/jobs.module.ts` (provider).
- `backend/src/administration/system-health.service.ts`: rewritten with measurements.
- `backend/src/administration/storage-probe.ts` (new).
- `backend/src/administration/sms-activity.service.ts` (new).
- `backend/src/administration/config-registry.ts` (new).
- `backend/src/administration/administration.service.ts`: paginated `getConfig`, guarded `upsertConfig`.
- `backend/src/administration/administration.controller.ts`: config query params; `GET sms`, `GET sms/summary`.
- `backend/src/administration/administration.module.ts`: `SmsActivityService`, `StorageProbe` providers.

### Source code (frontend, `4cadca7`)
- `frontend/components/ui/pagination.tsx` (new) + `frontend/components/ui/index.ts` export.
- `frontend/components/admin/format.ts` (new): `fmtBytes`, `fmtDuration`, `fmtNumber`, `fmtDateTime`, `fmtRelative`, `latencyTone`, `usageTone`, tone classes.
- `frontend/components/admin/HealthSections.tsx`: redesign (above).
- `frontend/components/admin/SmsActivity.tsx` (new): tiles, `DailyChart`, `KindBreakdown`, filters (result/kind/from/to), log table, pager. `SMS_KIND_LABELS`.
- `frontend/app/(ops)/administration/sms/page.tsx` (new).
- `frontend/components/admin/AdminSections.tsx`: new `ConfigTab` + `ConfigEditDialog` (typed editor, "In use"/"Stored only"), Users pager → `Pagination` with rows-per-page.
- `frontend/app/(ops)/audit/page.tsx`, `components/admin/SecurityEvents.tsx`, `components/admin/IdReviewQueue.tsx`: hand-built pagers → `Pagination` + rows-per-page; unused icon/`cn` imports removed.
- `frontend/components/admin/RiskAreasTab.tsx`: list pages client-side (10 per page); filters reset the page; map still shows all.
- `frontend/components/admin/BarangayDirectoryTab.tsx`: search box over the 19 barangays.
- `frontend/features/admin/api.ts`: new types (`DatabaseDetails`, `RedisDetails`, `StorageDetails`, `SmsCounts`, `SmsLogRow`, `SmsSummary`, `SMS_KINDS`, `SMS_STATUSES`, …), `fetchSystemConfig(params)` paginated, `fetchSmsLog`, `fetchSmsSummary`, `query()` helper.
- `frontend/features/admin/hooks.ts`: `useSystemConfig(params)`, `useSmsLog` (30 s refetch), `useSmsSummary`; `keepPreviousData` on users/config/SMS.
- `frontend/features/audit/hooks.ts`, `frontend/features/identity-verification/hooks.ts`: `keepPreviousData`.
- `frontend/lib/role-access.ts`: nav item `/administration/sms` "SMS Activity" (SYS_ADMIN; the `/administration` prefix guard already restricts it).
- `frontend/components/layout/Sidebar.tsx`: `MessageSquare` icon for `/administration/sms`.

### Tests
- `mobile/src/services/api/__tests__/authed-fetch-refresh.test.ts` (new, 13 tests).
- `backend/test/administration/health.spec.ts`: expectation updated for the new null fields.
- `backend/test/administration/health-metrics.spec.ts` (new, 9 tests): DB/Redis/storage measurements, storage error/not-configured/timeout, SMS counts and scrubbing, newest failure, INFO parsing, provider names, endpoint never leaked.
- `backend/test/administration/sms-log.spec.ts` (new, 13 tests): accepted/failed/not-configured rows, no OTP text, no API key, attempt number, log-write failure doesn't fail the SMS, kind mapping, list paging/caps/hidden incident ID, date filter, registry hiding and validation, retention bounds.
- `frontend/__tests__/role-access.spec.ts`: SYS_ADMIN sidebar spec includes 'SMS Activity'.
- `frontend/__tests__/pagination.spec.ts` (new, 3 tests).

### Config / docs
- `.env.example`: `SMS_LOG_RETENTION_DAYS=90` with a comment (SMS section).
- `docs/plans/DEPLOYMENT_PLAN.md` (`3a4b8ae`): Phase 5 notes block; "APK installs" ticked; mobile-data note; §3.5 "Deploy Latest Commit" row.

### Memory (outside repo)
- `C:\Users\githu\.claude\projects\c--Users-githu-Music-agap-emergency\memory\project-mobile-build-env.md`: added the mobile jest NODE_PATH workaround; `MEMORY.md` hook updated.

### Scratchpad (not needed again)
- `C:\Users\githu\AppData\Local\Temp\claude\b3f723b3e9521670\176f2d7c-9a89-438f-aae4-4e4e6bbdddc1\scratchpad\config-tab.tsx`: draft spliced into `AdminSections.tsx`.

## User Feedback & Preferences (REQUIRED — never omit)

- Started with the paste prompt: **narrate onboarding, then wait for go-ahead** ("Then wait for my go-ahead before executing"). The user replied "go ahead" plus the answer ("the health page also fails on data my mobile data does not have a load").
- Reported progress plainly: "I have now installed the preview apk and i can login. but cannot login using data wihtout internet… and the ocr works too."
- Approved the optional fix with a short "yes, make the refresh fix". The assistant **asked** whether to make it (needs a new APK); the user wants to be asked about scope expansions like that.
- **Asks "should i git push?" every time.** Wants a yes/no with the deploy consequences (Railway + Vercel redeploy, backend restart ~1 min, check `/v1/health`). **The user runs pushes and commits themselves.**
- Reports after pushing: "pushed, health is ok"; "pushed, deploy done and dashboard shows real numbers". Uses the given checklist.
- **Admin UI request, in their words:** "make the system administration UI/UX Design more improvise and no hardcoded, specially on the Database, Redis, Storage, ensure that its actually tracking, and sms. and each pages that has a table ensure it has a pagination so its more scalable. and on the Configuration, Audit logs, and so on". Priorities: **real tracking, not decoration**; **scalability (pagination)**; UX polish.
- Had `AdminDashboard.tsx` line 31 ("System Administration") selected in the IDE when asking; the dashboard is the entry point they look at.
- Ended the session with "I want you first to /handoff and close this session". The same habit as earlier sessions: handoff + paste prompt + close.
- Standing preferences carried over: phase by phase; click-by-click dashboard steps; secrets in Bitwarden; never repeat secrets; secret prompts with `Read-Host -AsSecureString`; give **both PowerShell and Git Bash** command forms (when they differ, e.g. quoting `'frontend/app/(ops)'`); the repo is **public**; $0 preference; free addresses (no domain yet).

## Where We're Going

1. **Confirm the two admin pages not yet checked by the user** (deployed): (a) **SMS Activity**: send one test SOS → an "Ops alert (MDRRMO)" row within ~30 s, `Accepted`, `•••• ` + last 4 of `MDRRMO_OPS_PHONE`. If `Failed`, read the error column. (b) **Configuration**: no `fcm_token:` rows; the two oversight timers show "In use".
2. **Phase 5 push check** (same SOS can serve): sign in on the APK as the demo citizen (Wi-Fi), allow notifications, send an SOS from the phone, **Acknowledge** it on the web console as a dispatcher → the phone should get an **"Incident updates"** notification. Then close the test incident (False alert / Cancelled). If none arrives: check Railway logs for `POST /v1/notifications/register-token` and the Health → Integrations "registered devices" count (should be ≥ 1 after sign-in).
3. **Build a new preview APK** to ship the refresh fix (`9e5e7d0`): `cd mobile; eas build --profile preview --platform android`. Uninstall the old APK first (same package), or install over it.
4. **Mobile-data sign-in on a SIM with load:** first `https://agap-emergency-production.up.railway.app/v1/health` in Chrome on data, then sign in. If health fails on a carrier that loads google.com → IPv4-only host issue (would need another host or a domain/proxy, and a new APK). Then tick the Phase 5 box in `DEPLOYMENT_PLAN.md`.
5. **Phase 6** end-to-end checks (plan list): guest SOS live on the map; ops SMS (now visible in SMS Activity); citizen SOS live status; dispatch → responder push; SMS fallback with data off (same incident on resend); every role signs in; passkeys on web + APK; photo upload → R2 (the Storage card now shows file count/size); `/b` barangay page; **`TRUST_PROXY` decision** (plan recommends `1`).
6. **Before a real pilot:** rotate the PostGIS and Redis passwords (procedure in the parent handoff's Open Questions).
7. **Optional follow-ups from this session:** fix mobile jest properly (add `@babel/traverse` as a mobile devDependency or `public-hoist-pattern`); wire the "Stored only" config keys into code or delete them; update the `sms_log` row on delivery-check results; Manila-time days in the SMS chart; check the Vercel Node version (22.x).

## Risks & Blockers

- **The installed APK still signs users out on a failed refresh** until a new APK is built and installed (step 3).
- **IPv4-only Railway host:** untested on Philippine carriers with load. If a carrier can't reach it, the fix means a new address and a new APK.
- **Railway can deploy stale code after a push** (seen once in the parent session). Verify with a behaviour only the new code has (e.g. the Storage card exists).
- **SMS log only covers sends after `4cadca7`.** Empty until the first SMS; no history.
- **Mobile jest is broken without the NODE_PATH workaround**: a future agent may think tests are failing for code reasons.
- **Backend jest suites time out under full-parallel load** on this laptop (from the parent handoff); rerun alone.

## Open Questions

- Does push registration and delivery work on the APK? (Phase 5 box, not tested yet.)
- Did the SMS Activity page show a real row after a test SOS? Does the Storage card show Cloudflare R2 with a response time? (The user only said "dashboard shows real numbers".)
- Can the user's carrier reach the IPv4-only Railway host with load? Which carrier/promo? (Asked, not answered.)
- Should the unused seeded config keys be wired into real behaviour (e.g. `duplicate_detection_radius_meters`, `sos_cancel_window_seconds`) or removed? (Not discussed with the user.)
- What exactly failed "last time" with ID OCR (parent question)? OCR works now; still unknown.

## Quick Start for Next Session

```bash
# Restore context (bd not installed)
# Reference docs
docs/plans/DEPLOYMENT_PLAN.md                               # Phase 5 notes + Phase 6 list
docs/handoff/2026-11-24_deployment-phase-5-eas-id-ocr.md    # parent
CLAUDE.md

# Key files to read first (not exhaustive, explore adjacent code too)
backend/src/administration/system-health.service.ts
backend/src/administration/sms-activity.service.ts
backend/src/jobs/processors/sms.processor.ts                # send(data, job) logs every attempt
frontend/components/admin/HealthSections.tsx
mobile/src/services/api/authed-fetch.ts                     # refresh outcomes

# Verify current state (read-only)
curl -s https://agap-emergency-production.up.railway.app/v1/health
git log --oneline -5                                        # expect 4cadca7 + this handoff commit on top

# Tests
cd backend && npx jest --config ./test/jest.config.ts test/administration
cd frontend && npx jest
cd mobile && NODE_PATH="$(cd ../node_modules/.pnpm/@babel+traverse@7.29.8/node_modules && pwd -W)" npx jest

# Next action
Ask the user for the SOS test result: (1) SMS Activity row, (2) "Incident updates" push on the APK.
Then have them build the new preview APK (refresh fix) and test sign-in on a SIM with load.
```

## Session Closed
**Closed at:** 2026-11-24 (local, ~13:30 GMT+8)
**Commit:** the `session: deployment-phase-5-admin-sms-tracking` commit that includes this note (not pushed: a push to main redeploys Railway and Vercel; the user pushes)
**Session status:** Handed off to next session
