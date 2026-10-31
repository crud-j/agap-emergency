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
During a real event the same emergency is often reported more than once, by different bystanders from different phones. This module finds those probable duplicates using time and location closeness (via PostGIS), category similarity, and text similarity, and surfaces ranked candidates for a dispatcher to review.

**Purpose**
Avoid wasting a scarce unit on a response that duplicates one already mobilized, while keeping the merge decision in human hands — nothing merges automatically.

**Tasks Performed**
1. Compares each new incident against recent open incidents by distance, time window, category, and description similarity.
2. Ranks and surfaces likely duplicate candidates directly in the dispatcher's incident workflow.
3. Requires the dispatcher's explicit confirmation before merging two incidents.
4. Designates one incident as the master and preserves the other's full history rather than deleting it.
5. Records every candidate match and every merge decision to the audit trail.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | The operator's memory of a similar call just received, or a lucky cross-check of the logbook | Two or more incident records with location, time, category, and description |
| 2 | No systematic check against recently opened reports | The computed similarity factors (distance, time window, category match, text similarity) |
| 3 | No shared record if the first operator doesn't happen to notice | The dispatcher's explicit confirm-or-decline decision on a surfaced candidate |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Operator's memory and a manual cross-check of the paper/spreadsheet logbook | `backend/src/incidents/duplicate-detection/` service comparing new incidents against recent open ones |
| 2 | No distance or time-window calculation — purely recall-based | PostGIS distance calculation and a time-window check between candidate incidents |
| 3 | No category or text comparison tool | Category-match and description text-similarity scoring |
| 4 | — | Dispatcher-facing candidate surfacing inside the incident workflow, with explicit confirm/decline |
| 5 | — | PostgreSQL persistence of the merge (master incident retains both reports' history) and an audit-trail entry per decision |

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
| 2 | The duplicate-detection service compares it against recent open incidents by distance, time window, category, and description similarity. | Processing |
| 3 | Likely candidates are ranked and surfaced to the dispatcher directly inside the incident workflow. | Notification |
| 4 | The dispatcher reviews the candidate and either confirms or declines the merge. | User Action |
| 5 | On confirmation, the system designates one incident as the master and preserves the other's history rather than deleting it. | Database |
| 6 | Every candidate match and every merge decision — confirmed or declined — is written to the audit trail. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A ranked list of probable duplicate candidates shown to the dispatcher |
| 2 | A master incident record preserving both reports' history after a confirmed merge |
| 3 | An audit-trail entry for every surfaced candidate and every merge decision |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Submit two SOS reports of the same category, close together in time and location (from two different phones or sessions); open either incident and confirm the possible-duplicate candidate is surfaced.
2. Confirm a merge and verify the master incident retains both reports' history rather than deleting one; separately, decline a merge candidate and confirm nothing changes.

**Do not claim:**
- A guaranteed or AI-validated duplicate match — this surfaces probable candidates for a human to judge.
- Automatic or lossless merging — every merge requires explicit dispatcher confirmation.
