# MOD-41 — Dispatcher SLA and Escalation Engine

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-41 |
| Version | 1.0 |
| Module Name | Dispatcher SLA and Escalation Engine |
| Module Cluster | Cluster G — Status, Escalation, and Closure |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Starts a countdown the moment a new incident is saved, and raises an escalation if the incident doesn't move past the Acknowledged → Dispatched → On Scene progression in time. Each breach notifies the Supervisors on duty (falling back to Dispatchers if no Supervisor can sign in) and appears on the Operations Center's Escalations page, where a Supervisor acknowledges and then resolves it.

**Purpose**
Make sure a report that isn't moving doesn't stay invisible. Dispatchers work many incidents at once; the timer surfaces the ones falling behind instead of relying on someone noticing.

**Tasks Performed**
1. Schedules an Acknowledgement-SLA check for every newly submitted incident.
2. At each deadline, checks whether the incident has progressed past that milestone; if not, creates an Escalation record and chains the next tier's timer (Acknowledgement → Dispatch → Response).
3. Notifies on-duty Supervisors by push notification, falling back to Dispatchers if none can sign in.
4. Broadcasts the escalation over Socket.io to the operations room.
5. Lets a Supervisor acknowledge and then resolve an escalation from the Escalations page.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Dispatcher's own sense of how long a call has been waiting | The incident's status and the time it was submitted |
| 2 | A wall clock or incident logbook timestamp, checked manually | The configured SLA thresholds (seconds) for Acknowledgement, Dispatch and Response |
| 3 | Ad-hoc reminders from radio chatter or other staff | A Supervisor's acknowledge / resolve action on an escalation |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Wall clock / wristwatch | Redis + BullMQ delayed jobs (`backend/src/jobs/processors/sla-monitor.processor.ts`) |
| 2 | Paper logbook with call-in times | `backend/src/escalations` NestJS REST API (Supervisor-only) |
| 3 | Verbal reminders between staff | PostgreSQL `escalations` table |
| 4 | | Push notifications to Supervisors on duty (Dispatchers as fallback) |
| 5 | | Socket.io broadcast to the operations room |
| 6 | | Operations Center Escalations page (`frontend/app/(ops)/operations/escalations/page.tsx`) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A dispatcher receives and logs the call, noting the time in the logbook. |
| 2 | No automatic timer tracks how long it's been since. |
| 3 | A delay is noticed only if a dispatcher or supervisor happens to glance at the clock or the logbook. |
| 4 | If missed, the incident sits without acknowledgement until someone manually follows up. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A logged call-in time with no active monitoring |
| 2 | Delays noticed only by chance, not systematically |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | Once an incident is saved, the backend schedules an Acknowledgement-SLA check to fire after the configured threshold (default 120 seconds). | Integration |
| 2 | At the deadline, the SLA worker loads the incident. A closed/cancelled/terminal incident is skipped. | Validation |
| 3 | If the incident's status already passed the milestone for that tier (e.g. Acknowledged or later for the Acknowledgement check), the SLA was met and nothing happens. | Validation |
| 4 | Otherwise the worker creates an Escalation record (level, reason, breach time) tied to the incident. | Database |
| 5 | The worker queues a push notification to every on-duty Supervisor who can sign in; if none can, Dispatchers are notified instead. | Notification |
| 6 | The worker broadcasts the escalation over Socket.io to the operations room. | Notification |
| 7 | If there's a next tier (Acknowledgement → Dispatch, Dispatch → Response), the worker schedules it with its own configured delay. | Processing |
| 8 | A Supervisor opens the Escalations page, filters by status, and reviews the breach reason, level and elapsed time. | User Action |
| 9 | The Supervisor acknowledges the escalation, then resolves it once handled; each action timestamps the record and re-broadcasts the update. | User Action |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A persisted Escalation record (level, reason, breach timestamp) in PostgreSQL |
| 2 | A push notification to the Supervisor(s) on duty, or Dispatchers if none can sign in |
| 3 | A live-updating row on the Escalations page |
| 4 | Acknowledged/resolved timestamps once a Supervisor acts |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Lower `DEFAULT_SLA_ACKNOWLEDGE_SECONDS` in the environment, submit a test incident, and confirm an escalation appears on the Escalations page once the timer elapses.
2. Acknowledge, then resolve the escalation as a Supervisor; confirm the status badge and timestamps update.
3. Sign in as a Dispatcher and confirm the Escalations page shows the Supervisor-only message.

**Do not claim:**
- A second escalation pathway exists in the code (`backend/src/jobs/processors/escalation.processor.ts`, listening on a separate `ESCALATION` queue), but nothing in the codebase ever adds a job to that queue — it's registered but never triggered. The timer actually running is `sla-monitor.processor.ts`, chained from `OpsAlertService` when an incident is saved.
- Breach reports or exportable analytics — the Escalations page is a live list, not a report generator.
