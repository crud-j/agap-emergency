# MOD-34 — Multi-Agency Coordination

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-34 |
| Version | 1.0 |
| Module Name | Multi-Agency Coordination |
| Module Cluster | Cluster F — Field Response and Coordination |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Lets a Supervisor add other agencies — such as BFP for a fire, or a second responding organization — as participants on a specific incident, and remove them again, so everyone can see which agencies are involved without a separate phone tree. When a dispatcher sends another organization's unit (for example a BFP fire truck), that organization is added automatically.

**Purpose**
Keep multi-agency incidents (fire, mass-casualty, flood) coordinated around one shared incident record instead of each agency tracking it independently, while keeping the list of participating agencies auditable.

**Tasks Performed**
1. Lists the organizations already participating in an incident.
2. Lists the active organizations not yet added, optionally filtered by organization type, so the Supervisor can pick one to invite.
3. Adds an organization as a participating agency on the incident, recording who invited it.
4. Removes a participating agency from the incident.
5. Writes every add/remove to the audit trail, tagged `MOD-34`.
6. Broadcasts the change live (`incident.updated`) so the operations dashboard reflects it immediately.
7. Adds the unit's organization automatically, with the unit type as its role, whenever one of its units is dispatched to the incident.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A phone call or radio request to another agency's duty officer | The incident to add or remove an agency on |
| 2 | Verbally agreed scope of what the other agency will handle | The organization ID being added or removed |
| 3 | — | The authenticated Supervisor's identity, recorded as the inviter |
| 4 | — | A dispatch of a unit, with the unit's organization and type (MOD-31) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Telephone or radio call to the partner agency | NestJS REST API — `GET`/`POST`/`DELETE /v1/incidents/:id/agencies`, `GET /v1/incidents/:id/agencies/available` (`backend/src/incidents`) |
| 2 | Verbal confirmation, not recorded anywhere | PostgreSQL (`incident_agency_participants` table, linked to `organization`) |
| 3 | — | Multi-Agency operations page (`frontend/app/(ops)/operations/multi-agency`) |
| 4 | — | Audit trail (MOD-46) and Socket.io `incident.updated` broadcast |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The dispatcher or supervisor decides another agency (e.g., BFP) is needed and calls their duty officer by phone or radio. |
| 2 | The two sides agree verbally on who is responding and what they'll cover. |
| 3 | Nothing is recorded in any shared system; each agency tracks its own involvement separately. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal agreement between duty officers, not written down |
| 2 | No shared, reviewable list of which agencies are on an incident |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The Supervisor opens the incident's agency panel and requests the list of organizations not yet participating, optionally filtered by type. | User Action |
| 2 | The backend queries active organizations, excluding those already on the incident. | Processing |
| 3 | The Supervisor selects an organization to add. | User Action |
| 4 | The backend creates an `incident_agency_participants` row, recording the organization and the inviting Supervisor. An organization already on the incident is not added twice. | Database |
| 5 | The backend writes a `CREATE` audit entry tagged `MOD-34` for the new participant. | Database |
| 6 | The backend broadcasts `incident.updated` with the added agency so the operations dashboard and Multi-Agency page update live. | Notification |
| 7 | The Supervisor can later remove a participating agency; the backend deletes the record and logs the removal. | Processing |
| 8 | When a dispatcher dispatches a unit (MOD-31), the backend adds the unit's organization to the incident with the unit type as its role (for example BFP as FIRE_TRUCK), audited and broadcast the same way. A failure here never affects the dispatch. | Integration |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A persisted list of agencies participating in the incident, with who invited each one |
| 2 | An audit-trail entry for each add or remove |
| 3 | A live update on the operations dashboard and Multi-Agency page |
| 4 | Participating agencies added automatically from dispatches, with the unit type as their role |

---

## Owner notes (not part of the report)

**Test before signing:**
1. As a Supervisor, add an agency to an incident, then remove it; confirm both appear in the Audit log.
2. Dispatch the BFP fire truck to an incident and confirm BFP appears as a participating agency without being added by hand. (Step 8 is part of the uncommitted Unit Field Flow work; commit it before printing.)

**Do not claim:**
- Implementation boundary: there is no live interoperability with an external agency's own CAD, radio or email system — participation is tracked as a shared record inside AGAP, not a cross-system integration.
