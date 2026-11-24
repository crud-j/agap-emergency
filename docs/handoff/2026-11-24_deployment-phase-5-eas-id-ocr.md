# Deploying AGAP: Phase 5 (EAS preview APK) set up and building; ID-scan upside-down fix live on Railway

**Date:** 2026-11-24
**Status:** IN PROGRESS (Phases 1–4 done; Phase 5 APK build running on EAS at handoff time; Phase 6 to do)
**Bead(s):** none (`bd` is not installed: `bd: command not found`)
**Epic:** Deployment plan `docs/plans/DEPLOYMENT_PLAN.md`
**Chain:** `standalone-953e4889` seq `3`
**Parent:** `docs/handoff/2026-11-24_deployment-phases-3-4.md`
**Prior chain:** `docs/handoff/2026-11-24_deployment-phases-1-3.md` > `docs/handoff/2026-11-24_deployment-phases-3-4.md` > this

---

## Since Last Handoff

- Parent's "Where We're Going" step 1 (confirm the EAS preview signing fingerprint) **done**: preview keystore SHA-256 = `C9:A0:C6:1B:46:0C:E0:42:20:EF:D7:55:DC:77:C4:56:43:E8:EE:2F:78:9C:55:FB:DC:75:64:4B:22:10:66:48`, which is already the 2nd fingerprint on Railway → **no backend change needed**.
- Step 2 (check which `EXPO_PUBLIC_*` the app reads) **done**: 4 vars are read (`API_URL` ×18, `AGAP_SMS_NUMBER` ×2, `PASSKEY_RP_ID` ×2 but only in `app.config.js` for iOS, `WS_URL` ×1). `EXPO_PUBLIC_MAP_API_KEY` is **not read anywhere** (only "mapbox" in comments; maps are MapLibre).
- Step 3 (EAS env vars) **done, but differently than planned**: the `preview` environment **already had all five vars, pointing at the old ngrok address**. We overwrote three with `eas env:create … --force` (see Evidence). `EXPO_PUBLIC_AGAP_SMS_NUMBER` was already set (`+639755247821`), so the user never needed to supply it.
- Step 3's question "should `EXPO_PUBLIC_API_URL` include `/v1`?" **answered: no**. Every call already appends `/v1/...`.
- Step 4 (build) **in progress**: the user is running `eas build --profile preview --platform android` at handoff time ("i'm currently rebuilding the eas build as preview"). The build result was not seen in this session.
- **Unplanned detour (user request):** before building, the user asked to make sure PhilHealth / National ID OCR works ("last time it is not working"). Found and fixed a real bug: **upside-down (180°) ID photos were always unreadable**. Fix committed as `0ecf05c`, pushed, and **verified live on Railway** (both fake upside-down cards → 200).
- **New Railway gotcha:** the first deploy after pushing `0ecf05c` (deployment `6e1a8b91`, 10:26 GMT+8, "Build 00:10") still ran the **old code**. "Deploy Latest Commit" produced deployment `a07c1738` (container 02:37:57 UTC), which runs the fix.
- Parent's open questions answered by the user this session: admin **did** change its password at first sign-in; `REDIS_URL` on Railway **is** the reference `${{Redis.REDIS_URL}}`; Vercel Node version: **user not sure** (click path given, not checked).

## Related Handoffs

- `docs/handoff/2026-11-15_session-handoff.md`, `docs/handoff/2026-11-15_risk-pin-place-finding.md`, `docs/handoff/2026-11-15_risk-areas-pin-automation.md`: separate feature work streams (SMS, AI, risk areas), not this chain.

## Reference Documents

- `docs/plans/DEPLOYMENT_PLAN.md`: **the** plan. Phase 5 text still says `api.<domain>` and lists `EXPO_PUBLIC_MAP_API_KEY`; both are outdated (free addresses; map key unused). Phase 5 "Done when" boxes are **not ticked yet**. Not edited this session.
- `docs/plans/PHILHEALTH_ID_VERIFICATION_PLAN.md`, `docs/plans/NATIONAL_ID_VERIFICATION_PLAN.md`: ID verification design (plan §5.x referenced in code comments).
- `CLAUDE.md`: project rules (Rule 14: guest SOS never needs registration, so ID verification gates **account creation only**).
- Memory: `project-railway-gotchas.md` (updated this session with the stale-deploy gotcha and the scan-log tip), `feedback-git-bash-commits.md` (give BOTH PowerShell and Git Bash commit forms), `project-backend-test-run.md` (jest command + load-timeout flakes), `project-mobile-build-env.md` (no local JDK; EAS cloud builds).

## The Goal

Run AGAP without the laptop for demos and pilot testing (school project; the user is a student). Web console on **Vercel** (`agap-emergency.vercel.app`), NestJS backend + PostGIS + Redis on **Railway** (`agap-emergency-production.up.railway.app`, Trial, Singapore), files on private **Cloudflare R2**, and an **EAS preview APK** for Android phones pointing at the Railway backend. The user works phase by phase with click-by-click dashboard steps, keeps secrets in **Bitwarden** ("AGAP Deployment"), and wants $0 where possible. Phase 5 = APK; Phase 6 = end-to-end checks on the deployed system (incl. the `TRUST_PROXY` decision). Citizen registration needs a PhilHealth or National ID scan read **on the server**; that path must work on Railway before real testers register.

## Where We Are

