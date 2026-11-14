# MOD-28 — Response Unit Availability and Readiness

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-28 |
| Version | 1.0 |
| Module Name | Response Unit Availability and Readiness |
| Module Cluster | Cluster E — Monitoring and Escalation |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Maintains, in real time, every unit's current status — available, assigned, en route, on scene, unavailable, or in maintenance — along with crew/vehicle readiness, location, and timestamps.

**Purpose**
Give the dispatcher a single, always-current board to check before recommending or authorizing any dispatch, instead of having to call around to ask who's free.

**Tasks Performed**
1. Shows a live status summary and, for a unit not on a dispatch, a dropdown to set it Available, Out of service, Offline or Reserved from the web Fleet board.
2. Moves a dispatched unit through Dispatched, En route, On scene and Transporting by itself as its crew reports progress, and back to Available when the crew finishes or the unit is recalled.
3. Lets a responder toggle their own availability from their phone, and shows a responder riding a unit as "On assignment".
4. Propagates every unit and responder change to the web Fleet board immediately through the real-time event engine (MOD-20).
5. Feeds this status directly into MOD-30's readiness filter and MOD-31's pre-assignment check.
6. Persists each status change with identifiers and timestamps.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A phone call to a specific unit asking if they're free | A status change selected from the Fleet board dropdown (available/assigned/en route/on scene/unavailable/maintenance) |
| 2 | The unit's verbal answer at that moment, which may already be stale | A responder's availability toggle on their own phone |
| 3 | No shared record other units' or the dispatcher's own memory | The authenticated actor's identity, used to confirm who changed a given unit's status |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Direct phone calls to each unit to ask if they're free | Operations Center Fleet board, `frontend/app/(ops)/operations/fleet` |
| 2 | Memory of which units are typically available | `backend/src/fleet` service persisting unit status with timestamps |
| 3 | No shared, up-to-date view across dispatchers | Responder availability toggle in the mobile app, `mobile/app/responder` |
| 4 | — | Socket.io broadcast of status changes to the Fleet board the instant a responder flips their toggle — the same real-time event engine as MOD-20 |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The dispatcher calls a specific unit directly to ask if they're free. |
| 2 | The unit's verbal answer is the only record, and it can already be out of date by the time it's acted on. |
| 3 | A request can be sent to a unit that's actually already busy or in maintenance, because nothing enforces an up-to-date status. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal, point-in-time answer with no shared record |
| 2 | A risk of dispatching to a unit that is actually unavailable |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The dispatcher opens the Fleet board and sees a live status summary for every unit. Its Units & Personnel tab has a Units section and a Responders section, each with a search box and filters (organization, unit type and readiness for units; availability for responders). | User Action |
| 2 | For a unit not on a dispatch, the dispatcher sets its status via the dropdown (Available, Out of service, Offline or Reserved), and the summary tile counts update immediately. While the unit is on a dispatch the dropdown is locked and shows the incident; mission statuses are never set by hand. | User Action |
| 2a | When a unit is dispatched, and as its crew reports En route, On scene (or treating) and Transporting, the unit's status follows by itself, forward only. Finishing, recall or replacement returns it to Available. | Processing |
| 3 | Separately, a responder flips their own availability toggle on their phone. | User Action |
| 4 | That update is persisted and broadcast through the same real-time event engine as MOD-20. | Database |
| 5 | The web Fleet board updates live, with no page refresh, proving the mobile and web sides are genuinely one connected system. | Notification |
| 6 | MOD-30's unit recommendation and MOD-31's dispatch-authorization check both read this status feed before a unit can be suggested or assigned. Dispatch re-checks the unit under a lock, and refuses a responder already riding another unit on any incident. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A live status summary and per-unit dropdown on the web Fleet board |
| 2 | A responder-controlled availability state synced live to that board |
| 3 | A readiness feed consumed directly by MOD-30 (recommendation) and MOD-31 (assignment) |

---

## Owner notes (not part of the report)

**Test before signing:**
1. On the web Fleet board, set a free unit to Out of service via the dropdown and confirm the summary tile counts update. The dropdown lists only Available, Out of service, Offline and Reserved.
2. On the responder phone (a responder not on any unit), toggle availability and confirm the web Fleet board updates live without a page refresh.
3. Dispatch a unit from Live Dispatch: on an open Fleet board it turns Dispatched, shows "On INC-…", and its dropdown is locked. From the crew phone tap En route, then On scene: the unit follows each step live. Tap Finish: it is Available and the dropdown unlocks.
4. With that crew still on the unit, open another incident's dispatch form: those responders are not offered as crew, and on the Fleet board's Responders list they show "On assignment · AMB-1 · INC-…". Forcing it through the API (`POST /v1/dispatch` with one of them in `initialCrewIds`) returns 409 `RESPONDER_ON_ASSIGNMENT`.
5. `PATCH /v1/resources/:id/status` with `TRANSPORTING` returns 400; with `OUT_OF_SERVICE` on a dispatched unit it returns 409 `UNIT_ON_MISSION` naming the incident.

**Changed 2026-11-14:** mission statuses (Dispatched, En route, On scene, Transporting, Returning) can no longer be set by hand, since a unit in the workshop could otherwise be shown as transporting. They come only from dispatch and the crew's progress. A unit left in a mission status by old data, with no active dispatch, can still be set back to Available.

**Do not claim:**
- Physical readiness (fuel, equipment, crew health) — that remains a human judgment, not something this module verifies.
- Live vehicle telemetry or automatic fleet GPS — status changes are human-confirmed, not sensor-driven.
