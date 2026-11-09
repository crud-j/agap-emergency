# MOD-30 — Suitable Response Unit Recommendation

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-30 |
| Version | 1.0 |
| Module Name | Suitable Response Unit Recommendation |
| Module Cluster | Cluster E — Monitoring and Escalation |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Ranks the available units best suited to respond to a specific incident — scored by capability match, distance from the unit's base, and unit type — and presents that ranking, with its reasons, to the dispatcher.

**Purpose**
Decision support, not decision-making: the system never decides which unit goes, it only makes the dispatcher's choice faster and better-informed, and the dispatcher can always override it.

**Tasks Performed**
1. Takes only Available, active units within 20 km of the incident (or any Available unit when the incident has no location).
2. Scores each unit's verified capabilities against the required-capability list for the incident's category (MOD-29).
3. Calculates the distance from the unit's base location to the incident with PostGIS.
4. Combines capability (50%), distance (35%) and unit-type fit (15%) into one score.
5. Returns a ranked list with the reasoning spelled out for each candidate.
6. Leaves the final unit selection to the dispatcher on the Dispatch screen — nothing here auto-assigns anything.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A dispatcher's memory of who's typically free, or a round of phone calls asking | The incident's category and location |
| 2 | Whatever a unit says about its own distance and availability when called | Each Available unit's verified capabilities, unit type and base location |
| 3 | No consistent method as the number of organizations and units grows | The ranked output: an ordered list of suitable units with the reasoning behind each rank |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Phone calls asking around which units are free and how far away | `backend/src/dispatch/resource-matching/resource-matching.service.ts` |
| 2 | Dispatcher's own memory of unit locations and typical availability | A required-capability matrix mapping incident category to unit capability |
| 3 | No distance calculation — just a rough sense of "who's close" | PostGIS distance calculation from the units' base locations (20 km limit) |
| 4 | — | Operations Center Dispatch screen displaying the ranked list and reasons alongside the Authorize Dispatch action (MOD-31) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The dispatcher tries to recall which units are typically free and nearby. |
| 2 | If unsure, the dispatcher calls around to ask who's available and how far away they are. |
| 3 | This works reasonably with only a couple of units, but becomes slow and inconsistent as more organizations and units are added. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A unit choice based on memory or a round of phone calls |
| 2 | No consistent, repeatable scoring across dispatchers or shifts |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The incident reaches the dispatch stage (Acknowledged or Assessed). | Processing |
| 2 | The backend takes Available, active units with a base location within 20 km of the incident, nearest first. | Processing |
| 3 | Each unit's verified capabilities are compared with the required-capability list for the incident's category. | Validation |
| 4 | PostGIS calculates the distance from each unit's base to the incident location. | Processing |
| 5 | The backend combines capability match (50%), distance (35%) and unit-type fit (15%) into a score and sorts the units by it. | Processing |
| 6 | The backend returns a ranked list with the reasoning for each entry (e.g. "Capability match: 2/3 required", "Distance: 1.2km", "Type: Ambulance (strong match for medical incidents)"). | Database |
| 7 | The Dispatch screen displays the ranking as numbered suggestions (1, 2, 3…) showing each unit's type, distance and skills match, with the full reasons under "Why these units?"; the score itself is used only for ordering and is not shown. The dispatcher may accept the top recommendation or pick any other unit instead. | User Action |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A ranked list of suitable units with a plain-language reason for each |
| 2 | The ranking displayed directly on the Dispatch screen, feeding into MOD-31's authorization step |
| 3 | No automatic assignment — the dispatcher's selection, including an override, is what actually gets dispatched |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Open an Assessed incident → Dispatch and confirm the ranked unit list shows each unit's type, distance and skills match, and that **Why these units?** opens each unit's reason.
2. Deliberately select a lower-ranked unit instead of the top recommendation and confirm the dispatch still proceeds — proving the ranking is advisory, not enforced.

**Do not claim:**
- That the screen shows a points or percentage score for each unit. It shows only the rank number and the reasons; the score stays in the API response.
- AI-validated or mathematically optimal unit selection — this is a rules-based score, and the dispatcher can always override it.
- Automatic assignment — the ranking only informs MOD-31's dispatcher-authorized confirmation.
- Implementation boundary: recommendations are advisory, not autonomous, AI-validated, or guaranteed to be the mathematically optimal choice — real-world factors a dispatcher knows and the software doesn't can always override it, by design.
