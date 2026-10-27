# Handoff: Role dashboards Phases 5a, 5b and 6 done; Phase 7 next

**Date:** 2026-10-22
**For:** the next session (or a teammate) picking this up cold.
**Plan:** [ROLE_DASHBOARDS_PLAN.md](../plans/ROLE_DASHBOARDS_PLAN.md). Each phase has a "Phase N status" section with what was found, built, deviated, verified and left pending. Read the section for the phase you touch; this file is the summary.
**Earlier handoffs:** [role-dashboards-phase1](2026-10-22_role-dashboards-phase1.md), [incident-timeline-push-and-verified-reporter](2026-10-22_incident-timeline-push-and-verified-reporter.md) (current state of the push feature), [reporter-resolution-push](2026-10-22_reporter-resolution-push.md) (Firebase setup).

---

## Where things stand

**Everything is committed.** `main` at `c9d03c1`:

| Commit | What |
|---|---|
| `c48873a` | Phase 3: Supervisor oversight |
| `f357a02` | Phases 4 and 5a: dispatcher summary, incident history, system health, integrations, security events |
| `16ced46` | Native Android Firebase setup (google-services plugin) |
| `fbbe369` | Incident timeline push, dispatcher alerts, Verified Reporter badge |
| `823947c` | Docs: module reports, module gaps plan |
| `942ed16` | Phase 5b: System Administrator loses operational powers |
| `c9d03c1` | Phase 6: Org Administrator access, server own-org checks |

