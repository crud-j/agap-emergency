# Plan: Role Dashboards and Separation of Duties

> **Status (2026-10-22):** Phases 1–7 built (signed-in walkthroughs pending). Phase 7's flag `ANNOUNCEMENT_APPROVAL_REQUIRED` is off by default. Phase 0 decisions use their defaults. Spec agreed: [AGAP_Role_Rules_and_Dashboard_Content.md](../AGAP_Role_Rules_and_Dashboard_Content.md), including its §0 navigation rules and page-name table. Sidebars reviewed against [dashboards-mockups/](../dashboards-mockups/) on 2026-10-22: the mockups are layout and style only; the spec decides content.
> **How to use:** build one phase at a time, in order. Each phase ends with a **Done when** checklist that must pass before the next phase starts. Phase 0 is decisions only.
> **Modules:** MOD-21 (ops dashboard), MOD-41 (escalation), MOD-46 (audit), MOD-47 (RBAC), MOD-49 (administration), MOD-50 (analytics), MOD-52 (surge), MOD-53 (announcements).

## Context

Every web-console role shares one sidebar ([Sidebar.tsx:47-108](../../frontend/components/layout/Sidebar.tsx#L47-L108)) with links shown or hidden by role. A review on 2026-10-22 found:

1. **Links that 403.** Some sidebar links open pages whose data endpoints refuse that role:
   - **System Administrator:** Dispatch (`GET /dispatch`), Command / ICS (`GET /incidents/:id/ics`), Multi-Agency (`GET /incidents/:id/agencies`) and Risk Map (`GET /risk-intelligence/*`) are all Dispatcher/Supervisor only.
   - **Org Administrator:** Registry and Fleet (`GET /resources`), Organizations (`GET /organizations`) and Analytics (`/analytics/*`) all refuse it, and the Admin and Audit pages block it outright.
2. **A misleading "All clear".** [dashboard/page.tsx:47-53](../../frontend/app/(ops)/dashboard/page.tsx#L47-L53) disables its incident queries for roles outside Dispatcher, Supervisor and System Administrator. With TanStack Query v5 a disabled query is not "loading", so the LGU and Org Admin accounts see **0 active incidents** and **"All clear — no emergency incidents have been reported in Bocaue."**
3. **No separation of duties.** The System Administrator can:
   - change incident status (`PATCH /incidents/:id/status`, [incidents.controller.ts:126](../../backend/src/incidents/incidents.controller.ts#L126));
   - cancel incidents and mark false alerts ([false-alerts.controller.ts:43-50, 78-84](../../backend/src/false-alerts/false-alerts.controller.ts));
   - acknowledge and resolve escalations ([escalations.controller.ts:25-53](../../backend/src/escalations/escalations.controller.ts));
   - activate and deactivate surge mode, and send the disaster broadcast ([disaster-mode.controller.ts:35-91](../../backend/src/disaster-mode/disaster-mode.controller.ts)).
4. **Role mismatch.** The earlier proposal named roles that don't exist (Mayor, Incident Commander). This is now resolved in the spec:
   - the LGU Information Officer (`ANNOUNCEMENTS_PUBLISHER`) posts on the Mayor's behalf;
   - Incident Commander is an ICS position held by a Supervisor, not a separate role.

**Intended outcome:** each role opens on a dashboard made for its job, sees no page it can't use, and has only the authority the spec gives it. Emergency flows (SOS, dispatch, responder, citizen status) behave exactly as today.

### What the review confirmed about the current system

| Area | Finding | Consequence for this plan |
|---|---|---|
| `RolesGuard` | No role bypass. Allowed = role listed in `@Roles(...)` ([roles.guard.ts](../../backend/src/common/guards/roles.guard.ts)) | Removing a role from `@Roles` is a complete, local change |
| `role_permissions` table | Edited by the Roles & Permissions tab, but **no guard reads it** (only `permissions.service.ts` touches it) | Don't build on it. Note it in the UI as "reference only" (Phase 5) |
| `Announcement` model | Already has `approved_by_id`, `approved_at`. Today `publish()`/`schedule()` set them to the publisher ([announcements.service.ts:274-399](../../backend/src/announcements/announcements.service.ts#L274-L399)) | Approval reuses these columns; Phase 7 adds only one enum value and three columns |
| `announcements.update()` | Only allowed in `DRAFT` (service line 226) | A pending announcement is automatically locked against edits |
| Public announcement endpoints | `findPublished` filters `status: PUBLISHED`; archive lists only `ARCHIVED/CANCELLED/SUPERSEDED` | A new `PENDING_APPROVAL` status never reaches the mobile app or the public |
| `audit_action` enum | Already has `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `ACCOUNT_UNLOCKED`, `PASSWORD_CHANGE`, `MFA_CHANGE`, `SESSION_REVOKED`, `PERMISSION_DENIED` | Security events need no schema change |
| `GET /audit` | Filters by **one** `action` ([audit.controller.ts:23-44](../../backend/src/audit/audit.controller.ts#L23-L44)) | Phase 5 accepts a comma-separated list (additive) |
| `GET /administration/health` | Returns `database` and a hard-coded `redis: 'unknown'` ([administration.service.ts:285-293](../../backend/src/administration/administration.service.ts#L285-L293)) | Phase 5 makes Redis real and adds queues and integrations |
| `GET /analytics/volume` | All-time counts; no priority or barangay | Phase 2 adds a purpose-built, count-only endpoint instead |
| `dispatches.dispatcher_id`, `incident_events.triggered_by_id`, `incident_handovers.acknowledged_at`, `location_history.recorded_at`, `escalations.status` | All exist | Supervisor oversight (Phase 3) needs no schema change |
| `incident-participant.service.ts` `INCIDENT_STAFF_ROLES` | Includes `SYSTEM_ADMINISTRATOR`, `ORG_ADMINISTRATOR`; used by WebSocket room joins and tracking; covered by `test/realtime/incident-participant.spec.ts` | Read visibility. Left alone unless decision D1 says otherwise |
| `communications.service.ts` `DISPATCHER_ROLES` | Sys Admin and Org Admin may read **and post** in incident chat | Phase 5 removes them from posting |
| `escalation.processor.ts` | `RESPONSE` escalations notify `SUPERVISOR` and `SYSTEM_ADMINISTRATOR` | Phase 5 changes the recipients (decision D5) |
| Seed | Seeds **one account per web role**, including `orgadmin@mdrrmo.bocaue.gov.ph` (Elena Villanueva) | `USER_ACCOUNTS.md` wrongly says no Org Admin is seeded (Phase 1 fixes the doc) |
| `shared/src/enums/announcement-status.enum.ts` | Stale (`REVIEW`, `APPROVED`, `EXPIRED`), imported nowhere; the frontend has its own type in `features/announcements/api.ts` | Phase 7 aligns it with the database |
| `landingForRole` | Defined twice: [post-login.ts:24](../../frontend/lib/post-login.ts#L24) and a private copy in [change-password/page.tsx:32](../../frontend/app/login/change-password/page.tsx#L32) | Phase 1 removes the copy |
| Mobile app | Calls none of the endpoints this plan changes. Uses responder, incident (citizen), alert and public announcement endpoints only. Its announcement type is `'PUBLISHED' \| 'CANCELLED' \| 'ARCHIVED' \| 'SUPERSEDED'` | **No mobile change in any phase** |

### Design guardrails (apply to every phase)

- **Never weaken an emergency path.** No change to SOS, alert intake, dispatch, responder or citizen endpoints, except removing the System Administrator and Org Administrator from operational ones (Phase 5).
- **Barangay alert automation is out of bounds.** No phase changes `backend/src/barangay-coordination/`, the automatic alert SMS with its code, the SMS-reply poller, or the public `/b` page (`frontend/app/b/`, outside the `(ops)` layout). The Phase 1 route guard applies to the `(ops)` console only, so it must never wrap `/b`. The only barangay change is the Directory moving from a tab to `/administration/barangays`, plus Org Administrator access in Phase 6. The mockup's "Send SMS" and "Broadcast" buttons were dropped because they would be free-form texting from the Dispatcher dashboard, which has no backend; they have nothing to do with the barangay alert.
- **Dispatcher and Supervisor permissions never shrink.** Every Dispatcher and Supervisor `@Roles` entry stays as it is.
- **Additive first.** Phases 1–4 and 6 only add endpoints, add roles to read endpoints, or change the frontend. The only removals are in Phase 5b, and the only migration is in Phase 7.
- **Count-only for the LGU.** No endpoint used by `ANNOUNCEMENTS_PUBLISHER` returns names, phone numbers, addresses, coordinates or medical data.
- **Migrations:** write the SQL by hand under `backend/prisma/migrations/`, then `pnpm prisma migrate deploy` and `pnpm prisma generate`. Do **not** use `migrate dev` (the dev database has drift it would try to reset).
- **Tests:** backend Jest runs with `--config ./test/jest.config.ts`. The baseline is 36 suites, 564 tests, all passing.
- **No real phone numbers** in code, tests or docs. Use `+63917000000x` placeholders.

### Phase overview

| Phase | What | Backend | Schema | Frontend | Mobile |
|---|---|---|---|---|---|
| 0 | Decisions | — | — | — | — |
| 1 | Role navigation, landing pages, dashboard fix, docs | none | none | yes | none |
| 2 | Municipal overview for the LGU account | 1 new read endpoint | none | yes | none |
| 3 | Supervisor oversight | 1 new read-only module | none | yes | none |
| 4 | Dispatcher additions | none | none | yes | none |
| 5a | System Admin: health, integrations, security events | additive | none | yes | none |
| 5b | System Admin: remove operational powers | role removals | none | yes | none |
| 6 | Org Administrator access | roles added to 4 read endpoints | none | yes | none |
| 7 | Approval for CRITICAL advisories (behind a flag) | new endpoints | 1 enum value, 3 columns | yes | none |

---

## Phase 0: Decisions (no code)

Each decision has a default; build with the default unless MDRRMO says otherwise.

| # | Decision | Default |
|---|---|---|
| D1 | Does the System Administrator keep **read-only** incident visibility (`GET /incidents`, WebSocket ops room, incident chat reading)? | **Yes, read-only, but no sidebar links to operational pages.** Keeps `INCIDENT_STAFF_ROLES` and its test unchanged |
| D2 | Who approves CRITICAL advisories? | **MDRRMO Supervisor** (`SUPERVISOR`) |
| D3 | Which announcements need approval? | **Severity `CRITICAL`**, any category |
| D4 | May the System Administrator still publish announcements? | **Yes** (platform support), but CRITICAL ones go through approval like everyone else |
| D5 | `RESPONSE` escalation recipients once the Sys Admin can't act on escalations | **Supervisors; if no `ACTIVE` supervisor exists, Dispatchers** |
| D6 | May the Org Administrator read **all** organizations' units, or only its own? | **Read all, edit own.** Unit and fleet data is not personal; editing is already own-org only ([resources/page.tsx:392](../../frontend/app/(ops)/resources/page.tsx#L392)) |
| D7 | Display name of the LGU account | **"LGU Information Officer — Office of the Mayor"** |

**Done when**
- [ ] D1–D7 are recorded in this section, with the date and who decided.

---

## Phase 1: Role navigation, landing pages, dashboard fix (frontend only)

**Goal:** every role sees only links it can use, opens on the right page, and never sees fake zeros.

### 1.1 One role-access map
Create `frontend/lib/role-access.ts` as the single source for navigation per role:

```ts
export interface RoleAccess {
  landing: string;            // first page after sign-in
  allowedPrefixes: string[];  // routes this role may open ('/account' always included)
}
export const ROLE_ACCESS: Record<string, RoleAccess>;
export function landingForRole(role?: string): string;
export function canOpen(role: string | undefined, pathname: string): boolean;
```

- Each `NavItem.roles` in `Sidebar.tsx` must agree with `allowedPrefixes`. Add a unit check that every nav item's `href` passes `canOpen` for each role listed on it.
- `lib/post-login.ts` re-exports `landingForRole` from `role-access.ts`.
- Delete the private copy in `app/login/change-password/page.tsx:32-46` and import the shared one.

### 1.2 Sidebar per role
Labels and routes follow the spec's §0 page-name table. Group headings follow the spec. Links to pages built in later phases are added in those phases (column 3).

| Role | Links in Phase 1 | Added later | Landing |
|---|---|---|---|
| Dispatcher | Dashboard · Incident Queue · Live Map · Triage · Dispatch · Fleet & Units · Hospitals & Facilities · Multi-Agency | Incident History (P4) | `/operations/dispatch` (unchanged) |
| Supervisor | Dashboard · Incident Queue · Live Map · Triage · Dispatch · Escalations · Activity Log · Command / ICS · Multi-Agency · Surge Mode · Fleet & Units · Hospitals & Facilities · Analytics · Risk Map | Incident History (P4), Approvals (P7) | `/operations/dispatch`; `/dashboard` from P3 |
| LGU Info Officer | Dashboard · Announcements | Publication History (P2) | `/announcements`; `/dashboard` from P2 |
| System Administrator | Dashboard · Users & Accounts · Roles & Permissions · Organizations · Fleet & Units · Hospitals & Facilities · Barangay Directory · Configuration · Audit Log | Integrations, Security Events (P5a) | `/dashboard` |
| Org Administrator | Dashboard | Organizations · Fleet & Units · Requests · Barangay Directory (P6) | `/dashboard` |
| Hospital User | Hospitals & Facilities | — | `/hospitals` (unchanged) |

- **No Profile link** for any role. It's in the user menu, and Account security is already in the top bar (`/account/security`).
- **System Administrator:**
  - **Loses** Incident Queue, Live Map, Triage, Dispatch, Escalations, Command / ICS, Multi-Agency, Surge Mode, Risk Map, Analytics and Announcements. Its backend powers stay until Phase 5b; this phase only stops it from landing on pages that 403 or that it shouldn't use.
  - **Fleet & Units** for this role is the registry tab only. The status buttons need `DISPATCHER`/`SUPERVISOR` on the backend anyway.
- **Hospital User:** unchanged. `AuthGate`'s `HOSPITAL_ALLOWED` becomes `ROLE_ACCESS.HOSPITAL_USER.allowedPrefixes`.

### 1.2a Merge Registry into Fleet & Units
`/resources` (the registry) becomes a **Registry** tab on `/operations/fleet`. Its content moves unchanged into `components/resources/RegistryTab.tsx`, and `/resources` redirects to `/operations/fleet?tab=registry`. No backend change: both use `GET /resources`.

### 1.2b Administration tabs become routes
The tabs in [administration/page.tsx:711-717](../../frontend/app/(ops)/administration/page.tsx#L711-L717) become routes, so the sidebar is the only navigation:
- `/administration/users`, `/administration/permissions`, `/administration/barangays`, `/administration/config`;
- later `/administration/integrations` and `/administration/security` (Phase 5a).

Each route renders the existing tab component (`UsersTab`, `PermissionsTab`, `BarangayDirectoryTab`, `ConfigTab`). Move them out of `page.tsx` into `components/admin/`. `/administration` redirects to `/dashboard`. The System Health tab content moves to the System Administrator's Dashboard (1.4).

### 1.3 Route guard for every role
Generalise the Hospital redirect in [AuthGate.tsx:53-57](../../frontend/components/layout/AuthGate.tsx#L53-L57): if `!canOpen(user.role, pathname)`, show a **"Not available for your role"** panel with a link to `landingForRole(role)`. Show the panel rather than redirecting silently, so a bookmarked link explains itself. Keep the existing Hospital behaviour (redirect to `/hospitals`).

### 1.4 Dashboard: never show fake data
In [dashboard/page.tsx](../../frontend/app/(ops)/dashboard/page.tsx):
- `/dashboard` becomes a switch on role. Each role's content is its own component in `components/dashboard/`:

  | Role | Component | Filled in |
  |---|---|---|
  | Dispatcher | `DispatcherDashboard` (today's content, moved) | P1; P4 adds counts |
  | Supervisor | `SupervisorDashboard` (today's content for now) | P3 |
  | LGU Info Officer | `MunicipalOverview` (placeholder: "Municipal overview arrives in Phase 2" + link to Announcements) | P2 |
  | System Administrator | `AdminDashboard`: the existing health panel, user/unit/facility counts, recent users | P1; P5a adds queues |
  | Org Administrator | `OrgDashboard` (placeholder) | P6 |

- **No fake data.** A role whose queries are disabled never renders the KPI grid or Recent Incidents, so "0" and "All clear" can't appear.
- The surge banner and the critical-announcement banner stay for every role; `GET /announcements` is public.

### 1.5 Documentation fixes
In [USER_ACCOUNTS.md](../USER_ACCOUNTS.md):
- Line 42: "Dgaispatcher" → "Dispatcher".
- Line 63: replace "Cannot close? (…)" with "Can close once the resolution is recorded."
- Org Administrator: move it from "Roles with no seeded account" to the account table (`orgadmin@mdrrmo.bocaue.gov.ph`, Elena Villanueva, MDRRMO Bocaue, Web). Check its phone number against the seed.
- Announcements Publisher: name it "LGU Information Officer — Office of the Mayor"; one-way broadcast; links to the spec.

**Files:**
- **New:** `frontend/lib/role-access.ts`, `frontend/components/dashboard/*`, `frontend/components/resources/RegistryTab.tsx`, `frontend/components/admin/*Tab.tsx` (moved), `frontend/app/(ops)/administration/<section>/page.tsx`.
- **Changed:** `frontend/lib/post-login.ts`, `frontend/app/login/change-password/page.tsx`, `frontend/components/layout/Sidebar.tsx`, `frontend/components/layout/AuthGate.tsx`, `frontend/app/(ops)/dashboard/page.tsx`, `frontend/app/(ops)/operations/fleet/page.tsx`, `frontend/app/(ops)/resources/page.tsx` (redirect), `frontend/app/(ops)/administration/page.tsx` (redirect), `docs/USER_ACCOUNTS.md`.

**Done when**
- [x] `pnpm --filter @agap/frontend typecheck` is clean.
- [ ] Signed in as each of the six web accounts, every sidebar link loads with no 403 in the browser network tab.
- [ ] The LGU and Org Admin dashboards show no "0" counts and no "All clear".
- [ ] Opening `/operations/dispatch` as the System Administrator shows "Not available for your role".
- [x] Old links still work: `/resources` and `/administration` redirect.
- [x] Every sidebar label matches the spec's §0 table, and no role has a Profile link.
- [x] The backend test suite is untouched (no backend files changed).

### Phase 1 status: BUILT, signed-in walkthrough pending (2026-10-22)

**Built**
- `frontend/lib/role-access.ts` holds the route rules (`canOpen`, longest-prefix match, closed by default), the landing pages and the sidebar groups (`NAV_GROUPS`, `navForRole`). `Sidebar.tsx` only maps routes to icons.
- `landingForRole` exists once; `post-login.ts` re-exports it. `change-password/page.tsx` now imports both `landingForRole` and `safeNextPath` (it had private copies of each).
- `components/layout/RouteGuard.tsx` (inside the `(ops)` layout, so the sidebar stays) shows "Not available for your role". `AuthGate` keeps redirecting Hospital users to `/hospitals`, now via `canOpen`. `/b` is outside `(ops)` and untouched.
- `/dashboard` switches on role:
  - Dispatcher and Supervisor: `OpsDashboard` (the previous page, moved);
  - System Administrator: `AdminDashboard` (health, staff/unit/facility counts, newest accounts);
  - LGU and Org Admin: `RolePlaceholderDashboard`, with no counts.

  The surge and critical-advisory banners are in `DashboardBanners`. Surge is shown to Dispatcher and Supervisor only, since its link opens the Surge page.
- **Fleet & Units:** tabs `Units & Personnel` / `Registry` (`?tab=registry`). The System Administrator sees Registry only. The old `/resources` page moved to `components/resources/RegistryTab.tsx` and now redirects.
- **Administration routes:** `/administration/users`, `/permissions`, `/barangays`, `/config`. `/administration` redirects to `/dashboard`.
- **USER_ACCOUNTS.md:** typo fixed, closure wording fixed, the seeded Org Administrator added, the LGU account named as the Office of the Mayor's officer.

**Deviations from the text above**
- **Tab components:** they live in one file, `components/admin/AdminSections.tsx` (`UsersTab`, `PermissionsTab`, `HealthTab`, `ConfigTab`, plus the `AdminPage` frame), not one file each. They share helpers and dialogs, so splitting them would only add imports.
- **Sidebar grouping:** links are grouped (Operations, Oversight, Command, Resources, Intelligence, Broadcast, Administration), so a Dispatcher sees Multi-Agency before Fleet & Units. The spec lists the same links in a slightly different order.
- **Sys Admin's banners:** the System Administrator's dashboard shows the critical-advisory banner but not the surge banner.

**Verified**
- **Frontend type check** is clean.
- **Frontend tests:** `pnpm test` passes 4 suites, 58 tests, including the new `__tests__/role-access.spec.ts`. That spec checks that every sidebar link opens for its roles, every landing page opens, there's no Profile link, the Sys Admin has no operational page, path segments match whole, and each role's sidebar equals the spec.
- **Dev server:** compiled and served every changed route with HTTP 200, and `/resources` and `/administration` carry their redirects.
- **No backend files changed.**

**Fixed during the walkthrough**
- **Admin dashboard crash** ("Cannot read properties of undefined (reading 'total')"): `GET /resources` returns a plain array, but `fetchResources` was typed as `{ data, meta }`.
  - `features/resources/api.ts` now wraps the array in that shape.
  - **This also fixes Fleet & Units and the Registry,** which read `data.data` and so had been listing no units since before Phase 1.

**Pending**
- **Signed-in walkthrough** with each of the six web accounts. Not done here: it needs passwords, and possibly MFA.
- **Lint:** `pnpm lint` fails before linting anything (`next lint` passes options the installed ESLint no longer accepts). This existed before Phase 1 and needs its own fix.

---

## Phase 2: Municipal overview for the LGU account

**Goal:** the Office of the Mayor sees counts, never details.

### 2.1 Backend: `GET /v1/analytics/municipal-overview`
In `backend/src/analytics/analytics.controller.ts` and `analytics.service.ts`:
- `@Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.DISPATCHER, UserRole.SUPERVISOR)`.
- Response, counts only:

```ts
{
  generatedAt: string;                                   // ISO
  active: number;                                        // incidents in an active status
  activeByCategory: { category: string; count: number }[];
  activeByPriority: { priority: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'; count: number }[];
  activeByBarangay: { barangay: string; count: number }[]; // null barangay → 'Unassigned'
  today: { total: number; critical: number; resolved: number }; // submitted_at / resolved_at since local midnight
  yesterday: { total: number; critical: number };        // for the "vs. yesterday" deltas on the cards
  units: { available: number; deployed: number; unavailable: number };
  trend7d: { date: string; total: number; critical: number }[]; // 7 local days, oldest first, zero-filled
  performance7d: {                                       // averages in seconds over incidents submitted in the last 7 days
    acknowledgeSec: number | null;                       // acknowledged_at − submitted_at
    dispatchSec: number | null;                          // dispatched_at − submitted_at
    arrivalSec: number | null;                           // on_scene_at − dispatched_at
    resolvedShare: number | null;                        // resolved or closed ÷ total, 0–1
  };
}
```

- **Performance** uses the timestamp columns on `incidents` (`submitted_at`, `acknowledged_at`, `dispatched_at`, `on_scene_at`, `resolved_at`, `closed_at`). It's computed in SQL (`AVG(EXTRACT(EPOCH FROM …))`) and ignores rows where either timestamp is null. Return `null` when there are no rows, never `0`.
  - **Do not use `incident_metrics`.** Nothing writes to that table (no service, seed or database trigger), so `getResponseTimes()` and `getSlaCompliance()` always return empty results today. See [Known gap: `incident_metrics` is never filled](#known-gap-incident_metrics-is-never-filled).
  - Put the performance query in `analytics.service.ts` as `getPerformanceFromIncidents(since)`, so Phase 3 can reuse it for the Supervisor dashboard.
- **Trend** uses one `GROUP BY` on the local date of `submitted_at` (Asia/Manila), zero-filled in code.

- **Active statuses:** the same list as the frontend `ACTIVE_STATUSES` ([incident-format.ts:15-26](../../frontend/lib/incident-format.ts#L15-L26)). Move the list into `shared/src/constants/` and import it on both sides, so the two can't drift.
- **Units** come from `resources` with `is_active = true`:
  - `available` = `AVAILABLE`;
  - `deployed` = `DISPATCHED`, `EN_ROUTE`, `ON_SCENE`, `TRANSPORTING`, `RETURNING`, `RESERVED`;
  - `unavailable` = `OUT_OF_SERVICE`, `OFFLINE`.
- **Barangay** comes from `incident_locations.barangay`, already filled by barangay tagging.
- Use `groupBy` only. Never `select` a row.
- **"Local midnight"** means Asia/Manila. Compute it explicitly; don't rely on the server's time zone. The existing `getDailySummary` uses `setHours(0)`, which depends on the server — don't copy that.

### 2.2 Backend: publication history with names
`GET /announcements/publisher/all` returns `publisher_id` and `approved_by_id` only. Add `publisherName` and `approverName` (`full_name` through the existing relations) to its response. This is an additive field.

### 2.3 Frontend
- **`features/analytics/`:** add a `useMunicipalOverview()` hook that refetches every 60 s and on the `incident.created` and `incident.status_changed` WebSocket events.
- **`components/dashboard/MunicipalOverview.tsx`** replaces the Phase 1 placeholder. It follows the spec's §2 content:
  - header "Office of the Mayor — Municipal Overview";
  - stat cards (active, critical, units deployed of available, announcements published today) with "vs. yesterday";
  - active incidents by barangay as a ranked list. A shaded barangay map can come later; the frontend has only the municipal outline (`/assets/geojson/bocaue.geojson`), and the barangay polygons used for barangay tagging live in the backend, so that would need a small endpoint to serve them;
  - a category breakdown;
  - the 7-day trend;
  - response performance;
  - latest announcements;
  - a "Last updated" time and a stale warning after 3 minutes without a successful fetch (shared rule 5).
- **Mockup elements that are dropped:** the incident map with individual markers and unit positions, the Recent Incidents table (addresses), and weather (no source). Quick actions are limited to Create Announcement and View Publication History.
- **`app/(ops)/announcements/history/page.tsx`:** published, archived and superseded announcements, with author, approver, publication time, correction note and SMS/push counts.
- **Announcements page:** add the **Advisories** filter (severity `WARNING` or `CRITICAL`). Advisories are not a separate page.
- **Sidebar for the LGU account:** Dashboard · Announcements · Publication History.
- **Landing for `ANNOUNCEMENTS_PUBLISHER`:** `/dashboard`.
- **Display name (D7):** update the seed's `full_name` for the publisher. Because the seed uses `upsert … update: {}`, existing databases keep the old name; change it once through Administration → Users.

### 2.4 Tests
`backend/test/analytics/municipal-overview.spec.ts`:
- The role metadata is exactly the three roles above. Read it with `Reflect.getMetadata(ROLES_KEY, AnalyticsController.prototype.municipalOverview)`.
- With a mocked Prisma, the response contains no key other than the documented ones. This is a regression guard against someone adding a `select` later.
- A null barangay counts as `Unassigned`.
- The trend has exactly 7 entries, with days that had no incidents zero-filled; a day boundary is Manila midnight, not UTC.
- Performance values are `null` with no data.

**Done when**
- [ ] Backend: typecheck clean, full suite green (564 + new).
- [ ] The LGU account sees live counts that match the Dispatcher's queue for the same moment.
- [ ] The network tab for the LGU account shows no incident list, reporter or location payloads.
- [ ] Creating a test SOS updates the overview within 60 s.

### Phase 2 status: BUILT, signed-in walkthrough pending (2026-10-22)

**Built**
- **Shared:** `ACTIVE_INCIDENT_STATUSES` in `shared/src/enums/incident-status.enum.ts`, next to `ACTIVE_RESPONSE_INCIDENT_STATUSES`. The frontend's `ACTIVE_STATUSES` (`lib/incident-format.ts`) now spreads it. The private copies in `operations/command/page.tsx` and `operations/multi-agency/page.tsx` were left alone (same values).
- **Backend `GET /v1/analytics/municipal-overview`** (`analytics.controller.ts`, `analytics.service.ts`): roles exactly `ANNOUNCEMENTS_PUBLISHER`, `DISPATCHER`, `SUPERVISOR`. Uses `groupBy`/`count` plus two aggregate-only raw queries (trend, performance); no row is ever selected. `getPerformanceFromIncidents(since)` is public for Phase 3. `manilaMidnight()`/`manilaDateKey()` use a fixed UTC+8 offset (Manila has no DST), independent of the server zone.
- **Backend `GET /announcements/publisher/all`:** each row gains `publisherName` and `approverName`. `status` and the new `severity` query parameter accept a comma-separated list (single values work as before).
- **Frontend:** `components/dashboard/MunicipalOverview.tsx` replaces the LGU placeholder. `useMunicipalOverview()` polls every 60 s; `SocketProvider` also invalidates it on `incident.created` and `incident.status_changed`. New `/announcements/history` (Publication History). Announcements page has an **Advisories** tab (`severity=WARNING,CRITICAL`).
- **Navigation:** LGU sidebar is Dashboard · Announcements · Publication History; LGU lands on `/dashboard`; `/announcements/history` opens for the LGU account and the System Administrator (the endpoint's roles). The sidebar now highlights the most specific matching link, so History doesn't also light up Announcements.
- **Seed (D7):** the publisher's `full_name` is "LGU Information Officer — Office of the Mayor" for new databases.

**Deviations from the text above**
- **`today.critical`** was added to the response, for the critical card's "vs. yesterday".
- **Stat cards follow the spec (§2), not the plan's list:** active, critical (active), incidents today, units deployed of in-service. "Announcements published today" was dropped in favour of the spec's "incidents today"; latest announcements are a panel instead.
- **"vs. yesterday" is shown only where it's honest:** incidents today and critical reported today. Active and unit counts are live snapshots; there's no stored history to compare against, so those cards show "resolved today" and the available/out-of-service split instead.
- **Totals exclude `DRAFT` and `DUPLICATE`** (trend, today/yesterday, performance): a draft was never sent and a duplicate is merged into another incident.
- **Publication History also lists `CANCELLED`:** a cancelled announcement was public and carries the correction note, which the spec lists ("corrections").
- **LGU live updates come from polling only.** The LGU account is not staff, so it never joins `ops:all` and receives no incident events (correct: those payloads carry details). The 60 s poll meets "within 60 s".

**Verified**
- Backend type check clean; full suite **37 suites, 576 tests** (12 new in `test/analytics/municipal-overview.spec.ts`).
- Frontend type check clean; **59 tests** (role-access spec updated). Mobile type check clean (shared changed).
- Both raw SQL queries and the full `getMunicipalOverview()` ran against the dev database: counts are consistent (barangay rows + Unassigned = active) and the trend has 7 Manila days.

**Pending**
- The signed-in **Done when** checks below (LGU counts vs. Dispatcher queue, LGU network tab, test SOS within 60 s).
- Existing databases: rename the LGU account once in Administration → Users (the seed doesn't update existing rows).
- **Found, not fixed (from Phase 1):** `/announcements` is open to every console role so the critical-advisory banner can link there, but the page loads `GET /announcements/publisher/all`, which allows only the publisher roles. A Dispatcher or Supervisor following the banner gets a 403 table. Fix with a read-only published view for non-publishers, or point the banner elsewhere.

---

## Phase 3: Supervisor oversight

**Goal:** the Supervisor opens on its own Dashboard (`/dashboard`, `SupervisorDashboard`) instead of the Dispatch screen. The mockup's "Dispatch Oversight", "Resource Coverage" and "Performance Reports" are panels on this dashboard, not sidebar links.

### 3.1 Backend: new read-only module `backend/src/oversight/`
`oversight.module.ts`, `oversight.controller.ts`, `oversight.service.ts`, registered in `app.module.ts`. The class-level decorator is `@Roles(UserRole.SUPERVISOR)`. The module only reads; there are no writes.

| Endpoint | Returns | Built from |
|---|---|---|
| `GET /v1/oversight/summary` | `active`, `critical` (active and `priority = CRITICAL`), `enRoute`, `onScene`, `resolvedToday`, `openEscalations` (status `ACTIVE` or `ACKNOWLEDGED`), `unacknowledged` (status `SUBMITTED`/`RECEIVED`), `units` (same shape as Phase 2), `performance7d` (from `getPerformanceFromIncidents`, Phase 2) | `incidents`, `escalations`, `resources` |
| `GET /v1/oversight/workload` | Per dispatcher or supervisor: `openDispatches` (`dispatches.status` in `PENDING`, `SENT`, `ACCEPTED` on an active incident), `actionsLastHour` (`incident_events` by `triggered_by_id`) | `dispatches.dispatcher_id`, `incident_events` |
| `GET /v1/oversight/exceptions` | Three lists: **waiting** (`SUBMITTED`/`RECEIVED` for more than 5 min); **rejected** (dispatches with `rejected_at` on an incident still active); **stale location** (active dispatch whose newest `location_history.recorded_at` for that resource is more than 5 min old) | `incidents`, `dispatches`, `location_history` |
| `GET /v1/oversight/handovers` | Handovers with `acknowledged_at IS NULL`: incident reference, from, to, `handed_over_at` | `incident_handovers` |

- **Thresholds:** read the 5-minute values from `system_configurations` keys `oversight.waiting_minutes` and `oversight.stale_location_minutes`, defaulting to 5 if a key is missing. No migration is needed; a key is just a row.
- **Response fields:** every list returns `public_reference`, never a raw incident UUID as the display value (CLAUDE.md). It may also return the `id` for linking to the drawer, as other ops endpoints already do.
- **Stale location query:** use a single `DISTINCT ON (resource_id) … ORDER BY recorded_at DESC` raw query, filtered to the resources of active dispatches, so it doesn't load the whole history.

### 3.2 Frontend
- **`components/dashboard/SupervisorDashboard.tsx`** replaces the Phase 1 stand-in. Its panels:
  - summary cards;
  - performance;
  - an escalations preview (existing `GET /escalations`);
  - resource coverage (`units`, plus the existing fleet list);
  - dispatcher workload;
  - exceptions (three lists, each row opening the incident drawer);
  - handovers awaiting acknowledgement, shown person to person;
  - an activity feed (existing `GET /audit?perPage=20`);
  - a compact live map, reusing the existing map component.
- **Supervisor landing:** `/dashboard`.
- **Command / ICS page** ([command/page.tsx](../../frontend/app/(ops)/operations/command/page.tsx)) takes the Incident Commander mockup's content as sections, all from existing endpoints. Only add sections missing from the page today:

  | Section | Source |
  |---|---|
  | Major incidents | Incidents with ICS activated, plus surge incidents |
  | Command structure | `GET /incidents/:id/ics` |
  | Objectives and situation notes | `incident_command_structures.objectives`, `situation_notes` (in the ICS response) |
  | Agency coordination | `GET /incidents/:id/agencies` |
  | Hospital and evacuation | `GET /hospitals`, facilities including `EVACUATION_CENTER` |
  | Command log | `GET /audit/incidents/:incidentId` |

  **Check while building:** whether `PATCH`-ing objectives and situation notes already has an endpoint. If not, editing them is a small follow-up; showing them needs nothing new. Incident Groups are not built (out of scope).

### 3.3 Tests
`backend/test/oversight/oversight.spec.ts`:
- role metadata is `SUPERVISOR` only;
- the exceptions logic (waiting, rejected, stale) with fixed timestamps;
- handovers are filtered by `acknowledged_at`.

**Done when**
- [ ] The full suite is green.
- [ ] As the Supervisor: an unacknowledged test SOS older than 5 min appears under **waiting**.
- [ ] A handover created and not acknowledged appears under handovers, and disappears once acknowledged.
- [ ] A Dispatcher calling `/v1/oversight/*` gets 403.

### Phase 3 status: BUILT, signed-in walkthrough pending (2026-10-22)

**Data review first.** Before building, every source table was checked for a writer, so no panel reads a column nothing fills (the `incident_metrics` lesson):

| Source | Written by | Result |
|---|---|---|
| `incidents` statuses and timestamps | `incidents.service` `updateStatus`, responders, dispatch | ✅ used as planned |
| `dispatches.dispatcher_id`, `status`, `rejected_at` | `dispatch.service`, `responders.service` (`SENT` is never written) | ✅ used as planned |
| `incident_events.triggered_by_id` | every staff transition (`triggered_by_role` is often null) | ✅ role taken from `users.role` |
| `location_history.resource_id` | **never written**: both tracking endpoints store `incident_id` + `user_id` only | ⚠️ stale-location query changed (below) |
| `incident_handovers` create / `acknowledged_at` | `IncidentHandoverService`, audited | ✅ used as planned |
| `incident_command_structures.situation_notes` | **never written**: `PATCH /incidents/:id/ics` accepted objectives only | ⚠️ now written (below) |
| `audit_logs` → frontend | stored as `occurred_at`/`new_values`; the page read `created_at`/`metadata`/`actor` | ⚠️ fixed (below) |
| Incident status changes in `audit_logs` | **not written there**; they live in `incident_events` | ⚠️ activity feed reads `incident_events` |

**Built**
- **Backend `backend/src/oversight/`** (module, controller, service), class-level `@Roles(UserRole.SUPERVISOR)`, reads only:
  - `GET /v1/oversight/summary`: active, critical, en route, on scene, resolved today (Manila day), open escalations, not acknowledged, `units` (shared `AnalyticsService.getUnitCounts()`, extracted from Phase 2), `performance7d` (`getPerformanceFromIncidents`).
  - `GET /v1/oversight/workload`: per Dispatcher/Supervisor, open dispatches, distinct open incidents, incident actions in the last hour. Active staff with nothing open are listed.
  - `GET /v1/oversight/exceptions`: waiting, rejected (with `reassigned` when the incident already has another open dispatch; uncovered first), stale location. Thresholds from `system_configurations` `oversight.waiting_minutes` / `oversight.stale_location_minutes` (number or numeric string, 1–240, default 5).
  - `GET /v1/oversight/handovers`: unacknowledged, on incidents that haven't ended, from → to with names and roles.
  - `GET /v1/oversight/activity` (**added**): latest `incident_events` with transition, actor and time. Notes are not selected (responder free text can carry patient details).
  - `GET /v1/oversight/major-incidents` (**added**): active incidents with ICS active or in an active surge, with positions filled and agency count. The Command page had no list source.
- **ICS situation notes:** `PATCH /incidents/:id/ics` accepts `situationNotes` (≤ 4000 characters, trimmed, empty clears) and validates `objectives`. Supervisor-only as before, audited as before.
- **Audit read fixes:** `GET /audit`, `/audit/:id` and `/audit/incidents/:id` include the actor's `full_name`; `GET /audit` meta adds `totalPages`, `hasNext`, `hasPrev`. The frontend `AuditLogEntry` type now matches the table, and the Activity/Audit Log page shows the time, actor and recorded values (all three were blank before) and pages past page 1.
- **Frontend:** `SupervisorDashboard.tsx` (summary cards, exceptions opening the incident drawer, escalation queue preview, workload, handovers, performance against `SLA_ACKNOWLEDGEMENT_MINUTES`/`SLA_DISPATCH_MINUTES`, resource coverage, compact live map, activity feed, last-updated and 3-minute stale warning). Supervisor lands on `/dashboard`; Dispatcher keeps `OpsDashboard`.
- **Command / ICS page** (`components/command/CommandSections.tsx`): Major incidents, Objectives and situation report (editable while ICS is active), Agency coordination, Hospitals and evacuation centers (`GET /facilities`), Command log (`GET /audit/incidents/:id`). Existing ICS and handover panels unchanged.
- **Realtime:** `SocketProvider` refreshes `['oversight']` on incident, dispatch and escalation events and now listens for `incident.handover` (it didn't before).
- `DashboardPanel` and `formatDurationSec` are shared by the LGU and Supervisor dashboards.

**Deviations from the text above**
- **Stale location** matches the dispatch's crew (`dispatch_crew.user_id`) on the same incident, plus `resource_id` if a row ever sets it, using one `LEFT JOIN LATERAL … MAX(recorded_at)`, not `DISTINCT ON (resource_id)`. Only `ACCEPTED` dispatches on incidents in `ACTIVE_RESPONSE_INCIDENT_STATUSES` are checked; a crew that never shared a location counts from `accepted_at`.
- **Activity feed** uses `incident_events`, not `GET /audit?perPage=20`.
- **Two extra endpoints** (`activity`, `major-incidents`), both Supervisor-only reads.

**Verified**
- Backend type check clean; full suite **38 suites, 589 tests** (13 new in `test/oversight/oversight.spec.ts`).
- Frontend type check clean; 59 tests.
- All six service methods ran against the dev database and matched independent SQL counts (waiting 10 = 10; ICS active 1 = 1; stale units found with real last-seen times while 0 of 3 `location_history` rows had `resource_id`). A `situation_notes` write round-tripped and was restored.

**Pending**
- The signed-in **Done when** checks below.
- **Follow-up (not changed: emergency path):** set `location_history.resource_id` in the two tracking writers (`locations.service.ts`, `responders.service.ts`); both already know the dispatch. The oversight query already uses it when present.
- **Found, not fixed:** `incidents.service.ts` still has unused `createHandover`/`listHandovers`/`acknowledgeHandover` copies (the controller uses `IncidentHandoverService`). Delete in a cleanup.

---

## Phase 4: Dispatcher additions (frontend only)

- **Dashboard counts** ([dashboard/page.tsx](../../frontend/app/(ops)/dashboard/page.tsx)): add **Unreviewed** (`SUBMITTED`, `RECEIVED`) and **Critical** (active and `priority === 'CRITICAL'`), computed from the incidents already loaded.
- **Incident History:** `app/(ops)/operations/history/page.tsx`.
  - Uses the existing `GET /incidents?statuses=RESOLVED,CLOSED,CANCELLED,FALSE_ALERT,DUPLICATE,UNABLE_TO_RESPOND,REFERRED&page=…` (`statuses` is already supported, [incidents.controller.ts:63-80](../../backend/src/incidents/incidents.controller.ts#L63-L80)).
  - Each row opens the existing incident drawer, read-only for closed incidents.
- **Sidebar:** add Incident History for Dispatcher (last link) and Supervisor (Records group).
- **Dispatcher dashboard cards** follow the mockup: Active, Unreviewed, Critical, En Route, On Scene, Resolved Today, with "vs. last 24 h". Quick actions are limited to existing actions: Assign Unit (opens Dispatch), View All Incidents, Open Map. **Not included:**
- **New Incident:** the web console has no form for logging a phone-call incident. "Caller intake" is the citizen app's intake questions. A dispatcher-entered incident would be a separate feature.
- **Broadcast and Send SMS:** see the spec, §3.

**Done when**
- [ ] Frontend typecheck is clean.
- [ ] The counts match the queue's filters.
- [ ] A closed demo incident appears in History.

### Phase 4 status: BUILT, signed-in walkthrough pending (2026-10-22)

**Data review first.** The Dispatcher dashboard counted from `GET /incidents?perPage=100`, which is the newest 100 incidents of **any** status (`orderBy submitted_at desc`, no status filter). Once more than 100 incidents exist, older active ones fall out and every card undercounts. "Responders on scene" counted the first 100 responders the same way. There was no source at all for "vs. last 24 h".

**Built**
- **Backend `GET /v1/analytics/dispatch-summary`** (**added**: the phase was planned as frontend only, but no Dispatcher-readable endpoint returned these counts; `/oversight/*` is Supervisor-only by design). `DISPATCHER`, `SUPERVISOR`; counts only: `active`, `unreviewed` (`SUBMITTED`/`RECEIVED`), `awaitingDispatch` (`ACKNOWLEDGED`/`ASSESSED`/`DISPATCH_PENDING`), `critical`, `enRoute`, `onScene`, `last24h` and `previous24h` (`reported` by `submitted_at`, excluding `DRAFT`/`DUPLICATE`; `critical`; `resolved` by `resolved_at`), `units`. Uses the shared `ACTIVE_INCIDENT_STATUSES`, the same list as the Incident Queue.
- **Dispatcher dashboard** (`OpsDashboard`): six cards (Active, Unreviewed with awaiting-dispatch, Critical, En route · on scene, Resolved in 24 h, Units available) with "± vs previous 24 h" where a stored comparison exists; quick actions Assign unit, View all incidents, Open map. The recent list now loads only the 8 rows it shows.
- **Incident History** `app/(ops)/operations/history/page.tsx`: `GET /incidents?statuses=…` with filters (All, Resolved & closed, Referred, Cancelled & false alerts, Duplicates, Unable to respond), server paging and total, rows open the incident drawer (no actions on ended incidents; Resolved and Referred keep their close action).
- **Sidebar:** new Records group with Incident History for Dispatcher and Supervisor (last link for both); route `/operations/history` is OPS only.
- **Same newest-N bug fixed on three pages** (frontend only): Triage, Multi-Agency and the Command / ICS picker now ask the server for the statuses they show (`statuses=…`) instead of filtering the newest 50–100 incidents. Their private `ACTIVE_STATUSES` copies now import the shared list.
- **Realtime:** `SocketProvider` refreshes `['dispatch-summary']` on incident, dispatch and resource status events.

**Deviations from the text above**
- One backend endpoint added (above). Without it the counts could not match the queue.
- Cards follow the mockup's six, with the spec's "awaiting dispatch" and "units available" folded in. "vs. last 24 h" is shown only for reported, critical and resolved counts: Active, Unreviewed, En route and On scene are live snapshots with no stored history to compare.

**Verified**
- Backend type check clean; full suite **39 suites, 593 tests** (4 new in `test/analytics/dispatch-summary.spec.ts`).
- Frontend type check clean; 59 tests (role-access spec updated for the new link and route).
- `getDispatchSummary()` ran against the dev database: active 21 and unreviewed 10, matching direct SQL.

**Pending**
- Signed-in **Done when** checks below. The dev database has no `CLOSED` incident yet (History shows 2 false alerts and 1 resolved, `INC-2026-DEMO07`); close one from its drawer to check History.
- **Found, not fixed:** `fetchIncidents` sends `category`, `priority`, `barangay` and `search`, but `GET /incidents` reads only `page`, `perPage`, `status`, `statuses`. No screen passes them today; wire them up or remove them when filters are added.

---

## Phase 5a: System Administrator — health, integrations, security events (additive)

### Backend
- **Health:** extend `getHealth()` in [administration.service.ts:285](../../backend/src/administration/administration.service.ts#L285). The response becomes:

```ts
{
  database: 'ok'|'error';
  redis: 'ok'|'error';                       // real PING through the existing BullMQ connection
  queues: { name: string; waiting: number; active: number; failed: number; delayed: number }[];
                                             // getJobCounts() for every QUEUE_NAMES entry (shared/src/constants/queue.constants.ts)
  integrations: {
    sms:  { configured: boolean; lastFailure?: { at: string; reason: string } };   // TEXTBEE_API_KEY && TEXTBEE_DEVICE_ID set; newest failed job on the SMS queue
    push: { configured: boolean };                                                 // FCM credentials set
    maps: { configured: boolean };
  };
  timestamp: string;
}
```

  - Never return a key, token, device ID or phone number: booleans and counts only.
  - Each check gets a 2-second timeout. One slow dependency must not hang the endpoint.
- **Audit filter:** `GET /audit` accepts `action=LOGIN_FAILED,ACCOUNT_LOCKED,…`. In `audit.service.ts:92`, split on commas and use `{ in: [...] }`. A single value behaves exactly as today.

### Frontend
- **System Administrator Dashboard** (`AdminDashboard`, Phase 1): add the queue table and a red state when Redis or a queue has failures. No uptime percentage, API-usage or storage widgets until a backend source exists.
- **New `/administration/integrations` page:** one row per integration (SMS gateway, push, maps) with configured / last failure.
- **New `/administration/security` page (Security Events):**
  - shows `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `ACCOUNT_UNLOCKED`, `PASSWORD_CHANGE`, `MFA_CHANGE`, `SESSION_REVOKED` and `PERMISSION_DENIED`;
  - filters by date range and actor;
  - each row links to the user in the Users tab.
- **Roles & Permissions page:** add a notice: "Reference list. Access is enforced by each endpoint's role rules, not by this table." This is true today (see Context).
- **Sidebar:** add Integrations and Security Events for the System Administrator.

### Tests
- `test/administration/health.spec.ts`: with a mocked queue and Redis, the response has no secret-looking values, and a timeout yields `error` instead of hanging.
- `test/audit/audit-filter.spec.ts`: a single action and a list both work.

**Done when**
- [ ] The suite is green.
- [ ] Stopping Redis turns Health red within one refresh.
- [ ] Five wrong passwords on a test account show `LOGIN_FAILED` ×5 and `ACCOUNT_LOCKED` in Security Events.

### Phase 5a status: BUILT, signed-in walkthrough pending (2026-10-22)

**Data review first.**

| Source | Finding | Result |
|---|---|---|
| BullMQ queues | Every `QUEUE_NAMES` entry is registered in `jobs.module.ts`; all share the one connection from `app.module.ts` | ✅ one PING covers Redis; `getJobCounts()` per queue |
| Failed SMS jobs | Only **critical** jobs (barangay alerts) throw and land in BullMQ's failed set. OTP, contact and other SMS swallow their errors in `SmsProcessor` | ⚠️ "last failure" covers barangay alert SMS only; the page says so |
| Push credentials | Processors read `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (the `FCM_*` names were removed) | ✅ `push.configured` checks the `FIREBASE_*` names |
| Maps | Geocoding (Nominatim) and OSRM routing need no key; Mapbox tiles do; Mapbox routing falls back to OSRM without a key (`maps.module.ts`) | ✅ `maps.configured` = OSM tiles, or Mapbox with `MAP_API_KEY` |
| `LOGIN_FAILED` / `ACCOUNT_LOCKED` audit rows | Written with **no actor**; the account is `entity_type = 'user'`, `entity_id`. Unknown-email failures have no entity at all | ⚠️ Security Events filters by **account** (`entityId`), not actor (below) |
| `PERMISSION_DENIED` | In the enum, **written by nothing** today | Listed in the filter; no rows until a writer exists |
| `GET /audit?entityId=` | The frontend already sent it; the backend ignored it | ✅ now honoured |

**Built**
- **Backend `administration/system-health.service.ts`** (new): `GET /v1/administration/health` returns `database`, `redis` (real PING), `queues[]` (`name`, `status`, `waiting`, `active`, `failed`, `delayed`), `integrations` (`sms.configured` + `lastFailure {at, reason}`, `push.configured`, `maps {configured, tiles, routing}`) and `timestamp`. Each check has its own 2-second timeout and becomes `error`. The failure reason is scrubbed (digit runs → `[number]`, long token-like strings → `[redacted]`, 200 characters). `AdministrationService.getHealth()` was removed; the module registers read-only queue handles (no workers).
- **Audit:** `GET /audit` takes `action` as one value or a comma-separated list (`{ in: [...] }`), plus `entityId` (UUID-validated). List rows gain `entity_user { id, full_name, role }` when `entity_type = 'user'`, so actor-less account events are readable. No contact details.
- **Frontend:** `components/admin/HealthSections.tsx` (moved `HealthTab` out of `AdminSections.tsx`): Database / Redis / Queues cards, the queue table, and a red **Needs attention** banner when the database or Redis is down, a queue can't be read, or a queue holds failed jobs. `IntegrationsList` for the new **`/administration/integrations`** page. **`/administration/security`** (`components/admin/SecurityEvents.tsx`): the seven actions, filters by event, date range and account (the filter icon on a row), account name links to `/administration/users?search=<name>` (Users tab now accepts `?search=`), server paging.
- **Roles & Permissions:** the notice "Reference list. Access is enforced by each endpoint's role rules, not by this table." The old subtitle claimed changes "take effect on the user's next request", which was false; replaced.
- **Sidebar:** Security Events and Integrations for the System Administrator (after Audit Log); the dashboard's System health header links to Integrations.

**Deviations from the text above**
- **Account, not actor, filter** on Security Events: the main events have no actor. "Done by" is still shown per row (the user, an admin's name, or —).
- `queues[]` items carry a `status` so an unreadable queue isn't shown as zeros. `maps` also reports which tile and routing provider is active (names only).
- **Failed jobs stay red** until removed from Redis: BullMQ keeps failed jobs, so one old failure keeps the banner on. That's deliberate (it's a real failure nobody has looked at); clearing failed jobs is a follow-up if it gets noisy.

**Verified**
- Backend type check clean; full suite **42 suites, 655 tests** (7 in `test/administration/health.spec.ts`, 5 in `test/audit/audit-filter.spec.ts`).
- Frontend type check clean; 59 tests (role-access spec updated for the two links and routes).
- `SystemHealthService` ran against the dev database and Redis with real BullMQ queues: all `ok` in 371 ms; it found one real failed barangay SMS (`2026-10-21`, `Request failed with status code 401`). With `REDIS_URL` pointed at a closed port: `redis` and all nine queues `error` after 2.0 s, database still `ok`, no hang.

**Pending**
- Signed-in **Done when** checks above (stop Redis with the backend running; five wrong passwords on a test account).
- `pnpm lint` in `frontend/` fails before running (ESLint options error in `next lint`), unrelated to this phase.

---

## Phase 5b: System Administrator — remove operational powers

**Prerequisite:** D1 and D5 decided. At least one `ACTIVE` Supervisor account exists in every environment, since surge activation becomes Supervisor-only.

### Backend: remove `SYSTEM_ADMINISTRATOR` (and `ORG_ADMINISTRATOR` where listed)

| File | Location | Change |
|---|---|---|
| `src/incidents/incidents.controller.ts` | `PATCH :id/status` (line 126) | `@Roles(DISPATCHER, SUPERVISOR)` |
| `src/false-alerts/false-alerts.controller.ts` | `PATCH :incidentId/cancel` (lines 43-50) | Remove `ORG_ADMINISTRATOR`, `SYSTEM_ADMINISTRATOR`. Keep `CITIZEN`, `BYSTANDER`, `DISPATCHER`, `SUPERVISOR` |
| `src/false-alerts/false-alerts.controller.ts` | `PATCH :incidentId/false-alert` (lines 78-84) | `@Roles(DISPATCHER, SUPERVISOR)` |
| `src/false-alerts/false-alerts.service.ts` | `DISPATCHER_ROLES` (lines 18-23) | Remove `ORG_ADMINISTRATOR`, `SYSTEM_ADMINISTRATOR` |
| `src/escalations/escalations.controller.ts` | all four endpoints (lines 25-53) | `@Roles(SUPERVISOR)` |
| `src/disaster-mode/disaster-mode.controller.ts` | `activate`, `deactivate`, `broadcast` (lines 36, 44, 91) | `@Roles(SUPERVISOR)`. `GET status` keeps `SYSTEM_ADMINISTRATOR` (read-only banner) |
| `src/communications/communications.service.ts` | `DISPATCHER_ROLES` (line 6) | Split into `CHAT_POST_ROLES` (`DISPATCHER`, `SUPERVISOR`) and read access. Under D1 the System Administrator may read but not post; the Org Administrator neither |
| `src/jobs/processors/escalation.processor.ts` | `ESCALATION_ROLES.RESPONSE` (line 16) | `['SUPERVISOR']`, with the D5 fallback to `DISPATCHER` when the supervisor query returns no one |

**Deliberately unchanged:**
- `realtime/incident-participant.service.ts` `INCIDENT_STAFF_ROLES`: read visibility under D1. If D1 is "no", remove both admin roles and update `test/realtime/incident-participant.spec.ts:13`.
- `GET /incidents`, `GET /incidents/:id/attachments`, `GET /audit/incidents/:id`, `GET /disaster-mode/status`: all read-only.
- Every `DISPATCHER` and `SUPERVISOR` entry.
- The `CITIZEN`/`BYSTANDER` cancel path.

### Frontend: match the backend
Remove `SYSTEM_ADMINISTRATOR` from:
- `operations/fleet/page.tsx:301` `canChangeStatus`;
- `operations/surge/page.tsx:360` `canManage`;
- `operations/escalations/page.tsx:60`;
- `operations/command/page.tsx:635`;
- `operations/multi-agency/page.tsx:194, 409, 642`.

The Phase 1 sidebar already hides these pages; this covers someone opening them by URL with D1 read access.

### Tests
- **New `test/rbac/separation-of-duties.spec.ts`:** for each endpoint above, read `ROLES_KEY` metadata and assert that `SYSTEM_ADMINISTRATOR` is absent and `DISPATCHER`/`SUPERVISOR` are present as listed.
- **`false-alerts` service spec:** a System Administrator calling `markFalseAlert` gets `ForbiddenException`.
- **Escalation processor spec:** `RESPONSE` notifies supervisors; with no active supervisor it notifies dispatchers.
- **Check for breakage:** run `grep -rn "SYSTEM_ADMINISTRATOR" backend/test`. Today only `incident-creation.spec.ts:282` (Sys Admin *reporting* an incident, unaffected) and `incident-participant.spec.ts:13` (unchanged under D1) mention it.

**Done when**
- [ ] The suite is green.
- [ ] As the System Administrator: `PATCH /v1/incidents/:id/status`, `POST /v1/escalations/:id/resolve` and `POST /v1/disaster-mode/activate` each return 403.
- [ ] As the Supervisor: all three still work. As a Dispatcher: status change and false alert still work.
- [ ] Full emergency flow re-run: citizen SOS → acknowledge → dispatch → responder accept (mobile) → on scene → resolve → close, with no errors.

### Phase 5b status: BUILT, signed-in walkthrough pending (2026-10-22)

**Data review first.**

| Area | Finding | Result |
|---|---|---|
| `escalation.processor.ts` | **Nothing enqueues `QUEUE_NAMES.ESCALATION`**: the processor is never run. The live SLA path is `sla-monitor.processor.ts`, which already notified Supervisors only | Changed as planned anyway; D5 applied to **both** through one helper |
| Recipient filter `status = 'ACTIVE'` | Seeded and admin-created staff are `PENDING_VERIFICATION` by design (`auth/account-status.ts`: they can sign in). On the dev database **every** staff account is `PENDING_VERIFICATION`, so SLA breach pushes reached **0** supervisors | ⚠️ fixed: recipients are staff who can sign in (not `SUSPENDED`/`DEACTIVATED`) |
| Prerequisite "an `ACTIVE` Supervisor exists" | Fails literally (dev has none), but the Supervisor can sign in and act, which is what surge activation needs | ✅ met in substance |
| Multi-agency `canRespond` (`ORG_ADMINISTRATOR`, `SYSTEM_ADMINISTRATOR`) | Mutual-aid approve/deny; not in this phase's list; backend still allows both | Left unchanged (below) |

**Built**
- **Backend role removals**, exactly as the table above: `PATCH /incidents/:id/status` → Dispatcher, Supervisor; `PATCH /false-alerts/:id/cancel` drops both admin roles (citizen and bystander kept); `PATCH /false-alerts/:id/false-alert` → Dispatcher, Supervisor; `false-alerts.service` `DISPATCHER_ROLES` → Dispatcher, Supervisor; all four `/escalations` endpoints → Supervisor; `disaster-mode` `activate`, `deactivate`, `broadcast` → Supervisor (`GET status` keeps the System Administrator).
- **Incident chat** (`communications.service.ts`): `CHAT_POST_ROLES` (Dispatcher, Supervisor) and `CHAT_READ_ROLES` (+ System Administrator). `assertParticipant(…, 'post')` on send; a System Administrator who tries to post gets "Your role can read this incident chat but not post in it". The Org Administrator has neither, unless it's the reporter or crew. The web chat panel shows a read-only note instead of the composer for the System Administrator.
- **Escalation recipients** (`jobs/escalation-recipients.ts`, new): `findEscalationRecipients(prisma, roles)` returns staff with those roles who can sign in; if none, Dispatchers (D5). Used by `sla-monitor.processor.ts` (Supervisors) and `escalation.processor.ts` (`RESPONSE` is now `['SUPERVISOR']`).
- **Frontend flags:** `SYSTEM_ADMINISTRATOR` removed from fleet `canChangeStatus`, surge `canManage`, escalations `canManageEscalations`, command `canCommand`, and multi-agency `isSuper`, `canRequest`, `canCreate`.

**Deviations from the text above**
- **SLA monitor changed too.** The plan only named `escalation.processor.ts`, which never runs; without this, D5 would have had no effect. The change only widens who is notified (more Supervisors, or Dispatchers as fallback); the SLA timing, escalation records and WebSocket event are untouched.
- **Recipients are "can sign in", not `ACTIVE`.** See the data review.

**Verified**
- Backend type check clean; full suite **44 suites, 676 tests**: new `test/rbac/separation-of-duties.spec.ts` (role metadata for all ten endpoints, D1 reads kept), `test/jobs/escalation-recipients.spec.ts` (status rule, Dispatcher fallback, never the System Administrator), 4 chat cases in `communications.spec.ts`, 2 in `false-alerts.spec.ts` (System and Org Administrator refused).
- `grep SYSTEM_ADMINISTRATOR backend/test`: `incident-creation.spec.ts` (Sys Admin reporting) and `incident-participant.spec.ts` (D1) still pass unchanged.
- Frontend type check clean; 59 tests.
- Dev database: the old Supervisor query found **0** recipients, `findEscalationRecipients` finds **1**.

**Pending**
- Signed-in **Done when** checks above, including the full emergency flow re-run.
- **Found, not changed:** `PATCH /resources/requests/:id/approve|deny` and the multi-agency `canRespond` flag still allow the System Administrator. Approving mutual aid is the lending organization's call, so it belongs to the Org Administrator (Phase 6); removing the System Administrator there is a one-line follow-up if MDRRMO agrees.
- **Found, not changed:** `disaster-mode.service.ts:118` loads responders with `status: 'ACTIVE'`, the same filter problem as above. Seeded responders are `PENDING_VERIFICATION`, so it likely finds none. Not part of this phase; check before relying on surge mode.
- A System Administrator who reports an emergency themselves can no longer cancel it through `/false-alerts/:id/cancel` (the endpoint no longer admits the role). A dispatcher can still cancel it. Staff should report through the citizen app anyway.

---

## Phase 6: Org Administrator access

### Backend: add `ORG_ADMINISTRATOR` to read endpoints (additive)

| File | Endpoint |
|---|---|
| `src/resources/resources.controller.ts` | `GET /resources` (line 33), `GET /resources/:id` (line 128) |
| `src/organizations/organizations.controller.ts` | `GET /organizations` (line 29), `GET /organizations/:id` (line 36) |

Writes are unchanged. They already allow `ORG_ADMINISTRATOR` and are own-org in the UI. **Check while here:** `PATCH /resources/:id` and `PATCH /organizations/:id` must check own-org on the **server**. If they only check in the UI, add a service check that `actor.organization_id` matches (via `organization_memberships`) unless the actor is a System Administrator. Record what you find in this section.

### Frontend
- **Sidebar:** Dashboard · Organizations · Fleet & Units · Requests · Barangay Directory.
- **Barangay Directory:** allow `ORG_ADMINISTRATOR` on `/administration/barangays` (the route from Phase 1.2b) in `role-access.ts`. The backend already allows it (`barangay-contacts.controller.ts:30`). No other administration route opens for this role.
- **Requests page** (`/resources/requests`): uses the existing `GET /resources/requests` and `PATCH /resources/requests/:id/approve|deny`, both of which allow `ORG_ADMINISTRATOR`. It's a route rather than a tab because the Org Administrator has no other use for the Fleet page's operational tabs.
- **Fleet & Units** for this role shows the Registry tab only (no status buttons).
- **Dashboard panel** (from Phase 1): the organization's units by status, from `GET /resources`.
- **Landing:** `/dashboard`.

### Tests
- Role-metadata assertions for the four read endpoints.
- If the own-org server check is added, a spec for it.

**Done when**
- [ ] As `orgadmin@mdrrmo.bocaue.gov.ph`: every sidebar link loads with no 403.
- [ ] The Barangay Directory edit works and is audited.
- [ ] Editing another organization's unit is refused by the server.

### Phase 6 status: BUILT, signed-in walkthrough pending (2026-10-22)

**Own-org check: what was found.** The server had **no** own-organization check anywhere. The Org Administrator's "own org only" rule existed in the web UI alone, and several write endpoints didn't even receive the caller. An Org Administrator could:
- edit any organization (`PATCH /organizations/:id`);
- list, add or remove members of any organization, **including adding itself to another one** (`/organizations/:id/members`);
- register a unit under any organization, and edit any unit or its capabilities (`POST /resources`, `PATCH /resources/:id`, `/resources/:id/capabilities`);
- answer a mutual-aid request that was already answered, accept its own organization's request, or (legacy `PATCH /resources/request/:id/respond`) accept without becoming the provider.

**Data review.**

| Source | Finding | Result |
|---|---|---|
| `organization_memberships` | `orgadmin@mdrrmo.bocaue.gov.ph` → MDRRMO Bocaue (active). The System Administrator has no membership | ✅ own-org = active membership; System Administrator bypasses |
| `user.orgId` (login) | First membership's organization (`auth.service.ts`); the UI already used it | ✅ unchanged |
| `resource_requests` | Broadcast: no target organization; "accept" sets `providing_org_id`. Dev database has **0** requests | Requests page built on this model |
| `GET /resources/requests` | Returns a **plain array** with Prisma relation names; the frontend read `{ data, meta }` and `requesting_org`/`providing_org` | ⚠️ the Multi-Agency **Mutual Aid tab was always empty**; fixed in the frontend fetcher |
| Barangay Directory | `barangay-contacts.controller.ts` already allows `ORG_ADMINISTRATOR`; every change is audited | ✅ route opened only |

**Built**
- **Backend reads (additive):** `ORG_ADMINISTRATOR` added to `GET /resources`, `GET /resources/:id` (which also gained `SYSTEM_ADMINISTRATOR`, matching `GET /resources`), `GET /organizations` and `GET /organizations/:id`.
- **Server own-org check** `organizations/org-scope.ts` `assertCanManageOrg(prisma, actor, orgId)`: the System Administrator passes; anyone else needs an active membership in that organization, or gets 403 "You can only manage your own organization". Applied to organization update, members list/add/remove, unit create (by `organizationId`), unit update and capability add/remove (by the unit's organization).
- **Mutual-aid responses** (`resources.service.ts respondToRequest`): a guarded `updateMany … where status = PENDING` (409 if already answered; two organizations can't both become the provider); accepting your own organization's request is refused (400); the legacy respond route now sets the provider on accept like `/approve`; the audit entry records the provider.
- **Frontend:**
  - Sidebar for the Org Administrator: Dashboard · Organizations · Fleet & Units · Requests · Barangay Directory. Routes opened: `/organizations`, `/operations/fleet` (Registry tab only, as before), `/resources`, `/resources/requests` (Org Administrator only), `/administration/barangays` (no other administration route).
  - **`OrgDashboard`** replaces the placeholder (and `RolePlaceholderDashboard.tsx` is deleted): own units, available, out of service, open requests from other organizations; units by status; open-request preview. A notice when the account has no organization.
  - **Requests page** (`components/resources/RequestsInbox.tsx`): Open / Our organization / All; Provide and Deny (with optional notes) only on pending requests from other organizations; server errors shown in the dialog.
  - **Registry tab (D6):** reads every organization's units, opens filtered to its own; the add-unit form offers only its own organization; a unit's organization is locked when editing (the API never changed it).
  - `fetchMutualAidRequests` maps the backend array to `{ data, meta }` with `requesting_org`/`providing_org`, which also fixes the Multi-Agency Mutual Aid tab.

**Deviations from the text above**
- The own-org check covers **all** Org Administrator writes in both controllers, not only the two `PATCH` endpoints: the members endpoints were the more serious gap.
- `respondToRequest` gained the PENDING guard and the own-request refusal (found while building the Requests page).
- `GET /resources/:id` also admits the System Administrator.

**Verified**
- Backend type check clean; full suite **45 suites, 696 tests** (20 in the new `test/organizations/org-scope.spec.ts`: role metadata for the four reads, the scope helper, every organization and unit write refused across organizations, the System Administrator bypass, and the three request guards).
- Frontend type check clean; 59 tests (role-access spec: the Org Administrator's sidebar and routes, and `/administration/*` other than Barangay Directory still closed).
- Against the dev database, `assertCanManageOrg` for `orgadmin@`: MDRRMO Bocaue allowed; BFP Bocaue and BGH refused (403).

**Pending**
- Signed-in **Done when** checks above.
- **Semantics to confirm with MDRRMO:** requests go to every organization, so **Deny** by one organization closes the request for all. A per-organization "decline" would need a table of responses (schema change), out of scope here.
- The System Administrator has no organization membership, so it can't accept a request (`resolveOrgForUser` refuses). That fits Phase 5b; it can still deny.
- Organization and unit edits are still **not audited** (only requests are). Add `AuditService` calls if MDRRMO wants registry changes in the Audit Log.

---

## Phase 7: Approval for CRITICAL advisories (behind a flag)

**Goal:** a CRITICAL advisory drafted by the LGU Information Officer is released only after an MDRRMO Supervisor approves it. With the flag off, behaviour is exactly as today.

### 7.1 Schema
Two migrations, because PostgreSQL cannot use a new enum value in the same transaction that adds it:

`backend/prisma/migrations/20261023000000_announcement_pending_approval/migration.sql`
```sql
ALTER TYPE "announcement_status" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL' AFTER 'DRAFT';
```

`backend/prisma/migrations/20261023000100_announcement_approval_fields/migration.sql`
```sql
ALTER TABLE "announcements"
  ADD COLUMN "approval_requested_at"    TIMESTAMPTZ(6),
  ADD COLUMN "approval_requested_by_id" UUID,
  ADD COLUMN "review_note"              TEXT;

ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_approval_requested_by_id_fkey"
  FOREIGN KEY ("approval_requested_by_id") REFERENCES "users"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
```

`schema.prisma`:
- add `PENDING_APPROVAL` to `enum announcement_status`, after `DRAFT`;
- add the three fields to `model Announcement`, plus the relation `users_announcements_approval_requested_by_idTousers User? @relation("announcements_approval_requested_by_idTousers", fields: [approval_requested_by_id], references: [id], onUpdate: NoAction)`;
- add the back-relation field on `model User`, alongside the existing `announcements_approved_by_idTousers` back-relation.

Then run `pnpm prisma migrate deploy && pnpm prisma generate`. The changes are all nullable or additive, so existing rows are untouched.

### 7.2 Configuration
- `ANNOUNCEMENT_APPROVAL_REQUIRED` (boolean, default `false`) in `backend/src/config/config.validation.ts` and `.env.example`.
- `needsApproval(a) = flag && a.severity === 'CRITICAL'` (D3).

### 7.3 Backend: announcement service and controller

| Endpoint | Roles | Transition | Notes |
|---|---|---|---|
| `POST /announcements/:id/submit` | `ANNOUNCEMENTS_PUBLISHER`, `SYSTEM_ADMINISTRATOR` | `DRAFT → PENDING_APPROVAL` | Runs `assertPublishable` first. Sets `approval_requested_at/by`, clears `review_note`. An optional `scheduledAt` is stored in `scheduled_at`. Audit `STATUS_CHANGE`. Notifies active Supervisors (best-effort, through the existing notifications queue) |
| `POST /announcements/:id/withdraw` | same | `PENDING_APPROVAL → DRAFT` | So the officer can edit. Audit `STATUS_CHANGE` |
| `POST /announcements/:id/approve` | `SUPERVISOR` | `PENDING_APPROVAL → PUBLISHED`, or `→ SCHEDULED` if `scheduled_at` is in the future | Guarded `updateMany where status = PENDING_APPROVAL`, the same pattern as `publish()`. Sets `approved_by_id` to the supervisor. Refuses if the approver is `approval_requested_by_id`. Publishing reuses `afterPublish()` unchanged |
| `POST /announcements/:id/return` | `SUPERVISOR` | `PENDING_APPROVAL → DRAFT` | Requires a `note` of at least 10 characters, stored in `review_note`. Audit `STATUS_CHANGE` |
| `GET /announcements/approvals` | `SUPERVISOR` | — | Lists `PENDING_APPROVAL`, oldest first. **Declare it before `@Get(':id')`** ([announcements.controller.ts:128](../../backend/src/announcements/announcements.controller.ts#L128)), or `ParseUUIDPipe` on `:id` will reject "approvals" with a 400 |

**Changes to existing methods:**
- `publish()` and `schedule()`: if `needsApproval(existing)`, throw `BadRequestException('CRITICAL advisories need MDRRMO approval. Submit for approval instead.')`.
- Publisher responses gain a computed `requiresApproval: boolean`, so the frontend never reads the env flag.
- **Unchanged:** `update()` (already `DRAFT`-only, so a pending item is locked), `releaseDueScheduled()`, `afterPublish()`, and every public endpoint.

**Interaction with D4:** a System Administrator creating a CRITICAL advisory goes through approval like everyone else.

### 7.4 Frontend
- **`features/announcements/api.ts`:** add `'PENDING_APPROVAL'` to `AnnouncementStatus`. Add `submit`, `withdraw`, `approve`, `return` and `approvals` calls and hooks.
- **Compose page:** when `requiresApproval`, the primary button reads **"Submit for MDRRMO approval"** instead of Publish/Schedule.
- **Announcements page:** a **Pending approval** filter; a returned draft shows the `review_note` prominently.
- **New `app/(ops)/operations/approvals/page.tsx` (Supervisor):**
  - shows the pending list, with a preview using the existing `AnnouncementPreview` component;
  - Approve and Return actions, where Return asks for a note.
- **Sidebar:** "Approvals" under Broadcast for the Supervisor. The LGU account gets **no new link**: "Pending approval" is a filter on its Announcements page, and its Dashboard shows a count of pending and returned items.
- **`shared/src/enums/announcement-status.enum.ts`:** replace the stale values with the database's (`DRAFT`, `PENDING_APPROVAL`, `SCHEDULED`, `PUBLISHED`, `ARCHIVED`, `SUPERSEDED`, `CANCELLED`). It's imported nowhere today, so this is safe. Rebuild `shared` (`pnpm --filter @agap/shared build`) so its `.js`/`.d.ts` match.

### 7.5 Mobile
No change. Public endpoints filter by released statuses, `announcement.published` is emitted only from `afterPublish()`, and the mobile type union doesn't include `PENDING_APPROVAL`.

### 7.6 Tests
`backend/test/announcements/approval.spec.ts`:
- **Flag off:** CRITICAL publishes directly, exactly as today (regression).
- **Flag on:** `publish()` on CRITICAL throws; non-CRITICAL publishes directly.
- **Submit → approve:** publishes once; `afterPublish` runs once; `approved_by_id` is the supervisor.
- **Submit with a future time → approve:** becomes `SCHEDULED`; `releaseDueScheduled` later publishes it.
- **Return:** needs a note, goes back to `DRAFT`, and `update()` works again.
- **Approver is the requester:** refused.
- **Concurrent approves:** only one succeeds (guarded `updateMany`).
- **Public:** `findPublished` and `findPublicById` never return `PENDING_APPROVAL`.

**Done when**
- [ ] The migration applies cleanly on a copy of the dev database; `prisma generate` is clean; backend, frontend and mobile typechecks are clean.
- [ ] Suite green.
- [ ] With the flag on, end-to-end:
  1. The LGU account drafts a CRITICAL flood advisory and submits it.
  2. The Supervisor sees it in Approvals and returns it with a note.
  3. The LGU account edits and resubmits.
  4. The Supervisor approves.
  5. The citizen app shows it, and SMS subscribers receive it once.
- [ ] With the flag off, the same CRITICAL advisory publishes directly.

### Phase 7 status (2026-10-22)

**Data review.**
- `approved_by_id`/`approved_at` are already written by `publish()` and `schedule()`: today the publisher who clicks Publish *is* the approver. Phase 7 keeps that for everything except CRITICAL-with-flag, where the Supervisor is written instead.
- `releaseDueScheduled()` uses `approved_by_id` as the audit actor, so an approved-then-scheduled advisory is now attributed to the Supervisor with no change to the scheduler.
- Image upload (`media.service.ts`) is already DRAFT-only, so a pending submission is locked without new code. `update()` is DRAFT-only too.
- Supervisors work in the web console and normally have no FCM token, so the "notify Supervisors" push in §7.3 usually reaches nobody. The console signal (polled list + dashboard banner) is the one that works.
- A draft can already carry `scheduled_at` from `create()`. Approving it as-is would have scheduled a time the officer never submitted.

**Built.**
- Migrations `20261023000000_announcement_pending_approval` and `20261023000100_announcement_approval_fields`, schema, `ANNOUNCEMENT_APPROVAL_REQUIRED` in `config.validation.ts` and `.env.example`.
- Service: `submitForApproval`, `withdrawSubmission`, `approve` (guarded `updateMany`, refuses the requester, reuses `afterPublish()`), `returnToDraft` (note ≥ 10 characters), `findPendingApproval`; `publish()`/`schedule()` refuse CRITICAL with the flag on; publisher responses carry `requiresApproval`, and lists carry `requestedByName`.
- Controller: `POST :id/submit|withdraw|approve|return`, `GET approvals`, `GET policy`, `GET approvals/:id/image`, all declared before `GET :id`.
- Shared `AnnouncementStatus` now matches the database; `shared` rebuilt.
- Frontend: compose's primary button becomes **Submit for MDRRMO approval**; Announcements page gets **Pending approval** and **Returned** filters, a "Returned by MDRRMO" note, Withdraw, and a `?tab=` deep link; new `/operations/approvals` (Supervisor) with preview, Approve and Return; "Approvals" under Broadcast; Supervisor dashboard banner; LGU dashboard pending/returned counts.

**Deviations from the spec.**
1. **`GET /announcements/policy`** (Publisher, System Administrator, Supervisor) returns `{ criticalNeedsApproval }`. Compose changes severity before a draft exists, so a per-row `requiresApproval` alone can't drive its button. The console still never reads the env var.
2. **`GET /announcements/approvals/:id/image`** (Supervisor, `PENDING_APPROVAL` only), so the review preview shows the image without opening the publisher image route to the Supervisor.
3. **Early release of an approved scheduled advisory is allowed.** `publish()` on a `SCHEDULED` item that went through approval succeeds and keeps the Supervisor as approver (the text is locked while scheduled). The spec would have forced unschedule → resubmit during an emergency.
4. **`unschedule()` clears `approval_requested_at/by`** as well as the approval, so an edited CRITICAL advisory must be resubmitted.
5. **`submit` refuses when no approval is needed** (flag off, or not CRITICAL), and a submission without `scheduledAt` clears any time saved earlier in the draft.
6. **Supervisor push:** recipients are Supervisors who can sign in (not `status = ACTIVE`, see finding #1 in the 5b handoff), with **no Dispatcher fallback** (they can't approve). Push failure never blocks the submission. The Approvals list polls every 60 s.
7. `GET /announcements/publisher/all?returned=true` lists drafts with a `review_note`.

**Verified.**
- Migrations applied with `migrate deploy` on the dev database (enum value, three columns, FK present; existing rows untouched). **Not** on a copy: `CREATE DATABASE … TEMPLATE "AGAP"` was refused because another session held the database, and there is no `pg_dump`/Docker on this machine.
- `prisma generate` clean; backend, frontend and mobile typechecks clean.
- `backend/test/announcements/approval.spec.ts`: 23 tests covering every §7.6 case plus early release, unschedule voiding approval, the stale `scheduled_at`, push failure, role metadata and route order. Backend 46 suites, 719 tests (`auth-phase3` timed out once under load and passes on its own); frontend 60 tests.

**Pending.**
- The signed-in **Done when** walkthrough above, with the flag on and then off.
- MDRRMO to decide whether to switch the flag on, and whether a Supervisor needs a "publish now" for a CRITICAL advisory they wrote themselves (today the Supervisor can't compose).

---

## Known gap: `incident_metrics` is never filled

Found while checking the mockups' "Response Performance" panels (2026-10-22).

- **What's missing:** `incident_metrics` exists (init migration) and is read by `analytics.service.ts` (`getResponseTimes`, `getSlaCompliance`). But no code, seed or database trigger ever inserts into it.
- **Consequence:** the Analytics page's response-time and SLA figures are empty today, for both the Supervisor and the System Administrator.
- **In this plan:** Phases 2 and 3 compute performance directly from `incidents` timestamps (`getPerformanceFromIncidents`), so they don't depend on the table.
- **Follow-up (separate task):** either fill `incident_metrics` when an incident is resolved or closed (with a backfill for existing incidents), or switch `getResponseTimes`/`getSlaCompliance` to the incidents-based query and retire the table. Decide before relying on the Analytics page in a demo.

## Out of scope (follow-ups)

- A separate `INCIDENT_COMMANDER` role or a Mayor login (rejected in the spec).
- Limiting the Supervisor's dispatch authority (rejected: night-shift risk).
- Incident groups and staging areas (no backend model yet).
- Enforcing the `role_permissions` table in a guard (a larger RBAC redesign).
- Mockup widgets with no data source: weather, uptime percentage, API request volume, storage usage, a dispatcher "New Incident" form, a shaded barangay map for the LGU dashboard.
- Per-organization scoping of Supervisor and Dispatcher incident lists.

## Verification (every phase)

1. `cd backend && pnpm typecheck && pnpm jest --config ./test/jest.config.ts` — all suites pass (baseline 36 / 564, plus new).
2. `pnpm --filter @agap/frontend typecheck`.
3. `pnpm --filter @agap/mobile typecheck` whenever `shared/` changes (Phases 2 and 7).
4. **Manual role walkthrough.** Sign in as each web account (System Admin, dispatcher1, supervisor, announcements, orgadmin, receiving) and open every sidebar link: no 403, no fake zeros, the right landing page.
5. **Emergency flow smoke test** after Phases 5b and 7: citizen SOS on mobile → dispatcher acknowledge and dispatch → responder accept on mobile → resolve → close. Barangay alert SMS still sent.
6. Update the **Status** line at the top of this plan, and add a "Phase N status" section with what was verified and what's still pending.
