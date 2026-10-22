# Handoff: Role dashboards — Phase 1 built, walkthrough fixes, console rate limit

**Date:** 2026-10-22
**For:** whoever continues next — a new session, a teammate, or another agent.

**Plan:** [ROLE_DASHBOARDS_PLAN.md](../plans/ROLE_DASHBOARDS_PLAN.md). Phase 1 is built; its "Phase 1 status" section lists what was verified and what's pending. Phases 2–7 are not started. Phase 0 decisions use their defaults.
**Spec:** [AGAP_Role_Rules_and_Dashboard_Content.md](../AGAP_Role_Rules_and_Dashboard_Content.md), rewritten this session. Its §0 holds the navigation rules and the page-name table. The [mockups](../dashboards-mockups/) are layout and style only (see their `READFIRST.md`); the spec decides content.

**State:**
- **Nothing from this session is committed.** The last commit is `d980071` (barangay automation). About 34 paths are changed.
  - Two files were moved with `git mv`, so their renames are already staged: `app/(ops)/dashboard/page.tsx` → `components/dashboard/OpsDashboard.tsx`, and `app/(ops)/resources/page.tsx` → `components/resources/RegistryTab.tsx`.
  - New files at both old paths are untracked. Commit with `git add -A` so both sides go in.
- **Backend:** type check clean; full suite passes (36 suites, 564 tests).
- **Frontend:** type check clean; 58 tests pass, including the new `__tests__/role-access.spec.ts`.
- **Lint:** `pnpm lint` in the frontend fails before linting anything. `next lint` passes options the installed ESLint no longer accepts. This was broken before this session.

---

## Decisions made this session

- **No separate Mayor role.** The LGU account (`ANNOUNCEMENTS_PUBLISHER`) is an Information Officer posting on behalf of the Office of the Mayor.
- **No separate Incident Commander role.** Incident Commander is an ICS post held by a Supervisor; its views are sections of the Command / ICS page.
- **The Supervisor keeps dispatch authority,** for night shifts.
- **The System Administrator loses operational powers** in Phase 5b (not done yet).
- **One `/dashboard` route** shows different content per role.
- **Profile lives in the user menu only,** never in a sidebar.
- **Each page has one name for every role.**
- **The Hospital User has no sidebar;** the portal is its only page.
- **The barangay alert SMS and the `/b` page are out of bounds** for this plan; that's a guardrail in the plan. The mockup's "Send SMS" and "Broadcast" buttons were dropped; they are unrelated to the barangay alert.

---

## What changed this session

### 1. Phase 1 (frontend only)

- **One source for navigation:** `frontend/lib/role-access.ts` holds the sidebar per role, the landing pages, `canOpen()` per route, and `showsSidebar()`.
- **`Sidebar.tsx`** only picks icons now. It doesn't mount at all for the Hospital User.
- **New `RouteGuard.tsx`:** a page a role can't use shows "Not available for your role". Hospital users are still redirected to their portal.
- **Duplicate code removed:** the copies of `landingForRole` and `safeNextPath` in `change-password/page.tsx` are gone.
- **`/dashboard` by role:**
  - Dispatcher and Supervisor: the existing dashboard (`OpsDashboard.tsx`).
  - System Administrator: system health, account and unit counts, newest accounts (`AdminDashboard.tsx`).
  - LGU and Org Administrator: a placeholder with **no counts**. This fixes the fake "0 incidents / All clear".
- **Fleet & Units** has two tabs: Units & Personnel, and Registry. The System Administrator sees the Registry only. `/resources` redirects to it.
- **Administration** is now four routes: `/administration/users`, `/permissions`, `/barangays`, `/config`. `/administration` redirects to `/dashboard`.
- **`docs/USER_ACCOUNTS.md`** is corrected: the typo, the closure wording, the seeded Org Administrator account, and the LGU description.

### 2. Fixes found during the signed-in walkthrough

- **Admin dashboard crash** (`reading 'total'`):
  - **Cause:** `GET /resources` returns a plain array, but the frontend expected `{ data, meta }`.
  - **Fix:** `features/resources/api.ts` wraps the array.
  - **This also fixes Fleet & Units and the Registry,** which had been listing no units, probably since before Phase 1.
- **The Surge page asked for triage tags with no surge active** (400 ×4). It now asks only during an active surge.
- **Frontend queries no longer retry on 4xx** (`providers/providers.tsx`). Network failures and 5xx still retry.

### 3. Backend: console rate limit (approved by the user)

- **Global throttle** in `app.module.ts`: raised from 5/s and 30/min to **20/s and 600/min** per IP. The old default caused 429s on Supervisor actions such as escalation Resolve.
- **Public endpoints kept at the old limits,** each with its own explicit `@Throttle`:
  - announcements subscribe/unsubscribe;
  - `auth/register/guest`, `auth/refresh` and `auth/verify/email`.
