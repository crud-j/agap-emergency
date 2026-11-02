# Plan: Fix the Errors Found in the 2026-11-02 Module Testing

> **Status (2026-11-02):** Phase 1 done and walked through; Phases 2–6 built (walkthroughs pending; Phase 5 has a citizen-map follow-up); Phase 7 (guide) done. Each root cause below was checked against the code, `backend/prisma/schema.prisma` and the live dev database.
> **How to use:** build one phase at a time. The phases don't depend on each other, so they can be split between members. Each phase ends with a **Done when** checklist; after it passes, re-run that module's section of [../module-reports/MODULE_TESTING_GUIDE.md](../module-reports/MODULE_TESTING_GUIDE.md). Ready-to-paste prompts per phase: [TESTING_ERRORS_FIX_PROMPTS.md](TESTING_ERRORS_FIX_PROMPTS.md).
> **Numbering:** module numbers are the **new** ones used in the testing guide. Report files and backend audit `module_id` tags still use the old numbers, which are shown in brackets.
> **No migrations are needed.** Every table and column used below already exists.

## Context

The testers reported six errors. Two of them turned out to be test setup, not code bugs; they still get a fix so the next tester doesn't hit them.

| Phase | MOD (new / [old]) | Reported error | Root cause | Kind | Size | Owner |
|---|---|---|---|---|---|---|
| 1 | 26 [27] Organization and Resource Registry | Add Resource: Organization dropdown is empty, "Organization is required" | The org list fetcher expects `{ data }`; the backend returns a plain array | Bug | XS | Christian Joaquin |
| 2 | 43 [44] Incident Handover | "No other active dispatcher or supervisor" | Recipients must have `status = ACTIVE`; every seeded staff account is `PENDING_VERIFICATION` | Bug | XS | Arjar Mauricio |
| 3 | 34 [35] Resource Request and Mutual Aid | No accept button; Provider is blank | Only an Org Admin of *another* organization can Provide; the seed has no such account | Test setup + UX | S | Aldrin Dela Cruz |
| 4 | 32 [33] Secure Incident Communication | Citizen ↔ responder chat doesn't sync; each phone sees only its own bubbles | Phone-side socket and token handling; the server side works | Bug | M | Aldrin Dela Cruz |
| 5 | 30–31 [31–32] Dispatch / Responder interface | Can't send a second unit | The backend refuses a dispatch once the incident is `DISPATCHED`; the screen has no "add unit" action | Missing feature | M | Christian Joaquin |
| 6 | 28 [29] Incident-to-Response Capability Matrix | No screen to assign or verify capabilities | Add/remove endpoints exist but no catalog, no verify endpoint, no screen | Missing feature | M | Christian Joaquin |

The report calls the handover error "MOD-39? / Multi-Agency Coordination" because the **Create Handover** dialog lives on the Multi-Agency page. It belongs to MOD-43 Incident Handover.

**Rules that apply to every phase (from `CLAUDE.md`):**
- Recommendations assist people; they never decide (Rule 8). A second unit is still dispatched by a dispatcher.
- Every consequential action is audited (Rule 11). Capability changes and extra dispatches get audit rows.
- The system must never silently fail (Reliability rules). The chat must show when it is not live.
- Reporter identity is never revealed (Rule 15). The chat keeps role labels only.

**After each phase:** run `pnpm typecheck`, the package tests (backend: `npx jest --config ./test/jest.config.ts`), and the manual walkthrough in **Done when**.

---

## Phase 1 — MOD-26 [27]: Organization dropdown is empty

