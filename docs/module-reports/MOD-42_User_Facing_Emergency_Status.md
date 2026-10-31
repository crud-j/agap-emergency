# MOD-42 — User-Facing Emergency Status

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-42 |
| Version | 1.0 |
| Module Name | User-Facing Emergency Status |
| Module Cluster | Cluster G — Status, Escalation, and Closure |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Shows the citizen who reported (or is following) an incident a simple, live view of where it stands — status, estimated arrival, and a history/timeline — without exposing internal dispatcher notes or other citizens' information.

**Purpose**
Let the reporter see progress without having to call back, while keeping anything restricted (internal notes, other incidents, responder details beyond what's needed) out of their view.

**Tasks Performed**
1. Shows the live status of the active incident (map, status pill, ETA card) on the Tracking screen.
2. Updates the status live over the WebSocket as dispatchers and responders act on it.
3. Shows a multi-tab history view (Overview, Timeline, Notifications, Location, Resolution) once the incident has events to show.
4. Lists all of the citizen's past and current incidents.
5. Labels the ETA as an estimate and shows a "signal lost" hint instead of silently freezing when the responder's position goes stale.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A phone call back to the hotline/MDRRMO to ask "what's happening?" | The incident's current status, category and reference number |
| 2 | Whatever the operator remembers or can find in the logbook | The incident's timeline, notification and resolution history |
| 3 | | Live WebSocket status/location/ETA updates scoped to that incident |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Telephone call back to the hotline | AGAP Citizen mobile app — Tracking screen (`mobile/app/tracking/[id].tsx`) and History screen (`mobile/app/history/`) |
| 2 | Operator's memory or the paper logbook | NestJS REST API (`GET /v1/incidents/:id`, incident history/timeline endpoints) |
| 3 | | Socket.io client joined to the incident's room (`incident.status_changed`, `responder.location_updated`, `responder.eta_updated`) |
| 4 | | PostgreSQL (incident, status history, notification and resolution records) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The reporter has no way to check progress except calling the hotline again. |
| 2 | The operator looks up (or recalls) the incident and relays whatever is known. |
| 3 | Nothing is shown automatically; every update requires another call. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal status update, if the operator can find the record |
| 2 | Repeated calls tying up the hotline |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The citizen opens the incident from Home, My Reports, or a notification. | User Action |
| 2 | The app fetches the incident's current status, category and reference, and joins the incident's WebSocket room. | Integration |
| 3 | The Tracking screen shows a status pill, a map with the incident pin, and (once a responder is dispatched) the responder's position and an "estimate" ETA card. | Processing |
| 4 | As dispatchers/responders change the incident's status or a responder's position/ETA updates, the screen updates live without a refresh. | Notification |
| 5 | If the responder's last position is older than the signal-lost threshold, the screen shows "Responder signal lost" instead of a stale position. | Validation |
| 6 | When the crew starts transport, the Tracking screen replaces the responder ETA with a Transport card: "The patient is being taken to a hospital." The hospital name, route and position are not shown to the citizen. | Processing |
| 7 | From History, the citizen can open the Overview, Timeline, Notifications, Location and Resolution tabs for a fuller record of the incident. | Processing |
| 8 | Once the incident reaches RESOLVED or CLOSED, the Tracking screen shows "Response complete" instead of an ETA. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A live status view scoped to the citizen's own incident |
| 2 | An ETA always labeled as an estimate, or a "signal lost" / "waiting for a responder" hint when it can't be shown |
| 3 | A multi-tab history (overview, timeline, notifications, location, resolution) for past and active incidents |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Submit a test incident, open Tracking, and change its status from the Operations Center; confirm the pill updates without refreshing.
2. Dispatch a responder and confirm the ETA card and map position update live.
3. Open History and check each tab.

**Do not claim:**
- The citizen seeing which hospital the patient is taken to. It appears only for a crew-confirmed reporter-patient when `REPORTER_DESTINATION_SHARING_ENABLED=true` (off by default).
- A dedicated `status.tsx` screen — the citizen-facing status view actually lives in `mobile/app/tracking/[id].tsx`, shared with MOD-43.
- Status updates without the app open — the live view described here requires the Tracking/History screen to be open and connected; updates while the app is closed rely on MOD-16's push notifications, not this module.
