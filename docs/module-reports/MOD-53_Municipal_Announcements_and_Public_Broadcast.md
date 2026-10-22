# MOD-53 — Municipal Announcements and Public Broadcast

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-53 |
| Version | 1.0 |
| Module Name | Municipal Announcements and Public Broadcast |
| Module Cluster | Cluster J — Municipal Broadcast |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Lets the authorized Announcements Publisher of the LGU / MDRRMO write official public notices in the web console using standard Bocaue templates, such as river level, rainfall, flood, evacuation, class suspension and road closure. The publisher can publish them right away or schedule them, and can cancel or archive them. Published notices reach residents in the AGAP app, by push notification, and by SMS to subscribers. It is a one-way broadcast, not an emergency dispatch channel.

**Purpose**
Get accurate, consistent official advisories to Bocaue residents quickly through several channels at once, especially during typhoons and floods, with a record of who issued what and when.

**Tasks Performed**
1. Composes notices from templates, saved as drafts.
2. Checks required details (issuing office, source, affected barangays) before release.
3. Publishes immediately, or schedules and releases automatically at the set time.
4. Sends push notifications and subscriber SMS, and updates the app live.
5. Cancels a released notice with a correction note, and archives old notices.
6. Lets residents read notices and subscribe to SMS alerts in the app.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Advisory text drafted by MDRRMO / LGU staff | Announcement template choice and its template fields |
| 2 | Source bulletins (PAGASA, river gauge reading, DepEd / LGU orders) | Title, body and short summary |
| 3 | Approval from the Mayor's Office or MDRRMO head | Category, severity, scope and affected barangays |
| 4 | List of barangay officials and contact numbers | Issuing office, source reference and contact information |
| 5 | | Effective start and end time; action required of residents |
| 6 | | Language (Filipino, English or both) and optional image with description |
| 7 | | Publish now, or a scheduled date and time |
| 8 | | Resident's phone number and barangay preference (SMS subscription) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Official LGU / MDRRMO Facebook page | AGAP Operations web console (Next.js, React, Tailwind CSS) with announcement templates |
| 2 | Text blasts from staff mobile phones | NestJS REST API (`/api/v1/announcements`) with JWT and role checks (Announcements Publisher) |
| 3 | Barangay public address systems, megaphones, roving announcements | PostgreSQL (`announcements`, `sms_subscribers`, audit log) and object storage for images |
| 4 | Printed notices posted at barangay halls | Scheduled job that runs every minute (automatic release) |
| 5 | Two-way radio to barangay officials | Redis + BullMQ queues |
| 6 | | Firebase Cloud Messaging (push notifications) |
| 7 | | Textbee SMS gateway (subscriber SMS, 160 characters max) |
| 8 | | Socket.io real-time event (`announcement.published`) and AGAP Citizen mobile app (Expo, React Native) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | MDRRMO / LGU staff receive a source bulletin (PAGASA advisory, river level reading, or a DepEd / LGU order). |
| 2 | Staff draft the advisory text by hand, with wording that varies from person to person. |
| 3 | The draft is brought or messaged to the Mayor's Office or MDRRMO head for approval. |
| 4 | Staff post the approved advisory on the official Facebook page. |
| 5 | Staff text barangay officials from their own phones, one by one or by group message. |
| 6 | Barangay officials relay the advisory by public address system, megaphone, roving announcement or printed posting. |
| 7 | Corrections are posted as new messages; earlier versions stay in circulation. |
| 8 | There is no central record of what was sent, to whom, and when. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Facebook page post of the advisory |
| 2 | Text messages to barangay officials |
| 3 | Barangay-level announcements (public address, megaphone, printed notices) |
| 4 | Scattered, unofficial copies and corrections with no central record |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The Announcements Publisher signs in to the web console, opens Compose, and picks a template (for example, Bocaue River water level or Evacuation order). | User Action |
| 2 | The publisher fills in the template fields, category, severity, scope, affected barangays, issuing office, source, effective time, language and an optional image. The console generates the title, body and summary. | User Action |
| 3 | The backend confirms the publisher's role, validates the fields (for example, a title of 3–500 characters, a summary of up to 400), and saves the notice as a Draft with an audit entry. | Database |
| 4 | Before publishing or scheduling, the backend checks for a title, body and issuing office, a source reference (for hazard categories or any severity above Informational) and affected barangays (for barangay-specific notices). It refuses if any are missing. | Validation |
| 5 | The publisher chooses Publish now, or Schedule with a future date and time (Scheduled status). A scheduled notice can be unscheduled while it waits. | User Action |
| 6 | On publish, the backend sets the status to Published, records who approved it and when, and writes an audit entry. A job that runs every minute releases scheduled notices when their time comes. | Database |
| 7 | The backend broadcasts `announcement.published` over Socket.io so that open screens update immediately. | Integration |
| 8 | The backend queues a push notification to registered phones (Firebase Cloud Messaging) with the title and summary. | Notification |
| 9 | The backend queues an SMS through Textbee to every active subscriber: "AGAP: title. summary", cut to 160 characters. The number sent is saved. Failed push or SMS never undoes the publish. | Notification |
| 10 | Residents see the notice in the app's Announcements list (filterable by category) and open the full notice. Anyone can subscribe to SMS alerts with a phone number and an optional barangay. | User Action |
| 11 | If a notice is wrong, the publisher cancels it with a correction note (5–1000 characters). The notice stays visible by link, marked cancelled with the reason. | Processing |
| 12 | The publisher archives released or cancelled notices. They move to History in the console and to the public archive in the app. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Published official notice saved in PostgreSQL, with status history and audit entries |
| 2 | Push notification on residents' phones |
| 3 | SMS advisory (160 characters max) sent to subscribers, with the count recorded |
| 4 | Notice shown in the app's Announcements list and in the public archive |
| 5 | Cancellation with a correction note, or an archived record, in the console's History |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Sign in as the Announcements Publisher.
2. Compose from the River level template and save it as a draft.
3. Try to publish it with the issuing office blank; it should be refused.
4. Publish it and confirm it shows up in the app, with a push if the phone has a token.
5. Schedule another notice 2 minutes ahead and confirm it releases by itself.
6. Cancel one with a note, then archive it.
7. Subscribe a number in the app. With Textbee loaded, confirm the SMS arrives.

**Do not claim:**
- **Unsubscribing.** The SMS says "Reply STOP to opt out", but nothing processes STOP replies, and the app has no unsubscribe button. The backend `POST /announcements/unsubscribe` exists without any screen.
- **SMS targeted by barangay.** Every active subscriber gets every SMS; the saved barangay preference isn't used yet.
- **A separate approver.** The publisher approves their own notice (role dashboards plan, Phase 7, not built).
- **Superseding a notice** (replacing it with a newer one). The backend `POST /:id/supersede` exists, but the console doesn't offer it.
