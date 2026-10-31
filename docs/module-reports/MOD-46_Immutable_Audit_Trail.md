# MOD-46 — Immutable Audit Trail

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-46 |
| Version | 1.0 |
| Module Name | Immutable Audit Trail |
| Module Cluster | Cluster H — Governance and Compliance |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Records who did what, to what, and when, across every other module — account unlocks, role changes, dispatch decisions, consent changes, risk-area edits, and more. Every other backend service calls into this one module to write its history; nothing else writes to the audit table directly.

**Purpose**
Give supervisors and system administrators a record they can trust when reviewing a decision after the fact, without that record being something a user (or a bug) can quietly edit or erase.

**Tasks Performed**
1. Appends one row per consequential action (`action`, `actor`, `actorRole`, `entityType`/`entityId`, `moduleId`, optional `incidentId`, before/after values, IP address, user agent, timestamp).
2. Writes inside the caller's own database transaction when the action must not be recorded unless the state change also commits.
3. Swallows its own write failures so a logging problem never blocks the operation it's recording.
4. Lets a Supervisor or System Administrator list, filter (by action, actor, entity, date range) and page through the log.
5. Shows the audit trail for one incident, or one entry by ID.
6. Attaches the acting (and, for account-level events, the affected) user's display name — never phone, email or other contact details — so entries are readable.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A supervisor's memory of who approved or did what | The action type (e.g. account unlock, role change, dispatch, config change) |
| 2 | Whatever a staff member happened to note in a logbook or chat thread | The actor's user ID and role |
| 3 | No single place to look up a past decision | The affected entity's type and ID, and the related incident ID where applicable |
| 4 | | Before and after values for the change (old/new) |
| 5 | | Request IP address and user agent, where available |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | A supervisor's memory, verbal confirmation, or informal notes | `backend/src/audit/audit.service.ts` — `log()` (fire-and-forget) and `logInTransaction()` (transactional) write paths |
| 2 | No searchable record at all | PostgreSQL `audit_log` table (insert-only; no update or delete path in the service) |
| 3 | | NestJS REST API (`/v1/audit`), restricted to Supervisor and System Administrator (incident-scoped reads also open to Dispatcher) |
| 4 | | Operations Center Audit page, `frontend/app/(ops)/audit` |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A consequential action (unlocking an account, changing a role, approving a dispatch) happens by phone call, radio, or in person. |
| 2 | Whoever acted may or may not note it somewhere — a logbook, a chat message, or nothing at all. |
| 3 | If a supervisor later needs to know who did something and when, they ask around or search through scattered notes. |
| 4 | There is no guarantee the record, if one exists, wasn't altered or lost. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | Scattered, inconsistent notes of past actions, or none at all |
| 2 | No reliable way to answer "who did this, and when" |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | Another backend module (administration, dispatch, consent, risk areas, and so on) completes a consequential action. | Processing |
| 2 | That module's service calls the audit service with the action, actor, entity, module ID, and before/after values. | Integration |
| 3 | For actions that must not be recorded unless the underlying change commits (e.g. an account unlock), the audit write runs inside the same database transaction; its failure rolls back the change too. | Database |
| 4 | For routine actions, the write runs outside the transaction and is wrapped so a logging failure is caught and logged, never blocking the action it describes. | Validation |
| 5 | The row is appended to `audit_log` with a server timestamp. There is no update or delete path exposed anywhere in the service. | Database |
| 6 | A Supervisor or System Administrator opens the Audit page, filters by action, actor, entity type/ID, or date range, and pages through results; a Dispatcher, Supervisor, or System Administrator can pull the trail for one incident. | User Action |
| 7 | The API attaches the acting user's (and, for account-level events, the affected user's) display name and role to each row for readability, without exposing phone number or email. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | An appended, timestamped `audit_log` row per consequential action |
| 2 | A filterable, paginated audit list for Supervisors and System Administrators |
| 3 | A per-incident audit trail for Dispatchers, Supervisors, and System Administrators |

---

## Owner notes (not part of the report)

**Test before signing:**
1. As an administrator, unlock a locked account and confirm an `ACCOUNT_UNLOCKED` row appears in Audit with the reason recorded.
2. Try to find an update or delete endpoint for an audit entry in the API — there isn't one.
3. Open Audit, filter by action and by date range, and confirm paging works.
4. Pull the audit trail for one incident and confirm it only shows that incident's entries.

**Do not claim:**
- Database-level tamper-proof (WORM) storage. The guarantee is that the application code has no update/delete path — not that the underlying table is physically immutable.
