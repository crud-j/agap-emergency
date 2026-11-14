# Handoff: Live Dispatch merge, dispatch race guard, Fleet unit status follows dispatch

**Date:** 2026-11-14
**For:** the next agent, starting cold. This is the current handoff; read it first.
**First task:** ask the user how the **browser and device checks** went (section "Waiting on the user") and whether they want to **commit** the fleet work (section "Git"). Then ask which item from "Next" to do. Don't start one on your own.
**Earlier handoff:** [`2026-11-13_gap-audit-medical-type-dispatch-recall-crew-medical.md`](./2026-11-13_gap-audit-medical-type-dispatch-recall-crew-medical.md). Its "How the user works", gap-audit list and open medical-access decision still hold.

---

## Where things stand

| Item | Status | Notes |
|---|---|---|
| Merge Live Map + Dispatch into **Live Dispatch** | DONE, **committed** in `9a319b2`, not checked in a browser | `/operations/map` redirects to `/operations/dispatch?tab=responding` |
| Supervisor role defaults on Live Dispatch | DONE, committed | Starts on the Responding tab, no new-incident pop-ups, no lock |
| Dispatch race guard (two people, one incident) | DONE, committed | 409 `INCIDENT_DISPATCH_CHANGED` |
| Fleet fix 1: one person, one unit | DONE, tested, **uncommitted** | 409 `RESPONDER_ON_ASSIGNMENT` |
| Fleet fix 2: unit status follows the crew | DONE, tested, **uncommitted** | Forward only, broadcast live |
| Fleet fix 3: status dropdown only manual statuses, locked on a dispatch | DONE, tested, **uncommitted** | 400 for mission statuses, 409 `UNIT_ON_MISSION` |
| Extra: unit row lock on new dispatch | DONE, tested, **uncommitted** | 409 `RESOURCE_NOT_AVAILABLE` |

## Git

- Last commit `9a319b2` (Live Dispatch merge, race guard, plus the earlier recall/replace, ICS history and crew-medical work).
- **Fleet work is uncommitted** (24 modified files, 5 new: `backend/src/dispatch/crew-assignment.ts`, `backend/src/dispatch/unit-status.ts`, `backend/test/resources/`, `frontend/__tests__/responder-readiness.spec.ts`, `frontend/features/responders/readiness.ts`, plus this handoff).
- The user commits on `main` only when asked. **They run Git Bash (MINGW64)**: give commit commands as `git commit -F - <<'EOF' … EOF`. A PowerShell here-string failed for them earlier (apostrophes broke it).
- `frontend/tsconfig.tsbuildinfo` was restored after typechecks; restore it again if a typecheck touches it.

## Waiting on the user

1. **Live Dispatch (browser):** Waiting/Responding tabs, stat tiles as filters, map layers control, dimmed routes of other incidents. Two-browser test: steps 6–7 in the [MOD-31 report](../module-reports/MOD-31_Dispatcher_Assignment_and_Dispatch_Authorization.md).
2. **Fleet board (browser + responder phone):** steps 1–5 in the [MOD-28 report](../module-reports/MOD-28_Response_Unit_Availability_and_Readiness.md) ("Test before signing").
3. The device and browser checks from the 2026-11-13 handoff were never reported back either.

## What this session changed

### Live Dispatch merge (MOD-21/22/31), committed
- [`frontend/app/(ops)/operations/dispatch/page.tsx`](../../frontend/app/(ops)/operations/dispatch/page.tsx): `LiveDispatchRoute` (Suspense) → `LiveDispatchPage`. Role defaults come from `initialPanelTab` / `showsNewIncidentAlerts` in [`features/dispatch/live-dispatch.ts`](../../frontend/features/dispatch/live-dispatch.ts).
- New: `components/dispatch/RespondingList.tsx`, `components/dispatch/MapLayersControl.tsx`, `__tests__/live-dispatch.spec.ts`. `IncidentMapView` got `MapRoute.dimmed`.
- Nav: "Live Dispatch" label, moved into the Supervisor's Oversight group (`lib/role-access.ts`); Topbar breadcrumb, Sidebar icon, dashboard links updated. `map/loading.tsx` deleted.

### Dispatch race guard (MOD-31), committed
- `CreateDispatchDto.expectedActiveUnits` (optional). In `DispatchService.create()`, under the incident lock, `assertNoUnseenDispatch` counts active units; more than the sender saw → 409 `INCIDENT_DISPATCH_CHANGED` naming the unit, its sender ("You" if the same user) and time. Clients that omit the field are not checked.
- Web: `RecommendationPanel` keeps a `seenActiveUnits` baseline and sends `seen + sent.length`; `DispatchDetail` shows "Someone else dispatched…".

