# MOD-43 — Live ETA and Responder Tracking

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-43 |
| Version | 1.0 |
| Module Name | Live ETA and Responder Tracking |
| Module Cluster | Cluster G — Status, Escalation, and Closure |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Calculates and shows an estimated arrival time for the responder assigned to an incident, and shows the responder's last-known position to authorized viewers (the citizen on their own incident, and dispatchers on the operations map) — always labeled as an estimate, and flagged when it goes stale.

**Purpose**
Give the citizen and the Operations Center a sense of "how far away" without pretending the system can guarantee a travel time, a live GPS feed, or that a responder who's gone quiet has actually stopped.

**Tasks Performed**
1. Recalculates ETA when a responder's location updates, using the routing provider.
2. Persists the latest ETA to the open transport record for that dispatch.
3. Broadcasts the ETA and the responder's position over Socket.io to the citizen and operations dashboard.
4. Flags a responder's position as stale ("signal lost") once it's older than the signal-lost threshold, instead of showing a frozen position as current.
5. Re-seeds the latest known positions from PostgreSQL on connect/reconnect so a dropped WebSocket doesn't lose the picture.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A radio call-in of the crew's rough location, if one happens | The responder's GPS position (latitude, longitude, heading, timestamp) tied to a dispatch |
| 2 | The dispatcher's own estimate of travel time based on experience | The incident's location |
| 3 | | The routing provider's calculated travel duration |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Two-way radio | Responder mobile app location reporting (Expo Location) |
| 2 | Dispatcher's local knowledge of travel times | `backend/src/locations` (location persistence, throttled per dispatch) |
| 3 | | Redis + BullMQ (`backend/src/jobs/processors/eta-refresh.processor.ts`) and `backend/src/locations/maps` routing provider |
| 4 | | PostgreSQL (`location_history`, `TransportRecord.estimated_arrival_at`) |
| 5 | | Socket.io (`responder.location_updated`, `responder.eta_updated`) |
| 6 | | Citizen Tracking screen and Operations Center live map, consuming the same feed |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The crew calls in their rough location over the radio, if they remember to. |
| 2 | The dispatcher estimates travel time from experience and local road knowledge. |
| 3 | No one but the dispatcher sees this estimate, and it isn't updated as the crew moves. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal, one-time travel estimate known only to the dispatcher |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The responder app reports the crew's GPS position, which the backend persists and throttles per dispatch. | Integration |
| 2 | Each accepted position queues an ETA refresh job for that dispatch. | Processing |
| 3 | The job routes from the freshest known position of that dispatch's crew to the incident location using the configured routing provider. | Integration |
| 4 | If an open transport record exists for the dispatch, its estimated arrival time is updated; the ETA is always marked as an estimate. | Database |
| 5 | The new ETA and position are broadcast over Socket.io to the incident's room (citizen Tracking screen, operations map). | Notification |
| 6 | If the routing provider returns no duration, the refresh is skipped and the previous ETA is left as-is — a failed calculation never blocks or cancels the dispatch. | Validation |
| 7 | On reconnect, viewers re-seed the latest known positions from PostgreSQL via REST, so a dropped socket doesn't show an empty map. | Integration |
| 8 | If a responder's last position is older than the signal-lost threshold, viewers show "signal lost" instead of treating the last position as current. | Validation |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A live-updating responder position and ETA on the citizen's Tracking screen and the operations map |
| 2 | An estimated arrival time persisted to the transport record, always labeled an estimate |
| 3 | A "signal lost" indicator when the position goes stale, instead of a silently frozen map |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Accept a dispatch on the responder app and confirm its position appears on the citizen's Tracking screen and operations map.
2. Move the responder (or simulate a position update) and confirm the ETA recalculates.
3. Stop sending positions and confirm "signal lost" appears after the threshold instead of a frozen pin.

**Do not claim:**
- Guaranteed or real-time-to-the-second travel time — ETA is a routing-provider estimate, recalculated on a throttle, not a live telemetry feed.
- Tracking of units not on an accepted dispatch — only crews with an accepted dispatch report a position here.
