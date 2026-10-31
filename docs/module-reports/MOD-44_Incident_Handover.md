# MOD-44 — Incident Handover

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-44 |
| Version | 1.0 |
| Module Name | Incident Handover |
| Module Cluster | Cluster G — Status, Escalation, and Closure |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Lets an outgoing dispatcher or supervisor formally hand an active incident to an incoming one — with a situation summary, a pending-action list and an optional field-resource snapshot — and requires the incoming operator to acknowledge it before the handover is complete.

**Purpose**
Stop context from being lost at shift change. A verbal "here's what's going on" at the end of a shift doesn't survive into the next one; this gives it a record both operators can check.

**Tasks Performed**
1. Lists active Dispatchers and Supervisors (other than the caller) who can receive a handover.
2. Creates a handover record with a situation summary, pending actions and (optionally) a resources-in-field snapshot, rejecting a self-handover or an inactive/wrong-role recipient.
3. Broadcasts the handover over Socket.io so the incoming operator's screen updates live.
4. Lets the incoming operator acknowledge their pending handover, which timestamps and closes it.
5. Lists all handover records for an incident, newest first, in the Incident Command view.
6. Writes an audit entry for every handover created or acknowledged.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A verbal shift-change briefing, if one happens | The incoming operator (an active Dispatcher or Supervisor) |
| 2 | Sticky notes or a logbook entry, if anyone writes one | A situation summary (up to 2000 characters) |
| 3 | | An optional list of pending actions (up to 30 items) and a resources-in-field snapshot |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Verbal shift briefing | `backend/src/incidents/incident-handover` NestJS REST API |
| 2 | Paper notes or logbook | PostgreSQL `incident_handovers` table |
| 3 | | Socket.io broadcast to the incident room |
| 4 | | Operations Center Incident Command page, Handover panel (`frontend/app/(ops)/operations/command/page.tsx`) |
| 5 | | Immutable audit log (MOD-46) |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | At shift change, the outgoing operator briefs the incoming one verbally, if there's overlap. |
| 2 | Details are whatever the outgoing operator remembers to mention. |
| 3 | Nothing is written down, or at best a note is left that may or may not be read. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A verbal briefing with no durable record |
| 2 | Context that's lost if the two operators don't overlap |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | The outgoing operator opens Incident Command for the incident and starts a handover, picking an active Dispatcher or Supervisor other than themselves. | User Action |
| 2 | The operator writes a situation summary and, optionally, a list of pending actions and a resources-in-field note. | User Action |
| 3 | The backend verifies the recipient is an active Dispatcher or Supervisor and not the caller, then saves the handover record and writes an audit entry. | Validation |
| 4 | The handover is broadcast over Socket.io to the incident room, so the incoming operator sees it appear live. | Notification |
| 5 | The incoming operator reviews the summary and pending actions, then acknowledges the handover. | User Action |
| 6 | The backend timestamps the acknowledgement, writes an audit entry, and broadcasts the update. | Database |
| 7 | The Handover panel lists every handover for the incident, newest first, with its acknowledged/pending status. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | A persisted handover record (summary, pending actions, resources-in-field) in PostgreSQL |
| 2 | A live-updating Handover panel entry for the incoming operator |
| 3 | An acknowledged timestamp once the incoming operator confirms |
| 4 | Audit entries for the create and acknowledge actions |

---

## Owner notes (not part of the report)

**Test before signing:**
1. As one dispatcher, create a handover to a second active dispatcher with a summary and a couple of pending actions.
2. Sign in as the recipient, confirm the pending-handover banner and "Acknowledge handover" button appear, and acknowledge it.
3. Confirm the Handover panel shows both the original record and its acknowledged timestamp.

**Do not claim:**
- An external, legally auditable handoff outside AGAP, or an automatic transfer that doesn't require the incoming operator's acknowledgement — a handover is incomplete until they explicitly acknowledge it.
