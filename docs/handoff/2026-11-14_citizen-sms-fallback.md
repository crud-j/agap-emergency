# Handoff: Citizen SOS by SMS (MOD-17 / MOD-19) + plain-English SMS texts

**Date:** 2026-11-14 (third session that day)
**For:** the next agent, starting cold. This is the current handoff; read it first.
**First task:**
1. Ask whether the SMS wording change has been committed (section "Git").
2. Ask how the **device test** went (section "Waiting on the user").
3. Ask the two open questions in "Decisions for the user".

Don't start new work on your own.

**Earlier handoffs:**
- [`2026-11-14_analytics-csv-export-sla-single-source.md`](./2026-11-14_analytics-csv-export-sla-single-source.md): its browser checks are still unreported, and its "Next A" (AI summary on Analytics) is still designed only.
- [`2026-11-13_gap-audit-medical-type-dispatch-recall-crew-medical.md`](./2026-11-13_gap-audit-medical-type-dispatch-recall-crew-medical.md): backlog item 1 (phone-side SMS fallback) is **done here**. Its "How the user works" section still holds.

Plan (approved): `C:\Users\githu\.claude\plans\dapper-baking-firefly.md`.

---

## Where things stand

| Item | Status |
|---|---|
| Citizen SOS by SMS, end to end (app → Textbee → incident → reply) | DONE, tested, **committed `39f0708`**, **not run on a device** |
| App resend links the account and completes the SMS incident | DONE, tested, committed `39f0708` |
| Console "By SMS" badge + call-back hint | DONE, typechecked, committed, not checked in a browser |
| Migration `20261114120000_citizen_sms_sos` | Committed; **applied to the local DB** (`migrate deploy`); `migrate diff` shows no drift |
| Every people-facing SMS rewritten in plain English, GSM-7 safe | DONE, tested, **uncommitted** |

## Git

- `39f0708 feat(sms): citizen SOS by SMS…` is on `main`.
- **Uncommitted:** the SMS wording change (22 modified + 4 new files, listed in "Second part") and this handoff file.
- The user commits only when asked, from Git Bash (`git commit -F - <<'EOF' … EOF`). Suggested command:

```bash
git add -A && git commit -F - <<'EOF'
feat(sms): plain-English, GSM-7-safe texts for every people-facing SMS

- shared: sms-text helpers (isGsm7, gsm7Length, toGsm7, fitGsm7, type labels)
  and one MDRRMO hotline constant for app and server
- citizen SOS text gets a readable first line; parser reads from AGAP| on
- clearer SOS replies, emergency-contact alert, account codes, lock notice,
  announcement + STOP confirmation, barangay alert/reminder/acks
- announcements never lose the STOP line (old slice could cut it)
- test: sms-texts.spec checks every text is GSM-7, one segment, no URL
- docs: CLAUDE.md GSM-7 rule, handoff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- `frontend/tsconfig.tsbuildinfo` is touched by `tsc`. Restore it with `git checkout -- frontend/tsconfig.tsbuildinfo`.

## Waiting on the user

1. **Config for the device test.**
   - Backend `backend/.env`: `CITIZEN_SMS_SOS_ENABLED=true`. Textbee must have "Receive SMS" on.
   - App `mobile/.env`: `EXPO_PUBLIC_AGAP_SMS_NUMBER=<Textbee SIM number>`. Restart Metro; no EAS rebuild is needed (JavaScript and `Linking` only).
2. **Device test** (also step 4 of the [MOD-17 report](../module-reports/MOD-17_Multi_Channel_Emergency_Transmission_Gateway.md) "Test before signing"):
   1. Mobile data off, SIM on → SOS → **Send by SMS**. The messages app should show `AGAP SOS: <Type>. Press Send, don't edit.` followed by the `AGAP|…` line. Press Send.
   2. Within about 30 s the incident shows **By SMS** in Live Dispatch with the phone number. The phone gets `AGAP: MDRRMO got your emergency text. Report no. INC-…`.
   3. Data back on: the app resends, and the incident gains the account and details, with no duplicate. The Activity Log shows an `UPDATE` with `completedFromApp`.
   4. Send the same text again: the same reference comes back. Send garbled text: "could not read your emergency text… call 911 or MDRRMO 0936 330 9020".
