# MOD-11 — Precision GPS Capture

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-11 |
| Version | 1.0 |
| Module Name | Precision GPS Capture |
| Module Cluster | Cluster C — Location and Tracking |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
The "Confirm Location" step of the emergency report. It takes several GPS readings in a few seconds, keeps the most accurate one, shows it on a map with the accuracy, and checks that it is inside Bocaue. A signed-in reporter can continue without a precise location; a report without an account needs a GPS position inside Bocaue.

**Purpose**
Send responders to the exact spot instead of a description, without letting a weak signal or a denied permission stop someone from asking for help.

**Tasks Performed**
1. Asks for location permission and takes up to three high-accuracy readings within six seconds, stopping early at 20 m accuracy.
2. Keeps the most accurate reading and shows it on a map with its accuracy.
3. Checks that the position is inside Bocaue Municipality.
4. Lets a signed-in reporter retry, type a location, or continue without precise GPS.
5. Requires a Bocaue GPS position for a report without an account.
6. Saves the coordinates and accuracy with the incident and records how the location was obtained.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Caller's verbal description of the location | Phone GPS readings (latitude, longitude, accuracy) |
| 2 | Landmarks named by the caller | Location permission (allowed or denied) |
| 3 | | Typed location or landmark (optional, when GPS is weak) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Telephone / MDRRMO hotline | AGAP Citizen mobile app (Confirm Location screen) |
| 2 | Printed municipal map | Expo Location (high accuracy, best of several readings) |
| 3 | Operator's knowledge of Bocaue streets | MapLibre map preview with the Bocaue boundary |
| 4 | | Shared Bocaue boundary check (`@agap/shared`), on the phone and the server |
| 5 | | NestJS REST API (`POST /v1/incidents`) |
| 6 | | PostgreSQL with PostGIS (`incident_locations`) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The operator asks the caller where they are. |
| 2 | The caller names a street, purok or landmark, often unclear under stress. |
| 3 | The operator asks follow-up questions and finds the place on a map from memory. |
| 4 | The operator relays the description to responders, who may need to call again on the way. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Location written in words in the logbook |
| 2 | Extra calls and delays to find the exact place |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | Right after the SOS starts, Confirm Location opens and shows "Getting your location...". | Processing |
| 2 | The app asks for location permission if needed, then takes up to three high-accuracy readings within six seconds, stopping once one is within 20 m. | Integration |
| 3 | The app keeps the most accurate reading and checks that it lies inside Bocaue. | Validation |
| 4 | The map shows the position; the screen shows the GPS status and the address (MOD-12). | Processing |
| 5 | If permission is denied, no reading arrives, or the position is outside Bocaue, the screen says so and offers Retry, Edit (type a location) and, when signed in, "Continue without precise location". | Validation |
| 6 | A report without an account cannot continue until a Bocaue GPS position is captured. | Validation |
| 7 | The Details screen reads the position again and shows "GPS location captured (±N m)". | Processing |
| 8 | On submit, the backend checks that latitude and longitude come together and lie inside Bocaue, and that a report without an account has them. | Validation |
| 9 | The backend saves the coordinates with the incident and marks the source: GPS, GPS with address, or Manual when only a typed location was given. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Best GPS position with its accuracy, shown to the reporter |
| 2 | Location record saved with the incident, with its source |
| 3 | Clear message and options when GPS is unavailable or outside Bocaue |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Outdoors, start an SOS; check the accuracy shown and the location row in the database.
2. Deny location permission; a signed-in reporter can still continue.
3. As a guest, with GPS off, try to continue; it is blocked with the Bocaue message.
4. Use a mock location outside Bocaue; the warning appears.

**Do not claim:**
- Dragging the pin to correct the position. The reporter can type a location, not move the pin.
- Continuous location updates from the reporter after the report. Live tracking is the responder's position (MOD-13).
