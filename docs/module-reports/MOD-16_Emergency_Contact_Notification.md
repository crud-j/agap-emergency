# MOD-16 — Emergency Contact Notification

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-16 |
| Version | 1.0 |
| Module Name | Emergency Contact Notification |
| Module Cluster | Cluster D — Alert Processing and Dispatch |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
The moment a citizen's report is saved, this module looks up that citizen's own active emergency contacts (MOD-02) and queues one SMS to each of them through the Textbee gateway — fire-and-forget, so a slow or failed SMS can never delay or cancel the incident itself.

**Purpose**
Let the people a citizen already chose — family, a trusted neighbor — find out automatically that an emergency was reported, without the citizen or a dispatcher having to call them one by one while the emergency is still happening.

**Tasks Performed**
1. Reads only that reporter's active contacts, ordered by priority. (Every contact saved in the app is set to receive alerts.)
2. Builds one SMS per contact: reporter's name, incident category, public reference number, cut to 160 characters.
3. Queues each SMS as a separate BullMQ job (`contact-alert`) with 2 retry attempts and a fixed 5-second backoff.
4. Sends each queued SMS through the Textbee gateway (`POST .../gateway/devices/{deviceId}/send-sms`) using the MDRRMO device's own SIM.
5. Swallows any failure (no contacts, Textbee not configured, gateway error) so the incident record is never affected by a notification failure.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Caller's verbally-given relative's name and number, written down on the spot | Reporter's saved emergency contacts (name, phone) |
| 2 | Operator's own phone, used to personally call each relative | Incident's public reference, category, and reporter's name |
| 3 | Operator's memory of which relative to call first | Textbee API key and device ID (`TEXTBEE_API_KEY`, `TEXTBEE_DEVICE_ID`) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Operator's personal or office phone, one call per relative | `EmergencyContactNotificationService.notifyContactsOfIncident` (`backend/src/emergency-contacts/emergency-contact-notification.service.ts`) |
| 2 | Memory of who the caller's relatives are | PostgreSQL `EmergencyContact` table, filtered on active contacts |
| 3 | Paper logbook noting who was called and when | BullMQ `SMS` queue, job name `contact-alert`, `attempts: 2`, fixed 5 s backoff |
| 4 |  | `SmsProcessor` (`backend/src/jobs/processors/sms.processor.ts`) — real Textbee HTTP call via axios, 10 s timeout |
| 5 |  | Textbee SMS gateway (`api.textbee.dev`), Android device + local SIM at the MDRRMO office |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The caller tells the operator who their relatives are and recites or reads out each number from memory. |
| 2 | The operator writes the number in the logbook, then personally dials each relative one at a time. |
| 3 | If a relative doesn't answer, the operator tries again later, in between handling other calls. |
| 4 | None of this is saved for the caller's next emergency — the same numbers have to be given again. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Logbook entry of who was called |
| 2 | A verbal notification to whichever relative answered the phone |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A citizen's incident is saved (MOD-14); the incident creation flow calls `notifyContactsOfIncident` with the reporter's ID, incident ID, public reference and category. | Processing |
| 2 | The service queries `EmergencyContact` for that reporter's active, alert-on contacts, ordered by priority. If there are none, it returns immediately — no job is queued. | Validation |
| 3 | The service builds the message text (`AGAP: {name} reported a {category} emergency. Ref: {reference}. Please stand by. -MDRRMO Bocaue`), truncated to 160 characters if needed. | Processing |
| 4 | One BullMQ job per contact is added in a single `addBulk` call, each carrying the contact's phone number and the message. | Database |
| 5 | `SmsProcessor` picks up each job and POSTs it to the Textbee gateway using the configured API key and device ID. | Notification |
| 6 | A missing Textbee configuration or a gateway error is logged and swallowed — the job resolves without throwing, so BullMQ does not retry endlessly and the incident is never touched. | Validation |
| 7 | If the gateway call throws for any other reason, BullMQ retries up to 2 attempts with a 5-second fixed backoff before giving up. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | One queued SMS job per active, alert-on contact |
| 2 | An SMS delivered to each contact's phone via the Textbee/MDRRMO device SIM |
| 3 | A log line confirming how many contacts were queued, per incident reference |

---

## Owner notes (not part of the report)

**Test before signing:**
1. On a citizen account with one alert-on and one alert-off contact (MOD-02), submit a real SOS and confirm (with Textbee configured and the device loaded) only the alert-on contact's phone receives the SMS.
2. With `TEXTBEE_API_KEY`/`TEXTBEE_DEVICE_ID` unset, submit a report and confirm the incident still saves normally and the backend log shows the SMS was skipped, not retried forever.
3. Submit a report as a citizen with zero emergency contacts and confirm nothing is queued and nothing errors.

**Do not claim:**
- Delivery confirmation for this specific notification path — `notifyContactsOfIncident`'s jobs are fire-and-forget (2 retries, then give up); the delivery-confirmation poll (`DELIVERY_CHECK_JOB`) in the SMS processor exists only for the separate barangay-broadcast path, not for contact alerts.
- A push-notification or in-app channel to emergency contacts — contacts who aren't AGAP users only ever receive the SMS; there is no email or voice channel implemented.