3. **Check the new texts on a real phone:**
   - a sign-in code;
   - an emergency-contact alert;
   - a barangay alert (it should arrive as **one** SMS);
   - an announcement with curly quotes pasted in.
4. Still unreported from earlier handoffs:
   - SLA alarm and Analytics CSV browser checks (2026-11-14);
   - Live Dispatch and Fleet browser checks (2026-11-14);
   - device checks (2026-11-13).

## Decisions for the user

1. **Barangay reply acknowledgements** now end in "Thank you." instead of "Salamat." (the user chose English). Change back if barangays should keep "Salamat".
2. ~~"Responders on the way" texts ignore `notify_on_alert`~~: **fixed** in the fourth session (see "Fourth session").

---

## First part: citizen SOS by SMS (committed `39f0708`)

**User decisions:**
- When data returns, the app resend **links the account and fills blanks only**.
- An SMS report with **no GPS, or GPS outside Bocaue, still creates an incident**.
- A text **more than 6 h old is logged only**.

- **Format** ([`citizen-sos-sms.ts`](../../shared/src/utils/citizen-sos-sms.ts)):
  - The machine line is `AGAP|<eventId>|<lat5>,<lng5>|<unix>|<IncidentType>|C:Y/N|T:S/K/M`.
  - The parser returns `null` for a text that is not a citizen SOS, including ops `AGAP|INC-…` texts.
  - It returns a failure reason for a text that looks like one but is malformed.
- **Inbound:** `BarangayReplyService.handleInbound` checks for a citizen SOS **first**, before STOP and barangay replies, and calls [`CitizenSmsSosService`](../../backend/src/emergency-alerts/sms-sos/citizen-sms-sos.service.ts). Outcomes:
  1. known event id → `SOS_EXISTING`;
  2. older than 6 h → `SOS_STALE`;
  3. over the per-number limit (new `phone` scope in `GuestReportLimitService`: 3 per 10 min, 10 per 24 h) → `SOS_LIMITED`;
  4. otherwise `IncidentsService.create(…, { channel: 'SMS', senderPhone, sentAt })` → `SOS_CREATED`;
  5. a malformed text, or a sender that is not a mobile number → `SOS_INVALID`.

  Other behaviour:
  - A `BadRequestException` is an outcome, so a bad message never blocks the poller. A database error throws, so the poller retries.
  - The sender gets a reply, at most 1 per sender per minute.
  - The inbound row stores the outcome and `incident_id`.
  - The poller also runs when only `CITIZEN_SMS_SOS_ENABLED` is on.
- **`IncidentsService.create` with `channel: 'SMS'`:**
  - A guest report with no GPS is allowed.
  - It sets `report_channel = SMS` and `reporter_phone` / `contact_callback` = the sender.
  - The first event's notes record the phone's send time.
  - **`submitted_at` is the receipt time**, so a late SMS does not arrive with its SLAs already breached. This differs from the plan.
  - GPS outside Bocaue goes into the description as `Reported GPS outside Bocaue: …`.
- **`completeSmsReport`** runs when an app resend reaches an SMS incident that is ≤ 24 h old:
  - links a **citizen** account only if none is linked yet;
  - fills empty fields only: description (a description that is only the outside-Bocaue note counts as empty), reporter status, intake answers, hazard flags, patient, and location (only if there was none);
  - writes an `UPDATE` audit entry with field names only (MOD-19), fail-closed;
  - then sends a realtime `incident.updated` (`sms_report_completed`), notifies MOD-16 contacts if newly linked, and tags the barangay if a location was added;
  - never throws, and never touches category, priority or status.
- **Database:**
  - `report_channel {APP, SMS}` and `incidents.report_channel`;
  - 5 new `SOS_*` inbound outcomes;
  - `barangay_sms_inbound.incident_id`.
- **Mobile:**
  - `EXPO_PUBLIC_AGAP_SMS_NUMBER` ([`sms-gateway.ts`](../../mobile/src/config/sms-gateway.ts)); when unset, no SMS option is shown;
  - [`sos-sms.ts`](../../mobile/src/services/sms/sos-sms.ts) opens the `sms:` link;
  - `submitIncident` has a 20 s timeout;
  - [`transmission.tsx`](../../mobile/app/emergency/transmission.tsx):
    - "Send by SMS" appears after 8 s on the spinner, and on a connection failure;
    - the `smsOpened` screen;
    - an automatic resend when data returns (same key, one attempt at a time).
