# MOD-14 — Emergency Incident Record and Ticketing

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-14 |
| Version | 1.0 |
| Module Name | Emergency Incident Record and Ticketing |
| Module Cluster | Cluster D — Alert Processing and Dispatch |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Creates and owns the Incident record — the single ticket every other module (triage, dispatch, tracking, hospital coordination, closure, analytics) reads and writes against. A report is saved with a unique public reference, its reporter kept separate from its patient, an idempotency key so a retried submission never creates a second ticket, and a status/timeline that every later module appends to.

**Purpose**
Give every emergency one authoritative record from the moment it's reported, so dispatchers, responders and hospitals are always looking at the same ticket instead of re-describing the same call over the phone.

**Tasks Performed**
1. Creates the incident with a unique public reference (`INC-{year}-{sequence}`), accepting both signed-in and guest (no-account) reports.
2. Keeps the reporter record (name, phone, guest flag) and the patient record (unknown/is-reporter/named) as separate rows, never merged.
3. Rejects a duplicate submission by idempotency key (`client_event_id`), returning the original incident instead of creating a second one.
4. Saves the category, priority recommendation, hazard flags, intake answers and location together with the incident in one transaction.
5. Appends an `incident_events` row on creation and on every later status change, building the incident's timeline.
6. Lists incidents for the Operations Center (paginated, filterable by status) and for a citizen's own report history.
7. Accepts photo/video attachments (MOD-10) and links them to the incident record.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Caller's name, number and address, given verbally | Reporter identity (signed-in user) or guest reporter name/phone (optional) |
| 2 | Caller's spoken description of what's happening | Incident category and intake answers (MOD-09) |
| 3 | Blank logbook / incident form | Patient record: unknown, is-reporter, or named with age/sex |
| 4 | Operator's own estimate of urgency | GPS coordinates or typed location (MOD-11/MOD-12) |
| 5 |  | Client-generated idempotency key (MOD-19 offline-queue pattern) |
| 6 |  | Photo/video attachment (optional, added after the ticket is saved) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Telephone / MDRRMO hotline | `IncidentsController` / `IncidentsService` (`backend/src/incidents/`) |
| 2 | Paper logbook and incident forms | NestJS REST API (`POST/GET /api/v1/incidents`, auth optional on create) |
| 3 | Barangay resident records, kept separately | PostgreSQL/Prisma (`incidents`, `incident_reporters`, `incident_patients`, `incident_events`, `incident_locations`, `incident_details`) in one transaction |
| 4 |  | `DuplicateDetectionService` (MOD-26) and `PriorityService` (MOD-24), called inline during creation |
| 5 |  | `RealtimeService` (Socket.io) — best-effort `incident.created` push to the ops dashboard |
| 6 |  | `EmergencyContactNotificationService` (MOD-16) and `OpsAlertService` (MOD-17), fired after save |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A citizen calls the MDRRMO hotline or goes to the operations center or barangay hall. |
| 2 | The operator asks for the caller's name, number, address and what's happening, and writes it by hand in the logbook. |
| 3 | The operator assigns no formal ticket number; the entry's position in the logbook is its only reference. |
| 4 | Later updates (dispatch sent, unit arrived, case closed) are written as new logbook lines or on a separate whiteboard, not linked back to the original entry in any searchable way. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Handwritten logbook entry with no unique ticket ID |
| 2 | Disconnected follow-up notes for the same case |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A citizen or guest submits `POST /api/v1/incidents` from the mobile app (signed-in or guest) with category, intake answers, and location. | User Action |
| 2 | The backend validates that latitude/longitude are supplied together and lie inside Bocaue; a guest report without GPS is rejected (Rule 14 still holds — only the location requirement differs by account). | Validation |
| 3 | The backend checks `client_event_id` against existing incidents; a repeat of an already-saved key returns that same incident instead of creating a new one. | Validation |
| 4 | The backend resolves the category from the intake answers, runs duplicate detection (MOD-26, advisory-only) and the priority recommendation (MOD-24). | Processing |
| 5 | In one database transaction, the backend creates the incident, the reporter row (guest or signed-in), the patient row (if given), the location row (MOD-11/MOD-12) and intake details, and generates a unique `INC-{year}-{sequence}` reference, retrying on a reference collision. | Database |
| 6 | The backend appends the first `incident_events` row (`→ SUBMITTED`), opening the incident's timeline. | Database |
| 7 | The backend emits `incident.created` to the Operations Center over Socket.io (best-effort; the saved record stands even if this fails). | Notification |
| 8 | The backend fires emergency-contact SMS (MOD-16), the MDRRMO ops SMS and first SLA check (MOD-17/MOD-41), and barangay tagging (MOD-12) — all fire-and-forget; none can undo the saved incident. | Integration |
| 9 | The reporter (if signed in) can later attach one photo or video (MOD-10), which links to the same incident record. | User Action |
| 10 | Dispatchers list incidents through `GET /api/v1/incidents`, paginated and filterable by status; a citizen lists their own through `GET /api/v1/incidents/mine`. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Incident record with a unique public reference, saved in PostgreSQL |
| 2 | Separate reporter and patient records linked to the incident |
| 3 | Appended timeline event for every status change (MOD-15) |
| 4 | Real-time `incident.created` event to the Operations Center dashboard |
| 5 | Idempotent response (the existing incident) for a retried submission |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Submit two requests with the same idempotency key; confirm only one incident is created.
2. Submit as a guest without GPS coordinates; confirm it's rejected.
3. Submit an incident, then check `incident_events` has exactly one `SUBMITTED` row.
4. List incidents from the Operations Center queue and confirm pagination and status filtering work.

**Do not claim:**
- Free-text search across incidents. `GET /api/v1/incidents` filters by status and paginates; there is no text-search endpoint.
- A CAD/CRM integration. This is AGAP's own internal incident record.
