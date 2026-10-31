# MOD-22 — Real-Time Incident Map

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-22 |
| Version | 1.0 |
| Module Name | Real-Time Incident Map |
| Module Cluster | Cluster D — Alert Processing and Dispatch |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Gives the Operations Center geographic situational awareness — every active incident and every responding unit's live position, shown on an actual map of Bocaue, color-coded by priority, with operational overlays like flood-prone barangays.

**Purpose**
Let a dispatcher or supervisor see the whole municipal picture at a glance instead of scanning a list of table rows.

**Tasks Performed**
1. Plots every active incident as a marker on a MapLibre map, colored by priority.
2. Plots every responding unit's position, updated live.
3. Overlays flood-prone-barangay boundaries (Lolomboy, Bunlo, Igulot, Bambang) over the base map.
4. Opens the matching incident drawer directly when a marker is clicked.
5. Updates the map the moment a new incident is submitted or a unit's position changes, with no manual refresh, by reading the same real-time event engine (MOD-20) used across operations.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A dispatcher's or supervisor's own mental model of the municipality, built from printed maps and memory | Each active incident's coordinates and priority |
| 2 | No way to glance at a single view and see every active incident and unit position at once | Each responding unit's live GPS position |
| 3 | No overlay distinguishing flood-prone barangays from the rest of the map | The real-time `incident.created/updated` and `responder.location_updated` events from MOD-20 |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Printed municipal maps and staff familiarity with the area | Operations Center Map screen, `frontend/app/(ops)/operations/map` |
| 2 | Memory of where units typically are | MapLibre rendering incident markers (colored by priority) and live responder markers |
| 3 | No live position tracking of units | Flood-prone-barangay boundary overlay (Lolomboy, Bunlo, Igulot, Bambang) drawn over the base map |
| 4 | — | Socket.io subscription to the same real-time event engine as MOD-20, so new incidents/positions appear without a page refresh |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | "Where is everything" lives only in whoever's mental model of the municipality is sharpest. |
| 2 | That picture is built from printed maps and personal memory, not a live data source. |
| 3 | There is no way to glance at a screen and see every active incident and every unit's position at once. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A mental, non-shared picture of current incidents and unit locations |
| 2 | No single view anyone else can check |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A dispatcher or supervisor opens Operations → Map. | User Action |
| 2 | MapLibre renders every active incident as a marker colored by priority, and every responding unit's current position. | Processing |
| 3 | Flood-prone-barangay boundaries are drawn as an overlay on the same base map. | Processing |
| 4 | A new incident submitted from the phone is pushed through the same real-time event engine used across operations and appears on the map with no refresh. | Notification |
| 5 | A responder's marker moves as their phone reports a new position. | Notification |
| 6 | Clicking any marker opens that incident's drawer directly. | User Action |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A live map showing every active incident (by priority color) and every responding unit's current position |
| 2 | A flood-prone-barangay overlay over the base map |
| 3 | An incident drawer opened directly from a clicked marker |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Open Operations → Map and point out the color-coded incident markers and the flood-prone-barangay overlay.
2. Submit a new SOS from the phone and confirm the marker appears on the map live, with no refresh, then click it to open the incident drawer directly from the map.

**Do not claim:**
- Authoritative GIS accuracy, 3D mapping, or guaranteed instant tile loading.
- A universal offline map mode — this is a live operational view, not a surveying tool.
