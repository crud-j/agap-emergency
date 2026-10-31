# MOD-25 — Incident Triage and Validation

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-25 |
| Version | 1.0 |
| Module Name | Incident Triage and Validation |
| Module Cluster | Cluster E — Monitoring and Escalation |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Lets a dispatcher verify and improve an incident's information before anything is dispatched — acknowledging it, verifying the location, validating the category, clarifying the patient, checking for hazards, and adding triage notes.

**Purpose**
Act as a quality gate that catches a wrong category or an unclear location before a unit is sent to the wrong place, while being explicit that this is operational triage support for a dispatcher, not certified clinical or medical triage.

**Tasks Performed**
1. Presents incoming incidents in a structured queue with clear states: Submitted, Received, Acknowledged.
2. Lets the dispatcher move an incident forward with explicit actions — Mark Received, Mark Acknowledged, Mark Assessed.
3. Exposes a False Alert action from the Triage page or the incident drawer, blocked unless the incident is actually in a state where that applies (Acknowledged or Assessed).
4. Authenticates and role-checks every transition before applying it.
5. Writes every transition to the audit trail with a timestamp and broadcasts it live to the rest of operations.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A dispatcher's verbal or memory-based decision to call back and confirm a location | The incident's current status (Submitted / Received / Acknowledged / Assessed) |
| 2 | Whatever the dispatcher remembers to write in the logbook after confirming | The explicit triage action selected (Mark Received, Mark Acknowledged, Mark Assessed, False Alert) |
| 3 | No structured record of whether a callback happened at all | The authenticated dispatcher's identity and role, used for the permission check on each action |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Phone/radio callback to the caller to confirm details, done inconsistently depending on workload | Operations Center Triage page, `frontend/app/(ops)/operations/triage` |
| 2 | Logbook entry noting whatever was (or wasn't) confirmed | NestJS triage service validating the current status before allowing each transition |
| 3 | No shared record visible to other staff | PostgreSQL persistence of each state transition with timestamp and actor |
| 4 | — | Audit trail write for every transition (role-checked, attributed) |
| 5 | — | Socket.io broadcast of the status change to other authorized operations screens |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A dispatcher may or may not call back to confirm the location, depending on how busy the shift is. |
| 2 | Whatever gets confirmed is written in the logbook, if at all. |
| 3 | There's no structured state distinguishing "just received" from "verified" — it's whatever the dispatcher remembers. |
| 4 | A report later found to be false is noted informally, with no reliable count kept over time. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | An inconsistent, undocumented verification step |
| 2 | A logbook note that may or may not reflect what was actually confirmed |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The incident lands in the Triage queue already tagged Submitted. | Database |
| 2 | The dispatcher clicks Mark Received; the backend checks the incident is actually in a state that allows this transition. | Validation |
| 3 | The dispatcher clicks Mark Acknowledged, then Mark Assessed as the incident is worked through. | User Action |
| 4 | Each transition is authenticated, role-checked, and written to PostgreSQL with a timestamp. | Database |
| 5 | Each transition is also written to the audit trail and broadcast live, so other operations screens update immediately. | Notification |
| 6 | If the incident turns out not to be real, False Alert is available from the Triage page or the incident drawer — but only while the incident is Acknowledged or Assessed. | Validation |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A status chip that visibly changes with each transition (Received / Acknowledged / Assessed) |
| 2 | A timestamped, attributed audit-trail row for every transition |
| 3 | A False Alert record and status when the dispatcher confirms one |

---

## Owner notes (not part of the report)

**Test before signing:**
1. From Operations → Triage, click Mark Received, then Mark Acknowledged, then Mark Assessed on a test incident and confirm the status chip changes each time.
2. Open the Audit page and confirm a timestamped, attributed row exists for each of those transitions.
3. On a second test incident, Acknowledge it, click False Alert, and confirm the action is accepted only in that state.

**Do not claim:**
- Clinical or certified medical triage — this module supports a dispatcher's operational judgment, it does not diagnose.
- That False Alert is available from any status — it is blocked outside Acknowledged/Assessed.
