# Handoff: Analytics CSV export, SLA targets as one source, next = AI summary on Analytics

**Date:** 2026-11-14 (second session that day)
**For:** the next agent, starting cold. This is the current handoff; read it first.
**First task:** ask the user how the **browser checks** went (section "Waiting on the user"). Then ask whether to start the **AI summary on Analytics** (section "Next") or another backlog item. Don't start one on your own.
**Earlier handoffs:** [`2026-11-14_live-dispatch-fleet-unit-status.md`](./2026-11-14_live-dispatch-fleet-unit-status.md) (its fleet work is now committed in `a9a927a`) and [`2026-11-13_gap-audit-medical-type-dispatch-recall-crew-medical.md`](./2026-11-13_gap-audit-medical-type-dispatch-recall-crew-medical.md). The 2026-11-13 "How the user works", backlog and open medical-access decision still hold.

---

## Where things stand

| Item | Status | Commit |
|---|---|---|
| Analytics CSV export (summary + incident list), audited | DONE, tested, not checked in a browser | `7697bdb` |
| CSV readability (report layout, plain-English labels, minutes, Manila time) | DONE, tested | `c862d7f` |
| SLA targets: `sla_policies` as the only source (alarm, analytics, console) | DONE, tested, **not run against live Redis or a browser** | `c862d7f` |
| Response Targets page (`/operations/sla-targets`) | DONE, tested, not checked in a browser | `c862d7f` |
| AI summary on Analytics | **Designed only** (see "Next") | — |

## Git

- Working tree clean after `c862d7f`, except this handoff file.
- The user commits on `main` only when asked. **They run Git Bash (MINGW64)**: give commit commands as `git commit -F - <<'EOF' … EOF`.
- `frontend/tsconfig.tsbuildinfo` is touched by `tsc`; restore it with `git checkout -- frontend/tsconfig.tsbuildinfo` after typechecks.

## Waiting on the user

1. **SLA alarm (web + live backend):** steps 1–5 in the [MOD-41 report](../module-reports/MOD-41_Dispatcher_SLA_and_Escalation_Engine.md) ("Test before signing"). Key one: acknowledge a Low test incident at once but don't dispatch it. An L2 Dispatch escalation must still appear (it never did before). Put the targets back afterwards.
2. **Analytics:** download both CSVs for 7/30/90 days; totals in the summary should match the tiles. Check the `DATA_EXPORT` rows in the Activity Log. Expect compliance % to drop compared with before: overdue incidents now count as missed.
3. Still unreported from earlier handoffs: Live Dispatch and Fleet browser checks (2026-11-14), device checks (2026-11-13).
4. **Two defaults I chose without an explicit yes** (the user said "implement fix first"): an incident **still waiting past a target counts as missed**, and **on-scene compliance is reported**. Mention them; change only if the user objects.

## What this session changed

### Analytics CSV export (MOD-50)
- `GET /api/v1/analytics/export?dataset=summary|incidents&from&to`, Supervisor + System Administrator (same as the page data). Code: [`analytics/export/`](../../backend/src/analytics/export/).
- **Summary** = a readable report: title block, then sections (Overview, Response Targets, by Category, by Status, Average Response Times, Unit Deployments), blank rows between, "No data" never 0. **Incident list** = one flat table, plain-English headings, Manila time `YYYY-MM-DD HH:mm`, minutes, target results `Met / Missed / Missed (overdue) / Not yet due / Not <step>`.
- No names, phones, addresses, coordinates, descriptions or medical data in either file; barangay is the finest location.
- Every export writes `DATA_EXPORT` to the audit log **fail-closed** (no audit row → no file). Max 366 days; > 50,000 incidents → 400 "Choose a shorter period" (never truncated). RFC 4180, formula-injection guard, UTF-8 BOM.
- Files: `AGAP-Analytics-Summary_<from>_to_<to>.csv`, `AGAP-Incident-List_…csv` (server and [`features/analytics/export.ts`](../../frontend/features/analytics/export.ts) build the same name).
- `api.blob` in [`lib/api.ts`](../../frontend/lib/api.ts) now surfaces the server's error message for every download.

### SLA single source (MOD-41, also MOD-24/50)
**Found:** three disagreeing copies. Analytics read `sla_policies`; the alarm read `DEFAULT_SLA_*` env vars that were never set (120/300/300 s for every priority), chained the dispatch check **only after a late acknowledgement**, and timed it from the breach. The web had a hard-coded copy in `lib/sla.ts` used only by a component no page rendered.

