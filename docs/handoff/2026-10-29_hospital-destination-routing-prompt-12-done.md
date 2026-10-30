# Handoff: Hospital destination routing — Prompt 12 done (plan Phase 3 complete)

**Date:** 2026-10-29
**For:** the next agent, starting cold.
**First task:** ~~an independent review of Prompt 12~~ **DONE 2026-10-29** (progress log "Independent review of Prompt 12…"), and Prompt 13 DONE the same session. Continue from [`2026-10-29_…prompt-13-done.md`](./2026-10-29_hospital-destination-routing-prompt-13-done.md).
**Earlier handoffs (their facts still hold):** [`2026-10-29_…prompts-10-11-done.md`](./2026-10-29_hospital-destination-routing-prompts-10-11-done.md) and the ones it lists. Its "Environment" and "Real ids and test points" sections are still accurate; this file repeats only what changed.
**Work:** [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md) through the prompt pack [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md). Progress log: [`docs/HOSPITAL_ROUTING_PROGRESS.md`](../HOSPITAL_ROUTING_PROGRESS.md). Its last two sections are this session's write-ups (the review of the 2026-10-29 work, then Prompt 12). This file is the summary.

---

## Where things stand

| Prompt | Status | Notes |
|---|---|---|
| 00–11 (incl. 08B), DPO waiver + launch switch, incident read-access fix | DONE, reviewed | Reviewed 2026-10-29: all correct, one gap fixed (below) |
| Review fix: `GET /incidents/:id/transport` crew check | DONE 2026-10-29 | Any responder could read any incident's transports (patient names, hospital). Now staff or crew only; hospital users keep their own-facility scoping |
| 12 Dispatcher dashboard UI | DONE 2026-10-29, **not reviewed** | User confirmed in the browser: "The change hospital destination is working". Table E Dispatcher rows not recorded one by one |
| 13 Forward geocoding, scoring, AI name assist, resolve endpoint | **NEXT**, after the review, when the user pastes it | Phase 4 backend |
| 14–16, A1 | Not started | Original order kept |

