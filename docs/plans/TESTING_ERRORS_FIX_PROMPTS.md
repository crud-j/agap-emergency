# AGAP — Testing Errors Fix: Execution Prompts

**Companion to:** [TESTING_ERRORS_FIX_PLAN.md](TESTING_ERRORS_FIX_PLAN.md) (the "plan")
**Prepared:** 2026-11-02 · **Baseline:** `main` @ `2870f70` + uncommitted working tree

---

## How to use this file

1. Run **one prompt per fresh session**. Don't paste two prompts into one session.
2. Copy everything inside the prompt's fenced block and send it as one message. Each prompt tells the agent to read [§0](#0-execution-protocol-every-prompt-follows-this) first, so you don't need to paste §0.
3. The agent stops at the **STOP** line and reports back. Read the report, then run **Prompt R** for that phase in another fresh session.
4. **If a session dies halfway**, start a new session with the **same** prompt. §0 step A makes the agent find what already exists and finish it instead of creating it again.
5. Each phase prompt also updates that module's section of the testing guide (plan Phase 7). **Prompt 7** does only the guide items that belong to no phase.

| Order | Prompt | Plan phase | Owner | Gate before starting |
|---|---|---|---|---|
| 1 | Prompt 1: Organization dropdown (MOD-26) | 1 | Christian Joaquin | none |
| 2 | Prompt 2: Handover recipients (MOD-43) | 2 | Arjar Mauricio | none |
| 3 | Prompt 3: Mutual aid accounts and inbox (MOD-34) | 3 | Aldrin Dela Cruz | Team answered the two Phase 3 decisions, or agreed to leave them out |
| 4 | Prompt 4: Chat sync (MOD-32) | 4 | Aldrin Dela Cruz | Two phones and the tunnel ready for the walkthrough |
| 5 | Prompt 5: Second unit dispatch (MOD-30/31) | 5 | Christian Joaquin | none |
| 6 | Prompt 6: Capability management (MOD-28) | 6 | Christian Joaquin | Team agreed who verifies capabilities (default: Supervisor + System Administrator) |
| 7 | Prompt 7: Remaining guide updates | 7 | anyone | none |
| — | Prompt R after each of 1–6 | — | someone other than the builder | that phase reported |

The phases don't touch the same code, except that Phases 1 and 6 both edit `RegistryTab.tsx` and Phase 3 and 2 both edit `seed.ts`. If two members work at the same time, the second one rebases onto the first.

---

## Corrections and notes found while writing these prompts

Checked against the code on 2026-11-02. The prompts already include them, and they override the plan where the two disagree.

| # | Topic | Code reality | What to do |
|---|---|---|---|
| K1 | Editing `shared/src` | The backend and frontend load `@agap/shared` from **`shared/dist`**; only Jest and mobile read `src` | After any `shared/src` edit, run `cd shared && pnpm build` before backend/frontend typecheck or run. Edit only `.ts` files, never the stale compiled `.js`/`.d.ts` files in `shared/src/constants/` |
| K2 | Seed changes | Every seed user is an `upsert` with `update: {}` | New fields only apply to **new** rows. Fixes for existing databases must be in code, not only in the seed. Never change an existing account's password in the seed |
| K3 | Test commands | Backend `npx jest --config ./test/jest.config.ts` (tests in `backend/test/<area>/`); frontend `pnpm test` (tests in `frontend/__tests__/*.spec.ts`); mobile `pnpm test` (tests in `mobile/src/**/__tests__/*.test.ts`) | Put new tests next to the existing ones of the same area |
| K4 | Backend audit `module_id` | Uses the **old** numbers (`MOD-27`, `MOD-29`, `MOD-31`, `MOD-33`, `MOD-35`, `MOD-44`) | Keep the old tag in new audit rows so reports and filters stay consistent |
| K5 | Manual walkthroughs on Windows | Next dev can serve stale modules; Metro can drop edited routes | If a new export is "not a function" on the web, hard-reload or restart `pnpm dev`. If Expo says "No route named…", restart `npx expo start -c` |
| K6 | Shared test accounts | Password `AgapDev2026!`; staff roles lock after 5 wrong passwords; first sign-in forces a password change | During walkthroughs keep `AgapDev2026!` as the new password. The login body field is `identifier`, not `email` |

