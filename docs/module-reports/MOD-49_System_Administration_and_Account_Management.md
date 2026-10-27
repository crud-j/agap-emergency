# MOD-49 — System Administration and Account Management

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-49 |
| Version | 1.0 |
| Module Name | System Administration and Account Management |
| Module Cluster | Cluster H — Governance and Compliance |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Gives a System Administrator a single screen to manage every account in AGAP — searching and filtering users, unlocking a locked-out account, issuing a one-time temporary password, resetting MFA, revoking sessions, changing a role, activating/deactivating or deleting an account — plus system configuration and a health check of the platform's core dependencies.

**Purpose**
Keep account recovery and platform configuration out of ad hoc database edits, with every sensitive action gated by a fresh sign-in and written to the audit trail.

**Tasks Performed**
1. Lists and filters users by role, status, organization, search term, or missing MFA.
2. Unlocks a locked account, issues a temporary password, resets MFA, or revokes all sessions for a user — each requiring a stated reason and a recent sign-in from the administrator.
3. Changes a user's role, or activates/deactivates an account, ending that user's sessions immediately so the change takes effect right away.
4. Deletes an account, but only if it has no audit history; an account that has ever acted is deactivated instead, never deleted.
5. Reads and updates system configuration values, masking sensitive values in the audit record of the change.
6. Reports system health — database, Redis, queues, and integrations — without exposing secrets.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A locked-out user's verbal request for help, by phone or in person | Filters: role, status, organization, search term, MFA status |
| 2 | An administrator's manual decision, with no recorded justification | Target user ID and a stated reason (minimum 10 characters) for unlock, temporary password, MFA reset, or session revocation |
| 3 | Direct, unaudited edits to a database or spreadsheet | New role for a role change; new status for activate/deactivate |
| 4 | | Configuration key and value |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Phone or in-person request, handled case by case | `backend/src/administration` — `AdministrationService`, `AdministrationController`, `SystemHealthService` |
| 2 | Direct database or spreadsheet edits with no audit trail | `RecentAuthGuard` / `RequireRecentAuth()` step-up authentication on sensitive actions |
| 3 | | `SessionRevocationService` and `TrustedDeviceService` (ending sessions and trusted devices on unlock/reset/deactivate) |
| 4 | | PostgreSQL (`user`, `account_lifecycle_events`, `system_configurations` tables) |
| 5 | | MOD-46 Immutable Audit Trail for every administrative action |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A user who is locked out, or needs a role or account change, contacts a staff member directly. |
| 2 | The staff member verifies the request as best they can and makes the change by hand — a database edit, a spreadsheet note, or simply telling the user what to do. |
| 3 | The reason for the change, if recorded at all, lives in an email or a verbal explanation. |
| 4 | There's no single place to see every account, its status, or its history. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | An unaudited account change, made directly against the data store |
| 2 | No searchable record of account status across the system |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A System Administrator opens the Administration screen and searches or filters the user list. | User Action |
| 2 | For a sensitive action (unlock, temporary password, MFA reset, session revocation, config change), the backend requires a recently-authenticated session; a stale session is asked to re-authenticate. | Validation |
| 3 | The administrator enters a reason of at least 10 characters; a shorter reason is rejected. | Validation |
| 4 | For unlock: the backend clears the failed-login count and lockout, logs an `ACCOUNT_UNLOCKED` lifecycle event, and writes the audit entry inside the same transaction. | Database |
| 5 | For temporary password: the backend generates a 14-character password, checks it against password policy, hashes it, revokes every existing session and trusted device, and returns the one-time password to the administrator. | Processing |
| 6 | For MFA reset: the backend deletes TOTP enrollment and backup codes, revokes trusted devices and sessions. | Database |
| 7 | For role change or deactivation: the backend updates the user record, logs the lifecycle event, and revokes every session so the next sign-in carries the new role or is refused; an administrator cannot change or deactivate their own account. | Validation |
| 8 | For deletion: the backend checks the account has no audit history; if it has acted before, deletion is refused with a message to deactivate instead, and the same refusal applies if operational records (incidents, dispatches, handovers) still reference the account. | Validation |
| 9 | The administrator reads non-sensitive configuration values and updates a key; the audit entry masks the value as `[sensitive]` for keys flagged sensitive. | Database |
| 10 | The administrator checks system health — database, Redis, job queues, and external integrations — without any secret being shown. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Updated account state (unlocked, new password issued, MFA reset, sessions revoked, role changed, activated/deactivated, or deleted) |
| 2 | An `account_lifecycle_events` row and an audit entry for every administrative action |
| 3 | Updated system configuration, with sensitive values masked in the audit record |
| 4 | A system health report (database, Redis, queues, integrations) |

---

## Owner notes (not part of the report)

**Test before signing:**
1. As a System Administrator, search the user list by role and by a partial name/email/phone.
2. Unlock a locked test account with a reason under 10 characters and confirm it's rejected; retry with a valid reason and confirm the audit entry.
3. Issue a temporary password and confirm the user's old sessions no longer work.
4. Try to delete an account that has audit history and confirm it's refused in favor of deactivation.
5. Try to deactivate your own administrator account and confirm it's refused.
6. Check the Health page shows database/Redis/queue status without any secret values.

**Do not claim:**
- Enterprise directory (LDAP/SSO/SCIM) integration or automated external account provisioning — not implemented.
