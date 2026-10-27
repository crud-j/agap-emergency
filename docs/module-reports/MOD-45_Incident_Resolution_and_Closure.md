# MOD-45 — Incident Resolution and Closure

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-45 |
| Version | 1.0 |
| Module Name | Incident Resolution and Closure |
| Module Cluster | Cluster G — Status, Escalation, and Closure |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Records the outcome of an incident — what happened, the patient's disposition, and any notes — then closes the incident, after which the resolution can no longer be changed.

**Purpose**
Give every incident a documented ending instead of just letting it go quiet, and tie closure to the Verified Reporter standing shown to citizens.

**Tasks Performed**
1. Records the outcome, patient disposition (from a fixed list) and resolution notes for an incident.
2. Closes the incident, moving its status to CLOSED, after which the resolution is locked.
3. Re-saves (upserts) the resolution if closing fails after the resolution was recorded, so the outcome is never lost.
4. Counts an incident toward the reporter's Verified Reporter standing only once it reaches CLOSED.
5. Shows the resolution dialog's prompt and action button based on the incident's current status (Resolved → "Resolve & close", Referred → "Close incident").

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A verbal report-back from the crew once they're done | The outcome (free text) |
| 2 | A note in the logbook if someone remembers to write one | An optional patient disposition, chosen from a fixed list (treated on scene, transported to hospital, transported to evacuation center, refused transport, deceased on scene, transferred to another agency, unable to locate, no patient found, other) |
| 3 | | Optional resolution notes |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Verbal report-back from the field crew | `backend/src/incidents/incidents.service.ts` (`createResolution`, `close`) and matching REST routes (`POST /api/v1/incidents/:id/resolution`, `POST /api/v1/incidents/:id/close`) |
| 2 | Logbook entry, if written | PostgreSQL `incident_resolutions` table (upserted, unique per incident) |
| 3 | | Operations Center Incident Detail drawer, Resolution dialog (`frontend/components/incidents/IncidentDetailDrawer.tsx`) |
| 4 | | Reporter standing query used for the Verified Reporter badge (MOD-01) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The crew reports back verbally once the call is done. |
| 2 | The dispatcher may or may not note the outcome in the logbook. |
| 3 | The incident is simply considered "over" with no recorded disposition. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal, undocumented outcome |
| 2 | No disposition on record for the patient |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | Once an incident reaches RESOLVED (or REFERRED), the Incident Detail drawer shows a "Resolve & close" (or "Close incident") action. | Processing |
| 2 | The dispatcher opens the Resolution dialog, selects an outcome, and optionally a patient disposition and notes. | User Action |
| 3 | The backend saves the resolution (upsert, keyed to the incident) before closing, so the outcome survives even if the close step fails. | Database |
| 4 | The backend moves the incident's status to CLOSED; a CLOSED incident's resolution can no longer be changed. | Validation |
| 5 | The reporter's Verified Reporter count increases by one, since it only counts incidents that reached CLOSED. | Processing |
| 6 | The citizen's History screen shows the recorded outcome on the Resolution tab. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A persisted resolution record (outcome, disposition, notes) in PostgreSQL |
| 2 | An incident moved to CLOSED, locking its resolution |
| 3 | An increment to the reporter's Verified Reporter standing |
| 4 | The outcome visible on the citizen's History → Resolution tab |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Move a test incident to RESOLVED, open the drawer, and resolve it with an outcome and disposition; confirm it closes.
2. Try resolving it again and confirm the "already closed" rejection.
3. Check that the reporter's Verified Reporter count increased by one.

**Do not claim:**
- Reopening a closed incident — there is no reopen endpoint or screen; CLOSED is final for the resolution.
- Citizen feedback/rating submission — the backend has a `POST /:id/feedback` endpoint (`overallRating`, `comments`) and a `feedback_ratings` table, but no mobile or web screen calls it.
- A "closure checklist" UI — closing requires only the Resolution dialog fields (outcome, optional disposition, optional notes), not a multi-item checklist.