---

## §0 Execution protocol (every prompt follows this)

### A. Preflight (no edits yet)

1. Read `CLAUDE.md`, the plan's **Context** and **Rules that apply to every phase**, the plan's **Phase N** in full, and this file's **Corrections** table.
2. Read the plan's Phase N for a **"Phase N status"** section. If one exists, this is a **resume**: continue from what it records.
3. Run `git status --short` and keep the output. Never revert or reformat files you didn't change in this phase.
4. **Re-check the plan's "What exists".** Open every file and line the phase cites. If the code has moved or already changed, note it and work from the code, not the plan.
5. **Duplication inventory.** List every artifact the phase adds: functions, routes, DTOs, hooks, components, seed accounts, tests. Grep for each. Record **exists / partial / missing**. For exists or partial, finish or extend that one; never create a second one.
6. Run the baseline tests of every package the phase touches (see K3) and record pass/fail counts. Failures that exist now aren't yours.

### B. Implement

- Follow the phase's numbered steps in order, using the inventory.
- **Reuse before writing:** each prompt has a "Must reuse" list. If a helper exists, import it.
- Match the surrounding code: naming, comment density, `try/catch` + `this.logger` style, DTOs with class-validator, `@Roles(...)` guards, TanStack Query hooks in `features/<area>/hooks.ts`, fetchers in `features/<area>/api.ts`.
- No new npm dependencies and no Prisma migrations. If one seems needed, stop and ask.
- Keep changes inside the phase's scope. Unrelated issues you notice go into the report, not into the code.
- Never weaken the rules in the plan: no autonomous dispatch, audit every consequential action, never reveal the reporter's identity, never let a notification failure change an incident.

### C. Self-check before verifying

- **Duplicates:** each new route path, hook, fetcher and seed email is defined exactly once.
- **Route order:** any new static `GET` route in a controller is declared before `GET ':id'`.
- **Roles:** every new endpoint has `JwtAuthGuard`, `RolesGuard` and `@Roles(...)`, and organization-scoped writes call the existing `assertCanManageOrg`.
- **Privacy:** nothing added logs or returns a password, token, phone number of a reporter, or medical data.

### D. Verify

1. If `shared/src` changed: `cd shared && pnpm build`.
2. `pnpm typecheck` in every touched package.
3. The full test suite of every touched package, plus `cd backend && pnpm test:e2e` if the backend changed.
4. **Boot check** if the backend changed: start it once (`cd backend && pnpm start:dev`), confirm "Nest application successfully started" with no DI error, then stop it. If Postgres or Redis isn't running, record that.
5. Fix every failure your change caused and re-run until green. Never weaken or delete an existing test to make it pass. Never use `--no-verify`.

### E. Record

- Tick the phase's **Done when** boxes that you actually verified, and only those. Walkthrough items that need a person or a device stay unticked.
- Add a dated **"Phase N status (YYYY-MM-DD)"** section at the end of Phase N in the plan, in the style of `MODULE_GAPS_COMPLETION_PLAN.md`:
  - files added and changed;
  - the duplication inventory result (what already existed);
  - deviations from the plan, and why;
  - test counts before → after;
  - what still needs a person or a device.
- Update the plan's status line at the top.
- Update that module's section of `docs/module-reports/MODULE_TESTING_GUIDE.md` as plan Phase 7 says for this phase.
- Don't commit.

### F. Report, then STOP

Reply with:
1. What was built, per numbered step.
2. Test results with counts, before → after, per package.
3. Deviations and duplication inventory findings.
4. The manual walkthrough steps the person must still do, copied from **Done when**.

Then stop. Don't start another phase.

---

