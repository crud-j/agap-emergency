# MOD-39 — Hospital and Receiving Facility Registry

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

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
Maintains the master list of hospitals and receiving facilities AGAP knows about: name, address, contact numbers, emergency room, ICU and blood bank, a reviewed map location, whether the hospital is active, and its current receiving status and available beds. It also reminds hospitals when their receiving status is out of date.

**Purpose**
Give every module that needs to know "which hospital can take this patient" (hospital ranking and referrals in MOD-38, the crew's destination picker in MOD-40) one administered source, with locations that were checked by a person and a receiving status whose age is always visible.

**Tasks Performed**
1. Registers a hospital, created by a System Administrator, or by an Org Administrator for their own hospital organization.
2. Sets the hospital's location by map pin or address search, with suggested coordinates; a Supervisor or System Administrator verifies or rejects it, and locations outside the service area or swapped coordinates are refused.
3. Activates or deactivates a hospital (Supervisor or System Administrator).
4. Records the hospital's receiving status (Open, At Capacity, Emergency Only, Closed, Unknown) and available beds, reported by its own Hospital Users or by a Dispatcher or Supervisor, with the time of the report.
5. Shows how old each receiving status is, and flags a status older than 12 hours.
6. Sends reminders: an hourly notice to a hospital's users when its status is over 6 hours old, and a monthly review notice to Org Administrators for records not verified in 90 days.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A name and number scribbled somewhere, or kept in whoever's phone contacts | Hospital profile: name, address, barangay, municipality, province, organization, contact and emergency numbers |
| 2 | Capability information held only as institutional knowledge | Capabilities: emergency room, ICU, blood bank |
| 3 | No shared list, so different staff may have different, outdated numbers for the same hospital | Location: map pin or address search result (latitude and longitude, source) |
| 4 | A phone call to ask whether the hospital can still take patients | Reviewer's decision: verify or reject the location; activate or deactivate the hospital |
| 5 | | Receiving status report: status and available beds |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Personal phone contacts or scribbled notes with hospital numbers | Operations web console Hospitals page (Next.js) with a location finder and map picker (MapLibre) |
| 2 | Institutional memory of which hospital can handle what | NestJS REST API (`/v1/hospitals`, `PATCH /v1/facilities/:id/status`) with role and own-organization checks |
| 3 | No shared, administered record at all | Map search through the AGAP maps service (Nominatim) for address search and suggested coordinates, with a manual pin when the provider is unavailable |
| 4 | — | PostgreSQL with PostGIS (`facilities` table with location, location status, receiving status and its time), audit log |
| 5 | — | Scheduled jobs (hourly and monthly) that create in-app reminders |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | Hospital information lives in whoever's memory or phone contacts happens to have it. |
| 2 | It's updated only when someone happens to notice a number or detail is wrong. |
| 3 | There's no shared list, so different staff can have different, outdated contact numbers for the same hospital. |
| 4 | Whether a hospital can take patients right now is learned only by calling it during the emergency. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Inconsistent, personally-held contact information across staff |
| 2 | No written record of a facility's capabilities or current receiving status |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A System Administrator, or an Org Administrator of a hospital organization, opens the Hospitals page, clicks Add hospital, and enters the profile and capabilities. | User Action |
| 2 | They set the location with the address search or a map pin; the system can suggest coordinates. | User Action |
| 3 | The backend checks the role and organization, refuses a location outside the service area or with swapped coordinates, checks for a duplicate hospital, and saves it. A location entered by a System Administrator is saved as verified; one entered by an Org Administrator is saved as Pending review. | Validation |
| 4 | A Supervisor or System Administrator filters the list to Pending review and verifies or rejects the location. Only a verified location is used for distances. | User Action |
| 5 | The backend saves the decision and writes an audit entry. A Supervisor or System Administrator can also deactivate or reactivate a hospital. | Database |
| 6 | A Hospital User of that hospital's organization (or a Dispatcher or Supervisor) clicks Update status and reports the receiving status and available beds. | User Action |
| 7 | The backend confirms the user may report for that hospital, saves the status with the time of the report, and writes an audit entry. | Database |
| 8 | The Hospitals page shows "Updated n h ago" for each hospital, in amber after 12 hours, when dispatch treats the status as unknown. | Processing |
| 9 | Every hour, the system sends one reminder to the hospital's users when its status is older than 6 hours. On the 1st of each month, Org Administrators get a list of their hospitals and resources not verified in 90 days. The jobs never change a hospital's status. | Notification |
| 10 | Hospital ranking and referrals (MOD-38) and the crew's destination picker (MOD-40) read this registry. | Integration |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Searchable list of hospitals with filters (all, pending review, deactivated) |
| 2 | Saved hospital profile with a reviewed location and audit entries |
| 3 | Current receiving status and beds, with the time it was reported |
| 4 | Status-reminder and monthly review notices |
| 5 | The data MOD-38 ranks and MOD-40's destination picker sorts by distance |

---

## Owner notes (not part of the report)

**Test before signing:**
1. As an Org Administrator of a hospital organization, add a hospital with a map pin; confirm it shows as Pending review.
2. As a Supervisor, verify its location.
3. As that hospital's Hospital User, click Update status → At Capacity; confirm "Updated 0 h ago" and that a Hospital User of another organization can't report for it.
4. Confirm the hospital now ranks lower in the Refer to hospital dialog (MOD-38).

**Do not claim:**
- Editing a hospital's name, contacts or capabilities after it is created. The backend `PATCH /v1/hospitals/:id` exists, but no screen uses it.
- Live synchronization with a hospital's own bed-management system. The status is as current as the last report.
