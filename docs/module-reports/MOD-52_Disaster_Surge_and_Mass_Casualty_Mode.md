# MOD-52 — Disaster Surge and Mass-Casualty Mode

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-52 |
| Version | 1.0 |
| Module Name | Disaster Surge and Mass-Casualty Mode |
| Module Cluster | Cluster I — Analytics, Intelligence, and Surge |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
For a disaster or mass-casualty event, such as a fireworks explosion in Bundukan or a typhoon flood in Lolomboy, Bunlo, Igulot and Bambang, this module lets an MDRRMO Supervisor run a controlled surge period. The system watches incident volume and the Bocaue River level and recommends surge mode; the Supervisor activates it, follows a live triage board and the resources and rescue totals, sends a broadcast to all responders, and deactivates it at the end.

**Purpose**
Scale coordination beyond what a single-incident, one-radio-channel model can handle, and warn the Supervisor early when the number of reports or the river level says a surge is coming. The system recommends; only the Supervisor activates.

**Tasks Performed**
1. Every 5 minutes, checks the surge rules (incident counts in a time window, by category and barangay) and the latest river reading (11.50 m or more in the last 6 hours), and recommends surge mode to every Supervisor. It never activates surge mode by itself.
2. Lets the Supervisor edit the rules and enter the Bocaue River level.
3. Lets the Supervisor activate surge mode with a name, category, affected barangays and river level (one surge at a time).
4. Shows a live triage board of the START tags (Red, Yellow, Green, Black) that responders file from the on-scene assessment during the surge.
5. Shows a municipality-wide resources summary and rescue totals per barangay (rescued and still waiting) from rescue crews' trip reports.
6. Sends a surge broadcast to every responder, and deactivates surge mode to close the operational period.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | The same single-incident radio-call workflow used for an ordinary emergency, regardless of scale | Recent incident reports (category, barangay, time) and the surge rules (window, minimum count, category, barangays) |
| 2 | River gauge readings relayed by phone | Bocaue River level reading entered by the Supervisor |
| 3 | Ad hoc, verbal coordination as multiple agencies converge on scene | Supervisor's activation details: name, description, category, affected barangays, river level |
| 4 | No structured resource picture once the event grows beyond one unit | Triage tags filed by responders, and rescue trip reports from rescue crews |
| 5 | | Broadcast message, and the Supervisor's Deactivate action |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Radio calls managed the same way for one patient or fifty | Operations web console Surge page (Next.js): recommendation banner, rules editor, river level, triage board, resources, rescue by barangay, broadcast |
| 2 | No major-event mode — every report stands alone | NestJS REST API (`/v1/disaster-mode/...`) with Supervisor-only actions |
| 3 | No rapid triage-tag tool — triage is verbal | Scheduled surge detector (every 5 minutes) |
| 4 | — | PostgreSQL (`surge_incidents`, `surge_rules`, `surge_settings`, `triage_tags`, audit log) |
| 5 | — | In-app notices to Supervisors and responders, and Socket.io events (`surge.recommended`, `surge.triage_tag_updated`) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The MDRRMO realizes an event has become a disaster only when calls pile up or the river gauge is phoned in. |
| 2 | Each casualty is handled as its own radio call, with triage done verbally on scene. |
| 3 | Staff ask around by radio to learn which units are still free. |
| 4 | Instructions to all responders go out by radio, one channel at a time. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A late, verbal decision to treat the event as a disaster |
| 2 | No shared count of casualties by triage color, units available, or people rescued |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The Supervisor enters the latest Bocaue River reading and, if needed, adjusts the surge rules on the Surge page; each change is audited. | User Action |
| 2 | Every 5 minutes, the system counts recent incidents (leaving out drafts, cancelled, false and duplicate reports) for each active rule, and checks whether the river reading is 11.50 m or more and less than 6 hours old. It skips the check while a surge is already active. | Validation |
| 3 | When a rule trips, each Supervisor gets one "Surge mode recommended" notice (for example "5 FLOOD incidents in Bunlo in 30 min"), at most once an hour per rule, and the Surge page shows a Recommended banner. | Notification |
| 4 | The Supervisor clicks Activate on the banner, or activates manually, and confirms the prefilled name, category, affected barangays and river level. The system never activates by itself. | User Action |
| 5 | The backend refuses a second active surge, saves the surge, and writes an audit entry. | Database |
| 6 | During the surge, responders' on-scene assessments with a START tag (MOD-37) are added to the triage board, which updates live for every viewer. | Processing |
| 7 | The Surge page shows the resources summary and rescue totals per barangay from rescue crews' trip reports (MOD-32). | Processing |
| 8 | The Supervisor sends a surge broadcast; every responder gets it as an in-app notice, and the number reached is recorded and audited. | Notification |
| 9 | The Supervisor deactivates surge mode, closing the operational period. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Surge recommendation notices to Supervisors and a Recommended banner |
| 2 | Saved surge period with its activation details, and audit entries |
| 3 | Live triage board by START color |
| 4 | Resources summary and rescue totals per barangay |
| 5 | Surge broadcast delivered to responders, and a closed operational period on deactivation |

---

## Owner notes (not part of the report)

**Test before signing:**
1. As `supervisor@mdrrmo.bocaue.gov.ph`, enter a river level of 11.6 m; within 5 minutes a "Surge mode recommended" notice and banner should appear.
2. Click Activate on the banner and confirm the form is prefilled.
3. As a responder, submit an on-scene assessment with a Red tag; confirm it appears on the triage board in a second browser within a few seconds.
4. Send a broadcast and confirm it reaches the responder app; deactivate surge mode.

**Do not claim:**
- Automatic activation. The detector only recommends.
- Linking incidents to a surge from a screen. The backend `POST /v1/disaster-mode/incidents` exists, but no page uses it.
- A certified mass-casualty command system or integration with any external EOC software.
- The rule thresholds as MDRRMO-approved: they are editable defaults until MDRRMO Bocaue confirms them.
