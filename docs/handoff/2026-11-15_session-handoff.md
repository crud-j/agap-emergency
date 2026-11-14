# Handoff: session 2026-11-14 night → 2026-11-15 (SMS fixes, AI summary, AI provider, Risk areas)

**Date:** 2026-11-15
**For:** the next agent, starting cold. **This is the current handoff; read it first.** It summarises the session and links the detailed handoffs.
**First task:** ask the user how the checks in "Waiting on the user" went, starting with the **Risk areas browser check** (newest). Don't start new work on your own.

**Detailed handoffs from this session (newest first):**
1. [`2026-11-15_risk-areas-pin-automation.md`](./2026-11-15_risk-areas-pin-automation.md): Risk areas (MOD-51), pinpoint and automation.
2. [`2026-11-14_analytics-ai-summary.md`](./2026-11-14_analytics-ai-summary.md): AI summary (MOD-50), plus the 2026-11-15 updates (AI provider setting, no repeated watch items).
3. [`2026-11-14_citizen-sms-fallback.md`](./2026-11-14_citizen-sms-fallback.md): citizen SOS by SMS, plain SMS texts, and its "Fourth session" fixes.

---

## Git

**All work is committed on `main`; the tree is clean.** The user commits from Git Bash with `git commit -F - <<'EOF' … EOF`.

| Commit | What |
|---|---|
| `a6a3498` | Risk areas: pin + radius, live stats and hints, flood-per-barangay proposals, Check now (MOD-51) |
| `bea700c` | AI summary: counts behind percentages, no repeated watch items. **Also contains the `AI_ASSIST_PROVIDER` setting** (OpenAI/Gemini); its suggested commit was folded in |
| `c0f7009` | AI summary of the selected period, Supervisor only (MOD-50) |
| `20d7e1a` | Fixes: contact opt-out, barangay-targeted announcements, Manila daily summary, SMS account-link check |
| `3c761d7`, `39f0708` | Plain GSM-7 SMS texts; citizen SOS by SMS (earlier in the session) |

The migration `20261115120000_risk_area_pin` is **applied to the local DB**, and `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` is empty.

## What the session did, in one line each

1. **Fixes before the AI summary** (`20d7e1a`):
   - the "responders on the way" SMS respects `notify_on_alert`;
   - barangay-targeted announcements work for SMS **and push**: one shared barangay list (`shared/src/constants/barangays.ts`), and an unknown barangay still gets the notice;
   - the wrong barangay lists are fixed (mobile subscribe, surge page, "Tambobong" vs DB "Tambubong");
   - `/analytics/daily` counts the Manila day;
   - an SMS report links an app account only when the account's verified number sent it;
   - the dead `IncidentDetailPanel` is deleted.
2. **AI summary on Analytics** (`c0f7009`):
   - a Supervisor-only button;
   - code computes every figure and change against the previous period; the AI only words them;
   - every number in the AI text must appear in the input, otherwise the summary is stored FAILED (`UNVERIFIED_NUMBER`);
   - no summary below 5 incidents;
   - accept and dismiss are audited.
3. **AI provider setting** (in `bea700c`): `AI_ASSIST_PROVIDER=gemini|openai` for every AI Assist task.
   - Why: the first Gemini call failed with `PROVIDER_ERROR`, most likely a wrong `GEMINI_MODEL` ID.
   - The OpenAI path uses the Responses API with a JSON schema, `store: false` and no retries.
   - The failure log now shows the provider and HTTP status.
4. **AI summary quality** (`bea700c`):
   - the first real OpenAI summary was correct, but its "Worth a look" repeated the points;
   - the prompt now asks for the counts behind percentages ("29% (2 of 7)");
   - `dropRepeatedWatchItems` removes repeats.
5. **Risk areas** (`a6a3498`):
   - the empty-gap bug was the shared `TabsContent` keeping hidden panels in the layout (fixed for every tab);
   - new areas are a pin + radius;
   - live counts and hints (raise level / quiet 12 months);
   - floods are proposed per barangay;
   - the nightly check is at 02:30 **Asia/Manila** (it used server time);
   - "Check now" with last-run status;
   - a smart add form; cards and a map layout.

## The user's local config (non-secret values only)

`backend/.env`:
- `AI_ASSIST_ENABLED=true`
- `AI_ASSIST_PROVIDER=openai`
- `OPENAI_AI_ASSIST_MODEL=gpt-4o-mini`
- `GEMINI_MODEL=gemini-3.8-flash`: probably not a valid ID; unused while the provider is openai.
- `CITIZEN_SMS_SOS_ENABLED`: **not set**, so citizen SOS by SMS is off locally.

