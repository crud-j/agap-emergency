# MOD-37 — On-Scene Patient Assessment

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-37 |
| Version | 1.0 |
| Module Name | On-Scene Patient Assessment |
| Module Cluster | Cluster F — Field Response and Coordination |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Gives a responder on scene a structured way to record what they find on the patient — symptoms, observations, vital signs, interventions given, and the exact time of each — instead of carrying it all in their head or on a scrap of paper.

**Purpose**
Improve the flow of information from the scene to the rest of the system; it supports more than one patient per incident and explicitly supports an unknown patient, because a responder sometimes doesn't know who they're treating yet. It does not and cannot guarantee a medical outcome — that's a clinical matter, not a software one.

**Tasks Performed**
1. Lets the responder mark the patient's reference, or mark the patient as unknown.
2. Records symptoms, vitals, observations, and interventions, each timestamped automatically.
3. Supports more than one patient per incident.
4. Validates the fields and confirms the responder is signed in and authorized for this specific incident.
5. Persists the record permanently to PostgreSQL, linked to the incident and the responder, and writes the save to the audit trail.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Verbal radio or phone report of what the responder found on the patient | Patient reference, or an explicit "unknown patient" marker |
| 2 | A handwritten paper patient-care form filled out by the responder | Symptoms, vital signs, observations, and interventions |
| 3 | A logbook or spreadsheet entry made after the fact | The authenticated responder's identity and the incident they're authorized for |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Radio/phone report of findings, or a paper patient-care form filled out by hand | Mobile assessment screen, `mobile/app/responder/assessment/[id].tsx` |
| 2 | A logbook or spreadsheet entry made after the fact, with any follow-up relayed again by voice | `backend/src/incidents/assessment` service persisting the structured record |
| 3 | Nothing structured or searchable later | PostgreSQL persistence linked to the incident and responder, with an audit-trail write on save |
| 4 | — | Live broadcast of the saved assessment to the operations side |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The responder's findings travel by radio, phone, or a paper patient-care form filled out by hand. |
| 2 | The operator or responder writes down whatever the caller or patient's companions say, checked against whatever records are on hand. |
| 3 | The result ends up in a logbook or spreadsheet. |
| 4 | Any follow-up — a status change, an exception — is relayed again by voice. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A handwritten patient-care form or logbook entry |
| 2 | A verbal follow-up relay with nothing structured or searchable later |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The responder opens the assessment screen on their assigned incident in the mobile app. | User Action |
| 2 | They enter the patient's reference (or mark the patient as unknown), symptoms, vitals, observations, and interventions, each timestamped automatically. | User Action |
| 3 | The app and backend validate the fields and confirm the responder is signed in and actually authorized for this incident. | Validation |
| 4 | The assessment service persists the record permanently to PostgreSQL, linked to the incident and the responder. | Database |
| 5 | The save is written to the audit trail. | Database |
| 6 | The assessment becomes visible to the dispatcher and supervisor through the incident's record on the web side. | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A persisted, timestamped patient assessment linked to the incident and responder |
| 2 | An audit-trail entry recording the save |
| 3 | A live view of the assessment in the web Incident Command Queue drawer |

---

## Owner notes (not part of the report)

**Test before signing:**
1. On the responder phone, mark an assignment On Scene, open Patient Assessment, enter a patient/unknown status, a symptom, a vital sign, an observation, and an intervention, then submit.
2. On the web Operations Center, open the same incident in the Incident Command Queue drawer and confirm the assessment and its audit-trail entry appear.

**Do not claim:**
- A full electronic patient-care record, a diagnosis tool, or a clinical-device integration.
- Any guarantee of a medical outcome — this is a structured field note, not a clinical judgment.
- Implementation boundary: this module is not a full clinical chart, a diagnosis tool, or a medical-device integration — it is a structured field note, not an electronic patient-care record.