- **Unchanged:** SOS/shake, the barangay `/b` code endpoints, sign-in and MFA. These already had stricter limits.

---

## Walkthrough status (Phase 1 "Done when")

| Account | Status |
|---|---|
| `admin@agap.local` | Signed in. The dashboard crash is fixed; **re-check** the dashboard and Fleet & Units after a reload |
| `supervisor@…` | Signed in. **Re-check** that Resolve gets no 429, and that Surge shows no 400 with no surge active |
| `announcements@lgu…` | ✅ Correct sidebar and placeholder; no AGAP console errors |
| `receiving@bocauehospital…` | ✅ Portal works. Sidebar now hidden; **re-check** after a reload |
| `dispatcher1@…` | Not checked |
| `orgadmin@mdrrmo…` | Not checked |

**Open question: the "Connecting…" badge.** It stayed visible on the LGU and Hospital screenshots.
- **Backend tested directly:** Hospital and Dispatcher test tokens both connect in about 20 ms and stay connected. The ops-room refusal for non-staff doesn't disconnect.
- **Likely cause:** a Fast Refresh artifact in development.
- **To confirm:** do a full reload (Ctrl+Shift+R) and see whether it turns **Live**, then compare with `dispatcher1`. If it's still stuck only for non-staff roles, trace `lib/use-ws-state.ts` and `providers/socket-provider.tsx`.

---

## Open items, in priority order

1. **Finish the walkthrough** (table above), including the "Connecting…" check.
2. **Commit Phase 1 on its own** with `git add -A`. A suggested message: `feat(web): role-based navigation and dashboards (role dashboards plan, phase 1)`. The rate-limit change can share this commit or go separately, as `fix(api): raise console rate limit; pin public endpoint throttles`.
3. **Phase 2:** the Municipal Overview for the LGU account. It adds one count-only backend endpoint, `GET /v1/analytics/municipal-overview`.
4. **Hospital facility scoping** (privacy; older than Phase 1, and separate from it).
   - `GET /hospitals` lists every hospital.
   - `GET /hospitals/:id/referrals` has no role check in its decorators.
   - Once a second hospital exists, a Hospital User could read another facility's referrals.
   - Scope both to the user's own facility. Not yet in the plan; add it.
5. **Optional: a Playwright walkthrough script.** The user asked about automating the walkthrough. The suggestion is a deterministic Playwright test, not an AI model; it doesn't need the OpenAI key.
   - It needs a dev-only reset script for test-account passwords, because every seeded account forces a password change on first sign-in.
   - It adds about 150 MB of development dependencies. **Not started**; waiting for the user's go-ahead.
6. **`backend/.env` cleanup** (not done):
   - `INITIAL_ADMIN_*` is defined twice, with different passwords. Delete lines 70–71. The admin's database password matched line 71, the later duplicate.
   - `AUTH_SMS_MFA_ENABLED=false+63` should be `false`.
   - `MFA_ENCRYPTION_KEY` was printed in a session log; rotate it if this setup goes beyond local development.
7. **Known gaps, not blocking:**
   - `incident_metrics` is never filled, so Analytics response times are empty. Phase 2 computes from incident timestamps instead.
   - The Registry's Organization column shows "—", because the resources list doesn't include each unit's organization.
   - MapLibre logs missing sprite icons (cosmetic).
8. **Carried over:**
   - Phase 5 SMS-reply live test. The barangay SIM needs load, and the Textbee promo expires **2026-10-24 08:50**.
   - Real phone numbers in committed files. The barangay commit may include the two demo phone numbers; check before pushing.

---

## Gotchas

- **Console noise to ignore:**
  - `WELLDONE Wallet is not initialized` comes from a browser wallet extension.
  - One `/auth/refresh` 401 at page load is the normal session check.
  - A `/incidents/:id/ics` 404 means ICS isn't activated for that incident.
- **The rate limit is per IP.** Staff on one network share 600/min. Per-user limits would need a custom throttler guard, because the throttler runs before authentication.
- **`useSearchParams`** in App Router pages needs a `<Suspense>` boundary (see the Fleet page).
- **Disabled TanStack Query v5 queries are not `isLoading`.** Never use their empty `data` as "zero"; that's what caused the "All clear" bug.
- **Carried over:**
  - Backend Jest: `pnpm jest --config ./test/jest.config.ts`.
  - Migrations: `migrate deploy` only.
  - Don't edit files with PowerShell `Get-Content`/`Set-Content`; they garble UTF-8.
  - Sign test JWTs with `crypto`; `jsonwebtoken` isn't a direct dependency.