- **Console:**
  - [`SmsChannelBadge`](../../frontend/components/incidents/SmsChannelBadge.tsx) on Live Dispatch queue rows and the incident header, with a call-back hint;
  - the drawer shows "sent by SMS" and "Location unknown: call the reporter back".

## Second part: every people-facing SMS rewritten (uncommitted)

**User's choices:** all people-facing SMS, in plain English. The machine-format ops SMS (`AGAP|INC-…`) is unchanged.

- **Shared helpers** ([`sms-text.ts`](../../shared/src/utils/sms-text.ts)):
  - `isGsm7` / `gsm7Length` (`|` counts as two septets);
  - `toGsm7` (curly quotes, dashes and "…" become plain characters);
  - `fitGsm7` (shortens at a word, ends with "...");
  - `INCIDENT_TYPE_SMS_LABEL` ("Road accident").
- **Hotline constant:** `MDRRMO_HOTLINE(_DISPLAY)` moved to [`shared/src/constants/hotlines.ts`](../../shared/src/constants/hotlines.ts); mobile `config/hotlines.ts` re-exports it.
- **Citizen SOS text:** a first line `AGAP SOS: <Type>. Press Send, don't edit.`. The parser reads from `AGAP|` wherever it starts, so an edited or missing first line still works. The worst case is 156 of 160 septets.
- **SOS replies:** what happened, what to do now, and 911 + MDRRMO 0936 330 9020 for every failure.
- **Emergency contacts** (`buildContactAlertSms`): who, the type in plain words, "named you as their emergency contact", the reference. Only the name is shortened. The old code could add a non-GSM "…".
- **"Responders on the way" text to contacts:** it now says it is an update on the same report.
- **Account texts** ([`auth/auth-sms.ts`](../../backend/src/auth/auth-sms.ts)):
  - codes read `AGAP code: 123456. Use it to …`, then the expiry, then "Never share it…";
  - the account-lock text is clearer.
- **Announcements:** `buildAnnouncementSms` always keeps `Reply STOP to stop these texts.` and shortens the summary first. The old `.slice(0, 160)` could cut the STOP line (RA 10173). Pasted punctuation is made plain. The STOP confirmation gives the hotline.
- **Barangay:**
  - alert: `AGAP case 4821: Road accident, Brgy Batia, 14.83221,120.94920 (INC-…). Page code 4821-KXPM. Reply OTW, DONE or NEED 4821. Call MDRRMO …`;
  - reminder: `AGAP case 4821 reminder: Brgy Batia, please update MDRRMO on INC-…`;
  - acknowledgements and help texts are spelled out;
  - the MDRRMO call-back still fits in the common case.
- **Not changed:**
  - ID-check texts (shared with push, already clear);
  - status updates (push only);
  - the ops SMS.
- **Docs:** CLAUDE.md shows the SOS text with its first line, and the reliability rule now requires GSM-7.

## Verification (last run, after the wording change)

- `tsc --noEmit`: shared (built), backend, frontend and mobile are all clean.
- **Backend full run:** `npx jest --config ./test/jest.config.ts --maxWorkers=50% --testTimeout=60000` → **129/129 suites, 2261 tests passed**. With the default 5 s timeout, the auth/ID bcrypt suites time out under load; this is known and unrelated.
- **Mobile jest:** 21 suites, 266 tests. **Frontend jest:** 22 suites, 216 tests (no frontend change in the second part).
- **New tests:**
  - [`sms-texts.spec.ts`](../../backend/test/notifications/sms-texts.spec.ts): every people-facing text is GSM-7, one segment and has no web address, across 19 barangays × 9 types, with and without GPS;
  - `citizen-sos-sms.spec.ts` (format);
  - `citizen-sms-sos.spec.ts` (service + routing);
  - `test/incidents/sms-report-channel.spec.ts`;
  - a `phone`-scope test in `guest-report-limit.spec.ts`;
  - a poller gating test;
  - `mobile/src/services/sms/__tests__/sos-sms.test.ts`.
