# MOD-26 — Duplicate Incident Detection and Merging

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-26 |
| Version | 1.0 |
| Module Name | Duplicate Incident Detection and Merging |
| Module Cluster | Cluster E — Monitoring and Escalation |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
During a real event the same emergency is often reported more than once, by different bystanders from different phones. This module shows the dispatcher, on the Triage page, other recent reports of the same category made within 15 minutes and 200 metres, nearest first, and lets the dispatcher merge a report into the one it duplicates.

**Purpose**
Avoid wasting a scarce unit on a response that duplicates one already mobilized, while keeping the merge decision in human hands — nothing merges automatically.

**Tasks Performed**
1. Finds other open reports of the same category made within 15 minutes and 200 metres of the report being triaged.
2. Lists those candidates on the Triage page, nearest first, with their distance.
3. Requires the dispatcher's explicit confirmation before merging two incidents.
4. Designates one incident as the master and preserves the other's full history rather than deleting it.
5. Records every merge on the incident's timeline and in the audit trail.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | The operator's memory of a similar call just received, or a lucky cross-check of the logbook | Two or more incident records with location, time, category, and description |
| 2 | No systematic check against recently opened reports | The matching rules: same category, within 15 minutes and 200 metres |
| 3 | No shared record if the first operator doesn't happen to notice | The dispatcher's Merge choice and its confirmation |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Operator's memory and a manual cross-check of the paper/spreadsheet logbook | `backend/src/incidents/duplicate-detection/` service comparing new incidents against recent open ones |
| 2 | No distance or time-window calculation — purely recall-based | Distance and time-window check between reports (shared thresholds: 15 minutes, 200 metres) |
| 3 | No category or text comparison tool | Operations web console Triage page (Next.js) with a Possible duplicates panel |
| 4 | — | NestJS REST API `POST /v1/incidents/:id/merge` (Dispatcher, Supervisor) |
| 5 | — | PostgreSQL persistence of the merge (the duplicate keeps its own history and points to its master) and an audit-trail entry per merge |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The same emergency is called in twice by different bystanders. |
| 2 | Noticing the duplicate depends entirely on the operator's memory or a lucky cross-check of the logbook. |
| 3 | If it goes unnoticed, two separate responses can be mobilized for one single event. |
| 4 | A scarce unit is wasted on a response that duplicates one already sent. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Two independent, unlinked logbook entries for the same event |
| 2 | Possibly two units mobilized for one emergency, with no way to catch it reliably |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A new incident is submitted and saved. | Database |
| 2 | When the dispatcher opens the report on the Triage page, the page looks for other open reports of the same category made within 15 minutes and 200 metres of it. | Processing |
| 3 | Matching reports are listed in a Possible duplicates panel, nearest first, with their reference and distance. | Processing |
| 4 | The dispatcher clicks Merge on the report it duplicates and confirms; or leaves the list alone if it is a separate emergency. | User Action |
| 5 | The backend refuses merging a report into itself, into a report that is itself a duplicate, or a report that is already finished. Otherwise it sets the report to Duplicate, links it to its master, and keeps its history; nothing is deleted. | Validation |
| 6 | The merge is written to the report's timeline and the audit trail, and broadcast live so other screens update. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A list of possible duplicates, nearest first, shown to the dispatcher |
| 2 | The duplicate report marked Duplicate and linked to its master, with both histories kept |
| 3 | A timeline event and audit-trail entry for every merge |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Submit two SOS reports of the same category, close together in time and location (from two different phones or sessions); open the newer one on the Triage page and confirm the other is listed under Possible duplicates.
2. Click Merge, confirm, and check the newer report shows Duplicate with a link to the master, its timeline is kept, and an audit row exists.

**Do not claim:**
- A guaranteed or AI-validated duplicate match, or text similarity — the list uses category, time and distance only, for a human to judge.
- A record of a dispatcher deciding *not* to merge. Only merges are recorded.
- Automatic or lossless merging — every merge requires explicit dispatcher confirmation.