- **Backend live:** `https://agap-emergency-production.up.railway.app`, `/v1/health` 200 (checked 01:32 UTC). Active deployment **`a07c1738`** (container start 02:37:57 UTC) runs commit `0ecf05c`. Its logs show `postgis.railway.internal:5432`, `41 migrations found`, `No pending migrations to apply.`, `Firebase Admin initialized`, `Database connection established`, `Nest application successfully started`, `BarangaySmsPoller … every 15 s`, and a DISPATCHER WebSocket at 02:44 (`joined ops:all`).
- **Web live:** `https://agap-emergency.vercel.app/login` 200 (checked 01:32 UTC).
- **assetlinks.json** (`/.well-known/assetlinks.json`): package `com.agap.emergency`, 2 fingerprints `D8:F4:C5:17:…:31:75` and `C9:A0:C6:1B:…:66:48`. The EAS preview keystore = the second → passkeys on the APK should verify without backend changes.
- **EAS `preview` environment (project `@catchy-sql/agap-emergency`), current values:**
  - `EXPO_PUBLIC_API_URL=https://agap-emergency-production.up.railway.app` (changed from ngrok)
  - `EXPO_PUBLIC_WS_URL=wss://agap-emergency-production.up.railway.app` (changed from ngrok)
  - `EXPO_PUBLIC_PASSKEY_RP_ID=agap-emergency-production.up.railway.app` (changed from ngrok)
  - `EXPO_PUBLIC_AGAP_SMS_NUMBER=+639755247821` (already set; Textbee SIM; not secret)
  - `EXPO_PUBLIC_MAP_API_KEY=<Mapbox pk token>` (left as is; unused by code)
