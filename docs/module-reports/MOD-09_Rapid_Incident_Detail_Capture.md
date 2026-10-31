# MOD-09 — Rapid Incident Detail Capture

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-09 |
| Version | 1.0 |
| Module Name | Rapid Incident Detail Capture |
| Module Cluster | Cluster C — Location and Tracking |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
The "Tell responders what you see" screen of the emergency report. It asks a few tap-to-answer questions chosen for the incident type, plus a landmark, the number of people hurt, whether the reporter is also in danger, and free-text notes. Every question is optional, and the report can be sent at any point.

**Purpose**
Give dispatchers the details that change what they send (people trapped, fuel leaking, water rising) in seconds, without a long phone interview and without ever delaying the report.

**Tasks Performed**
1. Shows type-specific questions from one shared question list (road incident, fire, natural disaster).
2. Shows follow-up questions only when they apply (water depth and trend only when flooding is ticked).
3. Records a nearest landmark, the number of people hurt or in danger, and the reporter's own situation.
4. Accepts up to 1,000 characters of notes.
5. Keeps only answers the shared question list defines and files a natural disaster with flooding as a Flood incident.
6. Shows the answers, and any answer that raised the priority, to the dispatcher.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Caller's answers to the operator's questions | Answers to type-specific questions (tap choices) |
| 2 | Caller's description of nearby landmarks | Nearest landmark (up to 120 characters) |
| 3 | Caller's estimate of how many are hurt | People hurt or in danger (1, 2–5, 5+, not sure) |
| 4 | | Reporter's situation (I'm safe / I need help too) |
| 5 | | Notes (up to 1,000 characters) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Telephone / MDRRMO hotline | AGAP Citizen mobile app (Details screen) |
| 2 | Operator's memory and experience for questions | Shared intake question list (`@agap/shared`), used by app, backend and web |
| 3 | Paper logbook or incident form | NestJS REST API (`POST /v1/incidents`) with answer filtering |
| 4 | | PostgreSQL (`incident_details.caller_answers`, `priority_reasons`, `incidents.hazard_flags`) |
| 5 | | Operations Center incident drawer (Caller details section) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The operator asks the caller what happened, where, and how many are hurt. |
| 2 | The operator asks follow-up questions from experience; important ones are sometimes missed. |
| 3 | The caller, often panicking, answers in long descriptions. |
| 4 | The operator writes a summary in the logbook. |
| 5 | Details are passed to responders verbally. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Handwritten summary in the logbook |
| 2 | Verbal briefing to responders |
| 3 | Missing details when a question was not asked |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | After choosing the incident type, the reporter sees the Details screen with the note "Every question is optional. If it's urgent, send now." | User Action |
| 2 | The app shows the questions for the type: vehicles involved, injuries, someone pinned, fuel or fire, which road and traffic (road incident); what is burning, people trapped, spreading, explosions, LPG or chemicals (fire); what is happening, people stranded, people needing extra help (natural disaster). | Processing |
| 3 | When the reporter ticks flooding, the app adds water depth and whether the water is still rising. | Processing |
| 4 | The reporter optionally adds a landmark, the number of people hurt, "I'm safe" or "I need help too", and notes, then sends. | User Action |
| 5 | The backend keeps only answers the shared list defines and drops anything else. | Validation |
| 6 | A natural disaster with flooding is filed as a Flood incident; the answers feed the priority recommendation (MOD-24). | Processing |
| 7 | The backend saves the answers, the reasons that raised the priority, and readable answer lines with the incident. "I need help too" also saves the reporter as a patient. | Database |
| 8 | In the web incident drawer, the dispatcher sees the answers in plain words and why the priority was raised. | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Structured caller answers saved with the incident |
| 2 | Landmark, people count and reporter's situation on the incident |
| 3 | Readable caller details and priority reasons in the dispatcher's drawer |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Report a Fire with "Fireworks" and "People trapped: Yes"; check the drawer shows the answers and a raised priority with reasons.
2. Report a Natural disaster, tick flooding, and answer water depth; check it is filed as Flood.
3. Send a report with no answers at all; it is accepted.

**Do not claim:**
- Questions for a Medical incident type. The app offers only Road incident, Fire and Natural disaster.
- Answers being required. None are.