**Left uncommitted on purpose** (don't stage them):
- `mobile/app.json`: EAS account switch to `catchy-sql`. Commit only if the team moves accounts (see the push handoff).
- `frontend/tsconfig.tsbuildinfo`: build artifact. `git checkout -- frontend/tsconfig.tsbuildinfo`.
- 18 files under `mobile/android/`: line endings only from `expo prebuild`. `git checkout -- mobile/android` is safe (Firebase files are already committed).
- `docs/AGAP_Individual_Module_Report_Template.pdf`: the user's call.

**Test baseline:** backend **45 suites, 696 tests**; frontend **59 tests**; both type checks clean.

---

## What each phase did (one line each; details in the plan)

- **5a:** `GET /administration/health` now pings Redis for real, lists job counts for all 9 queues and reports integrations (SMS, push via `FIREBASE_*`, maps) with booleans only. Every check has a 2 s timeout. `GET /audit` takes comma-separated actions and `entityId`. New pages: `/administration/integrations` and `/administration/security`. Roles & Permissions now says "reference list".
- **5b:** the System Administrator is removed from incident status, false alert, cancel, all escalation endpoints, and surge activate/deactivate/broadcast. Incident chat is read-only for it; the Org Administrator has no chat access. SLA alerts go to staff **who can sign in** (not `status = ACTIVE`), with Dispatchers as fallback (`jobs/escalation-recipients.ts`).
- **6:** the Org Administrator gets a sidebar (Dashboard, Organizations, Fleet & Units, Requests, Barangay Directory), `OrgDashboard` and a Requests inbox. The server now enforces own-org on every Org Administrator write (`organizations/org-scope.ts`). Mutual-aid responses are guarded on `PENDING` and can't accept their own organization's request.

---

## Findings worth knowing (they surprise people)

1. **Staff accounts are `PENDING_VERIFICATION`, not `ACTIVE`**, by design (`auth/account-status.ts`: they can still sign in). Every staff account in the dev database is in this state. **Any query with `status: 'ACTIVE'` for staff finds nobody.** Fixed for SLA/escalation recipients in 5b. **Still broken:** `disaster-mode.service.ts:118` (responders for surge).
2. **`escalation.processor.ts` never runs**: nothing enqueues `QUEUE_NAMES.ESCALATION`. The live SLA path is `sla-monitor.processor.ts`.
3. **`GET /resources/requests` returns a plain array** with Prisma relation names. The frontend fetcher (`features/incidents/command.ts`) now adapts it. Before, the Multi-Agency Mutual Aid tab was always empty.
4. **Failed BullMQ jobs stay in Redis**, so one old failure keeps the admin health banner red. The dev Redis has one real failed barangay SMS (2026-10-21, HTTP 401).
5. **`PERMISSION_DENIED`** is in the audit enum but nothing writes it.
6. **`pnpm lint` in `frontend/` fails** before linting (ESLint options error in `next lint`). Unrelated to this work.

---

## What's next

### 1. Phase 7: approval for CRITICAL advisories (behind a flag)
The only phase with a migration. Spec in the plan (§7.1–7.6). Key points:
- **Two migrations**, because PostgreSQL can't use a new enum value in the same transaction: `ADD VALUE 'PENDING_APPROVAL'`, then three columns. Write the SQL by hand, then `pnpm prisma migrate deploy && pnpm prisma generate`. **Never `migrate dev`** (the dev database has drift it would reset).
- Flag `ANNOUNCEMENT_APPROVAL_REQUIRED` (default `false`). With it off, behaviour must be exactly as today.
- Declare `GET /announcements/approvals` **before** `@Get(':id')`, or `ParseUUIDPipe` returns 400.
- Rebuild `shared` after changing the enum: `pnpm --filter @agap/shared build`.
- Before building, do a **data review** like the other phases: check how `publish()`/`schedule()`/`afterPublish()` work today and whether anything already writes `approved_by_id`.

### 2. Signed-in walkthroughs (not done for any phase 1–6)
Each phase's **Done when** list in the plan. The important ones:
- **5a:** stop Redis while the backend runs → the admin dashboard turns red within one refresh. Five wrong passwords on a test account → `LOGIN_FAILED` ×5 and `ACCOUNT_LOCKED` in Security Events.
- **5b:** as the System Administrator, `PATCH /v1/incidents/:id/status`, `POST /v1/escalations/:id/resolve` and `POST /v1/disaster-mode/activate` return 403; as the Supervisor they work. **Full emergency flow re-run:** citizen SOS → acknowledge → dispatch → responder accept → on scene → resolve → close.
- **6:** as `orgadmin@mdrrmo.bocaue.gov.ph`, every sidebar link loads with no 403; editing a BFP unit is refused; a Barangay Directory edit appears in the Audit Log.
- **Push feature:** its own walkthrough list is in the push handoff.

### 3. Open decisions for MDRRMO
- **Mutual-aid Deny** closes a request for every organization (requests are broadcast). Per-organization decline needs a schema change.
- **Mutual-aid approve/deny** still allows the System Administrator (backend and the Multi-Agency `canRespond` flag). The Org Administrator owns this; removing the System Administrator is one line.
- **Registry audit:** organization and unit edits aren't audited.
- Phase 0 decisions D1–D7 still use their defaults and aren't recorded with who decided.

### 4. Security follow-up (carried over)
- Rotate the Firebase service-account key `98d8ac11…` (it was pasted into an AI chat). Steps in the push handoff under "Rotation pending".

---

## How to work in this repo (gotchas)

- **Backend tests:** `cd backend && pnpm jest --config ./test/jest.config.ts --testTimeout=30000`. Without the longer timeout, the bcrypt-heavy auth suites can time out on a busy machine.
- **Type checks:** `pnpm typecheck` in `backend/` and `frontend/`. Mobile only when `shared/` changes.
- **Don't edit files with PowerShell `Get-Content`/`Set-Content`**: they garble UTF-8.
- **Commit commands for the user are PowerShell:** quote paths with `(ops)`. Avoid `[id]` in pathspecs (git treats brackets as a glob); stage the parent folder instead.
- **Live checks without the HTTP stack:** small `ts-node` scripts in the session scratchpad, run from `backend/` with `require(process.cwd() + '/node_modules/...')`, `transpileOnly`, and `compilerOptions: { module: 'commonjs', moduleResolution: 'node' }`. That's how health, recipients and org-scope were checked against the dev database and Redis.
- **Every phase so far started with a data review** (does anything actually write the column or queue this depends on?). It found a real problem in phases 3, 4, 5a, 5b and 6. Keep doing it.
- **Record each phase** in the plan: update the Status line at the top and add a "Phase N status" section (data review, built, deviations, verified, pending).
- **Locked test account:** five wrong passwords lock it (15, 30, then 60 minutes). To unlock without a reset, do what `AdministrationService.unlock()` does: `failed_login_count = 0`, `locked_until = NULL`, `lockout_level = 0`, plus an `ACCOUNT_UNLOCKED` audit row.
- **No real phone numbers** in code, tests or docs: use `+63917000000x`.
