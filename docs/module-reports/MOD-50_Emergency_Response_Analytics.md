# MOD-50 — Emergency Response Analytics

Content for the [Individual Module Report template](../AGAP_Individual_Module_Report_Template.pdf). Each section below matches a section of the template, and the row counts fit its tables.

---

## 1. Module Identification

| Field | Value |
|---|---|
| Module ID | MOD-50 |
| Version | 1.0 |
| Module Name | Emergency Response Analytics |
| Module Cluster | Cluster I — Analytics, Intelligence, and Surge |
| Student No. / Course / Group No. / Group Leader / Instructor / Dates | *(fill in)* |

---

## 2. Module Description

**Description**
Turns every timestamp the rest of AGAP generates into metrics MDRRMO can actually use — incident volume, response times, dispatch performance, SLA compliance, and the false-alert rate, filterable by 7, 30, or 90 days.

**Purpose**
Accountability and continuous improvement — showing, with numbers, whether the office is actually getting faster and better, not just busier.

**Tasks Performed**
1. Aggregates incident volume, response-time distribution, and dispatch performance for a chosen date range.
2. Measures SLA compliance against the active SLA policy (default 120s to acknowledge, 300s to dispatch).
3. Computes a false-alert rate for the same date range.
4. Shows "No data" for an empty range instead of a misleading zero percent.
5. Lets the user switch the window between 7, 30, and 90 days and see the charts update.

---

## 3. Input

| No. | AS-IS Input (Existing Process) | TO-BE Input (Proposed Automated Process) |
|---|---|---|
| 1 | Staff memory, or flipping back through logbooks, to estimate "how are we doing" | The incident lifecycle timestamps already captured by other modules (submitted, received, acknowledged, dispatched, resolved, closed) |
| 2 | No reliable way to say how many incidents happened last month | A selected date-range filter (7/30/90 days) |
| 3 | No structured, queryable record of whether SLA targets were met | The active SLA policy's thresholds (default 120s acknowledge, 300s dispatch) |

---

## 4. Technology Used

| No. | AS-IS Technologies / Resources | TO-BE Technologies, Tools, and Components |
|---|---|---|
| 1 | Staff memory and manual logbook review to estimate performance | `backend/src/analytics/analytics.service.ts` (confirmed ~438 lines of real aggregation logic) |
| 2 | No structured, queryable incident history | Operations Center Analytics page, `frontend/app/(ops)/analytics` |
| 3 | No defined SLA policy to measure against | PostgreSQL queries over incident lifecycle timestamps already written by other modules as a side effect of their own work |
| 4 | — | Authenticated, role-checked NestJS services computing volume, response-time, dispatch-performance, SLA-compliance, and false-alert-rate charts |

---

## 5. Process Documentation

### 5.1 AS-IS Process (Existing Process)

| Step | Process Description |
|---|---|
| 1 | Any sense of "how are we doing" comes from memory or flipping back through logbooks. |
| 2 | There's no reliable way to say how many incidents happened last month. |
| 3 | There's no way to say how long it typically took to acknowledge a report, or whether SLA targets were met. |
| 4 | Nothing was captured in a structured, queryable form to begin with. |

**AS-IS Outputs**

| No. | Output Produced by the Existing Process |
|---|---|
| 1 | An impression, not a number, of how the office is performing |
| 2 | No basis for comparing one period against another |

### 5.2 TO-BE Process (Proposed Automated Process)

| Step | Process Description | Step Type |
|---|---|---|
| 1 | A supervisor or dispatcher opens the Analytics page and selects a 7/30/90-day window. | User Action |
| 2 | The analytics service reads incident lifecycle timestamps already sitting in PostgreSQL. | Processing |
| 3 | It aggregates incident volume, response-time distribution, and dispatch performance for that window. | Processing |
| 4 | It measures SLA compliance against the active SLA policy's thresholds. | Validation |
| 5 | It computes the false-alert rate for the same window. | Processing |
| 6 | The charts render; an empty date range shows "No data" rather than a misleading zero percent. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Incident-volume, response-time, and dispatch-performance charts for the selected window |
| 2 | An SLA-compliance figure measured against the active policy |
| 3 | A false-alert rate, or an honest "No data" state for an empty range |

---

## Owner notes (not part of the report)

**Test before signing:**
1. On the Analytics page, switch the range between 7/30/90 days and confirm the charts update.
2. Run a test incident through the full demo flow and confirm it's reflected in the volume count if recent enough; pick an empty range and confirm it shows "No data" rather than 0%.

**Do not claim:**
- Predictive or causal analytics — this module reports what happened, it does not forecast or diagnose why.
- A false-alert rate counted per distinct incident — it counts false-alert records.
