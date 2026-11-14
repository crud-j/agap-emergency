# Handoff: AI summary on the Analytics page (MOD-50)

**Date:** 2026-11-14 (fifth session that day)
**For:** the next agent, starting cold. This is the current handoff; read it first.
**First task:** ask the user how the **browser check** went (section "Waiting on the user"). Don't start new work on your own.
**Earlier handoffs:**
- [`2026-11-14_citizen-sms-fallback.md`](./2026-11-14_citizen-sms-fallback.md): its device checks and the "Fourth session" fixes (committed `20d7e1a`) are still unreported on a device.
- [`2026-11-14_analytics-csv-export-sla-single-source.md`](./2026-11-14_analytics-csv-export-sla-single-source.md): its browser checks are still unreported.

Approved plan: `C:\Users\githu\.claude\plans\compressed-crafting-forest.md`.

---

## Where things stand

| Item | Status |
|---|---|
| AI summary: backend facts, AI call, number check, routes, audit | DONE, tested, **uncommitted** |
| AI summary: card on the Analytics page | DONE, typechecked, helpers tested, **not checked in a browser** |
| A real Gemini call | **Not run** (every test mocks Gemini) |

**User decisions (2026-11-14):**
- a **button**, not an automatic weekly summary;
- **Supervisors only**. The LGU account could later see accepted summaries; not built.

## Git

- `20d7e1a fix: contact opt-out, barangay-targeted announcements, …` is on `main`.
- **Uncommitted:** everything below and this file. Suggested command (Git Bash):

