# Handoff: Hospital destination routing — Prompt 04 reviewed, Prompt 05 done (Phase 1 complete), three bug fixes

**Date:** 2026-10-26 (second session of the day)
**For:** the next agent continuing this work cold. **Nothing has been committed.** The user did not ask for a commit.
**Earlier handoffs (their facts still hold):** [`2026-10-25_hospital-destination-routing-prompts-00-03.md`](./2026-10-25_hospital-destination-routing-prompts-00-03.md), [`2026-10-26_hospital-destination-routing-prompt-04-done.md`](./2026-10-26_hospital-destination-routing-prompt-04-done.md)
**Work:** implementing [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md) (MOD-38/39/40/43) through the prompt pack [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md). Progress log: [`docs/HOSPITAL_ROUTING_PROGRESS.md`](../HOSPITAL_ROUTING_PROGRESS.md) (every section below is written up there in full).

---

## Where things stand

| Prompt | Status | Notes |
|---|---|---|
| 00–03 | DONE, reviewed | |
| 04 Transport correctness | DONE, **independently reviewed** this session: no errors, no duplication | Review section in the progress log |
| 05 Hospital registry UI | DONE by this session, **not independently reviewed** | Completes plan **Phase 1** |
| Post-05 fixes | DONE | Map console warnings; responder could not save a hospital (seed ids) |
| **06 Shared contracts + realtime emitters** | **NEXT** | Gate: Phase 1 done (met) |
| 07, 08, 08B, 09 | Not started | Phase 2, in that order |
| 10, 11 | Not started | Phase 3. 10 also needs the LGU DPO sign-off on the C17 rule (not obtained) |
| 12 | Not started | Phase 3, after Phase 2 |
| 13, 14 | Not started | Phase 4. Gate is only "Phase 1 done", so they could run early; the user chose to **keep the original order** |
| 15, 16, A1 | Not started | |

