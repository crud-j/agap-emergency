# MOD-29 — Incident-to-Response Capability Matrix

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-29 |
| Version | 1.0 |
| Module Name | Incident-to-Response Capability Matrix |
| Module Cluster | Cluster E — Monitoring and Escalation |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Defines what a responding unit needs to be capable of for each incident category, keeps a catalog of named capabilities (e.g. Firefighting, Water Rescue, Patient Transport), and records which verified capabilities each unit has. MOD-30's recommendation scoring reads this matrix and catalog to filter and score candidate units.

**Purpose**
Give the capability side of unit recommendation one fixed, consistent definition — "what does a flood rescue need" — instead of leaving it to each dispatcher's own judgment, so MOD-30 scores every incident against the same standard.

**Tasks Performed**
1. Maintains a capability catalog (name, description, category) in `resource_capabilities`.
2. Defines a fixed incident-category → required-capability matrix and a category → unit-type affinity table, used by MOD-30's scoring.
3. Shows each unit's capabilities as chips in the Fleet & Units Registry.
4. Tracks each unit-capability assignment with a verified flag.
5. Feeds required and matched capabilities into MOD-30's ranked recommendation for a given incident.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A dispatcher's own sense of which agency or unit type suits a given emergency (e.g. "fire needs a BFP truck") | The incident's category |
| 2 | No written minimum-equipment or capability standard to check a unit against | The fixed category → required-capability matrix and category → unit-type affinity table |
| 3 | No catalog of what any specific unit can actually do | Each candidate unit's assigned, verified capabilities |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Dispatcher's own operational knowledge of which units can do what | `backend/src/dispatch/resource-matching/resource-matching.service.ts` — `CAPABILITY_MATRIX` and `TYPE_AFFINITY` constants and the capability-scoring function |
| 2 | No catalog, reference table, or standard | PostgreSQL `resource_capabilities` (catalog) and `resource_capability_assignments` (per-unit assignment, with a verified flag) |
| 3 | — | NestJS REST API `GET /v1/resources/recommend/:incidentId` and `GET /v1/resources` (capabilities included), with role checks |
| 4 | — | Operations Center Fleet & Units page, Registry tab, displaying each unit's capabilities as read-only chips |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A dispatcher decides from memory or convention which unit type or agency suits a given emergency category. |
| 2 | There's no written minimum-capability standard to check a specific unit against before suggesting it. |
| 3 | Suitability is judged case by case, with no catalog recording what any given unit can actually do. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | An unwritten, person-dependent sense of which units suit which emergencies |
| 2 | No catalog or reference standard a dispatcher can check |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | Each unit's verified capabilities are stored in `resource_capability_assignments`, linked to the capability catalog (set up with the unit records). | Database |
| 2 | A dispatcher or administrator opens Fleet & Units → Registry, which shows each unit's capabilities as read-only chips. | User Action |
| 3 | When MOD-30 scores candidates for an incident, it looks up the fixed required-capability list for that incident's category and the category → unit-type affinity table. | Processing |
| 4 | It compares the required capabilities against each candidate unit's verified assigned capabilities, and factors in the type affinity, to produce the capability component of MOD-30's score. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A capability catalog and per-unit capability assignment stored in PostgreSQL |
| 2 | The required-capability list and matched-capability list attached to each candidate in MOD-30's ranked recommendation |
| 3 | Capability chips shown in the Fleet & Units Registry |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Open Fleet & Units → Registry and confirm the seeded units show their capability chips.
2. Open Dispatch on a Fire incident and confirm the recommendation lists "Capability match: n/m required" for the BFP truck.

**Implementation gap (decide before signing):** there is no screen to assign, remove or verify a unit's capabilities. The backend `POST`/`DELETE /v1/resources/:id/capabilities` exists, but an assignment made that way stays unverified, and nothing can verify it, so it never counts in MOD-30. Today only the seeded capabilities count. Ask for an "assign and verify capability" control in the Registry if your instructor expects administrators to manage capabilities.

**Do not claim:**
- A configurable, admin-editable capability matrix — `CAPABILITY_MATRIX` and `TYPE_AFFINITY` are fixed constants in code, not editable from any screen or API.
- That assigning a capability through the API makes it count toward MOD-30's scoring immediately — it stays unverified, because no endpoint currently sets `is_verified` to `true`.
- Implementation boundary: the category → capability matrix and unit-type affinity table are fixed in code, not editable from any screen or API. A capability only counts toward MOD-30's scoring once its assignment is verified (`is_verified = true`), but no endpoint or screen in the current implementation ever sets that flag — so assigning a capability today makes it visible on the registry chip but does not yet affect matching.
