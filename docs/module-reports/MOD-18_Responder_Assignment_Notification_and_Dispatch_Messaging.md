# MOD-18 — Responder Assignment Notification and Dispatch Messaging

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-18 |
| Version | 1.0 |
| Module Name | Responder Assignment Notification and Dispatch Messaging |
| Module Cluster | Cluster D — Alert Processing and Dispatch |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
When a dispatcher authorizes a dispatch (MOD-31), this module is what carries that decision outward: it marks the unit DISPATCHED in the database, broadcasts the assignment over Socket.io to the incident and operations rooms, tells the reporter "help is on the way," and later relays the responder's own status changes (en route, on scene, transporting) back to the dispatcher who assigned them.

**Purpose**
Give the dispatcher and the reporter a record-backed assignment message instead of a radio call — and let the dispatcher hear automatically when their assigned unit's status changes, without having to ask over the radio.

**Tasks Performed**
1. Creates the `dispatches` row and marks the resource `DISPATCHED`, inside one database transaction with the incident's status change.
2. Writes an audit entry (`MOD-31`) for the dispatch, every reassignment, cancellation, and crew add/remove.
3. Broadcasts `incident.assigned`, `incident.status_changed`, `dispatch.created`, and `resource.status_changed` to the ops room and the incident's room.
4. Notifies the reporter ("Help is on the way") through the in-app feed and a queued push job.
5. Notifies the assigning dispatcher's console bell when the responder's own status changes (en route, on scene, transporting, resolved) — `IncidentStatusNotifier.notifyDispatcher`.
6. Supports cancel, reassign (cancel + recreate against a new resource), and add/remove crew, each audited and broadcast.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Dispatcher's verbal instruction over the radio to a specific unit | Incident ID, resource (unit) ID, optional crew IDs and dispatch notes |
| 2 | Crew's verbal acknowledgement over the radio | Dispatcher's authenticated identity (JWT), confirming the assignment |
| 3 | Responder's radioed status updates (en route, on scene, etc.) | Responder's own status-change actions from the mobile app (separate from this module, consumed by it) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Two-way radio to the unit | `DispatchService.create` (`backend/src/dispatch/dispatch.service.ts`, 399 lines) — transactional dispatch creation with row-level locking on responder availability |
| 2 | Verbal confirmation back to the dispatcher | `POST /api/v1/dispatch`, `PATCH /dispatch/:id/cancel`, `PATCH /dispatch/:id/reassign`, `POST/DELETE /dispatch/:id/crew` (`backend/src/dispatch/dispatch.controller.ts`) |
| 3 | Dispatcher's memory/logbook of who is assigned where | `RealtimeService`/`AgapGateway` — `incidentAssigned`, `notifyIncidentStatusChanged`, `notifyDispatchCreated`, `resourceStatusChanged` emits |
| 4 |  | `IncidentStatusNotifier` (`backend/src/notifications/incident-status-notifier.ts`) — reporter push + in-app feed row; dispatcher in-app bell on responder progress |
| 5 |  | `AuditService` — one audit row per dispatch, cancel, reassign, crew change (`moduleId: 'MOD-31'`) |
| 6 |  | Mobile: `mobile/app/responder/assignments.tsx` + `useResponderAssignments` hook — REST poll, `refetchInterval: 15_000` |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The dispatcher picks a unit from memory or by asking around on the radio, then calls that unit directly. |
| 2 | The crew verbally acknowledges and begins moving; nothing records when the message was actually heard. |
| 3 | As the crew's status changes (en route, on scene), they radio it in, and the dispatcher writes it on a whiteboard or logbook. |
| 4 | If the unit needs to be swapped or recalled, that is another radio call with no structured record of why. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Verbal assignment with no delivery confirmation |
| 2 | Whiteboard/logbook entries of status changes, as radioed in |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The dispatcher opens Dispatch on an Acknowledged/Assessed incident, picks a unit (optionally from MOD-30's ranked list) and clicks Confirm Dispatch. | User Action |
| 2 | The backend checks the incident is in a dispatchable status and the resource is `AVAILABLE`; any named crew's availability rows are locked and checked before the dispatch commits. | Validation |
| 3 | In one transaction: the `dispatches` row is created PENDING, the resource is marked `DISPATCHED`, the incident is marked `DISPATCHED`, and an `incidentEvent` row is written. | Database |
| 4 | An audit row (`MOD-31`, action `DISPATCH`) is written with the resource and crew IDs. | Database |
| 5 | The backend emits `incident.assigned`, `incident.status_changed`, `dispatch.created`, and `resource.status_changed` to the ops room and the incident's room — best-effort, never blocking the dispatch itself if the emit fails. | Notification |
| 6 | The reporter gets an in-app feed row and a queued push ("Help is on the way") via `IncidentStatusNotifier.notifyReporter`. | Notification |
| 7 | As the assigned responder changes their own status (en route, on scene, transporting, resolved) elsewhere in the app, `IncidentStatusNotifier.notifyDispatcher` writes an in-app bell notification for the dispatcher who made the assignment. | Notification |
| 8 | The dispatcher can cancel (frees the resource, broadcasts `dispatch.cancelled`), reassign (cancel + re-create against a new resource), or add/remove crew — each audited and broadcast the same way. | Processing |
| 9 | On the responder's phone, the assignment surfaces in the Missions list, which polls `GET` assignments every 15 seconds and on pull-to-refresh. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Persisted `dispatches` row, audit trail, and incident-event entry for the assignment |
| 2 | Live ops/incident-room broadcast of the assignment and resource status change |
| 3 | Reporter push/in-app notice that responders are en route |
| 4 | Dispatcher in-app notice as the responder's status progresses |
| 5 | Responder's assignment visible in the mobile Missions list within 15 seconds |

---

## Owner notes (not part of the report)

**Test before signing:**
1. As a dispatcher, confirm a dispatch and check two open dispatcher browser windows both see the new assignment with no manual refresh (ops room broadcast).
2. On the assigned responder's phone, time how long the new assignment takes to appear in Missions without pulling to refresh — it should be at most ~15 seconds.
3. Advance the responder to En Route/On Scene and confirm the assigning dispatcher's notification bell picks it up.
4. Try dispatching an already-`DISPATCHED` resource and confirm it's rejected (`Resource is not available`).

**Do not claim:**
- A push notification to the responder's phone for a brand-new assignment. `incidentAssigned` is broadcast only to the ops room and the incident's own Socket.io room — not to the responder's personal `user:{id}` room — and the mobile Missions screen has no socket listener for it at all; `useResponderAssignments` is a plain 15-second REST poll (`refetchInterval: 15_000` in `mobile/src/hooks/useResponderAssignments.ts`). A responder only learns of a new assignment when the app happens to poll next, or by manually pulling to refresh.
- Messaging to a unit or crew outside AGAP (no external-agency radio/CAD bridge) — assignment always targets an AGAP-registered resource and user.
