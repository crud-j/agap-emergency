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
Surfaces where incidents are concentrating and which areas carry a standing risk — flood reports counted per barangay on the real barangay boundaries, every other incident shown where it happened, the municipality's defined flood/risk zones with their outlines, and a by-category incident-pattern breakdown.

**Purpose**
Give dispatchers and supervisors a planning view of risk and incident concentration, layered on top of the live operations map, instead of relying on institutional memory of "which barangays flood."

**Tasks Performed**
1. Counts flood reports per barangay, placing each report in the barangay whose boundary covers its GPS point, and shades the barangay by that count.
2. Shows every other incident (fire, road accident, medical, and the rest) as a dot where it happened; reports of the same type from the same spot (about 11 m) become one dot with a count. A flood report outside every barangay boundary is shown as a dot too.
3. Lists all defined risk areas of any type, drawn with their own outline (approved hotspots) or their barangay's boundary.
4. Lets a Supervisor create, update, or delete a risk area from the Risk Map, validating its barangay against Bocaue's defined list. Dispatchers view the map; the System Administrator sees the area list read-only for support.
5. Every night, finds recurring clusters of incidents (at least 4 within about 150 m over the last 90 days, per category) that no active risk area covers yet, and proposes them as risk areas for a Supervisor to approve or dismiss.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Staff recollection of "which barangays usually flood" | Incident records with their barangay, category, and submission time |
| 2 | PAGASA bulletins and river-gauge readings, read and acted on manually | Incident GPS coordinates (latitude/longitude) |
| 3 | No structured, queryable map of risk areas | A period filter for the map: 30 days, 90 days or 12 months |
| 4 | | Risk area fields: name, type, risk level, barangay, flood threshold (meters), description, active flag |
| 5 | | Supervisor's decision on a proposed area: approve (with a name and risk level) or dismiss |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Staff knowledge of flood-prone barangays, not written down anywhere queryable | `backend/src/risk-intelligence` — `RiskIntelligenceService`, `RiskIntelligenceController` |
| 2 | PAGASA bulletins and river-gauge readings followed manually | PostgreSQL + PostGIS (`risk_areas`, `incidents`, `incident_locations`, `geo_regions` with the 19 OSM barangay boundaries) via Prisma |
| 3 | | NestJS REST API (`/v1/risk-intelligence`) restricted by role (map: Dispatcher and Supervisor; area list: Dispatcher, Supervisor and System Administrator; risk-area and proposal writes: Supervisor only) |
| 4 | | Operations Center risk map, `frontend/app/(ops)/operations/risk`, and `frontend/components/risk/RiskMapView.tsx` |
| 5 | | Risk Map "Risk areas" tab (Supervisor) and a read-only Administration → Risk Areas list (System Administrator), both `frontend/components/admin/RiskAreasTab.tsx` |
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
| 1 | A Dispatcher or Supervisor opens the Risk Map and picks a period (30 days, 90 days or 12 months; 90 by default). | User Action |
| 2 | The backend reads the incidents of that period, leaving out draft, false, duplicate and cancelled reports, and finds each one's barangay from the boundary that covers its GPS point. | Processing |
| 3 | Flood reports are counted per barangay; each barangay is returned with its boundary and its flood count. | Processing |
| 4 | Every other report is grouped by type and spot (about 11 m) into one point with a count and the latest report time, busiest first. A flood report outside every boundary is kept as a point. At most 2,000 points are sent, and the page says when the list was cut. No reporter, patient or incident id is returned. | Processing |
| 5 | The map shades barangays by flood count, outlines flood-prone and fireworks barangays and risk areas, and draws the points coloured by type; they can hide types and tap any dot, area or barangay for its details. | Processing |
| 6 | A Supervisor creates, updates, or deletes a risk area from the Risk Map's Risk areas tab, with the barangay validated against Bocaue's defined barangay list. Dispatchers and the System Administrator (support) only read the list. | Validation |
| 7 | Risk-area changes are persisted and written to the audit trail with before/after values. | Database |
| 8 | Every night at 2:30 AM, the system clusters the last 90 days of incidents per category (leaving out false, duplicate and cancelled reports), skips clusters already covered by an active risk area or recently dismissed, and saves one Pending proposal per type and barangay with an outline around the cluster. | Processing |
| 9 | A Supervisor opens the Proposed areas list on the Risk Map's Risk areas tab (the tab shows how many are waiting) and either approves a proposal with a name and risk level, which creates the risk area with its outline (barangay check and audit apply), or dismisses it. Nothing becomes a risk area without this approval. | User Action |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A per-barangay flood count on the real barangay boundaries |
| 2 | Incident points at the spot where they happened, with a count per spot |
| 3 | A list of all defined risk areas with their outlines |
| 4 | A created, updated, or deleted risk area, audited |
| 5 | Proposed risk areas, and the risk areas created from approved proposals |

