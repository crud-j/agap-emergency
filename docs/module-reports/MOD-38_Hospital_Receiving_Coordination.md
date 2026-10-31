# MOD-38 — Hospital Receiving Coordination

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-38 |
| Version | 1.0 |
| Module Name | Hospital Receiving Coordination |
| Module Cluster | Cluster F — Field Response and Coordination |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Lets a dispatcher or supervisor send a receiving hospital a pre-arrival referral for an incident, with notes and an estimated arrival time, after the system suggests and ranks suitable hospitals. The hospital's own users are notified, acknowledge the referral, and the patient's arrival is recorded.

**Purpose**
Give the receiving hospital advance warning of an incoming patient, and help the dispatcher pick a hospital that is open and equipped for the case. AGAP does not reserve a bed or guarantee acceptance; that decision stays with the hospital.

**Tasks Performed**
1. Ranks up to ten active, reviewed hospitals for an incident, using the hospital's reported receiving status, emergency room and ICU, available beds and straight-line distance, and shows the reasons for each.
2. Lets the dispatcher pick a suggested hospital or any other hospital and send the referral with pre-arrival notes and an estimated arrival time.
3. Refuses a referral for a closed incident, or a second pending referral to the same hospital for the same incident.
4. Notifies the hospital's users and shows the referral in the hospital's referral queue.
5. Lets a Hospital User acknowledge the referral.
6. Records the patient's arrival, from the hospital's queue or automatically when the ambulance crew records arrival at that hospital (MOD-40).

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A radio or phone call to the hospital's emergency room, giving a verbal heads-up | The incident (category, priority and location) |
| 2 | Verbally relayed patient condition and estimated arrival time | Hospital registry data: receiving status and when it was last reported, emergency room, ICU, available beds, verified location (MOD-39) |
| 3 | The dispatcher's own knowledge of which hospital is open | The destination hospital chosen by the dispatcher |
| 4 | — | Pre-arrival notes (up to 1000 characters, no patient names) and estimated arrival time in minutes (0–600) |
| 5 | — | The hospital's acknowledgement and the arrival confirmation |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Telephone or radio call to the hospital emergency room | Operations web console (Next.js): Refer to hospital dialog in the incident drawer, and the Referrals queue on the Hospitals page |
| 2 | Verbal relay of patient condition and ETA | NestJS REST API: `GET /v1/hospitals/recommendations`, `POST /v1/hospitals/:id/referrals`, `PATCH /v1/hospitals/referrals/:refId/acknowledge` and `/arrived` |
| 3 | — | Ranking rules (`backend/src/hospitals/referral-ranking.ts`) with straight-line distance from verified hospital locations |
| 4 | — | PostgreSQL (`facilities`, `facility_referrals`, audit log) |
| 5 | — | In-app notifications to the hospital's users, and role checks (Dispatcher, Supervisor; Hospital Users limited to their own hospital) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The dispatcher decides on a hospital from memory, without knowing whether it is open or full. |
| 2 | The responder or dispatcher calls the destination hospital's emergency room by radio or phone. |
| 3 | They verbally describe the patient's condition and give a rough ETA. |
| 4 | The hospital staff member who answered relays it to whoever is on duty when the ambulance arrives. |
| 5 | If that staff member isn't reached, or the message isn't passed on, the hospital has no advance warning. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal heads-up to whichever hospital staff member answered |
| 2 | No written record of the referral or the ETA given |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | On a dispatched incident (Dispatched, En Route, On Scene or Transporting), the dispatcher opens the incident drawer and clicks Refer to hospital. | User Action |
| 2 | The backend ranks active, reviewed hospitals. It lowers a hospital that is Closed, At Capacity, has no emergency room when one is needed, or has no beds, raises one with an ICU for a critical case, and treats a status not reported in the last 12 hours as unknown. | Processing |
| 3 | The dialog lists up to five suggested hospitals first, each with its status, distance and reasons (for example "Status last updated 14 h ago" or "Incident location unknown"). The full hospital list stays below. | Processing |
| 4 | The dispatcher picks a hospital, enters optional pre-arrival notes and an ETA, and sends. The system never picks for the dispatcher. | User Action |
| 5 | The backend validates the fields and refuses a closed incident or a duplicate pending referral to the same hospital. | Validation |
| 6 | The backend saves the referral as Pending and writes an audit entry. | Database |
| 7 | Each user of the hospital's organization gets an in-app "New hospital referral" notice. | Notification |
| 8 | A Hospital User opens the Referrals queue on the Hospitals page, sees only their own hospital's referrals, and clicks Acknowledge. | User Action |
| 9 | When the patient arrives, a Hospital User, Dispatcher or Supervisor clicks Mark arrived; when the ambulance crew records arrival at that hospital (MOD-40), the open referral is closed automatically. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Ranked hospital suggestions with reasons for the incident |
| 2 | Saved referral with hospital, notes and ETA, plus an audit entry |
| 3 | "New hospital referral" notice to the hospital's users |
| 4 | Acknowledgement status from the receiving hospital |
| 5 | Arrival confirmation once the patient reaches the hospital |

---

## Owner notes (not part of the report)

**Test before signing:**
1. On a dispatched incident, open Refer to hospital; confirm suggested hospitals appear first with reasons.
2. Send a referral, then sign in as that hospital's Hospital User; confirm the notice and the referral in the queue, and Acknowledge it.
3. Send the same referral again; it must be refused while the first is pending.
4. As the ambulance crew, record arrival at that hospital; confirm the referral shows the patient arrived.

**Do not claim:**
- Real-time bed availability or integration with a hospital's information system. The ranking uses the status the hospital last reported (MOD-39).
- Road travel time in the ranking. The distance is a straight line.
- Referrals sent from the responder app. The API allows responders, but no phone screen sends one; the crew picks a destination in MOD-40 instead.