## Prompt 1 — Organization dropdown is empty (MOD-26 [27])

```
Read docs/plans/TESTING_ERRORS_FIX_PROMPTS.md §0 and the Corrections table, then execute
Phase 1 of docs/plans/TESTING_ERRORS_FIX_PLAN.md exactly as §0 describes (A → F).

Must reuse (do not re-create):
- The array-to-PaginatedResult wrapping in fetchResources
  (frontend/features/resources/api.ts). Match its shape and meta fields exactly; if you
  extract a shared helper, put it where both fetchers can import it and use it in both.
- PaginatedResult from @agap/shared.

Traps:
- Fix it in the fetcher only. Do not change the four callers (RegistryTab x2,
  operations/fleet/page.tsx, organizations/page.tsx) and do not change the backend
  response shape: other code may read the plain array.
- An Org Administrator must still see only their own organization in the Add Resource
  dropdown (the existing filter in RegistryTab).
- The backend ignores orgType/page/perPage; say so in one comment, don't implement paging.

Test: frontend/__tests__/ spec for fetchOrganizations with an array response and with an
already-paginated response (mock lib/api like the existing specs do).

Guide (plan Phase 7): in MOD-26 add a check that the Organizations page and the Add
Resource dropdown list MDRRMO, BFP and the hospital.

STOP after the §0 F report.
```

---

## Prompt 2 — Handover recipient list is empty (MOD-43 [44])

```
Read docs/plans/TESTING_ERRORS_FIX_PROMPTS.md §0 and the Corrections table, then execute
Phase 2 of docs/plans/TESTING_ERRORS_FIX_PLAN.md exactly as §0 describes (A → F).

Must reuse (do not re-create):
- BLOCKED_ACCOUNT_STATUSES and isAccountBlocked from backend/src/auth/account-status.ts.
- The "can sign in" filter style already used in backend/src/jobs/escalation-recipients.ts.

Scope:
- incident-handover.service.ts: recipients() and the recipient check in create().
- oversight.service.ts staff list (the `OR: [{ status: 'ACTIVE' }, …]` filter): keep the
  open-incidents clause, replace only the ACTIVE part.
- seed.ts: add `status: user_status.ACTIVE` (or the enum the seed already imports) to the
  `create` block of every staff account. Citizen and bystander demo accounts stay as they
  are. Do not touch `update: {}` (K2).

Traps:
- Do NOT change announcement-push.processor.ts or any surge/disaster-mode `status:
  'ACTIVE'`: those mean something else.
- The error message in create() for a blocked recipient must stay generic (don't reveal
  whether the account exists).

Tests (backend/test/incidents/ or wherever handover tests live now): recipients include a
PENDING_VERIFICATION dispatcher, exclude a SUSPENDED one and the caller; create() refuses a
DEACTIVATED recipient; the oversight staff list includes a PENDING_VERIFICATION dispatcher.

Guide (plan Phase 7): in MOD-43, remove nothing, but note that the list shows every
dispatcher and supervisor who can sign in.

STOP after the §0 F report.
```

---

## Prompt 3 — Mutual aid: seed accounts and inbox messages (MOD-34 [35])

Before running, write the team's answers to the two **Decision for the team** questions in the plan, or leave them unanswered. The prompt builds only steps 1–4.