**Recommended next step:** an independent review of Prompt 05 and the two post-05 fixes (user's usual "verify it was accurately implemented: no errors, duplication or wrong executions"), then Prompt 06 in a fresh session.

**Still waiting on the user (manual checks this session could not do):**
1. Web, signed in as System Administrator: **click Joni Villanueva in the list first** (the page pre-selects the first hospital alphabetically, Bocaue General Hospital). It shows "Verified" `14.7967900, 120.9435800`; Set location with `120.94358` / `14.79679` → swap message and "Use suggested coordinates"; then Cancel. Map pin click/drag was never exercised in a browser.
2. Browser console after reload: the "Image … could not be loaded" and "style diff" warnings should be gone (one for an empty `" "` icon may remain).
3. Responder app (after backend restart + app reload): pick a hospital after "Transporting" → transport card and dispatcher drawer show it.

---

## How the user works

1. One prompt per fresh agent session; that agent appends a report to the progress log.
2. The user then asks for a review: check code, DB and tests directly, never just the summary. Fix what is wrong, and correct later prompts/plan when the code disagrees.
3. The user cares most about **no duplication** and **accurate `schema.prisma` / DB data**.
4. This session broke the pattern twice (the user pasted Prompt 05 here, and asked for bug fixes). Offer an independent review of anything a session implemented itself.
5. The user tests on real devices and pastes console logs; expect bug reports between prompts.

---

## What this session did

### 1. Independent review of Prompt 04 → correct
Checked code, booted the backend (DI for `RespondersModule → IncidentsModule` works; tests construct services by hand so only a boot proves it), full tests, duplication greps. Three follow-ups logged: open-transport check outside the transaction (Prompt 08), `patientId` not checked against the incident (Prompt 08), `incident.transporting` still leaks the destination to the incident room until Prompt 06 (C18).

### 2. Prompt 05 implemented (frontend)
- `frontend/features/hospitals/api.ts`, `hooks.ts`: coordinates/status on `Hospital`; `setHospitalLocation`, `verifyHospitalLocation`; `useHospitals({ includeUnreviewed })` (default unchanged for pickers; separate cache key `['hospitals','with-unreviewed']`).
- `frontend/features/hospitals/location.ts` (pure): badge map, coordinate parse/round/format, `readCoordinates`, `canReviewLocation`, `describeHospitalError`.
- `frontend/lib/api.ts`: `ApiError` gained optional `body` (the client used to drop `code`/`suggested`/`existingName`).
- `frontend/components/map/HospitalMarker.tsx`: **the only hospital marker** (Prompt 12 reuses it).
- `frontend/components/hospitals/HospitalLocationPicker.tsx` (inputs, SSR-safe) + `HospitalLocationMap.tsx` (MapLibre, `dynamic(..., { ssr: false })`).
- `frontend/app/(ops)/hospitals/page.tsx`: create dialog (address, province, location, Org Admin org choice + review notice), status badges, Set location, Verify/Reject, `LocationError` with "Use suggested coordinates".
- **Deviation:** Org Administrators could not open `/hospitals`; `frontend/lib/role-access.ts` route + sidebar now include them, and `docs/AGAP_Role_Rules_and_Dashboard_Content.md` §6 was updated to match.
- Tests: `frontend/__tests__/hospital-location.spec.ts` (23), `role-access.spec.ts` updated.

### 3. Fix: map console warnings
`frontend/components/map/missing-style-images.ts` → `resolveMissingStyleImages` (the `<Map ref>` callback). Used by `IncidentMapView` (inline copy removed), `RiskHeatmapView`, `HospitalLocationMap`. `HospitalLocationMap` got `styleDiffing={false}`. Now **Correction C20**.

### 4. Fix: responder could not select a hospital
- Root cause: request DTOs used `@IsUUID()`, which rejects the seed ids (`00000000-0000-0000-0002-…`, version digit 0). Every transport start on seeded data returned 400 (even "Decide later", via `dispatchId`). The DB had zero transport records. The service itself works (proved on the real DB in a rolled-back transaction).
- Fix: `backend/src/common/decorators/is-record-id.decorator.ts` → `IsRecordId()` = `IsUUID('loose')` (same rule as `ParseUUIDPipe`). **All 32** `@IsUUID()` in 19 backend DTO files switched; no bare `IsUUID` remains in `backend/src`. Now **Correction C19**: never add a bare `@IsUUID()`.
- Mobile: `DestinationPicker` shows the server's reason inside the sheet (`saveError` prop); before, the error was drawn on the card hidden behind the sheet.
- Test: `backend/test/incidents/record-id-validation.spec.ts` (8).

### 5. Not code bugs (answered)
- Mobile "No route named home/index" and "Unmatched route" on onboarding Skip: Metro on Windows dropped recently edited files from its file map. A fresh `expo export --clear` contained every route. Fix: stop Metro, `cd mobile && npx expo start -c`. (Saved in agent memory too.)
- "WELLDONE Wallet is not initialized": a browser extension. 401 on `/v1/auth/refresh` before sign-in: normal.
- Reanimated "Reduced motion": the device setting; AGAP respects it on purpose.

### 6. User question answered: automatic hospital location
Planned as Prompts 13 (Nominatim search + scoring + OpenAI name clean-up; the AI never produces coordinates, plan §9.2) and 14 ("Find location" button, one confirm click stays). The user chose to keep the original order (06 next).

---

## What to check when reviewing Prompt 05 and the fixes

- `HospitalMarker.tsx` exists once; `grep -rn "setMissingStyleImageResolver" frontend` → only `missing-style-images.ts`.
- `grep -rn "IsUUID" backend/src` → only the decorator file. `grep -rc "@IsRecordId()" backend/src` sums to 32.
- `useHospitals()` callers other than the hospitals page (`IncidentDetailDrawer` ×2, `AdminDashboard`) still get reviewed-only hospitals.
- Role checks on the page mirror the backend: create = System Admin, or Org Admin of a HOSPITAL org; Set location = System Admin, Supervisor, Org Admin for own org; Verify/Reject = Supervisor, System Admin.
- No edits to `bocaue.geojson`, `frontend/lib/bocaue-geo.ts`, `shared/src/maps/bocaue-boundary.ts`.

## What to check when reviewing Prompt 06 (from the previous handoff, still valid)

- C18 exactly: incident-room copies of `incident.transporting` / `incident.facility_arrival` are status-only; `transportUpdated(payload, userIds)` never calls `emitToIncident`; `routeUpdated(payload, { incidentRoom, userIds })`.
- No duplicate destination field (old `destinationName` vs new `destination.name`).
- After any `shared/` change: `pnpm --filter @agap/shared build`, then mobile `pnpm typecheck` and frontend `npx tsc --noEmit --incremental false`.

---

## Baseline failures (pre-existing; do not "fix" as part of this work)

- Backend: `barangay-notify.spec.ts` › FALSE_ALERT (`tx.false_alerts` undefined).
- Backend: `auth-phase2/3` — `BackupCodesService` ×3 and `MfaService` login decision ×1 now **time out even alone** (5 s default; hashing-heavy). Proved unrelated by restoring the old auth DTOs: same 4 failures. Last full run: 62 suites, 906 tests, 899 passed, 7 failed.
- Backend lint: 1 error `incidents.service.ts:91` unused `actorRole`; 284 warnings.
- Frontend: `pnpm typecheck` TS5033 sometimes (use `npx tsc --noEmit --incremental false`); **`pnpm lint` cannot run at all** (`next lint` options rejected; ESLint 9 crashes in the v14 Next and react-hooks plugins).
- Mobile lint: 7 errors, all pre-existing (one is the unused `TransportRecord` import at `app/responder/assignment/[id].tsx:37`).
- Root `tests/` runner: second `@nestjs/common` copy breaks `instanceof` (15 failures). Not in CI.

The working tree had ~268 uncommitted files before this work started. Do not attribute them to it.

---

## How to verify quickly (patterns that worked)

- **Real code against the local DB:** scratchpad `.ts` that `require`s `process.cwd() + '/src/...'`, run from `backend/` with
  `npx ts-node -r dotenv/config -T -O '{"module":"commonjs","experimentalDecorators":true,"emitDecoratorMetadata":true}' <script>`.
  `-r dotenv/config` is needed or Prisma fails with "client password must be a string"; the decorator flags are needed when the script loads DTOs.
- **Roll back writes:** run inside `prisma.$transaction(async (tx) => { …; throw ROLLBACK })`. To run a service that opens its own transaction, pass it a `Proxy` of `tx` whose `$transaction` is `(fn) => fn(tx)`.
- **Audit logs are immutable** (no delete), so never let a probe commit an audit row.
- **Boot check for DI:** `cd backend && timeout 150 npx nest start` and look for "Nest application successfully started".
- **Frontend page compile without signing in:** `npx next dev -p 3100`, then `curl -H "Cookie: agap_refresh=dummy" http://localhost:3100/<page>` (middleware only checks the cookie exists).
- **Mobile route check without the user's Metro:** `npx expo export --platform android --clear --no-minify --output-dir <scratchpad>`, then `grep -a "./<route>.tsx"` in the `.hbc`.
- Do not sign in as the seeded admin: `admin@agap.local` already changed its password (the `.env` value is stale); the seeded Supervisor still has a forced password change.
- `incidentEvent` orders by `occurred_at`; `auditLog` has no `created_at` field in Prisma (check the schema before querying it).
- Bash gotcha: never leave a stray `python3 - <<'EOF'` in a command; it hangs until the 2-minute timeout.

---

## Open items / decisions pending with the user

- Independent review of Prompt 05 + post-05 fixes.
- The three manual checks listed at the top.
- LGU Data Protection Officer sign-off on the C17 reporter rule (gates Prompt 10).
- Follow-ups in the progress log, including: receiving-status badge values on the hospitals page are wrong (all grey; Prompt 10/12), `GET /facilities` returns Decimal strings, frontend lint toolchain, auth test timeouts, C15 `recordTransition` candidates, `incident_locations.point` NULL (Prompt A1).
