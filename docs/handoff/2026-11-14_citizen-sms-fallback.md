# Handoff: Citizen SOS by SMS (MOD-17 / MOD-19)

**Date:** 2026-11-14 (third session that day)
**For:** the next agent, starting cold. This is the current handoff; read it first.
**First task:** ask the user how the **device test** went (section "Waiting on the user"). Don't start new work on your own.
**Earlier handoffs:**
- [`2026-11-14_analytics-csv-export-sla-single-source.md`](./2026-11-14_analytics-csv-export-sla-single-source.md): its browser checks are still unreported, and its "Next A" (AI summary on Analytics) is still designed only.
- [`2026-11-13_gap-audit-medical-type-dispatch-recall-crew-medical.md`](./2026-11-13_gap-audit-medical-type-dispatch-recall-crew-medical.md): backlog item 1 (phone-side SMS fallback) is **done here**.

Plan: `C:\Users\githu\.claude\plans\dapper-baking-firefly.md` (approved by the user).

---

## Where things stand

| Item | Status |
|---|---|
| Citizen SOS by SMS, end to end (app → Textbee → incident → reply) | DONE, tested, **not committed**, **not run on a device** |
| App resend links and completes the SMS incident | DONE, tested |
| Console "By SMS" badge + call-back hint | DONE, typechecked, not checked in a browser |
| Migration `20261114120000_citizen_sms_sos` | **Applied to the local DB** (`migrate deploy`); `migrate diff` shows no drift |

## Git

- Everything below is uncommitted on `main`. The user commits only when asked, from Git Bash: give `git commit -F - <<'EOF' … EOF`.
- `frontend/tsconfig.tsbuildinfo` was restored after typechecks.

## Waiting on the user

1. **Config for the device test.**
   - Backend `backend/.env`: `CITIZEN_SMS_SOS_ENABLED=true`. Textbee must have "Receive SMS" on.
   - App `mobile/.env`: `EXPO_PUBLIC_AGAP_SMS_NUMBER=<Textbee SIM number>`. Restart Metro; no EAS rebuild is needed (JavaScript and `Linking` only).
2. **Device test:** steps 1–5 in the plan's Verification section, or step 4 of the [MOD-17 report](../module-reports/MOD-17_Multi_Channel_Emergency_Transmission_Gateway.md) "Test before signing".
   1. Mobile data off, SIM on → SOS → **Send by SMS** → Send.
   2. Within about 30 s the incident shows **By SMS** in Live Dispatch, and the phone gets the reference.
   3. Data back on → the app resends → the incident gains the account and details, with no duplicate.
   4. Check the Activity Log for an `UPDATE` with `completedFromApp`.
3. Still unreported from earlier handoffs:
   - SLA alarm and Analytics CSV browser checks (2026-11-14);
   - Live Dispatch and Fleet browser checks (2026-11-14);
   - device checks (2026-11-13).

## What this session changed

**User decisions (2026-11-14):**
- When data returns, the app resend **links the account and fills blanks only**.
- An SMS report with **no GPS, or GPS outside Bocaue, still creates an incident**.
- A text **more than 6 h old is logged only**.

- **Format:** [`shared/src/utils/citizen-sos-sms.ts`](../../shared/src/utils/citizen-sos-sms.ts) defines `AGAP|<eventId>|<lat5>,<lng5>|<unix>|<IncidentType>|C:Y/N|T:S/K/M`, about 100 characters.
  - The parser returns `null` for anything that isn't a citizen SOS, including ops `AGAP|INC-…` texts.
  - It returns a failure reason for a text that starts like a citizen SOS but is malformed.
- **Inbound:** `BarangayReplyService.handleInbound` checks for a citizen SOS **first**, before STOP and barangay replies, then calls [`CitizenSmsSosService`](../../backend/src/emergency-alerts/sms-sos/citizen-sms-sos.service.ts), in this order:
  1. a known event id → `SOS_EXISTING`;
  2. older than 6 h → `SOS_STALE`;
  3. over the per-number limit (new `phone` scope in `GuestReportLimitService`: 3 per 10 min, 10 per 24 h) → `SOS_LIMITED`;
  4. otherwise `IncidentsService.create(…, { channel: 'SMS', senderPhone, sentAt })` → `SOS_CREATED`.
  - A malformed text, or a sender that isn't a mobile number, is `SOS_INVALID`.
  - A `BadRequestException` is an outcome, so a bad message never blocks the poller. A database error throws, so the poller retries.
  - A reply SMS goes back to the sender: the reference, or "call 911", at most 1 per sender per minute.
  - The inbound row stores the outcome and the new `incident_id`.
  - The poller also runs when only `CITIZEN_SMS_SOS_ENABLED` is on.
- **`IncidentsService.create`:**
  - `channel: 'SMS'` allows a guest report with no GPS.
  - It sets `report_channel = SMS` and `reporter_phone` / `contact_callback` = the sender.
  - The first event's notes say "Received by SMS…; sent from the phone at <Manila time>".
  - **`submitted_at` is the receipt time, not the phone's send time.** This differs from the plan: a late SMS must not arrive with its SLAs already breached.
  - GPS outside Bocaue is not used as the location; it goes into the description as `Reported GPS outside Bocaue: …`.