```
Read docs/plans/TESTING_ERRORS_FIX_PROMPTS.md §0 and the Corrections table, then execute
Phase 3 of docs/plans/TESTING_ERRORS_FIX_PLAN.md exactly as §0 describes (A → F).

Build steps 1–4 only. The two "Decision for the team" items are OUT OF SCOPE unless the
plan records an agreed answer under them; if it does, stop after step 4 and list what
the decision would need instead of building it.

Must reuse (do not re-create):
- The existing user upsert pattern and the membership list in
  backend/prisma/seed/seed.ts (the `{ org, user }` array), DEV_PASSWORD/devHash, and the
  seed summary console.log block.
- The `bfp` and `hospitalOrg` organization records already upserted in the seed.
- resolveOrgForUser in resources.service.ts; add the System Administrator check in the
  controller or service, don't write a second membership lookup.
- The existing Badge/muted text styles in RequestsInbox.tsx.

Seed accounts to add (same password, must_change_password like the other staff,
status ACTIVE as Phase 2 does if it has landed, is_email_verified true):
- orgadmin@bfp.bocaue.gov.ph — ORG_ADMINISTRATOR, BFP Bocaue membership
- orgadmin@bocauehospital.gov.ph — ORG_ADMINISTRATOR, Bocaue General Hospital membership
Use phone numbers that don't collide with existing seed phones (phone_number is unique).

Traps:
- Both approve and deny routes and the legacy /request/:id/respond route must behave the
  same for a System Administrator without an organization (clear 403, not 400).
- The inbox explanations must not appear on rows that aren't PENDING.
- Run the seed against a scratch database or confirm it is idempotent: running it twice on
  the dev DB must not fail or duplicate memberships.

Tests: backend test that a System Administrator without membership gets 403 on approve;
existing "cannot fulfil its own request" behaviour unchanged.

Guide (plan Phase 7): add both accounts to the accounts table; in MOD-34 replace "a BFP
Org Administrator (create it; see §1)" with orgadmin@bfp.bocaue.gov.ph; in MOD-38 use
orgadmin@bocauehospital.gov.ph.

STOP after the §0 F report.
```

---

## Prompt 4 — Chat sync between citizen and responder (MOD-32 [33])

```
Read docs/plans/TESTING_ERRORS_FIX_PROMPTS.md §0 and the Corrections table, then execute
Phase 4 of docs/plans/TESTING_ERRORS_FIX_PLAN.md exactly as §0 describes (A → F).

Must reuse (do not re-create):
- authedFetch (mobile/src/services/api/authed-fetch.ts). Export its refresh function
  (doRefresh, keeping the pendingRefresh de-duplication) for the socket to use; do not
  write a second refresh path.
- The shared socket in mobile/src/services/websocket/agap-socket.ts (one socket for the
  app). Extend it; do not create another io() client.
- The roomWatchers counting idea from useIncidentTracking.ts: MOVE it into agap-socket.ts
  as watchIncidentRoom(incidentId) and delete the local copy.
- DISCONNECTED_POLL_MS (or the same value) from useIncidentTracking for the chat's
  disconnected polling.
- The existing "Reconnecting… messages send when back online" strip in incident-chat.tsx.

Order of work: steps 1 → 5 (mobile), then 6 (gateway ack), then 7 (check the web drawer
chat panel in frontend/; fix only if it has the same faults, and record what you found),
then 8 (tests).

Traps:
- socket.io-client v4: `auth` may be a function `(cb) => cb({...})`; it is called on every
  (re)connect. Keep `transports: ['websocket']`.
- Reason 'io server disconnect' is not retried automatically; any other reason is. Retry
  once after a successful refresh only, so a revoked or deactivated user can't loop.
- Re-joining watched rooms must happen on every 'connect', including the first one, and
  only once per room per connect.
- logout must disconnect the socket BEFORE clearing the token; login must disconnect only
  when the user id changes (a token refresh calls login for the same user).
- The gateway ack must not change the 'error' event that existing clients rely on.
- The bubble rule `sender_id === myUserId` stays; do not show names (Rule 15).
- Messages merged from history reloads and live events must not duplicate (merge by id)
  and stay sorted by sent_at.

Tests: mobile unit test for watchIncidentRoom (two watchers → leave only at zero; re-join
on connect; no double join); a test that useIncidentChat reloads history on reconnect
(follow the existing mobile/src/hooks/__tests__ style). Backend test for the join ack if
backend/test/realtime has gateway tests to extend.

This phase cannot be finished without two phones. Do everything that can be verified
here, then list the plan's five "Done when" walkthrough items for the person.

Guide (plan Phase 7): in MOD-32 add the reconnect, token-expiry and same-phone
account-switch checks.

STOP after the §0 F report.
```

