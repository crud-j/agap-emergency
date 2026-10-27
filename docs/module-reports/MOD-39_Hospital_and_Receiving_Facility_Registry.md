# MOD-39 — Hospital and Receiving Facility Registry

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-39 |
| Version | 1.0 |
| Module Name | Hospital and Receiving Facility Registry |
| Module Cluster | Cluster F — Field Response and Coordination |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Maintains the master list of hospitals and receiving facilities AGAP knows about — their profile, location, receiving contact, capabilities, current status, and when they were last verified.

**Purpose**
Give every other module that needs to know "which hospital can take this patient" — MOD-40's destination picker, hospital referrals — one accurate, administered source of truth instead of everyone keeping their own list.

**Tasks Performed**
1. Registers each hospital/facility as a profile with location, receiving contact, capabilities, status, and a last-verified date.
2. Lets an authorized user search the list, create a new facility, and edit an existing one through the Hospitals page.
3. Validates and authenticates every field and change, persisted with identifiers and timestamps.
4. Serves as the source MOD-40's destination picker reads from when sorting hospitals by distance.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A name and number scribbled somewhere, or kept in whoever's phone contacts | A facility profile: name, location, receiving contact, capabilities |
| 2 | Capability information held only as institutional knowledge | A status flag and a last-verified date |
| 3 | No shared list, so different staff may have different, outdated numbers for the same hospital | A search, create, or edit request from an authorized user |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Personal phone contacts or scribbled notes with hospital numbers | Operations Center Hospitals page, `frontend/app/(ops)/hospitals` |
| 2 | Institutional memory of which hospital can handle what | `backend/src/hospitals` and `backend/src/facilities` services with CRUD, validation, and authentication |
| 3 | No shared, administered record at all | PostgreSQL persistence of the facility profile with identifiers and timestamps |
| 4 | — | A nearby-facility query consumed by MOD-40's destination picker and hospital referrals |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | Hospital information lives in whoever's memory or phone contacts happens to have it. |
| 2 | It's updated only when someone happens to notice a number or detail is wrong. |
| 3 | There's no shared list, so different staff can have different, outdated contact numbers for the same hospital. |
| 4 | Capability information (can this facility handle trauma? burns?) exists only as institutional knowledge. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Inconsistent, personally-held contact information across staff |
| 2 | No written record of a facility's actual capabilities |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | An authorized dispatcher opens the Hospitals page and searches for a facility. | User Action |
| 2 | The dispatcher opens the facility's profile and views location, contacts, and capabilities. | Processing |
| 3 | The dispatcher edits a field (e.g. a contact number) and saves, or creates a new facility record. | User Action |
| 4 | The backend validates the fields, authenticates the actor, and persists the record with an identifier and timestamp. | Validation |
| 5 | MOD-40's destination picker and hospital referrals read this registry as their source of truth. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A searchable, administered list of hospitals and facilities |
| 2 | A persisted, editable facility profile (location, contacts, capabilities, status, last-verified date) |
| 3 | The data MOD-40's destination picker sorts by distance when a responder selects a hospital |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Search for a hospital on the Hospitals page, open its profile, and edit one field (e.g. a contact number); confirm it saves.
2. Create a new facility to show the registry is a live CRUD screen, not static seed data; confirm it's the same list MOD-40's destination picker pulls from.

**Do not claim:**
- Live, automatic synchronization with a hospital's own internal capacity/bed-management system — status is as current as the last manual update.
