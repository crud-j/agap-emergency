# AGAP: Role Rules and Dashboard Content

**Project:** AGAP — GPS-Based Emergency Alert and Dispatch System
**Operational context:** Bocaue MDRRMO, Bulacan, Philippines
**Status:** Agreed spec (2026-10-22). It merges the earlier proposal with the roles the backend actually has. The work to get from today's dashboards to this spec is in [ROLE_DASHBOARDS_PLAN.md](plans/ROLE_DASHBOARDS_PLAN.md).
**Purpose:** Define, for each web-console role, what its dashboard shows, what it may do, and what it must not do.

> **Source of truth for permissions** is the backend: `@Roles(...)` on each controller, checked by `RolesGuard` (`backend/src/common/guards/roles.guard.ts`). There is no role bypass: a System Administrator can only do what an endpoint lists it for. Hiding a link in the frontend is never the control.
>
> **Mockups** in [dashboards-mockups/](dashboards-mockups/) show layout and style only. Where a mockup and this spec disagree on content, links or data shown, this spec wins.

---

## 0. Navigation rules

1. **One home route.** Every role's first link is **Dashboard** at `/dashboard`, which renders that role's own content. There are no separate overview routes.
2. **One name per page.** A page has the same label and route for every role that can open it (table below).
3. **Profile is not a sidebar link.** Name and sign-out live in the user menu (bottom of the sidebar). The one exception is **Account Security** (`/account/security`: password, passkeys, MFA, sessions), the last sidebar link for every console role under an "Account" group so it is easy to find. The Hospital Portal has no sidebar, so Hospital Users reach it from the shield button in the top bar.
4. **No link without a backend.** A link appears only if every endpoint the page loads allows that role.
5. **Sections, not links.** Content that belongs to one page (filters, tabs, panels) is never also a sidebar link.

### Page names and routes

| Label | Route | Notes |
|---|---|---|
| Dashboard | `/dashboard` | Content depends on role |
| Incident Queue | `/operations/incidents` | |
| Live Map | `/operations/map` | |
| Triage | `/operations/triage` | |
| Dispatch | `/operations/dispatch` | |
| Incident History | `/operations/history` | New (plan Phase 4) |
| Escalations | `/operations/escalations` | |
| Activity Log | `/audit` | Same page as Audit Log; label differs only by audience. Supervisor sees "Activity Log", System Administrator "Audit Log" |
| Command / ICS | `/operations/command` | Holds all Incident Commander content (§4) |
| Multi-Agency | `/operations/multi-agency` | |
| Surge Mode | `/operations/surge` | |
| Fleet & Units | `/operations/fleet` | Registry (`/resources`) becomes a tab of this page |
| Hospitals & Facilities | `/hospitals` | |
| Analytics | `/analytics` | |
| Risk Map | `/operations/risk` | |
| Announcements | `/announcements` | Filters: All · Advisories · Drafts · Pending approval |
| Publication History | `/announcements/history` | New (plan Phase 2) |
| Approvals | `/operations/approvals` | New (plan Phase 7) |
| Users & Accounts, Roles & Permissions, Barangay Directory, Integrations, Security Events, Configuration | `/administration/<section>` | The administration tabs become routes, so the sidebar is the only navigation |
| Organizations | `/organizations` | |
| Requests | `/resources/requests` | Org Administrator (plan Phase 6) |

---

## 1. Roles

AGAP has nine roles (`user_role` enum in `backend/prisma/schema.prisma`). Six of them use the web console.

| Role (`user_role`) | Seeded account | Who it is in Bocaue | Client |
|---|---|---|---|
| `DISPATCHER` | dispatcher1, dispatcher2 | MDRRMO Operations Center dispatchers | Web |
| `SUPERVISOR` | supervisor | MDRRMO operations supervisor. Also takes Incident Commander duties on major incidents | Web |
| `ANNOUNCEMENTS_PUBLISHER` | announcements@lgu… | **LGU Information Officer, posting on behalf of the Office of the Mayor** (the "Municipal Executive" of the earlier proposal) | Web |
| `SYSTEM_ADMINISTRATOR` | admin@agap.local | Platform administrator | Web |
| `ORG_ADMINISTRATOR` | orgadmin@mdrrmo… | Administrator of one organization (MDRRMO, BFP, hospital) | Web |
| `HOSPITAL_USER` | receiving@bocauehospital… | Receiving facility staff | Web (Hospital Portal) |
| `RESPONDER` | responder1–3 | Ambulance, rescue and fire crews | Mobile |
| `CITIZEN` | citizen@demo.agap | Registered resident | Mobile |
| `BYSTANDER` | — (guest path) | Anyone reporting without an account | Mobile |

