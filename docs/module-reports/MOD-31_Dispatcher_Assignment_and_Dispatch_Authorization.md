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
Controls who actually gets sent to an incident and records that decision — unit selection, assignment, authorization, and crew acceptance, all timestamped and audited.

**Purpose**
Enforce one of AGAP's core rules directly in the workflow: dispatch recommendations assist the dispatcher, they never decide on their own. A human always clicks to authorize.

**Tasks Performed**
1. Opens the Dispatch screen for a validated incident (Acknowledged or Assessed), showing the ranked unit recommendation from MOD-30.
2. Lets the dispatcher select a unit and choose its crew before confirming.
3. Requires an explicit "Authorize Dispatch" click, followed by a confirmation dialog that lists the units, crew and notes, as the authorization step — nothing is sent automatically before it.
4. Persists every assignment, authorization and acceptance with timestamps and writes each to the audit trail.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A dispatcher's verbal decision over radio or phone about which unit to send | The incident ID (already Acknowledged or Assessed) and the ranked unit list from resource matching |
| 2 | The reasoning behind that decision, which lives only in the dispatcher's head | The selected unit, the chosen crew members, optional dispatch notes, and the dispatcher's explicit confirmation click |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Radio/phone call to assign a unit, with the decision living only in the dispatcher's memory | Operations Center Dispatch screen, `frontend/app/(ops)/operations/dispatch` |
| 2 | A follow-up radio call to reassign or recall, with no written record of why | `backend/src/dispatch/dispatch.service.ts` handling the assignment and its authorization |
| 3 | Whatever gets jotted in the logbook afterward, if anything | PostgreSQL persistence of each assignment and authorization with timestamps |
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
| 1 | From a validated incident (Acknowledged, Assessed or Dispatch Pending), the dispatcher opens it on the Live Dispatch screen, which already shows the ranked unit recommendation from MOD-30. | User Action |
| 2 | The dispatcher selects a unit, picks its crew members from the responder list, and may add dispatch notes. | User Action |
| 3 | The dispatcher clicks Authorize Dispatch and confirms the summary dialog (units, crew, notes) — this explicit confirmation is the authorization; nothing is sent automatically before it. A notification then confirms which units were sent, or a message explains which unit failed. | User Action |
| 4 | The backend validates the request, authenticates the dispatcher, and persists the assignment with an identifier and timestamp. If another dispatcher or supervisor sent a unit to the same incident after this form was opened, it refuses the dispatch and names that unit and its sender, so one call never gets two units by accident. | Database |
| 5 | A dispatch-created event is broadcast live to the operations screens, and each crew member gets a "New assignment" push on their phone (MOD-18). | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A persisted dispatch record with unit, crew, dispatcher, and confirmation timestamp |
| 2 | A live event on the operations screens and an assignment push to the crew |
| 3 | An audit-trail entry for the assignment |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Open an Assessed incident → Dispatch, pick the recommended unit, add a crew member, and click Authorize Dispatch — confirm the audit entry records the explicit click.
2. Confirm the crew member's phone gets the "New assignment" push and the unit shows as Dispatched on the Fleet board.

**Recall and replace (2026-11-13):** on the Dispatch screen each unit that hasn't reached the scene has **Replace** and **Recall**. The dispatcher picks a reason ("Other" needs a note); it goes to the incident timeline and the audit trail, and the crew gets an "Assignment cancelled" push. Replace swaps the unit in one transaction (`PATCH /v1/dispatch/:id/reassign`), so if the new unit was just taken the original stays assigned. Recalling the only unit sends the incident back to Dispatch Pending and the dispatch form reappears (`PATCH /v1/dispatch/:id/cancel`). Once a unit is on scene, only its crew ends its part (Finish), so a patient on board is never cancelled from the console. A cancelled crew can no longer accept or post status updates.

**Test before signing (recall / replace):**
3. Dispatch one unit, click **Recall**, choose "Wrong unit sent" — the incident returns to Dispatch Pending, the unit is Available on the Fleet board, the crew phone gets "Assignment cancelled", and the Audit log shows the reason.
4. Dispatch a unit, click **Replace**, pick another unit — exactly one active unit remains, the new crew gets "New assignment", the old crew "Assignment cancelled".
5. Mark a unit On scene from the phone — Replace and Recall disappear for it.

**Two people on one incident (2026-11-14):** each dispatch carries how many units its sender saw on the incident (`expectedActiveUnits`). Under the incident lock the backend counts active units; if there are more, it refuses with 409 `INCIDENT_DISPATCH_CHANGED` ("Ana Cruz already dispatched RESCUE-1 … Your unit was not sent"). Before this, the late dispatch was silently accepted as an additional unit. "Dispatch another unit" and multi-unit sends still work, since they count what they saw. Clients that omit the field are not checked.

**One person, one unit; one unit, one incident (2026-11-14):** a responder's availability is their own duty switch and stays Available on a mission, so dispatch now refuses anyone already crewing an active unit on any incident (409 `RESPONDER_ON_ASSIGNMENT`, naming the unit and incident). The crew picker leaves them out, and the Fleet board shows them "On assignment". When a unit is replaced, its own crew may move to the replacement. Dispatch also re-reads the unit under a row lock, so two dispatchers sending the same unit to two incidents, or a unit set Out of service meanwhile, gets 409 `RESOURCE_NOT_AVAILABLE` instead of a double booking.

**Test before signing (two people):**
6. Sign in as a Dispatcher and, in another browser, as a Supervisor. Open the same Assessed incident in both. Dispatch from the Dispatcher; the Supervisor's form is replaced by the tracking card with "Someone else dispatched a unit…".
7. The race itself (the live update hasn't reached the second screen yet) is too quick to click by hand, so call the API: on an incident that already has one active unit, `POST /v1/dispatch` (Swagger) with another available unit and `"expectedActiveUnits": 0`. Expect 409 `INCIDENT_DISPATCH_CHANGED` naming the first unit and its sender. The incident still has exactly one unit, and the second unit is still Available. The same call with `"expectedActiveUnits": 1` dispatches it as an additional unit.

**Implementation gap:** there is no screen to add or remove crew after dispatching, and the responder app has no Decline button (`POST`/`DELETE /v1/dispatch/:id/crew` and `POST /v1/responders/assignments/:id/decline` exist and are tested; a decline now frees the unit and returns a unit-less incident to Dispatch Pending).

**Do not claim:**
- Integration with any external CAD/radio dispatch system.
- Automatic unit mobilization — every dispatch requires the dispatcher's explicit Authorize Dispatch click.
- Implementation boundary: this module does not talk to any outside radio/CAD dispatch system, and it never mobilizes a unit automatically — authorization is always a human decision made through the explicit Authorize Dispatch click.