**Git:** last commit `6a7635b` (Prompts 00–06). **Everything since is uncommitted.** The user commits on `main` only when they ask.
- **Not ours, do not touch or commit as ours:** `mobile/app/home/index.tsx`, `mobile/src/components/emergency/HoldToSOS.tsx`, `mobile/src/components/emergency/SOSAlert.tsx`, `mobile/assets/login-page-background.png` (the user's own changes), `frontend/tsconfig.tsbuildinfo` (build cache).
- Everything else in `git status` is from the hospital-routing work (Prompts 06 to 12, the reviews and the fixes), including the handoffs.

---

## How the user works

1. One prompt per session, then an independent review that checks code, DB and tests directly (never only the summary), fixes what is wrong, and corrects later prompts or the plan when the code disagrees.
2. They care most about **no duplication**, **accurate `schema.prisma` / DB data**, and solutions to **real problems that will not cause trouble at launch** (not theory). When you find a problem, **give the recommendation first and wait for a yes** before changing code.
3. §0 rule 1 is binding: do only what the prompt asks. Anything else goes to Follow-ups, or is asked first. This session, two out-of-prompt decisions were asked with AskUserQuestion before coding, and both were approved (see Prompt 12 below).
4. They test on real Android devices (development build, not Expo Go) and in the browser, and paste errors. Their terminal is **Git Bash**. They are not a privacy or legal specialist: explain terms plainly.
5. Commit only when asked.

---

## What was done this session

### 1. Review of the 2026-10-29 work (Prompt 09 fix, DPO switch, Prompts 10 and 11, read-access fix)
- All correct. Schema/DB clean: 22 migrations applied, `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → empty.
- **Gap fixed (approved):** `GET /incidents/:id/transport` checked only the role. `listTransports` in `incidents.controller.ts` now calls `requireParticipation(req, id, ['staff', 'crew'])` for every role except HOSPITAL_USER. A reporter is never allowed. +7 tests in `backend/test/incidents/incident-read-access.spec.ts` (30); a mutation check and a live probe were done.

### 2. Prompt 12 (dispatcher web console)
Full write-up and file list: the last section of the progress log. In short:
- **Approved before coding:**
  - Web maps widen to the Bulacan service area only while a destination, route or unit is outside Bocaue (as on mobile). Units inside the service area stay on the map (`isUnitOnMap`).
  - A "Units on mission" list on the ops map (the page had no list for "list rows show the leg").
- **Shared:** `ROUTE_LAST_KNOWN_AFTER_MS` / `isRouteLastKnown` (`shared/src/maps/map.types.ts`) and `FACILITY_SERVICE_AREA_BOUNDS` (`shared/src/maps/service-area.ts`) moved here from mobile. `mobile/src/lib/transport-target.ts` re-exports them under the same names.
- **Frontend:**
  - Pure rules in `features/map/live-tracking.ts`: `applyRouteUpdate`, `applyTransportUpdate`, `transportUpdateNotices`, `legChip`, `unitRoutePlan`, `destinationFacilities`, `isUnitOnMap`.
  - `features/map/hooks.ts`: 15 s polling while the socket is offline; new `useIncidentsUnits`.
  - Socket handlers for `responder.route_updated` and `incident.transport_updated` (toasts) in `providers/socket-provider.tsx`. `ToastProvider` now wraps `SocketProvider` in `providers.tsx`.
  - New `components/map/LegChip.tsx` (`LEG_COLORS`: scene green `#0D6053`, hospital purple `#7C3AED`, dashed).
  - `IncidentMapView` props: `facilities`, `routeStyle`, `routeLastKnown`, `routes`, `unitLegs`.
  - Dispatch page: server route first, `useRouteLine` only as a leg-aware fallback, chip on the ETA pill.
  - Ops map: routes, hospital toggle (5 min cache), units list.
  - Drawer TransportPanel: badge, estimate, warnings, destination history from `GET /audit/incidents/:id` via new `features/incidents/transport-history.ts`. ChangeTransportDialog shows receiving status and the API's FACILITY_AT_CAPACITY.
  - Receiving-status labels in one place: `features/hospitals/location.ts` (`receivingStatusBadge`, `isAtCapacity`); `components/command/CommandSections.tsx` uses it.
- **Backend (one field):** `is_active` added to the `GET /incidents/:id/transport` facility select (`transport.service.ts`), so the drawer warns about a deactivated destination after a reload.

### 3. Browser error after Prompt 12 (not a code bug)
`useIncidentsUnits is not a function` on the ops map. The source export and both `.next` bundles were correct; the browser tab was running a stale bundle (Windows dev-watcher lag, same as Metro). Fix: hard reload, or stop `pnpm dev`, delete `frontend/.next` and restart. Saved in memory. If the user reports it again, check the `.next` chunk for `harmony export */   useIncidentsUnits` first.

---

## What to check in the Prompt 12 review

- **Duplication:**
  - The 120 s rule and the service-area bounds are defined only in `@agap/shared` (mobile re-exports, web imports).
  - Leg colours only in `LegChip.tsx`; receiving-status labels only in `features/hospitals/location.ts`. `app/(ops)/hospitals/page.tsx` still has its own wrong `receivingVariant`: a recorded follow-up, not fixed.
  - "Selectable hospital" is not re-implemented on the web: ChangeTransportDialog relies on `GET /hospitals`. Confirm that `reviewVisibility` in `hospitals.service.ts` hides PENDING_REVIEW/REJECTED for DISPATCHER/SUPERVISOR.
- **Correctness:**
  - `transportUpdateNotices` reads the old name **before** the cache patch (socket-provider order).
  - `applyTransportUpdate` drops the route only for a different hospital, and never keeps `destination.id`.
  - `unitRoutePlan` never routes to the scene on the hospital leg, and draws nothing on AT_FACILITY.
  - The `useIncidentsUnits` `combine` is module-level (stable reference).
  - TransportPanel calls its hooks before the early `return null`.
- **Bounds:** `wideArea` in `IncidentMapView` only widens; switching back to `BOCAUE_BOUNDS` when the transport ends must not leave the camera stuck outside. Check in the browser.
- **Privacy:** the web console is ops-only (`ops:all`). No new data reaches a reporter. The audit read is DISPATCHER/SUPERVISOR/SYS_ADMIN (existing roles).
- **Breakage risks:**
  - The `ToastProvider` order change: the NotificationBell toasts still work.
  - The `UnitTrackingCard` and SupervisorDashboard still use `useIncidentUnits` / `useLiveResponders` with the new polling.
- **Unverified claims:** the Table E Dispatcher rows (below).

---

## Environment (changes since the last handoff)

- Everything in the previous handoff's Environment section still holds (Redis in WSL, Postgres native, boot check, probes, mutation pattern, heredoc limit).
- **Prisma 7 drift check:** `cd backend && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` (the old `--from-schema-datasource` / `--to-schema-datamodel` flags no longer exist).
- **Backend jest:** always pass `--config ./test/jest.config.ts`; without it every suite fails to parse.
- **Frontend lint cannot run** (pre-existing): `next lint` passes options ESLint 9 removed, and `@next/eslint-plugin-next` 14 / `eslint-plugin-react-hooks` crash on ESLint 9. To lint changed files with the project's TypeScript rules only, this session used a scratchpad script (ESLint with `--no-eslintrc`, the parser resolved from `eslint-config-next`, `--resolve-plugins-relative-to` that package, `ESLINT_USE_FLAT_CONFIG=false`). Rebuild it if needed; it is not in the repo.
- **Frontend dev server on Windows can serve a stale module** after edits: see section 3 above.

## Baselines after this session

**Backend:**
- `pnpm test` → 1098 tests. Pre-existing failures: `barangay-notify.spec.ts` › FALSE_ALERT; bcrypt-heavy `auth-phase2`/`auth-phase3` timeouts under full-suite load (0–4 per run; `auth-phase3` alone 59/59).
- `pnpm typecheck` passes. Lint: 1 error (`incidents.service.ts:91` unused `actorRole`), 284 warnings.

**Frontend:**
- `pnpm typecheck` passes.
- `pnpm test` → 5 suites, 115 passed (`live-tracking.spec.ts` 49).
- `pnpm lint` cannot run (above).

**Mobile:**
- `pnpm test` → 6 suites, 64 passed.
- `pnpm typecheck` passes.
- `pnpm lint` → 6 errors / 53 warnings, all pre-existing.

**Shared:** `pnpm --filter @agap/shared build` and `typecheck` pass. Rebuild after any `shared/` change.

## Open items / follow-ups (full list in the progress log)

- **Manual checks (plan Table E):**
  - **Dispatcher rows:**
    1. "To hospital" dashed route + marker vs a "To scene" unit.
    2. Destination change → marker, route and toast without reload, responder app too. The user reported this one working.
    3. Deactivate the hospital → warning on dispatcher and responder; transport continues.
  - Socket kill → 15 s polling, reconnect → re-seed.
  - Row 3 likely cannot pass yet: **no deactivation path calls `notifyFacilityChanged(…, 'deactivated')`** (open since Prompt 08). Without it no FACILITY_DEACTIVATED toast is sent; the drawer still shows the deactivated warning after its 20 s refetch, thanks to `is_active`.
  - Responder rows not recorded one by one; Citizen rows NOT RUN; the guest → "Sign in" re-check NOT RUN.
- **Remove `incident.updated { transportUpdated }`** from `TransportService.updateTransport`. It also fires on ETA-only PATCHes, which send no `transport_updated`; check that before removing.
- `app/(ops)/hospitals/page.tsx` `receivingVariant` uses statuses that do not exist (ACCEPTING/LIMITED/DIVERTING/FULL): every badge there is grey. It could use `receivingStatusBadge`.
- Frontend lint toolchain (upgrade the Next/React-hooks ESLint plugins or pin ESLint 8 for the frontend).
- `GET /locations/responders` has no leg; the ops map fetches `tracking/:id/latest` per incident with a unit on mission. Fine normally; in surge mode an ops-feed field would be cheaper.
- **Security:** POST/PATCH in `incidents.controller.ts` and the sibling controllers (locations, responders, hospitals, chat) were not audited for the object-level gap. A full access review is recommended; propose it, do not start it unasked. For that review: `GET :id/detail` returns event notes to the reporter, and a dispatcher's free-text note could name the hospital.
- **Still open from earlier** (unchanged): `transport_records` indexes; `GET tracking/:id/eta` not leg-aware; Org Admin `setLocation` can re-route open transports; `verifyLocation` / AT_CAPACITY do not notify open transports; `dto.patientId` not checked against the incident; the transport list cannot tell a guest report (C17 switch then 400); tracking-screen strings still English; MapLibre warnings (`source must have tiles`, `<Layer style>` deprecated).
- The LGU DPO sign-off on C17 is still required before production; until then keep `REPORTER_DESTINATION_SHARING_ENABLED` off.

## When the user pastes Prompt 13

- Gate: "Phase 1 DONE" (yes) and the Prompt 12 review above done.
- It is backend only: `GeocodingProvider.search` (Nominatim `/search`, 1 req/s limiter, 24 h Redis cache, fail open), `backend/src/hospitals/location-resolution/` (scoring, AI name assist with zod and a coordinate-dropping guard, resolver), `POST /hospitals/resolve-location` (@Throttle 10/min), `OPENAI_GEOCODE_ASSIST_MODEL`.
- Every request DTO id uses `@IsRecordId()` (C19). Tests use recorded fixtures under `backend/test/hospitals/fixtures/`, never live network. Only the one manual call makes a real Nominatim request.
- The OpenAI client pattern is in `backend/src/media/evidence-ai-review.service.ts` (disabled when the key is unset). Everything must work with `OPENAI_API_KEY` unset.