### Fleet unit status (MOD-28/31/32), uncommitted
- **Shared** [`resource-status.enum.ts`](../../shared/src/enums/resource-status.enum.ts): `MISSION_RESOURCE_STATUSES` (DISPATCHED, EN_ROUTE, ON_SCENE, TRANSPORTING, RETURNING) and `MANUAL_RESOURCE_STATUSES` (AVAILABLE, OUT_OF_SERVICE, OFFLINE, RESERVED). `shared` was rebuilt.
- **One person, one unit:** [`crew-assignment.ts`](../../backend/src/dispatch/crew-assignment.ts) `assertCrewFree` refuses anyone on an active dispatch (PENDING/SENT/ACCEPTED) on any incident: `RESPONDER_ALREADY_ON_INCIDENT` (same incident) or `RESPONDER_ON_ASSIGNMENT` (other incident). Called from `insertDispatch` (create + reassign) and `addCrew`. Reassign cancels the old dispatch first, so the replaced unit's crew can move.
  - Why: responder availability is the person's own duty switch and stays AVAILABLE on a mission; there is no "busy" state.
  - `GET /responders` adds `active_assignment`. Web: [`features/responders/readiness.ts`](../../frontend/features/responders/readiness.ts) (`responderReadiness`, `isFreeForCrew`, `assignmentLabel`); Fleet board shows "On assignment" with its own filter; both crew pickers (dispatch form and `UnitChangePanel`) use `isFreeForCrew`.
- **Unit row lock:** `create()` re-reads the unit `FOR UPDATE` inside the transaction; not AVAILABLE → 409 `RESOURCE_NOT_AVAILABLE`. Before, the check ran before the lock, so two incidents could get the same unit.
- **Status follows the crew:** [`unit-status.ts`](../../backend/src/dispatch/unit-status.ts) `advanceMissionUnit`, forward only (DISPATCHED < EN_ROUTE < ON_SCENE < TRANSPORTING), only while `current_incident_id` is this incident. Called from `responders.service.ts` `applyStatus` (EN_ROUTE, ON_SCENE, ASSISTING → ON_SCENE) and `transport.service.ts` on a newly created transport. Broadcast `resource.status_changed` after commit.
- **Manual status:** `UpdateResourceStatusDto` accepts only `MANUAL_RESOURCE_STATUSES` (400 otherwise). `ResourcesService.updateStatus` locks the unit and refuses one with an active dispatch (409 `UNIT_ON_MISSION`, naming the incident); it clears `current_incident_id`, so a unit stuck in a mission status by old data can be set back to Available. `GET /resources` adds `active_dispatch`.
- **Web Fleet board** ([`fleet/page.tsx`](../../frontend/app/(ops)/operations/fleet/page.tsx)): dropdown lists the 4 manual statuses, is disabled with an "On INC-…" link while on a dispatch; a mission status shows as a disabled item. `socket-provider.tsx` patches `active_dispatch` on `resource.status_changed` and invalidates `['resources']` and `['responders']`.
- **Docs:** MOD-28 report (tasks, TO-BE steps, test steps 1–5, "Changed 2026-11-14"), MOD-31 report ("One person, one unit; one unit, one incident").

## Verification (last run)

- `tsc --noEmit`: shared, backend, frontend, mobile all clean.
- Backend full run (`npx jest --config ./test/jest.config.ts`): 121/123 suites. `transport-idempotency` was then fixed (missing unit mock) and passes (25). `auth-phase3` "asks enrolled users for a second step" is the known 5 s timeout under load and passes alone; these changes don't touch it. **No full rerun after the transport fix**; affected suites were rerun one at a time (dispatch, organizations, resources, responders, transport, oversight).
- Frontend `npx jest`: 21 suites, 218 tests.
- **Nothing was run in a browser or on a device.**

## Known gaps left (not fixed)

1. **RETURNING is never set.** It's in `MISSION_RESOURCE_STATUSES`, but no code moves a unit to it; when the crew finishes, the unit goes straight back to Available. Fine unless the user wants a "returning to base" step.
2. The socket patch sets a **placeholder** `active_dispatch` (no incident reference) until the `['resources']` refetch lands, so the "On INC-…" label can lag a moment.
3. From the 2026-11-13 handoff, still open: no Decline button in the responder app, no screen to change a dispatch's crew.

## Next (ask the user which)

The gap-audit list in the [2026-11-13 handoff](./2026-11-13_gap-audit-medical-type-dispatch-recall-crew-medical.md#next-from-the-gap-audit-ask-the-user-which) is still the backlog, in order: phone-side SMS fallback, announcement SMS ignoring barangay, dead code to wire or delete, same SLA timers for every priority, then lower-value items.
