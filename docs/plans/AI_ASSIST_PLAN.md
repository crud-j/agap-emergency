# Plan: AI Assist (OpenAI) for the Incident Drawer

> **Status:** Not started (planned 2026-10-21).
> **How to use:** build one phase at a time, in order. Each phase ends with a **Done when** checklist that must pass before the next phase starts.
> **Modules:** MOD-21/23 (ops dashboard), MOD-34 (barangay coordination), MOD-46 (audit), MOD-48 (privacy).
> **Related:** [BARANGAY_ALERT_AUTOMATION_PLAN.md](BARANGAY_ALERT_AUTOMATION_PLAN.md). Phase 2 here needs its Phase 5 (inbound SMS).

## Context

The incident drawer was redesigned on 2026-10-21 (summary, progress bar, tabs: Overview / Barangay / Timeline / Chat). Two jobs there still take a dispatcher's time:

1. **Reading free-text barangay replies.** Barangay staff will not always text the exact reply codes (`OTW 4821`). They write things like `nandito na kami`, `papunta na`, or `kailangan ng ambulansya`.
2. **Getting the picture of a case quickly.** The description, caller answers, hazard flags and timeline are spread across sections, often in Filipino or Taglish.

**Intended outcome:** OpenAI produces **suggestions and summaries only**. A dispatcher accepts or ignores each one. AGAP behaves exactly as today when the AI is off, slow, or down.

### What AI must never do (non-negotiable)

These come from the CLAUDE.md architectural rules:
- **No decisions.** AI never changes incident status, dispatches, marks a false alert, merges, or closes an incident (Rule 8).
- **No silent action.** Every AI output a dispatcher acts on is audited with who accepted it (Rule 11).
- **Never in the critical path.** Incident creation, the barangay alert SMS, and dispatch never wait for AI (Rule 7). AI runs in a background job after the incident is saved.
- **Least data.** No names, phone numbers, emails, medical profile, or reporter identity are sent to OpenAI (Rule 10, MOD-48).
- **Always labelled.** Every AI text in the UI says "AI suggestion" or "AI summary".

### Design guardrails (apply to every phase)

- **Off by default.** `AI_ASSIST_ENABLED=false`. With it off, or with no API key, the app boots and the AI UI is simply absent.
- **Server-side only.** The API key lives in `backend/.env`. The browser never calls OpenAI.
- **Fail closed and quiet.** A timeout, error, or invalid output stores a failed row and shows nothing. It never shows an error banner in the drawer and never retries inside a request.
- **Structured output only.** Every call uses a JSON schema (OpenAI structured outputs) and is validated again with Zod before it is stored. Free text is never parsed.
- **Everything is stored.** Each call writes one `ai_suggestions` row: input hash, output, model, latency, and error. This allows audit, cost tracking and evaluation.
- **Budget cap.** `AI_ASSIST_DAILY_LIMIT` caps calls per day; past the cap the feature turns itself off until the next day.

### Phase overview

| Phase | Delivers | Depends on |
|---|---|---|
| 0 | Decisions: data allowed, account, model, budget, sample replies | — |
| 1 | AI foundation: client, redaction, `ai_suggestions` table, queue, flag | 0 |
| 2 | Barangay SMS reply understanding (suggest → dispatcher accepts) | 1, barangay plan Phase 5 |
| 3 | Case brief + translation card on the Overview tab | 1 |

**Suggested order for tomorrow:** Phase 0 → Phase 1 → **Phase 3**. Phase 3 needs nothing else. Do Phase 2 only after the barangay plan's Phase 5 stores incoming SMS in `barangay_sms_inbound`. That table exists, but nothing fills it yet.

---

## Phase 0: Decisions and pre-work (no code)

