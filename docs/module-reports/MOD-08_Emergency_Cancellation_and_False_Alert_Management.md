# MOD-08 — Emergency Cancellation and False Alert Management

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-08 |
| Version | 1.0 |
| Module Name | Emergency Cancellation and False Alert Management |
| Module Cluster | Cluster B — Alert Triggering |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Handles reports that should not lead to a response. The citizen who sent a report can cancel it, with a reason, until a unit is dispatched. A dispatcher or supervisor can mark an acknowledged report as a false alert from the Triage page. Both are recorded, audited and shown on the dashboard immediately.

**Purpose**
Keep responders from being sent to emergencies that ended or never happened, while keeping a complete record of every cancelled or false report for review and analytics.

**Tasks Performed**
1. Lets the reporter cancel their own report before dispatch, after a warning to call 911 if it is a real emergency.
2. Records the cancellation reason (accidental trigger, situation resolved, already reported, wrong app or test, other).
3. Lets a dispatcher or supervisor classify an acknowledged or assessed report as a false alert, from the Triage page or the incident drawer.
4. Refuses either action once the incident's status no longer allows it.
5. Writes an audit entry and updates the dashboard live for both actions.
6. Tells the reporter when their report is closed as a false alert.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Call-back from the reporter saying it was a mistake | Reporter's cancellation request on their incident screen |
| 2 | Operator's judgment that a call was a prank or error | Cancellation reason (one of five) |
| 3 | | Dispatcher's False Alert action (Triage page or incident drawer) |
| 4 | | Incident's current status (checked by the system) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Telephone / MDRRMO hotline | AGAP Citizen mobile app (incident screen and Cancel screen) |
| 2 | Paper logbook | AGAP Operations Center web app (Triage page and incident drawer, Next.js) |
| 3 | Two-way radio to recall responders | NestJS REST API (`PATCH /v1/false-alerts/:id/cancel`, `POST /v1/incidents/:id/false-alert`, `PATCH /v1/incidents/:id/status`) |
| 4 | | Shared status transition rules (`@agap/shared`) |
| 5 | | PostgreSQL (`incidents`, `incident_events`, `false_alerts`, `audit_logs`) |
| 6 | | Socket.io status events and the reporter notification service |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A caller who reported by mistake, or whose emergency ended, calls the hotline again. |
| 2 | The operator finds the entry in the logbook and writes a note. |
| 3 | If responders were already sent, the operator recalls them by radio. |
| 4 | Prank or false calls are judged by the operator and noted, if at all. |
| 5 | There is no count of cancelled or false reports for review. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Handwritten note in the logbook |
| 2 | Radio recall of responders |
| 3 | No reliable record of false or cancelled reports |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The reporter opens their incident in the app and taps Cancel. A warning says to call 911 or the MDRRMO hotline if it is a real emergency; the reporter taps Proceed or Keep Active. | User Action |
| 2 | The Cancel screen lists five reasons; the reporter picks one, then confirms on a second screen. | User Action |
| 3 | The backend checks that the person is the incident's reporter and that the incident is not yet dispatched, and that the status rules allow cancelling. | Validation |
| 4 | The backend sets the incident to Cancelled and saves a timeline event with the reason. | Database |
| 5 | The backend writes an audit entry and pushes the status change to the Operations Center. | Notification |
| 6 | A dispatcher reviewing a report taps False Alert on the Triage page (Acknowledged reports), or False alert then Confirm false alert in the incident drawer (Acknowledged or Assessed). | User Action |
| 7 | The backend checks the status rules (only Acknowledged or Assessed reports can be marked false). | Validation |
| 8 | The backend sets the incident to False Alert and saves a false-alert record and a timeline event. | Database |
| 9 | The backend writes an audit entry, updates the dashboard live, closes any barangay alert, and notifies the reporter that the report was closed as a false alert (with the 911 advice). | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Cancelled incident with the reason in its timeline |
| 2 | False-alert record linked to the incident |
| 3 | Audit entries for each cancellation and false alert |
| 4 | Live status update on the Operations Center dashboard |
| 5 | Notice to the reporter when the report is closed as a false alert |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Send a test report, then cancel it from the app with "Accidental trigger"; check the timeline note and the audit viewer.
2. Dispatch a test report, then try to cancel it from the app; it is refused.
3. On Triage, acknowledge a report, then tap False Alert; check the status, the audit viewer and the reporter's notice.
4. Try False Alert on a Closed incident through the API; it is refused (fixed 2026-10-23).

**Do not claim:**
- A notice to the reporter after they cancel their own report (they started it; only the dashboard is updated).
- Notes on a false alert. Neither button asks for them. The Triage button acts on one tap; the drawer asks for a second tap to confirm.
- Cancelling after dispatch from the app.

**Changed 2026-10-23:** the Triage False Alert now checks the status rules and writes an audit entry, and the drawer's false alert now saves a false-alert record too (before, only the Triage button did, so analytics missed drawer-marked false alerts).
