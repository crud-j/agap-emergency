# MOD-13 — Live Incident Location Tracking

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-13 |
| Version | 1.0 |
| Module Name | Live Incident Location Tracking |
| Module Cluster | Cluster C — Location and Tracking |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
While an incident is active, this module tracks and shares two live positions: the incident's own scene location and every responding unit's current GPS fix. A responder's phone pushes a position; the backend stores it, works out which unit it belongs to, and streams it to the citizen's tracking screen and the dispatcher's map over Socket.io. The citizen sees the unit's call sign and an estimated time of arrival — never the responder's name or phone number.

**Purpose**
Let the reporter see that help is actually moving, and let the dispatcher/supervisor see every unit's real position on the ops map, without either side having to ask by radio "where are you now."

**Tasks Performed**
1. Accepts a responder's GPS position only while they are crewed on an ACCEPTED dispatch for that incident (object-level ownership check).
2. Saves every position to `location_history`, keyed by incident, responder and timestamp.
3. Streams the update over Socket.io to the incident's room (reporter + crew) and the operations room (`ops:all`).
4. Returns the latest position and a routed ETA for each unit on an incident, collapsing multiple crew phones on one unit into a single freshest fix.
5. Marks a position as stale/signal-lost on the client when its timestamp is too old (`isSignalLost`), instead of silently showing a frozen marker.
6. Throttles ETA recalculation to at most once every 15 seconds per dispatch, even if GPS reports faster.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Responder's radioed position report ("we're near the bridge now") | Responder's GPS latitude/longitude, heading, speed |
| 2 | Operator's guess of travel progress from memory of the road | Incident ID the position belongs to (from the active dispatch) |
| 3 | Dispatcher's mental estimate of arrival time | Authenticated responder identity (JWT) |
| 4 |  | Citizen/dispatcher's request to view an incident's tracking (incident ID) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Two-way radio / mobile phone call | `POST /api/v1/locations/track` (`backend/src/locations/locations.controller.ts`) — responder-only, role-guarded |
| 2 | Operator's memory of the barangay road network | `LocationsService.trackResponder` (`backend/src/locations/locations.service.ts`) — ownership check against `dispatches`/`dispatch_crew` before accepting a fix |
| 3 | Paper or whiteboard unit log | PostgreSQL `location_history` table (one row per GPS fix, `recorded_at` timestamp) |
| 4 |  | `RealtimeService.notifyResponderLocationUpdated` → Socket.io `AgapGateway`, rooms `incident:{id}` and `ops:all` |
| 5 |  | BullMQ `location-processing` queue, `eta-refresh` job, deduplicated per dispatch (`ETA_REFRESH_THROTTLE_MS` = 15s) |
| 6 |  | `GET /locations/tracking/:incidentId/latest` (per-unit position + routed ETA) and `GET /locations/responders` (ops map feed) |
| 7 |  | Mobile: `useIncidentTracking` hook (`mobile/src/hooks/useIncidentTracking.ts`) — joins `join:incident`, seeds from REST, patches from the socket; `mobile/app/tracking/[id].tsx` map screen; `isSignalLost` staleness check (`@agap/shared`) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A responder radios dispatch with their approximate location at intervals they choose. |
| 2 | The dispatcher writes the reported location and time on a whiteboard or logbook. |
| 3 | The reporter calls back to ask "how much longer," and the operator relays whatever was last radioed in. |
| 4 | Nothing is corrected automatically if a radio call is missed — the last known position can be minutes or tens of minutes stale with no indication of that. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Whiteboard/logbook entry of a radioed position |
| 2 | A verbally relayed, possibly stale, arrival estimate |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A responder's phone, while the dispatch is ACCEPTED, posts latitude/longitude/heading/speed to `/locations/track` at the mobile app's reporting interval. | User Action |
| 2 | The backend checks the coordinate falls inside Bocaue and that the posting user is actually crewed on an ACCEPTED dispatch for that incident; otherwise the position is rejected (`ForbiddenException`). | Validation |
| 3 | The backend saves the fix to `location_history` with the incident ID, responder ID and timestamp. | Database |
| 4 | The backend emits `responder.location_updated` (call sign only, never a name/phone) to the incident room and the ops room over Socket.io. | Notification |
| 5 | The backend enqueues a throttled `eta-refresh` job (BullMQ, one per 15 s per dispatch) that recalculates a routed ETA from the freshest fix. | Processing |
| 6 | The citizen's tracking screen (joined via `join:incident`) patches the responder marker and ETA live; a reconnect re-seeds from `GET /tracking/:incidentId/latest` so no gap is left unfilled. | Notification |
| 7 | The dispatcher/supervisor ops map reads `GET /locations/responders`, one marker per active unit, collapsing multiple crew phones on the same dispatch into the freshest single fix. | Processing |
| 8 | If a position is older than the signal-lost threshold, the client marks it stale instead of showing it as current. | Validation |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | `location_history` row per GPS fix, with incident/responder/timestamp |
| 2 | Live responder marker and routed ETA on the citizen tracking screen and ops map |
| 3 | Reporter-safe payload (call sign/unit type only, never responder name or phone) |
| 4 | Stale/"signal lost" indicator when a position ages past the threshold |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Dispatch a unit, sign in as that responder on the phone, and call `POST /locations/track`; confirm the citizen's tracking screen marker moves without a manual refresh.
2. Try posting a position for an incident the responder is not crewed on; confirm it's rejected.
3. Stop sending positions for over the signal-lost threshold and confirm the client shows it as stale, not as a frozen "live" marker.

**Do not claim:**
- Continuous background tracking when the app is closed or the phone is locked — a position is only sent when the responder screen/app actively posts one.
- A guaranteed reporting interval — the throttle caps ETA recalculation at once per 15 seconds per dispatch, but GPS push frequency itself depends on the mobile app's own polling, not a server-enforced cadence.