---

## Prompt 5 — Dispatch a second unit to the same incident (MOD-30/31 [31/32])

```
Read docs/plans/TESTING_ERRORS_FIX_PROMPTS.md §0 and the Corrections table, then execute
Phase 5 of docs/plans/TESTING_ERRORS_FIX_PLAN.md exactly as §0 describes (A → F).

Must reuse (do not re-create):
- DispatchService.create: extend it with a first-unit / additional-unit branch. Do not add
  a second dispatch endpoint.
- The incident row lock and the "same status, note only" incidentEvent pattern from
  responders.service.ts applyStatus ("… finished field work").
- statusService / existing realtime calls (incidentAssigned, dispatch created,
  notifyIncidentStatusChanged), addAgencyParticipant, and the crew assignment push.
- RecommendationPanel and UnitTrackingCard in operations/dispatch/page.tsx: reuse the
  panel for "Dispatch another unit"; do not copy it.
- Status lists: if @agap/shared or lib/incident-format already exports a list that matches
  "additional unit" statuses, use it; otherwise define ADDITIONAL_DISPATCH once next to
  DISPATCHABLE in each of the two places (backend service, web page), as the code does now.

Traps:
- The status check must happen again INSIDE the transaction after the lock; the read
  before the transaction is only for the error message.
- For an additional unit: no incident status change, no dispatched_at overwrite, and no
  incident.status_changed emit or citizen status notification.
- The audit row keeps moduleId 'MOD-31' (K4) and adds newValues.additionalUnit: true.
- A responder already crewed on an active dispatch for this incident must not be added as
  crew of the second one (RESPONDER_NOT_AVAILABLE already covers availability; confirm).
- Do not touch responders.service.ts multi-unit logic unless a test proves it is wrong;
  if it is, record it as a deviation.
- Web: the RecommendationPanel's onDispatched must close the "another unit" view and keep
  the tracking card.

Tests (backend/test/dispatch/): second unit on ON_SCENE keeps ON_SCENE and writes the note
event; same unit twice refused; RESOLVED and CLOSED refused; first-unit behaviour
unchanged (existing tests stay green). One test that two units finishing resolves only on
the last (reuse existing responder test helpers).

Mobile: no code change expected; check mobile/app/responder/assignment/[id].tsx and the
tracking screen for single-unit assumptions and record findings.

Guide (plan Phase 7): in MOD-31 remove "two units on one incident" from Not implemented;
add the second-unit steps to MOD-30.

STOP after the §0 F report.
```

---

## Prompt 6 — Assign and verify unit capabilities (MOD-28 [29])

Before running, confirm who verifies capabilities. The prompt uses the plan's default (Supervisor and System Administrator); change the line in the prompt if the team chose differently.

```
Read docs/plans/TESTING_ERRORS_FIX_PROMPTS.md §0 and the Corrections table, then execute
Phase 6 of docs/plans/TESTING_ERRORS_FIX_PLAN.md exactly as §0 describes (A → F).

Verifier roles: SUPERVISOR and SYSTEM_ADMINISTRATOR.

Must reuse (do not re-create):
- ResourcesService.addCapability / removeCapability and their routes; extend them with
  audit rows. Add verifyCapability next to them.
- assertCanManageOrg for add/remove (Org Admin only for their own organization).
- AddCapabilityDto; add a small DTO for { verified: boolean } in the same dto folder.
- AuditService and AuditAction values already used in resources.service.ts.
- The capability chips already rendered in RegistryTab.tsx, the existing Dialog/Select/
  Badge components, and features/resources api.ts + hooks.ts for the new fetchers/hooks.
- Resource findAll/findById already include resource_capability_assignments with the
  capability; read is_verified from there instead of a new query.

Traps:
- GET /v1/resources/capabilities must be declared before GET ':id' (the controller already
  has 'available', 'recommend/:incidentId' and 'requests' above ':id'; put it with them).
- Verifying a capability that isn't assigned returns 404, not a silent no-op.
- Matching keeps counting only verified capabilities (resource-matching.service.ts); only
  add the "(n unverified not counted)" note to the rationale.
- Audit rows use moduleId 'MOD-29' (K4) and record unit call sign and capability name.
- Invalidate the resources query after add/remove/verify so chips update without reload.

Tests: backend service/controller tests for catalog, add twice refused, other org refused,
verify flips is_verified and is audited, verify by ORG_ADMINISTRATOR refused; matching
rationale includes the unverified note. Frontend spec for the chip label logic if it is a
pure function.

Guide (plan Phase 7): in MOD-28 replace "Not implemented" with the capability steps from
the plan's Done when.

STOP after the §0 F report.
```

