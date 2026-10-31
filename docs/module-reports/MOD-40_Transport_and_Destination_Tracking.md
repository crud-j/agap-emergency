# MOD-40 — Transport and Destination Tracking

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-40 |
| Version | 1.0 |
| Module Name | Transport and Destination Tracking |
| Module Cluster | Cluster F — Field Response and Coordination |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Tracks a patient's transport from pickup all the way through to the destination hospital and handover — which hospital, when transport started, the estimated time of arrival, whether the destination changed mid-transport, and the actual arrival.

**Purpose**
Give both the dispatcher and the receiving hospital visibility into where a patient is headed, without pretending to guarantee travel time or automatically picking the "best" hospital.

**Tasks Performed**
1. Prompts the responder for a destination (a specific hospital from the registry, or "decide later") once the dispatch is marked Transporting.
2. Records the transport's origin, destination, departure time, and a routing-based estimated arrival, always labeled as an estimate.
3. Lets the crew set or change the destination en route, and a dispatcher or supervisor correct it, audited, with a destination history in the incident drawer.
4. Records the actual arrival with one tap, closing the transport and the open referral to that hospital (MOD-38).
5. Enforces one open transport per dispatch, and refuses to resolve the incident until arrival is recorded.
6. Keeps a Transporting or arrival tap made without signal in the phone's outbox and sends it once when the connection returns.
7. Pushes destination, route, ETA and arrival updates live over Socket.io to the operations map and the crew, and warns them if the destination hospital is deactivated or moved.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Whatever the ambulance crew relays by radio once they leave the scene | The destination hospital selected from the registry, or "decide later" |
| 2 | A call-in from the crew when they happen to report in | The departure timestamp and a routing-based estimated arrival |
| 3 | No record at all until the ambulance physically arrives at the hospital door | A one-tap "Arrived at hospital" action closing the transport |
| 4 | | The responder's last GPS position (for sorting hospitals by distance and routing) |
| 5 | | A destination change by the crew, dispatcher or supervisor |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Radio relay from the crew once they leave the scene, if anything | `mobile/src/components/responder/DestinationPicker.tsx` (hospitals sorted by straight-line distance, searchable, pulled from MOD-39's registry; unverified locations marked) and an offline transport outbox on the phone |
| 2 | A phone call-in to report the destination, often after the fact | NestJS REST API (`POST /v1/incidents/:id/transport`, `PATCH .../transport/:transportId` and `/arrive`), `backend/src/incidents/transport/transport.service.ts`, with crew-membership checks |
| 3 | No ETA and no record of a destination change en route | PostgreSQL persistence of origin, destination, departure time, estimated arrival, actual arrival and each destination change (audit log) |
| 4 | — | Routing service (OSRM) for the route to the hospital, with a route cache |
| 5 | — | Socket.io broadcast of transport updates to the operations map and the crew |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | Once an ambulance leaves the scene, its destination and status exist only in the crew's head and whatever they relay by radio. |
| 2 | The dispatcher finds out where the patient is going only when someone calls it in. |
| 3 | The hospital finds out only when the ambulance arrives at the door — no advance notice, no ETA. |
| 4 | There is no record of a destination change if one happens along the way. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | No advance notice to the receiving hospital |
| 2 | No record of a mid-transport destination change |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The responder marks the dispatch as Transporting on the mobile app. Without signal, the tap is kept in the phone's outbox and sent once, with its request ID, when the connection returns; a resend never creates a second transport. | User Action |
| 2 | The backend confirms the responder is on the crew and that no other transport is open for the dispatch, then creates the transport record. | Validation |
| 3 | The Destination Picker appears, showing hospitals sorted by straight-line distance from the crew's last position (from MOD-39's registry), with a search box and "Location not verified" on unverified hospitals; the responder picks a hospital or "Decide later." | User Action |
| 4 | The backend records the destination, departure time and a routing-based estimated arrival, always labeled an estimate, and sends the route to the hospital to the operations map and the crew. | Database |
| 5 | If circumstances change, the crew changes the destination from the app, or a dispatcher or supervisor corrects it from the drawer; each change is audited and listed in the drawer's destination history. If the hospital is deactivated or moved, ops and the crew are warned. | Validation |
| 6 | The responder taps "Arrived at hospital." The backend records the actual arrival, closes the transport, and marks the open referral to that hospital as arrived (MOD-38). Until then, the incident can't be marked Resolved. | Database |
| 7 | The web drawer's Transport section and the operations map (with a "to hospital" leg label) update live via Socket.io. | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A persisted transport record: destination, departure time, estimated arrival, actual arrival |
| 2 | An audited destination change, shown in the drawer's destination history |
| 3 | A live-updating Transport section in the web drawer and a route to the hospital on the operations map |
| 4 | The referral to the hospital marked arrived (MOD-38) |

---

## Owner notes (not part of the report)

**Test before signing:**
1. On the responder phone, mark a dispatched assignment Transporting, pick a hospital from the Destination Picker (or "decide later" and set it afterward), then tap "Arrived at hospital."
2. On the web drawer's Transport section, confirm destination, start time, "est." arrival, and arrival timestamp are shown; with a second dispatcher window open, confirm the destination can be changed mid-transport.

**Do not claim:**
- Automatic vehicle telemetry — the system does not read the ambulance's GPS on its own.
- Automatic destination selection — the crew (or a dispatcher/supervisor) always picks the hospital.
- Showing the hospital and route to the reporter. It works only for a crew-confirmed reporter-patient, and it is off by default (`REPORTER_DESTINATION_SHARING_ENABLED=false`); the citizen's incident screen gets the status only.

**Also test:** put the responder phone in airplane mode, tap Transporting, then reconnect; exactly one transport must appear.
