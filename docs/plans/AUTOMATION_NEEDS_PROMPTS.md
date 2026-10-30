# AGAP — List C Automation: Execution Prompts

**Companion to:** [AUTOMATION_NEEDS_PLAN.md](AUTOMATION_NEEDS_PLAN.md) (the "plan")
**Prepared:** 2026-10-30 · **Baseline:** `main` @ `6a7635b` + uncommitted working tree

---

## How to use this file

1. Run **one prompt per fresh session**, in the order below. Don't paste two prompts into one session.
2. Copy everything inside the prompt's fenced block and send it as one message. Each prompt tells the agent to read [§0](#0-execution-protocol-every-prompt-follows-this) first, so you don't need to paste §0.
3. The agent stops at the **STOP** line and reports back. Read the report, then run **Prompt R** for that phase in another fresh session before moving on.
4. **If a session dies halfway**, start a new session with the **same** prompt. §0 step A makes the agent find what already exists and finish it instead of creating it again.
5. `/automation-plan <n>` runs the same protocol. Use either the skill or these prompts, not both for the same phase.

| Order | Prompt | Plan phase | Gate before starting |
|---|---|---|---|
| 1 | Prompt 1: Notifications (C1, C3) | 1 | none |
| 2 | Prompt R (Phase 1) | — | Prompt 1 reported |
| 3 | Prompt 2: Detection jobs (C2, C7) | 2 | Phase 1 reviewed |
| 4 | Prompt R (Phase 2) | — | Prompt 2 reported |
| 5 | Prompt 3: AI + barangay replies (C4) | 3 | Phase 2 reviewed. Model (`gemini-3.8-flash`) and tier (free) answered 2026-10-30; have the fixtures review ready |
| 6 | Prompt R (Phase 3) | — | Prompt 3 reported |
| 7 | Prompt 4: Fleet and hospitals (C5, C6, C8) | 4 | Phase 3 reviewed |
| 8 | Prompt R (Phase 4) | — | Prompt 4 reported |

Phases don't depend on each other's code, so you can change the order. Keep each phase followed by its review.

---

## Corrections to the plan found while writing these prompts

Checked against the code on 2026-10-30. The prompts already include them, and they override the plan where the two disagree.

| # | Plan says | Code reality | What to do |
|---|---|---|---|
| K1 | Redis hash `agap:fleet:stale` | Existing keys use plain prefixes: `route:dispatch:`, `geocode:search:` | Use `fleet:stale` |
| K2 | Edit `shared/src/...` | The backend and frontend load `@agap/shared` from **`shared/dist`** (`package.json` `main`); only Jest and mobile read `src`. `dist/` is git-ignored | After any `shared/src` edit, run `cd shared && pnpm build` before backend/frontend typecheck or run. `shared/src/constants/` also holds **stale compiled `.js`/`.d.ts` files** (tracked, from 2026-10-16): edit only the `.ts`, never those files |
| K3 | New staff notices (`SURGE_RECOMMENDED`, `HOSPITAL_STATUS_STALE`) | `frontend/components/layout/NotificationBell.tsx` routes a click by `event_type` | Add a click route for each new `event_type` (surge page, hospitals page) |
| K4 | Monthly reminder for facilities **and resources** whose `last_verified_at` > 90 days | `resources` has **no** `last_verified_at` | Facilities: `last_verified_at`. Resources: `updated_at`, worded "not updated in 90 days" |
| K5 | Accept calls `BarangayCallbackService.reportBySms` | `BarangayCoordinationModule` doesn't export `BarangayCallbackService` | Add it to that module's `exports` (Phase 3) |
| K6 | Add `@Cron` jobs | `ScheduleModule.forRoot()` is registered once, in `jobs.module.ts`, and `@Cron` works in any module's provider | Never add another `ScheduleModule.forRoot()` |
| K7 | Use `NotificationsService`, `AuditService`, `RealtimeService` | `RealtimeModule` is `@Global`. `NotificationsModule` and `AuditModule` are not | Import `NotificationsModule` / `AuditModule` into the feature module. **Never** list another module's service in your own `providers` (that creates a second instance) |
| K8 | Hospital ranking needs a distance | `haversineMeters` exists in `shared/src/maps/distance.ts`, and `HospitalsService.findNearby` already uses `ST_Distance` | Reuse one of them. Don't write a new distance function |
| K9 | Import `AnnouncementsModule` into `BarangayCoordinationModule` | `AnnouncementsModule` imports only Audit, Media and Bull queues: no cycle today | OK, but run the app boot check (§0 D) to confirm |
| K10 | The barangay reply service checks `AiClientService.enabled` | Importing `AiAssistModule` into `BarangayCoordinationModule` would create a cycle (AiAssist needs the barangay callback for accept) | Add a pure `aiAssistEnabled(config)` helper in `backend/src/ai-assist/ai-assist.flags.ts`, used by both `AiClientService` and the reply service. The barangay module registers the `AI_ASSIST` queue with `BullModule.registerQueue` and never imports `AiAssistModule` |
| K11 | Seed surge rules for "Lolomboy, Bunlo, Igulot, Bambang, Bundukan, Biñang 1st" | `incident_locations.barangay` holds the names the geocoder and barangay list use (accents and "1st" vs "First" matter) | Before seeding, read the official names from the barangay list the code uses (`geo_regions` / the directory seed) and seed those exact strings |
| K12 | (2026-10-30) Roadmap §5 and the original AI plan use OpenAI (`OPENAI_API_KEY`, `responses.parse`, `store: false`) | The user switched the LLM to Gemini. `GEMINI_API_KEY` is in `backend/.env` only: not in `config.validation.ts` or `.env.example`. `@google/genai` isn't installed. `openai` is imported by 2 files (evidence review, hospital name assist), which stay on OpenAI | Follow plan Phase 3 → **Provider: Gemini**. Add `GEMINI_API_KEY` + `GEMINI_MODEL` to config and `.env.example`; add `@google/genai` pinned exactly (the one allowed new dependency); leave the OpenAI files alone |

