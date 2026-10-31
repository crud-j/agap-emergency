# MOD-23 — Incident Command Queue

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-23 |
| Version | 1.0 |
| Module Name | Incident Command Queue |
| Module Cluster | Cluster D — Alert Processing and Dispatch |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
The Operations Center's filterable, sortable table of every incident — Active, Archive (resolved, closed, cancelled, duplicate, false-alert, unable-to-respond, referred) or All — that updates live as new reports arrive or statuses change, without a page refresh.

**Purpose**
Let a dispatcher work from one list instead of hunting through separate screens, filter down to what matters right now, and jump straight into any incident's detail.

**Tasks Performed**
1. Lists incidents in three views: Active (open statuses), Archive (resolved/closed/cancelled/duplicate/false-alert/unable-to-respond/referred), and All.
2. Filters by free-text search (reference, barangay, category), status, category, priority, and barangay.
3. Sorts by newest, oldest, or priority.
4. Paginates at 100 rows per page.
5. Opens the shared incident-detail drawer on row click, or directly via a `?id=` deep link (used by the notification bell).
6. Keeps the list live: new incidents and status changes from the real-time event engine (MOD-20) appear with no manual refresh.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Paper logbook / spreadsheet entries the operator searches by hand | The incident list (`GET /incidents`, paginated) and each incident's category/priority/status/barangay/submitted time |
| 2 | Operator's memory of which incidents are still open | The dispatcher's chosen view (Active/Archive/All), search text, status/category/priority/barangay filters, and sort order |
| 3 | | Live `incident.created` / `incident.updated` / `incident.status_changed` events from MOD-20 |
| 4 | | An optional `?id=` incident ID from an inbound link (e.g. a notification) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Paper logbook / spreadsheet and manual lookup | `frontend/app/(ops)/operations/incidents/page.tsx` + shared `DataTable`, `PriorityBadge`, `StatusChip` UI components |
| 2 | | TanStack Query (`useIncidents`) against the NestJS incidents REST API, with its cache kept live by the Socket.io provider |
| 3 | | `IncidentDetailDrawer` (shared with the Map screen) for the row-click detail view |
| 4 | | `ConnectionIndicator` reflecting the live WebSocket state |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | The operator searches the paper logbook or spreadsheet by hand for a given reference, barangay or date. |
| 2 | There is no live indicator of which incidents are still active versus resolved beyond what was last written down. |
| 3 | A new report doesn't appear anywhere until someone manually logs it. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | A manually searched paper or spreadsheet record, not a live or filterable view |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A dispatcher opens Operations → Incidents. | User Action |
| 2 | The backend returns the first page of incidents for the selected view (Active/Archive/All), ordered by submission time. | Database |
| 3 | The dispatcher narrows the list with search text and the status/category/priority/barangay filters, and picks a sort order. | User Action |
| 4 | The table re-renders client-side against the already-fetched page as filters/sort change. | Processing |
| 5 | A new incident, or a status change to one already shown, arrives over Socket.io and the list updates with no manual refresh. | Notification |
| 6 | Rows show a badge with the latest fire report status (for example "Under control") and the number of people rescued so far, when field crews have reported them (MOD-32). | Processing |
| 7 | Clicking a row — or opening the page with `?id=<incidentId>` — opens the shared incident-detail drawer for that incident, which includes the Fire card, the Rescue card and any crew help requests. | User Action |
| 8 | Past the first 100 rows, the dispatcher pages forward/back; each page is fetched from the backend. | Processing |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Filtered, sorted, paginated incident list reflecting the chosen view |
| 2 | Live-updating list with no manual refresh on new or changed incidents |
| 3 | Incident-detail drawer opened from a row or a deep link |
| 4 | Fire-status and people-rescued badges on the rows |

---

## Owner notes (not part of the report)

**Test before signing:**
1. Open Operations → Incidents, switch between Active/Archive/All, and confirm the row counts match.
2. Apply a status, category, priority and barangay filter together and confirm the list narrows correctly.
3. Submit a new SOS from the phone and confirm it appears in the Active view with no manual refresh.
4. Open the page with `?id=<an incident id>` and confirm the drawer opens directly to that incident.

**Do not claim:**
- A per-row "assigned to" / ownership column, an acknowledgement-status column, or workload/SLA-escalation flags inside this table — those live in the separate Escalations view (MOD-41) and the per-incident drawer, not as queue columns.
- Server-side filtering, sorting or search — they run client-side against the already-fetched page of incidents.
