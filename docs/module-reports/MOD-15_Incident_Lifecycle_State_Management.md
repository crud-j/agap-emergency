# MOD-15 — Incident Lifecycle State Management

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-15 |
| Version | 1.0 |
| Module Name | Incident Lifecycle State Management |
| Module Cluster | Cluster D — Alert Processing and Dispatch |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Enforces the incident status state machine behind every ticket: which status can move to which next status, who is allowed to move it, and the timestamped, append-only event this produces. A status change a role isn't permitted to make, or a transition that skips steps, is rejected before it touches the record.

**Purpose**
Keep the incident's status trustworthy for every other module (dispatch, tracking, hospital coordination, closure, analytics) by making it impossible to jump straight from "reported" to "closed," reopen a finished case, or have a citizen acknowledge their own report.

**Tasks Performed**
1. Defines the full status set (DRAFT through CLOSED and the terminal alternatives CANCELLED, FALSE_ALERT, DUPLICATE, UNABLE_TO_RESPOND, REFERRED) and which transitions are allowed from each one.
2. Rejects any transition not in the allowed list, and any transition at all once a status is terminal.
3. Restricts who can trigger a transition by role (e.g. only a dispatcher or supervisor can acknowledge, assess or close; a responder cannot close).
4. Stamps the matching timestamp column (`acknowledged_at`, `dispatched_at`, `resolved_at`, etc.) when a transition reaches that status.
5. Appends an immutable `incident_events` row for every transition, recording the previous status, new status, actor and optional reason.
6. Writes an audit-trail entry (MOD-46) for every status change, separate from the incident event.
7. Notifies the Operations Center dashboard and the reporter's own status screen (MOD-42) of the change, best-effort.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Operator's verbal or written note of the case's current state | Incident ID and its current status |
| 2 | Dispatcher's own memory of what's already been done for a case | Requested next status |
| 3 | Radio call or hallway conversation about what happened next | Authenticated actor and role (JWT) |
| 4 |  | Optional reason/notes for the transition |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Logbook entries and a shared whiteboard | `IncidentStatusService.validateTransition` (`backend/src/incidents/incident-status/incident-status.service.ts`) |
| 2 | Verbal handoffs between shifts | `INCIDENT_STATUS_TRANSITIONS` / `TERMINAL_INCIDENT_STATUSES` (`@agap/shared`) — one shared transition table used by the backend and, for display, the apps |
| 3 | Operator's personal recollection of a case's history | `IncidentsController` role guards (`@Roles(...)`) per status-change endpoint |
| 4 |  | `PATCH /api/v1/incidents/:id/status`, plus dedicated routes (`/acknowledge`, `/assess`, `/false-alert`, `/duplicate`, `/merge`, `/close`) |
| 5 |  | PostgreSQL (`incident_events`, status timestamp columns on `incidents`) |
| 6 |  | `AuditService` (MOD-46) and `RealtimeService` (Socket.io, best-effort) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | Staff track a case's progress from memory, the logbook and a shared whiteboard. |
| 2 | Any staff member can write any status on the whiteboard, in any order, with nothing stopping an out-of-sequence or incomplete update. |
| 3 | A finished case is erased from the whiteboard to make room; there's no record stopping someone from writing on it again. |
| 4 | Handoffs between shifts rely on a verbal briefing, which can miss a step that was done or skip a check that wasn't. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Whiteboard/logbook note of the case's last known state |
| 2 | A verbal shift-handoff briefing, not written down |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A dispatcher, supervisor or responder (role-dependent per endpoint) requests a status change, either `PATCH /:id/status` with an explicit target status, or a dedicated shortcut route (`/acknowledge`, `/assess`, `/false-alert`, `/duplicate`, `/merge`, `/close`). | User Action |
| 2 | `RolesGuard` checks the actor's role is permitted for that route before the request reaches the service (e.g. a responder cannot call `/close`). | Validation |
| 3 | `IncidentStatusService.validateTransition` checks the incident isn't already in a terminal status, and that the requested status is in `INCIDENT_STATUS_TRANSITIONS[currentStatus]`; an invalid move is rejected with the allowed list in the error. | Validation |
| 4 | The backend updates `incidents.status` and the matching timestamp column (e.g. `acknowledged_at` on ACKNOWLEDGED) in the same transaction. | Database |
| 5 | The backend appends an `incident_events` row recording the previous status, new status, actor and optional reason — an immutable part of the incident's timeline. | Database |
| 6 | A false-alert or duplicate transition additionally writes its own record (`false_alerts`, or `duplicate_of_id` on the incident) in the same transaction (MOD-08/MOD-26). | Database |
| 7 | The backend writes an audit-trail entry for the status change (`AuditAction.STATUS_CHANGE`), separate from the incident event (MOD-46). | Processing |
| 8 | The backend emits `incident.status_changed` (and, for milestone statuses, a dedicated lifecycle event) to the Operations Center and the incident's Socket.io room, best-effort. | Notification |
| 9 | The backend notifies the reporter's status screen of the change, best-effort and never blocking the already-committed transition (MOD-42). | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Updated `incidents.status` plus its matching timestamp column |
| 2 | Appended, immutable `incident_events` timeline row |
| 3 | Audit-trail entry attributing the change to its actor |
| 4 | Real-time status update to the Operations Center and the reporter |
| 5 | Rejected request (with the allowed next statuses) for an invalid or unauthorized transition |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Try to move a SUBMITTED incident straight to CLOSED; confirm it's rejected and the allowed-transitions list is returned.
2. As a responder, try to call `/close`; confirm the role guard rejects it.
3. Close an incident, then try any further transition on it; confirm it's rejected as terminal.
4. Run a valid sequence (acknowledge → assess → …) and confirm `incident_events` gains one row per step with the correct actor and timestamps.

**Do not claim:**
- Automatic/timed lifecycle progression. Every transition is actor-triggered; nothing advances a status on its own.
- Reopening a terminal incident. CLOSED, CANCELLED, FALSE_ALERT and DUPLICATE have no outgoing transitions.