- **EAS preview build:** being run by the user at handoff time. Result unknown.
- **EAS credentials (Android, preview):** Build Credentials `IxfZP7a11k (Default)`, JKS keystore, alias `a3156787643d95181f9ac862c904b41a`, SHA-1 `94:5C:3C:E8:…:CA:1D`, SHA-256 `C9:A0:C6:1B:…:66:48`, updated "1 month ago". FCM V1 / FCM Legacy: "None assigned yet". **Not needed** (explained in Key Decisions).
- **`mobile/android` is committed to git**, so EAS builds from it (warning: "android.package in app.config.js … ignored because an android directory was detected"). The folder was last changed 2026-10-22 (`16ced46`). `app.json` changes since then are iOS-only (camera text + `react-native-document-scanner-plugin`, whose config plugin only edits `Info.plist`). Android manifest already has CAMERA, location, INTERNET. **No prebuild needed.**
- **ID-scan fix live:** fake PhilHealth and National ID cards turned 180° → both **200** on Railway at 02:45 UTC (4.2 s, 4.0 s). Upright PhilHealth → 200 in 2.6 s.
- **Backend tests:** `test/identity-verification` → **403 tests**, all pass when each suite runs alone. Under full-parallel load several suites time out (known flake, see Evidence).
- **Typecheck:** `backend` `tsc --noEmit -p tsconfig.json` exit 0 after the fix. ESLint on the 3 changed files: exit 0.
- **Storage:** all phone uploads (incident photos, ID scans, profile photos) go to the backend, which writes to **R2**. Proven: ID scans returned 200 while `STORAGE_LOCAL_FALLBACK=false`, and `putPrivateObject` throws 503 on R2 failure unless the fallback is on. The phone keeps only Secure Store login, settings and the responder transport outbox; captured images are deleted after upload.
- **Git:** `main` = `origin/main` at `0ecf05c` (the parent's handoff commit `e6bc831` was pushed with it). Uncommitted, **not ours, leave alone:** `frontend/tsconfig.tsbuildinfo`, `docs/presentation/Justine_Soliman_IPO_Report.md`.
- **Railway CLI** 4.11.1 installed but **not logged in** (`Unauthorized`), not linked. **eas-cli** 18.4.0 global (27.11.0 available; deliberately not upgraded mid-phase). **GitHub CLI `gh` not installed.**
- **Fake test data left in production:** 5 unclaimed `identity_verifications` rows with fake names/PINs (2 at ~02:0x UTC, 3 at 02:45 UTC) plus their sealed images in R2 under `id-documents/<id>`. 422 refusals create no row. Claims expire after 30 min (`ID_SCAN_CLAIM_TTL_MINUTES`); the cleanup job deletes the images. Unclaimed rows don't block real cards (`pin_hmac` uniqueness only counts rows with `user_id`).

## What We Tried (Chronological)

1. **Onboarding.** Read parent; `bd` absent. Live checks: health 200, assetlinks OK, Vercel `/login` 200. Read `mobile/eas.json`, `mobile/app.config.js`, grepped `EXPO_PUBLIC_*` usage, read `webauthn.service.ts` (RP ID choice), `.gitignore` for mobile env files, the WebSocket client, map components. Findings: no `/v1` in API_URL; MAP key unused; PASSKEY_RP_ID iOS-only; `mobile/.env*` gitignored so EAS never sees them.
2. **EAS env check** (`eas env:list --environment preview`). First attempt failed: `--non-interactive` doesn't exist on `env:list` in eas-cli 18.4. Without the flag it listed **5 existing vars pointing at `gush-coliseum-subgroup.ngrok-free.dev`**. Had planned `env:create`; switched to `env:create --force` (overwrites; help confirmed `--force  Overwrite existing variable`). Output said "Created a new variable" ×3, but the re-list showed the new values and the ngrok values gone.
3. **Railway CLI probe.** `railway whoami` → `Unauthorized`; `railway status` → no linked project. Used only for the password-rotation answer (`railway ssh` exists).
4. **Fingerprint.** User ran `eas credentials` → Android → preview and pasted the output. SHA-256 matched Railway's second fingerprint. Also noticed "FCM V1 None assigned" and the "android directory detected" warning; investigated both before letting the build go (step 5).
5. **Push + native-folder check.** `push-registration.ts:39` uses `Notifications.getDevicePushTokenAsync()` (raw FCM token) and the backend sends through Firebase Admin, so no EAS FCM key is needed. `google-services.json` `project_id` = `agap-emergency` in both `mobile/` and `mobile/android/app/`, matching the backend `FIREBASE_PROJECT_ID`. Diffed `app.json` since `16ced46`: only iOS-related changes. Read the document-scanner plugin (`expo-plugin/build/withDocumentScanner.js`): `withInfoPlist` only. Verdict: safe to build.
6. **User asked for an OCR check before building** ("ensure that the tesseract ocr of the Philhealth and national ID is working properly, because last time it is not working"). Mapped the flow: phone document scanner (ML Kit) → on-device ML Kit text (`clientText`, never trusted) → downscale/JPEG → `POST /v1/auth/id-verification` (multipart, public, throttled 5/min) → server `readCard` (tesseract.js 7.0.0 with bundled `@tesseract.js-data/eng` `4.0.0_best_int`, LSTM only, no CDN) → parse → seal image → R2 → unclaimed row + claim token.
7. **Existing tests:** 13 suites / 399 tests passed, but tesseract is **mocked** in them (`jest.mock('tesseract.js')`), so they prove logic, not OCR.
8. **Real tesseract locally on synthetic cards.** Script `make-and-read.js` drew fake PhilHealth + National ID cards (sharp SVG, Arial; name DELA CRUZ, JUAN SANTOS; PIN `12-345678901-2`; PCN `1234-5678-9012-3456`) and read them with the same worker config: both parsed fully (heading, number, 3 name parts), confidence 94 / 93, ~0.65 s each.
9. **Same clean cards against live Railway** (`curl -F image=@…;type=image/jpeg`, `consentGiven=true`, lat/lng 14.7963,120.9272, `attemptNumber=1`): both **200** (4.8 s, 4.1 s), name + last-4 correct. This proved tesseract, the encryption keys and R2 all work in the container.
10. **Heavily damaged cards** (`degrade.js`: blur 1.6, brightness 0.75, linear 0.7/+20, noise ±30, JPEG q55, 4° tilt). First version: sharp kept only the last `.rotate()` in a chain, so the 180°/90° turn was silently dropped. Fixed by turning in a separate pipeline. Railway → 422 UNREADABLE in ~3 s each. Ran the **real `IdentityVerificationService.scan()` locally** with stubbed prisma/crypto/media (`local-scan.ts`): also UNREADABLE after all 10 reads (confidence 24–40), so the photo was too damaged and Railway was not at fault.
11. **Medium damage** (`degrade-mid.js`: blur 0.8, noise ±10, q72, brightness 0.9; PhilHealth 180°, National 90°). National: `turned=270` correct, name read, card number lost a digit (`4-4-4-3`) → quality limit. PhilHealth 180°: `turned=0`, every read empty → suspected rotation gap.
12. **Clean card, upside down** (`philhealth-180.jpg`, `national-180.jpg`): both UNREADABLE locally. **Root cause confirmed:** `QuarterTurn = 0 | 90 | 270` and `chooseTurn` only runs for portrait images, so a landscape image is never tried at 180°. The phone doesn't rotate the upload either.
13. **Fix implemented** (details in Code Analysis). After the fix, locally: philhealth-180 OK in 1.77 s, national-180 OK in 2.54 s, upright unchanged (0.34 s / 0.77 s). Medium-damage PhilHealth now shows `turned=180` but still fails; the same damage **upright** (`philhealth-midup.jpg`) also fails in 4.8 s, so that's photo quality, not rotation.
14. **Tests.** Two old tests broke (they count OCR calls; the 180° read is a new call) → updated. Added 4 tests. Full-folder runs showed timeouts under load in different suites each time (`id-cleaned-reads` fallback test 406 ms alone; `id-release`, `id-register`, `id-rescan`, `id-review`, `id-national`); every one passed when rerun alone. Prettier flags all 3 files, but they were already unformatted at HEAD (house style, long lines) → left alone.
15. **User pushed `0ecf05c`.** Live test at ~02:28 and 02:32 UTC: upside-down cards still 422 in 2–4 s. The user's Railway log line (02:28:22 UTC) showed `cleaned=yes turned=0` **without `(180 tried)`**, proving old code was running. The deploy page showed `6e1a8b91` Active with **Build 00:10**. Checked the Dockerfile/.dockerignore/`prebuild` (clean-dist) for a stale `dist`: all correct. Couldn't check GitHub CI (`gh` missing).
16. **User ran "Deploy Latest Commit"** → deployment `a07c1738` → live test at 02:45:09 UTC: both upside-down cards **200**. Saved the gotcha to memory.

## Key Decisions

- **Overwrite EAS `preview` vars with `--force`** instead of `env:update` (simpler flags in eas-cli 18.4; same result). Left `EXPO_PUBLIC_MAP_API_KEY` in place (unused, harmless). Rejected: deleting it (no benefit).
- **`EXPO_PUBLIC_API_URL` without `/v1`**, because callers build `${API_BASE}/v1/...`.
- **Keep `EXPO_PUBLIC_PASSKEY_RP_ID`** even though Android ignores it (only `app.config.js` uses it for iOS `webcredentials:`). On Android the backend picks the RP ID (`_rpIDFor(origin)` → first entry of `WEBAUTHN_RP_ID` = Railway host).
- **No EAS FCM V1 key:** the app registers the raw FCM device token and the backend sends via Firebase Admin. Rejected: uploading a service-account key to EAS (only needed for the Expo push service).
- **No prebuild / no `android/` regeneration** before this build: post-`16ced46` `app.json` changes are iOS-only. Rejected: deleting `mobile/android` (risky, changes build mode).
- **Don't upgrade eas-cli mid-phase** (18.4 → 27.11 is a big jump).
- **OCR verification with synthetic fake cards, never real IDs** (personal data; repo `ocr-spike.ts` refuses folders inside the repo for the same reason). Fake cards were sent to **production** (creates unclaimed rows that expire); accepted as low risk for a demo deployment.
- **180° fix design:** one extra cleaned read at 180°, **only** for a landscape image whose first read (PhilHealth: raw/block; National: first cleaned pair) saw **no heading**, at most once per scan; if it sees the heading → drop all reads and restart the stages on the turned image; else drop the probe read (not added to `reads`, so it can't vote or supply a number). Rejected: (a) an always-on 180° read up front (adds ~1 s to every scan, including good ones); (b) running the whole pipeline first and flipping at the end (the 12 s `SCAN_READ_BUDGET_MS` would be spent before the flip); (c) Tesseract OSD orientation detection (needs `osd.traineddata`, not bundled); (d) keeping a failed probe read as `confirmOnly` (risk of unexpected voting effects).
- **Report the turn as `turned=180`** and `turned=0(180 tried)` in the existing "second read" log line, so Railway logs show which code runs. No names/numbers added to logs.
- **The APK build doesn't wait for backend fixes:** OCR is server-side; a backend push fixes it for all installed APKs.
- **PostGIS/Redis password rotation: deferred** to before a real pilot (both private-only). The procedure was explained, not run.

## Evidence & Data

### Commits (this session)

| Hash | Summary | Files | Pushed |
|---|---|---|---|
| `0ecf05c` | fix(id-verification): read ID cards photographed upside down | `backend/src/identity-verification/identity-verification.service.ts` (+79/−?), `backend/src/identity-verification/id-image-prep.ts` (+7), `backend/test/identity-verification/id-cleaned-reads.spec.ts` (+74) | yes (with `e6bc831`) |

`git diff --stat` before commit: 3 files, 131 insertions, 29 deletions (excluding `frontend/tsconfig.tsbuildinfo`).

### EAS env, preview: before → after

| Var | Before | After |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | `https://gush-coliseum-subgroup.ngrok-free.dev` | `https://agap-emergency-production.up.railway.app` |
| `EXPO_PUBLIC_WS_URL` | `wss://gush-coliseum-subgroup.ngrok-free.dev` | `wss://agap-emergency-production.up.railway.app` |
| `EXPO_PUBLIC_PASSKEY_RP_ID` | `gush-coliseum-subgroup.ngrok-free.dev` | `agap-emergency-production.up.railway.app` |
| `EXPO_PUBLIC_AGAP_SMS_NUMBER` | `+639755247821` | unchanged |
| `EXPO_PUBLIC_MAP_API_KEY` | Mapbox `pk.` token | unchanged (unused) |

Command used (Git Bash): `eas env:create --environment preview --name "$n" --value "$v" --visibility plaintext --force --non-interactive`.

### EAS Android build history (before this session's build)

| Created (UTC) | Profile | Status | Commit |
|---|---|---|---|
| 2026-11-16 03:12 | preview | FINISHED | `1c87c43` |
| 2026-11-15 07:20 | preview | FINISHED | `1c87c43` |
| 2026-11-11 05:32 | preview | FINISHED | `213396b` |
| 2026-11-09 14:10 | development | FINISHED | `2902a79` |
| 2026-11-09 00:20 | preview | FINISHED | `2902a79` |
| 2026-11-05 08:43 | development | FINISHED | `a8b80bf` |
| 2026-11-05 04:51 | development | FINISHED | `0dff240` |
| 2026-11-02 12:33 | preview | FINISHED | `2870f70` |

All app version `0.1.0`, build `1`. The ID scanner native modules were added 2026-11-05, so builds from 11-05 on contain them. Those preview builds pointed at **ngrok**.

### OCR test matrix (fake cards; scratchpad files)

| Image | Where | Code | Result | Time |
|---|---|---|---|---|
| `philhealth.jpg` (clean) | local tesseract only | worker | parsed, conf 94 | 686 ms |
| `national.jpg` (clean) | local tesseract only | worker | parsed, conf 93 | 633 ms |
| `philhealth.jpg` | Railway | old | 200, pinLast4 9012 | 4.76 s |
| `national.jpg` | Railway | old | 200, pinLast4 3456 | 4.06 s |
| `philhealth-bad.jpg` (heavy) | Railway | old | 422 UNREADABLE | 3.41 s |
| `national-bad.jpg` (heavy, 90°) | Railway | old | 422 UNREADABLE | 2.99 s |
| `philhealth-bad.jpg` | local `scan()` | old | 422 (10 reads, conf 24–40) | 10.6 s |
| `national-bad.jpg` | local `scan()` | old | 422 (turned=270, heading seen) | 7.0 s |
| `philhealth-mid.jpg` (180°) | local `scan()` | old | 422, turned=0 | 7.8 s |
| `national-mid.jpg` (90°) | local `scan()` | old | 422, turned=270, name OK, number `4-4-4-3` | 7.1 s |
| `philhealth-180.jpg` (clean) | local `scan()` | old | **422** | 6.6 s |
| `national-180.jpg` (clean) | local `scan()` | old | **422** | 7.6 s |
| `philhealth-180.jpg` | local `scan()` | **new** | **OK** | 1.77 s |
| `national-180.jpg` | local `scan()` | **new** | **OK** | 2.54 s |
| `philhealth.jpg` / `national.jpg` | local `scan()` | new | OK | 0.34 / 0.77 s |
| `philhealth-mid.jpg` | local `scan()` | new | 422, turned=180 (quality) | 4.9 s |
| `philhealth-midup.jpg` (same damage, upright) | local `scan()` | new | 422 (quality) | 4.8 s |
| `philhealth-180.jpg` | Railway `6e1a8b91` | old (stale deploy) | 422 | 3.85 s / 2.20 s |
| `national-180.jpg` | Railway `6e1a8b91` | old (stale deploy) | 422 | 3.61 s / 2.75 s |
| `philhealth-180.jpg` | Railway `a07c1738` | **new** | **200** | 4.17 s |
| `national-180.jpg` | Railway `a07c1738` | **new** | **200** | 4.01 s |
| `philhealth.jpg` | Railway `a07c1738` | new | 200 | 2.60 s |

### Railway log line that proved the stale deploy (02:28:22 UTC, PHILHEALTH, abridged)

```
ID scan needed a second read (PHILHEALTH): phone=none conflict=false cleaned=yes turned=0 nameVotes=none
raw/block[conf=37 …] raw/auto[conf=35 …] clean/block[conf=37 …] clean/auto[conf=35 …] binary/block[conf=38 …]
binary/auto[conf=36 …] clean@1.3/block[conf=30 …] clean@1.3/auto[conf=34 …] binary@1.3/block[conf=35 …]
binary@1.3/auto[conf=38 …] nameColumn[not run] outcome=UNREADABLE
```
No `(180 tried)` → old code. `cleaned=yes` → sharp/cleanup works on Railway. 10 reads ran in under ~4 s, so Railway CPU is fast enough. The National line (02:28:26) is the same: `turned=0`, 10 reads, all `heading=false`.

### Railway deployments this session

| Deployment | Started (UTC) | Build | Code | Notes |
|---|---|---|---|---|
| `6e1a8b91` | ~02:26–02:27 | 00:10 | **old** (no 180°) | triggered by push of `e6bc831`+`0ecf05c`; Deploy 00:40 |
| `a07c1738` | 02:37:57 | (not reported) | **new** `0ecf05c` | via "Deploy Latest Commit"; verified 02:45 |

### Test runs

| Run | Result |
|---|---|
| ID folder, before change | 13/13 suites, 399/399 tests |
| ID folder, after change, default workers | 8 suites FAIL (timeouts under load); `id-cleaned-reads` 2 failures before test updates |
| `id-cleaned-reads` alone, after updates | 23/23 (slowest 406 ms) |
| `id-release` / `id-register` / `id-rescan` / `id-review` alone | 12/12, 15/15, 25/25, 30/30 |
| ID folder, `--maxWorkers=2` | 401/403 (`id-national`, `id-register` timeouts) |
| `id-national` / `id-register` alone | 105/105, 15/15 |
| `tsc --noEmit -p backend/tsconfig.json` | exit 0 |
| eslint on 3 changed files | exit 0 |

### Scratchpad test tools (session scratchpad, may be wiped; recreate from this description)

`C:\Users\githu\AppData\Local\Temp\claude\b3f723b3e9521670\793364b2-3255-4a6e-a7f5-67413dc3a330\scratchpad\ocr-check\`
- `make-and-read.js <repo>`: draws `philhealth.jpg` + `national.jpg` (1012×638, sharp SVG, Arial) and reads them with the backend's tesseract config + `@agap/shared` parsers.
- `degrade.js` / `degrade-mid.js` / `degrade-midup.js <repo>`: produce `*-bad.jpg`, `*-mid.jpg`, `*-midup.jpg`.
- `local-scan.ts`: runs the real `IdentityVerificationService.scan()` with stubbed prisma/crypto/media. Run from `backend/`: `TS_NODE_PROJECT=tsconfig.json npx ts-node --transpile-only <path>/local-scan.ts <img> <TYPE> …` (without `TS_NODE_PROJECT` it fails with TS5109 moduleResolution).
- `philhealth-180.jpg`, `national-180.jpg`: clean cards rotated 180° (`sharp(...).rotate(180)`).

Live test command (Git Bash, from the scratchpad folder):
```bash
curl -s -X POST https://agap-emergency-production.up.railway.app/v1/auth/id-verification \
  -F "image=@philhealth-180.jpg;type=image/jpeg" --form-string "documentType=PHILHEALTH" \
  --form-string "consentGiven=true" --form-string "latitude=14.7963" --form-string "longitude=120.9272" \
  --form-string "attemptNumber=1"
```
Throttle: 5/min burst, 10/15 min sustained per IP. Mask the `token` in output.

### Other facts checked this session (saves re-checking)

| Fact | Value / where |
|---|---|
| ID scan endpoint | `POST /v1/auth/id-verification`, `@Public()`, multipart field `image` (JPEG/PNG ≤ 2 MB), body `documentType` (`PHILHEALTH` default / `NATIONAL_ID`), `consentGiven` (must be true, else `CONSENT_REQUIRED` 400), `latitude`/`longitude` (geo-fence, else `OUTSIDE_SERVICE_AREA` 400), optional `clientText`, `attemptNumber`, `requestReview` |
| Geo-fence test point | `14.7963, 120.9272` passes the Bocaue geo-fence on Railway |
| Success response shape | `{ token, nameOnId: {last, first, middle}, pinLast4, reviewRequired, documentType }` (token = claim token, mask it) |
| Refusal shape | `{ statusCode: 422, code: "UNREADABLE", message: "We couldn't read your PhilHealth ID. Hold it flat, avoid glare, and try again." }` |
| Mobile env files | `mobile/.env` (API_URL, WS_URL, MAP_API_KEY, PASSKEY_RP_ID), `mobile/.env.local` (API_URL), `mobile/.env.development` (`EXPO_PUBLIC_DEV_SKIP_GEO_FENCE`, not read in code); all gitignored → never uploaded to EAS |
| `mobile/eas.json` | `development` has no `environment` key; `preview` = `environment: preview`, `distribution: internal`, `buildType: apk`, node 22.14.0, pnpm 11.1.1; `appVersionSource: remote` |
| WS client | `mobile/src/services/websocket/agap-socket.ts`: `WS_BASE = EXPO_PUBLIC_WS_URL ?? 'ws://localhost:3000'`; REST poll every 15 s while the socket is down |
| Backend Docker | `node:22-bookworm-slim`; `.dockerignore` excludes `**/dist`, `**/node_modules`, `.git`; `prebuild` = `node scripts/clean-dist.js`; `nest-cli.json` `deleteOutDir: false`; build stage `COPY . .` → `pnpm --filter @agap/shared build` → `pnpm db:generate` → `pnpm build` |
| sharp on Linux | lockfile has `@img/sharp-linux-x64@0.35.5` + `@img/sharp-libvips-linux-x64@1.3.4`; `allowBuilds: sharp: false` (prebuilt binary); Railway log `cleaned=yes` confirms it works |
| OCR deps | backend `tesseract.js` 7.0.0, `@tesseract.js-data/eng` 1.0.0, `sharp` 0.35.5; mobile `@react-native-ml-kit/text-recognition` 2.0.0, `react-native-document-scanner-plugin` 2.0.4 |
| Firebase project | `agap-emergency` in both `google-services.json` files = backend `FIREBASE_PROJECT_ID` |
| Tools on this PC | eas-cli 18.4.0 (logged in as `catchy-sql`, also teams `catchy-sqls-team`, `crud-devs-team`); railway 4.11.1 (not logged in); `gh` missing; Node 24.18 |

### Click paths given this session

| Need | Where |
|---|---|
| EAS signing fingerprint | `cd mobile; eas credentials` → Android → preview → read "SHA256 Fingerprint" → Exit |
| Railway log search | Railway → agap-emergency → Deployments → latest → View logs → search `second read` |
| Force Railway to build the newest commit | Railway → agap-emergency box → **Ctrl+K** → "Deploy Latest Commit" (plain **Redeploy** reuses the same image) |
| Alternative trigger | empty commit: `git commit --allow-empty -m "chore(deploy): rebuild backend …"` + push (both shells) |
| Vercel Node version | Vercel → project → Settings → Build and Deployment → Node.js Version (22.x) |
| Verify a deploy really changed | Build step should take minutes, not 00:10; send a request only the new code answers differently |

### Fake card content (for regenerating)

PhilHealth: `REPUBLIC OF THE PHILIPPINES` / `PHILIPPINE HEALTH INSURANCE CORPORATION` / `PhilHealth` / `12-345678901-2` / `DELA CRUZ, JUAN SANTOS` / `JANUARY 01, 1990 - MALE` / `123 SAMPLE STREET, TURO, BOCAUE, BULACAN`; grey photo box at left.
National ID: `REPUBLIKA NG PILIPINAS` / `Republic of the Philippines` / `PAMBANSANG PAGKAKAKILANLAN` / `Philippine Identification Card` / `1234-5678-9012-3456` (top-left) / right column (x≥450 of 1012): `Apelyido/Last Name` `DELA CRUZ`, `Mga Pangalan/Given Names` `JUAN`, `Gitnang Apelyido/Middle Name` `SANTOS`, `Petsa ng Kapanganakan/Date of Birth` `JANUARY 01, 1990`, `Tirahan/Address` …

## Code Analysis

- **`backend/src/identity-verification/identity-verification.service.ts` `readCard(image, rules, documentType)`** now returns `{ reads, prepared, turn, halfTurnTried }`. New closure `turnedHalfway()`: returns false if `halfTurnTried || !upright || upright.portrait || headingSeen() || overBudget()`; else sets `halfTurnTried = true`, `turnIdImage(upright.upright, 180)` → `prepareIdImage(turned)` → `ocr.read(candidate.clean, 'block', undefined, CLEANED_READ_TIMEOUT_MS)`; if `rules.hasHeading(read.text)` → `upright = { upright: turned, portrait: false }`, `raw = turned`, `reads.length = 0`, `prepared = null`, `cleanedFailed = false`, `halfTurned = true`, return true.
  - `rawStage()` now returns boolean; calls `turnedHalfway()` right after `raw/block` (only if that read is non-null), before `raw/auto`.
  - `cleanedStage(scale)` returns boolean; after each successful pair, `if (scale === 1 && await turnedHalfway()) return true` (the guard makes it run once, after the first pair).
  - `stages()` wraps the old order (National: cleaned 1× → cleaned 1.3× → raw if no heading; PhilHealth: raw → cleaned 1× → cleaned 1.3×) and returns true on restart; `if (await stages()) await stages();` (at most one restart). The returned `turn` is `halfTurned ? 180 : turn`.
  - `scan()` log line: `turned=${turn}${halfTurnTried && turn !== 180 ? '(180 tried)' : ''}`.
- **`id-image-prep.ts`:** `QuarterTurn = 0 | 90 | 270` is unchanged; `turnIdImage(image, turn: QuarterTurn | 180)`. `uprightIdImage` applies EXIF only and reports `portrait: height > width`. `prepareIdImage(upright, turn=0, scale=1)` makes grey "clean" (brightest channel, lighting flattened by blur σ=max(8, short side/40), paper level 235) + Otsu "binary" PNGs with DPI from card width 85.6 mm.
- **Constants:** `OCR_TIMEOUT_MS = 20_000` (id-ocr.service), `CLEANED_READ_TIMEOUT_MS = 8_000`, `SCAN_READ_BUDGET_MS = 12_000`, `RESCALED_READ = 1.3`, `CLEANED_FIRST = { NATIONAL_ID: true, PHILHEALTH: false }`, `CLEANED_IMAGES = ['clean','binary']`, `LAYOUTS` block+auto, `ID_SCAN_CLAIM_TTL_MINUTES = 30`, `NATIONAL_ID_NAME_REGION = { left: 0.43, top: 0.28, width: 0.57, height: 0.47 }`, `ID_IMAGE_MAX_BYTES` 2 MB.
- **`IdOcrService`:** one tesseract worker per layout (`block`, `auto`), `createWorker('eng', OEM.LSTM_ONLY, { langPath: <@tesseract.js-data/eng>/4.0.0_best_int, gzip: true, cacheMethod: 'none' })`. A timeout or failure resets the worker and returns null; it never throws.
- **Scan failure decision:** if no number or no name → `rules.wrongCardCode` only when `raw/block` exists, saw no heading, and confidence ≥ `MIN_OCR_CONFIDENCE`; else `UNREADABLE`. Review path only from attempt `ID_SCAN_MAX_ATTEMPTS` with `requestReview`.
- **Parsers (`shared/src/validation/`):** PhilHealth PIN regex `(\d{2})[ \t]*[-–—]?[ \t]*(\d{9})[ \t]*[-–—]?[ \t]*(\d)`; heading = letters contain `PHILHEALTH` or `PHILIPPINEHEALTHINSURANCE`; name = `LAST, GIVEN…` line between the PIN line and the birth line. National: card number = a 16-digit run (4-4-4-4 or unbroken; 12 digits rejected as PSN); headings `PAMBANSANGPAGKAKAKILANLAN` / `PHILIPPINEIDENTIFICATIONCARD`; bilingual labels (`Apelyido/Last Name`, `Mga Pangalan/Given Names`, `Gitnang Apelyido/Middle Name`); stop at `PETSA`/`BIRTH`/`TIRAHAN`/`ADDRESS`.
- **Mobile flow (`mobile/src/services/id-scan/id-scan.ts`):** `DocumentScanner.scanDocument({ maxNumDocuments: 1, croppedImageQuality: 95 })` → `prepareUpload` (crop, downscale to `UPLOAD_LONG_EDGE`, JPEG `UPLOAD_JPEG_QUALITY`) → `TextRecognition.recognize` (ML Kit) → `localReadVerdict` (`NOT_RECOGNISED` short-circuit) → `submitIdScan` (`expo-file-system` `UploadTask` multipart to `${API_BASE}/v1/auth/id-verification`, header `ngrok-skip-browser-warning`). **No rotation on the phone.**
- **Storage:** `MediaService.putPrivateObject(key, body)` → S3 `PutObject` to the bucket; on failure → `ServiceUnavailableException`, falling back to local disk only if `STORAGE_LOCAL_FALLBACK` is true (currently false on Railway).
- **Push:** `mobile/src/services/push/push-registration.ts:39` `Notifications.getDevicePushTokenAsync()` → `POST /v1/notifications/register-token`.

## Files Changed

### Source code
- `backend/src/identity-verification/identity-verification.service.ts`: 180° check in `readCard` (`turnedHalfway`, boolean stages, `stages()` restart), `halfTurnTried` in the return type and log line, doc comment.
- `backend/src/identity-verification/id-image-prep.ts`: `turnIdImage` accepts `QuarterTurn | 180`; doc comment.

### Tests
- `backend/test/identity-verification/id-cleaned-reads.spec.ts`:
  - updated "falls back to the raw image…" (9 cleaned reads incl. the 180° read, 11 calls total)
  - updated "falls back to the cleaned reads only when both raw reads fail" (raw, PNG probe, raw, then PNGs)
  - new: "reads an upside-down card: one 180° read sees the heading…" (National, 5 calls)
  - new: "drops a 180° read that sees no heading… logs that it tried" (`turned=0(180 tried)`, `passed after 4 reads`)
  - new: "tries no 180° read once a read saw the heading" (9 calls)
  - new: "reads an upside-down card: the raw read starts over on the image turned 180°" (PhilHealth, 3 calls, turned JPEG 320×200)

### Config / external (not in git)
- EAS project env `preview`: 3 vars overwritten (table above).
- Railway: deployment `a07c1738` via "Deploy Latest Commit" (user).

### Memory (outside repo)
- `C:\Users\githu\.claude\projects\c--Users-githu-Music-agap-emergency\memory\project-railway-gotchas.md`: added "a push does not always put new code live; verify with a behaviour only the new code has" and "the scan log line shows `cleaned=` / `turned=` / `(180 tried)`".

### Docs
- `docs/handoff/2026-11-24_deployment-phase-5-eas-id-ocr.md`: this file.

## User Feedback & Preferences (REQUIRED — never omit)

- Corrected nothing this session, but the assistant made one wrong assumption worth remembering: it said "4 unclaimed scan records". In fact 422 refusals create no row; the actual count is 5 rows from the successful scans (see Where We Are).
- Started with the paste prompt: narrate onboarding, then **wait for go-ahead**. Said "go ahead" and answered open questions in a compact pasted list ("(yes)", "(not sure)", "(how)?").
- Asked **how** to change the DB and Redis passwords → wants concrete procedures, but accepted deferring them to before a pilot.
- **Before building, asked to make sure ID OCR works**, because "last time it is not working". The user cares that registration works for real testers. What failed last time is still unknown (the user didn't describe it).
- Approved the fix with "yes, make the 180° fix", and asked in the same message whether mobile storage is local or R2 → answered: R2 (server side).
- Pushed the fix themself and pasted **full Railway deploy-log JSON exports** (huge: ~250 route lines each). Scan for key lines only.
- When asked for log lines, the user sent **a screenshot plus the pasted lines** (Railway log viewer, GMT+8 timestamps).
- Asked "how do i redeploy the latest" → wants exact click paths. Did it via the dashboard, not the empty-commit option.
- Ends the session the same way as before: `/handoff` + a paste prompt + close the session, while the EAS build runs.
- Standing preferences carried over: phase by phase; click-by-click dashboard steps; secrets in Bitwarden; never repeat secrets; secret prompts with `Read-Host -AsSecureString`; give **both PowerShell and Git Bash** commit forms; the user runs commits/pushes; repo is **public**; $0 preference; stay on free addresses.

## Where We're Going

1. **Phase 5, finish the APK.** Get the result of the user's `eas build --profile preview --platform android`. If it failed, read the EAS build log (likely areas: Gradle with the committed `android/` folder, pnpm 11 install). If it succeeded: uninstall the dev client (same package `com.agap.emergency`), install the APK.
2. **Phase 5 "Done when" checks:**
   - APK installs.
   - Sign-in works on **mobile data with Wi-Fi off** (e.g. `citizen@demo.agap` / responder accounts; demo password in Bitwarden).
   - Push permission granted and the device token registers. To verify: Railway logs around `POST /v1/notifications/register-token`, or the `device_tokens` table.
3. **Real ID test on the APK:** the user scans their own PhilHealth/National ID right way up and upside down. If it fails, get the Railway `second read` log line (no PII) and use `cleaned=` / `turned=` / per-read `conf` and `card/number/name` flags to diagnose.
4. **Update `docs/plans/DEPLOYMENT_PLAN.md` Phase 5:**
   - free addresses instead of `api.<domain>`
   - EAS vars already existed → `--force`
   - drop `EXPO_PUBLIC_MAP_API_KEY`
   - no `/v1` in API_URL
   - fingerprint matched
   - no FCM key needed
   - tick the boxes
   - add the "Deploy Latest Commit" gotcha to section 3.5 Railway lessons
5. **Phase 6** end-to-end checks (plan list): guest SOS live on the map; ops SMS; citizen SOS live status; dispatch → responder push; SMS fallback with data off (same incident on resend); every role signs in; passkeys on web + APK; photo upload → no `on local disk` → then set `STORAGE_LOCAL_FALLBACK=true`; `/b` barangay page; **`TRUST_PROXY` decision** (plan recommends `1`).
6. **Before a real pilot:** rotate the PostGIS and Redis passwords (procedure in Open Questions / Key Decisions).
7. Optional: check the Vercel Node.js version (Settings → Build and Deployment → Node.js Version, want 22.x).

## Risks & Blockers

- **Railway may deploy stale code after a push** (seen once: 10 s build, old behaviour). Always verify a backend change live; fix with Ctrl+K → "Deploy Latest Commit".
- **Real-world OCR quality:** blur/noise can still defeat tesseract (medium-damage fake cards fail even upright). The 180° fix covers orientation only. After 3 failed attempts, citizens can request staff review (`requestReview`).
- **Railway Trial credit** ($5 / 30 days); an always-on backend will likely need Hobby ($5/mo). Moving off Railway means a new APK (API URL is baked in at build time) and re-registering passkeys.
- **Per-IP rate limits** (login 5/min; ID scan 5/min burst; guest SOS 20/10 min) can lump testers together behind proxies until `TRUST_PROXY` is set (Phase 6). Emergency switch `GUEST_REPORT_LIMIT_DISABLED=true`.
- **Textbee double-processing:** never run a local backend with `CITIZEN_SMS_SOS_ENABLED=true` while Railway runs.
- **Backend jest suites time out under full-parallel load** on this laptop; rerun alone before calling it a regression.

## Open Questions

- What exactly failed "last time" with ID OCR? (Not described. The upside-down bug is a strong candidate, but unconfirmed. The old preview APKs pointed at ngrok/laptop.)
- Did the current EAS preview build succeed? ("rebuilding" may mean an earlier attempt this session failed. Not reported.)
- Vercel Node.js version: 22.x? (user not sure)
- PostGIS password rotation on this template: exact variable names (`POSTGRES_PASSWORD` / `PGPASSWORD`?) and whether `DATABASE_PRIVATE_URL` is built from them. Plan: `railway ssh --service PostGIS` → `psql -U postgres` → `\password postgres`, then update the variable, then redeploy the backend. Redis: change `REDIS_PASSWORD` → redeploy Redis (start command uses `--requirepass $REDIS_PASSWORD`) → redeploy the backend (reference follows).
- Why did deployment `6e1a8b91` run old code with a 10 s build? (Built the handoff commit `e6bc831`? A Railway cache issue?) Not investigated further; the workaround is known.

## Quick Start for Next Session

```bash
# Restore context (bd not installed)
# Reference docs
docs/plans/DEPLOYMENT_PLAN.md                         # Phase 5/6; Phase 5 text outdated (see Where We're Going 4)
docs/handoff/2026-11-24_deployment-phases-3-4.md      # parent
CLAUDE.md

# Key files to read first (not exhaustive, explore adjacent code too)
mobile/eas.json
mobile/src/services/id-scan/id-scan.ts
backend/src/identity-verification/identity-verification.service.ts   # readCard + turnedHalfway
backend/src/identity-verification/id-image-prep.ts
mobile/src/services/push/push-registration.ts

# Verify current state (read-only)
curl -s https://agap-emergency-production.up.railway.app/v1/health
curl -s https://agap-emergency-production.up.railway.app/.well-known/assetlinks.json
cd mobile && eas env:list --environment preview      # expect Railway URLs
cd mobile && eas build:list --platform android --limit 3 --json --non-interactive   # did the preview build finish?

# Tests (backend, run alone if timeouts)
cd backend && npx jest --config ./test/jest.config.ts test/identity-verification --maxWorkers=2

# Next action
Ask the user for the EAS preview build result; if green, walk them through install + the three Phase 5 checks
(mobile-data sign-in, push token registration) and a real ID scan, then update the plan's Phase 5.
```

## Session Closed
**Closed at:** 2026-11-24 (local, ~10:50 GMT+8)
**Commit:** the `session: deployment-phase-5-eas-id-ocr` commit that includes this note (not pushed: a push to main redeploys Railway and Vercel)
**Session status:** Handed off to next session (EAS preview build still running on the user side)
