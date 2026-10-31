# MOD-31 — Dispatcher Assignment and Dispatch Authorization

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-31 |
| Version | 1.0 |
| Module Name | Dispatcher Assignment and Dispatch Authorization |
| Module Cluster | Cluster E — Monitoring and Escalation |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Controls who actually gets sent to an incident and records that decision — unit selection, assignment, authorization, crew acceptance, reassignment, and cancellation, all timestamped and audited.

**Purpose**
Enforce one of AGAP's core rules directly in the workflow: dispatch recommendations assist the dispatcher, they never decide on their own. A human always clicks to authorize.

**Tasks Performed**
1. Opens the Dispatch screen for a validated incident (Acknowledged or Assessed), showing the ranked unit recommendation from MOD-30.
2. Lets the dispatcher select a unit and add or remove crew.
3. Requires an explicit "Confirm Dispatch" click as the authorization step — nothing is sent automatically before it.
4. Supports reassigning to a different unit or cancelling the dispatch outright if circumstances change.
5. Persists every assignment, authorization, acceptance, reassignment, and cancellation with timestamps and writes each to the audit trail.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A dispatcher's verbal decision over radio or phone about which unit to send | The incident ID (already Acknowledged or Assessed) and the ranked unit list from resource matching |
| 2 | The reasoning behind that decision, which lives only in the dispatcher's head | The selected unit, optional crew additions/removals, and the dispatcher's explicit confirmation click |
| 3 | A follow-up radio call if the unit needs to be swapped or recalled, with no structured reason recorded | A reassignment or cancellation action with the authenticated dispatcher's identity |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Radio/phone call to assign a unit, with the decision living only in the dispatcher's memory | Operations Center Dispatch screen, `frontend/app/(ops)/operations/dispatch` |
| 2 | A follow-up radio call to reassign or recall, with no written record of why | `backend/src/dispatch/dispatch.service.ts` handling assign, confirm, reassign, and cancel actions |
| 3 | Whatever gets jotted in the logbook afterward, if anything | PostgreSQL persistence of each assignment/authorization/reassignment/cancellation with timestamps |
| 4 | — | Audit-trail write on every consequential dispatch action |
| 5 | — | Socket.io broadcast of dispatch events (`dispatch.created/updated/cancelled`) to authorized clients |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The dispatcher decides which unit to send, based on memory of who's free and where they are. |
| 2 | The decision is communicated by radio or phone call directly to the unit. |
| 3 | If the unit needs to be swapped or recalled, that's another radio call. |
| 4 | Whatever gets written in the logbook afterward is the only record, and it rarely captures the reasoning. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal assignment with no structured record of the decision |
| 2 | No audit trail for a later reassignment or recall |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | From a validated incident (Acknowledged or Assessed), the dispatcher opens the Dispatch screen, which already shows the ranked unit recommendation from MOD-30. | User Action |
| 2 | The dispatcher selects a unit and may add or remove crew members. | User Action |
| 3 | The dispatcher clicks Confirm Dispatch — this explicit click is the authorization; nothing is sent automatically before it. | User Action |
| 4 | The backend validates the request, authenticates the dispatcher, and persists the assignment with an identifier and timestamp. | Database |
| 5 | A dispatch-created event is broadcast live to the responder and to other operations screens. | Notification |
| 6 | If circumstances change, the dispatcher can Reassign to a different unit or Cancel Dispatch; each action is persisted and audited the same way. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A persisted dispatch record with unit, crew, dispatcher, and confirmation timestamp |
| 2 | A live event notifying the assigned responder and other operations screens |
| 3 | An audit-trail entry for the assignment, and for any later reassignment or cancellation |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Open an Assessed incident → Dispatch, pick the recommended unit, add a crew member, and click Confirm Dispatch — confirm the audit entry records the explicit click.
2. Use Reassign to swap the unit, then Cancel Dispatch on a different test incident, and confirm both leave their own audit entries.

**Do not claim:**
- Integration with any external CAD/radio dispatch system.
- Automatic unit mobilization — every dispatch requires the dispatcher's explicit Confirm Dispatch click.
- Implementation boundary: this module does not talk to any outside radio/CAD dispatch system, and it never mobilizes a unit automatically — authorization is always a human decision made through the explicit Confirm Dispatch click.