```bash
git add -A && git commit -F - <<'EOF'
feat(analytics): AI summary of the selected period, Supervisor only (MOD-50)

- analytics: barangay, priority and response-interval counts per range; facts
  and changes vs the previous period computed in code (narrative/)
- ai-assist: ANALYTICS_NARRATIVE prompt, number check (every figure must be in
  the input, no ratio words), generate/reuse/supersede, accept/dismiss audited
- routes GET/POST /analytics/ai-summary, :id/accept, :id/dismiss (Supervisor,
  generate rate-limited); generic dismiss refuses analytics summaries
- AiClientService.structured takes per-call maxOutputTokens/timeoutMs
- web: AI summary card on Analytics (hidden when AI is off), copy text
- docs: MOD-50 report, AI_ASSIST_PLAN data note, CLAUDE.md route, handoff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

## Waiting on the user

**Browser check:** see step 3 in the [MOD-50 report](../module-reports/MOD-50_Emergency_Response_Analytics.md) "Test before signing".
- **AI off:** the page looks unchanged.
- **AI on**, demo data only, because the Gemini key is free tier (AI_ASSIST_PLAN Phase 0): generate, check the numbers, regenerate (same summary), accept (Activity Log CREATE + UPDATE), try a range with too few incidents, then try the route as a Dispatcher (403).

**Worth watching on the first real call:**
- whether Gemini keeps to the numbers; if not, the card says "figure that isn't in AGAP's totals";
- whether it finishes within 20 s.

## How it works

1. **Facts (no AI)**, in [`backend/src/analytics/narrative/`](../../backend/src/analytics/narrative/):
   - `AnalyticsFactsService.collect(range)` runs, for the period and the previous period of the same length:
     - the page's existing queries: volume, SLA compliance, false alerts;
     - three new ones in `AnalyticsService`: `getBarangayCounts`, `getPriorityCounts`, `getResponseIntervals` (average and n per step).
   - `analytics-facts.ts` (pure):
     - `buildFacts`;
     - `findChanges`: the rules, `MIN_SAMPLE = 5`:
       - category/barangay ±3 and ×1.5;
       - target < 90% or down 10 points;
       - overdue > 0;
       - averages ±20% and ≥ 1 min;
       - false-alert rate ±5 points;
     - `factsToPromptText` (stable text; its hash identifies a repeat).
2. **AI**, in [`backend/src/ai-assist/analytics-narrative/`](../../backend/src/ai-assist/analytics-narrative/):
   - `AnalyticsNarrativeService.generate`:
     - AI off → `DISABLED`;
     - fewer than 5 incidents → `TOO_FEW` (no call, no row);
     - same `input_hash` open within 24 h → `REUSED`;
     - otherwise `structured('ANALYTICS_NARRATIVE', …, { maxOutputTokens: 1024, timeoutMs: 20_000 })`, then `checkNarrative`: every number in the text must be in the input, and ratio words fail. A failed check is `FAILED` / `UNVERIFIED_NUMBER`.
   - **Storage:**
     - one `ai_suggestions` row per call: `subject_type = 'analytics_period'`, no subject_id, `requested_by_id`;
     - `output = { headline, points, watchItems, period, facts }`;
     - the row and an audit `CREATE` (MOD-50) are written in one transaction;
     - a new good summary supersedes unreviewed ones of the same period length.
   - `accept` / `dismiss`: Supervisor only, audited `UPDATE` in the same transaction. Dismiss also withdraws an accepted one.
   - [`analytics-summary.controller.ts`](../../backend/src/ai-assist/analytics-narrative/analytics-summary.controller.ts):
     - `GET` / `POST /api/v1/analytics/ai-summary?from&to` (max 366 days);
     - `POST /:id/accept`, `POST /:id/dismiss`;
     - Supervisor only; generate is throttled to 3/min and 20/h.
   - The generic `POST /ai-suggestions/:id/dismiss` (also open to Dispatchers) now refuses `ANALYTICS_NARRATIVE`.
   - `AiClientService.structured` takes `opts { maxOutputTokens, timeoutMs }`; the defaults (512, `AI_ASSIST_TIMEOUT_MS`) are unchanged.
   - `AiErrorCode` gained `UNVERIFIED_NUMBER`.
3. **Web:**
   - [`AiSummaryCard`](../../frontend/components/analytics/AiSummaryCard.tsx) sits under the KPI tiles and is hidden when `enabled: false`.
   - It has a generate button, "too few" and failure messages, then headline, points, "Worth a look", period and time, Accept, Copy text, Dismiss and Regenerate.
   - Helpers in [`features/analytics/ai-summary.ts`](../../frontend/features/analytics/ai-summary.ts); hooks `useAiSummary`, `useGenerateAiSummary`, `useReviewAiSummary`.
   - `parseRange` moved to `backend/src/analytics/analytics-range.ts` (`parseAnalyticsRange`).

No migration, and no new environment variable.

## Verification (last run)

- `tsc --noEmit`: shared, backend, frontend and mobile are clean.
- Backend full run: **134/134 suites, 2331 tests**. Frontend: 23 suites, 228 tests. Mobile: 21 suites, 266 tests.
- **New tests:**
  - `test/analytics/analytics-facts.spec.ts`;
  - `test/ai-assist/narrative-check.spec.ts`;
  - `test/ai-assist/analytics-narrative.spec.ts`;
  - additions to `ai-client.spec.ts` and `ai-suggestions.spec.ts`;
  - `frontend/__tests__/ai-summary.spec.ts`.
- **Not run:** a real Gemini call; the card in a browser.

## Known gaps

1. **English only.** A Filipino meeting draft is a later candidate.
2. **Spelled-out numbers** ("three") are not checked; the prompt asks for digits. Ratio words are blocked.
3. **"Half"** in any sense fails the check (for example "first half of the month"); the user just regenerates.
4. A summary shows for 24 h for **the same period length**. A summary written at 08:00 still shows at 15:00, with its own period label and time.
5. **Two Supervisors clicking at the same moment** can make two calls; the rate limit and the daily cap bound it.
6. **Later candidates** (from the analytics handoff):
   - bottlenecks by step × barangay × hour;
   - answering questions only from a fixed list of approved queries;
   - LGU access to accepted summaries;
   - a weekly automatic run.
