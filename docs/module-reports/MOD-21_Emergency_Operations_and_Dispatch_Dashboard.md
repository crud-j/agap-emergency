# MOD-21 — Emergency Operations and Dispatch Dashboard

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-21 |
| Version | 1.0 |
| Module Name | Emergency Operations and Dispatch Dashboard |
| Module Cluster | Cluster D — Alert Processing and Dispatch |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Gives the signed-in dispatcher one home screen: live KPI counts (active, unreviewed, critical, en route/on scene, resolved in the last 24 hours, and unit availability), a connection-state indicator, surge-mode/critical-announcement banners, four "Next actions" links (Review new reports, Assign units, Open live map, View all incidents), and the 8 most recently reported incidents. Supervisors, system administrators, the municipal/publisher account and org administrators each land on their own separate dashboard from the same route.

**Purpose**
Let a dispatcher coming on shift see the state of the whole operation at a glance and jump straight to wherever action is needed, instead of opening each screen separately to find out.

**Tasks Performed**
1. Pulls aggregate counts from a single dedicated backend endpoint (`GET /analytics/dispatch-summary`) rather than counting whatever page of incidents happens to be loaded.
2. Shows a connection-state indicator reflecting the live Socket.io connection.
3. Surfaces surge-mode and critical municipal-announcement banners when active.
4. Lists the 8 most recently reported incidents with category, priority, status, barangay/address and time-ago.
5. Links each KPI card and the "View all" action to the matching operations screen (Incident Queue, Triage, Dispatch, Map, History, Fleet).
6. Shows a retry strip if either the summary or the recent-incidents query fails, without hiding the rest of the dashboard.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Whatever the dispatcher remembers from the last radio call or handwritten log | Dispatch-summary counts (active, unreviewed, critical, en route, on scene, resolved in 24h, units available/deployed/unavailable) |
| 2 | Personal mental tally of how many units are currently out | The 8 most recently reported incidents (reference, category, priority, status, barangay, submitted time) |
| 3 | | Live Socket.io connection state |
| 4 | | Active surge-mode / critical-announcement banner state |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Telephone / radio and a personal mental tally of what's happening | `frontend/components/dashboard/OpsDashboard.tsx` + Next.js route `app/(ops)/dashboard` |
| 2 | Handwritten logbook consulted from memory | TanStack Query hooks (`useDispatchSummary`, `useIncidents`) against the NestJS analytics/incidents REST API |
| 3 | | Socket.io connection-state hook (`useWsState`) feeding the connection indicator |
| 4 | | PostgreSQL-backed `dispatch-summary` aggregate query as the single source of the KPI counts |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The dispatcher relies on memory, a logbook, or the last radio call to judge how busy the shift is. |
| 2 | To find out how many units are out or how many incidents are unresolved, they ask around or flip through the handwritten log. |
| 3 | There is no single place to see the whole operation at a glance. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A mental or handwritten impression of current operational load, not a verifiable count |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A signed-in dispatcher opens Home/Dashboard. | User Action |
| 2 | The backend computes the dispatch-summary aggregate (active/unreviewed/critical counts, en-route/on-scene counts, 24h resolved vs previous 24h, unit availability) directly from PostgreSQL. | Database |
| 3 | The dashboard renders the KPI grid from that result, each card linking to its matching operations screen. | Processing |
| 4 | In parallel, the 8 most recent incidents are fetched and listed, each row linking into the Incident Queue focused on that incident. | Processing |
| 5 | Surge-mode and critical-announcement banners are shown if active. | Processing |
| 6 | The connection indicator reflects the live Socket.io state so the dispatcher can tell if the dashboard might be stale. | Processing |
| 7 | If either query fails, a retry strip appears without blocking the rest of the dashboard from rendering. | Validation |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | KPI grid of live operational counts, each linking to its source screen |
| 2 | List of the 8 most recent incidents with a "View all" link |
| 3 | Visible connection-state indicator |
| 4 | Retry affordance on a failed data load |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Sign in as a dispatcher and confirm the KPI grid, recent-incidents list and connection indicator all render.
2. Submit a new SOS from the phone and confirm the Active/Critical counts and the recent-incidents list update without a manual refresh.
3. Click each KPI card and confirm it opens the matching operations screen.
4. Stop the backend briefly and confirm the retry strip appears instead of a silent blank dashboard.

**Do not claim:**
- An incident-creation form, a broadcast/announcement composer, or an SMS-send action on this dashboard — the Next actions link only to the existing Triage, Dispatch, Map and Incident Queue screens.
- This as the Supervisor's dashboard — the Supervisor, System Administrator, Publisher and Org Administrator roles each render a separate dashboard component from the same route.
