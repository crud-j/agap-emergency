# MOD-12 — Location Context and Reverse Geocoding

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-12 |
| Version | 1.0 |
| Module Name | Location Context and Reverse Geocoding |
| Module Cluster | Cluster C — Location and Tracking |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Turns the reporter's GPS coordinates into a readable address and tags the incident with its official Bocaue barangay. The phone shows the street address while the report is being made; the backend then places the incident inside the barangay boundaries.

**Purpose**
Let dispatchers and responders read "street, barangay" instead of raw coordinates, and route each incident to the right barangay for coordination (A1) and reporting.

**Tasks Performed**
1. Looks up a street address and barangay for the coordinates while the reporter confirms the location.
2. Lets the reporter correct the address by typing.
3. Saves the address with the incident.
4. Tags the incident with its official barangay from the Bocaue boundary map (marking it approximate when the point is just outside a boundary).
5. Keeps the coordinates and continues if the address lookup fails.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Caller's verbal street or purok name | GPS coordinates from MOD-11 |
| 2 | Operator's knowledge of barangay boundaries | Address correction typed by the reporter (optional) |
| 3 | | Official Bocaue barangay boundaries (stored map data) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Printed municipal and barangay map | AGAP Citizen mobile app (Confirm Location and Details screens) |
| 2 | Operator's local knowledge | NestJS REST API (`POST /api/v1/locations/geocode`, open to reports without an account) |
| 3 | | Nominatim (OpenStreetMap) reverse geocoding, 5-second timeout |
| 4 | | PostgreSQL with PostGIS (`geo_regions` barangay boundaries, `incident_locations`) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The caller gives a street, purok or landmark. |
| 2 | The operator works out the barangay from the description and local knowledge. |
| 3 | The operator writes the address and barangay in the logbook. |
| 4 | Mistakes about the barangay are found only when responders arrive or the barangay is called. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Address and barangay written in the logbook |
| 2 | Occasional wrong barangay or unclear address |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | When a GPS position is captured, the app sends the coordinates to the backend for an address. | Integration |
| 2 | The backend checks the coordinates are inside Bocaue. | Validation |
| 3 | The backend asks Nominatim for the address and returns the street address, barangay, municipality and province. | Integration |
| 4 | The screen shows the barangay and address under the map. "Edit" lets the reporter type a correction. | User Action |
| 5 | If the lookup fails, the app keeps the coordinates and shows them instead; the report continues. | Processing |
| 6 | On submit, the backend saves the address (or the typed correction) with the location. | Database |
| 7 | After saving, the backend finds the official barangay whose boundary contains the point, or the nearest one marked approximate, and stores it on the incident location. | Database |
| 8 | Dispatchers see the address, landmark and barangay in the Incident Queue and drawer. | Notification |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Readable address shown to the reporter |
| 2 | Address saved with the incident location |
| 3 | Official barangay tagged on the incident |
| 4 | Address and barangay shown to dispatchers |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Start an SOS in a known barangay; check the address and barangay on the phone.
2. Submit, then check the Incident Queue's Barangay column.
3. Block internet to Nominatim; the coordinates still show and the report still sends.

**Do not claim:**
- Forward geocoding (typing an address to get coordinates). A typed location is saved as text only.
- The phone's barangay being the final one. The backend's boundary check sets the official barangay.