---

## Prompt 7 — Remaining testing-guide updates

```
Read docs/plans/TESTING_ERRORS_FIX_PLAN.md Phase 7 and
docs/module-reports/MODULE_TESTING_GUIDE.md. Make only the guide edits that belong to no
code phase:

1. MOD-40 Dispatcher SLA and Escalation Engine: replace the steps with the full test:
   set DEFAULT_SLA_ACKNOWLEDGE_SECONDS=30, DEFAULT_SLA_DISPATCH_SECONDS=60 and
   DEFAULT_SLA_RESPONSE_SECONDS=60 in backend/.env and restart; an ignored incident
   escalates to LEVEL_1_SUPERVISOR, then LEVEL_2_INCIDENT_COMMANDER, then
   LEVEL_3_ADMINISTRATOR; acknowledging in time creates no escalation; cancelling within
   the window creates none; supervisor Acknowledge then Resolve; a dispatcher gets the
   supervisor-only message. Check every value against
   backend/src/jobs/processors/sla-monitor.processor.ts and
   backend/src/emergency-alerts/ops-alert.service.ts before writing it.
2. Add a note near the accounts table: keep AgapDev2026! when the change-password screen
   appears, or post the new password in the team chat; staff accounts lock for 15 minutes
   after 5 wrong passwords.
3. For each item of Phase 7 whose phase has a "Phase N status" section in the plan,
   confirm the guide edit was made; list any that are missing. Do not write guide steps
   for phases that haven't been built.

Match the guide's existing style (numbered steps, **Account:** line). Don't commit.
Report the edits, then STOP.
```

---

## Prompt R — Independent review of a phase (run after each phase)

Replace `N` with the phase number.

```
You are reviewing Phase N of docs/plans/TESTING_ERRORS_FIX_PLAN.md, implemented in an
earlier session (uncommitted). Do not re-implement it.

1. Read CLAUDE.md, the plan's Rules and Phase N (including its "Phase N status" section),
   and §0 and the Corrections table of docs/plans/TESTING_ERRORS_FIX_PROMPTS.md, and the
   Prompt N block in that file.
2. Identify the phase's changes with `git status --short` and `git diff`, limited to the
   files the status section lists plus any new untracked files of this phase.
3. Check, with evidence (file:line), each of:
   a. Every numbered step and ticked "Done when" item is really implemented.
   b. Bugs: wrong conditions, missed awaits, wrong Prisma filters, route order, race
      conditions (locks inside transactions), null and empty-list cases, stale React Query
      caches, socket listeners not removed.
   c. Duplication: a second fetcher, hook, route, DTO, status list or refresh path where
      the prompt's "Must reuse" list named an existing one.
   d. Rules: no autonomous dispatch, audit rows for consequential actions with the old
      module tag, no reporter identity exposed, role and organization checks on the server.
   e. Tests assert the behaviour (not only that a mock was called), and no existing test
      was weakened or deleted.
   f. The testing-guide edit for this phase exists and matches the code.
4. Fix only confirmed problems, smallest change first. Then run §0 D in full.
5. Add a "Review — <date>" subsection under Phase N's status section: findings, fixes,
   test counts, anything left open. Don't commit.

Report the findings (fixed / open) and the test counts, then STOP.
```