- **Completion (`completeSmsReport`)** applies on the existing-key paths for SMS-channel incidents ≤ 24 h old:
  - Links a **citizen** account only if no account is linked yet (`updateMany … user_id: null`).
  - Fills only empty fields: description (a description that is only the outside-Bocaue note counts as empty and is kept below the citizen's text), reporter status, intake answers, hazard flags, patient, and location (only if there was none).
  - Writes an `UPDATE` audit entry with field names only (module MOD-19), fail-closed inside the transaction.
  - Then a realtime `incident.updated` (`change: sms_report_completed`), MOD-16 contacts if newly linked, and barangay tagging if a location was added.
  - Never throws. Category, priority and status are never touched.
- **Database:**
  - enum `report_channel {APP, SMS}` and `incidents.report_channel` (default APP);
  - 5 new `barangay_inbound_outcome` values (`SOS_*`);
  - `barangay_sms_inbound.incident_id` (FK, `ON DELETE SET NULL`, indexed).
- **Mobile:**
  - [`sms-gateway.ts`](../../mobile/src/config/sms-gateway.ts) reads `EXPO_PUBLIC_AGAP_SMS_NUMBER`. When it is unset, no SMS option is shown.
  - [`sos-sms.ts`](../../mobile/src/services/sms/sos-sms.ts) opens `sms:` with `?body=` on Android and `&body=` on iOS, without `canOpenURL`.
  - `submitIncident` now has a **20 s timeout**.
  - [`transmission.tsx`](../../mobile/app/emergency/transmission.tsx):
    - "Send by SMS" appears after 8 s on the spinner;
    - it is the primary button on a connection failure (not on 4xx or 429);
    - a new `smsOpened` screen tells the citizen to press Send and expect a reply within 2 minutes, with the hotlines;
    - when NetInfo goes offline → online, the report is resent automatically with the same key;
    - one attempt runs at a time (an `inFlight` ref).
- **Console:**
  - [`SmsChannelBadge`](../../frontend/components/incidents/SmsChannelBadge.tsx) appears on Live Dispatch queue rows and in the incident header. The header also shows a hint with the call-back number and "no location".
  - `IncidentDetailDrawer` shows "· sent by SMS" on the Trigger line, and "Location unknown: call the reporter back".
- **Docs:**
  - CLAUDE.md: the Dual-Path and Offline Queue sections now describe the real flow, and the REST list adds `/sla-policies` and `/analytics/export`.
  - The MOD-17 report covers the inbound path and its test step.
  - Root `.env.example` gains `CITIZEN_SMS_SOS_ENABLED`.

## Verification (last run)

- `tsc --noEmit`: shared (built), backend, frontend and mobile are all clean.
- **Backend full run:** 124/128 suites passed. The 4 failures were the known auth/ID bcrypt timeouts. Rerun alone, 3 passed; `auth-phase3` passes 59/59 with `--testTimeout=60000`. After the last fix: incidents + emergency-alerts + barangay-coordination = 33 suites, 700 tests passing.
- **New tests:**
  - `backend/test/emergency-alerts/citizen-sos-sms.spec.ts` (format, 21 tests);
  - `citizen-sms-sos.spec.ts` (service + routing);
  - `test/incidents/sms-report-channel.spec.ts` (channel + completion);
  - a `phone`-scope test in `guest-report-limit.spec.ts`;
  - a poller gating test in `barangay-reply.spec.ts`;
  - `mobile/src/services/sms/__tests__/sos-sms.test.ts`.
- **Frontend jest:** 22 suites, 216 tests. **Mobile jest:** 21 suites, 266 tests.
- **Wiring:** the user's dev backend (watch mode, `node dist/main`) restarted with the new module and answers (401 on `/v1/incidents`), so Nest's dependency injection resolves.
- **Not run:** a real SMS through Textbee; the screen's reconnect auto-resend (no component test, device only); the console in a browser.

## Known gaps left

1. **Linking trusts possession of the event id.** It is in the SMS text, so anyone who can read that text could link it to their citizen account (only within 24 h, and only while unlinked). The id comes from `Math.random` (`mobile/src/lib/uuid.ts`, comment updated).
2. **Latency:** carrier delivery plus a poll every 15 s. Webhook mode (`BARANGAY_SMS_INBOUND_MODE=webhook`) is still not built.
3. **No console view of the inbound log** for SOS outcomes. Rows are stored with outcome and incident, but `SOS_STALE`, `SOS_INVALID` and `SOS_LIMITED` texts are visible only in the database and logs.
4. **Reply SMS limit:** the 1-per-minute limit is held in memory (it resets on restart). Each reply uses SIM credit.
5. `components/dispatch/IncidentDetailPanel.tsx` is **dead code** (nothing imports it). It was left unchanged; delete it or wire it.
6. The 2026-11-13 backlog continues: announcement SMS ignoring barangay, dead code to wire or delete, then lower-value items. AI summary on Analytics is still designed only.
