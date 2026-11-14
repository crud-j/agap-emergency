# MOD-17 — Multi-Channel Emergency Transmission Gateway

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-17 |
| Version | 1.0 |
| Module Name | Multi-Channel Emergency Transmission Gateway |
| Module Cluster | Cluster D — Alert Processing and Dispatch |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Fires the SMS path to the MDRRMO Operations Center phone the moment a new incident is saved, running alongside — never instead of — the already-persisted HTTPS/database record. Builds a compact, single-segment SMS payload and queues it through Textbee; a missing phone number, missing Textbee credentials, or a failed send is logged and skipped, and never blocks or changes the incident.

It also carries the reverse direction: a citizen whose phone has no mobile data can send the report itself as one SMS (`AGAP|<event id>|…`) to the Textbee phone. The inbound poller turns that text into an incident, keyed on the same event id the app uses, and texts the reference back.

**Purpose**
Give the Operations Center a second, independent channel to learn of a new report, in case nobody is watching the live dashboard or the data connection to it is degraded, without ever letting a messaging failure touch the incident record itself. Give a citizen in a flood zone with no mobile data a way to get the report to MDRRMO anyway.

**Tasks Performed**
1. Builds a compact SMS payload (`AGAP|<reference>|<lat,lng>|<unix time>|<category>|C:<Y/N>`), always truncated to one 160-character segment.
2. Reads the configured MDRRMO operations phone number; skips the SMS, with a log warning, if it's unset or still a placeholder.
3. Queues the SMS job on Redis/BullMQ so sending never blocks the incident-creation request.
4. Sends the queued message through the Textbee gateway API using the configured device.
5. Logs the outcome (sent / gateway-rejected / not-configured) without retrying or altering the incident if it fails.
6. Queues the incident's first SLA check (MOD-41) beside the SMS; the data path (HTTPS and the live dashboard event) runs alongside it, not instead of it.
7. Reads citizen SOS texts received on the Textbee phone (every 15 s) and creates the incident from them: type, GPS (optional), send time and trigger, with the sender's number as the callback number.
8. Texts the sender the incident reference, or tells them to call 911 / MDRRMO when the text cannot be used (unreadable, more than 6 h old, or over the per-number limit).

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Caller's spoken details relayed to the Operations Center operator by phone or radio | The saved incident's reference number, coordinates (or none), submission time and category |
| 2 | Operator's own notes of which incidents have been phoned in | The configured MDRRMO operations phone number (`MDRRMO_OPS_PHONE`) |
| 3 | | Textbee API key and device ID (`TEXTBEE_API_KEY`, `TEXTBEE_DEVICE_ID`) |
| 4 | | The incident's SLA policy, for the first SLA check |
| 5 | | A citizen's SOS text: `AGAP|<event id>|<lat>,<lng>|<unix time>|<type>|C:<Y/N>|T:<S/K/M>`, and the sender's number |
| 6 | | `CITIZEN_SMS_SOS_ENABLED` (backend) and `EXPO_PUBLIC_AGAP_SMS_NUMBER` (app: the Textbee SIM number) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Telephone / radio relay to the Operations Center | `OpsAlertService` (`backend/src/emergency-alerts/ops-alert.service.ts`) — payload build and SMS/SLA queueing |
| 2 | Operator's memory or handwritten note of what was phoned in | Redis + BullMQ SMS queue and worker (`backend/src/jobs/processors/sms.processor.ts`) |
| 3 | | Textbee SMS gateway API (Android device SIM) |
| 4 | | SLA monitor queue (`backend/src/jobs`) for the first SLA check (MOD-41) |
| 5 | | PostgreSQL as the already-persisted source of truth the SMS only announces |
| 6 | | Citizen SOS by SMS: format `shared/src/utils/citizen-sos-sms.ts`; inbound `CitizenSmsSosService` (`backend/src/emergency-alerts/sms-sos/`) via the Textbee poller (`barangay-sms-poller.ts`); app `mobile/src/services/sms/sos-sms.ts` + `mobile/app/emergency/transmission.tsx` |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A citizen or responder calls or radios the Operations Center. |
| 2 | The operator writes the details down and relays them verbally to whoever else needs to know. |
| 3 | If the operator is unreachable, step 1 repeats until someone picks up — there is no independent fallback channel. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal or radioed relay with no independent fallback channel |
| 2 | No record of whether the relay was actually received |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | Another module (MOD-14, emergency-alerts) saves the incident to PostgreSQL first — this module only runs after that write succeeds. | Database |
| 2 | The service builds the compact SMS payload from the saved incident's reference, coordinates, submission time and category, truncated to 160 characters. | Processing |
| 3 | It reads the configured MDRRMO operations phone number; if it's unset or a placeholder, the SMS step is skipped and logged, and nothing else is affected. | Validation |
| 4 | The SMS job is queued on Redis/BullMQ so the incident-creation request is never blocked waiting on it. | Integration |
| 5 | Alongside the SMS, the service queues the incident's first SLA check (MOD-41), while the data path delivers the incident live to the Operations Center dashboard (MOD-20) and the reporter's emergency contacts get their own SMS (MOD-16). | Notification |
| 6 | The SMS worker sends the message through the Textbee gateway API using the configured device. | Integration |
| 7 | If Textbee isn't configured or rejects the request, the error is logged (with guidance to check the API key/device ID) and swallowed — the job resolves without retrying, and the incident is unaffected. | Processing |
| 8 | On success, delivery is logged. Unlike the barangay-notice critical path (a different module), this path does not poll Textbee for a delivered/failed confirmation. | Processing |
| 9 | **Citizen SMS (inbound).** When the app cannot reach the server (no network, 20 s timeout, server error), it offers Send by SMS: the messages app opens with the report text addressed to the Textbee phone, and the citizen presses Send. | Input |
| 10 | The poller reads the text. A known event id returns the existing incident; a text sent more than 6 h ago, an unreadable one or one over the per-number limit (3 per 10 min, 10 per day) is logged with no incident. | Validation |
| 11 | Otherwise the incident is created through the same path as the app (guest reporter, sender = callback number, `report_channel = SMS`, GPS outside Bocaue kept as a note). The ops SMS, SLA checks and dashboard alert follow as in steps 2–5. | Database |
| 12 | The sender gets a reply with the reference, or "call 911 / MDRRMO" when no incident was made. Every inbound text is stored with its outcome and incident. | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | SMS delivered, or skipped/logged, to the Operations Center phone via Textbee |
| 2 | The first SLA check queued for the incident, beside the live dashboard alert (data path) |
| 3 | Log record of the send/skip/failure outcome |
| 4 | No change to the incident record — the message only announces the already-saved incident |
| 5 | For a citizen SOS text: an incident marked "By SMS", the inbound row with its outcome, and a reply SMS to the sender |

