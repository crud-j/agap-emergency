# Plan: List C Automation (C1–C8, incl. A1)

> **Status:** Phase 1 implemented and reviewed 2026-10-30 (no defects; device checks pending). Phase 2 implemented and reviewed 2026-10-30 (same-session review, 1 fix; independent review, 2 fixes; walkthroughs pending). Phase 3 implemented and reviewed 2026-10-30 (review: 3 fixes; live eval and walkthroughs pending; free-tier key, so AI stays off for real texts). Phase 4 implemented 2026-10-30 (C6 and C8, plus a hospital-user status report; C5 deferred; not yet reviewed; walkthroughs pending).
> **LLM provider (changed 2026-10-30):** Phase 3 uses **Google Gemini** (`GEMINI_API_KEY`, already in `backend/.env`), not OpenAI. The existing OpenAI features (evidence review, hospital name assist) keep `OPENAI_API_KEY` and are not touched. See [Phase 3 → Provider](#provider-gemini-changed-2026-10-30).
> **Run it:** paste the phase's prompt from [AUTOMATION_NEEDS_PROMPTS.md](AUTOMATION_NEEDS_PROMPTS.md) into a fresh session, then run its review prompt (Prompt R). Or use `/automation-plan <1-4>`; `/automation-plan status` shows progress. That file's **Corrections** table (K1–K11) overrides this plan where they differ.
> **Sources:** [AGAP_Automation_and_LLM_Modernization_Roadmap.md](../AGAP_Automation_and_LLM_Modernization_Roadmap.md) §2.3 and §4 (what and why), [AI_ASSIST_PLAN.md](AI_ASSIST_PLAN.md) Phases 1–2 (C4 detail). **Where this plan and those docs differ, this plan wins**: it was checked against the code on 2026-10-30. The roadmap §5 code sketches are written for OpenAI (`responses.parse`, `zodTextFormat`, `store: false`); use them for structure only and follow this plan's Gemini section for the provider calls.
> **Scope:** only the 9 "Needs automation" items. The optional assists (roadmap §6) and AI plan Phase 3 are out of scope.

| Phase | Items | Modules | LLM | Needs from a human first |
|---|---|---|---|---|
| 1 | C1 responder assignment push · C3 STOP opt-out | MOD-18/32, MOD-53 | No | — |
| 2 | C2 surge recommendation + live triage tags · C7 hotspot proposals | MOD-52, MOD-51 | No | — (thresholds ship as editable defaults) |
| 3 | C4 AI foundation + free-text barangay replies | A1 / MOD-34 | **Yes** (Gemini) | Review of the reply fixtures. *(Model `gemini-3.8-flash` and tier: free, answered 2026-10-30)* |
| 4 | C5 unit heartbeat · C6 hospital ranking · C8 registry freshness | MOD-28, MOD-38, MOD-39 | No | — |

The phases are independent and can run in any order. 1 → 2 → 3 → 4 is recommended.

---

## Rules for every phase

Read these before starting any phase. They aren't repeated in the phases.

1. **Read first:** `CLAUDE.md` (architectural and reliability rules), then the "Read first" files of the phase. Check every file path and symbol named here before editing. If the code has moved, follow the code and note the difference in the progress log.
2. **Guardrails** (roadmap §3):
   - Automation never changes incident status, dispatches, activates surge, publishes, or creates a risk area. It notifies or suggests, and a person acts.
   - A failed push, SMS, job or AI call never changes or deletes an incident or dispatch: wrap it in `try/catch` and log it, the way the existing code does.
   - Nothing personal goes into a push body, an SMS or an LLM prompt.
3. **Conventions:**
   - Routes are `/v1/…`.
   - BullMQ custom `jobId`s use `-` separators. BullMQ throws on `:` unless there are exactly 3 parts.
   - SMS jobs are `{ phone, message }` (`SmsJobData`).
   - Ops-room events go through `RealtimeService` → `gateway.emitToOps` inside `this.safe(...)`, with the event name in `shared/src/events/*.events.ts` and the payload type in `websocket-event.types.ts`. The web handles them in `frontend/providers/socket-provider.tsx` with `onIncidentEvent(...)` + `qc.invalidateQueries`.
   - Staff app notices use `NotificationsService.create({ userId, eventType, title, body, channel: 'IN_APP', dataPayload })`, with recipients from `findEscalationRecipients(prisma, roles)` (`backend/src/jobs/escalation-recipients.ts`).
   - Audit with `AuditService.log({ action, actorId, entityType, entityId, moduleId })`.
4. **Migrations:** write the SQL by hand in `backend/prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql`, update `schema.prisma` to match, then run `pnpm prisma migrate deploy` and `pnpm prisma generate` in `backend/`. **Never** run `migrate dev` or `migrate reset`. If no database is reachable, write the migration anyway and record "not applied" in the progress log.
5. **New env vars** go in `.env.example` (with a comment) and `backend/src/config/config.validation.ts`, using that file's decorator pattern.
6. **Secrets:** `GEMINI_API_KEY` and `OPENAI_API_KEY` are read only from `process.env` (loaded from `backend/.env`). Never print, log, echo or commit them, and never open `backend/.env` to read their values.
7. **Verify before you finish:**
   - `pnpm typecheck` in every package you touched.
   - `cd backend && npx jest --config ./test/jest.config.ts --testTimeout=30000` (full suite).
   - `cd frontend && npx jest` / `cd mobile && npx jest` if you touched them.
   - `cd backend && pnpm test:e2e` (CLAUDE.md: emergency-flow regression).
   - **Baseline (2026-10-29):** backend 1171 of 1172 pass. The one known failure is `test/barangay-coordination/barangay-notify.spec.ts`: its `$transaction` mock lacks `false_alerts`. The first phase that runs fixes that mock by adding `false_alerts: { create: jest.fn() }`. After that, every phase must end fully green. Don't use the `tests/` package (its harness is broken, roadmap §8).
8. **Don't commit.** The user commits. Leave the work uncommitted.
9. **Finish every phase** by filling in its row in the [Progress log](#progress-log) (date, result, deviations, what needs a device or human check). Then update the matching rows in `docs/100%ModulesFunctionalities+AdditionalModules.md` as stated in the phase, marked **walkthrough pending**.

---

## Phase 1 — Notifications that must reach people (C1, C3)

**Goal:** a responder's phone is woken for every new assignment, and an SMS subscriber who replies STOP is unsubscribed.

**Read first:** `backend/src/dispatch/dispatch.service.ts` (`create`, `addCrew`, `cancel`), `backend/src/jobs/processors/notification.processor.ts`, `mobile/app/_layout.tsx` (notification tap handling), `mobile/src/services/push/push-registration.ts`, `backend/src/barangay-coordination/{barangay-reply.service.ts,barangay-sms-poller.ts}`, `backend/src/announcements/announcements.service.ts` (`subscribe`, `unsubscribe`, the SMS fan-out near "Reply STOP"), `mobile/app/announcements/subscribe.tsx`, `mobile/src/services/api/announcements.api.ts`.

### C1 — Responder assignment push (MOD-18/32)

1. **Backend, `DispatchService`:**
   - **`create`:** after the realtime `try` block and before `return`, in its own `try/catch`, load `dispatch_crew` for the dispatch. Queue one job per crew member on the existing notifications queue: name `responder-assignment-push`, data `{ channel: 'PUSH', userId, title: 'New assignment', body: '<CATEGORY> · <public_reference>. Open AGAP to accept.', data: { type: 'ASSIGNMENT', dispatchId }, androidChannelId: 'assignments' }`, options `{ jobId: 'assign-<dispatchId>-<userId>', attempts: 3, backoff: { type: 'exponential', delay: 5000 } }`. **No address, patient or reporter data in the body or data**, because it shows on the lock screen. Don't put `incidentId` in `data` either: the tap handler would open the citizen screen.
   - **`addCrew`:** push the same message to the added user only (jobId `assign-<dispatchId>-<userId>-<Date.now()>`).
   - **`cancel`:** push `title: 'Assignment cancelled'` to the crew, with `data.type: 'ASSIGNMENT_CANCELLED'`.
   - Pull the message building into a small pure helper (e.g. `backend/src/dispatch/assignment-push.ts`) so it can be unit-tested.
2. **Mobile:**
   - In `push-registration.ts`, add an Android channel `assignments` with `AndroidImportance.MAX`, next to `incident-updates`, and add `assignmentIdFromNotification(response)` that returns `data.dispatchId` when `data.type === 'ASSIGNMENT'`.
   - In `_layout.tsx`, check for an assignment first and route to `/responder/assignment/[id]` (the param is the dispatch ID, see `app/responder/assignment/[id].tsx`). Otherwise keep the existing incident routing.
   - Keep the 15-second polling in `useResponderAssignments.ts` as the fallback.
3. **Tests:** add `backend/test/dispatch/responder-assignment-push.spec.ts`. It must cover:
   - one job per crew member, with a deterministic jobId;
   - the body contains the reference but no address or name;
   - a queue failure doesn't throw and the dispatch is still returned;
   - `addCrew` and `cancel` send pushes.

   Add a mobile unit test for `assignmentIdFromNotification`.

### C3 — STOP opt-out (MOD-53)

Today the poller runs only when `BARANGAY_SMS_REPLIES_ENABLED=true`, a subscriber's STOP is stored as `UNKNOWN_SENDER`, and `sms_subscribers.phone_number` is stored as typed (e.g. `09171234567`).

1. **Migration** `…_sms_opt_out`: `ALTER TYPE barangay_inbound_outcome ADD VALUE 'OPT_OUT';`, and update the enum in `schema.prisma`.
2. **`backend/src/announcements/sms-opt-out.ts`:**
   - `isOptOut(body)`: the whole message, trimmed and case-insensitive, is one of `STOP, UNSUBSCRIBE, CANCEL, END, QUIT, ITIGIL, HUWAG NA` (optional trailing `.`/`!`).
   - `phoneVariants(e164)`: `['+639XXXXXXXXX', '639XXXXXXXXX', '09XXXXXXXXX']`.
3. **`AnnouncementsService`:**
   - Add `optOutBySms(fromE164): Promise<boolean>`. It `updateMany`s active rows whose `phone_number` is in `phoneVariants`, setting `is_active=false, opted_out_at=now, opt_out_source='SMS_STOP'`. If none matched it returns false. Otherwise it audits `AuditAction.UNSUBSCRIBE` (`entityType: 'sms_subscriber'`, `moduleId: 'MOD-53'`), queues one confirmation `{ phone: fromE164, message: 'AGAP: You are unsubscribed from Bocaue MDRRMO announcements. For emergencies call 911.' }` (≤ 160 chars), and returns true.
   - Make the existing `unsubscribe()` match `phoneVariants` too, and set `opt_out_source: 'APP'`.
4. **`BarangayReplyService.handleInbound`:** after the duplicate check and phone normalization, **before** `parseBarangayReply` / `decide`:
   - if `isOptOut(msg.body)` and the sender is **not** an active `barangay_contacts` phone and not the demo override phone, call `optOutBySms`;
   - if it returns true, store the inbound row with outcome `OPT_OUT` (same `create` and P2002 handling as today) and return `'OPT_OUT'`;
   - otherwise fall through unchanged. A barangay hotline's "STOP" must never unsubscribe anyone or skip barangay handling.

   Import `AnnouncementsModule` into `BarangayCoordinationModule`. If that causes a circular import, move `optOutBySms` into a small `SmsOptOutService` in the announcements module and export it.
5. **Poller:** `pollingOn()` becomes `(repliesEnabled() || optOutEnabled()) && mode === 'poll' && TEXTBEE_API_KEY`, with a new env `SMS_OPT_OUT_ENABLED` (default `'true'`). With replies disabled, non-STOP texts keep today's `DISABLED` outcome. Document in `.env.example` that the Textbee phone needs "Receive SMS" on.
6. **Mobile:** add `unsubscribeFromSms(phoneNumber)` to `announcements.api.ts` (`POST /v1/announcements/unsubscribe`) and an **Unsubscribe** action on `subscribe.tsx`, with a confirmation and a success message.
7. **Tests:** add `backend/test/announcements/sms-opt-out.spec.ts`. It must cover:
   - keyword matching, including `stop.`, `Itigil` and `stop please` (the last is **not** an opt-out);
   - the three phone formats all match;
   - a subscriber is deactivated and one confirmation is queued;
   - a barangay contact's STOP leaves subscribers alone and still runs barangay handling;
   - a non-subscriber STOP falls through;
   - a repeated provider message ID is `DUPLICATE`.

**Done when:**
- [x] All the tests above pass and the full suite is green (Rule 7).
- [x] Dispatch create, addCrew and cancel still succeed when the queue throws.
- [x] The STOP path never calls `parseBarangayReply` for a subscriber, and never touches barangay notices.
- [x] 100% doc updated: MOD-32 row (responders now get a push; 15-s refresh is the fallback, walkthrough pending) and MOD-53 row (STOP and in-app unsubscribe now processed, walkthrough pending).
- [x] Progress log notes the device checks: a push on a backgrounded responder phone, and a STOP sent from a real phone.

---

## Phase 2 — Detection jobs (C2, C7)

**Goal:** supervisors get an early surge recommendation, triage tags update live, and recurring incident clusters are proposed as risk areas for the System Administrator to approve.

**Read first:** `backend/src/disaster-mode/{disaster-mode.service.ts,disaster-mode.module.ts,disaster-mode.controller.ts}`, `backend/src/jobs/analytics-cron.service.ts` (the `@Cron` pattern), `backend/src/jobs/escalation-recipients.ts`, `backend/src/notifications/notifications.service.ts`, `backend/src/realtime/realtime.service.ts`, `frontend/features/surge/hooks.ts`, `frontend/app/(ops)/operations/surge/`, `frontend/providers/socket-provider.tsx`, `backend/src/risk-intelligence/{risk-intelligence.service.ts,risk-intelligence.controller.ts}`, `frontend/app/(ops)/administration/risk-areas/page.tsx`.

### C2 — Surge recommendation and live triage tags (MOD-52)

`Escalation.incident_id` is required, so a surge recommendation is **not** an escalation. It's an app notice to every Supervisor plus an ops-room event.

1. **Migration** `…_surge_recommendation`:
   - `surge_rules` table: `id`, `rule_key` unique, `window_minutes`, `min_incidents`, `category` nullable `incident_category`, `barangays text[]`, `is_active`, timestamps;
   - seed rows `VOLUME` (30 min, 8, any category), `FLOOD_CLUSTER` (30, 5, FLOOD, Lolomboy/Bunlo/Igulot/Bambang) and `INDUSTRIAL` (15, 2, INDUSTRIAL, Bundukan/Biñang 1st);
   - `surge_settings` single row: `river_level_m numeric(5,2)`, `river_level_at`, `river_level_by_id`.

   Seed values are MDRRMO-editable defaults.
2. **`backend/src/disaster-mode/surge-detector.service.ts`:** `@Cron('*/5 * * * *')` `evaluate()`. Skip if a surge is `ACTIVE`. For each active rule, count incidents created in the window, with status not in `CANCELLED, FALSE_ALERT, DUPLICATE`, matching the category and `incident_locations.barangay` filters. Also treat `river_level_m >= 11.50` (set in the last 6 h) as a trip with rule key `RIVER_LEVEL`.
   - On a trip, skip if a `SURGE_RECOMMENDED` notification with the same `dataPayload.ruleKey` was created in the last 60 min (Prisma JSON path filter).
   - Otherwise create an IN_APP notice for each recipient of `findEscalationRecipients(prisma, ['SUPERVISOR'])`: title `Surge mode recommended`, body `<n> <category> incidents in <barangays> in <window> min`, data `{ ruleKey, count, windowMinutes, barangays }`. Emit `surge.recommended` to the ops room.
   - Never call `activate`. Wrap everything in `try/catch`: a failed run logs and waits for the next tick.
3. **API** (`disaster-mode.controller.ts`, Supervisor):
   - `GET/PATCH /v1/disaster-mode/rules` (edit window, min, barangays, active; audited);
   - `PUT /v1/disaster-mode/river-level` `{ meters }` (audited).
4. **Web, surge page:**
   - a "Recommended" banner fed by `surge.recommended` or the latest unread `SURGE_RECOMMENDED` notice, whose **Activate** button opens the existing activate flow with the reason prefilled;
   - a River level input;
   - a small rules editor.
5. **Live triage tags:**
   - Emit `surge.triage_tag_updated` `{ surgeId, tagId }` from `createTriageTag` and `updateTriageTag` (inside `this.safe`).
   - In `socket-provider.tsx`, invalidate `['surge-triage']` and `['surge-state']`.
   - Keep the `refetchInterval`s as fallback.

### C7 — Hotspot proposals (MOD-51)

1. **Migration** `…_risk_area_proposals`: `risk_area_proposals` table (`id`, `risk_type incident_category`, `barangay`, `incident_count`, `area_boundary geography`, `window_days`, `status` `PENDING|APPROVED|DISMISSED`, `reviewed_by_id`, `reviewed_at`, `risk_area_id`, `created_at`). Add a unique index on `(risk_type, barangay, status)` filtered to `PENDING`, so the nightly job refreshes a proposal instead of duplicating it.
2. **`backend/src/risk-intelligence/hotspot-discovery.service.ts`:** `@Cron('30 2 * * *')`. Run the roadmap §4.7 query: `ST_ClusterDBSCAN` on `ST_Transform(il.point::geometry, 32651)` with `eps 150` and `minpoints 4`, over the last 90 days, excluding `FALSE_ALERT, DUPLICATE, CANCELLED`, per category. Then upsert a `PENDING` proposal per cluster with a convex-hull boundary (`ST_Buffer(...,30)` so 2-point hulls still have area), skipping clusters already covered by an active `risk_areas` row of the same type (`ST_Intersects`). Use `$queryRaw` with tagged templates only.
3. **API** (System Administrator, audited):
   - `GET /v1/risk-intelligence/proposals?status=PENDING`;
   - `POST /v1/risk-intelligence/proposals/:id/approve` `{ name, riskLevel }`: calls the existing `createArea` (so barangay validation and audit apply), then sets `area_boundary` from the proposal and marks it `APPROVED`;
   - `POST …/:id/dismiss`.
4. **Web:** a "Proposed areas" section on `administration/risk-areas/page.tsx` (type, barangay, count, Approve with a name field, Dismiss).

**Tests:**
- `backend/test/disaster-mode/surge-detector.spec.ts`:
  - trips at the threshold and not below;
  - dedup within 60 min;
  - river-level trip;
  - active surge → no-op;
  - never calls `activate`;
  - a Prisma error doesn't throw.
- `backend/test/risk-intelligence/hotspot-discovery.spec.ts` (Prisma mocked): upsert, skip-covered, approve → `createArea` + `APPROVED`, dismiss.

**Done when:**
- [x] The tests pass and the full suite is green.
- [x] A seeded 5 FLOOD incidents in Bunlo within 30 min produce exactly one notice per Supervisor and no surge activation. *(Checked 2026-10-30 in the independent review: the compiled detector ran on the dev database inside a rolled-back transaction. The banner walkthrough is still open.)*
- [ ] A triage-tag change reaches a second browser within ~2 s. *(Needs two browsers.)*
- [ ] Approving a proposal creates a `risk_areas` row with a boundary, plus an audit row. *(Unit-tested; the discovery SQL ran on PostGIS in a rolled-back transaction; approve through the UI is still open.)*
- [x] 100% doc updated: MOD-52 row (live tags; surge recommendation) and MOD-51 row (automatic proposals), both walkthrough pending.

---

## Phase 3 — AI foundation and free-text barangay replies (C4)

**Goal:** a barangay's free-text SMS (`nandito na kami`) is linked to its case, read by the LLM and offered to the dispatcher as a one-click status. With AI off, the text still shows.

**Ask the user before coding:**
- the exact `GEMINI_MODEL` ID to put in `.env.example` comments: a stable (not preview) Gemini model ID, never a `-latest` alias (don't guess a model name);
- whether the `GEMINI_API_KEY` belongs to a **paid-tier** project (billing enabled). You can't check this yourself. If it's free tier, build everything, but record in the progress log that real barangay texts must not be sent until it is paid tier (see Provider below);
- confirmation that the reply fixtures you draft (step 6) can be used.

If there's no model answer, leave `GEMINI_MODEL` blank. There is no fallback model: with `AI_ASSIST_ENABLED=true` and no `GEMINI_MODEL`, the backend refuses to boot (step 2), so AI simply stays off.

**Answered by the user (2026-10-30):**
- **Model:** `gemini-3.8-flash`. Use it as the example value in the `.env.example` comment. `GEMINI_MODEL` itself stays blank there, like every other placeholder. Before the live eval, the user confirms this exact ID is in Google's model list as a stable (not preview) model.
- **Tier:** **free tier only.** So:
  - `.env.example` keeps `AI_ASSIST_ENABLED=false`;
  - the eval runs only on the synthetic fixtures;
  - in a demo, turn the flag on only with test texts from the team's own phones, never with a real incident or a real barangay's reply;
  - real operational use waits for a paid-tier key and the DPO sign-off (AI plan Phase 0);
  - expect `RATE_LIMITED` failures under the free tier's per-minute limits. That's normal, not a bug.

  Record all of this in the progress log.
- **OpenAI features:** the evidence review and the hospital name assist **stay on OpenAI**. Don't change them or their env vars.
- **Fixtures (2026-10-30):** drafted (39), then revised at the user's request ("optimize it and fix it, choose what you recommend") to 46: 5 exact codes and 41 free-text replies, with an `acceptable` list for two-way replies and safety cases (prompt injection, a forwarded alert, "can't get out", "done but someone is still on a roof"). The user can still edit labels; the eval re-reads the file.

### Provider: Gemini (changed 2026-10-30)

Decided by the user on 2026-10-30. This replaces every OpenAI detail in AI_ASSIST_PLAN Phase 1 and the roadmap §5 sketches.

- **Key:** `GEMINI_API_KEY` already exists in `backend/.env` but **not** in `config.validation.ts` or `.env.example`. Add it to both (blank placeholder in `.env.example`).
- **SDK:** the official Google Gen AI SDK, `@google/genai`. It isn't installed. This is the one new dependency the phase may add (an exception to §0 B of the prompts file). Check the current release with `pnpm view @google/genai version`, then `cd backend && pnpm add @google/genai@<that version> --save-exact`. Record the version in the progress log. No `^`, no `latest`.
- **Only one file talks to Gemini:** `ai-client.service.ts` is the only file importing `@google/genai`. `openai` stays imported by exactly the 2 existing files.
- **Call shape:** `new GoogleGenAI({ apiKey })` created lazily, only when the flag is on and the key and model are set. Then `ai.models.generateContent({ model, contents, config: { systemInstruction, responseMimeType: 'application/json', responseJsonSchema (or responseSchema if the pinned version lacks it), temperature: 0, abortSignal } })`. Parse `response.text` with `JSON.parse`, then validate with the Zod schema. Gemini's schema enforcement isn't a substitute for the Zod check.
- **Schema:** hand-write the small JSON schema for `BarangayReplySchema` next to the Zod schema in `prompts/barangay-reply.prompt.ts`. Build both enums from the same `BARANGAY_LINK_STATUSES` constant (+ `'UNCLEAR'`), and add a unit test that the two agree.
- **Thinking:** classification needs none. Turn thinking off, or set it to the lowest level the chosen model allows (`thinkingConfig`; the field differs by model generation, so check the model's docs). This keeps latency inside `AI_ASSIST_TIMEOUT_MS`.
- **No retries, hard timeout:** enforce `AI_ASSIST_TIMEOUT_MS` with an `AbortController`. Make sure the SDK does no automatic retries. The BullMQ job runs once (`attempts: 1`).
- **Never throws; error codes only.** Map failures to a short code stored in `ai_suggestions.error`, never the provider message: `TIMEOUT`, `RATE_LIMITED` (HTTP 429, common on the free tier), `AUTH` (401/403), `BLOCKED` (a safety block: `promptFeedback.blockReason`, or `finishReason` `SAFETY`/`PROHIBITED_CONTENT`), `INVALID_OUTPUT` (bad JSON or failed Zod), `DAILY_LIMIT`, `PROVIDER_ERROR`. A `BLOCKED` reply is just `FAILED`: the raw text still shows from step 1.
- **No `store: false` equivalent.** What Google keeps depends on the tier. **Free tier:** Google may use prompts and responses to improve its products, and human reviewers may read them. **Paid tier:** content isn't used for that. So real barangay texts go to Gemini only on a paid-tier key, with the DPO sign-off from AI plan Phase 0. Synthetic fixtures are fine on either tier.
- **Spend:** Google Cloud budgets only alert; they don't stop calls. `AI_ASSIST_DAILY_LIMIT` is the real hard cap.

**Read first:** AI_ASSIST_PLAN Phase 1 and Phase 2 (design and "Done when" lists), roadmap §5 (code sketches for `AiClientService`, `redact.ts`, the migration and the processor: structure only, the provider calls follow the Gemini section above), `backend/src/media/evidence-ai-review.service.ts` and `backend/src/hospitals/location-resolution/hospital-name-assist.service.ts` (the existing never-throw, flag-gated AI pattern; the provider differs), `backend/src/barangay-coordination/{barangay-reply.service.ts,barangay-callback.service.ts,barangay-notify.service.ts,barangay-reply.parser.ts}`, `backend/src/jobs/jobs.module.ts`, `frontend/components/incidents/BarangayPanel.tsx`, `frontend/hooks/useBarangay.ts`.

1. **Show unparsed replies (no AI needed).** In `BarangayReplyService.decide`, when the outcome is `UNPARSED` and the sender's `barangay_contacts.barangay_id`s have **exactly one** open `incident_barangay_notices` row (`closed_at` null), return that notice. The inbound row then stores `notice_id`, so the text shows in the drawer's message log (`barangay-notify.service.ts` reads by `notice_id`).
   - The demo override phone counts as "any barangay": use the single open notice overall, if there is exactly one.
   - Zero or several open notices: no `notice_id` and no AI call.
   - The outcome stays `UNPARSED`.
2. **Foundation** (AI plan Phase 1, as changed by roadmap §5 and the Gemini section above):
   - env `AI_ASSIST_ENABLED` (default `false`), `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_ASSIST_TIMEOUT_MS` (8000) and `AI_ASSIST_DAILY_LIMIT` (500), plus the boot check: with the flag on, a missing `GEMINI_API_KEY` or `GEMINI_MODEL` refuses to boot;
   - the `@google/genai` dependency, pinned exactly (see Provider);
   - `backend/src/ai-assist/` with `ai-client.service.ts`, `redact.ts`, `ai-suggestions.service.ts`, `ai-suggestions.controller.ts`, `ai-task-runner.service.ts`, `prompts/barangay-reply.prompt.ts` and `ai-assist.module.ts`, registered in `app.module.ts`;
   - `AiClientService` reads `process.env.GEMINI_API_KEY` and calls `generateContent` with a JSON response schema, a hard timeout and no retries, then validates with Zod. It never throws and is the only file importing `@google/genai`;
   - the `ai_suggestions` migration (roadmap §5.5; only the `BARANGAY_REPLY` kind is used now, but create the full enum);
   - the `AI_ASSIST: 'ai-assist'` queue name in `shared/src/constants/queue.constants.ts`;
   - `backend/src/jobs/processors/ai-assist.processor.ts`, registered in `jobs.module.ts` with its queue;
   - the `ai.suggestion_created` event (ops room).

   Build only what C4 uses: no case-brief code.
3. **Trigger:** after the inbound row is stored with `UNPARSED` **and** a `notice_id`, and only when `AiClientService.enabled`, queue `reply-<inboundId>` on `AI_ASSIST`. An exact code, an unknown sender, an opt-out or a reply with no notice never reaches Gemini.
4. **Runner:**
   - Send only `redactForAi(body, 500)` with `BARANGAY_REPLY_INSTRUCTIONS` and `BarangayReplySchema` (`status: SEEN|ON_THE_WAY|ON_SCENE|HANDLED|NEEDS_BACKUP|UNCLEAR`, `confidence 0–1`, `english ≤120`).
   - Store an `ai_suggestions` row (`incident_id` from the notice, `subject_type 'barangay_sms_inbound'`, `subject_id`, the input hash, `model` = the `GEMINI_MODEL` ID).
   - `UNCLEAR` or confidence < 0.6 → `INFO`. Otherwise → `PENDING_REVIEW`. Any failure → `FAILED` with the error code (the Provider list above).
   - Emit `ai.suggestion_created`.
5. **Accept and dismiss** (`POST /v1/ai-suggestions/:sid/accept|dismiss`, Dispatcher and Supervisor):
   - Extend `reportBySms(notice, status, opts?: { actorId?: string; aiSuggestionId?: string })` → `applyBarangayReport` sets `last_report_by_user_id` to the actor.
   - Accept is refused for `INFO`/`FAILED` rows, for a closed notice, or a second time.
   - Both write an audit row (`entityType 'ai_suggestion'`, `moduleId 'MOD-46'`, old and new status, the suggestion ID).
   - `NEEDS_BACKUP` must still raise the existing supervisor escalation.
   - Add `GET /v1/incidents/:id/ai-suggestions` (latest `PENDING_REVIEW`/`INFO` for the incident).
6. **Fixtures and eval:**
   - Draft at least 30 realistic replies (Filipino, English, Taglish, typos, some exact codes, some genuinely unclear, at least 5 asking for help) in `backend/test/ai-assist/fixtures/barangay-replies.json` with expected labels.
   - Add `scripts/dev/eval-barangay-replies.js`. It loads `GEMINI_API_KEY` and `GEMINI_MODEL` from `backend/.env` via dotenv, never prints the key, and resolves `@google/genai` from `backend/` (it's a backend-only dependency). It uses the same instructions and schema as the runner and prints accuracy, the mismatches, and how many were `BLOCKED` or `RATE_LIMITED`. On the free tier, it waits between calls to stay under the per-minute limit.
   - **Don't run the eval against the real API yourself.** Leave it for the user.
7. **Web:**
   - `frontend/hooks/useAiAssist.ts` with `useAiSuggestions(incidentId)`, `useAcceptSuggestion` and `useDismissSuggestion`.
   - A card in `BarangayPanel.tsx`: *Barangay texted: "…" · AI reads this as **On scene** · "We are here…" [Accept] [Dismiss]*, labelled "AI suggestion". `INFO` shows the English reading only, with no Accept.
   - Show the red dot on the Barangay tab while a suggestion is pending.
   - Handle `ai.suggestion_created` in `socket-provider.tsx`.
   - Render nothing when there are no rows.
8. **Tests** (`backend/test/ai-assist/`, `@google/genai` mocked; no test calls Gemini): every AI plan Phase 1 and Phase 2 "Done when" item that can be automated, plus:
   - each error code in the Provider list (timeout, 429, 401, safety block, bad JSON, Zod failure) stores `FAILED` with that code and never throws;
   - the hand-written JSON schema and the Zod schema have the same status values;
   - the single-open-notice linking rule;
   - accept → `reportBySms` with the actor;
   - accept twice → refused;
   - with `AI_ASSIST_ENABLED=false`, no job is queued and incident creation and barangay handling are unchanged.

**Done when:**
- [x] The tests pass and the full suite is green.
- [ ] With the flag off: no Gemini client is created, and the unparsed text appears in the drawer for a single-notice barangay. *(Unit-tested: no client, and the reply is stored with the notice so the existing message log shows it. The drawer check is a walkthrough.)*
- [ ] With the flag on and a bad key: a `FAILED` row (`AUTH`) is stored and nothing else changes. *(Unit-tested with a mocked 400 "API key not valid" and 401/403. The live check needs the flag on in `backend/.env`.)*
- [x] `@google/genai` is pinned to an exact version and imported only by `ai-client.service.ts`.
- [x] The AI plan Phase 1 and Phase 2 checkboxes are ticked, except the live eval, which is left to the user and recorded in the progress log.
- [x] 100% doc updated: A1 row (free-text replies shown and AI-read, walkthrough pending, eval pending).

---

## Phase 4 — Fleet and hospital data quality (C5, C6, C8)

**Goal:**
- a unit whose phone has gone silent is visibly flagged and ranked lower;
- the referral dialog ranks hospitals with reasons;
- stale hospital receiving status is chased and shown as stale.

**Read first:** `backend/src/dispatch/resource-matching/resource-matching.service.ts` (`getRecommendations`, `buildRationale`), `backend/src/locations/maps/geocode-cache.service.ts` (the ioredis fail-open pattern), `backend/src/fleet/`, `frontend/app/(ops)/operations/fleet/page.tsx`, `backend/src/hospitals/{hospitals.service.ts,hospitals.controller.ts}` (`findNearby`, `activeMemberOrgIds`), `frontend/components/incidents/IncidentDetailDrawer.tsx` (`ReferralDialog`), `frontend/features/hospitals/{api.ts,hooks.ts}`.

### C5 — Unit heartbeat staleness (MOD-28)

1. **`backend/src/fleet/unit-heartbeat.service.ts`:** `@Cron('*/2 * * * *')`. Run the roadmap §4.5 query (active `AVAILABLE` resources whose newest `location_history.recorded_at` is missing or older than `UNIT_STALE_AFTER_MIN`, an env var defaulting to 10).
   - Store `{ resourceId: lastSeenAt }` in a Redis hash `agap:fleet:stale` with a 5-minute TTL, following `geocode-cache.service.ts` (own ioredis client, short command timeout, fail open: a Redis outage means "nothing stale", never an error).
   - Emit `resource.heartbeat_stale` `{ staleIds }` to the ops room only when the set changes.
   - **Never change `resources.status`.**
2. **Ranking:** in `getRecommendations`, multiply the final score of a stale unit by 0.5 and add `No GPS signal for <n> min` to its rationale. Expose `stale: boolean, lastSeenAt` on each recommendation.
3. **Web:** a "No signal <n> min" badge on fleet board rows and recommendation rows, refreshed by the event and the existing queries.

### C6 — Hospital ranking (MOD-38)

1. **`backend/src/hospitals/referral-ranking.ts`:** pure `scoreFacility(f, need, km)` from roadmap §4.6 (`facility_receiving_status`: `OPEN | AT_CAPACITY | CLOSED | EMERGENCY_ONLY | UNKNOWN`), plus `needFor(incident)`: ER needed for `CRITICAL`/`HIGH` priority or `MEDICAL`/`ROAD_ACCIDENT`/`FIRE`/`INDUSTRIAL`. Check these enum values against `@agap/shared` before using them.
2. **Endpoint:** `GET /v1/hospitals/recommendations?incidentId=` (Dispatcher, Supervisor). Use the incident's location for straight-line distance (reuse `findNearby`'s distance logic), active facilities only, top 10 with `score`, `reasons` and `distanceLabel`. **Declare the route before `@Get(':id')`** in `hospitals.controller.ts`, or Nest will treat "recommendations" as an ID.
   - No incident location → rank without distance and add the reason "Incident location unknown".
   - Never use patient data.
3. **Web:** in `ReferralDialog`, list the recommended hospitals first, with their reasons. Keep the full list selectable below. The dispatcher still picks.

### C8 — Registry freshness (MOD-39)

1. **Migration** `…_facility_receiving_status_at`: `Facility.receiving_status_updated_at timestamptz`, backfilled from `updated_at`. Set it wherever `receiving_status` changes (grep the hospitals service for `receiving_status`).
2. **`backend/src/hospitals/registry-freshness.service.ts`:**
   - **Hourly (`@Cron('0 * * * *')`):** for active facilities whose `receiving_status_updated_at` is older than 6 h, send one IN_APP notice (`eventType 'HOSPITAL_STATUS_STALE'`, deduped per facility per 6 h) to each active member of the facility's organization with role `HOSPITAL_USER`.
   - **Monthly (`@Cron('0 8 1 * *')`):** one notice per `ORG_ADMINISTRATOR` listing their facilities and resources whose `last_verified_at` is older than 90 days.
   - **Never overwrite the stored status.**
3. **Display:** in `scoreFacility`, treat a status older than 12 h as `UNKNOWN` for scoring, with the reason `Status last updated <n> h ago`. Show the same age text on the Hospitals page.

**Tests:**
- `backend/test/fleet/unit-heartbeat.spec.ts`:
  - stale detection;
  - Redis down → no stale and no throw;
  - status never written;
  - ranking penalty and reason.
- `backend/test/hospitals/referral-ranking.spec.ts`:
  - each status and capability case;
  - unknown location;
  - stale status treated as unknown;
  - the route isn't swallowed by `:id`.
- `backend/test/hospitals/registry-freshness.spec.ts`:
  - recipients scoped to the facility's org and role;
  - 6-h dedup;
  - monthly digest.

**Done when:**
- [x] The tests pass and the full suite is green. *(C6 and C8 tests; C5 has none: deferred.)*
- [ ] A unit with no GPS for 11 min shows the badge and drops in recommendations with a reason, and its status is unchanged. *(**C5 deferred, 2026-10-30, the user's decision:** idle units send no GPS at all. See the Phase 4 log.)*
- [ ] The referral dialog shows ranked hospitals with reasons. *(Built; the ranking ran on the dev database in a rolled-back transaction. The dialog itself is a walkthrough.)*
- [x] A facility untouched for 7 h triggers one notice to its hospital users. *(Checked on the dev database in a rolled-back transaction: 1 notice, none on the second run, status unchanged.)*
- [x] 100% doc updated: MOD-28 (C5 deferred), MOD-38 and MOD-39 rows, walkthrough pending.

---

## Progress log

Fill in one row when a phase ends. Put details and deviations below the table, under a heading per phase.

| Phase | Date | Result | Deviations from this plan | Still needs a person / device |
|---|---|---|---|---|
| 1 | 2026-10-30 | Done and reviewed (no defects). Backend 1227/1227, mobile 98/98, e2e 1/1; migration applied | Opt-out wired into `BarangayCallbackModule` (where `BarangayReplyService` lives), not `BarangayCoordinationModule`; poller spec's "off" cases also set `SMS_OPT_OUT_ENABLED=false`; boot checked on the already-running watch-mode backend | Push on a backgrounded responder phone; STOP from a real phone; Unsubscribe button on a phone |
| 2 | 2026-10-30 | Done and reviewed twice: same-session review (1 fix: DRAFT excluded) and independent review (2 fixes: assessment-filed triage tags now live; hidden prefilled barangay chip). Backend 1227 → 1264/1264 (79 suites), frontend 134/134, mobile typecheck clean, e2e 1/1; 2 migrations applied | Barangay match also uses the polygon-matched barangay notice; boundary-less risk areas cover their barangay; recently dismissed proposals aren't re-proposed; `GET river-level` added; `surge_settings` has a UUID id + `singleton`; proposals have `updated_at` | Surge banner walkthrough (the detector itself ran on the dev database in a rolled-back transaction); two-browser tag check, including a tag filed from the responder app's assessment; approve a proposal in the UI; MDRRMO threshold values |
| 3 | 2026-10-30 | Done and reviewed (3 fixes: a help-request reading is never superseded, supersede + insert in one transaction; one `NOTICE_INCLUDE`; a misplaced doc comment). Backend 1264 → 1360/1360 (79 → 84 suites), frontend 134/134, mobile 98/98, e2e 1/1; migration applied | `@google/genai` pinned to 2.30.0 (a 2-week-old release), not the day-old 2.32.0; SDK types via a type-only import + runtime `require` of its CommonJS build; `BarangayCallbackService` exported from `BarangayCallbackModule` (where it lives), which AiAssistModule imports; `reportBySms` opts also carry `actorRole`; the English reading is cut at 120, not rejected; a newer reading supersedes open older ones | Live eval with the real Gemini key (free tier, synthetic fixtures only); confirm `gemini-3.8-flash` and its thinking level; bad-key check; drawer walkthrough; paid-tier key + DPO sign-off before any real barangay text |
| 4 | 2026-10-30 | Done and reviewed 2026-10-31 (1 fix: the 6-h reminder dedup no longer slips to 7 h): C6 and C8; **C5 deferred** (no idle-unit GPS exists). Backend 1360 → 1406/1406 (84 → 87 suites), frontend 134 → 140/140, mobile 98/98, e2e 1/1; migration applied | Hospital users can now report receiving status (the user's decision: nobody could before); a status report stamps the time even when it confirms the same status; distance via `haversineMeters` from VERIFIED hospital locations only; `RECEIVING_STATUS_STALE_HOURS` in `shared`; monthly digest at 08:00 Manila time | Referral dialog and Hospitals page walkthrough; a hospital user reporting status; C5 needs a design decision (unit crew roster + on-duty ping, DPO if it carries location) |

### Phase 1 — 2026-10-30

**Built**
- **C1 (MOD-18/32).**
  - `backend/src/dispatch/assignment-push.ts` (new, pure): `assignmentPush(kind, incident, dispatchId, userId)`, `assignmentPushJobId`, `ASSIGNMENTS_CHANNEL = 'assignments'`, job name `responder-assignment-push`, options `attempts 3`, exponential backoff 5 s. Body: `<CATEGORY> · <public_reference>. Open AGAP to accept.` (underscores shown as spaces, e.g. `ROAD ACCIDENT`). `data` is `{ type, dispatchId }` only.
  - `DispatchService`: `create` loads `dispatch_crew` after the realtime block and queues one job per member (`assign-<dispatchId>-<userId>`). `addCrew` pushes the added user (`…-<Date.now()>`). `cancel` pushes `Assignment cancelled` / `ASSIGNMENT_CANCELLED` to the crew (`assign-cancel-<dispatchId>-<userId>`). Each is in its own `try/catch`.
  - `NotificationProcessor.sendPush` already passed `androidChannelId` through (`android.priority: 'high'`, `notification.channelId`), so it is unchanged.
  - Mobile: `assignments` channel (`AndroidImportance.MAX`) and `assignmentIdFromNotification` in `push-registration.ts`. The single listener in `_layout.tsx` checks for an assignment first → `/responder/assignment/[id]`, otherwise the incident route. `registerPushToken` already ran for every signed-in role, responders included. The 15-s poll in `useResponderAssignments.ts` is untouched.
- **C3 (MOD-53).**
  - Migration `20261030120000_sms_opt_out` contains only `ALTER TYPE … ADD VALUE IF NOT EXISTS 'OPT_OUT'`; the enum is updated in `schema.prisma`.
  - `backend/src/announcements/sms-opt-out.ts`: `isOptOut`, `phoneVariants`.
  - `AnnouncementsService.optOutBySms`: finds active rows by the 3 phone forms, `updateMany` by ID, one `UNSUBSCRIBE` audit per row, one confirmation SMS (best-effort). `unsubscribe()` now normalizes with `normalizePhPhone`, matches the 3 forms, touches only active rows and sets `opt_out_source: 'APP'`.
  - `BarangayReplyService.handleInbound`: after the duplicate check and normalization, a STOP from a sender that is neither an active barangay contact nor the override phone calls `optOutBySms`. True → store an `OPT_OUT` row (same P2002 handling, now in a shared private `store()`) and return. False → fall through unchanged. The sender lookup moved out of `decide()` into `sender()`, so both paths use the same contact rule (including the production `is_demo` filter).
  - `optOutEnabled()` (`SMS_OPT_OUT_ENABLED`, default `true`). The poller runs when `repliesEnabled() || optOutEnabled()`. Env var added to `config.validation.ts` and `.env.example` (with the "Receive SMS" note).
  - Mobile: `unsubscribeFromSms` in `announcements.api.ts`; **Unsubscribe this number** on `subscribe.tsx`, with an `Alert` confirmation and a "You're unsubscribed" screen.
- **Baseline fix:** `false_alerts: { create: jest.fn() }` added to the `$transaction` mock in `barangay-notify.spec.ts`.

**Files**
- New: `backend/src/dispatch/assignment-push.ts`, `backend/src/announcements/sms-opt-out.ts`, `backend/prisma/migrations/20261030120000_sms_opt_out/`, `backend/test/dispatch/responder-assignment-push.spec.ts`, `backend/test/announcements/sms-opt-out.spec.ts`, `mobile/src/services/push/__tests__/push-registration.test.ts`.
- Changed: `backend/src/dispatch/dispatch.service.ts`, `backend/src/announcements/announcements.service.ts`, `backend/src/barangay-coordination/{barangay-reply.service.ts,barangay-sms-poller.ts,barangay-callback.module.ts}`, `backend/src/config/config.validation.ts`, `backend/prisma/schema.prisma`, `.env.example`, `backend/test/barangay-coordination/{barangay-notify.spec.ts,barangay-reply.spec.ts}`, `mobile/app/_layout.tsx`, `mobile/app/announcements/subscribe.tsx`, `mobile/src/services/api/announcements.api.ts`, `mobile/src/services/push/push-registration.ts`, `docs/100%ModulesFunctionalities+AdditionalModules.md` (MOD-32 and MOD-53 rows, summary counts).

**Migration:** `20261030120000_sms_opt_out` applied with `prisma migrate deploy` to the local `AGAP` database; `prisma generate` run.

**Tests:** backend 1171/1172 → 1227/1227 (76 suites). Mobile 98/98 (9 suites; 3 new tests, no pre-change run). E2E 1/1. Typecheck clean in backend and mobile.

**Duplication inventory:** every artifact was **missing**: the job name, `assignment-push`, `ASSIGNMENT_CANCELLED`, the `assignments` channel, `assignmentIdFromNotification`, `isOptOut`, `phoneVariants`, `optOutBySms`, `OPT_OUT`, `SMS_OPT_OUT_ENABLED`, `unsubscribeFromSms`, `SMS_STOP`, both new specs. Reused: `notificationQueue` + `sendPush`, the existing channel block and the one response listener, `normalizePhPhone`, `unsubscribe()`, the injected `smsQueue`, `AuditAction.UNSUBSCRIBE`.

**Self-checks:** `ScheduleModule.forRoot` 1 line. `setNotificationChannelAsync('assignments'` once. One `addNotificationResponseReceivedListener` in `_layout.tsx`. `isOptOut` and `phoneVariants` defined once. `SMS_OPT_OUT_ENABLED` once in each config file. Secrets: the raw §0 C grep finds 54 hits, all `risk-intelligence` / `risk-flood…` substrings; with a word boundary (`(^|[^A-Za-z0-9])sk-`) it finds 0. Push body and data, and the confirmation SMS, carry no name, phone, address, coordinates or medical data.

**Deviations**
- `BarangayReplyService` is provided by `BarangayCallbackModule`, not `BarangayCoordinationModule`, so `AnnouncementsModule` is imported there. No cycle (K9).
- `BarangayReplyService` gained a 7th constructor argument (`AnnouncementsService`). The existing `barangay-reply.spec.ts` still builds it with 6; it never sends an opt-out keyword.
- `barangay-reply.spec.ts` poller tests: the mock gained `optOutEnabled`. The "does nothing" and "removes the scheduler" cases now also set `SMS_OPT_OUT_ENABLED=false`, because STOP processing alone now turns polling on (step 5). Their assertions are unchanged.
- The cancelled push body is `<CATEGORY> · <ref>. This assignment was cancelled; no action needed.` (the plan gave only the title). Tapping it opens nothing in particular: it has no incident ID and its type isn't `ASSIGNMENT`.
- Boot check: port 3000 was held by the user's watch-mode backend, so no second instance was started (it would share Redis and pick up live queue jobs). That process restarted at 00:38 on a `dist` that contains the Phase 1 code (including the last type fix), and `/v1/health` returns 200, so DI resolved. Its console wasn't visible, so a BullMQ jobId error wasn't checked directly; the new job IDs contain no `:`.

**Noticed, not changed (out of scope)**
- `subscribe()` upserts on the exact typed `phone_number` and doesn't clear `opt_out_source` on re-subscribe. So `09…` and `+639…` can be two rows for one person, and a re-subscribed row keeps `SMS_STOP` / `APP` as its source.
- The in-app `unsubscribe()` isn't audited; only the SMS STOP is.
- The §0 C secrets grep pattern needs a word boundary, or it always reports `risk-…` matches.

**Needs a person / device**
- Push on a **backgrounded** responder phone: dispatch to a crew member and confirm the push arrives on the "Responder assignments" channel within ~5 s and the tap opens the assignment. Also check the add-crew and cancel pushes.
- STOP from a **real, subscribed phone**: confirm it is deactivated, gets one confirmation, and the next announcement skips it. The Textbee phone needs "Receive SMS" on.
- With `SMS_OPT_OUT_ENABLED` defaulting to `true`, the inbound poll now runs whenever `TEXTBEE_API_KEY` is set, even with `BARANGAY_SMS_REPLIES_ENABLED=false`. Set it to `false` in `backend/.env` if that isn't wanted yet.
- The mobile **Unsubscribe** button on a phone.

### Review — 2026-10-30 (Prompt R, Phase 1)

Reviewed the Phase 1 files listed above (`git diff 6a7635b` on the changed files, plus the new untracked files). The hospital and transport changes in the same uncommitted tree are not part of this review.

**Result: no confirmed defects; no code changed.**

**Checked, with evidence**
- **a. Steps and Done-when.**
  - C1: `create` queues one push per stored crew row after the realtime block (`dispatch.service.ts:213-227`), `cancel` pushes the crew (`:276-286`), `addCrew` pushes the added user with a timestamped jobId (`:349-359`). The builder and jobIds are in `assignment-push.ts`.
  - Mobile: the `assignments` channel is MAX (`push-registration.ts:31-36`). `assignmentIdFromNotification` (`:50-57`) is checked first in the single listener (`_layout.tsx:112-125`). The processor passes `androidChannelId` and string-maps `data` (`notification.processor.ts:97-101`).
  - C3: the migration holds only `ADD VALUE`. `isOptOut` and `phoneVariants` are in `sms-opt-out.ts`. `optOutBySms` and `unsubscribe` are in `announcements.service.ts:806-855`. The STOP branch runs before `parseBarangayReply` and `decide` (`barangay-reply.service.ts:102-111`). The poller condition is at `barangay-sms-poller.ts:66-73`. The Unsubscribe flow is in `subscribe.tsx`.
  - All five ticked boxes are true.
- **b. Bugs.**
  - Each push is in its own `try/catch` after the transaction commits.
  - `audit.log` catches internally, so `void` is safe.
  - The duplicate check precedes the opt-out. A P2002 on store returns `DUPLICATE`.
  - A barangay contact's or the override phone's STOP takes today's path.
  - With replies off, non-STOP texts stay `DISABLED`.
  - The first poll's lookback is bounded (`since()`, `barangay-sms-poller.ts:115-121`), so turning on `SMS_OPT_OUT_ENABLED` doesn't replay the whole inbox.
  - The announcement fan-out already filters `is_active: true` (`announcements.service.ts:445`).
- **c. Duplication.**
  - Defined exactly once each: `ScheduleModule.forRoot`, `setNotificationChannelAsync('assignments'`, the response listener, `isOptOut`, `phoneVariants`, the job name, and `SMS_OPT_OUT_ENABLED` (once per config file).
  - `AnnouncementsService` is provided only by its own module and imported via `AnnouncementsModule` (no cycle).
  - One `OPT_OUT` migration.
- **d. Guardrails and privacy.**
  - The Phase 1 helpers write no incident or dispatch status.
  - Push body and data carry only the category, the public reference and the dispatch ID.
  - The confirmation SMS is 86 characters with no personal data.
  - Secrets grep, with the word-boundary `sk-` pattern and `AIza`: 0 hits. No code logs a key value.
- **e. Tests.**
  - `responder-assignment-push.spec.ts` asserts job contents, jobIds, options and absence of private data, plus all three queue-failure paths returning the dispatch or crew.
  - `sms-opt-out.spec.ts` uses an in-memory subscriber table that filters like Prisma. It asserts the row state, a single confirmation, that the parser is never called, and no notice access for a subscriber's STOP.
  - No existing assertion was weakened: the two poller cases only gained `SMS_OPT_OUT_ENABLED=false`, as recorded above.

**Verification (§0 D):** typecheck clean (backend, mobile). Backend 1227/1227 (76 suites), mobile 98/98 (9 suites), e2e 1/1. `prisma migrate status`: up to date (24 migrations). Boot: not started a second time; the user's watch-mode backend runs a `dist` built at 09:40–09:41 containing both Phase 1 files, and `/v1/health` returns 200.

**Left open (low; not fixed)**
- **R1. Opt-out before the inbound row** (`barangay-reply.service.ts:104-109`). If storing the row fails with a non-P2002 database error after `optOutBySms` committed, the next poll sees the subscriber already inactive. The message then falls through and is logged as `UNKNOWN_SENDER`/`DISABLED`. The person is still unsubscribed and confirmed once; only the log label is wrong. A fix would need one transaction across two services, for a label.
- **R2. Public unsubscribe endpoint** (`announcements.controller.ts:82-88`, pre-existing). It's `@Public()`, so anyone can stop announcements to any number; Phase 1 widened it to match all three phone formats. It's throttled, and the response doesn't reveal whether the number was subscribed. Possible follow-up: a confirmation SMS or an OTP.
- **R3. Reassign** (`dispatch.service.ts:301-312`, pre-existing). It cancels and re-creates without crew. The old crew now gets "Assignment cancelled" (accurate), and the new dispatch has no crew, so no assignment push until crew are added (`addCrew` pushes them).
- **R4. Repeat cancel** (pre-existing). `cancel()` has no status check. The deterministic cancel jobId stops a second push only while BullMQ still keeps the finished job.
- The device checks above are unchanged.

### Phase 2 — 2026-10-30

Run in the same session as the Phase 1 review (not a fresh one), at the user's request. The backend baseline is that review's run: 1227/1227, with no code changed in between.

**Built**
- **C2 (MOD-52), surge recommendation.**
  - Migration `20261030130000_surge_recommendation`: `surge_rules` (CHECKs: window 5–1440 min, minimum ≥ 1) seeded with `VOLUME` 30 min/8, `FLOOD_CLUSTER` 30/5 FLOOD Lolomboy/Bunlo/Igulot/Bambang, `INDUSTRIAL` 15/2 Bundukan/Biñang 1st (`ON CONFLICT (rule_key) DO NOTHING`), and the single-row `surge_settings`.
  - `surge-recommendation.ts` (pure): event type `SURGE_RECOMMENDED`, `RIVER_LEVEL`, 11.50 m, 6-h reading age, 60-min dedup, the non-counting statuses, `surgeRecommendationText`.
  - `surge-detector.service.ts`: `@Cron('*/5 * * * *') evaluate()`. It skips while a surge is ACTIVE. For each active rule it runs `incident.count` (window, status not CANCELLED/FALSE_ALERT/DUPLICATE, category, barangays), plus the river check. Dedup is a `notification.findFirst` with a JSON path filter on `data_payload.ruleKey` within 60 min. Recipients come from `findEscalationRecipients(prisma, ['SUPERVISOR'])`, via `NotificationsService.create` (IN_APP) and `RealtimeService.surgeRecommended`. Each rule has its own `try/catch` inside the run's. It never calls `activate` and writes no incident.
  - `surge-rules.service.ts` + `dto/surge-rules.dto.ts`: `GET /v1/disaster-mode/rules`, `PATCH /v1/disaster-mode/rules/:id` (barangays checked against `geo_regions`, stored with the official spelling, audited `surge_rule`), `PUT /v1/disaster-mode/river-level` (audited `surge_settings`), and `GET /v1/disaster-mode/river-level` (Dispatcher and Supervisor; the others are Supervisor only).
  - Web (`operations/surge/page.tsx`, `features/surge/{api,hooks}.ts`): a "Surge mode recommended" banner fed by the newest unread `SURGE_RECOMMENDED` notice from the last 3 h. `surge.recommended` refreshes the notifications query. **Review & activate** opens the existing `ActivateDialog`, now with an optional prefill (name, description = the notice body, category, barangays, river level); a successful activation, or **Dismiss**, marks the notice read. Also a river-level card and a rules card with an edit dialog (barangay chips from `useBarangays()`). `NotificationBell` routes `SURGE_RECOMMENDED` (list and toast) to `/operations/surge` (K3).
- **C2, live triage tags.** `DisasterModeService` takes an optional `RealtimeService` (4th argument). `createTriageTag` and `updateTriageTag` emit `surge.triage_tag_updated { surgeId, tagId }` after the write. `socket-provider.tsx` invalidates `['surge-triage']` and `['surge-state']`; the `refetchInterval`s are kept.
- **Events:** `shared/src/events/surge.events.ts` (`SURGE_EVENTS`, both payload types), exported from `index.ts`, and added to `AgapEventName` and the payload map. `RealtimeService.surgeRecommended` and `.triageTagUpdated` (`this.safe` + `emitToOps`). Shared rebuilt (K2).
- **C7 (MOD-51), hotspot proposals.**
  - Migration `20261030130100_risk_area_proposals`: `risk_area_proposal_status` enum, a table with an FK to users and risk_areas, a partial unique index `(risk_type, COALESCE(barangay,''))` WHERE PENDING, plus a status index and a GIST index.
  - `hotspot-discovery.service.ts`: `@Cron('30 2 * * *') discover()`, one tagged-template `$queryRaw`. It clusters with `ST_ClusterDBSCAN` (eps 150, minpoints 4) on `ST_Transform(point::geometry, 32651)` over 90 days, excluding FALSE_ALERT/DUPLICATE/CANCELLED, partitioned by category. The hull is `ST_Buffer(ST_ConvexHull, 30)`. The barangay is the `geo_regions` polygon covering the hull's centroid. It skips covered and recently dismissed clusters, groups per type and barangay, and upserts `ON CONFLICT … DO UPDATE`.
  - Review: `listProposals`, plus `approve`, which claims PENDING → APPROVED, calls `RiskIntelligenceService.createArea` (barangay check and its own audit), copies the boundary with `$executeRaw`, sets `risk_area_id` and audits `risk_area_proposal`. If `createArea` throws, the claim is released. `dismiss` is audited. Routes: `GET /v1/risk-intelligence/proposals?status=`, `POST …/proposals/:id/approve` `{ name, riskLevel, description? }`, `POST …/proposals/:id/dismiss`, all System Administrator.
  - Web: a **Proposed areas** section on Administration → Risk Areas (`RiskAreasTab.tsx`; it renders nothing when empty), with an Approve dialog (name prefilled, level) and Dismiss.

**Files**
- New:
  - `backend/prisma/migrations/{20261030130000_surge_recommendation,20261030130100_risk_area_proposals}/`
  - `backend/src/disaster-mode/{surge-recommendation.ts,surge-detector.service.ts,surge-rules.service.ts,dto/surge-rules.dto.ts}`
  - `backend/src/risk-intelligence/{hotspot-discovery.service.ts,dto/risk-area-proposal.dto.ts}`
  - `shared/src/events/surge.events.ts`
  - `backend/test/disaster-mode/{surge-detector.spec.ts,surge-rules.spec.ts}`
  - `backend/test/risk-intelligence/hotspot-discovery.spec.ts`
- Changed:
  - `backend/prisma/schema.prisma` (3 models, 1 enum, back-relations on `User` and `risk_areas`)
  - `backend/src/disaster-mode/{disaster-mode.module.ts,disaster-mode.controller.ts,disaster-mode.service.ts}`
  - `backend/src/risk-intelligence/{risk-intelligence.module.ts,risk-intelligence.controller.ts}`
  - `backend/src/realtime/realtime.service.ts`
  - `shared/src/events/{index.ts,websocket-event.types.ts}`
  - `frontend/app/(ops)/operations/surge/page.tsx`, `frontend/features/surge/{api.ts,hooks.ts}`, `frontend/features/risk/{api.ts,hooks.ts}`, `frontend/components/admin/RiskAreasTab.tsx`, `frontend/components/layout/NotificationBell.tsx`, `frontend/providers/socket-provider.tsx`
  - `docs/100%ModulesFunctionalities+AdditionalModules.md` (MOD-51 and MOD-52 rows, summary counts)

**Migrations:** both applied with `prisma migrate deploy` to the local database; `prisma generate` run. Seed checked: 3 rules, 1 settings row, and all 6 seeded barangay names match `geo_regions` exactly (K11).

**Tests:** backend 1227 → 1264/1264 (76 → 79 suites; `surge.spec.ts` untouched and passing). Frontend 134/134 (no pre-change run; no frontend tests added). Mobile typecheck clean (shared changed). E2E 1/1. Typecheck clean in backend and frontend.

**SQL checked on PostGIS.** The `discover()` SQL is not covered by the mocked unit tests. It was run on the dev database inside a transaction that was always rolled back (`ROLLBACK`; nothing kept). With synthetic incidents:
- 5 FLOOD within about 60 m in Bunlo produced one Bunlo proposal (about 7,200 m²);
- 3 scattered FLOOD and 4 FALSE_ALERT FIRE produced nothing;
- an active Bunlo FLOOD area without a boundary suppressed it;
- a second run refreshed the same row;
- a dismissed proposal was not re-proposed.

Run on the real data, it wrote 0 rows: there are no clusters yet.

**Duplication inventory:** every Phase 2 artifact was **missing** (tables, services, events, routes, cron jobs, `SURGE_RECOMMENDED`, the specs). Partial overlap: `surge_incidents.bocaue_river_level` stores the reading at activation; the new `surge_settings.river_level_m` is the latest reading between surges, and it prefills that field. Reused: `findEscalationRecipients`, `NotificationsService.create` (`NotificationsModule` was already imported into `DisasterModeModule`), `RealtimeService`, `ActivateDialog`, `RiskIntelligenceService.createArea`, `useBarangays`, `useMarkRead`, `useNotifications`.

**Self-checks:**
- `activate(` in the detector: 0. Each surge event is defined once in `shared/src/events`.
- `ScheduleModule.forRoot`: 1. Each module provides only its own services.
- `SURGE_RECOMMENDED` is defined once (the frontend compares the string, like `ANNOUNCEMENT`).
- Secrets grep: 0.
- Notices, events and the banner carry counts, categories and barangay names only.
- The triage event carries IDs only.

**Boot:** not started a second time (port 3000 is the user's watch-mode backend, sharing Redis). That process rebuilt with all three new services (`dist` 10:49–10:55). `/v1/health` returns 200, and `rules`, `river-level` and `proposals` answer 401 (mounted and guarded), so DI resolved. Its console isn't visible. **Note:** that dev backend now runs the 5-minute surge check and the 02:30 hotspot job against the dev database.

**Deviations**
- **Barangay matching:** a rule's barangays match either `incident_locations.barangay` (geocoder text) **or** the incident's polygon-matched `incident_barangay_notices` → `geo_regions.name`, so a geocoder spelling ("Binang 1st") never hides a cluster. The plan named only `incident_locations.barangay`.
- **Coverage:** an active risk area **without** a boundary covers clusters of its type in its barangay. Most existing areas have no boundary, so `ST_Intersects` alone would re-propose them every night.
- **Dismissed proposals** of the same type and barangay reviewed in the last 90 days are not re-proposed. Otherwise a dismissed hotspot would come back the next night.
- **Proposal barangay** is the polygon covering the cluster's centroid (null when outside every barangay), so `createArea`'s barangay check always accepts it. One proposal per type and barangay: several clusters there are merged (summed count, unioned boundary).
- **`surge_settings`** has a UUID id plus a unique, CHECKed `singleton` column, not a numeric single row, because `audit_logs.entity_id` is a UUID.
- **`risk_area_proposals.updated_at`** was added, so the list can show when a proposal was last refreshed.
- **`GET /v1/disaster-mode/river-level`** was added (the page has to show the current reading). The plan listed only the PUT.
- **Dedup is "any notice"**, not per recipient. When there's no Supervisor, `findEscalationRecipients` falls back to Dispatchers (its existing rule), who can see the banner trigger but can't activate.
- **Banner freshness:** an unread recommendation older than 3 h no longer shows as a banner; it stays in the bell.

**Noticed, not changed**
- `ActivateDialog`'s hard-coded `BOCAUE_BARANGAYS` list includes names not in `geo_regions` (e.g. "Bocaue", "Santa Cruz", "Poblacion"), so a surge can be activated with a barangay the rest of the system doesn't know. The rules editor uses the official list.
- The 11.50 m critical level is now a backend constant (`BOCAUE_RIVER_CRITICAL_M`), but the surge page and `RiskAreasTab` still each hard-code 11.5. A shared constant would make it one source.
- The System Administrator can open the surge page (status is allowed) but gets 403 on `river-level`; the card then shows "—".

**Needs a person / device**
- Seed 5 FLOOD incidents in Bunlo within 30 min (or enter a river level ≥ 11.50 m). Within 5 min each Supervisor should get one notice and see the banner, with no surge activated. Review & activate opens the form prefilled.
- Two browsers on the surge page during an active surge: a responder files or changes a triage tag, and both update within about 2 s.
- Approve a proposal in Administration → Risk Areas once one exists (or after seeding a cluster), and check the risk area has a boundary and both audit rows.
- MDRRMO to confirm or edit the three default thresholds.

### Review — 2026-10-30 (Prompt R, Phase 2)

**Not independent:** the same session that built Phase 2 ran this review, minutes later. Facts were re-checked against the code and the database rather than taken from memory, but a fresh-session Prompt R would still be the stronger check.

**Result: 1 defect fixed; 5 low items left open.**

**Fixed**
- **F1. DRAFT incidents counted.** The surge rules (`NON_COUNTING_STATUSES`, `surge-recommendation.ts`) and the hotspot SQL (`hotspot-discovery.service.ts`, the `pts` CTE) excluded CANCELLED/FALSE_ALERT/DUPLICATE but not DRAFT. Analytics already treats DRAFT as not reported (`analytics.service.ts:14`, `NOT_REPORTED`). Nothing creates DRAFT incidents today, so this was latent, but an unsubmitted draft must not count toward a surge or a hotspot. DRAFT was added to both, and the two spec assertions updated to match (stricter, not weaker).

**Checked, with evidence**
- **a. Steps and Done-when.**
  - C2 steps 1–5 and C7 steps 1–4 are present: the migrations, `surge-detector.service.ts`, `surge-rules.service.ts`, the controller routes, the surge page banner, river card and rules card, the triage emits in `disaster-mode.service.ts` (`createTriageTag`/`updateTriageTag`), `socket-provider.tsx`, `hotspot-discovery.service.ts`, the proposal routes and `RiskAreasTab.tsx` → `ProposedAreas`.
  - The two ticked boxes are true (full suites green; MOD-51/52 rows and the summary counts updated). The three unticked boxes are walkthroughs.
- **b. Bugs.**
  - The detector's Prisma filters (the JSON-path dedup `data_payload: { path: ['ruleKey'], equals }`, and the rule count with `incident_locations: { is }` OR `barangay_notices: { some }`) were run read-only against PostgreSQL with the app's client setup; both execute.
  - The `@Cron` wrapper was checked in `@nestjs/schedule` (`wrapFunctionInTryCatchBlocks` → `methodRef.call(instance, ...args)`) and `cron` 3.2.1 (`callback.call(this.context, this.onComplete)`; `onComplete` is undefined when unset). So `this` is bound and `evaluate(now = new Date())` gets its default.
  - The approve path's boundary copy and the `ST_Intersects` skip (an area **with** a boundary, barangay NULL) were run in a rolled-back transaction: the boundary was copied (about 6,500 m²), and the re-discovery after approval wrote 0 rows. The earlier cluster, refresh and dismiss checks still pass with the DRAFT change.
  - The unread banner matches the bell's rule (`status === 'PENDING'`; `findAll` returns full rows, so `data_payload` is there).
  - Route order: no new `GET :id` conflicts.
- **c. Duplication.**
  - Each surge event is defined once. `SURGE_RECOMMENDED` is defined once. One `ScheduleModule.forRoot`. Each module provides only its own services.
  - The "must reuse" items are reused: `findEscalationRecipients`, `NotificationsService.create`, `RealtimeService`, `ActivateDialog`, `createArea`.
- **d. Guardrails and reliability.**
  - The detector never calls `activate` and writes no incident.
  - Discovery writes only `risk_area_proposals`.
  - A risk area is created only in `approve()` (a System Administrator's request).
  - Every job path is in `try/catch` and returns 0.
  - Notices and events carry counts, categories and barangay names only; the triage event carries IDs only.
  - Secrets grep: 0.
- **e. Tests.**
  - The specs assert notice contents, recipients, window math, dedup arguments, river age and threshold, the active-surge no-op, per-rule isolation, the approve claim and release, audit values, roles and DTO limits.
  - The hotspot SQL is asserted by text only in Jest; its behaviour is covered by the rolled-back PostGIS runs.
  - `surge.spec.ts` is unchanged; no assertion was weakened.

**Verification (§0 D):** typecheck clean (backend). Backend 1264/1264 (79 suites; F1 changed assertions, not counts), frontend 134/134, e2e 1/1. `prisma migrate status`: up to date (26). Boot: the watch-mode backend rebuilt at 11:30 with the fix, and `/v1/health` returns 200. Shared and the frontend were unchanged by the review.

**Left open (low; not fixed)**
- **O1. Approve after `createArea`** (`hotspot-discovery.service.ts`, `approve`). If the boundary `UPDATE` or the `risk_area_id` link fails after the area was created, the proposal stays APPROVED with no link and the area has no boundary; it can't be retried from the UI. Rare (two single-row writes); the fix would wrap both and log.
- **O2. Cron argument coupling.** `evaluate(now = new Date())` relies on `cron` passing `undefined` as the first argument. That's true today, but a future `onComplete` would break it silently (the catch would log every run). Safer: a `@Cron` `tick()` that calls `evaluate()`.
- **O3. Barangay lookup copied.** `SurgeRulesService.resolveBarangays` repeats `RiskIntelligenceService.resolveBarangay`'s `geo_regions` lookup (a list instead of one name). A shared helper would make it one place.
- **O4. Stale PENDING proposal.** If an administrator later adds a covering risk area by hand, the existing PENDING proposal stays listed until dismissed (the nightly upsert never withdraws a proposal).
- **O5. Cron time zone.** `30 2 * * *` and `*/5` use the server's local time, like the existing analytics cron. In a UTC container, 02:30 is 10:30 in the Philippines.
- The "Noticed, not changed" items and the person/device checks above are unchanged.

### Review — 2026-10-30 (Prompt R, Phase 2, independent)

A fresh session that didn't build Phase 2. Scope: the Phase 2 files listed above (`git diff` on the changed files, plus the new untracked files). The hospital and transport changes in the same diff of `realtime.service.ts`, `socket-provider.tsx` and the shared events aren't part of this review.

**Result: 2 defects fixed; the 5 earlier open items still stand, and 3 more low items are added.**

**Fixed**
- **F2. Triage tags from the responder app didn't update the board live.** The responder app files START tags only through the on-scene assessment (`mobile/src/services/api/assessments.api.ts:32` → `POST /v1/incidents/:id/assessment`). `AssessmentService.submit` creates a `triage_tags` row during an active surge (`backend/src/incidents/assessment/assessment.service.ts`, inside the transaction) but sent no `surge.triage_tag_updated`. Only `DisasterModeService.createTriageTag`/`updateTriageTag` sent it. So the step 5 "live triage tags" item and the "second browser within ~2 s" check would fail for tags that responders file, and the board would wait for its 60-s refetch.
  - Fix: the transaction now returns the tag it created. After the commit, `submit` calls `realtime.triageTagUpdated({ surgeId, tagId })`, which is best-effort through `this.safe`.
  - `test/incidents/assessment.spec.ts`: the realtime mock gained `triageTagUpdated`. The surge-tag test asserts the event with IDs only, and the no-surge test asserts it isn't sent. No assertion was removed.
- **F3. A prefilled barangay could be hidden in the activate form.** `ActivateDialog` draws its barangay chips from the hard-coded `BOCAUE_BARANGAYS`. That list lacks official names such as Antipona, Bagumbayan, Caingin, Duhat, Sulucan and Taal (`backend/prisma/seed/barangay-directory.ts`). A rule edited to one of those (the editor uses `useBarangays()`) prefilled it as selected but drew no chip, so the Supervisor couldn't see or remove it before activating.
  - Fix: the chips are the union of the list and the prefill's barangays (`frontend/app/(ops)/operations/surge/page.tsx`, `barangayChoices`).
  - The list itself is still the earlier "Noticed, not changed" item.

**Checked, with evidence**
- **a. Steps and Done-when.**
  - C2 steps 1–5 and C7 steps 1–4 are present, at the places the first review lists.
  - Live check on the dev database (scratchpad script, compiled `dist/disaster-mode/surge-detector.service.js`, one Prisma interactive transaction, always rolled back). The dev database has 1 Supervisor and no active surge.
    - 4 SUBMITTED FLOOD incidents in Bunlo, plus 1 FALSE_ALERT and 1 DRAFT → `evaluate()` returned 0.
    - One more SUBMITTED → 1 notice (to the 1 Supervisor) and 1 `FLOOD_CLUSTER` event, with the expected body.
    - A second run → 0. The JSON path dedup works on real rows.
    - No surge was active afterwards.
  - On that evidence, the second Done-when box is now ticked. The other two unticked boxes still need a person.
- **b. Bugs.**
  - Window math: `created_at` is `timestamptz`, and Prisma sends UTC with `-c timezone=UTC`.
  - The river check reads a `Decimal` via `Number()`, and the 6-h age is checked.
  - Dedup is keyed on `ruleKey` within 60 min.
  - The `ON CONFLICT` target matches the partial index. `GROUP BY category, barangay` gives one row per conflict key, so `DO UPDATE` can't hit a row twice.
  - Approve claims the proposal before `createArea` and releases it on failure.
  - No new route sits behind a `:id` route.
- **c. Duplication.**
  - `ScheduleModule.forRoot`: 1. `activate(` in the detector: 0.
  - Each surge event is defined once (`shared/src/events/surge.events.ts:3,5`).
  - Each module provides only its own services.
  - F2 reuses `RealtimeService.triageTagUpdated` rather than adding an emit.
- **d. Guardrails and privacy.**
  - The detector writes only notifications. Discovery writes only `risk_area_proposals`, and a risk area is created only in `approve()`.
  - The triage event carries IDs only.
  - Secrets grep (word-boundary pattern): 0.
- **e. Tests.**
  - The three Phase 2 specs assert contents, filters, dedup arguments, the claim and release, audit values and roles, not just that a mock was called.
  - The hotspot SQL is asserted by text only in Jest; the PostGIS runs in the first review cover its behaviour.
  - `surge.spec.ts` is untouched.

**Verification (§0 D):**
- Typecheck clean (backend; frontend with `tsc --noEmit --incremental false`). Shared is unchanged, so no rebuild.
- Backend 1264/1264 (79 suites; F2 added assertions to existing tests, so the count is unchanged). Frontend 134/134. E2E 1/1.
- `prisma migrate status`: up to date (26).
- Boot: no second backend was started. The watch-mode backend rebuilt `dist/incidents/assessment/assessment.service.js` with the fix at 12:01. `/v1/health` returns 200 and `/v1/disaster-mode/rules` returns 401.

**Left open (low; not fixed)**
- **O6. The banner sees only the newest 30 notices.** `useSurgeRecommendation` filters `useNotifications(1)` (`fetchNotifications` default `perPage = 30`). Thirty newer notices for that Supervisor (for example dispatch progress notices for a Supervisor who dispatches during a busy hour) push the recommendation off page 1, and the banner disappears while the notice is still unread. It comes back with the next trip after the 60-min dedup. Fix: an `eventType` filter on `GET /v1/notifications` for the banner query.
- **O7. Rule counts aren't isolated per rule.** Only the notice step (`recommend`) has its own `try/catch`. If one rule's `incident.count` throws, that tick skips the remaining rules and the river check (the run's outer catch logs it). The first build note ("each rule has its own `try/catch`") overstates this. A count failure is almost always a database outage, which would fail the other rules anyway.
- **O8. A stale comment.** `RiskIntelligenceService.deleteArea` says "nothing else references risk areas". `risk_area_proposals.risk_area_id` now does, with `ON DELETE SET NULL`, so the delete still works.
- O1–O5 above still stand. The person/device checks are unchanged, apart from the seeded-burst check now done in a rolled-back transaction.

### Phase 3 — 2026-10-30

Run in the same session as the independent Phase 2 review and the commit `311eb7c` (not a fresh one), at the user's request. Baseline: backend suite green on `311eb7c` (exit 0; the same tree ran 1264/1264 earlier that day).

**Free tier (recorded as the plan requires).** The `GEMINI_API_KEY` is a free-tier key. So:
- `.env.example` keeps `AI_ASSIST_ENABLED=false`.
- **Real barangay texts must not go to Gemini until the key is paid tier** and the DPO signs off (AI plan Phase 0). On the free tier Google may use prompts and responses to improve its products, and human reviewers may read them.
- The eval runs on the synthetic fixtures only. In a demo, turn the flag on only with test texts from the team's own phones, never with a real incident or a real barangay's reply.
- `RATE_LIMITED` failures under the free tier's per-minute limit are normal, not a bug.

**Built**
- **Step 1, show unparsed replies.** `BarangayReplyService.decide`: an `UNPARSED` reply from a known sender is linked to the one open notice of the sender's barangays (`singleOpenNotice`, `take: 2`, so zero or several open notices link nothing). The override phone counts every barangay's open notices. The inbound row stores `notice_id`, and `emitUpdated` refreshes the drawer's message log (it already reads by `notice_id`). The outcome stays `UNPARSED`; the auto-reply hint is unchanged.
- **Step 2, foundation.**
  - Env: `AI_ASSIST_ENABLED`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_ASSIST_TIMEOUT_MS` (8000), `AI_ASSIST_DAILY_LIMIT` (500), each once in `config.validation.ts` and `.env.example`. Boot check: the flag on with no key or no model refuses to boot.
  - `@google/genai` **2.30.0**, pinned exactly (`backend/package.json`).
  - `backend/src/ai-assist/`:
    - `ai-assist.flags.ts`: `aiAssistEnabled(config)` (K10);
    - `ai-assist.jobs.ts`: the pure job contract (`reply-<inboundId>`, `BARANGAY_SMS_SUBJECT`);
    - `ai-client.service.ts`: the only `@google/genai` importer. Client built on first call, `retryOptions.attempts: 1`, an `AbortController` timeout, `responseJsonSchema` + `temperature: 0`, a thinking setting per model generation, JSON parse + Zod check, error codes only. Daily limit per Philippine day; `DAILY_LIMIT` rows don't count;
    - `redact.ts`: `redactForAi` (roadmap §5.4);
    - `prompts/barangay-reply.prompt.ts`: the labels (`BARANGAY_LINK_STATUSES` + `UNCLEAR`), Zod schema, hand-written JSON schema and instructions;
    - `ai-task-runner.service.ts`, `ai-suggestions.service.ts`, `ai-suggestions.controller.ts` and `ai-assist.module.ts`, registered in `app.module.ts`.
  - Migration `20261030140000_ai_suggestions` (full kind and status enums, 3 indexes, FKs to incidents and users), plus the model in `schema.prisma`.
  - `AI_ASSIST: 'ai-assist'` in `shared/src/constants/queue.constants.ts` (`.ts` only; shared rebuilt).
  - `jobs/processors/ai-assist.processor.ts` (concurrency 1), registered with its queue in `jobs.module.ts`.
  - `shared/src/events/ai.events.ts`: `ai.suggestion_created` (IDs and status only), plus `RealtimeService.aiSuggestionCreated` to the ops room.
- **Step 3, trigger.** After the row is stored, only `UNPARSED` with a `notice_id` and `aiAssistEnabled` queues `barangay-reply` / `reply-<inboundId>` (`attempts: 1`), inside its own `try/catch`. Exact codes, unknown senders, opt-outs and unlinked replies never queue.
- **Step 4, runner.**
  - It sends only `redactForAi(body, 500)` with the instructions and both schemas.
  - It skips a missing, non-`UNPARSED`, unlinked or closed-case reply, and a reply that already has a row.
  - `UNCLEAR` or confidence < 0.6 → `INFO`; otherwise → `PENDING_REVIEW`; a failure → `FAILED` with its code.
  - A new reading supersedes the case's open older ones (`SUPERSEDED`).
  - It emits `ai.suggestion_created` and never throws.
- **Step 5, accept and dismiss.**
  - `reportBySms(notice, status, opts?)`. With `opts`, the report is recorded under the dispatcher: `last_report_by_user_id`, the timeline actor and the audit `actorId`, plus `aiSuggestionId` and a timeline note. Without `opts` nothing changes.
  - Accept checks before anything is claimed. It's refused for a non-`PENDING_REVIEW` row (`INFO`, `FAILED`, `DISMISSED`, or already accepted) and for a closed notice. It then claims the row, calls `reportBySms` (so `NEEDS_BACKUP` still escalates), releases the claim if that fails, and audits (`ai_suggestion`, `MOD-46`).
  - Dismiss works on `PENDING_REVIEW` or `INFO` rows and is audited.
  - Routes, Dispatcher and Supervisor only: `GET /v1/incidents/:id/ai-suggestions`, `POST /v1/ai-suggestions/:sid/accept|dismiss`.
- **Step 6, fixtures and eval.**
  - `backend/test/ai-assist/fixtures/barangay-replies.json`: 46 replies (5 exact codes, 41 free text, 11 asking for help, 8 unclear), revised at the user's request.
  - `scripts/dev/eval-barangay-replies.js` loads the backend's own TypeScript through `ts-node`, so the eval uses the same client, redaction, instructions and schema as the runner. It reads only `GEMINI_API_KEY` and `GEMINI_MODEL` (via `dotenv.parse`), never prints the key, waits 6.5 s between calls, retries a `RATE_LIMITED` call once after 65 s, and exits 1 if accuracy is under 90% or any help request reads as calm.
  - **Not run against the real API.** Checked offline: the loading path works and the client returns `DISABLED` with the flag off.
- **Step 7, web.**
  - `frontend/hooks/useAiAssist.ts` (`useAiSuggestions`, `useAcceptSuggestion`, `useDismissSuggestion`).
  - An "AI suggestion" card in `BarangayPanel.tsx` under the barangay status: *Barangay texted: "…" · AI reads this as **On scene** · "…"*, with Accept and Dismiss. `INFO` shows the English reading only, with no Accept. It renders nothing without rows.
  - The Barangay tab's red dot also shows while a suggestion is `PENDING_REVIEW`.
  - `socket-provider.tsx` handles `ai.suggestion_created`, and `barangay.notice_updated` also refreshes the suggestions, so an accepted card disappears on every screen.
- **Step 8, tests** (`backend/test/ai-assist/`, `@google/genai` mocked; no test calls Gemini):
  - `ai-client.spec.ts`: off in 4 ways, with no client built; the call shape; every error code (timeout, 429, 401/403, a bad-key 400, other 4xx/5xx, 3 safety blocks, 5 invalid outputs); the daily limit, including its filter; helpers.
  - `barangay-reply-prompt.spec.ts`: redaction of the 5 phone forms, emails and coordinates; the JSON schema and Zod enums agree; the fixtures' coverage, that RULE fixtures are parsed by the rule parser, and that AI fixtures never are.
  - `ai-task-runner.spec.ts`: redacted input only; `PENDING_REVIEW`, `INFO` and `FAILED` per code; the skip cases; idempotency; never throws.
  - `ai-suggestions.spec.ts`: accept → `reportBySms` with the actor; accept twice, `INFO`, `FAILED`, a race and a closed case are all refused; the claim is released; dismiss; list; roles; `reportBySms` with opts keeps the escalation, and without opts is unchanged.
  - `barangay-reply-linking.spec.ts`: the single-open-notice rule (one, several, none, two barangays, override); flag off → no job, and barangay handling unchanged; flag on → one `reply-<id>` job; no job for codes, unknown senders, several notices or opt-outs; a queue failure; the boot check.

**Files**
- New:
  - `backend/src/ai-assist/{ai-assist.flags.ts,ai-assist.jobs.ts,ai-client.service.ts,redact.ts,ai-task-runner.service.ts,ai-suggestions.service.ts,ai-suggestions.controller.ts,ai-assist.module.ts,prompts/barangay-reply.prompt.ts}`
  - `backend/src/jobs/processors/ai-assist.processor.ts`
  - `backend/prisma/migrations/20261030140000_ai_suggestions/`
  - `shared/src/events/ai.events.ts`
  - `backend/test/ai-assist/{ai-client,barangay-reply-prompt,ai-task-runner,ai-suggestions,barangay-reply-linking}.spec.ts`
  - `backend/test/ai-assist/fixtures/barangay-replies.json`
  - `scripts/dev/eval-barangay-replies.js`
  - `frontend/hooks/useAiAssist.ts`
- Changed:
  - `backend/package.json` and `pnpm-lock.yaml` (`@google/genai`), `pnpm-workspace.yaml` (`'@google/genai': false` under `allowBuilds`)
  - `.env.example`, `backend/src/config/config.validation.ts`, `backend/prisma/schema.prisma`, `backend/src/app.module.ts`, `backend/src/jobs/jobs.module.ts`, `backend/src/realtime/realtime.service.ts`
  - `backend/src/barangay-coordination/{barangay-reply.service.ts,barangay-callback.service.ts,barangay-callback.module.ts}`
  - `shared/src/constants/queue.constants.ts`, `shared/src/events/{index.ts,websocket-event.types.ts}`
  - `frontend/components/incidents/{BarangayPanel.tsx,IncidentDetailDrawer.tsx}`, `frontend/providers/socket-provider.tsx`
  - `backend/test/barangay-coordination/barangay-reply.spec.ts` and `backend/test/announcements/sms-opt-out.spec.ts` (mocks only, see Deviations)
  - `docs/plans/AI_ASSIST_PLAN.md` (checkboxes), `docs/100%ModulesFunctionalities+AdditionalModules.md` (A1 row)

**Migration:** `20261030140000_ai_suggestions` applied with `prisma migrate deploy`; `prisma generate` run. `prisma migrate diff` from the database to the schema prints an empty migration (no drift).

**Tests:** backend 1264 → 1360/1360 (79 → 84 suites). Frontend 134/134, mobile 98/98 (no new tests in either; both re-run because `shared` changed). E2E 1/1. Typecheck clean in backend, frontend and mobile.

**Duplication inventory:** every Phase 3 artifact was **missing**: the `ai-assist/` files, `ai_suggestions` and its enums, `AI_ASSIST`, the `GEMINI_*`/`AI_ASSIST_*` env vars, `@google/genai`, `ai.suggestion_created`, `useAiAssist`, `aiAssistEnabled`, `redactForAi`, the eval script, the fixtures. Reused: `BARANGAY_LINK_STATUSES`, `reportBySms` (extended, not copied) and its NEEDS_BACKUP escalation, the message log's `notice_id` read, `NOTICE_INCLUDE`/`LinkedNotice`, `RealtimeService`, `AuditService`, `parseBarangayReply`, `useBarangay.ts` as the hook pattern, `BARANGAY_REPORT` labels in the card.

**Self-checks:**
- `from 'openai'`: 2 files (unchanged). `@google/genai`: 1 file (`ai-client.service.ts`), pinned without `^`/`~`.
- Each new env var is defined once in each config file. `ScheduleModule.forRoot`: 1. `ai.suggestion_created` and `AI_ASSIST` are each defined once.
- No other module's service is in `AiAssistModule`'s providers.
- Secrets grep (§0 C pattern): 0. No code logs the key; the eval's one mention is its "set GEMINI_API_KEY" help line.
- Guardrails: nothing in `ai-assist/` writes an incident, a dispatch or a notice; a report is recorded only on a dispatcher's Accept.
- Only the redacted reply body goes to Gemini (no incident data, no phone number). The event carries IDs and status only.

**Boot:** no second backend (the user's watch-mode backend holds port 3000 and Redis). It rebuilt every changed file (`dist` newer than `src`, with the final code). `/v1/health` returns 200, and `GET /v1/incidents/:id/ai-suggestions` and `POST /v1/ai-suggestions/:sid/accept` return 401 (mounted and guarded), so DI resolved with `AiAssistModule`. Its console isn't visible.

**Deviations**
- **SDK version:** 2.30.0 (published 2026-10-15) instead of the current 2.32.0 (published the day before). A release that has been out two weeks is the safer supply-chain choice for the package that holds the API key.
- **pnpm build gate:** pnpm 12 refused the install because `@google/genai` has an install script. That script is `echo 'preinstall: no-op'` and the package ships `dist/`, so `pnpm-workspace.yaml` lists `'@google/genai': false` under `allowBuilds`, and `pnpm install --frozen-lockfile` passes. The lockfile diff is large (+376/−2780) because pnpm re-keyed existing entries with the `supports-color` peer. A package@version comparison against `HEAD` shows only 3 additions (`@google/genai@2.30.0`, `p-retry@4.6.2`, `@types/retry@0.12.0`) and **no version changes**.
- **ESM typings:** the SDK is `"type": "module"`, so TypeScript (node16) reads its typings as ESM. `ai-client.service.ts` takes the types through `import type … with { 'resolution-mode': 'import' }` and the class through `require('@google/genai')`, which resolves to its CommonJS build (`dist/node/index.cjs`). It's still the only file naming the package.
- **K5/K10 in this codebase:** `BarangayCallbackService` and `BarangayReplyService` are provided by `BarangayCallbackModule`, not `BarangayCoordinationModule` (as Phase 1 found). So `BarangayCallbackModule` exports `BarangayCallbackService` and registers the `AI_ASSIST` queue, and `AiAssistModule` imports it (one way; no cycle).
- **Job contract in its own file** (`ai-assist.jobs.ts`), so the reply service doesn't load the runner or the Gemini SDK.
- **`reportBySms` opts** also carry `actorRole`, for the timeline's `triggered_by_role`. The timeline helper now accepts a null role.
- **`english`** over 120 characters is cut, not rejected: failing a correct `NEEDS_BACKUP` read over a long translation would be the wrong trade.
- **Bad key → `AUTH` also on HTTP 400** when the message names the API key: that is how the Gemini API answers an invalid key. The message is read only to classify, never stored or logged.
- **Thinking:** `thinkingLevel: MINIMAL` for Gemini 3+ Flash models (LOW for Pro), `thinkingBudget: 0` for 2.5 Flash (128 for Pro), nothing for older models. Not verified against `gemini-3.8-flash`: if the model refuses that level, every call fails as `PROVIDER_ERROR`, which the eval will show.
- **Superseding:** a new reading for a case marks its open older ones `SUPERSEDED`, so the drawer shows one card.
- **Dismiss** also clears an `INFO` reading. Accept is refused for an `UNCLEAR` reading (never `PENDING_REVIEW` anyway).
- **Processor concurrency 1**, not 2: the free-tier per-minute limit.
- **Daily limit** counts the Philippine day (UTC+8), not the server's local day.
- **Existing tests:** in `barangay-reply.spec.ts` the notices mock gained `findMany: []`, because the `UNPARSED` path now looks up open notices. In `sms-opt-out.spec.ts` it gained the same, plus a stricter assertion that a subscriber's STOP never calls it. No assertion was removed or loosened. `store()` returns the row (or null) instead of a boolean, so the existing `create` mock (`{}`) still reads as stored.

**Noticed, not changed**
- `mobile/google-services.json` and `mobile/android/app/google-services.json` (tracked since `d980071`) hold the Firebase Android client API key. That's normal for Firebase apps, but the key should be restricted to the app's package and SHA-1 in the Google Cloud console. It shows up only when the secrets grep includes `*.json`.
- A dismiss isn't broadcast, so another dispatcher's open drawer drops the card on its next refetch (30-s stale time) or event.
- The `UNPARSED` auto-reply still asks the barangay for a code, even when the text was linked and is being read by AI. That's helpful while AI is off; it could be softened later.
- The A1 row still notes that the SMS-reply check is pending because the demo SIM has no load.

**Needs a person / device**
- **Model:** confirm `gemini-3.8-flash` is in Google's model list as a stable (not preview) model, and put it in `GEMINI_MODEL` in `backend/.env`.
- **Eval** (free tier, synthetic fixtures only): `node scripts\dev\eval-barangay-replies.js`. About 41 calls, 6.5 s apart (≈ 5 min). Pass: ≥ 90%, and 0 help requests read as calm. If any `NEEDS_BACKUP` fixture comes back `BLOCKED`, record it and decide on safety settings before going live. If every call is `PROVIDER_ERROR`, check the thinking level first.
- **Bad key:** with `AI_ASSIST_ENABLED=true` and a wrong key (restart the backend), send a free-text reply from a team phone to a single-open-case barangay. Expect one `FAILED`/`AUTH` row, the text in the message log, and nothing else changed.
- **Drawer walkthrough:**
  - With the flag off, a free text from a single-case barangay shows under "SMS from the barangay".
  - With the flag on (team-phone texts only), the card appears with the red dot. Accept updates the status box and timeline; `NEEDS_BACKUP` raises the supervisor escalation; Dismiss hides the card.
- **Before any real barangay text:** a paid-tier key and the DPO sign-off (AI plan Phase 0). Until then, keep `AI_ASSIST_ENABLED=false` in `backend/.env` outside demos.

### Review — 2026-10-30 (Prompt R, Phase 3)

Reviewed the Phase 3 files listed above (`git diff` on the changed files, plus the new untracked files). It ran in the session that first checked the plan's status, not a session that built Phase 3.

**Result: 3 defects fixed; 4 low items left open.**

**Fixed**
- **R1. A later reading could hide a request for help.** `AiTaskRunner` marked every open reading of the case `SUPERSEDED` before storing a new one, whatever the new reading was. A barangay that texts "kailangan namin ng bangka" (→ `NEEDS_BACKUP`, `PENDING_REVIEW`) and then "salamat po" (→ `UNCLEAR`, `INFO`) lost the backup card, and the Barangay tab's red dot went with it (it follows `PENDING_REVIEW`). The raw texts still showed in the message log, but nothing flagged them. The supersede also ran before the insert, outside a transaction, so a failed insert left the case with its older cards gone and no new one.
  - Fix (`ai-task-runner.service.ts`): an `INFO` reading supersedes only older `INFO` rows; a `PENDING_REVIEW` reading supersedes older `PENDING_REVIEW` and `INFO` rows; an open reading whose status is `NEEDS_BACKUP` is never superseded (Prisma JSON path filter on `output.status`). The update and the insert now run in one interactive transaction. The drawer already lists up to 5 open rows, so a kept backup card shows beside the newer one.
  - Checked on the dev database in a rolled-back transaction: with an open backup reading (`PENDING_REVIEW`), a low-confidence backup reading (`INFO`), an `ON_SCENE` reading and an `UNCLEAR` one, an `INFO` run superseded only the `UNCLEAR` row, and a `PENDING_REVIEW` run superseded only `UNCLEAR` + `ON_SCENE`. Both backup readings stayed open. 0 rows left after the rollback.
  - `test/ai-assist/ai-task-runner.spec.ts`: the mock gained `$transaction`. The `PENDING_REVIEW` test asserts the transaction and the new filter; the `INFO` tests assert that information supersedes only information and never a backup reading. No assertion was removed.
- **R2. A fourth copy of `NOTICE_INCLUDE`.** The build notes say it was reused, but `ai-suggestions.service.ts` defined its own. `barangay-link.service.ts` now exports the constant beside `LinkedNotice`, and `ai-suggestions.service.ts` imports it.
- **R3. A misplaced doc comment.** In `BarangayPanel.tsx`, `SmsReplies`'s comment ("The barangay's own words…") ended up above `AiSuggestionCards`'s comment. It is back above `SmsReplies`.

**Checked, with evidence**
- **a. Steps and Done-when.**
  - Step 1: `singleOpenNotice` (`barangay-reply.service.ts`, `take: 2`, override = every barangay); the outcome stays `UNPARSED` and `notice_id` is stored.
  - Step 2: env vars and the boot check (`config.validation.ts`); `@google/genai` `2.30.0` exact; the `ai-assist/` files; the migration matches `schema.prisma`; `AI_ASSIST` in the `.ts` only; the processor (concurrency 1); the event.
  - Step 3: queued only for `UNPARSED` + a notice + `aiAssistEnabled`, `reply-<inboundId>`, `attempts: 1`, inside its own `try/catch`.
  - Step 4: redacted body only; `UNCLEAR` or confidence < 0.6 → `INFO`; failures → `FAILED` + code; the event is sent.
  - Step 5: `reportBySms(notice, status, opts?)`; accept is refused for non-`PENDING_REVIEW` rows, a closed case or a second time; it claims the row, releases the claim on failure and audits (`ai_suggestion`, `MOD-46`); `NEEDS_BACKUP` still escalates through `applyBarangayReport`.
  - Steps 6–8: the fixtures, the eval script, the web card, the red dot, the socket handler and the 5 specs are present.
  - The ticked boxes (plan and AI plan) are true. The two unticked ones still need a person.
- **b. Bugs.**
  - The SDK names match the pinned 2.30.0 typings: `ThinkingLevel.MINIMAL` exists, `HttpRetryOptions.attempts: 1` means no retries, and `ApiError.status` is a number (what `classifyAiError` reads).
  - The timeout aborts the call, and `timedOut` maps both the rejection and a late answer to `TIMEOUT`.
  - The daily-limit filter keeps `error: null` rows.
  - The routes sit on their own paths, with no `:id` collision.
  - The AI routes aren't org-scoped, like the existing barangay routes (Dispatcher and Supervisor see every incident).
- **c. Duplication.**
  - `ScheduleModule.forRoot`: 1.
  - `from 'openai'`: 2 files (unchanged); `@google/genai`: 1 file.
  - `AI_ASSIST` and `ai.suggestion_created` are each defined once.
  - Each new env var is defined once in each config file (the extra `config.validation.ts` hits are the boot check reading them).
  - `AiAssistModule` provides only its own services.
  - `NOTICE_INCLUDE`: fixed (R2).
- **d. Guardrails and privacy.**
  - Nothing in `ai-assist/` writes an incident, a dispatch or a notice; a report is written only on a dispatcher's Accept.
  - Gemini receives only `redactForAi(body, 500)`. The event carries IDs and status only.
  - Errors log the class name only. The eval prints the model ID and the synthetic fixtures, never the key.
  - Secrets grep (word-boundary pattern): 0.
- **e. Tests.**
  - The Phase 3 specs assert stored values, error codes, filters, job IDs, audit contents and refusals, not just that a mock was called.
  - Existing specs only gained `findMany` mocks and one stricter assertion.

**Verification (§0 D):**
- Shared is unchanged by the review, so no rebuild.
- Typecheck clean in backend and frontend.
- Backend 1360/1360 (84 suites; R1 added assertions to existing tests). Frontend 134/134. E2E 1/1.
- `prisma migrate status`: up to date (27).
- Boot: the watch-mode backend wasn't running (port 3000 didn't answer), and a second instance wasn't started because it would share Redis and could send queued SMS. The e2e test boots the real `AppModule`, `AiAssistModule` included, from the current source (only the outward-facing processors are stubbed), so DI resolves. The review fixes change no module wiring.

**Left open (low; not fixed)**
- **O9. `maxOutputTokens: 512` may include thinking tokens.** On a model that counts thinking against the output limit, a long think could end in `MAX_TOKENS` with cut JSON, which is stored as `INVALID_OUTPUT`. It can't be checked offline; if the eval shows `INVALID_OUTPUT`, raise the limit first.
- **O10. Two older copies of `NOTICE_INCLUDE`** remain, in `barangay-notify.service.ts` and `barangay-reply.service.ts`. They predate Phase 3; they could import the exported constant.
- **O11. A kept backup reading is cleared only by Accept or Dismiss.** If the barangay sends the exact `BACKUP` code, the card stays until a dispatcher acts on it. That's intended: the dispatcher should see it.
- **O12. A dismiss isn't broadcast** (already noted in the build notes).

### Phase 4 — 2026-10-30

Run in the session that reviewed Phase 3 and saw it committed (`2acafa5`), at the user's request. Baseline: backend 1360/1360 (84 suites), green.

**Two plan gaps found in preflight, decided by the user (2026-10-30)**
- **C5 deferred.** Idle `AVAILABLE` units never send GPS. Both `location_history` writers (`LocationsService.trackResponder`, `RespondersService.pushLocation`) store `user_id` only, never `resource_id`, and only for a responder crewed on an active dispatch (`useResponderLocationShare` runs only then). Units have no standing crew list either (`dispatch_crew` is per dispatch). The dev database has 32 `location_history` rows, 0 with a `resource_id`. The roadmap §4.5 query would mark every available unit "No signal" all the time.
  - **What C5 needs first:** a unit crew roster (which responders staff which unit while on duty) and a periodic on-duty ping from the responder app. A ping that carries location is tracking idle staff, which needs the DPO.
  - Nothing for C5 was built: no `unit-heartbeat.service.ts`, no `resource.heartbeat_stale` event, no ranking change, no `UNIT_STALE_AFTER_MIN`.
- **C8 gained a hospital-user status report.** Nobody could keep receiving status fresh: `PATCH /v1/facilities/:id/status` (the only writer of `receiving_status`) allowed Dispatcher and Supervisor only, and no web or mobile screen called it, so every value was seed data. The hourly reminder would have asked hospital users to do something they couldn't. CLAUDE.md lists "update receiving status" as a Hospital User power, so the route now allows Hospital Users for their own organization's facilities, and the Hospitals page has an **Update status** control.

**Built**
- **C8, data.** Migration `20261030160000_facility_receiving_status_at`: `facilities.receiving_status_updated_at timestamptz`, backfilled from `updated_at`. `schema.prisma` updated.
- **C8, status report** (`FacilitiesService.updateStatus`, `facilities.controller.ts`).
  - Roles: Dispatcher, Supervisor, Hospital User. A Hospital User must hold an active membership in the facility's organization (`activeMemberOrgIds`); a facility with no organization is refused for them. Dispatchers and Supervisors report for any facility, as before.
  - A report with `receivingStatus` sets `receiving_status_updated_at`; a beds-only report doesn't. It also sets `updated_at`, which this route never did.
  - Audited (`facility`, `MOD-39`, old and new values). `FacilitiesModule` imports `AuditModule` (K7).
- **C8, jobs** (`backend/src/hospitals/registry-freshness.service.ts`, provided by `HospitalsModule`, which already imported `NotificationsModule`).
  - Hourly (`0 * * * *`): active facilities with an organization whose status is older than 6 h or was never reported. One IN_APP `HOSPITAL_STATUS_STALE` notice to each Hospital User who can sign in and is an active member of that organization. Deduped per facility per 6 h with a JSON path filter on `data_payload.facilityId`. The body names the facility and the age only.
  - Monthly (`0 8 1 * *`, `timeZone: 'Asia/Manila'`): one `REGISTRY_REVIEW_DUE` notice per Org Administrator (`activeMemberOrgIds`) listing their organizations' active facilities whose `last_verified_at` is null or older than 90 days, and active resources whose `updated_at` is older than 90 days (K4). Up to 5 names of each kind, then a count.
  - Each facility and each admin has its own `try/catch`, and the run has an outer one. The jobs never write a facility or a resource.
  - The `@Cron` methods (`hourly`, `monthly`) take no arguments and call `remindStaleStatuses(now)` / `sendRegistryDigests(now)`, so the cron library's arguments never reach them (Phase 2 O2 avoided).
- **C6** (`backend/src/hospitals/referral-ranking.ts`, pure).
  - `needFor(incident)`: ER for `CRITICAL`/`HIGH` or `MEDICAL`/`ROAD_ACCIDENT`/`FIRE`/`INDUSTRIAL`; ICU for `CRITICAL`.
  - `scoreFacility(f, need, km, now)`: roadmap §4.6 (`CLOSED` −80, `AT_CAPACITY` −50, `UNKNOWN` −10, no ER when needed −40, ICU when needed +15, 0 beds −30), plus `EMERGENCY_ONLY` −20 only for a non-emergency need. A status reported more than `RECEIVING_STATUS_STALE_HOURS` (12) ago, or never, is scored as `UNKNOWN` with the reason `Status last updated <n> h ago` / `Receiving status never reported`. An unknown distance scores as 15 km.
  - `HospitalsService.recommendations`: the hospitals the dispatcher's referral list shows (active, reviewed), facility columns only, distance by `haversineMeters` from a `VERIFIED` hospital location (like `findNearby`). No incident location → no distance and the reason `Incident location unknown`; an unverified hospital location → `Hospital location not verified`. Sorted by score, then distance, then name; top 10.
  - `GET /v1/hospitals/recommendations?incidentId=` (Dispatcher, Supervisor; `RecommendationsQueryDto` with `@IsUUID`), declared before `@Get(':id')`.
- **Shared:** `RECEIVING_STATUS_STALE_HOURS` in a new `shared/src/constants/facility.constants.ts` (`.ts` only), exported from the constants index; shared rebuilt (K2). The backend ranking and the web age label both use it.
- **Web.**
  - The **Refer to hospital** dialog lists up to 5 suggested hospitals first (effective status badge, distance, reasons). A click selects one; the full list stays below ("Or choose any hospital"), and the dispatcher sends.
  - Hospitals page: a **Receiving** panel (status, beds, "Updated <n> h ago", amber with "dispatch treats it as unknown until it is confirmed" after 12 h) with **Update status** (a status + optional beds dialog) for Dispatchers, Supervisors and the facility's own Hospital Users (`organization_id === user.orgId`, like `canSetLocation`). Each list row shows the age too.
  - `NotificationBell`: `HOSPITAL_STATUS_STALE` and `REGISTRY_REVIEW_DUE` open `/hospitals`, from the list and from the toast (K3).
  - `features/hospitals`: `HospitalRecommendation`, `fetchHospitalRecommendations`, `updateFacilityStatus`, `useHospitalRecommendations`, `useUpdateFacilityStatus`, `receivingStatusAge`.

**Files**
- New:
  - `backend/prisma/migrations/20261030160000_facility_receiving_status_at/`
  - `backend/src/hospitals/{referral-ranking.ts,registry-freshness.service.ts,dto/recommendations-query.dto.ts}`
  - `shared/src/constants/facility.constants.ts`
  - `backend/test/hospitals/{referral-ranking,registry-freshness,facility-status}.spec.ts`
- Changed:
  - `backend/prisma/schema.prisma`, `backend/src/facilities/{facilities.service.ts,facilities.controller.ts,facilities.module.ts}`, `backend/src/hospitals/{hospitals.service.ts,hospitals.controller.ts,hospitals.module.ts}`
  - `shared/src/constants/index.ts`
  - `frontend/features/hospitals/{api.ts,hooks.ts,location.ts}`, `frontend/app/(ops)/hospitals/page.tsx`, `frontend/components/incidents/IncidentDetailDrawer.tsx`, `frontend/components/layout/NotificationBell.tsx`, `frontend/__tests__/hospital-location.spec.ts` (6 cases added)
  - `docs/100%ModulesFunctionalities+AdditionalModules.md` (MOD-28, MOD-38, MOD-39 rows; summary)

**Migration:** applied with `prisma migrate deploy` to the dev database; `prisma generate` run; `migrate status` up to date (28). The E2E scratch database was 5 migrations behind (Phases 1–4; its earlier runs never touched those tables), so `pnpm test:e2e:db` (migrate + idempotent seed of `E2E_DATABASE_URL` only) was run before the e2e test.

**Tests:** backend 1360 → 1406/1406 (84 → 87 suites). Frontend 134 → 140/140. Mobile 98/98, and the mobile typecheck (both re-run because `shared` changed). E2E 1/1. Typecheck clean in backend, frontend and mobile.
- `referral-ranking.spec.ts`:
  - `needFor`;
  - every status, ER, ICU, beds and `EMERGENCY_ONLY` case;
  - stale at 13 h, fresh at 11 h, never reported;
  - unknown and capped distance;
  - the service: order, scores, reasons, unknown incident location, unverified hospital, top 10, 404, facility columns only;
  - **a real Nest HTTP app** proving `GET /v1/hospitals/recommendations` reaches the ranking and not `:id` (and returns its own 400s), plus the roles.
- `registry-freshness.spec.ts`:
  - the stale-facility filter;
  - recipients scoped to the facility's organization, the role and the sign-in rule;
  - body and payload, and the never-reported wording;
  - the 6-h dedup; no recipients → nobody;
  - one facility's failure is isolated; a failed run returns 0;
  - the monthly filters (facilities by `last_verified_at`, resources by `updated_at`), body, the 5-name cap, and the no-org and nothing-due cases;
  - the cron times and time zone;
  - no facility or resource write anywhere.
- `facility-status.spec.ts`:
  - a hospital user's own facility (stamped, audited);
  - a re-confirmation is stamped; beds-only isn't;
  - another organization's facility and an org-less facility are refused, with nothing written;
  - dispatchers skip the membership check;
  - the roles.

**Live checks** (dev database, one interactive transaction, always rolled back; 0 rows kept):
- Hourly: with every facility fresh except Bocaue General Hospital at 7 h, the first run created 1 notice (to the 1 hospital user of its organization), the second run 0, and the stored status was unchanged. The body read "Bocaue General Hospital: the receiving status was last updated 7 h ago. …".
- Monthly: 0 notices, which is correct. The only Org Administrator belongs to MDRRMO, which has no facilities, and its 3 units were updated 7 days ago.
- Ranking for the newest incident: Joni Villanueva (98, open, 1.2 km), Bocaue General Hospital (70, location not verified), Dr. Yanga's (48, status unknown, no ER).

**Duplication inventory:** every Phase 4 artifact was **missing**: `unit-heartbeat`, `heartbeat_stale`, `fleet:stale`, `UNIT_STALE_AFTER_MIN`, `referral-ranking`, `scoreFacility`, `needFor`, `registry-freshness`, `HOSPITAL_STATUS_STALE`, `receiving_status_updated_at`, the route. `recommendations` existed only as the unrelated `GET /v1/dispatch/recommendations`. Reused: `haversineMeters`, `reviewVisibility` (the referral list's visibility), `activeMemberOrgIds`, `BLOCKED_ACCOUNT_STATUSES` (the `findEscalationRecipients` sign-in rule), `NotificationsService` via `NotificationsModule`, `AuditService` via `AuditModule`, the Phase 2 JSON path dedup pattern, `receivingStatusBadge` / `RECEIVING_STATUS_BADGE`, `describeHospitalError`, and the existing `PATCH /facilities/:id/status` route (extended, not duplicated).

**Self-checks:**
- `grep -nE "resources\.update|receiving_status:"` on `registry-freshness.service.ts`: nothing. (`unit-heartbeat.service.ts` doesn't exist: C5 deferred.)
- `heartbeat_stale`: not defined (C5 deferred). `ScheduleModule.forRoot`: 1.
- `HOSPITAL_STATUS_STALE`, `REGISTRY_REVIEW_DUE` and `RECEIVING_STATUS_STALE_HOURS` each have one definition (the bell compares the event types as strings, like `SURGE_RECOMMENDED`).
- No new distance function. No module provides another module's service.
- Secrets grep (word-boundary pattern): 0.
- Privacy: notices carry facility and unit names and an age (public registry data). The ranking reads facility columns plus the incident's category, priority and location only.
- Guardrails: the jobs write only notifications, the ranking picks nothing, and a status changes only through a person's report.

**Boot:** the watch-mode backend wasn't running (port 3000 didn't answer), and a second instance wasn't started (shared Redis, queued SMS). The e2e test boots the real `AppModule` from the current source, `RegistryFreshnessService` and the new route included, with only the outward-facing processors stubbed, so DI resolves.

**Deviations**
- **C5 not built** (above).
- **A hospital-user status report was added** to C8 (above). It extends the one existing writer instead of adding a route.
- **A report stamps the time even when the status is unchanged.** The prompt's trap said "only when receiving_status actually changes". Read literally, a hospital that confirms "still Open" would keep getting the 6-h reminder and be ranked Unknown after 12 h, which defeats C8. The stamp is set by a status *report* only, never by any other write (name, location, activation, seed).
- **Distance only from a `VERIFIED` hospital location**, the same rule as `findNearby`; the others get "Hospital location not verified".
- **`EMERGENCY_ONLY` costs 20 for a non-emergency need** (the roadmap only says there is no penalty for an emergency referral).
- **The monthly digest runs at 08:00 Manila time** (`timeZone`), not in the server's zone (see Phase 2 O5).
- **Recipients from the organization's side:** the hourly reminder finds Hospital Users through `organization_memberships` (`is_active`), the same rule as `activeMemberOrgIds` asked the other way round.
- **`RECEIVING_STATUS_STALE_HOURS` lives in `shared`**, so the web age label and the backend ranking use one value.

**Noticed, not changed**
- The seeded "Bocaue General Hospital" has no verified location, so the ranking can't measure its distance.
- A freshly seeded database has `receiving_status_updated_at` null on every facility (the seed only creates rows), so they read "Never reported" until someone reports. That's accurate.
- `user.orgId` is the user's first active membership. A Hospital User in two hospital organizations sees **Update status** only on the first one's facilities, though the API accepts both.
- The facilities `findAll`/`findById` routes still return raw Prisma rows (Decimals as strings), unlike the hospitals routes.

**Needs a person / device**
- Referral dialog walkthrough: suggested hospitals come first with reasons; picking one and sending works; the full list still works.
- Hospitals page as a Hospital User: **Update status** shows on their own hospital (not on others), the age resets, and the reminder stops for 6 h.
- The hourly notice arrives in the bell and opens `/hospitals`.
- **C5:** a design decision on a unit crew roster and an on-duty ping (and the DPO, if the ping carries location) before it can be planned again.

### Review — 2026-10-31 (Prompt R, Phase 4)

Reviewed the Phase 4 files listed above (`git diff` on the changed files, plus the new untracked files) in a fresh session that didn't build Phase 4. C5 was deferred, so it has nothing to review.

**Result: 1 defect fixed and 1 stray edit undone; 4 low items left open.**

**Fixed**
- **R4. The 6-h reminder actually went out every 7 h.** The dedup lookback was the same 6 h as the staleness cutoff, measured from the start of each hourly run. A notice is written a moment after its run starts, so on the run exactly 6 h later it was still inside the window, and the next reminder slipped to the following hour. A hospital that ignored the first reminder got the second one about 14 h after its last report instead of 12 h.
  - Fix (`registry-freshness.service.ts:22`, `:95`): a separate `STATUS_REMINDER_DEDUP_MS`, 5 minutes short of 6 h. It's used only by the dedup lookup; the staleness cutoff is still 6 h. `remindFacility` no longer takes the cutoff.
  - `test/hospitals/registry-freshness.spec.ts`: the dedup test now asserts the 5-minute-shorter window. No assertion was removed.
- **A stray whitespace change in `schema.prisma`.** The `capacity_total` line had lost one space of alignment. It's restored, so the schema diff is now just the new column and its comment.

**Checked, with evidence**
- **a. Steps and Done-when.**
  - C8 step 1: the migration adds `receiving_status_updated_at TIMESTAMPTZ(6)` and backfills it from `updated_at`, matching `schema.prisma`.
  - Writers: `grep -rn "receiving_status"` finds one writer of `receiving_status` outside the seed, `FacilitiesService.updateStatus`, which stamps the time (`facilities.service.ts:74`). The seed creates rows only.
  - C8 step 2: hourly `0 * * * *` (`:46`). Recipients are Hospital Users who can sign in and are active members of the facility's organization (`:108`). The JSON path dedup is per facility (`:96`). Monthly `0 8 1 * *` runs on Manila time (`:52`), scoped by `activeMemberOrgIds`, with resources by `updated_at` (K4).
  - C8 step 3: a stale or never-reported status scores as `UNKNOWN`, with its age as the reason (`referral-ranking.ts:61`). The Hospitals page shows the same age from `RECEIVING_STATUS_STALE_HOURS`.
  - C6: `needFor` and `scoreFacility` follow roadmap §4.6. The enum values match `@agap/shared` (`IncidentPriority`, `IncidentType`) and `RECEIVING_STATUSES`. The route is declared at `hospitals.controller.ts:76`, before `@Get(':id')` at `:111`, and a real Nest HTTP test proves it. The service reads active, reviewed hospitals only (`hospitals.service.ts:105`) and measures distance from a verified location only (`:114`, the `findNearby` rule, by `haversineMeters`, K8). It returns the top 10 (`:143`).
  - Web: the Referral dialog shows up to 5 suggestions, and a click only selects one (the dispatcher still sends). The full `Select` stays below. `NotificationBell` routes both new event types to `/hospitals` from the list and from the toast (K3). `role-access.ts` lets Hospital Users and Org Administrators open `/hospitals`. `toFacilityView` passes `receiving_status_updated_at` through to the page.
  - The ticked Done-when boxes are true. The two unticked ones are C5 (deferred) and the dialog walkthrough.
- **b. Bugs.**
  - `incident_locations` is a 1:1 relation (`incident_locations?`), so `at?.latitude` is right.
  - A Hospital User with no organization on the facility is refused before any write. Dispatchers and Supervisors skip the membership check.
  - The cron methods take no arguments (the Phase 2 O2 trap is avoided).
  - Each facility and each admin has its own `try/catch`, inside an outer one. `Promise.allSettled` per recipient.
  - Timing: fixed in R4.
- **c. Duplication.**
  - `ScheduleModule.forRoot`: 1.
  - `HOSPITAL_STATUS_STALE` and `REGISTRY_REVIEW_DUE` are each defined once (the bell compares strings, like `SURGE_RECOMMENDED`). `RECEIVING_STATUS_STALE_HOURS` is defined once, in `shared`.
  - No new distance function. `PATCH /facilities/:id/status` was extended, not duplicated.
  - `FacilitiesModule` imports `AuditModule`, and `HospitalsModule` already imported `NotificationsModule` (K7). Neither provides another module's service.
  - C5 artifacts (`heartbeat_stale`, `fleet:stale`, `unit-heartbeat`): none exist, as recorded.
- **d. Guardrails and privacy.**
  - `grep -nE "resources\.update|receiving_status:" registry-freshness.service.ts`: nothing. The jobs write notifications only.
  - The ranking picks nothing, and a status changes only through a person's report, which is audited (`facilities.service.ts:82`, `MOD-39`, old and new values).
  - Notices carry facility or unit names, IDs and an age (registry data). The ranking reads the incident's category, priority and location only, never patient data.
  - Secrets grep (word-boundary pattern): 0.
- **e. Tests.**
  - The three specs assert the Prisma filters, the recipients, bodies, payloads, scores and reasons, the audit contents, refusals with nothing written, the cron metadata, and the route over real HTTP.
  - The only existing frontend test file changed gained 6 cases. No test was weakened.

**Verification (§0 D):**
- Shared is unchanged by the review, so no rebuild.
- Typecheck clean in backend and frontend. `prisma validate` passes.
- Backend 1406/1406 (87 suites). Frontend 140/140. Mobile 98/98. E2E 1/1.
- `prisma migrate status`: up to date (28).
- Jest printed "A worker process has failed to exit gracefully" after an otherwise green run. It doesn't name a suite and wasn't traced; the one Phase 4 spec that opens a server (the route test) closes it in `afterAll`.
- Boot: a second backend wasn't started (it shares Redis and queued SMS with the user's watch-mode instance). The e2e test boots the real `AppModule` from the current source, so DI resolves. The fix changes no module wiring.

**Left open (low; not fixed)**
- **O13. An empty status report is accepted.** `PATCH /facilities/:id/status` with `{}` passes validation (both fields are optional). It bumps `updated_at` and writes an audit row with empty new values, but doesn't stamp the receiving status. It's harmless, but a `400` would be cleaner.
- **O14. An unmeasured distance scores as 15 km.** A hospital with an unverified location (or any hospital when the incident has no location) ranks above a verified one farther than 15 km, all else equal. The reason "Hospital location not verified" or "Incident location unknown" is shown, so the dispatcher can see why. Not measured against the real registry.
- **O15. The monthly digest opens `/hospitals`.** The units it lists are managed on the fleet and resources pages, which the page doesn't link to.
- **O16. The hourly reminder runs through the night**, every 6 h, for any stale hospital. This is intended (receiving status matters at night too), but hospitals may want quiet hours.