---

## §0 Execution protocol (every prompt follows this)

### A. Preflight (no edits yet)

1. Read `CLAUDE.md`, the plan's **Rules for every phase**, the plan's **Phase N** in full, this file's **Corrections** table, and the phase's "Read first" files.
2. Read the plan's **Progress log**. If Phase N already has a dated section, this is a **resume**: continue from what it records.
3. Run `git status --short` and keep the output. You must never revert or reformat files you didn't change in this phase.
4. **Duplication inventory.** Before writing anything, list every artifact the phase adds: files, classes, functions, migrations, enum values, env vars, queue names, event names, routes, cron jobs, notification `event_type`s, Android channels, tests. Grep for each one. For each, record **exists / partial / missing**:
   - **exists** or **partial**: finish or extend that one. Never create a second one.
   - A migration for this phase already in `backend/prisma/migrations/`: don't create another. If it was already applied (`pnpm prisma migrate status`), never edit it; add a new follow-up migration only if a change is really needed.
5. Run the baseline backend suite (`cd backend && npx jest --config ./test/jest.config.ts --testTimeout=30000`) and record pass/fail counts. Failures that exist now aren't yours, except the known `barangay-notify.spec.ts` mock, which the first phase fixes (plan Rule 7).

### B. Implement

- Follow the phase's numbered steps in order, using the inventory.
- **One source per concept:**
  - status and label lists come from their existing constants (e.g. `BARANGAY_LINK_STATUSES`), never retyped;
  - event names live only in `shared/src/events/*.events.ts`;
  - queue names live only in `shared/src/constants/queue.constants.ts`;
  - env vars appear once in `config.validation.ts` and once in `.env.example`.
- **Reuse before writing:** check the Corrections table and the phase's "must reuse" list. If a helper exists, import it.
- Match the surrounding code: naming, comment density, `try/catch` + `this.logger` style, DTOs with class-validator, `@Roles(...)` guards.
- No new npm dependencies. If one seems needed, stop and ask.
- Keep changes inside the phase's scope. Unrelated issues you notice go into the report, not into the code.

### C. Self-check before verifying

Run these and fix anything they find:

- **Duplicates:**
  - each new event name, queue name, env var, route path and `event_type` appears in exactly one definition;
  - `grep -rn "ScheduleModule.forRoot" backend/src` returns exactly 1 line;
  - no service of another module is in your module's `providers`.
