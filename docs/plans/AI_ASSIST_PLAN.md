# Plan: AI Assist (Gemini) for the Incident Drawer

> **Status:** Not started (planned 2026-10-21; scope reviewed 2026-10-29; provider changed to Gemini 2026-10-30).
> **Provider change (2026-10-30):** the LLM is **Google Gemini** via `GEMINI_API_KEY` (in `backend/.env`), not OpenAI. Exact SDK, call shape and error codes are in [AUTOMATION_NEEDS_PLAN.md → Phase 3 → Provider](AUTOMATION_NEEDS_PLAN.md#provider-gemini-changed-2026-10-30). The existing OpenAI features (evidence review, hospital name assist) are separate and keep `OPENAI_API_KEY`.
> **Scope review (2026-10-29):** [AGAP_Automation_and_LLM_Modernization_Roadmap.md](../AGAP_Automation_and_LLM_Modernization_Roadmap.md) sorted all 52 modules. Its result for this plan:
> - **Phase 2** (barangay replies) is a real gap and is now the priority (roadmap item **C4**). Its precondition is met.
> - **Phase 3** (case brief) is an **optional assist** for MOD-23/25, which stay manual. Build it after Phase 2, and only after the DPO decision in Phase 0.
> - Phase 1 is shared with the roadmap's other optional LLM assists (handover, closure, announcement and analytics drafts), so its table and API were widened. See the notes marked *(2026-10-29)*.
> - Most automation AGAP needs is rule-based and doesn't depend on this plan (roadmap C1–C3, C5–C8).
> - **Build Phases 1 and 2 through [AUTOMATION_NEEDS_PLAN.md](AUTOMATION_NEEDS_PLAN.md) Phase 3** (2026-10-30). It folds them into one runnable phase and wins where it differs from this file.
>
> **How to use:** build one phase at a time, in order. Each phase ends with a **Done when** checklist that must pass before the next phase starts.
> **Modules:** MOD-21/23 (ops dashboard), MOD-34 (barangay coordination), MOD-46 (audit), MOD-48 (privacy).
> **Related:** [BARANGAY_ALERT_AUTOMATION_PLAN.md](BARANGAY_ALERT_AUTOMATION_PLAN.md). Phase 2 here needs its Phase 5 (inbound SMS).

## Context

The incident drawer was redesigned on 2026-10-21 (summary, progress bar, tabs: Overview / Barangay / Timeline / Chat). Two jobs there still take a dispatcher's time:

1. **Reading free-text barangay replies.** Barangay staff will not always text the exact reply codes (`OTW 4821`). They write things like `nandito na kami`, `papunta na`, or `kailangan ng ambulansya`.
2. **Getting the picture of a case quickly.** The description, caller answers, hazard flags and timeline are spread across sections, often in Filipino or Taglish.

**Intended outcome:** Gemini produces **suggestions and summaries only**. A dispatcher accepts or ignores each one. AGAP behaves exactly as today when the AI is off, slow, or down.

### What AI must never do (non-negotiable)

These come from the CLAUDE.md architectural rules:
- **No decisions.** AI never changes incident status, dispatches, marks a false alert, merges, or closes an incident (Rule 8).
- **No silent action.** Every AI output a dispatcher acts on is audited with who accepted it (Rule 11).
- **Never in the critical path.** Incident creation, the barangay alert SMS, and dispatch never wait for AI (Rule 7). AI runs in a background job after the incident is saved.
- **Least data.** No names, phone numbers, emails, medical profile, or reporter identity are sent to Gemini (Rule 10, MOD-48).
- **Always labelled.** Every AI text in the UI says "AI suggestion" or "AI summary".

### Design guardrails (apply to every phase)

- **Off by default.** `AI_ASSIST_ENABLED=false`. With it off, or with no API key, the app boots and the AI UI is simply absent.
- **Server-side only.** The API key lives in `backend/.env`. The browser never calls Gemini.
- **Fail closed and quiet.** A timeout, error, safety block, or invalid output stores a failed row and shows nothing. It never shows an error banner in the drawer and never retries inside a request.
- **Structured output only.** Every call asks Gemini for JSON (`responseMimeType: 'application/json'` plus a response schema), and the result is validated again with Zod before it is stored. Free text is never parsed.
- **Everything is stored.** Each call writes one `ai_suggestions` row: input hash, output, model, latency, and error. This allows audit, cost tracking and evaluation.
- **Budget cap.** `AI_ASSIST_DAILY_LIMIT` caps calls per day; past the cap the feature turns itself off until the next day.

### Phase overview

| Phase | Delivers | Depends on |
|---|---|---|
| 0 | Decisions: data allowed, account, model, budget, sample replies | — |
| 1 | AI foundation: client, redaction, `ai_suggestions` table, queue, flag | 0 |
| 2 | Barangay SMS reply understanding (suggest → dispatcher accepts) | 1, barangay plan Phase 5 |
| 3 | Case brief + translation card on the Overview tab | 1 |

**Order (updated 2026-10-29):** Phase 0 → Phase 1 → **Phase 2** → Phase 3 (optional).
- Phase 2 can start now: the barangay SMS poller fills `barangay_sms_inbound`, and free-text replies already land there as `UNPARSED`.
- Phase 3 waits on the Phase 0 decision about names in descriptions.

*(Before 2026-10-29 the order was 0 → 1 → 3, because nothing filled `barangay_sms_inbound` yet.)*

---

## Phase 0: Decisions and pre-work (no code)

- [ ] **Data allowed.** Confirm with the Data Protection Officer or MDRRMO that the fields in the [Data sent to Gemini](#data-sent-to-gemini) table may go to Google (Gemini API) under RA 10173. The data leaves the Philippines. Record the decision here.
- [ ] **Account / tier.** The `GEMINI_API_KEY` must belong to a Google Cloud project for AGAP with **billing enabled (paid tier)** before any real incident or barangay text is sent. On the **free tier**, Google may use prompts and responses to improve its products, and human reviewers may read them. On the paid tier they aren't used for that. The free tier is fine for the synthetic eval fixtures only. Set a budget alert on the Cloud project. Budgets only alert, so `AI_ASSIST_DAILY_LIMIT` is the hard cap.
  - **2026-10-30: the current key is free tier.** Until it's paid tier, the AI runs only on the synthetic fixtures and demo texts from the team's own phones. Never on a real incident or a real barangay's reply. This box stays unticked until the key is paid tier.
- [x] **Model (2026-10-30):** `gemini-3.8-flash`, chosen by the user. It's a Flash-class model with JSON output and a response schema. It's the exact ID in `GEMINI_MODEL`: never a preview model or a `-latest` alias (CLAUDE.md: no unbounded `latest`). Before the live eval, confirm the ID is in Google's model list as a stable model.
- [ ] **Reply samples.** Write 30 or more realistic barangay replies in Filipino, English and Taglish, including typos and the reply codes, each with the expected label. Save them as `backend/test/ai-assist/fixtures/barangay-replies.json`. Phase 2 is measured against these.
- [x] **Provider (changed 2026-10-30):** Google Gemini, with `GEMINI_API_KEY` from `backend/.env`. *(Was OpenAI, decided 2026-10-29.)* The evidence review and hospital name assist keep using OpenAI and aren't part of this plan (confirmed by the user 2026-10-30: don't migrate them). `AiClientService` stays the only place that would change if the provider is revisited.

### Data sent to Gemini

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

**Dependency** *(2026-10-30)*: add the Google Gen AI SDK, `@google/genai`, to `backend/package.json`, pinned to an exact version (`pnpm add @google/genai@<x.y.z> --save-exact`). `zod` is already there. `GEMINI_API_KEY` is in `backend/.env` but not yet in `config.validation.ts` or `.env.example`, so add it to both. `AiClientService` reads it from `process.env.GEMINI_API_KEY`, which `ConfigModule` loads from `backend/.env` at startup. Never hardcode or log it. The roadmap §5.3 sketch is written for OpenAI: keep its structure and use the Gemini call shape from [AUTOMATION_NEEDS_PLAN.md → Provider](AUTOMATION_NEEDS_PLAN.md#provider-gemini-changed-2026-10-30).

**Config** (`backend/src/config/config.validation.ts` + `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `AI_ASSIST_ENABLED` | `false` | Master switch |
| `GEMINI_API_KEY` | (blank) | Required only when enabled |
| `GEMINI_MODEL` | (blank) | Exact, stable Gemini model ID from Phase 0. No fallback |
| `AI_ASSIST_TIMEOUT_MS` | `8000` | Per call; a timeout counts as a failure |
| `AI_ASSIST_DAILY_LIMIT` | `500` | Calls per day across the system |

Validation: when `AI_ASSIST_ENABLED=true`, a missing key or model refuses to boot, the same pattern as `BARANGAY_SMS_TEST_OVERRIDE_PHONE`.

**Database:** add a migration `backend/prisma/migrations/2026102xxxxxxx_ai_suggestions/`. Apply it with `pnpm prisma migrate deploy`. Do **not** use `migrate dev` or `reset`.

*(2026-10-29)* Widened so the roadmap's optional drafts can share the table:
- `incident_id` is nullable, because announcement and analytics drafts have no incident.
- `source_id` becomes `subject_type` + `subject_id`.
- `kind` covers all six tasks.

The full model is in roadmap §5.5.

```prisma
model ai_suggestions {
  id              String               @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  incident_id     String?              @db.Uuid          // null for announcement / analytics drafts
  subject_type    String?              @db.VarChar(40)   // e.g. 'barangay_sms_inbound'
  subject_id      String?              @db.Uuid          // e.g. barangay_sms_inbound.id
  kind            ai_suggestion_kind   // BARANGAY_REPLY | CASE_BRIEF | HANDOVER_DRAFT | CLOSURE_DRAFT | ANNOUNCEMENT_DRAFT | ANALYTICS_NARRATIVE
  status          ai_suggestion_status // PENDING_REVIEW | ACCEPTED | DISMISSED | INFO | FAILED | SUPERSEDED
  input_hash      String               @db.VarChar(64)   // sha256 of the redacted input, for dedupe
  output          Json?
  model           String               @db.VarChar(80)
  latency_ms      Int?
  error           String?              @db.VarChar(40)   // error code only (TIMEOUT, RATE_LIMITED, AUTH, BLOCKED, INVALID_OUTPUT, DAILY_LIMIT, PROVIDER_ERROR), never a provider message
  requested_by_id String?              @db.Uuid
  reviewed_by_id  String?              @db.Uuid
  reviewed_at     DateTime?            @db.Timestamptz(6)
  created_at      DateTime             @default(now()) @db.Timestamptz(6)
  // relations: incidents (Cascade), users (reviewed_by)
  @@index([incident_id, kind, created_at(sort: Desc)])
  @@index([subject_type, subject_id])
  @@index([created_at])                // daily-limit count
}
```

**Backend module** `backend/src/ai-assist/`:
- `ai-assist.module.ts`.
- `ai-client.service.ts`: `structured<T>(task, input, schema, zod)` returns `T | null`.
  - It never throws.
  - It enforces the timeout (an `AbortController`, no SDK retries), the daily limit, and the flag.
  - It creates the `GoogleGenAI` client lazily, only when the flag, key and model are all set.
  - It is the only file that imports `@google/genai`.
- `redact.ts`: `redactForAi(text)` plus field allow-listing (only the "Sent" column above).
- `ai-suggestions.service.ts`: create, list, accept and dismiss rows. Accept and dismiss also write to `AuditService.log` with `moduleId: 'MOD-46'`, `entityType: 'ai_suggestion'`, and the old and new status.

**Queue:**
- Add `AI_ASSIST: 'ai-assist'` to `shared/src/constants/queue.constants.ts`.
- Add `backend/src/jobs/processors/ai-assist.processor.ts`, following `sla-monitor.processor.ts`.
- Jobs are idempotent by `jobId` (`brief-<incidentId>`, `reply-<inboundId>`). *(2026-10-30: `-`, not `:`. BullMQ throws on a custom ID with `:` unless it has exactly 3 parts.)*

**Realtime:**
- Add the event `ai.suggestion_created` (ops room only) to `shared/src/events/`.
- In `frontend/providers/socket-provider.tsx`, invalidate `['ai-suggestions', incidentId]` when it arrives.

**API** (ops roles: Dispatcher and Supervisor; served at `/v1/…`). *(2026-10-29)* The System Administrator was removed because it has had no operational powers since role dashboards Phase 5b. Accept and dismiss moved off the incident path, so suggestions without an incident work too.
- `GET /v1/incidents/:id/ai-suggestions` returns the latest per kind.
- `POST /v1/ai-suggestions/:sid/accept`
- `POST /v1/ai-suggestions/:sid/dismiss`
- `POST /v1/incidents/:id/ai-brief/refresh` (Phase 3) queues a fresh brief, at most one per minute.

**Done when:**
- [ ] With `AI_ASSIST_ENABLED=false`, no job is queued and no Gemini call is made (unit test with a mocked client).
- [ ] With the flag on and a bad key, incident creation still succeeds and a `FAILED` row is stored (`AUTH`).
- [ ] A simulated timeout stores `FAILED` with an `error`, and nothing throws. So do a 429 (`RATE_LIMITED`) and a safety block (`BLOCKED`).
- [ ] `redactForAi` unit tests cover `09171234567`, `+639171234567`, `0917-123-4567`, emails, and leave coordinates out.
- [ ] Output that fails the Zod schema is stored as `FAILED` and never shown.
- [ ] The daily limit stops calls when reached.

---

## Phase 2: Barangay SMS reply understanding

**Precondition:** the barangay plan's Phase 5 is built. Incoming texts land in `barangay_sms_inbound` and `parseBarangayReply` handles the exact codes. **Met (checked 2026-10-29):** the poller stores every inbound text, and a known sender's free text is stored with outcome `UNPARSED`. That's the trigger for this phase.

**Finding the case:** `UNPARSED` rows have no `notice_id`, because the rule parser found no code. Attach the suggestion only when the sender's barangay has exactly one open notice. Otherwise store it as `INFO` with no incident, and let the dispatcher pick the case.

**STOP replies:** check for an announcement opt-out first (roadmap C3, built 2026-10-30). A subscriber's "STOP" must never reach Gemini or the barangay logic.

**Flow:**
1. An inbound text arrives from a **known barangay contact** that has an **open notice**.
2. `parseBarangayReply` runs first. If it understands the text, it is applied as today and **no AI is used**.
3. If the rule parser returns null, queue `reply-<inboundId>`.
4. The AI receives **only the redacted message body** and the list of allowed labels. It gets no incident data.
5. It returns a structured answer:
   ```json
   { "status": "SEEN | ON_THE_WAY | ON_SCENE | HANDLED | NEEDS_BACKUP | UNCLEAR",
     "confidence": 0.0, "english": "≤120 chars plain-English reading" }
   ```
6. If the answer is `UNCLEAR` or `confidence < 0.6`, store the row as `INFO` and show the raw text only.
7. Otherwise store it as a `PENDING_REVIEW` suggestion and emit `ai.suggestion_created`.

**Never auto-applied.** The dispatcher accepts. Accept records the report through the existing path with source `SMS_REPLY`:
- *(2026-10-29)* `BarangayCallbackService.reportBySms(notice, status)` now exists and accepts the full set (`SEEN | ON_THE_WAY | ON_SCENE | HANDLED | NEEDS_BACKUP`), so `NEEDS_BACKUP` already raises the supervisor escalation. The remaining change: add `actorId` and `aiSuggestionId` parameters, so an accepted suggestion is recorded under the dispatcher instead of the SMS sender.
- The audit row names both the dispatcher and the suggestion id.

**Frontend** (`frontend/components/incidents/BarangayPanel.tsx`):
- A card under the barangay status:
  > **Barangay texted:** "nandito na kami sa may kapilya"
  > *AI reads this as* **On scene** · "We are here near the chapel"  [Accept] [Dismiss]
- New hook `frontend/hooks/useAiAssist.ts` with `useAiSuggestions(incidentId)`, `useAcceptSuggestion`, and `useDismissSuggestion`.
- When accepted, the card disappears and the barangay status box updates (live, through the existing `barangay.notice_updated`).
- The Barangay tab's red dot also shows while a suggestion is waiting for review.

**Evaluation:** `scripts/dev/eval-barangay-replies.js` runs the Phase 0 fixtures against the real Gemini API and prints accuracy, a confusion list, and the count of safety-blocked replies. Replies about injuries or blood can trip Gemini's safety filters; a block is stored as `FAILED`/`BLOCKED` and the raw text still shows.

**Done when:**
- [ ] Eval: **≥ 90%** correct on the fixtures, where `UNCLEAR` counts as correct for genuinely unclear samples, and **0** cases of `NEEDS_BACKUP` read as anything calm. A `BLOCKED` result counts as wrong. If any `NEEDS_BACKUP` fixture is blocked, record it and decide on the model's safety settings before going live.
- [ ] An exact code (`OTW 4821`) never reaches Gemini (unit test).
- [ ] A text from an unknown number never reaches Gemini.
- [ ] Accepting writes the barangay report, the timeline note, and an audit row naming the dispatcher, and the incident status is unchanged.
- [ ] Dismissing writes an audit row and changes nothing else.
- [ ] With the AI off, the raw text still shows in the panel and the dispatcher can record the outcome by hand.

---

## Phase 3: Case brief and translation

**Trigger:**
- Queue `brief-<incidentId>` with a **10 s delay** after the incident is saved, after an on-scene assessment is added, and after every 5th timeline event.
- Repeated triggers within the delay collapse into one job, because the jobId is the same.
- Never block creation.

**Input:** the redacted, allow-listed fields from the [Data sent to Gemini](#data-sent-to-gemini) table.

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
- [ ] With Gemini unreachable, the drawer looks exactly as it does today.

---

## Out of scope (follow-ups)

- **Shift handover summary** of all open incidents (MOD-44). Build it after Phase 3 proves the brief quality. The single-incident handover draft is now an optional assist in roadmap §6.4. A summary across all open incidents is still out of scope.
- **Other drafts** (closure notes, announcements, weekly analytics) are optional assists in roadmap §6.5–6.7. They reuse Phase 1 and aren't phases of this plan.
- **AI priority suggestions.** MOD-24 stays rule-based. AI may later add an explanation, never the priority itself.
- **Auto-replying to barangays by SMS.** Not without an MDRRMO policy decision.
- **Photo analysis.** Media is never sent.

## Verification (every phase)

- `pnpm typecheck && pnpm test`. The repo's `next lint` currently fails on an unrelated ESLint option.
- Backend unit tests in `backend/test/ai-assist/`, with `@google/genai` mocked. No test calls the real API. Only the eval script does, run by hand.
- **Regression:** the emergency-flow E2E suite (required by CLAUDE.md, and again because `@google/genai` is a new dependency) and `backend/test/incidents/incident-creation.spec` must pass, and incident creation must succeed with `AI_ASSIST_ENABLED=true` and Gemini unreachable.
- Run the jest suites with the repo config: `npx jest --config ./test/jest.config.ts <path>`.
- **Cost check after each live session:** `select kind, count(*), avg(latency_ms) from ai_suggestions where created_at > now() - interval '1 day' group by kind;`

## Gotchas (from today's session)

- Routes are served at `/v1/…`, not `/api/v1`.
- Prisma 7 needs a driver adapter. Use `pg` directly for ad-hoc queries.
- The backend reads `.env` only at startup. Restart it after changing AI config.
- The dashboard socket rejoins the ops room on reconnect (fixed 2026-10-21). New events only need a handler in `socket-provider.tsx`.
