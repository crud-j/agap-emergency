# MOD-35 — Resource Request and Mutual Aid

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-35 |
| Version | 1.0 |
| Module Name | Resource Request and Mutual Aid |
| Module Cluster | Cluster F — Field Response and Coordination |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Lets a Dispatcher or Supervisor ask another organization for extra personnel, a vehicle or equipment on a specific incident, and lets that organization's Org Administrator approve or deny the request.

**Purpose**
Turn mutual-aid requests — "we need another ambulance from the next barangay" — into a tracked record with a status, instead of a phone call that only the two people on the line remember.

**Tasks Performed**
1. Creates a mutual-aid resource request for an incident: resource type, quantity, needed capabilities, priority and notes.
2. Lists requests, filterable by incident, organization or status.
3. Lets the providing organization's Org Administrator approve (with the approving org recorded as the fulfiller) or deny the request, with notes.
4. Resolves the requesting user's own organization automatically from their account.
5. Keeps deprecated `/request` and `/request/:id/respond` routes as aliases for existing callers while new code uses `/requests`.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A phone or radio call to another agency asking for help | The incident the resource is needed for |
| 2 | Verbally agreed resource type and quantity | Resource type, quantity and needed capabilities |
| 3 | A verbal yes or no, not recorded | Priority and request notes |
| 4 | — | The requesting organization (resolved from the signed-in user) |
| 5 | — | The providing organization's approve/deny decision and notes |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Telephone or radio call to the partner agency | NestJS REST API — `GET/POST /api/v1/resources/requests`, `PATCH /api/v1/resources/requests/:id/approve`\|`/deny` (`backend/src/resources`) |
| 2 | Verbal agreement, not recorded anywhere | PostgreSQL (resource-request table, linked to `organization` and `incident`) |
| 3 | — | class-validator DTOs (`ResourceRequestDto`, `RequestDecisionDto`) |
| 4 | — | Role-based access control (Dispatcher/Supervisor create; Org Administrator/System Administrator decide) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A dispatcher realizes the incident needs a resource their own organization doesn't have (e.g., another ambulance) and calls a partner agency. |
| 2 | The two sides discuss the type and quantity needed over the phone or radio. |
| 3 | The partner agency verbally agrees or declines. |
| 4 | Nothing about the request or the decision is recorded anywhere searchable. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal commitment (or refusal) between two agencies |
| 2 | No record of what was requested, by whom, or the outcome |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A Dispatcher or Supervisor opens the resource-request form for the incident and enters resource type, quantity, needed capabilities, priority and notes. | User Action |
| 2 | The backend validates the request body and resolves the requesting organization from the signed-in user's account. | Validation |
| 3 | The backend creates the resource-request record with status Pending. | Database |
| 4 | The receiving organization's Org Administrator (or System Administrator) reviews pending requests, filterable by incident, organization or status. | User Action |
| 5 | The reviewer approves (the backend resolves their organization as the provider and marks the request fulfilled) or denies the request, with notes. | Validation |
| 6 | The backend persists the decision and notes against the request record. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A persisted resource request with status (Pending, Approved/Fulfilled, Denied) |
| 2 | A recorded providing organization and decision notes once resolved |
| 3 | A filterable list of requests by incident, organization or status |

---

## Owner notes (not part of the report)

**Do not claim:**
- Implementation boundary: there is no legally binding mutual-aid agreement document and no automatic procurement or dispatch of the approved resource — approval records the decision; moving the actual resource is coordinated separately (e.g., through dispatch, MOD-31).
