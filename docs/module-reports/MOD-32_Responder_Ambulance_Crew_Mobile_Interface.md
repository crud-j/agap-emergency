# MOD-32 — Responder / Ambulance Crew Mobile Interface

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-32 |
| Version | 1.0 |
| Module Name | Responder / Ambulance Crew Mobile Interface |
| Module Cluster | Cluster E — Monitoring and Escalation |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
The responder's entire operational workspace on their phone — an assignment inbox, the incident summary, navigation, status updates, their live location, the on-scene assessment, and transport/handover.

**Purpose**
Give the crew everything they need in the field without a separate radio call for each step, while being honest that this is not a full electronic patient-care record or a vehicle-telemetry product.

**Tasks Performed**
1. Shows an assignment inbox, refreshed every 15 seconds and immediately after any action the responder takes.
2. Lets the responder accept the assignment and see the incident summary, including only the patient data they're permitted to see.
3. Steps the responder through status updates — en route, on scene, transporting or assisting, resolved — each one timestamped and persisted.
4. Broadcasts each status update live to the dispatcher's screen.
5. Connects to the assessment screen (MOD-37) and the transport/destination screen (MOD-40) for a complete chain, plus built-in navigation and a live map.
6. Lets the responder toggle their own availability, reflected live on the web Fleet board (MOD-28).

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A radio or phone call telling the responder about a new assignment | The assignment inbox, refreshed every 15 seconds or immediately after an action |
| 2 | The responder's own knowledge of the area, or a separate consumer map app, for navigation | Built-in navigation and live map on the assigned incident |
| 3 | A verbal status report back to dispatch (en route, on scene, transporting) with no structured timestamp | An explicit status-update tap (en route / on scene / transporting or assisting / resolved) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Radio or phone call to notify the responder of a new assignment | AGAP Responder mobile app, `mobile/app/responder` |
| 2 | A separate consumer map app or the responder's own area knowledge for navigation | `backend/src/dispatch/dispatch.service.ts` (shared with MOD-31, confirmed ~399 lines of real persistence logic) backing assignment acceptance and status transitions |
| 3 | A verbal radio report of each status change back to dispatch | PostgreSQL persistence of each status transition with timestamp |
| 4 | — | Socket.io broadcast of `responder.status_changed` / `responder.location_updated` events to the dispatcher's screen and Fleet board |
| 5 | — | Built-in map/navigation view and an availability toggle synced to MOD-28's Fleet board |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The responder learns of an assignment by radio or phone call. |
| 2 | The responder navigates using their own knowledge of the area or a separate consumer map app. |
| 3 | Status changes (en route, on scene, transporting) are reported back verbally. |
| 4 | There is no structured trail of exactly when each step actually happened. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal status update with no attached timestamp |
| 2 | No record the dispatcher can review later for exact timing |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The responder opens the app and sees the assignment inbox, refreshed every 15 seconds and immediately after any action they take. | User Action |
| 2 | The responder accepts the assignment and views the incident summary, filtered to only the patient data they're permitted to see. | Validation |
| 3 | The responder steps through status updates — en route, on scene, transporting/assisting, resolved — each tap timestamped and persisted. | User Action |
| 4 | Each status update is broadcast live to the dispatcher's screen with no manual refresh needed on that end. | Notification |
| 5 | The same screens connect onward to the on-scene assessment (MOD-37) and the transport/destination picker (MOD-40). | Processing |
| 6 | The responder's availability toggle updates the web Fleet board live through the same real-time event engine. | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A timestamped status-transition record for each step from acceptance to resolved |
| 2 | A live update on the dispatcher's screen and the Fleet board as status/availability change |
| 3 | A connected handoff into the assessment and transport modules for the same incident |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Sign in as `responder1@mdrrmo.bocaue.gov.ph`, confirm a freshly dispatched assignment appears in the inbox within 15 seconds (or immediately on pull-to-refresh), accept it, and step through En Route → On Scene.
2. Toggle the responder's own availability and confirm the web Fleet board updates live without a page refresh.

**Do not claim:**
- Push notification for new assignments — the inbox relies on a 15-second refresh, which is a stated limit, not a bug.
- A complete electronic patient-care record system, or integration with vehicle telemetry/clinical devices.
- Implementation boundary: this is not a complete electronic patient-care record system, and it does not integrate with vehicle telemetry or clinical devices. There is also no push notification for a brand-new assignment yet — the inbox relies on the 15-second refresh, a stated and accepted limit rather than a hidden defect.
