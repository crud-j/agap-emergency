# MOD-05 — Emergency Readiness and Permission Status

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-05 |
| Version | 1.0 |
| Module Name | Emergency Readiness and Permission Status |
| Module Cluster | Cluster A — User and Identity |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Checks whether a citizen's phone and account are ready to send an emergency alert. It shows a checklist (location, notifications, internet connection, camera, motion sensor, emergency contacts, verified phone number and medical profile), rates each item, and gives an overall status of Ready, Limited or Not Ready. Each item has a button to fix it.

**Purpose**
Find problems, such as location permission being off, before an emergency happens, so the citizen can fix them while there's time. The checklist never blocks an emergency report.

**Tasks Performed**
1. Reads the phone's permission and sensor status.
2. Evaluates each item as Essential, Recommended or Optional.
3. Combines the device items with account items (contacts, verified phone, medical consent and profile).
4. Saves the latest readiness report per device.
5. Shows the overall status and a fix action for each item.
6. Re-checks when the screen is opened or refreshed.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Resident's own judgment of whether their phone works | Location permission and whether location services are on |
| 2 | Phone signal and load at the time of the emergency | Notification permission |
| 3 | | Internet connection status |
| 4 | | Camera permission |
| 5 | | Motion sensor availability |
| 6 | | Device ID |
| 7 | | Account status: emergency contacts, phone verification, medical consent and profile |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Resident's personal mobile phone | AGAP Citizen mobile app (Expo, React Native, Expo Router) |
| 2 | Telephone / MDRRMO hotline (used only when the emergency happens) | Expo Location, Expo Notifications, Expo Camera, Expo Sensors (permission and sensor status) |
| 3 | | Network status check (online, limited, offline) |
| 4 | | NestJS REST API (`GET` and `PUT /api/v1/users/me/readiness`) with JWT sign-in check |
| 5 | | Readiness rules on the server, with the same rules in the app for use offline |
| 6 | | PostgreSQL (`device_readiness_reports` table) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | No readiness check takes place before an emergency. |
| 2 | When an emergency happens, the resident tries to call the hotline from their phone. |
| 3 | Problems such as no load, no signal or a dead battery are discovered only at that moment. |
| 4 | The resident looks for another phone or asks a neighbor to call. |
| 5 | Help is delayed until a working line is found. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Phone problems discovered only during the emergency |
| 2 | Delayed call for help while a working phone is found |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The signed-in citizen opens Profile, then Emergency Readiness. The check also runs again each time the screen comes back into view. | User Action |
| 2 | The app reads the location permission and whether location services are on, plus the notification and camera permissions, motion sensor availability and internet connection. | Processing |
| 3 | The app sends this device report with the device ID to the backend. | Integration |
| 4 | The backend combines the device report with the account status (contacts, verified phone, medical consent and profile) and rates each item Ready, Limited or Action Needed. | Processing |
| 5 | The backend works out the overall status. Not Ready if any Essential item (location, notifications, connection) needs action; Limited if any Recommended item (contacts, verified phone) isn't ready; otherwise Ready. Optional items (camera, motion sensor, medical profile) never lower it. | Validation |
| 6 | The backend saves the latest report for that device, replacing the previous one. | Database |
| 7 | The app shows the overall status and the checklist, with Essential items first. | Processing |
| 8 | Without internet, the app applies the same rules on the phone and shows the result so the citizen still sees what to fix. | Processing |
| 9 | The citizen taps an item's action: allow a permission, open phone settings, add a contact, open Profile, manage consent, or set up the medical profile. | User Action |
| 10 | After the fix, the citizen pulls to refresh, and the status is checked and saved again. A button to call the emergency hotline is always shown on the screen. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Overall readiness status (Ready, Limited or Not Ready) |
| 2 | Checklist with the status and reason for each item |
| 3 | Saved readiness report for the device in PostgreSQL |
| 4 | Fix actions that take the citizen to the right permission or screen |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Turn location permission off in phone settings; the status should show Not Ready.
2. Allow it again and refresh; the status should rise.
3. Delete all contacts; the status should show Limited.
4. Put the phone in airplane mode and open the screen; the offline result should appear.
5. Check that a row appears in `device_readiness_reports`.

**Do not claim:** battery or SMS-load checks. They aren't among the checks.