**Decisions behind this table**
- **No separate Mayor role.** The Mayor does not sign in. The LGU Information Officer publishes on the Mayor's behalf with the existing `ANNOUNCEMENTS_PUBLISHER` role.
- **No separate Incident Commander role.** Incident Commander is an ICS position assigned per incident (`POST /incidents/:id/ics/assign-ic`, `ics_assignments`), not a login. The Supervisor dashboard carries the command views.
- **The Supervisor keeps dispatch authority.** MDRRMO runs small shifts; a Supervisor alone on a night shift must still be able to dispatch.

---

## 2. LGU Information Officer (Office of the Mayor)

**Role:** `ANNOUNCEMENTS_PUBLISHER`

### Purpose
Publish official municipal announcements on the Mayor's behalf, and give the Office of the Mayor a high-level picture of emergency conditions in Bocaue.

### Dashboard content
- **Header:** "Office of the Mayor — Municipal Overview". The user card shows the signed-in officer, not the Mayor.
- **Counts:** active incidents, critical incidents, incidents today, units deployed out of available. Each count shows change versus yesterday.
- **By barangay:** active incidents per barangay, as a list or a shaded barangay map. **No individual incident markers, unit positions, addresses or coordinates.**
- **By category:** active incidents per category.
- **7-day trend:** total and critical incidents per day.
- **Response performance:** average time to acknowledge, dispatch and arrive over 7 days, and the share resolved.
- **Latest announcements** and a **Create announcement** action.
- Never shown: names, phone numbers, addresses, coordinates, patient or medical data, an incident list.

### Announcements page content
- **Announcements:** create, edit, schedule, publish, archive, supersede.
- **Advisories filter:** flood, road closure, evacuation and other hazard notices (severity `WARNING` or `CRITICAL`). A filter, not a separate page.
- **Pending approval filter:** CRITICAL advisories waiting for MDRRMO approval, and any returned with a note (when approval is switched on).
- **Delivery status:** SMS and push counts per announcement.

### Publication History content
Author, approver, publication time, corrections and supersessions.

### Rules
- May compose and publish municipal announcements. Every publication records the author, the approver and the time (`announcements.publisher_id`, `approved_by_id`, `approved_at`, audit `PUBLISH`).
- **CRITICAL advisories need approval** by an MDRRMO Supervisor before release, once `ANNOUNCEMENT_APPROVAL_REQUIRED=true`. Routine announcements publish directly.
- Sees aggregated counts only. Never receives patient, reporter or medical details.
- Cannot dispatch, change incidents, see the incident queue, or manage accounts.
- Announcements are one-way broadcast (Rule 16). They are never a dispatch channel.

### Sidebar
Dashboard · Announcements · Publication History

---

## 3. Dispatcher

**Role:** `DISPATCHER`

### Purpose
Process incoming reports and coordinate the response. This is the primary real-time dashboard.

### Dashboard content
- **Operational summary:** unreviewed, critical, awaiting dispatch, active, and units available.
- **Incident queue:** new, unreviewed, awaiting dispatch, active and escalated incidents.
- **Live incident map:** incidents, responder locations and unit status, each with a last-updated time.
- **Incident details:** type, location, reporter information as authorized, patients, hazards, requirements.
- **Triage and validation:** confirm details, assess severity, flag duplicates, record decisions.
- **Recommended resources:** units matched to the incident's needs. Recommendations only.
- **Dispatch panel:** selected unit, crew, explicit authorization, dispatch status.
- **Response timeline:** acknowledged, assigned, en route, on scene, handover, closure.
- **Barangay coordination:** barangay alert status, callback logging, SMS replies.
- **Connectivity:** backend, real-time feed and data-freshness indicators.