- [ ] **Data allowed.** Confirm with the Data Protection Officer or MDRRMO that the fields in the [Data sent to OpenAI](#data-sent-to-openai) table may go to OpenAI under RA 10173. Record the decision here.
- [ ] **Account.** Create an OpenAI project for AGAP with its own API key. Set a monthly spend limit in the OpenAI dashboard. Check the project's data-retention settings (ask for zero data retention if the account qualifies).
- [ ] **Model.** Pick a current small, fast model that supports structured outputs. Put its exact ID in `OPENAI_MODEL`, never a "latest" alias (CLAUDE.md: no unbounded `latest`).
- [ ] **Reply samples.** Write 30 or more realistic barangay replies in Filipino, English and Taglish, including typos and the reply codes, each with the expected label. Save them as `backend/test/ai-assist/fixtures/barangay-replies.json`. Phase 2 is measured against these.
- [ ] **Decide:** OpenAI, or Claude through the Anthropic API? The design below works for either. Only `AiClientService` changes.

### Data sent to OpenAI

| Sent | Never sent |
|---|---|
| Category, priority, status | Reporter name, phone, account |
| Incident description (redacted) | Patient names, ages, sex |
| Caller intake answers, hazard flags | Medical profile (any field) |
| Barangay name | Exact GPS coordinates (send barangay only) |
| Timeline notes (redacted, last 10) | Photos, media, chat messages |
| Barangay SMS reply body (redacted) | The sender's phone number |

**Redaction** (`redactForAi`, Phase 1) replaces PH phone numbers, emails, and anything that looks like an ID number with `[removed]`. Free-text descriptions can still contain a name (e.g. "si Juan ay nahulog"). Phase 0 has to accept that risk, or Phase 3 sends only category and intake answers.

---

## Phase 1: AI foundation

**Dependency:** add the `openai` npm package to `backend/package.json`, pinned to an exact version.

**Config** (`backend/src/config/config.validation.ts` + `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `AI_ASSIST_ENABLED` | `false` | Master switch |
| `OPENAI_API_KEY` | (blank) | Required only when enabled |
| `OPENAI_MODEL` | (blank) | Exact model ID from Phase 0 |
| `AI_ASSIST_TIMEOUT_MS` | `8000` | Per call; a timeout counts as a failure |
| `AI_ASSIST_DAILY_LIMIT` | `500` | Calls per day across the system |

Validation: when `AI_ASSIST_ENABLED=true`, a missing key or model refuses to boot, the same pattern as `BARANGAY_SMS_TEST_OVERRIDE_PHONE`.

**Database:** add a migration `backend/prisma/migrations/2026102xxxxxxx_ai_suggestions/`. Apply it with `pnpm prisma migrate deploy`. Do **not** use `migrate dev` or `reset`.

```prisma
model ai_suggestions {
  id             String              @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  incident_id    String              @db.Uuid
  kind           ai_suggestion_kind  // BARANGAY_REPLY | CASE_BRIEF
  status         ai_suggestion_status // PENDING_REVIEW | ACCEPTED | DISMISSED | INFO | FAILED | SUPERSEDED
  source_id      String?             @db.Uuid   // e.g. barangay_sms_inbound.id
  input_hash     String              @db.VarChar(64) // sha256 of the redacted input, for dedupe
  output         Json?
  model          String              @db.VarChar(80)
  latency_ms     Int?
  error          String?
  reviewed_by_id String?             @db.Uuid
  reviewed_at    DateTime?           @db.Timestamptz(6)
  created_at     DateTime            @default(now()) @db.Timestamptz(6)
  // relations: incidents (Cascade), users (reviewed_by)
  @@index([incident_id, kind, created_at(sort: Desc)])
}
```

**Backend module** `backend/src/ai-assist/`:
- `ai-assist.module.ts`.
- `ai-client.service.ts`: `structured<T>(task, input, schema, zod)` returns `T | null`.
  - It never throws.
  - It enforces the timeout, the daily limit, and the flag.
  - It is the only file that imports `openai`.
- `redact.ts`: `redactForAi(text)` plus field allow-listing (only the "Sent" column above).
- `ai-suggestions.service.ts`: create, list, accept and dismiss rows. Accept and dismiss also write to `AuditService.log` with `moduleId: 'MOD-46'`, `entityType: 'ai_suggestion'`, and the old and new status.

**Queue:**
- Add `AI_ASSIST: 'ai-assist'` to `shared/src/constants/queue.constants.ts`.
- Add `backend/src/jobs/processors/ai-assist.processor.ts`, following `sla-monitor.processor.ts`.
- Jobs are idempotent by `jobId` (`brief:<incidentId>`, `reply:<inboundId>`).

**Realtime:**
- Add the event `ai.suggestion_created` (ops room only) to `shared/src/events/`.
- In `frontend/providers/socket-provider.tsx`, invalidate `['ai-suggestions', incidentId]` when it arrives.

**API** (ops roles: Dispatcher, Supervisor, System Administrator; served at `/v1/…`):
- `GET /v1/incidents/:id/ai-suggestions` returns the latest per kind.
- `POST /v1/incidents/:id/ai-suggestions/:sid/accept`
- `POST /v1/incidents/:id/ai-suggestions/:sid/dismiss`
- `POST /v1/incidents/:id/ai-brief/refresh` (Phase 3) queues a fresh brief, at most one per minute.

**Done when:**
- [ ] With `AI_ASSIST_ENABLED=false`, no job is queued and no OpenAI call is made (unit test with a mocked client).
- [ ] With the flag on and a bad key, incident creation still succeeds and a `FAILED` row is stored.
- [ ] A simulated timeout stores `FAILED` with an `error`, and nothing throws.
- [ ] `redactForAi` unit tests cover `09171234567`, `+639171234567`, `0917-123-4567`, emails, and leave coordinates out.
- [ ] Output that fails the Zod schema is stored as `FAILED` and never shown.
- [ ] The daily limit stops calls when reached.

---

## Phase 2: Barangay SMS reply understanding

**Precondition:** the barangay plan's Phase 5 is built. Incoming texts land in `barangay_sms_inbound` and `parseBarangayReply` handles the exact codes.

**Flow:**
1. An inbound text arrives from a **known barangay contact** that has an **open notice**.
2. `parseBarangayReply` runs first. If it understands the text, it is applied as today and **no AI is used**.
3. If the rule parser returns null, queue `reply:<inboundId>`.
4. The AI receives **only the redacted message body** and the list of allowed labels. It gets no incident data.
5. It returns a structured answer:
   ```json
   { "status": "SEEN | ON_THE_WAY | ON_SCENE | HANDLED | NEEDS_BACKUP | UNCLEAR",
     "confidence": 0.0, "english": "≤120 chars plain-English reading" }
   ```
6. If the answer is `UNCLEAR` or `confidence < 0.6`, store the row as `INFO` and show the raw text only.
7. Otherwise store it as a `PENDING_REVIEW` suggestion and emit `ai.suggestion_created`.

**Never auto-applied.** The dispatcher accepts. Accept records the report through the existing path with source `SMS_REPLY`:
- One change is needed first: `BarangayCallbackService` can record `ON_THE_WAY / HANDLED / NEEDS_BACKUP / NO_ANSWER` for calls, and `SEEN / ON_SCENE` only for status-page taps. Add a `reportBySms(noticeId, status, actorId, aiSuggestionId)` method that takes the full set, so `NEEDS_BACKUP` still raises the supervisor escalation.
- The audit row names both the dispatcher and the suggestion id.

**Frontend** (`frontend/components/incidents/BarangayPanel.tsx`):
- A card under the barangay status:
  > **Barangay texted:** "nandito na kami sa may kapilya"
  > *AI reads this as* **On scene** · "We are here near the chapel"  [Accept] [Dismiss]
- New hook `frontend/hooks/useAiAssist.ts` with `useAiSuggestions(incidentId)`, `useAcceptSuggestion`, and `useDismissSuggestion`.
- When accepted, the card disappears and the barangay status box updates (live, through the existing `barangay.notice_updated`).
- The Barangay tab's red dot also shows while a suggestion is waiting for review.

**Evaluation:** `scripts/dev/eval-barangay-replies.js` runs the Phase 0 fixtures against the real API and prints accuracy and a confusion list.

**Done when:**
- [ ] Eval: **≥ 90%** correct on the fixtures, where `UNCLEAR` counts as correct for genuinely unclear samples, and **0** cases of `NEEDS_BACKUP` read as anything calm.
- [ ] An exact code (`OTW 4821`) never reaches OpenAI (unit test).
- [ ] A text from an unknown number never reaches OpenAI.
- [ ] Accepting writes the barangay report, the timeline note, and an audit row naming the dispatcher, and the incident status is unchanged.
- [ ] Dismissing writes an audit row and changes nothing else.
- [ ] With the AI off, the raw text still shows in the panel and the dispatcher can record the outcome by hand.

---

## Phase 3: Case brief and translation

**Trigger:**
- Queue `brief:<incidentId>` with a **10 s delay** after the incident is saved, after an on-scene assessment is added, and after every 5th timeline event.
- Repeated triggers within the delay collapse into one job, because the jobId is the same.
- Never block creation.

**Input:** the redacted, allow-listed fields from the [Data sent to OpenAI](#data-sent-to-openai) table.

**Output** (structured):
```json
{ "summary": "≤ 3 short sentences, plain English",
  "keyFacts": ["≤ 4 items, each ≤ 80 chars"],
  "language": "en | fil | mixed",
  "descriptionEnglish": "English translation of the description, or null if already English" }
```

Stored as kind `CASE_BRIEF`, status `INFO`. A newer brief marks older ones `SUPERSEDED`.

**Frontend** (`frontend/components/incidents/IncidentDetailDrawer.tsx`, Overview tab):
- A compact card at the very top, above the description quote:
  - "**AI summary**", how long ago it was generated, and a refresh icon
  - the summary and key facts as a short list
  - a "Show English" toggle under the description quote when `descriptionEnglish` is present
- It **collapses to one line by default** after the first view, so the drawer stays uncluttered (persist the choice in `localStorage`).
- If there's no brief yet (or the AI is off or failed), render **nothing**. No spinner or placeholder that adds noise.
- Footnote: "AI summary. Check the details below before acting."

**Done when:**
- [ ] A new SOS in Filipino gets a brief within ~15 s, and the card appears live without a reload.
- [ ] The brief never contains a phone number or a name from the reporter or patient fields (unit test on the prompt input, and a manual check on 10 live cases).
- [ ] Creating 20 incidents in a minute stays within the daily limit logic, and incident creation time is unchanged (compare p95 before and after).
- [ ] With OpenAI unreachable, the drawer looks exactly as it does today.

---

## Out of scope (follow-ups)

- **Shift handover summary** of all open incidents (MOD-44). Build it after Phase 3 proves the brief quality.
- **AI priority suggestions.** MOD-24 stays rule-based. AI may later add an explanation, never the priority itself.
- **Auto-replying to barangays by SMS.** Not without an MDRRMO policy decision.
- **Photo analysis.** Media is never sent.

## Verification (every phase)

- `pnpm typecheck && pnpm test`. The repo's `next lint` currently fails on an unrelated ESLint option.
- Backend unit tests in `backend/test/ai-assist/`, with the OpenAI client mocked. No test calls the real API. Only the eval script does, run by hand.
- **Regression:** the emergency-flow E2E suite (required by CLAUDE.md) and `backend/test/incidents/incident-creation.spec` must pass, and incident creation must succeed with `AI_ASSIST_ENABLED=true` and OpenAI unreachable.
- Run the jest suites with the repo config: `npx jest --config ./test/jest.config.ts <path>`.
- **Cost check after each live session:** `select kind, count(*), avg(latency_ms) from ai_suggestions where created_at > now() - interval '1 day' group by kind;`

## Gotchas (from today's session)

- Routes are served at `/v1/…`, not `/api/v1`.
- Prisma 7 needs a driver adapter. Use `pg` directly for ad-hoc queries.
- The backend reads `.env` only at startup. Restart it after changing AI config.
- The dashboard socket rejoins the ops room on reconnect (fixed 2026-10-21). New events only need a handler in `socket-provider.tsx`.