### What exists
- `GET /v1/organizations` returns a **plain array** of active organizations ([organizations.service.ts:11-16](../../backend/src/organizations/organizations.service.ts#L11-L16)).
- `fetchOrganizations` is typed as `PaginatedResult<Organization>` and returns the response unchanged ([features/organizations/api.ts:36-46](../../frontend/features/organizations/api.ts#L36-L46)).
- All four callers read `orgsData?.data`, which is `undefined` for an array, so they all get an empty list:
  - Add/Edit Resource dialog ([RegistryTab.tsx:95-99](../../frontend/components/resources/RegistryTab.tsx#L95-L99)): the dropdown is empty, so saving fails with "Organization is required." ([:131](../../frontend/components/resources/RegistryTab.tsx#L131)).
  - Registry org filter ([RegistryTab.tsx:274](../../frontend/components/resources/RegistryTab.tsx#L274)).
  - Fleet board org names ([operations/fleet/page.tsx:359](../../frontend/app/(ops)/operations/fleet/page.tsx#L359)).
  - The **Organizations** page list ([organizations/page.tsx:255-256](../../frontend/app/(ops)/organizations/page.tsx#L255-L256)).
- `fetchResources` already handles the same situation by wrapping the array ([features/resources/api.ts:53-63](../../frontend/features/resources/api.ts#L53-L63)).

### Steps
1. In `fetchOrganizations`, accept `Organization[] | PaginatedResult<Organization>` and wrap an array into `{ data, meta }`, the same way `fetchResources` does. Keep the backend unchanged; the other `/organizations` callers (`fetchOrganization` by id) are unaffected.
2. The backend ignores the `orgType`, `page` and `perPage` query values. No caller relies on them today; leave a one-line comment in the fetcher saying so.
3. Add a frontend unit test for `fetchOrganizations` with an array response.

### Done when
- [x] admin: **Fleet & Units → Registry → Add Resource** lists MDRRMO, BFP and the hospital, and a new unit saves.
- [x] orgadmin@mdrrmo: the dropdown shows only MDRRMO.
- [x] The **Organizations** page lists the three organizations, and the Registry org filter has them too.

### Phase 1 status (2026-11-02)

**Built.** The array-to-`PaginatedResult` wrap that lived inside `fetchResources` is now `asPaginated` in `frontend/lib/api.ts`. `fetchResources` and `fetchOrganizations` both call it, so the four `useOrganizations` callers (RegistryTab ×2, Fleet board, Organizations page) get `{ data, meta }` with no change of their own. `fetchOrganizations` has a one-line comment that the backend ignores `orgType`, `page` and `perPage`. The backend and the RegistryTab Org Administrator filter are unchanged.

**Files.** Changed: `frontend/lib/api.ts`, `frontend/features/organizations/api.ts`, `frontend/features/resources/api.ts`. Added: `frontend/__tests__/organizations-api.spec.ts` (plain array, empty array, already-paginated body).

**Duplication inventory.** Wrap logic: existed in `fetchResources` only, extracted and reused. `fetchOrganizations` test: missing, added. Guide MOD-26 check: partial (step 4 named the Organizations page only), extended.

**Deviations.** Step 3 asked for an array test; the spec also covers an already-paginated body. No existing frontend spec mocked `lib/api`, so this is the first one: it uses `jest.requireActual` to keep the real `asPaginated` and stubs only `api.get`.

**Tests.** Frontend: 10 suites / 152 tests → 11 / 155, all passing. `pnpm typecheck` clean before and after. Backend and shared not touched.

**Walkthrough (2026-11-02).** All three **Done when** checks passed in the browser (admin and orgadmin@mdrrmo).

---

## Phase 2 — MOD-43 [44]: Handover recipient list is empty

### What exists
- Recipients query: `role in (DISPATCHER, SUPERVISOR) and status = 'ACTIVE'` ([incident-handover.service.ts:77-83](../../backend/src/incidents/incident-handover/incident-handover.service.ts#L77-L83)). Creating a handover repeats the same check ([:37](../../backend/src/incidents/incident-handover/incident-handover.service.ts#L37)).
- In the dev database, **every** seeded account except one citizen is `PENDING_VERIFICATION`, the schema default. The seed never sets `status`.
- Sign-in deliberately allows `PENDING_VERIFICATION`; only `SUSPENDED` and `DEACTIVATED` are blocked ([account-status.ts](../../backend/src/auth/account-status.ts)). SLA alerts already use this "can sign in" rule ([jobs/escalation-recipients.ts:15-26](../../backend/src/jobs/escalation-recipients.ts#L15-L26)).
- Same filter, same problem: the supervisor staff-workload list in oversight ([oversight.service.ts:209](../../backend/src/oversight/oversight.service.ts#L209)) hides pending-status staff unless they have open incidents.

### Steps
1. In `IncidentHandoverService.recipients` and `create`, replace `status: 'ACTIVE'` with the can-sign-in rule: `status: { notIn: [...BLOCKED_ACCOUNT_STATUSES] }` and `!isAccountBlocked(recipient.status)`.
2. Apply the same rule to the oversight staff list (line 209).
3. Seed: set `status: ACTIVE` on every staff account it creates, so fresh databases look like real accounts. The seed uses `upsert` with `update: {}`, so existing databases keep their status; step 1 is what fixes them.
4. Leave `announcement-push.processor.ts` alone: there `ACTIVE` means a citizen who verified a phone, which is intended.
5. Tests: recipients include a `PENDING_VERIFICATION` dispatcher and exclude a `SUSPENDED` one; creating a handover to a `DEACTIVATED` user is refused.

### Done when
- [ ] supervisor: **Create Handover** lists dispatcher1 and dispatcher2.
- [ ] A suspended dispatcher (suspend via Users & Accounts) is not listed.
- [ ] The rest of guide MOD-43 passes.

**Known gap, not in this phase:** a Dispatcher can receive a handover but has no screen to acknowledge it (the button is only on Command / ICS). The guide already says to test with two Supervisors.

### Phase 2 status (2026-11-02)

**Built.** `IncidentHandoverService.recipients` filters on `status: { notIn: [...BLOCKED_ACCOUNT_STATUSES] }` and `create` refuses with `isAccountBlocked(recipient.status)`, both from `auth/account-status.ts`. The refusal message is unchanged and the same for an unknown, blocked or wrong-role user. The oversight staff-workload list uses the same rule in place of `status: 'ACTIVE'` and keeps the open-incidents clause. The seed sets `status: user_status.ACTIVE` in the `create` block of the ten staff accounts (admin through orgadmin). Citizen and bystander are unchanged, and `update: {}` is untouched, so existing databases rely on the code fix (K2).

**Files.** Changed: `backend/src/incidents/incident-handover/incident-handover.service.ts`, `backend/src/oversight/oversight.service.ts`, `backend/prisma/seed/seed.ts`, `backend/src/auth/account-status.ts` (comment only: seeded staff are no longer all PENDING_VERIFICATION), `backend/test/incidents/incident-handover.spec.ts`, `backend/test/oversight/oversight.spec.ts`.

**Duplication inventory.** `BLOCKED_ACCOUNT_STATUSES` / `isAccountBlocked`: existed, reused. Can-sign-in filter: existed in `jobs/escalation-recipients.ts`, same style reused. Handover tests: existed; the recipients test asserted the old `status: 'ACTIVE'` filter and was replaced with one that runs the built filter against fixture users. Oversight workload test: existed, one case added.

**Deviations.** Not touched, as planned: `announcement-push.processor.ts` (citizen-only `ACTIVE`), and the surge, escalation and assessment `status: 'ACTIVE'` filters, which are about surges and escalations, not users. The web dialog's empty-state text ("No other active dispatcher or supervisor") was left as is; it is still accurate.

**Tests.** Backend: 93 suites / 1519 tests → 93 / 1522. The only failures, before and after, are 5 s timeouts in `test/auth/auth-phase2.spec.ts` and `auth-phase3.spec.ts` (bcrypt-heavy BackupCodesService / MfaService cases; 9 failed in the baseline run, 2 after, depending on machine load). `pnpm typecheck` clean. `pnpm test:e2e` 1/1 before and after. Boot check: a separate build on port 3999 logged "Nest application successfully started" with no DI error (the dev server on port 3000 was left running).

**Follow-up (2026-11-02, asked for during the walkthrough).** **Command / ICS → Handover panel → Hand over** asked for the incoming operator's raw User UUID. Multi-Agency → Handover already had a name dropdown fed by `GET /incidents/handover/recipients`. The two pages had near-identical `CreateHandoverDialog` copies, so the Multi-Agency one moved unchanged to `frontend/components/command/CreateHandoverDialog.tsx` and both pages import it. Both pages now pick the operator by name, and the UUID field is gone. Frontend typecheck clean, tests 11 / 155 passing. Lint on the changed files is clean apart from three unused icon imports (`AlertTriangle`, `ClipboardList`, `HandshakeIcon`) in `multi-agency/page.tsx` that were unused before this change.

**Open.** The three **Done when** walkthroughs need a person in the browser. The dev server on port 3000 must have reloaded with this change (restart `pnpm start:dev` if unsure).

---

## Phase 3 — MOD-34 [35]: Nobody can Provide a mutual-aid request

### What exists
- **Provide / Deny** appear only when the request is `PENDING`, the viewer has an organization, and that organization is not the requester ([RequestsInbox.tsx:145](../../frontend/components/resources/RequestsInbox.tsx#L145)).
- The approve route allows `ORG_ADMINISTRATOR` and `SYSTEM_ADMINISTRATOR`, and makes the actor's organization the provider ([resources.controller.ts:86-96](../../backend/src/resources/resources.controller.ts#L86-L96), [resources.service.ts:203-247](../../backend/src/resources/resources.service.ts#L203-L247)). A System Administrator has no organization, so approval fails with "Actor is not a member of any organization".
- The only Org Administrator in the seed is `orgadmin@mdrrmo.bocaue.gov.ph` ([seed.ts:169-180](../../backend/prisma/seed/seed.ts#L169-L180)). The request in the report was made by MDRRMO, so no account can Provide it. The guide asks testers to create a BFP Org Admin first, which was skipped.
- The blank Provider ("—") is correct for a Pending request: `providing_org_id` is set only on acceptance.

### Steps
1. **Seed:** add `orgadmin@bfp.bocaue.gov.ph` (Org Administrator, BFP membership) and `orgadmin@bocauehospital.gov.ph` (Org Administrator, hospital membership; MOD-38's guide section needs it too). Use the existing membership list ([seed.ts:266-280](../../backend/prisma/seed/seed.ts#L266-L280)) and print them in the seed summary.
2. **Inbox:** when the viewer can't act on a Pending row, say why instead of showing nothing: "Your organization made this request" or "Only an Org Administrator of another organization can provide units." On the Requests page for a System Administrator, show one line: "You can view requests. An organization's administrator answers them."
3. **Backend:** for a System Administrator without an organization, return a clear 403 ("Only an organization's administrator can provide units") instead of the 400 from `resolveOrgForUser`.
4. Update the testing guide's accounts table and MOD-34 section with the new seed accounts.

**Decision for the team (not in this plan unless agreed):**
- In Bocaue, BFP often accepts by radio and may never sign in. Should a Supervisor be able to **record** another agency's acceptance on its behalf (choose the providing organization, audited as "recorded by")?
- Today any other organization's **Deny** closes the request for everyone, so one organization declining stops the others from offering. Should a non-requester's answer be "Decline for my organization" instead, leaving the request open?

### Done when
- [ ] dispatcher1 creates a request → orgadmin@bfp sees **Provide** → accepts → status Accepted, Provider = BFP Bocaue, audit row written.
- [ ] orgadmin@mdrrmo sees its own request with "Your organization made this request" and no buttons.
- [ ] admin sees the read-only note.

### Phase 3 status (2026-11-02)

**Built (steps 1–4).** The two "Decision for the team" items have no recorded answer, so they were not built.
1. **Seed.** `orgadmin@bfp.bocaue.gov.ph` (Ramon Cruz, +639171234010) and `orgadmin@bocauehospital.gov.ph` (Teresa Lim, +639171234011) are created as Org Administrators with `status: ACTIVE`, `must_change_password` and `is_email_verified`. They are added to the existing membership list (BFP Bocaue and Bocaue General Hospital) and printed in the seed summary.
2. **Inbox.** On a Pending row the viewer can't answer, `RequestsInbox` now says "Your organization made this request" (own organization) or "Only an Org Administrator of another organization can provide units." (no organization). Rows that aren't Pending show nothing. A System Administrator without an organization sees "You can view requests. An organization's administrator answers them." in place of the "not linked to an organization" banner.
3. **Backend.** `ResourcesService.resolveAnsweringOrg` uses the same membership lookup as `resolveOrgForUser` (split into a private `findOrgIdForUser`; no second query). It returns 403 "Only an organization's administrator can provide units" for an actor with no organization. Approve, deny and the legacy `request/:id/respond` (accept and reject) all call it. A denial still sets no provider.
4. **Guide.** Accounts table (two rows), the old "Accounts the seed does not create" steps replaced by the seeded accounts, MOD-34 (accounts, steps 3 and 5), MOD-38 (account), §2 sidebar (System Administrator: Requests, view only).

**Files.** Changed: `backend/prisma/seed/seed.ts`, `backend/src/resources/resources.service.ts`, `backend/src/resources/resources.controller.ts`, `backend/test/organizations/org-scope.spec.ts`, `frontend/components/resources/RequestsInbox.tsx`, `frontend/lib/role-access.ts`, `frontend/__tests__/role-access.spec.ts`, `docs/module-reports/MODULE_TESTING_GUIDE.md`.

**Duplication inventory.** Seed upsert pattern, membership list, `devHash`, summary block, and the `bfp` / `hospitalOrg` records: existed, reused. `resolveOrgForUser`: existed, its lookup now shared. Inbox explanations, the admin note and the two accounts: missing, added. The 403 test: missing, added next to the existing mutual-aid tests in `org-scope.spec.ts`.

**Deviations.**
- **Deny now needs an organization.** Before, deny looked up no organization, so a System Administrator without one could deny, which closed the request for everyone. It now gets the same 403 as approve (prompt trap: all three routes behave the same).
- **System Administrator can open Requests.** `/resources/requests` (route and sidebar) was Org Administrator only, so the admin could not reach the page that step 2 and **Done when** describe. It now admits the System Administrator. `GET /resources/requests` already allowed that role, and answering is 403 on the server. The pinned sidebar list in `role-access.spec.ts` now includes Requests for the System Administrator, and a `canOpen` assertion was added.
- **One 403 message for all routes.** Deny uses the same wording as approve.
- **Seed check on a scratch database.** Idempotency was checked on a scratch database, not the dev DB, because every seed run puts ALPHA-1 back on INC-2026-DEMO01 as Dispatched. Run twice: both exit 0, 14 users and 10 memberships after each, three Org Admins on their own organizations. The scratch database was dropped. The dev DB does **not** have the two new accounts yet.

**Tests.** Backend: 93 suites / 1522 tests → 93 / 1528. The only failures, before and after, are the `auth-phase2` / `auth-phase3` 5 s timeouts. `pnpm typecheck` clean, `pnpm test:e2e` 1/1, boot check on port 3999 started with no DI error. Frontend: 11 / 155 → 11 / 155 (assertions added inside existing tests), typecheck clean, lint clean on changed files.

**Dev DB (2026-11-02).** The two accounts and their memberships were added to the dev DB with the seed's exact upserts, run on their own so the full seed did not reset ALPHA-1. Both are ACTIVE Org Administrators of BFP Bocaue and Bocaue General Hospital, and must change their password on first sign-in.

**Open.** The three **Done when** walkthroughs need a person in the browser.

---

## Phase 4 — MOD-32 [33]: Chat doesn't sync between citizen and responder

### What was verified (server side works)
- The database has 11 messages on `INC-2026-000015` from both the reporter and responder1, so **sending works for both sides**.
- With test tokens for that reporter and responder1, `GET /v1/communications/:incidentId` returned all 11 messages (Reporter, Responder and Dispatcher), both on `localhost:3000` and through the ngrok URL the phones use.
- Both accounts connected to the `/agap` namespace and joined `incident:<id>` with no error, 6 of 6 times on each address ([agap.gateway.ts:95-120](../../backend/src/realtime/agap.gateway.ts#L95-L120)).
- The bubble color is decided by `sender_id === myUserId` ([incident-chat.tsx:76](../../mobile/src/components/chat/incident-chat.tsx#L76)), and the backend does return `sender_id`.

So history loads correctly, and what fails is **live delivery on the phone**. "Each phone sees only its own green bubbles" is what an open chat shows when the socket isn't delivering: the history from when the screen opened, plus messages sent from this phone, which are added locally.

### Root causes found in the mobile app
1. **Chat calls skip the token refresh.** `getIncidentMessages` and `sendIncidentMessage` use `apiFetch` with a passed-in token ([communications.api.ts:20-34](../../mobile/src/services/api/communications.api.ts#L20-L34)), not `authedFetch`, which refreshes on a 401 ([authed-fetch.ts](../../mobile/src/services/api/authed-fetch.ts)). After the 15-minute access token expires, chat loading and sending fail until another screen happens to refresh the token.
2. **The socket reconnects with a stale token and then stays dead.** The shared socket stores a fixed `auth: { token }` ([agap-socket.ts:16-31](../../mobile/src/services/websocket/agap-socket.ts#L16-L31)). When the connection drops (ngrok, mobile data, or a backend restart in watch mode), Socket.io reconnects with that old token. The server rejects an expired token and disconnects the client ([agap.gateway.ts:57-89](../../backend/src/realtime/agap.gateway.ts#L57-L89)). A server-side disconnect is never retried automatically, so the chat sits on "Reconnecting…" and receives nothing.
3. **Leaving the chat drops the Tracking screen's live updates.** Tracking counts how many screens watch each incident room and leaves only at zero ([useIncidentTracking.ts:97-98, 172-178](../../mobile/src/hooks/useIncidentTracking.ts#L97-L98)). The chat hook joins and leaves the same room without that count ([useIncidentChat.ts:65-88](../../mobile/src/hooks/useIncidentChat.ts#L65-L88)). Closing the chat removes the phone from the room while Tracking is still open underneath.
4. **Messages missed while disconnected never appear.** The chat loads history once, when it opens. It doesn't reload after a reconnect or when the app returns to the foreground.
5. **Logging out doesn't close the socket.** `logout` never calls `disconnectSocket` ([auth.store.ts:77](../../mobile/src/stores/auth.store.ts#L77)). If revoking the session doesn't reach the server (for example over a flaky tunnel), the next account on the same phone keeps using the previous user's socket and rooms. This fits the report that responder → citizen "only works on the same device".

### Steps
1. `communications.api.ts`: switch both calls to `authedFetch` (drop the `token` parameter), and update `useIncidentChat`.
2. `agap-socket.ts`:
   - Pass `auth` as a callback that reads the current token: `auth: (cb) => cb({ token: useAuthStore.getState().accessToken })`.
   - On `disconnect` with reason `io server disconnect`, refresh the token (reuse the `doRefresh` logic from `authed-fetch.ts`, exported) and call `socket.connect()` once. If the refresh fails, the user is logged out as today.
   - Move the room counting here: `watchIncidentRoom(incidentId): () => void` joins on first watch, leaves on last release, and re-joins every watched room on each `connect`.
3. `useIncidentTracking` and `useIncidentChat`: use `watchIncidentRoom` instead of emitting `join:incident` / `leave:incident` directly.
4. `useIncidentChat`: reload history on every (re)connect and when `AppState` becomes `active`. While disconnected, poll every 10 s, like Tracking's `DISCONNECTED_POLL_MS`. Merge by `id` and sort by `sent_at`.
5. `auth.store.ts`: call `disconnectSocket()` in `logout`, and in `login` when the user id changes.
6. Gateway (small): return an acknowledgement from `join:incident` (`{ ok: true }` or `{ ok: false, reason }`). The chat can then show "You're not a participant of this incident" instead of failing silently. The existing `error` event stays for older clients.
7. Check the web incident drawer's chat panel against the same three cases: token expiry, backend restart, and closing the drawer.
8. Tests: a unit test for the room counter (two watchers → one leave only at zero; re-join on connect), and a hook test that history reloads on reconnect.

### Done when (two phones + web, on the tunnel the team uses)
- [ ] Citizen (reporter) and responder1 (on the crew) each send a message: it appears on the other phone and in the web drawer within ~2 s, as a white bubble with a role label.
- [ ] Restart the backend while both chats are open: the strip shows "Reconnecting…", then the chat recovers by itself, and messages sent during the restart appear.
- [ ] Leave both chats open for more than 16 minutes (past token expiry), then send: it still works both ways.
- [ ] Close the chat and return to Tracking: the unit's position and status still update live.
- [ ] Log out of the citizen account and log in as responder1 on the same phone: own messages are green, the citizen's are white.

### Phase 4 status (2026-11-02)

**Built (steps 1–8).**
1. `communications.api.ts`: both calls use `authedFetch` (no `token` parameter) and parse with `readJson`, which was split out of `apiFetch` in `http.ts` so the server's message and status are kept.
2. `agap-socket.ts`:
   - `auth` is a callback reading the current token on every (re)connect; `transports: ['websocket']` is kept.
   - On `io server disconnect` the socket calls `refreshAccessToken()` (the exported, de-duplicated refresh from `authed-fetch.ts`, which `authedFetch` now uses too) and reconnects only if that worked. Only one retry per episode: the flag clears after a connection stays up for 5 s, because the gateway rejects a bad token right after `connect`.
   - `watchIncidentRoom(incidentId, onJoin?)` keeps a per-room watcher count and the last join ack. It joins on the first watch, leaves on the last release, and re-joins every watched room once per `connect`, including the first.
   - `connectSocket()` no longer takes a token.
   - `DISCONNECTED_POLL_MS` moved here from `useIncidentTracking`.
3. `useIncidentTracking` and `useIncidentChat` use `watchIncidentRoom`. Tracking's local `roomWatchers` and its direct `join:incident` / `leave:incident` emits are deleted.
4. `useIncidentChat`:
   - The sync wiring is in an exported `attachChatSync`: it reloads history on open, on every `connect` and when `AppState` turns `active`, and polls every `DISCONNECTED_POLL_MS` while disconnected.
   - `mergeMessages` merges by `id` and sorts by `sent_at`.
   - The effect is keyed on the user, not the token, so a refresh doesn't re-join.
   - Send, join and load errors are kept apart; a NOT_PARTICIPANT ack shows "You're not a participant of this incident." The bubble rule `sender_id === myUserId` is unchanged.
5. `auth.store.ts`: `logout` calls `disconnectSocket()` before clearing tokens; `login` calls it only when the user id changes.
6. Gateway `join:incident` returns `{ ok: true }` or `{ ok: false, reason: 'UNAUTHORIZED' | 'NOT_PARTICIPANT' }` as the ack. The `error` event is still emitted.
7. **Web drawer chat checked, no change needed.**
   - Token expiry: `lib/session.ts` refreshes before expiry, `api` retries after a 401 refresh, and `lib/websocket.ts` already uses the `auth` callback.
   - Backend restart: `SocketProvider` invalidates every active query on reconnect, which includes `incident-messages`, and `useJoinIncidentRoom` re-joins on `connect`.
   - Closing the drawer: `IncidentChatPanel` is the only `useJoinIncidentRoom` caller, so its unconditional leave can't cut another watcher. Sign-out disconnects the socket in `SocketProvider`.
8. Tests: `mobile/src/services/websocket/__tests__/agap-socket.test.ts` (11) and `mobile/src/hooks/__tests__/incident-chat-sync.test.ts` (7). `backend/test/realtime/join-incident-ack.spec.ts` (4) is new, since there was no gateway spec to extend.

**Files.**
- Mobile: `src/services/websocket/agap-socket.ts`, `src/services/api/{authed-fetch,communications.api,http}.ts`, `src/hooks/{useIncidentChat,useIncidentTracking,useLiveIncidentRefresh}.ts`, `src/stores/auth.store.ts`, and the two new test files.
- Backend: `src/realtime/agap.gateway.ts` and the new spec.
- Guide: MOD-32 steps 6–9.

**Duplication inventory.** `authedFetch`'s refresh: existed, exported as `refreshAccessToken` with its de-duplication. Shared socket: existed, extended. Room counting: existed in `useIncidentTracking`, moved and deleted there. `DISCONNECTED_POLL_MS`: existed, moved. The "Reconnecting…" strip in `incident-chat.tsx`: existed, unchanged. `apiFetch` error parsing: existed, split out as `readJson` rather than a fourth local `json()` helper.

**Deviations.**
- The disconnected poll is 15 s, the existing `DISCONNECTED_POLL_MS`, not the plan's 10 s.
- The hook test exercises `attachChatSync` with a fake socket instead of rendering the hook: `@testing-library/react-native` isn't installed and `react-test-renderer` is only a transitive dependency, and no new dependencies are allowed. This follows the existing hook-test style, which tests exported functions.
- The join ack type is local to `agap-socket.ts` and the gateway, not in `@agap/shared`, to avoid a `shared` rebuild for one type.
- The baseline for mobile was taken by stashing only `mobile/` (nothing else was uncommitted there) and restoring it.

**Tests.**
- Mobile: 13 suites / 159 → 15 / 177, typecheck clean, lint 0 errors (warnings: `any` in test doubles and in the moved `readJson`).
- Backend: 93 / 1528 → 94 / 1532. The only failures, before and after, are the `auth-phase3` 5 s timeouts. Typecheck clean, e2e 1/1, boot check on port 3999 clean.
- Frontend: not changed.

**Open.** The five **Done when** walkthroughs need two phones, the web console and the team's tunnel. Restart Expo with `npx expo start -c` first (K5).

---

## Phase 5 — MOD-30/31 [31/32]: Dispatch a second unit to the same incident

### What exists
- `POST /v1/dispatch` accepts only incidents in `ACKNOWLEDGED`, `ASSESSED` or `DISPATCH_PENDING` ([dispatch.service.ts:35](../../backend/src/dispatch/dispatch.service.ts#L35)). The first dispatch moves the incident to `DISPATCHED` ([:150-160](../../backend/src/dispatch/dispatch.service.ts#L150-L160)), so a second one is refused: "Incident status DISPATCHED is not dispatchable".
- The responder side already supports several units on one incident: progress from one unit never moves the incident backwards, a late unit can still record `EN_ROUTE`/`ON_SCENE`, and only the **last** active unit's finish resolves the incident ([responders.service.ts:450-585](../../backend/src/responders/responders.service.ts#L450-L585)). Transport also allows a second unit.
- The dispatch screen shows the recommendation panel only while the incident is dispatchable. Once any dispatch exists, it shows only the tracking card ([dispatch/page.tsx:624, 687-693](../../frontend/app/(ops)/operations/dispatch/page.tsx#L624)). The tracking card already lists **every** accepted unit ([UnitTrackingCard.tsx](../../frontend/components/dispatch/UnitTrackingCard.tsx)).
- Dispatching only happens on **Dispatch**. **Fleet & Units → Responders** is a people list with availability filters, and it has no dispatch action by design.
- Each dispatch is its own `dispatches` row with its own crew (`dispatch_crew`). The schema already supports many dispatches per incident.

### Steps
**Backend (`dispatch.service.ts` `create`)**
1. Split the statuses: **first unit** = `ACKNOWLEDGED`, `ASSESSED`, `DISPATCH_PENDING` (current behavior); **additional unit** = `DISPATCHED`, `EN_ROUTE`, `ON_SCENE`, `ASSISTING`, `TRANSPORTING`. Anything else is still refused.
2. Inside the transaction, lock the incident row (`SELECT … FOR UPDATE`, as `responders.service.ts` does) and re-check its status, so a dispatch can't race a resolve.
3. For an additional unit: create the dispatch, crew and resource update as today, but **don't change the incident status**. Write an `incidentEvent` with `from_status = to_status` and the note "Additional unit {call sign} dispatched", the same pattern as "finished field work".
4. Audit: same `DISPATCH` row with `newValues.additionalUnit: true`.
5. Realtime: emit `incidentAssigned` and `dispatch.created` as today. Emit `incident.status_changed` only when the status actually changed. The crew push ([assignment-push.ts](../../backend/src/dispatch/assignment-push.ts)) and the agency participant step already run for every dispatch.
6. Tests in `backend/test/dispatch/`:
   - A second unit on an `ON_SCENE` incident leaves it `ON_SCENE`.
   - The same unit can't be sent twice (it's no longer `AVAILABLE`).
   - A `RESOLVED` incident is refused.
   - Two units finishing: only the last one resolves (already covered on the responder side; add one end-to-end case).

**Web (`operations/dispatch/page.tsx`)**
7. Add `ADDITIONAL_DISPATCH` statuses next to `DISPATCHABLE`. When the incident has a dispatch and is in one of those statuses, show a **Dispatch another unit** button under the tracking card. It opens the existing `RecommendationPanel`, where available units are ranked and the dispatcher picks one.
8. Count units in the header (for example "2 units") so the supervisor can see it at a glance.

**Mobile**
9. No code change expected. Verify that the second crew's assignment screen works when the incident is already `ON_SCENE`, and that the citizen's Tracking map shows both units.

### Done when
- [ ] dispatcher1 dispatches ALPHA-1 to a Fire incident, then **Dispatch another unit** → CHARLIE-1 (BFP). Both crews get the assignment push.
- [ ] CHARLIE-1 goes En Route after ALPHA-1 is already On Scene: the incident stays `ON_SCENE`, and the timeline shows both units.
- [ ] ALPHA-1 finishes: the incident stays open. CHARLIE-1 finishes: the incident resolves.
- [ ] Both units appear on the citizen's Tracking map and the web Live Map.
- [ ] Two audit `DISPATCH` rows, the second marked as an additional unit.

### Phase 5 status (2026-11-02)

**Built.**
- **Backend** (`dispatch.service.ts` `create`, no new endpoint):
  - First unit = `ACKNOWLEDGED` / `ASSESSED` / `DISPATCH_PENDING`, as before. Additional unit = `ACTIVE_RESPONSE_INCIDENT_STATUSES` from `@agap/shared`, which is exactly `DISPATCHED`, `EN_ROUTE`, `ON_SCENE`, `TRANSPORTING`, `ASSISTING`.
  - The read before the transaction only produces the 400 message. Inside the transaction the incident row is locked (`SELECT … FOR UPDATE`), and the locked status decides the branch. A status that left both lists returns 409 `INCIDENT_STATUS_CHANGED`. A first dispatch that lost a race becomes an additional unit.
  - An additional unit creates the dispatch, crew and resource update as before, but makes no incident update (no status change, no `dispatched_at` overwrite). It writes a same-status `incidentEvent` with the note "Additional unit {call sign} dispatched".
  - Audit: `DISPATCH`, `MOD-31`, `newValues.additionalUnit: true`.
  - Realtime: `incidentAssigned`, `dispatch.created` and `resource.status_changed` as before; `incident.status_changed` only for the first unit. The crew push and `addAgencyParticipant` run for every unit.
- **Web** (`operations/dispatch/page.tsx`):
  - `ADDITIONAL_DISPATCH` (the same shared list) sits next to `DISPATCHABLE`.
  - A **Dispatch another unit** button under the tracking card opens the existing `RecommendationPanel`. Its `onDispatched` and **Cancel** close only that view, and the tracking card stays.
  - The header shows "{n} unit(s)" for active dispatches.
  - `useCreateDispatch` now also invalidates `dispatch-recommendations` for the incident.
- **Mobile:** no code change (findings below).

**Files.** Changed: `backend/src/dispatch/dispatch.service.ts`, `backend/test/dispatch/dispatch-agency.spec.ts` and `responder-assignment-push.spec.ts` (mock builders only), `backend/test/responders/multi-unit.spec.ts` (one test added), `frontend/app/(ops)/operations/dispatch/page.tsx`, `frontend/features/dispatch/hooks.ts`, `docs/module-reports/MODULE_TESTING_GUIDE.md`. Added: `backend/test/dispatch/additional-unit.spec.ts`.

**Duplication inventory.** `DispatchService.create`: existed, extended. Incident row lock and the same-status note pattern: existed in `responders.service.ts`, copied in style. Realtime calls, `statusNotifier`, `addAgencyParticipant` and the crew push: existed, reused. Status list: `ACTIVE_RESPONSE_INCIDENT_STATUSES` existed in `@agap/shared` and is used on both sides. Active dispatch statuses: `ACTIVE_DISPATCH_STATUSES` existed in `incidents/field-report-access.ts` (backend). `RecommendationPanel` and `UnitTrackingCard`: existed, reused unchanged. Two-units-finishing test: the responder side already had the pieces; one end-to-end sequence was added to `multi-unit.spec.ts` with its `createHarness`.

**Deviations and findings.**
- **Crew trap.** `RESPONDER_NOT_AVAILABLE` does **not** cover it: responder availability is only `AVAILABLE` / `OFF_DUTY` / `UNAVAILABLE`, and being crewed doesn't change it. For an additional unit, `create` now refuses with 409 `RESPONDER_ALREADY_ON_INCIDENT` when a chosen crew member is on an active (`PENDING` / `SENT` / `ACCEPTED`) dispatch of the same incident. A responder crewed on a *different* incident is still accepted, as before.
- **Reporter and contacts.** An additional unit also skips the emergency-contact SMS ("responders dispatched … help is on the way"), not only the reporter status notification, so the reporter's contacts are not texted a second time.
- **Recommendations cache.** `dispatch-recommendations` was cached for 60 s and not invalidated after a dispatch, so "Dispatch another unit" could still offer the unit just sent. It is now invalidated.
- **Existing mocks.** The `create` mock builders in two existing specs now answer the incident-lock `$queryRaw`. No assertion changed.
- **`responders.service.ts`.** Unchanged: the new sequence test passes against it.
- **Mobile, responder assignment.** The actions are per unit (`unitStep` with this dispatch's `en_route_at` / `on_scene_at` / `active_dispatch_count`; covered by `assignment-progress.test.ts`), so a second crew sees Mark En Route on an `ON_SCENE` incident. The status chip (`stage`) shows the incident status, so it reads "On Scene" while that crew is still driving. Cosmetic, not changed.
- **Mobile, citizen Tracking.** The map drew **one** unit: `useIncidentTracking` picked the most recently updated position and `LiveTrackingMap` took a single `responder`. Not changed in the phase itself, because the prompt expected no mobile change. Resolved in the follow-up below.
- **Noticed, not changed.** `create` checks the resource's `AVAILABLE` status before the transaction only, so two dispatchers sending the same unit at the same moment could both succeed. This predates this phase.

**Tests.** Backend: 94 suites / 1532 → 95 / 1550. The only failures, before and after, are the `auth-phase3` 5 s timeouts. Typecheck clean, e2e 1/1, boot check on port 3999 clean. Frontend: 11 / 155 → 11 / 155, typecheck and lint clean. Mobile: not changed.

**Open.** The five **Done when** walkthroughs need a person, the web console and two phones.

**Follow-up (2026-11-02): citizen map draws every unit.** The user chose "draw all units" for the open decision above.
- `mobile/src/lib/incident-tracking.ts`: `selectPrimaryUnit` (the existing "most recent position" pick, moved out of `useIncidentTracking`) and `otherSceneUnits(units, primaryDispatchId)`. The second one returns a marker (call sign or unit name, position, heading) for every other unit that has a position. Hospital-leg units (`TO_FACILITY` / `AT_FACILITY`) are left out: the transport view alone decides whether the reporter sees one (C17).
- `useIncidentTracking` uses `selectPrimaryUnit` and exposes `responderDispatchId`.
- `LiveTrackingMap` takes an optional `otherUnits`. It draws a smaller labelled marker for each, greyed with "· signal lost" when the position is stale, and **Fit route** includes them. The camera still follows one unit. The responder screens don't pass the prop, so they are unchanged.
- `app/tracking/[id].tsx` passes `otherSceneUnits(live.units, <the unit already drawn>)`. That unit is the transport unit on the hospital leg, otherwise `responderDispatchId`.
- Tests: 5 added to `mobile/src/lib/__tests__/incident-tracking.test.ts`. Mobile 15 suites / 182 tests, typecheck clean. The baseline wasn't run before the edit; 177 before is inferred from 182 minus the 5 added.
- Guide: MOD-31 step 8 added. The "one unit only" note is removed.

---

## Phase 6 — MOD-28 [29]: Assign and verify unit capabilities

### What exists
- Schema: `resource_capabilities` (catalog, 13 seeded rows such as `FIREFIGHTING`, `WATER_RESCUE`, `PATIENT_TRANSPORT`) and `resource_capability_assignments` (`resource_id`, `capability_id`, `is_verified`, unique on the pair).
- Endpoints: `POST /v1/resources/:id/capabilities` and `DELETE /v1/resources/:id/capabilities/:capId`, for Org Admin (own organization) and System Admin ([resources.controller.ts:168-189](../../backend/src/resources/resources.controller.ts#L168-L189), [resources.service.ts:115-133](../../backend/src/resources/resources.service.ts#L115-L133)). Neither writes an audit row.
- A new assignment is saved with `is_verified = false`, and the recommender counts **only verified** capabilities ([resource-matching.service.ts:158-166](../../backend/src/dispatch/resource-matching/resource-matching.service.ts#L158-L166)). Even if a screen added a capability today, it would never affect "Capability match" because nothing can verify it.
- No endpoint lists the catalog, and no screen calls any capability endpoint.

### Steps
**Backend**
1. `GET /v1/resources/capabilities`: the catalog (id, name, category, description), for the roles that can read the registry. Declare it **before** `GET :id` in the controller.
2. `PATCH /v1/resources/:id/capabilities/:capId/verify` with body `{ verified: boolean }`, for **Supervisor and System Administrator**. That way the organization that claims a capability isn't the one that confirms it. Ask the team if they prefer another rule.
3. Audit add, remove and verify (`entityType: 'resource_capability'`, the unit and capability names in `newValues`).
4. Add a `capabilityId` UUID validation test, plus service tests: adding twice is refused, an Org Admin of another organization is refused, verify flips `is_verified`.

**Web (`components/resources/RegistryTab.tsx`)**
5. Add a **Capabilities** row action that opens a dialog listing the unit's capabilities as chips with a **Verified** / **Unverified** badge:
   - Org Admin (own organization) and System Admin: add a capability from the catalog, grouped by category; remove one.
   - Supervisor and System Admin: **Verify** / **Unverify** toggle.
6. In the registry table's capability chips, mark unverified ones (outline style plus the word "unverified"), so it's clear why the recommender ignores them.
7. On the Dispatch recommendation, keep counting only verified capabilities, and add "(n unverified not counted)" to the reason line when there are any.

### Done when
- [ ] orgadmin@mdrrmo adds `ROPE_RESCUE` to BRAVO-1: it shows as Unverified, and a Rescue incident's ranking doesn't change.
- [ ] supervisor verifies it: the same incident now shows a higher "Capability match" for BRAVO-1.
- [ ] orgadmin@mdrrmo can't edit CHARLIE-1's (BFP) capabilities; the server refuses it.
- [ ] Audit rows exist for add, verify and remove.
- [x] Remove the "Not implemented" note from guide MOD-28.

### Phase 6 status (2026-11-02)

**Built.** Verifier roles: Supervisor and System Administrator (the plan's default, confirmed by the user).
1. `GET /v1/resources/capabilities` (`listCapabilities`): the catalog (id, name, category, description), ordered by category then name. It has the same roles as `GET /resources` and is declared before `GET ':id'`.
2. `PATCH /v1/resources/:id/capabilities/:capId/verify`, body `VerifyCapabilityDto { verified: boolean }`, roles `SUPERVISOR` and `SYSTEM_ADMINISTRATOR`. Not org-scoped on purpose. An unassigned capability returns 404.
3. Audit rows (`entityType: 'resource_capability'`, `moduleId: 'MOD-29'` per K4, entity = the assignment id; the unit's call sign and the capability name are recorded):
   - add: `CREATE`;
   - remove: `DELETE` (old values);
   - verify: `UPDATE` (`is_verified` old → new).
4. Tests: see **Tests** below.
5. Web, `RegistryTab.tsx`: a shield row action opens the **Capabilities** dialog. It lists the unit's capabilities with a Verified / Unverified badge.
   - Org Admin (own organization) and System Admin: add from the catalog (a Select grouped by category), and remove with **X**.
   - Supervisor and System Admin: **Verify** / **Unverify**.
   - The actions column now also shows for the Supervisor, who gets the shield but not the edit pencil.
6. Unverified chips are outlined (amber, dashed) and labelled "· unverified". This applies in the registry table and on the Fleet board unit cards.
7. The matcher loads every assignment, scores only verified ones, and adds "(n unverified not counted)" to the capability part of the rationale. n counts only unverified capabilities that this category requires.

**Files.**
- Backend:
  - Changed: `resources.controller.ts`, `resources.service.ts`, `dto/add-capability.dto.ts` (`@IsUUID`), `dispatch/resource-matching/resource-matching.service.ts`, `test/organizations/resource-registry-organization.spec.ts` (include assertion extended, one test added), `test/dispatch/resource-matching.spec.ts` (4 tests added).
  - Added: `dto/verify-capability.dto.ts`, `test/organizations/resource-capabilities.spec.ts`.
- Web:
  - Changed: `components/resources/RegistryTab.tsx`, `features/resources/api.ts`, `features/resources/hooks.ts`, `app/(ops)/operations/fleet/page.tsx`.
  - Added: `features/resources/capabilities.ts`, `__tests__/resource-capabilities.spec.ts`.
- Guide: MOD-28 steps 3–8; MOD-28 row removed from §6 Gaps.

**Duplication inventory.**
- `addCapability` / `removeCapability`, their routes, `assertCanManageOrg`, `AddCapabilityDto` and `AuditService` / `AuditAction`: existed and were extended.
- Catalog endpoint, verify endpoint, verify DTO and the four web fetchers and hooks: missing, now added once each.
- `Resource.capabilities` was declared on the web (`string[]`) and rendered by the registry and fleet card. The backend never sent it (see below).
- Dialog, Select (with `SelectGroup` / `SelectLabel`) and Badge: existing, reused.

**Deviations and findings.**
- **`findAll` returned no capabilities.** The prompt says `findAll` already includes the assignments; it didn't, so the registry chips were always empty. `findAll` now includes them and maps them to `capabilities: [{ id, name, category, is_verified }]`. The existing `findAll` test's exact `include` assertion was extended for the new key, not weakened.
- **Remove of an unassigned capability** now returns 404 (it was a silent `deleteMany`), matching verify. Add of an unknown capability id returns 404 instead of a foreign-key error. Adding twice stays 400, as before.
- **Mutations invalidate** `resources`, `resource/:id`, `fleet` and `dispatch-recommendations`, so the chips and the ranking update without a reload.
- **Verify by an Org Administrator** is refused by the route's `@Roles`, so the test checks the role metadata (as `org-scope.spec.ts` does), not the service.
- **Lint.** `pnpm lint` (`next lint`) can't run in this repo: ESLint 9 is installed with an `.eslintrc.json`, and `eslint-config-next` 14 crashes on it (`context.getAncestors is not a function`). This is not caused by this phase. Lint was not run.
- **Boot check skipped.** Per the handoff, no second backend was started. The user's own `pnpm start:dev` must be restarted to load the new routes.

**Tests.**
- Backend: 95 suites / 1550 → 96 / 1569. The only failures, before and after, are the `auth-phase3` 5 s timeouts. Typecheck clean, e2e 1/1.
- Frontend: 11 / 155 → 12 / 159, typecheck clean.
- Mobile: see the Phase 5 follow-up.

**Open.** Done when items 1–4 need a person on the web console, after the backend restart.

---

## Phase 7 — Update the testing guide

After each phase, edit [../module-reports/MODULE_TESTING_GUIDE.md](../module-reports/MODULE_TESTING_GUIDE.md):
- Accounts table: add `orgadmin@bfp.bocaue.gov.ph` and `orgadmin@bocauehospital.gov.ph` (Phase 3).
- MOD-26: add a check that the Organizations page and the Add Resource dropdown list the organizations (Phase 1).
- MOD-28: replace "Not implemented" with the capability steps (Phase 6).
- MOD-30 / MOD-31: remove "two units on one incident" from Not implemented, and add the second-unit steps (Phase 5).
- MOD-32: add the reconnect, token-expiry and same-phone account-switch checks (Phase 4).
- MOD-34: use the seeded BFP Org Admin instead of "create it" (Phase 3).
- MOD-40: the full SLA steps (all three escalation levels, cancelled and acknowledged-in-time cases), as discussed on 2026-11-02.
- Add a note at the top: **keep `AgapDev2026!` when the change-password screen appears**, or write the new password in the team chat. Shared test accounts were locked out on 2026-11-02 after a tester changed a password.

### Phase 7 status (2026-11-02)

**Done** (guide only, no code).
- **MOD-40.** The steps are replaced with the full SLA test, checked against `sla-monitor.processor.ts` and `ops-alert.service.ts`:
  - setup values 30 / 60 / 60, with code defaults of 120 / 300 / 300;
  - L1 → L2 → L3 on an ignored incident;
  - acknowledged in time (no escalation, and no later check either: the next check is only scheduled after a breach);
  - acknowledged late but not dispatched (L2 still fires);
  - cancelled in time;
  - Acknowledge, then Resolve (Resolve is only offered under the Acknowledged filter);
  - a Dispatcher gets "Not available for your role".
- **Accounts note** under the password line:
  - keep `AgapDev2026!`, or post the new password in the team chat;
  - staff accounts lock after 5 wrong passwords, for 15 minutes, then 30 and 60 on repeats (`LOCKOUT_MINUTES`);
  - the admin can unlock early.
- **Check of the built phases.** Phases 1, 3, 4, 5 and 6 already had their guide edits. Stale lines found and fixed:
  - MOD-18 still listed "a second unit" as not implemented (Phase 5);
  - the role table still starred the BFP and hospital Org Admins as "not in the seed" (Phase 3);
  - the §6 Seed gap still said they were missing.

**Findings, not changed.**
- The Escalations page's own message says "Supervisor or System Administrator", but `role-access.ts` opens `/operations/escalations` to the Supervisor only. The System Administrator gets the generic "Not available for your role" page.
- The acknowledge check counts `RECEIVED` as met. Nothing sets `RECEIVED` today (new reports start `SUBMITTED`), so it has no effect yet.