### Rules
- Can acknowledge, assess, validate, mark duplicate or false alert, dispatch, reassign, cancel a dispatch, record resolution and close (`incidents.controller.ts`, `dispatch.controller.ts`).
- Must explicitly authorize every dispatch. Recommendations never dispatch on their own (Rule 8).
- Cannot assign a unit that is unavailable or already committed.
- Raises escalations; does not resolve them.
- Can close only when the closure workflow is complete (resolution recorded).
- Cannot change permissions, edit audit history or publish announcements.

### Sidebar
Dashboard · Incident Queue · Live Map · Triage · Dispatch · Fleet & Units · Hospitals & Facilities · Multi-Agency · Incident History

**Not in the sidebar:** a Reports link (`/analytics/*` does not allow Dispatchers; the per-incident report lives in the incident drawer). No Broadcast or Send SMS quick actions: Dispatchers do not publish announcements, and there is no free-form SMS endpoint.

---

## 4. Supervisor (Operations Supervisor and Incident Command)

**Role:** `SUPERVISOR`

### Purpose
Oversee dispatch activity and workload, handle escalations, and coordinate major and multi-agency incidents.

### Dashboard content — oversight
- **Operations summary:** active, critical, overdue (past SLA) and unresolved incidents.
- **Escalation queue:** open escalations to acknowledge and resolve.
- **Dispatcher workload:** open incidents and dispatches per dispatcher.
- **Incident exceptions:** long waits, rejected dispatches, stale responder locations.
- **Handover review:** handovers not yet acknowledged.
- **Performance:** time to acknowledge, dispatch and arrive; SLA compliance.
- **Activity feed:** important dispatch decisions and status changes (audit log).

### Command / ICS page — incident command content
The Incident Commander mockup is the content of this page, not a separate dashboard or login. Each section maps to data that already exists:

| Section | Source |
|---|---|
| Major incidents | Incidents with ICS activated (`incident_command_structures`), plus surge incidents (`surge_incidents`) |
| Command structure | Incident Commander and ICS positions (`ics_assignments`) |
| Command objectives | `incident_command_structures.objectives` |
| Situation reports | `incident_command_structures.situation_notes` |
| Agency coordination | Participating agencies per incident (`/incidents/:id/agencies`) — BFP, PNP, LGU and other `organization_type` values |
| Resource deployment and mutual aid | Fleet status and resource requests |
| Hospital and evacuation | Facilities, including `EVACUATION_CENTER` |
| Command log | Audit entries for the incident (`/audit/incidents/:id`) |

**Not built:** incident groups (no backend model; out of scope).

### Other places
- **Surge / mass-casualty mode:** the Surge Mode page.
- **Announcement approvals:** the Approvals page.
- **Handovers** are from one person to another (`incident_handovers.from_user_id` → `to_user_id`), never between agencies.

### Rules
- Has every Dispatcher action, including dispatch.
- Acknowledges and resolves escalations; activates ICS; assigns the Incident Commander; adds agencies; activates surge mode.
- Approves or returns CRITICAL advisories from the LGU Information Officer.
- Reassigns or hands over incidents only through audited actions.
- Cannot silently change or erase a dispatcher's recorded decision.
- Cannot manage accounts or system configuration.
- Gets only the medical information needed for the decision at hand.

### Sidebar
| Group | Links |
|---|---|
| Operations | Dashboard · Incident Queue · Live Map · Triage · Dispatch |
| Oversight | Escalations · Activity Log |
| Command | Command / ICS · Multi-Agency · Surge Mode |
| Resources | Fleet & Units · Hospitals & Facilities |
| Intelligence | Analytics · Risk Map |
| Broadcast | Approvals |
| Records | Incident History |

The oversight items in the mockup ("Dispatch Oversight", "Resource Coverage", "Performance Reports") are **Dashboard panels**, not links. "Active Incidents" is the Incident Queue.

---

## 5. System Administrator

**Role:** `SYSTEM_ADMINISTRATOR`

### Purpose
Keep AGAP healthy, secure and correctly configured. Supports operations but is **not** an emergency dispatcher.

### Dashboard content
- **System health:** API, database, Redis, background queues. Health lives on the Dashboard; there is no separate System Health link.
- **Counts:** users, active units, hospitals and facilities.
- **Recent users, recent administrative activity, security summary.**
- Not shown until a backend source exists: uptime percentage, API request volume, storage usage.

