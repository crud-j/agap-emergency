# MOD-38 — Hospital Receiving Coordination

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

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
Lets a responder, dispatcher or supervisor send a hospital a pre-arrival referral for a patient — with notes and an ETA — and lets the receiving hospital's user acknowledge it and mark the patient arrived, so the hospital isn't surprised at the door.

**Purpose**
Give the receiving facility advance warning of an incoming patient and a rough ETA, so they can prepare, while being honest that AGAP cannot guarantee the hospital has an open bed or will accept the patient — that decision stays with the hospital.

**Tasks Performed**
1. Lets a responder or operational staff create a referral for a hospital, linked to the incident and optionally the patient and dispatch, with pre-arrival notes and an ETA in minutes.
2. Lets a hospital user, dispatcher or supervisor read a referral, restricted to those permitted to see it (hospital users limited to their own hospital).
3. Lets a hospital user acknowledge a referral.
4. Lets a hospital user, dispatcher or supervisor mark the referral's patient arrived.
5. Lists referrals by hospital or by incident.
6. Lists hospitals, including a nearby-hospitals lookup by coordinates.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A radio or phone call to the hospital's emergency room, giving a verbal heads-up | The destination hospital and incident the referral is for |
| 2 | Verbally relayed patient condition and estimated arrival time | Optional patient and dispatch reference, pre-arrival notes (up to 1000 characters) |
| 3 | — | Estimated time of arrival, in minutes (0–600) |
| 4 | — | The hospital's acknowledgement and arrival confirmation |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Telephone or radio call to the hospital emergency room | NestJS REST API — `POST /api/v1/hospitals/:id/referrals`, `GET .../referrals/:refId`, `PATCH .../acknowledge`\|`/arrived` (`backend/src/hospitals`) |
| 2 | Verbal relay of patient condition and ETA | PostgreSQL (hospital and referral tables) |
| 3 | — | class-validator DTO (`CreateReferralDto`) |
| 4 | — | Role-based access restricting referral reads to Dispatcher, Supervisor, Responder and the hospital's own Hospital User |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The responder or dispatcher calls the destination hospital's emergency room by radio or phone. |
| 2 | They verbally describe the patient's condition and give a rough ETA. |
| 3 | The hospital staff member who answered relays it to whoever is on duty when the ambulance arrives. |
| 4 | If that staff member isn't reached, or the message isn't passed on, the hospital has no advance warning. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal heads-up to whichever hospital staff member answered |
| 2 | No written record of the referral or the ETA given |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A responder, dispatcher or supervisor opens the referral form for the incident and selects the destination hospital. | User Action |
| 2 | They enter optional patient/dispatch references, pre-arrival notes, and an ETA in minutes. | User Action |
| 3 | The backend validates the fields (notes capped at 1000 characters, ETA between 0 and 600 minutes) and creates the referral record. | Validation |
| 4 | The hospital's assigned Hospital User reads the referral, restricted to referrals for their own hospital. | Validation |
| 5 | The Hospital User acknowledges the referral. | User Action |
| 6 | On patient arrival, a Hospital User, Dispatcher or Supervisor marks the referral's patient arrived. | Database |
| 7 | Referrals can be listed by hospital or by incident for review. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A persisted referral record with hospital, patient/dispatch links, notes and ETA |
| 2 | An acknowledgement status from the receiving hospital |
| 3 | An arrival confirmation once the patient reaches the hospital |

---

## Owner notes (not part of the report)

**Do not claim:**
- Implementation boundary: AGAP does not track real-time bed availability, does not integrate with a hospital's own information system, and does not guarantee the hospital will accept the patient — acknowledgement and arrival are status markers, not a capacity reservation.