- **Secrets:** `grep -rnE "(^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{30,}" --include=*.ts --include=*.tsx --include=*.js --include=*.md --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.next backend frontend mobile shared docs scripts` returns nothing (the word boundary before `sk-` avoids the `risk-…` false hits; `AIza` is the Google key prefix), and no code logs `OPENAI_API_KEY` or `GEMINI_API_KEY`.
- **Privacy:** every push body, SMS message and LLM input added by this phase contains no name, phone, address, coordinates or medical data.
- **Guardrails:** nothing added calls status transitions, dispatch, `DisasterModeService.activate`, publish, or creates a risk area without a person's request.

### D. Verify (plan Rule 7, plus boot)

1. If `shared/src` changed: `cd shared && pnpm build`.
2. `pnpm typecheck` in every touched package.
3. Backend full suite, plus frontend or mobile Jest if touched, plus `cd backend && pnpm test:e2e`.
4. Migrations: `cd backend && pnpm prisma migrate deploy && pnpm prisma generate`. If there's no database, record "not applied".
5. **Boot check:** start the backend once (`cd backend && pnpm start:dev`). Confirm it reaches "Nest application successfully started", with no DI or circular-dependency error and no BullMQ jobId error, then stop it. If it can't start for an environmental reason (no Postgres or Redis), record that.
6. Fix every failure your change caused and re-run until green. Never weaken or delete an existing test to make it pass. Never use `--no-verify` or skip hooks.

### E. Record

- Tick the phase's **Done when** boxes that are now true, and only those.
- Fill in the plan's **Progress log** row and add a dated section under it:
  - files added and changed;
  - migrations (applied or not);
  - the duplication inventory result (what already existed);
  - deviations from the plan, and why;
  - what needs a person or a device.
- Update the `docs/100%ModulesFunctionalities+AdditionalModules.md` rows the phase names, marked **walkthrough pending**.
- Don't commit.

### F. Report, then STOP

Reply with:
1. What was built, per item (C-number).
2. Test results with counts: before → after, per package.
3. The deviations and the duplication inventory findings.
4. What needs a person or a device.

Then stop. Don't start the next phase.

---

## Prompt 1 — Notifications that must reach people (C1, C3)