**Now:**
- [`backend/src/sla-policies/`](../../backend/src/sla-policies/): `sla-rules.ts` (policy pick, steps, deadlines, fallback 120/300/900 s), `SlaPoliciesService` (list, resolve, audited update), `SlaScheduleService`, `GET` (Dispatcher, Supervisor, SysAdmin) and `PATCH /api/v1/sla-policies/:id` (Supervisor, SysAdmin). Depends only on Prisma, Audit and the SLA queue, so any module can import it.
- [`sla-monitor.processor.ts`](../../backend/src/jobs/processors/sla-monitor.processor.ts): acknowledge, dispatch and on-scene checks all scheduled at submission (`OpsAlertService`), from `submitted_at`. Each check re-reads incident and policy; re-queues if the target got longer; **one escalation per incident and step** (deduped by `triggered_reason` prefix `SLA breach: <TYPE>`); sets `sla_policy_id`. Logic is in `check(data, jobId, now)` because BullMQ passes a lock token as `process()`'s 2nd argument.
- Rescheduled when `DispatchService.submitTriage` changes the priority (the only place priority changes after submission; category never changes) and, for all open incidents, after a target edit.
- Target edits: 30 s–24 h, acknowledge ≤ dispatch ≤ on scene, audited fail-closed (`UPDATE`, `sla_policy`, MOD-41).
- Analytics `getSlaCompliance(range, now)`: per step met / reached / overdue; base = reached + overdue; on-scene added. Waiting-status lists come from `sla-rules.ts` so alarm and report agree. Analytics card has 3 gauges and "X of Y (N still waiting)".
- Web: [Response Targets page](../../frontend/app/(ops)/operations/sla-targets/page.tsx), sidebar (Supervisor: Oversight; SysAdmin: Administration), breadcrumb, icon. Deleted `lib/sla.ts`, `__tests__/sla.spec.ts`, `components/dispatch/IncidentQueue.tsx`.
- No schema change; `Escalation.sla_policy_id` and `audit_action.DATA_EXPORT` already existed.

## Verification (last run)

- `tsc --noEmit`: shared, backend, frontend, mobile all clean.
- Backend suites run: sla-policies, analytics, emergency-alerts, dispatch, jobs, incidents, escalations, oversight, responders → 38 suites, 622 tests pass. **No full backend run.**
- Frontend `npx jest`: 22 suites, 216 tests.
- **Nothing run against live Redis/Postgres or in a browser.**

## Known gaps left

1. **Dedupe by text prefix.** One-escalation-per-step relies on `triggered_reason` starting with `SLA breach: <TYPE>`. Changing that wording breaks dedupe. A proper `escalation_type` column needs a migration; not done.
2. **Only the 4 seeded per-priority policies can be edited.** No UI to add a category-specific policy or switch one off (the API and pick logic already support both).
3. **No live SLA countdown on Live Dispatch** (the only one was dead code and is deleted). Dispatchers can read `GET /sla-policies` if the user wants one.
4. `escalation.processor.ts` + `ESCALATION` queue are still dead (gap-audit item 3).
5. The alarm treats a step as reached by timestamp **or** later status; analytics by timestamp only. Differs only if a status moves on without its timestamp.
6. CSV export has no step-up (recent sign-in) requirement; it's audited only.
7. **Stale docs:** CLAUDE.md's REST route list lacks `/api/v1/sla-policies` and `/analytics/export`. Old plan docs mention `DEFAULT_SLA_*` (historical, leave them).

## Next (ask the user which)

### A. AI summary on Analytics (the user's next interest; designed, not built)
Agreed shape, from the session's discussion:
- **Reuse what exists:** `ai_suggestion_kind.ANALYTICS_NARRATIVE` (unused so far), `ai_suggestions` with `subject_type`/`subject_id` (no incident), the Gemini client, flag and daily cap in [`ai-assist/`](../../backend/src/ai-assist/). Roadmap spec: [§6.6](../AGAP_Automation_and_LLM_Modernization_Roadmap.md) (`headline`, 2–6 `points`, ≤3 `watchItems`). No migration.
- **First build = 1 + 2 together:** a summary of the selected range **and** "what changed", where **code** finds the changes (vs the previous equal period, SLA below target, category/barangay jumps) and the AI only words them.
- **Rules:** send aggregates only (never incident rows or the incident-list CSV); every number in the output must appear in the input, else store `FAILED`; suppress claims on < ~5 incidents; no ranking of named dispatchers/responders; labelled "AI summary", Supervisor accepts/dismisses (`PENDING_REVIEW`/`ACCEPTED`/`DISMISSED`); the page and exports work unchanged when AI is off or failing; it never recommends operations as a decision (rule 8).
- Later candidates: bottleneck by step × barangay × hour; Filipino/English meeting draft; question answering only over a fixed list of approved queries (never model-written SQL).

### B. Backlog from the 2026-11-13 gap audit
Item 4 (same SLA timers for every priority) is **done**. Remaining, in order: phone-side SMS fallback, announcement SMS ignoring barangay, dead code to wire or delete, then lower-value items.