- **Wiring:** the user's dev backend (watch mode, `node dist/main`) restarted with the SMS module and answered 401 on `/v1/incidents`.
- **Not run:**
  - a real SMS through Textbee;
  - the reconnect auto-resend (device only);
  - the console in a browser;
  - how the new texts look on a real phone.

## Known gaps left

1. ~~Linking trusts possession of the event id~~: **fixed** in the fourth session. The account link now needs the verified account number to be the SMS sender. **Still open:** filling blanks (including the location) needs only the event id, for guests too, because a guest resend has no number to check.
2. **Latency:** carrier delivery plus a poll every 15 s. Webhook mode (`BARANGAY_SMS_INBOUND_MODE=webhook`) is not built.
3. **No console view of the inbound log:** `SOS_STALE`, `SOS_INVALID` and `SOS_LIMITED` texts are visible only in the database and logs.
4. **Reply SMS limit:** the 1-per-minute limit is in memory (it resets on restart). Each reply uses SIM credit.
5. ~~`components/dispatch/IncidentDetailPanel.tsx` is dead code~~: **deleted** in the fourth session.
6. **Shell-tool pitfall seen this session:** Python edits sent through Bash turned `\\n` into a real line break in TS strings twice. Use the Edit tool for any code containing backslashes.
7. **Backlog** (2026-11-13): ~~announcement SMS ignoring barangay~~ (fixed in the fourth session), dead code to wire or delete, then lower-value items. AI summary on Analytics is still designed only.

---

## Fourth session (2026-11-14): fixes before the AI summary (uncommitted)

The user asked to fix what was missing before starting the AI summary on Analytics. Everything is tested and typechecked; nothing has been run on a device or in a browser yet.

1. **Contacts' "responders on the way" SMS** now respects `notify_on_alert` and `priority_order`, like MOD-16 (`notification.processor.ts`).
2. **Announcement barangay targeting (MOD-53), SMS and push:**
   - **Found:** SMS ignored `barangay_preference`. Push filtered on `users.barangay IN targets`, but sign-up never sets `users.barangay`, so a barangay-specific push reached almost nobody. Three different barangay lists were in use:
     - the mobile subscribe screen listed five barangays that aren't in Bocaue and was missing seven real ones;
     - the surge page listed neighbouring towns' barangays;
     - the console and app spelled "Tambobong", while the database has "Tambubong".
   - **Now:**
     - one list, `BOCAUE_BARANGAY_NAMES`, in the database spelling, with `canonicalBarangay` (handles accents, case and old spellings) and `announcementReachesBarangay` ([`shared/src/constants/barangays.ts`](../../shared/src/constants/barangays.ts));
     - a targeted notice goes to its barangays plus anyone whose barangay is unknown;
     - a municipality-wide notice ignores any leftover targets;
     - `subscribe` stores the official spelling, or null when the name isn't a Bocaue barangay (never refused);
     - the mobile subscribe screen, the console compose page and the surge page use the shared list.
   - The mobile map keeps its own GeoJSON list.
3. **`/analytics/daily` and the nightly job** count the Asia/Manila day (it used the server's local midnight) and skip DRAFT/DUPLICATE. A bad `date` returns 400.
4. **SMS report account link (MOD-19):** described in Known gap 1. A refused link is audited (`accountLinkRefused: SENDER_NUMBER_MISMATCH`) and logged; blanks are still filled.
5. Deleted `frontend/components/dispatch/IncidentDetailPanel.tsx`.

**Tests:**
- new `test/analytics/daily-summary.spec.ts` and `test/announcements/barangay-targeting.spec.ts`;
- additions to `approval.spec.ts`, `sms-report-channel.spec.ts` and `reporter-status-push.spec.ts`.

**Verification:**
- `tsc --noEmit` is clean on all four packages.
- Backend full run: **131/131 suites, 2293 tests**.
- Frontend: 22 suites, 216 tests. Mobile: 21 suites, 266 tests.

**Device check:** see step 10 in the [MOD-53 report](../module-reports/MOD-53_Municipal_Announcements_and_Public_Broadcast.md) "Test before signing".
