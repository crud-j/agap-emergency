# Handoff: SMS replies (Phase 5), barangay directory admin (Phase 6), placeholder ops number fix, passkey in the account picker

**Date:** 2026-10-22
**For:** whoever continues next — a new session, a teammate, or another agent.

**Plans:**
- [BARANGAY_ALERT_AUTOMATION_PLAN.md](../plans/BARANGAY_ALERT_AUTOMATION_PLAN.md): every phase is now built. The status block at the top and a "Phase N status" section per phase say what's still unchecked.
- [AI_ASSIST_PLAN.md](../plans/AI_ASSIST_PLAN.md): not started. Phase 0 is decisions only the team or MDRRMO can make.

**State:**
- **Nothing is committed.** 274 files are changed on `main`; the last commit is `8adf111`.
- **Backend:** the full suite passes (36 suites, 564 tests), and the type check is clean.
- **Frontend:** the type check is clean, and `/login` serves on the running web app.

---

## What changed this session

### 1. The placeholder MDRRMO number is now ignored

- **New helper:** `configuredOpsPhone()` in `backend/src/barangay-coordination/barangay-notify.service.ts` treats a blank or all-zero number (like `+639000000000`) as "not set".
- **Effect:** with that kind of value, an SOS skips the ops text, and the barangay texts and `/b` page leave out the "Call MDRRMO" line.
- **For the demo:** `MDRRMO_OPS_PHONE=+639755247821` (the Textbee phone, which texts itself). That self-text was confirmed arriving.

### 2. Phase 5 (barangay SMS replies) is built, but hasn't been tested with a real reply

- **What it does:** the barangay texts `OTW 4416`, `DONE 4416`, `NEED 4416` and so on, with Filipino aliases (`PAPUNTA`, `TAPOS`, `TULONG`…), to the Textbee number. It's recorded exactly like a tap on the `/b` page, with source `SMS_REPLY`.
- **It never changes incident status.**
- **Reply texts:** a known number gets an acknowledgement, at most one automatic reply per number per minute. Unknown senders and carrier promos (`TM`, `8080`) are stored but never answered.
- **Alert text:** alerts now end with `Reply OTW/DONE/NEED <code>.`
- **Receiver:** polls Textbee every 15 s on its own queue, `barangay-sms-inbound`. The webhook isn't built (it needs a web address that doesn't change).
- **Files:** `barangay-reply.parser.ts`, `barangay-reply.service.ts`, `barangay-sms-poller.ts`, `BarangayCallbackService.reportBySms`; the panel shows "SMS from the barangay".
- **Settings:** `BARANGAY_SMS_REPLIES_ENABLED=true` and `BARANGAY_SMS_INBOUND_MODE=poll`, set in `backend/.env` and listed in `.env.example`.
- **Demo rule:** outside production, a reply from the override phone can answer any barangay's case.

### 3. Phase 6 (Barangay Directory admin) is built. The API was checked live; nobody has used the screen yet

- **Endpoints:** `GET`, `POST` and `PATCH` on `/v1/barangays/contacts`, for Org and System Administrators. Every change is audited.
- **Screen:** a new **Barangay Directory** tab under System Administration ([BarangayDirectoryTab.tsx](../../frontend/components/admin/BarangayDirectoryTab.tsx)). It flags each barangay with No primary / No backup / Unverified, and per number has role, label, mark verified, clear demo flag and deactivate/reactivate.
- **Rules:**
  - Giving a number a taken primary or backup slot moves the current holder, so a swap is one action.
  - Numbers are never deleted.
  - A landline can only be "Other".
  - Numbers added here have `source='admin'`, so the seed never deactivates them.
- **Live check:** it ran against the real database, including a swap with Batia's demo number. Batia was restored and the test number deleted.
- **Access gap:** the page itself is still limited to System Administrators. Org Administrators can use the API but have no screen yet.

### 4. Login: "Choose an account" now offers a passkey

- **Before:** it only had a password box.
- **Now:** passkey first, then "Use password instead", the same as the full form. Changed in [AccountPicker.tsx](../../frontend/components/auth/AccountPicker.tsx); `handlePasskey(forEmail?)` in [app/login/page.tsx](../../frontend/app/login/page.tsx).
- **Not tested:** the passkey prompt itself, because it needs a fingerprint or PIN.

### 5. Fixed a problem caused during this session

