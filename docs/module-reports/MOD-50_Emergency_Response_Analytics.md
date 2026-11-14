# MOD-50 — Emergency Response Analytics

Content for the [Individual Module Report template](../M_5.pdf). Each section below matches a section of the template, and the row counts fit its tables.

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
Turns every timestamp the rest of AGAP generates into metrics MDRRMO can actually use — incident volume, response times, acknowledge and dispatch SLA compliance, and the false-alert rate, filterable by 7, 30, or 90 days.

**Purpose**
Accountability and continuous improvement — showing, with numbers, whether the office is actually getting faster and better, not just busier.

**Tasks Performed**
1. Aggregates incident volume (by category and status) and response times for a chosen date range.
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
| 1 | Staff memory and manual logbook review to estimate performance | `backend/src/analytics/analytics.service.ts` |
| 2 | No structured, queryable incident history | Operations Center Analytics page, `frontend/app/(ops)/analytics` |
| 3 | No defined SLA policy to measure against | PostgreSQL queries over incident lifecycle timestamps already written by other modules as a side effect of their own work |
| 4 | — | Authenticated, role-checked NestJS services computing volume, response-time, SLA-compliance and false-alert-rate figures (Supervisor and System Administrator) |

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
| 1 | A Supervisor opens the Analytics page (only Supervisors see it) and selects a 7/30/90-day window. | User Action |
| 2 | The analytics service reads incident lifecycle timestamps already sitting in PostgreSQL. | Processing |
| 3 | It aggregates incident volume by category and by status, and response times, for that window. | Processing |
| 4 | It measures acknowledge and dispatch SLA compliance against the active SLA policy's thresholds. | Validation |
| 5 | It computes the false-alert rate for the same window. | Processing |
| 6 | The charts render; an empty date range shows "No data" rather than a misleading zero percent. | Database |

**TO-BE Outputs**

| No. | Output Produced by the Proposed Process |
|---|---|
| 1 | Incident-volume (by category and status) and response-time charts for the selected window |
| 2 | Acknowledge SLA and Dispatch SLA compliance figures measured against the active policy |
| 3 | A false-alert rate, or an honest "No data" state for an empty range |

---

## Owner notes (not part of the report)

**Test before signing:**
1. On the Analytics page, switch the range between 7/30/90 days and confirm the charts update.
2. Run a test incident through the full demo flow and confirm it's reflected in the volume count if recent enough; pick an empty range and confirm it shows "No data" rather than 0%.
3. **AI summary (added 2026-11-14):**
   1. With `AI_ASSIST_ENABLED=false`, the page looks exactly as before (no AI card).
   2. With AI on, using demo data only while the Gemini key is free tier, click **Generate AI summary** for 30 days. Check every number in it against the tiles and charts.
   3. Click **Regenerate** at once: the same summary comes back without a new AI call.
   4. Click **Accept**: "Reviewed" appears, and the Activity Log shows a CREATE and an UPDATE on `ai_suggestion`.
   5. Choose a range with fewer than 5 incidents: the card says it is too few.
   6. As a Dispatcher, `GET /api/v1/analytics/ai-summary` returns 403.

**AI summary (2026-11-14), Supervisor only:**
- A **Generate AI summary** button writes a short summary of the selected period: a headline, 2 to 6 points and up to 3 "worth a look" items.
- **AGAP's code computes every figure and every change** against the previous period of the same length:
  - category and barangay jumps;
  - response targets below 90% or 10 points down;
  - incidents still waiting past a target;
  - average times 20% slower or faster;
  - false-alert rate.
- Gemini only words them.
- **Only totals are sent:** counts by category, priority and barangay, target results, average minutes and false alerts. No incident rows, names, phone numbers, coordinates, descriptions or medical data.
- **Every number** in the AI text must appear in what was sent. Otherwise the summary is discarded (`UNVERIFIED_NUMBER`).
- **No summary below 5 incidents.**
- **Review:** the Supervisor accepts ("reviewed, fit for reports") or dismisses it. Both are audited, and it changes nothing else.
- **Code:**
  - `backend/src/analytics/narrative/` (facts);
  - `backend/src/ai-assist/analytics-narrative/` (AI, routes `/api/v1/analytics/ai-summary`);
  - `frontend/components/analytics/AiSummaryCard.tsx`.

**Do not claim:**
- That the AI summary explains causes or recommends actions. It only words the figures AGAP computed, and a person reviews it.
- Predictive or causal analytics — this module reports what happened, it does not forecast or diagnose why.
- A false-alert rate counted per distinct incident — it counts false-alert records.
