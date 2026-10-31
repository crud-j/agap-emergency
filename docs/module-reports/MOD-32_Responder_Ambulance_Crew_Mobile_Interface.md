# MOD-32 — Responder / Ambulance Crew Mobile Interface

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

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
The responder's operational workspace on their phone: an assignment inbox woken by push notifications, the incident summary, navigation to the scene and hospital, status updates, live location sharing, and on-scene tools that match the unit type. An ambulance crew gets the patient assessment and hospital transport; a fire truck crew gets a fire report; a rescue boat or truck crew gets a rescue trip log. Every crew can ask dispatch for more help.

**Purpose**
Give each crew what it needs in the field without a separate radio call for each step, and show only the buttons that apply to its unit, so dispatch gets structured, timestamped information from every unit on the incident.

**Tasks Performed**
1. Shows an assignment inbox, opened directly from an assignment push and refreshed every 15 seconds as a fallback.
2. Lets the responder accept the assignment and see the incident summary and the route to the scene.
3. Steps the crew through status updates (en route, on scene, then transporting, treating on scene or resolved), each timestamped and saved on the unit's dispatch.
4. Decides the on-scene tools from the dispatched unit's type: patient assessment and hospital transport (ambulance), fire report (fire truck), rescue trip log (rescue boat or truck).
5. Sends a "Request help" message (ambulance, fire unit, rescue unit or more personnel) to the dispatchers.
6. Shares the crew's location while the assignment is active and lets the responder set their own availability.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A radio or phone call telling the responder about a new assignment | Assignment push notification and the assignment inbox |
| 2 | The responder's own knowledge of the area, or a separate consumer map app, for navigation | Dispatched unit's type (ambulance, fire truck, rescue boat or truck, other) |
| 3 | A verbal status report back to dispatch (en route, on scene, transporting) with no structured timestamp | Status-update taps (en route, on scene, transporting, treating on scene, finish or resolved) |
| 4 | Verbal size-up of a fire or count of people rescued, radioed to dispatch | Fire report: alarm level, fire status, structures involved, occupancy type, hazards, spreading, evacuation needed, casualties seen, people trapped, notes |
| 5 | Radio request for backup | Rescue trip: people rescued, families, children, elderly, PWD, pregnant, still waiting, water level, access, where they were taken (evacuation center, hospital or other), notes |
| 6 | | Help request: what is needed (ambulance, fire unit, rescue unit, more personnel), how many, optional note |
| 7 | | Phone GPS position while the assignment is active, and the responder's availability setting |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Radio or phone call to notify the responder of a new assignment | AGAP Responder mobile app (Expo, React Native, Expo Router), `mobile/app/responder` |
| 2 | A separate consumer map app or the responder's own area knowledge for navigation | Firebase Cloud Messaging push on a high-priority "Responder assignments" channel |
| 3 | A verbal radio report of each status change back to dispatch | NestJS REST API (`/v1/responders/assignments`, `/v1/incidents/:id/fire-report`, `/v1/incidents/:id/rescue-trip`) with JWT, role and crew-membership checks |
| 4 | — | Shared unit-to-flow map (`shared/src/constants/unit-field-flow.ts`) used by both the app and the server |
| 5 | — | PostgreSQL (dispatch progress times, fire reports, rescue trips, incident events, audit log) |
| 6 | — | Offline outbox on the phone that sends saved reports once, with a request ID, when the connection returns |
| 7 | — | Socket.io events to the dispatcher's screen and Fleet board, and the built-in map and navigation view (MapLibre) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The responder learns of an assignment by radio or phone call. |
| 2 | The responder navigates using their own knowledge of the area or a separate consumer map app. |
| 3 | Status changes (en route, on scene, transporting) are reported back verbally. |
| 4 | A fire crew or rescue crew radios its size-up or head count, and the dispatcher writes it down. |
| 5 | There is no structured trail of exactly when each step actually happened. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal status update with no attached timestamp |
| 2 | Handwritten notes of fire size-ups and rescue counts, if any |
| 3 | No record the dispatcher can review later for exact timing |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The responder receives a "New assignment" push and taps it, or opens the inbox (refreshed every 15 seconds). | User Action |
| 2 | The responder accepts the assignment. The backend confirms the responder is on that dispatch's crew and records the acceptance. | Validation |
| 3 | The app shows the incident summary, the unit's flow label (for example "Fire unit"), and a Navigate button to the scene. While the assignment is active, the phone shares its location. | Processing |
| 4 | The responder taps Mark En Route, then Mark On Scene. The backend saves each time on this unit's dispatch, moves the incident status forward only (never backward), and writes an incident event. | Database |
| 5 | Each update is broadcast live to the dispatcher's screen. | Notification |
| 6 | On scene, the app shows the tools for the unit type. An ambulance crew can open the patient assessment (MOD-37), then choose Transporting (with a destination hospital, MOD-40) or Treating on Scene. The server refuses transport for a unit type that doesn't transport. | Validation |
| 7 | A fire truck crew fills in the Fire Report (alarm level, fire status, hazards, casualties, people trapped and so on) and can update it as the fire changes. The backend saves it, adds it to the incident timeline, and shows a Fire card in the dispatcher's drawer. | Database |
| 8 | If a fire report shows fireworks or explosives, people trapped, a high alarm level, or casualties with no ambulance on the incident, the backend sends a notice to the dispatchers. It never dispatches anything by itself. | Notification |
| 9 | A rescue boat or truck crew records each trip (people rescued and vulnerable counts, people still waiting, water level, access, where they were taken). The backend checks that no part count exceeds the number rescued, saves the trip, and keeps running totals for the dispatcher and for surge mode by barangay (MOD-52). | Validation |
| 10 | If the rescue crew finishes with people still waiting, or records people taken to a hospital with no ambulance on the incident, the dispatchers get a notice. | Notification |
| 11 | Without a connection, fire reports and rescue trips are kept in the phone's outbox and sent once when the connection returns. | Processing |
| 12 | Any crew can tap Request help and choose what is needed. The backend saves the request on the timeline, writes an audit entry, and sends a "Crew help requested" notice to the dispatchers; a repeat of the same need within 5 minutes is not sent twice. | Notification |
| 13 | When its work is done, the crew taps Mark Resolved and confirms. The backend refuses while a hospital transport has no recorded arrival; otherwise the unit is released and the incident is Resolved, and the dispatcher closes it (MOD-45). | User Action |
| 14 | The responder can set their own availability on the Profile screen, which updates the web Fleet board live (MOD-28). | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Timestamped status record for each unit on the incident, from acceptance to finish |
| 2 | Live updates on the dispatcher's screen and the Fleet board |
| 3 | Saved fire reports and a Fire card in the dispatcher's drawer, with notices for dangerous findings |
| 4 | Saved rescue trips with running totals (rescued and still waiting), also counted in surge mode by barangay |
| 5 | Crew help requests on the incident timeline, with notices to the dispatchers |
| 6 | Connected hand-off into the patient assessment (MOD-37) and hospital transport (MOD-40) |

