# MOD-10 — Incident Photo and Evidence Capture

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-10 |
| Version | 1.0 |
| Module Name | Incident Photo and Evidence Capture |
| Module Cluster | Cluster C — Location and Tracking |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Lets the reporter add one live photo or a short video (up to 60 seconds) to the emergency report from the in-app camera. The file uploads after the report is saved, so it never delays the report. Dispatchers see the photo or video in the incident drawer with an advisory check of whether it looks like a live capture from the scene.

**Purpose**
Show dispatchers what the scene looks like (smoke, water level, vehicles) so they send the right help, while flagging images that may be old or taken elsewhere.

**Tasks Performed**
1. Opens the camera for a photo or a video of up to 60 seconds, with retake and skip.
2. Records the capture time and, when available, the GPS position at capture.
3. Uploads the file after the report is saved and tells the reporter if the upload failed.
4. Checks the file type and size, and that the uploader is the incident's reporter.
5. Scores how trustworthy the capture looks (time, place, live capture) and lists the reasons.
6. Shows the media and its check result to dispatchers and supervisors.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Photos sent separately by text or Messenger, if at all | Live photo (JPEG, PNG or WebP, up to 10 MB) or video (MP4, up to 25 MB, 60 s) |
| 2 | Caller's verbal description of the scene | Capture time and GPS position at capture |
| 3 | | Capture source ("live camera") |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Personal phone camera | AGAP Citizen mobile app (Expo Camera) |
| 2 | Text messaging / Facebook Messenger | NestJS REST API (`POST /v1/incidents/:id/attachments`, multipart) |
| 3 | | S3-compatible object storage (local disk fallback in development) |
| 4 | | Advisory authenticity check (capture time, place and source) |
| 5 | | PostgreSQL (`incident_attachments`) |
| 6 | | Operations Center incident drawer (photo strip with check chip) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The operator asks the caller to describe the scene. |
| 2 | If needed, the operator asks the caller to send a photo by text or Messenger. |
| 3 | The photo arrives on a staff phone, separate from the logbook entry. |
| 4 | Staff cannot tell when or where the photo was taken. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Photos on a staff phone, not linked to the report |
| 2 | No way to tell if a photo is current |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | On the Details screen, the reporter taps "Add a photo or video" (the hint says "only if it's safe"). | User Action |
| 2 | The camera opens in photo or video mode. The reporter takes the photo or records up to 60 seconds, or taps Skip. Retake is available. | User Action |
| 3 | The app records the capture time and, if location is allowed, the last GPS position. | Processing |
| 4 | After the report is saved, the app uploads the file with its capture details. A report without an account is told that photos are only sent from signed-in accounts. | Integration |
| 5 | The backend checks that the uploader is the incident's reporter, the file type is allowed and the size is within limits. | Validation |
| 6 | The backend stores the file in object storage. | Integration |
| 7 | The backend scores the capture: was it live, taken near the report time and place, inside Bocaue. It saves the record with the score and the reasons. | Database |
| 8 | The dashboard is told a file was added; the drawer shows the media with a chip: Verified, Review or Suspect, and the reasons in plain words. | Notification |
| 9 | If the upload fails, the app tells the reporter the report was delivered but the photo was not. | Notification |
| 10 | If a photo is clearly not genuine or not relevant, the dispatcher or supervisor clicks Reject on it in the drawer and can add a note. The backend refuses a second rejection, saves who rejected it and when, writes an audit entry, and the chip changes to Rejected for every viewer. The incident itself is not changed. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Photo or video stored and linked to the incident |
| 2 | Authenticity score and reasons saved with the file |
| 3 | Media and check chip in the dispatcher's drawer |
| 4 | Upload result message to the reporter |
| 5 | Rejected-photo record (who, when, note) with an audit entry |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Signed in, send a report with a photo; open the drawer and check the photo and its chip.
2. Send one with a 10-second video; it plays in the drawer.
3. Skip the photo; the report still sends.
4. With object storage stopped, send a photo; the report saves and the app says the photo was not sent.

**Do not claim:**
- Photos from reports without an account (they are not uploaded).
- Choosing an existing photo from the gallery. Only live capture is offered.
- More than one photo per report from the app.
- The check proving a photo is real. It is advisory; the dispatcher decides.
- The AI photo review. It runs only when `OPENAI_API_KEY` is set (empty by default), and then only adds an advisory label. Add it to the TO-BE only if your group turns it on for the demo.

**Changed 2026-10-23:** only the incident's own reporter can upload (before, any signed-in account could attach a file to any incident).
