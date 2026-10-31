# MOD-36 — Incident Command / ICS Support

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-36 |
| Version | 1.0 |
| Module Name | Incident Command / ICS Support |
| Module Cluster | Cluster F — Field Response and Coordination |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Lets a Supervisor activate a lightweight Incident Command Structure on a large or multi-agency incident: set objectives, assign named ICS positions (including Incident Commander) with a short-cut for that one, keep running situation notes, and deactivate it when command is no longer needed.

**Purpose**
Give large incidents (mass-casualty, flood, multi-agency fire) a recognized command structure inside AGAP itself, so who's in charge and what the current objectives are is visible to everyone on the incident, not only known informally.

**Tasks Performed**
1. Activates ICS for an incident with an initial list of objectives.
2. Returns the current ICS structure, including each assigned position and the assigned user's name and role.
3. Assigns a named ICS position (e.g., Operations, Logistics) to a user, optionally tied to a specific organization.
4. Assigns the Incident Commander specifically, as a shortcut for the `INCIDENT_COMMANDER` position.
5. Updates ICS objectives and situation notes (capped at 4000 characters) as the incident develops.
6. Removes an individual position assignment, or deactivates ICS for the incident entirely.
7. Writes every activation, position assignment, update and deactivation to the audit trail, tagged `MOD-36`, and broadcasts each change live.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A verbally declared "who's in charge" at the scene, not written anywhere | Initial objectives (short text lines) to activate ICS |
| 2 | Objectives discussed on the radio net, not centrally tracked | The user, ICS position and optional organization to assign |
| 3 | — | Updated objectives and situation notes |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Verbal command declaration at the scene | NestJS REST API — `POST /v1/incidents/:id/ics/activate`, `GET .../ics`, `POST .../ics/positions`, `POST .../ics/assign-ic`, `PATCH .../ics`, `POST .../ics/deactivate`, `DELETE .../ics/positions/:posId` (`backend/src/incidents`) |
| 2 | Radio net for relaying objectives and status | PostgreSQL (`incident_command_structures`, `ics_assignments` tables) |
| 3 | — | Operations Command page (`frontend/app/(ops)/operations/command`) |
| 4 | — | Audit trail (MOD-46) and Socket.io `incident.updated` broadcast |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | On a large or multi-agency incident, a senior responder or officer declares themselves (or is told to be) the incident commander verbally at the scene. |
| 2 | Objectives and command decisions are discussed over the radio net. |
| 3 | Anyone arriving later has to ask around, or listen to the radio, to find out who's in command and what the current priorities are. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbally understood chain of command, not written down |
| 2 | No central record of objectives or who holds which role |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The Supervisor activates ICS on the incident, entering an initial list of objectives. | User Action |
| 2 | The backend creates (or updates) the `incident_command_structures` record for the incident with those objectives. | Database |
| 3 | The backend writes a `CREATE` audit entry tagged `MOD-36` and broadcasts `incident.updated` with the objectives. | Notification |
| 4 | The Supervisor assigns a named ICS position to a user, optionally tied to an organization — or uses the Incident Commander shortcut, which assigns the `INCIDENT_COMMANDER` position directly. | User Action |
| 5 | The backend creates the `ics_assignments` record, audits it, and broadcasts the new position live. | Database |
| 6 | Anyone with access views the current ICS structure — objectives, situation notes, and each assigned position with the assigned user's name and role. | Processing |
| 7 | The Supervisor updates objectives or situation notes (capped at 4000 characters) as the incident develops, or removes a position assignment. | Validation |
| 8 | The Supervisor deactivates ICS once command is no longer needed, deleting the structure and its position assignments. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | An active (or deactivated) ICS structure with objectives and situation notes for the incident |
| 2 | Named position assignments, including Incident Commander, each visible with the assignee's name and role |
| 3 | An audit-trail entry for each activation, assignment, update and deactivation |

---

## Owner notes (not part of the report)

**Do not claim:**
- Implementation boundary: this is not a full FEMA/ICS forms suite, a compliance export, or a complete command board — it is objectives, situation notes and position assignments tied to the incident record, not standardized ICS-213/214 paperwork.
