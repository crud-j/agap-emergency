# MOD-24 — Emergency Severity and Priority Recommendation

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-24 |
| Version | 1.0 |
| Module Name | Emergency Severity and Priority Recommendation |
| Module Cluster | Cluster D — Alert Processing and Dispatch |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Gives the dispatcher a starting-point priority for each incident — the intake category's default, raised to CRITICAL only when specific caller answers from MOD-09 intake (pinned in a vehicle, fuel leak/fire, people trapped, fireworks/explosions, fire spreading, stranded people in worsening flood conditions, live wires in flood water) warrant it. Shown alongside the dispatcher's own assessment at triage; it never substitutes for that decision.

**Purpose**
Make sure a genuinely severe report isn't missed in a busy queue, and show the dispatcher why the system is suggesting a given priority, while leaving the final call entirely to the dispatcher. Priority sets the **order** of response, never **whether** an incident gets one: every incident, at every priority, appears in the live queue and is covered by the same MOD-41 SLA escalation timers. For this reason the screens show the levels as **Immediate / Urgent / Prompt / Standard** (stored as CRITICAL / HIGH / MEDIUM / LOW), so no label reads as "can be ignored".

**Tasks Performed**
1. Assigns a category-based default priority when an incident is created (Fire, Medical, Road Accident, Flood, Natural Disaster, Rescue and Industrial default to HIGH; Debris and Other default to MEDIUM). This applies to both the report form and the SOS endpoint. A citizen or guest cannot set the priority; a priority sent with a report is accepted only from a Dispatcher or Supervisor.
2. Raises that default to CRITICAL only when specific intake answers match a defined list of high-risk conditions, and records which answer(s) triggered the raise.
3. Recomputes the recommendation on demand from the incident's stored caller answers (`GET /dispatch/priority/:incidentId`), so the rule set can change without rewriting old incidents.
4. Shows the recommended priority next to the current priority on the Triage screen when they differ.
5. Lets the dispatcher confirm or override the priority from the Incident priority control in the incident drawer (`submitTriage`), with an optional note — the recommendation never applies itself.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Caller's verbally described situation, judged for urgency on the spot by the operator | The incident's category |
| 2 | | The caller's MOD-09 intake answers (e.g. pinned, fuel/fire, trapped, burning target, explosions, spreading, stranded, water level/trend, vulnerable people, live wires) |
| 3 | | The incident's currently stored priority |
| 4 | | The dispatcher's confirmed or overridden priority and optional note, set in the incident drawer |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Operator judgment over the phone, with no structured severity rule | `backend/src/incidents/priority/priority.service.ts`, calling the shared rule function `recommendIntakePriority` (`shared/src/constants/incident-intake.ts`) |
| 2 | | `backend/src/dispatch/dispatch.service.ts` (`getPriorityRecommendation`, `submitTriage`) and `GET /dispatch/priority/:incidentId` |
| 3 | | `frontend/app/(ops)/operations/triage/page.tsx` — the recommended priority (`PriorityRecChip`), and the Incident priority control in the incident drawer |
| 4 | | PostgreSQL — the incident's stored `priority` field and its intake `caller_answers` |
| 5 | | `shared/src/enums/incident-priority.enum.ts` — `PRIORITY_LABELS` / `priorityLabel()`, the display labels (Immediate / Urgent / Prompt / Standard) used by the web console and the responder app |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The operator hears the caller's description and judges severity by ear, with no fixed criteria. |
| 2 | That judgment is written on the logbook or form as the priority and isn't reviewed against a rule afterward. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A priority based entirely on one operator's in-the-moment judgment, with no recorded reasoning |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | At submission, the backend reads the incident's category and sanitized MOD-09 intake answers. | Processing |
| 2 | The priority service looks up the category's default priority, then checks the answers against the defined high-risk conditions. | Processing |
| 3 | If any condition matches, the priority is raised to CRITICAL (never lowered) and each matching condition is recorded as a reason; otherwise the category default is kept. | Validation |
| 4 | This recommendation becomes the incident's stored priority. A priority sent with the report is used instead only when the submitter is a Dispatcher or Supervisor; from a citizen or guest it is ignored. | Database |
| 5 | At triage, the dispatcher opens the incident; the recommendation is recomputed live from the stored answers and shown next to the current priority when they differ, with the matching reasons listed. | Processing |
| 6 | In the incident drawer's Incident priority control, the dispatcher confirms or changes the priority and may add a note; this is saved as the incident's priority of record and is blocked once the incident reaches a terminal status. | User Action |
| 7 | An audit/incident-event record captures the triage decision. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A default priority assigned at submission (category default or CRITICAL, with reasons) |
| 2 | A recomputed recommendation available on demand, shown at triage when it differs from the current priority |
| 3 | The dispatcher's confirmed or overridden priority, saved as the incident's priority of record |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Submit a road-accident SOS with "pinned" answered yes and confirm the incident is created at CRITICAL priority.
2. Submit a road-accident SOS with no high-risk answers and confirm it defaults to HIGH, matching the category default.
3. On the Triage screen, open an incident where the recommendation differs from the current priority and confirm the reasons are listed.
4. In the incident drawer, set a different priority with a note, and confirm it's saved and blocked once the incident is resolved/closed.
5. As a citizen (or with no login), send a report with `"priority": "CRITICAL"` in the body and confirm the stored priority is still the rule's recommendation.
6. Confirm every screen shows Immediate / Urgent / Prompt / Standard, never Critical / High / Medium / Low.

**Do not claim:**
- A machine-learning or probabilistic "confidence" score — the service returns only a priority and a plain-English list of matched conditions.
- That the recommendation can lower a priority — it only ever raises the category default to CRITICAL.
- That a higher priority gets faster SLA escalation — every priority has the same SLA timers today (priority-specific timers are not built).