---

## Owner notes (not part of the report)

**Before printing:** most of this TO-BE (unit-specific flows, fire report, rescue trip, help request, per-unit progress) comes from the Unit Field Flow plan, Phases 1–4. As of 2026-10-31 that work is **not committed** and Phase 4 isn't reviewed yet. Commit it first, or the report describes code that isn't in the repository.

**Test before signing:**
1. Sign in as `responder1@mdrrmo.bocaue.gov.ph` with the app in the background. Dispatch the unit and confirm the push arrives and opens the assignment. Accept, then step through En Route → On Scene.
2. On an ambulance assignment, confirm the assessment, Transporting and Treating on Scene appear.
3. Sign in as `responder3` (BFP) on a fire truck assignment. Submit a fire report with "fireworks or explosives" and confirm the Fire card and a dispatcher notice appear. Repeat with airplane mode on and confirm it sends when back online.
4. On a rescue boat or truck assignment, record a trip with people still waiting, then finish, and confirm the dispatcher notice and the running totals.
5. Tap Request help → Ambulance and confirm the dispatcher's bell shows "Crew help requested".
6. Toggle availability and confirm the web Fleet board updates without a refresh.

**Do not claim:**
- Two units on the same incident (for example a fire truck and an ambulance), or the "Finish (your unit)" button. The backend and app support it, but a second dispatch is refused once the incident is Dispatched (finding P3-F1), so no screen can reach it yet. A fire-truck notice "casualties, no ambulance" therefore always applies.
- A responder screen showing the patient's medical profile. The backend route now allows only the crew on that patient's incident, but no screen calls it.
- A complete electronic patient-care record system, or integration with vehicle telemetry or clinical devices.
- BFP's own alarm terms as final: the fire report's alarm levels are provisional until BFP Bocaue confirms them (decision D1).