---

## Owner notes (not part of the report)

**Test before signing:**
1. With `TEXTBEE_API_KEY`/`TEXTBEE_DEVICE_ID`/`MDRRMO_OPS_PHONE` configured, submit an SOS and confirm the ops phone receives the compact SMS within a few seconds, and that it fits one 160-character segment.
2. Unset `MDRRMO_OPS_PHONE` and confirm the SMS step is skipped (logged warning) without affecting incident creation.
3. Use an invalid Textbee API key and confirm the incident still saves normally; check the log for the gateway-rejected warning.
4. Citizen SMS: set `CITIZEN_SMS_SOS_ENABLED=true` and the app's `EXPO_PUBLIC_AGAP_SMS_NUMBER`; turn mobile data off and send an SOS. Press Send by SMS, then Send. Within about 30 s the incident shows "By SMS" in Live Dispatch with the phone number, and the phone gets the reference. Turn data on: the app resends, the incident gains the account and details, and there is no duplicate.

**Do not claim:**
- A general-purpose multi-channel gateway (email, voice, arbitrary recipients) — this module sends to one configured phone number via Textbee SMS, alongside the HTTPS data path.
- Delivery-confirmation polling on this path — that exists only for barangay critical SMS notices, a different module's code path.
- That the phone sends SMS automatically — the citizen presses Send in the messages app (iOS cannot send silently; Android SEND_SMS is restricted).
- That a citizen SMS arrives instantly — the Textbee phone is polled every 15 s, on top of carrier delivery time.
