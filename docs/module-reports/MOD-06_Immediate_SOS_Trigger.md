# MOD-06 — Immediate SOS Trigger / One-Button SOS

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-06 |
| Version | 1.0 |
| Module Name | Immediate SOS Trigger / One-Button SOS |
| Module Cluster | Cluster B — Alert Triggering |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
The large SOS button on the AGAP home screen. The citizen holds it for three seconds, then a short guided flow (location, incident type, details) sends the emergency report to the MDRRMO Operations Center. A person without an account can also report from the sign-up screen.

**Purpose**
Give residents one fast, hard-to-trigger-by-accident way to report an emergency with their location attached, so responders get correct information sooner than through a phone call alone. It complements 911 and the MDRRMO hotline; it does not replace them.

**Tasks Performed**
1. Starts a report when the SOS button is held for three seconds, with vibration and an alert sound while holding.
2. Gives each report a unique key, so a resend never creates a second incident.
3. Guides the reporter through Confirm Location, Incident Type and Details.
4. Sends the report and receives the incident's public reference number.
5. Shows a clear failure message with the 911 and MDRRMO hotlines when sending fails, with a Try Again button.
6. Lets a person without an account report from inside Bocaue (GPS required).

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Phone call to the MDRRMO hotline or 911 | Three-second hold on the SOS button |
| 2 | Caller's verbal description of the location | GPS position (optional when signed in; required inside Bocaue for a report without an account) |
| 3 | Caller's verbal description of the emergency | Incident type: Road incident, Fire or Natural disaster |
| 4 | Caller's name and number | Optional details, photo or video (MOD-09, MOD-10) |
| 5 | | Unique report key created by the app |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Mobile phone (voice call) | AGAP Citizen mobile app (Expo, React Native, Expo Router) |
| 2 | MDRRMO hotline / 911 | Hold-to-SOS button with vibration and sound |
| 3 | Paper logbook or incident form | Expo Location (GPS) and Zustand report draft |
| 4 | Two-way radio to responders | NestJS REST API (`POST /v1/incidents`, sign-in optional, rate-limited) |
| 5 | | PostgreSQL (`incidents`, `incident_reporters`, `incident_locations`, `incident_events`) |
| 6 | | Socket.io (live alert to the Operations Center) and Redis + BullMQ (SMS jobs) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The reporter calls the MDRRMO hotline or 911. |
| 2 | The operator asks what happened and where; the reporter describes the place in words. |
| 3 | The operator writes the details in the logbook or incident form. |
| 4 | The operator asks follow-up questions to pin down the location. |
| 5 | The operator relays the emergency to responders by radio or phone. |
| 6 | If the line is busy or the call drops, the reporter must call again. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Logbook or incident form entry |
| 2 | Verbal relay to responders |
| 3 | Approximate location described in words |
| 4 | Missed or repeated calls when the line is busy |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | On the home screen, the citizen presses and holds SOS. A ring fills over three seconds while the phone vibrates and plays an alert sound; letting go early cancels. | User Action |
| 2 | When the hold completes, the app starts a new report with a unique report key and the trigger "SOS button". | Processing |
| 3 | Confirm Location captures the GPS position and address (MOD-11, MOD-12). A signed-in citizen may continue without a precise location. | Integration |
| 4 | The citizen picks Road incident, Fire or Natural disaster; Continue stays disabled until one is chosen. | Validation |
| 5 | On the Details screen every question is optional; the citizen taps send. | User Action |
| 6 | The backend checks the report: latitude and longitude together, inside Bocaue, and GPS present for a report without an account. | Validation |
| 7 | The backend checks the report key. A key it has seen before returns the existing incident instead of creating a second one. | Validation |
| 8 | In one transaction, the backend saves the incident (status Submitted, reference `INC-YYYY-NNNNNN`, recommended priority), the reporter record, the location and the first timeline event. | Database |
| 9 | After saving, the backend pushes the new incident live to the Operations Center, queues the MDRRMO SMS and the first SLA check (MOD-17, MOD-41), and texts the citizen's emergency contacts (MOD-16). | Notification |
| 10 | The app shows the reference number; a signed-in citizen is taken to live tracking after a few seconds. Photos and videos upload afterwards and never block the report. | Processing |
| 11 | If sending fails, the app shows "Transmission Failed", the error, and "Call 911 or the MDRRMO Hotline immediately", with Try Again (same report key) and Go to Home. | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Saved incident with a public reference number |
| 2 | Reporter record kept separate from any patient record |
| 3 | Live alert on the Operations Center dashboard |
| 4 | Confirmation screen with the reference number, then live tracking |
| 5 | Failure screen with the hotlines and Try Again, when sending fails |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Hold SOS for one second and let go; nothing is sent.
2. Hold for three seconds, finish the flow, and note the reference shown; find it on the web Incident Queue.
3. Turn on airplane mode before sending; check the failure screen and hotline text. Turn data back on and tap Try Again; only one incident is created.
4. From the sign-up screen, report without an account while outside Bocaue (or with GPS off); it is refused.

**Do not claim:**
- A Medical incident type in the app. Only Road incident, Fire and Natural disaster are offered (flooding is filed as Flood).
- Saving a report on the phone to send later (MOD-19 was eliminated).
- `POST /v1/emergency-alerts/sos`. It exists but no screen uses it; the app sends through `POST /v1/incidents`.
