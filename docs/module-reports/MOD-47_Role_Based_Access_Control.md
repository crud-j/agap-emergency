# MOD-47 — Role-Based Access Control

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-47 |
| Version | 1.0 |
| Module Name | Role-Based Access Control |
| Module Cluster | Cluster H — Governance and Compliance |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Decides what a signed-in user is allowed to do: which API routes their role can call, which organization's resources they can touch, and which specific record they own. It backs every protected endpoint in the system, not just an administration screen.

**Purpose**
Keep sensitive actions — dispatch authorization, account administration, medical data access, risk-area edits — restricted to the roles and organizations that should have them, enforced on the server, not only hidden in the UI.

**Tasks Performed**
1. Verifies the request carries a valid, unexpired JWT before any role check runs.
2. Checks the signed-in user's role against the roles an endpoint declares with `@Roles(...)`.
3. For registry writes, checks that the user holds an active membership in the organization they're trying to manage (System Administrator excepted).
4. Lists all defined permissions and the permissions granted to each role.
5. Lets a System Administrator grant or revoke a permission for a role.
6. Requires a fresh (recent) sign-in, on top of role and permission, before the most sensitive administration actions.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | A caller's claimed identity, taken on trust over the phone | The signed-in user's ID, role, and JWT from the request |
| 2 | An operator's own judgment of what someone "should" be allowed to do | The roles an endpoint requires (`@Roles(...)` metadata) |
| 3 | No record of who was allowed to do what, or when that changed | The organization ID being acted on, and the actor's active organization memberships |
| 4 | | A permission ID and target role (grant/revoke) |
| 5 | | Recency of the user's last authentication, for recent-auth-gated actions |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Phone-based identity verification and personal judgment | `JwtAuthGuard` (identity), `RolesGuard` + `@Roles()` decorator (role check), `RecentAuthGuard` (step-up auth) |
| 2 | No access list, no record of who can do what | `assertCanManageOrg()` (`backend/src/organizations/org-scope.ts`) — server-side own-organization check |
| 3 | | `backend/src/permissions` service and `permissions`/`role_permissions` PostgreSQL tables |
| 4 | | NestJS REST API (`/api/v1/permissions`), restricted to Org Administrator (read) and System Administrator (read/write) |
| 5 | | MOD-46 Immutable Audit Trail, recording permission grants/revokes and admin actions |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | A caller or staff member states who they are and what they want done, by phone or radio. |
| 2 | The operator decides, from memory or informal rules, whether to act on the request. |
| 3 | There is no system check of role, organization, or ownership — the decision rests entirely on the person answering. |
| 4 | Mistakes (acting for someone who shouldn't have been allowed to) are discovered, if at all, after the fact. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | An ad hoc, undocumented decision to allow or refuse a request |
| 2 | No record of who was authorized for what |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A client calls a protected API route with its access token. | User Action |
| 2 | `JwtAuthGuard` verifies the token is valid and not expired; an invalid or missing token is rejected before any role check. | Validation |
| 3 | `RolesGuard` reads the roles the route declares and compares them against the signed-in user's role; a mismatch is rejected. | Validation |
| 4 | For registry writes scoped to an organization, `assertCanManageOrg()` confirms the actor is a System Administrator or holds an active membership in that organization; otherwise the request is refused. | Validation |
| 5 | For the most sensitive administration actions (account unlock, temporary password, MFA reset, session revocation, config changes), `RecentAuthGuard` additionally requires the user to have authenticated recently. | Validation |
| 6 | A System Administrator lists permissions and the permissions granted to a role, and grants or revokes a permission for a role. | User Action |
| 7 | The permission change is persisted to `role_permissions` and written to the audit trail (MOD-46). | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | An allowed or refused API call, decided before the handler's own logic runs |
| 2 | An own-organization check result for registry writes |
| 3 | A persisted `role_permissions` grant or revoke, with an audit entry |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Call an administration endpoint with a Dispatcher token and confirm it's refused (403).
2. As an Org Administrator, try to manage a different organization's resource and confirm `assertCanManageOrg` refuses it.
3. As a System Administrator, grant a permission to a role, then revoke it, and check both actions appear in the Audit log.
4. Wait past the recent-auth window and try a `RecentAuthGuard`-protected action; confirm it asks for re-authentication.

**Do not claim:**
- Field-level data segregation within a single record, or independent compliance certification of the RBAC model — neither is implemented.