PowerShell `Get-Content`/`Set-Content` garbled UTF-8 in `barangay-notify.service.ts` and `barangay-callback.service.ts` (`…` → `â€¦`). Both are repaired.

---

## Open items, in priority order

1. **Phase 5 live test.** The barangay demo SIM (0969-478-4013) has no load. Once it's loaded:
   - text `OTW 4416` to 0975-524-7821, for case INC-2026-000024, or run `node scripts\dev\test-barangay-sms.js` for a fresh case;
   - within about 20 s, expect the Barangay tab to show "via SMS reply" and an acknowledgement text to arrive.
2. **Phase 6 screen test.** Sign in as `admin@agap.local`, with the password from `INITIAL_ADMIN_PASSWORD` in `backend/.env`.
   - It has never signed in, so it will force a password change and may ask for MFA setup.
   - Then try a swap and a label edit, and send a test SOS to confirm the next alert goes to the new number.
3. **Dispatcher walkthrough (carried over).** Log in as dispatcher1; the credentials are in [USER_ACCOUNTS.md](../USER_ACCOUNTS.md). Check:
   - the drawer tabs and the footer actions;
   - False alert's confirm step;
   - Resolve & Close;
   - call logging and outcomes;
   - Confirm handled → Close;
   - the new passkey option in the account picker.
4. **Commit the work.** Split it into a few commits: barangay phases, ops-number fix, login.
5. **Org Administrator access** to the Barangay Directory screen. It needs the admin page's role check widened.
6. **Still open from before:**
   - a closing text to the barangay (decision pending);
   - AI plan Phase 0 decisions;
   - confirming the real MDRRMO and barangay numbers before going live.
7. **Optional:** silence the harmless `DEP0060 util._extend` warning from the web app (it comes from Next 14's bundled http-proxy). The fix is `cross-env NODE_OPTIONS=--disable-warning=DEP0060` in the frontend dev script.

---

## Running state

- **Running:** backend on 3000 (watch), web app on 3001, Redis on 6379, one `cloudflared` tunnel.
- **Backend:** restarted this session with replies on. The `barangay-sms-poll` schedule exists in Redis, and polls run with 0 failures.
- **`backend/.env`:**
  - `BARANGAY_ALERTS_ENABLED=true`
  - `BARANGAY_SMS_TEST_OVERRIDE_PHONE=+639694784013`
  - `BARANGAY_SMS_REPLIES_ENABLED=true`
  - `BARANGAY_SMS_INBOUND_MODE=poll`
  - `MDRRMO_OPS_PHONE=+639755247821`
  - `PUBLIC_APP_URL=https://agrees-realtors-vaccine-tells.trycloudflare.com`
- **Phones:**

  | Phone | Role |
  |---|---|
  | 0975-524-7821 | Textbee: sends every text, receives replies, stands in for MDRRMO |
  | 0969-478-4013 | Barangay: every barangay in the demo |

## Test data and side effects

- **INC-2026-000024** (Batia, code 4416): the alert was delivered and included the reply hint.
- **`barangay_sms_inbound`:** one row, the ops self-text, stored as `UNKNOWN_SENDER`, which is correct.
- **Phase 6 live test:** left 8 audit rows for contact `+639170000001`. The contact itself is deleted; the audit rows can't be removed.
- **Scratchpad script `phase6-live.js`** (temporary, may be lost): signs a 5-minute local admin token with `JWT_SECRET` and runs the reversible directory check.

## Gotchas

- **Restarting the backend after a `.env` change:** touching a file doesn't do it. It needs a real content change, or a manual restart.
- **Editing files from PowerShell:** don't use `Get-Content`/`Set-Content`; they garble UTF-8. Use the edit tools, or `[IO.File]` with UTF-8 without a BOM.
- **`audit_logs`:** the time column is `occurred_at`, not `created_at`.
- **`jsonwebtoken`:** it isn't a direct backend dependency under pnpm. Sign test tokens with `crypto`.
- **Rate limiting:** many quick API calls in a row can get throttled.
- **Textbee inbox:** carrier promos land there too; the poller stores them as `UNKNOWN_SENDER`.
- **Textbee sending:** both SIMs need load or a texting promo. The Textbee SIM's EasySURF50 promo expires **2026-10-24 at 08:50**.
- **Carried over:**
  - never put a web address in a barangay SMS;
  - routes are `/v1/…`;
  - run Jest with `--config ./test/jest.config.ts`;
  - use `migrate deploy` only.