---

## Owner notes (not part of the report)

**Test before signing:**
1. As a Supervisor, open the Risk Map. Confirm a fire or road accident shows as a dot at its street, not at the barangay centre; tap it and check type, count, barangay and date. Report a flood and confirm its barangay turns blue with the count in the label. Switch between 30 days, 90 days and 12 months, and hide a type from the legend.
2. **Pinned area (2026-11-15).** As a Supervisor, open the Risk areas tab and check there is no empty gap above the content. Click **Add risk area** and click the map:
   - the barangay, a suggested name and a suggested level fill in, with the nearby incident counts;
   - drag the radius slider and watch the circle change;
   - clicking outside Bocaue is refused.
   Save it, and confirm the circle shows on the tab's map and on the Risk Map.
3. Create, update, and delete a risk area and confirm each action appears in the Audit log with before/after values (including the pin and radius).
4. Confirm a Dispatcher sees the Risk Map without the Risk areas tab, and a System Administrator sees Administration → Risk Areas read-only (cards and map, no buttons, no proposals) but not the Risk Map.
5. **Check now.** Press it and confirm "Last checked" updates and the result line appears ("Nothing new found" or "N proposals to review"). With 3 or more flood reports in one barangay in 90 days, a "Whole barangay" flood proposal appears. Approve it and confirm the area and an audit row.
6. **Hints.** With more incidents of an area's type inside it than its level suggests (3 → Moderate, 6 → High, 10 → Critical), the card offers **Raise to …**; applying it shows in the Audit log.

**Risk areas (2026-11-15):**
- A new area is a **pin with a radius** (50 m – 2 km). The barangay comes from the pin.
- Older areas and approved whole-barangay flood proposals still cover the barangay. Approved cluster proposals keep their outline.
- **Each card** shows the incidents of the area's type inside it (last 90 days, the 90 before, the latest), worked out by the server.
- **Hints:**
  - **Raise** the level when the counts call for more;
  - **Deactivate?** after 12 quiet months, for areas older than a year.
  - AGAP never lowers a level or changes anything itself.
- **Hotspot check:**
  - runs nightly at **02:30 Manila time** (before, the time zone was the server's);
  - floods are proposed **per barangay** (3 or more reports in 90 days) instead of as point clusters;
  - **Check now** runs it on demand, and the last run is shown.
- **Code:**
  - `backend/src/risk-intelligence/` (`risk-area-rules.ts` for the numbers);
  - migration `20261115120000_risk_area_pin`;
  - `frontend/components/admin/RiskAreasTab.tsx`, `components/risk/RiskAreasMap.tsx`, `RiskAreaPinMap.tsx`.

**Do not claim:**
- A density model or heatmap — the map shows counts per spot (~11 m) and per barangay, nothing smoothed or predicted. Only the nightly hotspot proposals use PostGIS clustering.
- Flood forecasting, AI-driven prediction, or any guaranteed risk score. Suggested levels are a simple count rule (risk-area-rules.ts), and a Supervisor sets every level and threshold.
