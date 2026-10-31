# MOD-51 — Emergency Intelligence and Risk Visualization

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-51 |
| Version | 1.0 |
| Module Name | Emergency Intelligence and Risk Visualization |
| Module Cluster | Cluster I — Analytics, Intelligence, and Surge |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Surfaces where incidents are concentrating and which areas carry a standing risk — a barangay-level incident count, a clustered density overlay for the operations map, the municipality's defined flood/risk zones, and a by-category incident-pattern breakdown.

**Purpose**
Give dispatchers and supervisors a planning view of risk and incident concentration, layered on top of the live operations map, instead of relying on institutional memory of "which barangays flood."

**Tasks Performed**
1. Counts incidents per barangay as a simple heatmap.
2. Clusters recent incidents (default 30 days) into a coordinate grid for the operations map overlay, with an intensity value per cluster and the dominant category.
3. Lists the municipality's active flood risk zones, and all defined risk areas of any type.
4. Lets a System Administrator create, update, or delete a risk area, validating its barangay against Bocaue's defined list.
5. Reports incident patterns grouped by category.
6. Every night, finds recurring clusters of incidents (at least 4 within about 150 m over the last 90 days, per category) that no active risk area covers yet, and proposes them as risk areas for a System Administrator to approve or dismiss.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Staff recollection of "which barangays usually flood" | Incident records with their barangay, category, and submission time |
| 2 | PAGASA bulletins and river-gauge readings, read and acted on manually | Incident GPS coordinates (latitude/longitude) |
| 3 | No structured, queryable map of risk areas | A period filter (days back) for the map overlay |
| 4 | | Risk area fields: name, type, risk level, barangay, flood threshold (meters), description, active flag |
| 5 | | System Administrator's decision on a proposed area: approve (with a name and risk level) or dismiss |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Staff knowledge of flood-prone barangays, not written down anywhere queryable | `backend/src/risk-intelligence` — `RiskIntelligenceService`, `RiskIntelligenceController` |
| 2 | PAGASA bulletins and river-gauge readings followed manually | PostgreSQL (`risk_areas`, `incident`, `incident_locations`, `geo_regions` tables) via Prisma |
| 3 | | NestJS REST API (`/v1/risk-intelligence`) restricted by role (heatmap/map-points/patterns: Dispatcher and Supervisor; risk-area writes: System Administrator only) |
| 4 | | Operations Center risk map, `frontend/app/(ops)/operations/risk`, and `frontend/components/risk/RiskHeatmapView.tsx` |
| 5 | | Administration → Risk Areas screen, `frontend/app/(ops)/administration/risk-areas` |
| 6 | | MOD-46 Immutable Audit Trail for risk-area create/update/delete |
| 7 | | Nightly hotspot job (2:30 AM) using PostGIS clustering (`ST_ClusterDBSCAN`) and the `risk_area_proposals` table |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | Staff rely on memory and experience to know which barangays (Lolomboy, Bunlo, Igulot, Bambang) flood during typhoon season. |
| 2 | PAGASA advisories and river-gauge readings are read and acted on manually, with no system tying them to past incident locations. |
| 3 | There is no map or count showing where incidents are actually concentrating over time. |
| 4 | Planning for the next typhoon season relies on institutional memory rather than recorded data. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Unrecorded staff knowledge of risk-prone areas |
| 2 | No visual or numeric picture of incident concentration |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A Dispatcher or Supervisor opens the operations risk map or requests the heatmap/map-points endpoint. | User Action |
| 2 | For the barangay heatmap, the backend groups incident locations by barangay and counts them. | Processing |
| 3 | For the map overlay, the backend reads incidents submitted within the chosen period (default 30, max 365 days), rounds each location to a ~111 m coordinate grid cell, and buckets incidents into those cells. | Processing |
| 4 | Each cluster's intensity is normalized against the busiest cluster (0–1), and its dominant category is the one with the most incidents in that cell. | Processing |
| 5 | The map renders the clustered points as a density overlay on the operations map. | Processing |
| 6 | A Dispatcher or Supervisor lists active flood zones or all defined risk areas; a System Administrator creates, updates, or deletes a risk area from Administration → Risk Areas, with the barangay validated against Bocaue's defined barangay list. | Validation |
| 7 | Risk-area changes are persisted and written to the audit trail with before/after values. | Database |
| 8 | A Supervisor or System Administrator requests incident patterns, grouped and counted by category. | Processing |
| 9 | Every night at 2:30 AM, the system clusters the last 90 days of incidents per category (leaving out false, duplicate and cancelled reports), skips clusters already covered by an active risk area or recently dismissed, and saves one Pending proposal per type and barangay with an outline around the cluster. | Processing |
| 10 | A System Administrator opens the Proposed areas list on Administration → Risk Areas and either approves a proposal with a name and risk level, which creates the risk area with its outline (barangay check and audit apply), or dismisses it. Nothing becomes a risk area without this approval. | User Action |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A per-barangay incident count |
| 2 | Clustered, intensity-scored map points for the operations map overlay |
| 3 | A list of active flood zones and all defined risk areas |
| 4 | A created, updated, or deleted risk area, audited |
| 5 | An incident-pattern breakdown by category |
| 6 | Proposed risk areas, and the risk areas created from approved proposals |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Open the operations risk map and confirm clustered points render over recent incidents.
2. As a System Administrator, create a risk area with an invalid barangay name and confirm it's refused.
3. Create, update, and delete a risk area and confirm each action appears in the Audit log with before/after values.
4. Confirm a System Administrator sees the Risk Areas admin screen but not the heatmap/map-points endpoints (role-restricted since role dashboards Phase 5b).
5. Run the nightly job on test data (or wait for 2:30 AM), approve one proposal and confirm a risk area with an outline and an audit row appear. Not yet tried through the screen.

**Do not claim:**
- PostGIS-based density on the map overlay — the overlay uses a plain coordinate-grid bucket, and the barangay heatmap is a simple count. (Only the nightly hotspot proposals use PostGIS clustering.)
- Flood forecasting, AI-driven prediction, or any guaranteed risk score — risk areas and thresholds are entered manually.