```
Read docs/plans/AUTOMATION_NEEDS_PROMPTS.md §0 and the Corrections table, then execute
Phase 1 of docs/plans/AUTOMATION_NEEDS_PLAN.md exactly as §0 describes (A → F).

This is the first phase run, so also fix the known baseline failure: in
backend/test/barangay-coordination/barangay-notify.spec.ts add
`false_alerts: { create: jest.fn() }` to the $transaction mock. Change nothing else there.

Must reuse (do not re-create):
- DispatchService's existing `notificationQueue` and NotificationProcessor.sendPush
  (no new FCM code). Confirm sendPush passes androidChannelId through to the
  Android config; if it does not, extend sendPush, not a new path.
- The existing Android channel block and the single
  addNotificationResponseReceivedListener in mobile/app/_layout.tsx: extend `take`,
  do not add a second listener.
- `normalizePhPhone` from @agap/shared, the existing AnnouncementsService.unsubscribe()
  (extend it), its injected smsQueue, and AuditAction.UNSUBSCRIBE.

Traps:
- The OPT_OUT migration contains only the ALTER TYPE … ADD VALUE statement; nothing in
  the same migration may use the new value.
- The STOP check must run before parseBarangayReply/decide, and a barangay contact's or
  the override phone's "STOP" must follow today's path unchanged.
- With BARANGAY_SMS_REPLIES_ENABLED=false and SMS_OPT_OUT_ENABLED=true, non-STOP texts
  keep the DISABLED outcome.
- Push body/data: category + public reference only; no incidentId in data.

Phase-specific self-checks (add to §0 C):
- `setNotificationChannelAsync('assignments'` appears once; `addNotificationResponseReceivedListener`
  appears once in mobile/app/_layout.tsx; `isOptOut` and `phoneVariants` are defined once.

STOP after the §0 F report.
```

---

## Prompt 2 — Detection jobs (C2, C7)

```
Read docs/plans/AUTOMATION_NEEDS_PROMPTS.md §0 and the Corrections table, then execute
Phase 2 of docs/plans/AUTOMATION_NEEDS_PLAN.md exactly as §0 describes (A → F).

Must reuse (do not re-create):
- findEscalationRecipients (backend/src/jobs/escalation-recipients.ts) and
  NotificationsService.create — import NotificationsModule into DisasterModeModule (K7).
- RealtimeService (global): add `surgeRecommended` and `triageTagUpdated` methods there,
  using this.safe + gateway.emitToOps; event names go in a new
  shared/src/events/surge.events.ts exported from shared/src/events/index.ts, payload
  types in websocket-event.types.ts.
- The surge page's existing activate flow (prefill it; do not build a second one) and
  RiskIntelligenceService.createArea for approvals.

Traps:
- K11: seed surge_rules with the exact barangay strings the code uses. Seed with
  ON CONFLICT (rule_key) DO NOTHING so a re-run never duplicates rows.
- Geography columns are Unsupported in Prisma: read/write them with $queryRaw/$executeRaw
  tagged templates only. The partial unique index lives in the SQL migration.
- The notice dedup uses a Prisma JSON path filter on data_payload.ruleKey within 60 min.
- K3: add NotificationBell click routing for SURGE_RECOMMENDED → the surge page.
- Do not edit backend/test/disaster-mode/surge.spec.ts except to keep it passing;
  put new tests in new files.
- K6: no new ScheduleModule.forRoot().

Phase-specific self-checks (add to §0 C):
- `grep -n "activate(" backend/src/disaster-mode/surge-detector.service.ts` returns nothing.
- `surge.recommended` and `surge.triage_tag_updated` are each defined once in shared/src/events.

STOP after the §0 F report.
```

---

## Prompt 3 — AI foundation and free-text barangay replies (C4)

```
Read docs/plans/AUTOMATION_NEEDS_PROMPTS.md §0 and the Corrections table, then execute
Phase 3 of docs/plans/AUTOMATION_NEEDS_PLAN.md exactly as §0 describes (A → F).

Before any code: read the phase's "Ask the user before coding" block. The model ID and
tier were answered on 2026-10-30 (recorded there); ask me only the fixtures question and
wait for my answer. Free tier means: AI_ASSIST_ENABLED stays false in .env.example, and
the progress log must say real barangay texts can't go to Gemini until the key is paid tier.

The LLM is Gemini, not OpenAI (K12). Follow the phase's "Provider: Gemini" section.
Adding @google/genai, pinned to an exact version, is the one allowed new dependency.

Must reuse (do not re-create):
- The existing never-throw, flag-gated AI pattern (evidence-ai-review.service.ts,
  hospital-name-assist.service.ts) and the roadmap §5 sketches, for structure only.
  Only ai-client.service.ts imports '@google/genai'. Do not touch the OpenAI files.
- BARANGAY_LINK_STATUSES for the zod enum (plus 'UNCLEAR'), never a retyped list.
- BarangayCallbackService.reportBySms: extend it with an optional third `opts` argument;
  every existing caller keeps working unchanged. Export the service (K5).
- The existing NEEDS_BACKUP escalation inside the callback path, and the message log in
  barangay-notify.service.ts (it already reads by notice_id).
- frontend/hooks/useBarangay.ts as the pattern for frontend/hooks/useAiAssist.ts.

Traps:
- K10: no AiAssistModule import into BarangayCoordinationModule. Use the pure
  aiAssistEnabled(config) helper and register the AI_ASSIST queue there with
  BullModule.registerQueue. AiAssistModule imports BarangayCoordinationModule (one way).
- K2: add AI_ASSIST to shared/src/constants/queue.constants.ts only (not the stale .js),
  then `cd shared && pnpm build`.
- jobId is `reply-<inboundId>` (no colon).
- The linking rule in decide(): exactly one open notice → link; zero or several → no link,
  no AI. All other outcomes (UNKNOWN_SENDER, DUPLICATE, APPLIED, OPT_OUT, …) unchanged.
- Never read backend/.env, never call the real Gemini API, never print the key.
  The eval script is written but not run.
- GEMINI_MODEL has no fallback: blank + AI_ASSIST_ENABLED=true refuses to boot.
- Map every Gemini failure (timeout, 429, 401/403, safety block, bad JSON, Zod failure)
  to the plan's short error codes; never store the provider's message.
- Build nothing from AI plan Phase 3 (no case brief).

Phase-specific self-checks (add to §0 C):
- `grep -rln "from 'openai'" backend/src` lists exactly 2 files (unchanged).
- `grep -rln "@google/genai" backend/src` lists exactly 1 file (ai-client.service.ts),
  and backend/package.json pins it without ^ or ~.
- GEMINI_API_KEY and GEMINI_MODEL each appear once in config.validation.ts and once in .env.example.
- With AI_ASSIST_ENABLED unset, a unit test proves no job is queued and no client is built.

STOP after the §0 F report.
```

---

## Prompt 4 — Fleet and hospital data quality (C5, C6, C8)

```
Read docs/plans/AUTOMATION_NEEDS_PROMPTS.md §0 and the Corrections table, then execute
Phase 4 of docs/plans/AUTOMATION_NEEDS_PLAN.md exactly as §0 describes (A → F).

Must reuse (do not re-create):
- The ioredis fail-open pattern from backend/src/locations/maps/geocode-cache.service.ts;
  key prefix `fleet:stale` (K1).
- RESOURCE_EVENTS in shared/src/events/resource.events.ts for the new
  `resource.heartbeat_stale` event (add it there, not in a new file).
- ResourceMatchingService's existing scoring and buildRationale: adjust them, do not add a
  second ranking path.
- Distance: haversineMeters (shared/src/maps/distance.ts) or findNearby's ST_Distance
  query (K8). No new distance function.
- activeMemberOrgIds for hospital-user scoping; NotificationsService via NotificationsModule (K7).

Traps:
- Declare GET /v1/hospitals/recommendations before @Get(':id') and prove it with a test.
- Set receiving_status_updated_at only when receiving_status actually changes; find every
  writer with grep before editing. Backfill from updated_at in the migration.
- K4: resources have no last_verified_at — use updated_at for them.
- K3: NotificationBell click routing for HOSPITAL_STATUS_STALE (and the monthly digest
  event_type) → the hospitals page.
- Never write resources.status or Facility.receiving_status from these jobs.

Phase-specific self-checks (add to §0 C):
- `grep -nE "resources\.update|receiving_status:" backend/src/fleet/unit-heartbeat.service.ts backend/src/hospitals/registry-freshness.service.ts`
  returns nothing (the jobs never write a status).
- `heartbeat_stale` is defined once in shared/src/events.

STOP after the §0 F report.
```

---

## Prompt R — Independent review of a phase (run after each phase)

Replace `N` with the phase number.

```
You are reviewing Phase N of docs/plans/AUTOMATION_NEEDS_PLAN.md, implemented in an
earlier session (uncommitted). Do not re-implement it.

1. Read CLAUDE.md, the plan's Rules and Phase N, the Corrections table and §0 of
   docs/plans/AUTOMATION_NEEDS_PROMPTS.md, and the Phase N section of the progress log.
2. Identify the phase's changes with `git status --short` and `git diff`, limited to the
   files the progress log lists plus any new untracked files of this phase.
3. Check, with evidence (file:line), each of:
   a. Every numbered step and "Done when" item is really implemented; ticked boxes are true.
   b. Bugs: wrong conditions, missed awaits, unhandled promise rejections, wrong Prisma
      filters, route order, timezone/window math, dedup windows, null cases.
   c. Duplication: two definitions of the same event, queue, env var, route, helper,
      migration or channel; a service re-provided in another module; logic copied instead
      of reused (see the phase prompt's "Must reuse" list).
   d. Guardrails and privacy (§0 C) and reliability: a failing push/SMS/job/AI call can
      never change or delete an incident or dispatch.
   e. Tests actually assert the behaviour (not just that a mock was called), and no
      existing test was weakened.
4. Fix only confirmed problems, smallest change first. Then run §0 D in full.
5. Add a "Review — <date>" subsection under Phase N in the progress log: findings,
   fixes, test counts, anything left open. Don't commit.

Report the findings (fixed / open) and the test counts, then STOP.
```
