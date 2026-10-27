# MOD-33 — Secure Incident Communication

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-33 |
| Version | 1.0 |
| Module Name | Secure Incident Communication |
| Module Cluster | Cluster F — Field Response and Coordination |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Gives the people actually involved in one incident — the reporter, the responders dispatched to it, and the Dispatcher/Supervisor handling it — a single incident-scoped chat thread, instead of coordinating by radio or personal phone calls that leave no record.

**Purpose**
Keep operational coordination tied to the incident record itself, so anyone reviewing the incident later can see what was said and when, while protecting the reporter's identity — messages are labeled by role only, never by name or phone number.

**Tasks Performed**
1. Confirms the requester is a participant of the specific incident — operational staff, the reporter, or a responder on an assigned dispatch — before allowing read or post access.
2. Lets Dispatchers and Supervisors always post; lets the reporter and assigned responder crew post as participants; lets the System Administrator read only.
3. Persists each message with sender, text, an optional attachment reference, and a timestamp.
4. Labels each message by role ("Reporter", "Dispatcher", "Supervisor", "Responder", "Hospital", "Coordinator") rather than by personal name.
5. Broadcasts new messages live to the incident's room over Socket.io.
6. Tracks per-user read state for each message.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A radio call or personal phone call/text between dispatcher and responder | The incident ID the message belongs to |
| 2 | Verbal details relayed from memory, with nothing written down | Message text, and an optional attachment reference |
| 3 | — | The authenticated sender's identity and role |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Two-way radio | NestJS REST API — `GET`/`POST /api/v1/communications/:incidentId`, `PATCH /api/v1/communications/:incidentId/messages/:messageId/read` (`backend/src/communications`) |
| 2 | Personal mobile phone calls or text messages | PostgreSQL (`incident_messages`, `message_reads` tables) |
| 3 | — | Participant check against the incident's reporter, dispatch and dispatch-crew records |
| 4 | — | Socket.io `message.created` broadcast to the incident's room |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A dispatcher or responder who needs to coordinate about an incident places a radio call or a personal phone call/text. |
| 2 | The message is heard only by whoever is directly reached; nothing is written down. |
| 3 | If anyone else needs the same information later, it has to be repeated again from memory. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A one-time verbal or text exchange with no record tied to the incident |
| 2 | No way to review later who said what, or when |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The participant opens the incident's chat (mobile or operations web) and the app requests the message list for that incident. | User Action |
| 2 | The backend confirms the requester is a participant — staff (Dispatcher/Supervisor post, System Administrator read-only), the reporter, or a responder on the incident's assigned dispatch crew — before returning or accepting messages. | Validation |
| 3 | The participant types a message, optionally referencing an attachment, and sends it. | User Action |
| 4 | The backend persists the message with sender, text, attachment reference and timestamp to `incident_messages`. | Database |
| 5 | The backend labels the sender by role only; the reporter's real name or phone number never crosses the wire. | Processing |
| 6 | The message is broadcast live to the incident's Socket.io room, so other participants see it without refreshing. | Notification |
| 7 | A participant marks a message read; the backend records a per-user read state in `message_reads`. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A persisted, timestamped incident message linked to the sender's role |
| 2 | A live broadcast to other participants in the incident's chat room |
| 3 | A per-user read-state record for each message |

---

## Owner notes (not part of the report)

**Do not claim:**
- Implementation boundary: messages are not end-to-end encrypted; delivery is transport-secured REST/WebSocket persistence and broadcast, not a guaranteed-delivery or key-managed messaging protocol.