### Pages
- **Integrations:** Textbee SMS gateway, push notifications, map service.
- **Users and accounts:** create, activate, deactivate, unlock, reset MFA, temporary passwords, revoke sessions.
- **Roles and permissions.**
- **Organizations, resource registry, hospitals and facilities.**
- **Barangay directory.**
- **Security events:** failed logins, lockouts, password and MFA changes, revoked sessions, permission denials.
- **Audit viewer:** search the audit log; never edit it.
- **Configuration:** one page for all `system_configurations` keys (the mockup's "Incident Configuration" and "System Settings" are the same table).
- Role names shown anywhere are the real ones (Dispatcher, Supervisor, Announcements Publisher…), never "Incident Commander" or "Municipal Executive".

### Rules
- Manages accounts, configuration and reference registries.
- **Has no operational authority:** cannot change incident status, mark false alerts, cancel incidents, resolve escalations, or activate surge mode.
- May keep read-only visibility of incidents for support (decision in the plan, Phase 0).
- Platform administration does not grant access to medical profiles.
- Cannot alter or delete audit records. Sensitive changes are audited.

### Sidebar
Dashboard · Users & Accounts · Roles & Permissions · Organizations · Fleet & Units · Hospitals & Facilities · Barangay Directory · Integrations · Security Events · Audit Log · Configuration

**Not in the sidebar:** System Health (on the Dashboard), Reports or Analytics (operational data; separation of duties), operational pages.

---

## 6. Organization Administrator

**Role:** `ORG_ADMINISTRATOR`

### Purpose
Maintain one organization's own records: its members, response units, capabilities and settings.

### Dashboard content
- Organization profile and members.
- The organization's resources and capabilities.
- Resource and mutual-aid requests addressed to the organization (approve or deny).
- Barangay directory (MDRRMO organization).
- Hospital registry (hospital organization): register its own hospitals and set their location. Both wait for MDRRMO review before ambulance crews can select them. No referral access.

### Rules
- Works only within its own organization.
- No dispatch, triage, escalation or incident-status authority.
- No platform-wide accounts, roles or configuration.

### Sidebar
Dashboard · Organizations · Fleet & Units · Requests · Hospitals & Facilities · Barangay Directory

No mockup exists yet for this role.

---

## 7. Hospital User

**Role:** `HOSPITAL_USER` — unchanged.
Scoped to the Hospital Portal (`/hospitals`) and their own Account page. **No sidebar:** the portal is this role's only page, so the console shows it full-width (account security stays in the top bar). Views inbound referrals, acknowledges, marks arrival. Never sees other operations screens.

---

## 8. Permission matrix

"Yes" means within the role's scope.

| Capability | LGU Info Officer | Dispatcher | Supervisor | System Admin | Org Admin |
|---|---|---|---|---|---|
| Aggregated emergency overview | Yes | Yes | Yes | System health only | No |
| Incident queue and details | No | Yes | Yes | Read-only if decided (Phase 0) | No |
| Triage, validate, false alert | No | Yes | Yes | No | No |
| Authorize dispatch | No | Yes | Yes | No | No |
| Resolve escalations | No | Raise only | Yes | No | No |
| ICS, multi-agency, surge | No | Support | Yes | No | No |
| Publish announcements | Yes | No | No | Yes (platform support) | No |
| Approve CRITICAL advisories | No | No | Yes | No | No |
| Medical details | No | Minimum necessary | Minimum necessary | No | No |
| Manage accounts and roles | No | No | No | Yes | Own org members |
| System configuration | No | No | No | Yes | No |
| Audit history | Own publications | Per incident | Yes | Yes | No |

---

## 9. Shared rules for every web dashboard

1. **Server-side authorization.** Every endpoint checks role (and organization or ownership where relevant). The frontend only shapes navigation.
2. **No page a role cannot use.** A link is shown only if its data endpoints allow that role; a page opened by URL shows "not available for your role", never fake zeros or "All clear".
3. **Auditability.** Significant actions record who, what, when and outcome.
4. **Data minimization.** Each role sees only the personal, medical and operational data its duty needs.
5. **Honest real-time status.** Show last-updated times and stale or offline states. Never present an old location as live.
6. **Human authorization.** Recommendations assist; people decide (Rule 8).
7. **Controlled transitions.** Incident status follows the lifecycle; closure needs completion data.
8. **Separation of duties.** Administrative access never grants dispatch authority.
