# MOD-41 — Dispatcher SLA and Escalation Engine

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

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
Starts three countdowns the moment a new incident is saved (acknowledge, dispatch, first unit on scene), each measured from the report against the response target for the incident's priority, and raises an escalation for any step the incident hasn't reached in time. Each breach notifies the Supervisors on duty (falling back to Dispatchers if no Supervisor can sign in) and appears on the Operations Center's Escalations page, where a Supervisor acknowledges and then resolves it.

**Purpose**
Make sure a report that isn't moving doesn't stay invisible. Dispatchers work many incidents at once; the timer surfaces the ones falling behind instead of relying on someone noticing.

**Tasks Performed**
1. Keeps the response targets (SLA) per priority in one table, editable by a Supervisor or System Administrator on the Response Targets page (every change audited).
2. Schedules the acknowledge, dispatch and on-scene checks for every new incident at once, at its own targets; re-schedules them when a dispatcher changes the priority or a target changes.
3. At each deadline, checks whether the incident reached that step; if not, creates one Escalation record for that step.
4. Notifies on-duty Supervisors by push notification (Dispatchers if none can sign in) and broadcasts the escalation over Socket.io.
5. Lets a Supervisor acknowledge and then resolve an escalation from the Escalations page.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Dispatcher's own sense of how long a call has been waiting | The incident's status and the time it was submitted |
| 2 | A wall clock or incident logbook timestamp, checked manually | The incident's priority and its response targets (seconds) for acknowledge, dispatch and on scene, from the `sla_policies` table |
| 3 | Ad-hoc reminders from radio chatter or other staff | A Supervisor's acknowledge / resolve action on an escalation |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Wall clock / wristwatch | Redis + BullMQ delayed jobs (`backend/src/jobs/processors/sla-monitor.processor.ts`) |
| 2 | Paper logbook with call-in times | `backend/src/escalations` NestJS REST API (Supervisor-only) |
| 3 | Verbal reminders between staff | PostgreSQL `escalations` table |
| 4 | | `backend/src/sla-policies` (targets, scheduling, `GET`/`PATCH /api/v1/sla-policies`) and PostgreSQL `sla_policies` |
| 5 | | Push notifications to Supervisors on duty (Dispatchers as fallback) and a Socket.io broadcast |
| 6 | | Operations Center Escalations and Response Targets pages (`frontend/app/(ops)/operations/escalations`, `…/sla-targets`) |

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
| 1 | Once an incident is saved, the backend looks up the response target for its priority and schedules three checks at once: acknowledge, dispatch and first unit on scene, each measured from the report (e.g. Critical: 1, 2 and 10 minutes). | Integration |
| 2 | At a deadline, the SLA worker loads the incident. A resolved, closed, cancelled or other finished incident is skipped. | Validation |
| 3 | If the incident already reached that step (e.g. it was dispatched, for the dispatch check), the target was met and nothing happens. | Validation |
| 4 | The worker re-reads the target. If the priority was lowered or the target lengthened since, it re-schedules the check for the new deadline instead. | Processing |
| 5 | Otherwise the worker creates one Escalation record for that step (level, reason with the target missed, breach time, the policy used). | Database |
| 6 | The worker pushes a notification to every on-duty Supervisor who can sign in (Dispatchers if none can) and broadcasts the escalation over Socket.io. | Notification |
| 7 | When a dispatcher changes the priority, or a Supervisor changes a target, the checks are re-scheduled at the new deadlines; a step is never escalated twice. | Processing |
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
1. As a Supervisor, open Response Targets and set Low priority to acknowledge 0.5 min, dispatch 1 min, on scene 1.5 min. Submit a test incident (it starts as Low or Medium; set it to Low in Triage). Without acknowledging, confirm an Acknowledge escalation (L1) appears within about 30 seconds of the report.
2. Submit another Low incident, acknowledge it at once, but don't dispatch. Confirm a Dispatch escalation (L2) still appears at about 1 minute. (Before 2026-11-14 this never fired when acknowledgement was on time.)
3. Acknowledge, then resolve an escalation as a Supervisor; confirm the status badge and timestamps update.
4. Open Activity Log and confirm the target change is there (UPDATE, sla_policy, old and new values). Put the targets back afterwards.
5. Sign in as a Dispatcher and confirm Response Targets is not in the sidebar and the Escalations page shows the Supervisor-only message.

**Do not claim:**
- A second escalation pathway exists in the code (`backend/src/jobs/processors/escalation.processor.ts`, listening on a separate `ESCALATION` queue), but nothing in the codebase ever adds a job to that queue — it's registered but never triggered. The timer actually running is `sla-monitor.processor.ts`, chained from `OpsAlertService` when an incident is saved.
- Breach reports from the Escalations page. It is a live list. Compliance figures against the same targets are on Analytics (MOD-50) and its CSV exports.

**Changed 2026-11-14 (SLA single source):**
- Before: the alarm used `DEFAULT_SLA_*` environment variables (never set, so 120 / 300 / 300 s for every priority), ignored `sla_policies`, chained the dispatch check only after a late acknowledgement, and measured it from the breach, not the report. The web console had its own hard-coded copy (`frontend/lib/sla.ts`) used by a component no page rendered.
- Now: `sla_policies` is the only source (fallback 120 / 300 / 900 s only if no policy matches). All three checks are scheduled at submission, from the report, and re-scheduled on a priority or target change. The environment variables, `frontend/lib/sla.ts` and `components/dispatch/IncidentQueue.tsx` are gone.
- Analytics counts an incident still waiting past a target as missed, and reports on-scene compliance too.
