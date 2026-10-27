# MOD-40 — Transport and Destination Tracking

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

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
3. Lets a dispatcher or supervisor change the destination mid-transport, audited.
4. Records the actual arrival with one tap, closing the transport.
5. Enforces one open transport per dispatch at a time.
6. Pushes destination/ETA/arrival updates live over Socket.io to the operations dashboard and receiving hospital where authorized.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Whatever the ambulance crew relays by radio once they leave the scene | The destination hospital selected from the registry, or "decide later" |
| 2 | A call-in from the crew when they happen to report in | The departure timestamp and a routing-based estimated arrival |
| 3 | No record at all until the ambulance physically arrives at the hospital door | A one-tap "Arrived at hospital" action closing the transport |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Radio relay from the crew once they leave the scene, if anything | `mobile/src/components/responder/DestinationPicker.tsx` (hospitals sorted by distance, searchable, pulled from MOD-39's registry) |
| 2 | A phone call-in to report the destination, often after the fact | `backend/src/incidents/transport/transport.service.ts` (confirmed ~263 lines of real persistence logic) |
| 3 | No ETA and no record of a destination change en route | PostgreSQL persistence of origin, destination, departure time, estimated arrival, and actual arrival |
| 4 | — | Socket.io broadcast of transport updates to the operations dashboard and receiving hospital |

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
| 1 | The responder marks the dispatch as Transporting on the mobile app. | User Action |
| 2 | The Destination Picker appears, showing hospitals sorted by distance (from MOD-39's registry) with a search box; the responder picks a hospital or "decide later." | User Action |
| 3 | The backend records the transport's origin, destination, departure time, and a routing-based estimated arrival, always labeled an estimate. | Database |
| 4 | If circumstances change, a dispatcher or supervisor can update the destination; that change is audited. | Validation |
| 5 | The responder taps "Arrived at hospital," recording the actual arrival and closing the transport. | User Action |
| 6 | The web drawer's Transport section and the receiving hospital's view update live via Socket.io. | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A persisted transport record: destination, departure time, estimated arrival, actual arrival |
| 2 | An audited destination change if one occurs mid-transport |
| 3 | A live-updating Transport section in the web drawer and (where authorized) the receiving hospital's view |

---

## Owner notes (not part of the report)

**Test before signing:**
1. On the responder phone, mark a dispatched assignment Transporting, pick a hospital from the Destination Picker (or "decide later" and set it afterward), then tap "Arrived at hospital."
2. On the web drawer's Transport section, confirm destination, start time, "est." arrival, and arrival timestamp are shown; with a second dispatcher window open, confirm the destination can be changed mid-transport.

**Do not claim:**
- Automatic vehicle telemetry — the system does not read the ambulance's GPS on its own.
- Automatic destination selection — the crew (or a dispatcher/supervisor) always picks the hospital.