Both AI keys are set; never print them. **Free-tier / DPO rule (AI_ASSIST_PLAN Phase 0):** demo data only until the data protection officer signs off. This applies to OpenAI too.

## Waiting on the user (nothing below has been reported yet)

1. **Risk areas in the browser:** steps 2–6 of the [MOD-51 report](../module-reports/MOD-51_Emergency_Intelligence_and_Risk_Visualization.md) (pin + radius, audit, read-only System Admin page, Check now, hints). Restart the backend first.
2. **AI summary, second look:**
   - Dismiss the old summary, then Generate. Expect counts like "(2 of 7)", and "Worth a look" either new or absent.
   - The rest of step 3 of the [MOD-50 report](../module-reports/MOD-50_Emergency_Response_Analytics.md): reuse, Accept → Activity Log, too few, Dispatcher 403.
   - **Already confirmed by the user:** a real OpenAI summary whose numbers matched their CSV.
3. **Barangay-targeted announcement:** step 10 of the [MOD-53 report](../module-reports/MOD-53_Municipal_Announcements_and_Public_Broadcast.md) (Lolomboy number gets it, Wakas doesn't, no-barangay gets it).
4. **Citizen SOS by SMS on a device**, and the new SMS wording on a real phone: see `2026-11-14_citizen-sms-fallback.md`, "Waiting on the user". Needs `CITIZEN_SMS_SOS_ENABLED=true` and `EXPO_PUBLIC_AGAP_SMS_NUMBER`.
5. **Older and still unreported:**
   - SLA alarm and Analytics CSV checks (2026-11-14);
   - Live Dispatch and Fleet browser checks (2026-11-14);
   - device checks (2026-11-13).

## Decisions still open (ask, don't assume)

1. Barangay reply acknowledgements end in "Thank you." (the user chose English). Keep, or go back to "Salamat"?
2. Should dispatchers read the patient's medical profile, incident-scoped? (open since 2026-11-13)
3. Who is the System Administrator in Bocaue (likely municipal IT)? Never answered.
4. AI summary follow-ups: LGU (Mayor's Office) access to **accepted** summaries? A weekly automatic run? A Filipino draft?
5. Gemini: fix `GEMINI_MODEL` (an ID from Google's list) or drop it, now that OpenAI is used?

## Backlog (not started)

- **Road hazards** (planned 2026-11-14): construction, closed road, flooded road, debris; a point or road stretch with dates; shown on the dispatch map, Risk Map and responder route; Supervisor-only writes. See memory `project-risk-map-and-road-hazards`.
- **Dead code to wire or delete** (gap audit 2026-11-13):
  - the `emergency-alerts` controller;
  - `escalation.processor.ts` and the ESCALATION queue;
  - `POST /incidents/:id/feedback`;
  - `DELETE/PATCH /users/me` (account deletion matters under the Data Privacy Act);
  - `deleteMedicalProfile()`;
  - contact priority, hospital edit, surge incident linking, announcement supersede.
- **SMS gaps:**
  - SOS blank-filling needs only the event id (guests can't be checked);
  - no console view of rejected SOS texts;
  - the reply limit is in memory;
  - no inbound webhook mode.
- **SLA gaps:** escalation dedupe relies on a text prefix (needs an `escalation_type` column); no UI for category-specific targets; no live SLA countdown on Live Dispatch.
- **Users' barangay is never collected:** most push recipients count as "unknown barangay". Ask whether sign-up or the profile should ask for it.
- **Lower value:** Shake-to-Alert only works with the app open; settings aren't restored on a new phone; no Decline button on the responder app.

## Verification at the end of the session

- `tsc --noEmit`: shared, backend, frontend and mobile are all clean.
- Backend `npx jest --config ./test/jest.config.ts --maxWorkers=50% --testTimeout=60000`: **135/135 suites, 2379 tests**.
- Frontend `npx jest`: 24 suites, 239 tests. Mobile `npx jest`: 21 suites, 266 tests.
- New risk SQL ran against the local PostGIS through the real services, in a rolled-back transaction (see the risk-areas handoff).

## How the user works (still true)

- One item at a time. "Fix it" or "do this" means: read the real code first, report what's actually there (including flaws), then implement.
- Wants a **plan before larger features**: plan mode, with the plan approved before coding.
- **Typecheck all four packages**, no errors, no duplication, checked against `schema.prisma`.
- Plain explanations; real launch problems over theory.
- Tests on real Android devices (EAS dev build; JS-only changes need only a Metro reload) and in the browser.
- **Commits only when asked**, from Git Bash.
- Use the Edit tool for code containing backslashes (Bash/Python edits have mangled `\n` before).
