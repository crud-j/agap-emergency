# MOD-27 — Emergency Organization and Resource Registry

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-27 |
| Version | 1.0 |
| Module Name | Emergency Organization and Resource Registry |
| Module Cluster | Cluster E — Monitoring and Escalation |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Registers every emergency organization — MDRRMO, BFP, the hospital — and every operational unit each one owns, with coverage area, capabilities, contacts, ownership, and status.

**Purpose**
Give dispatch, fleet and resource-matching one authoritative source of "who exists and who owns what," instead of staff keeping separate, possibly conflicting lists in memory.

**Tasks Performed**
1. Creates, edits, and filters organization records through the web console's Organizations page.
2. Creates, edits, and filters unit/resource records through the Resources/Fleet page, each visibly owned by one organization.
3. Enforces ownership at the authorization layer, not just in the UI — an Org Administrator can edit only their own organization's units.
4. Records capabilities, contacts, operating area, and status per unit.
5. Validates, authenticates, and persists every record and change with identifiers and timestamps.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Institutional knowledge of which agency owns which truck, held by whoever has worked there longest | Organization record (name, coverage area, contacts) |
| 2 | No enforced record of ownership — in principle anyone could claim or describe any unit as theirs | Unit/resource record (type, capability flags, owning organization, status) |
| 3 | Knowledge that doesn't transfer cleanly when staff change | The authenticated actor's organization membership, used to enforce the ownership check |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Verbal/institutional knowledge of agency rosters, with no written master list | Operations Center Organizations page, `frontend/app/(ops)/organizations` |
| 2 | No system enforcing who may edit a given unit's record | Operations Center Resources/Fleet registry page, `frontend/app/(ops)/resources` |
| 3 | — | NestJS `backend/src/organizations` and `backend/src/resources` services with an ownership-authorization guard (Org Administrator scoped to their own organization's units) |
| 4 | — | PostgreSQL persistence of organization and unit records with identifiers and timestamps |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | Staff rely on memory or word of mouth to know which agency owns which unit. |
| 2 | That knowledge is not written down anywhere centrally. |
| 3 | When experienced staff leave, the knowledge doesn't transfer cleanly to new staff. |
| 4 | Nothing stops anyone from describing or claiming a unit as belonging to the wrong organization. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | An unwritten, person-dependent understanding of ownership |
| 2 | No enforceable record of which organization may edit which unit |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | An authorized dispatcher opens Organizations and sees MDRRMO, BFP, and Bocaue Hospital listed, each with its units under Resources/Fleet. | User Action |
| 2 | The dispatcher (or an Org Administrator) creates or edits a unit's capability flags, contacts, or status. | User Action |
| 3 | The backend validates the fields and authenticates the actor. | Validation |
| 4 | If the actor is an Org Administrator, the backend checks the unit belongs to that administrator's own organization before allowing the edit; editing another organization's unit is refused. | Validation |
| 5 | The record is persisted in PostgreSQL with an identifier, owning organization, and timestamp. | Database |
| 6 | Dispatch, fleet, and resource-matching modules read this registry as their source of truth for "who exists and who owns what." | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A filterable list of organizations, each with its owned units |
| 2 | A persisted unit record with capability flags, contacts, status, and owning organization |
| 3 | A refused edit when an Org Administrator attempts to change a unit outside their own organization |

---

## Owner notes (not part of the report)

**Test before signing:**
1. As a dispatcher, create a new unit under MDRRMO and edit one unit's capability flags.
2. Sign in as `orgadmin@mdrrmo.bocaue.gov.ph`, attempt to edit a BFP-owned unit (should be refused), then edit an MDRRMO unit (should be allowed) — this is the clearest proof the ownership check is enforced server-side, not just hidden in the UI.

**Do not claim:**
- Live synchronization with any outside agency's own system of record — this registry reflects only what's entered here.
- That ownership is a UI-only restriction — it is enforced in the backend authorization layer.
