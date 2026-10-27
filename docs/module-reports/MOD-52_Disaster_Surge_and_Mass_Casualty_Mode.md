# MOD-52 — Disaster Surge and Mass-Casualty Mode

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-52 |
| Version | 1.0 |
| Module Name | Disaster Surge and Mass-Casualty Mode |
| Module Cluster | Cluster I — Analytics, Intelligence, and Surge |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
For a disaster or mass-casualty event — the kind of scenario Bocaue plans for with its fireworks industry and flood-prone barangays — this module gives a supervisor a controlled surge mode: grouping a major incident, handling multiple patients with rapid triage tags, tracking a resource surge, and supporting a broadcast until deactivation.

**Purpose**
Scale coordination beyond what a single-incident, one-radio-channel model can handle when dozens of patients and multiple agencies converge on one scene at once.

**Tasks Performed**
1. Lets a supervisor activate Surge Mode for a major incident from the Operations Center.
2. Groups that incident as a major event the rest of the dashboard treats specially.
3. Logs multiple patients with rapid triage tags (e.g. Red/Yellow/Green).
4. Shows a resources summary of what's available across the municipality at a glance.
5. Sends a surge-specific broadcast.
6. Deactivates surge mode to close out the operational period cleanly.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | The same single-incident radio-call workflow used for an ordinary emergency, regardless of scale | A supervisor's Activate Surge Mode action on a major incident |
| 2 | Ad hoc, verbal coordination as multiple agencies converge on scene | Per-patient triage tag entries (e.g. Red/Yellow/Green) logged against the surge incident |
| 3 | No structured resource picture once the event grows beyond one unit | A Deactivate Surge Mode action closing the operational period |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Radio calls managed the same way for one patient or fifty | `backend/src/disaster-mode` (controller, service, and DTOs confirmed as real, non-stub code) |
| 2 | No major-incident grouping — every report stands alone | Operations Center Surge screen, `frontend/app/(ops)/operations/surge` |
| 3 | No rapid triage-tag tool — triage is verbal | Triage-tag persistence per patient under the surge incident |
| 4 | — | A resources summary view aggregating availability across the municipality |
| 5 | — | Surge broadcast tied to the activated incident |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A mass-casualty event is managed the same way a single incident is — one record, one set of radio calls. |
| 2 | That approach doesn't scale once there are suddenly dozens of patients and multiple agencies on scene. |
| 3 | Coordination becomes ad hoc and verbal very quickly, with no structured grouping of the event. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | One undifferentiated incident record regardless of scale |
| 2 | Ad hoc, unstructured verbal coordination across agencies |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A supervisor activates Surge Mode for a major (or test) incident from the Operations Center. | User Action |
| 2 | The incident is grouped as a major event; the rest of the dashboard treats it specially. | Database |
| 3 | Patients are logged individually with rapid triage tags. | User Action |
| 4 | The resources summary aggregates what's available across the municipality for the supervisor's view. | Processing |
| 5 | The supervisor sends a surge broadcast, which appears on the dashboard. | Notification |
| 6 | The supervisor deactivates surge mode, closing out the operational period. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A grouped major-incident record with its logged patients and triage tags |
| 2 | A municipality-wide resources summary visible to the supervisor |
| 3 | A surge broadcast appearing on the dashboard, and a cleanly closed operational period on deactivation |

---

## Owner notes (not part of the report)

**Test before signing:**
1. As `supervisor@mdrrmo.bocaue.gov.ph`, activate Surge Mode on a test incident, add two or three patients with different triage tags, and confirm the resources summary updates.
2. Send the surge broadcast and confirm it appears on the dashboard; deactivate surge mode and confirm the operational period closes.

**Do not claim:**
- Instant triage-tag refresh — the list updates every 30–60 seconds, which is a stated, accepted limit.
- A certified mass-casualty command system or integration with any external EOC software.
