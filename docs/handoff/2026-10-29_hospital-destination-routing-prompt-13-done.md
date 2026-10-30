# Handoff: Hospital destination routing — Prompt 12 reviewed, Prompt 13 done and reviewed

**Date:** 2026-10-29
**For:** the next agent, starting cold. This is the current handoff; read it first.
**First task:** wait for the user to paste **Prompt 14**. (Updated 2026-10-29: a later session verified Prompt 13 and the pending decision below is **resolved**; see the progress log's last section.)
**Earlier handoffs (their facts still hold):** [`2026-10-29_…prompt-12-done.md`](./2026-10-29_hospital-destination-routing-prompt-12-done.md) (Environment section, Prisma 7 drift command, frontend lint workaround) and [`2026-10-29_…prompts-10-11-done.md`](./2026-10-29_hospital-destination-routing-prompts-10-11-done.md) (Environment, real ids and test points).
**Work:** [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PLAN.md) via the prompt pack [`docs/HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md`](../HOSPITAL_DESTINATION_ROUTING_IMPLEMENTATION_PROMPTS.md). Progress log: [`docs/HOSPITAL_ROUTING_PROGRESS.md`](../HOSPITAL_ROUTING_PROGRESS.md). Its last three sections are this session's full write-ups: the Prompt 12 review, Prompt 13, and the Prompt 13 review.

---

## Where things stand

| Prompt | Status | Notes |
|---|---|---|
| 00–12 (incl. 08B), DPO waiver + launch switch, read-access fixes | DONE, reviewed | |
| Fix: registry receiving badges | DONE 2026-10-29 | `frontend/app/(ops)/hospitals/page.tsx` used non-existent statuses (every badge grey); now `receivingStatusBadge` |
| Prompt pack correction | DONE 2026-10-29 | **Prompt 14 now also adds hospital deactivation** (its steps 5–8). Nothing could set `facilities.is_active = false`, so Table E Dispatcher row 3 could never pass |
| 13 Forward geocoding, scoring, AI assist, `POST /hospitals/resolve-location` | DONE 2026-10-29, reviewed | Backend only, no schema/DB change. One gap pending the user's decision (below) |
| 14 Registry UI "Find location" + Org Admin flow + deactivation | **NEXT**, when the user pastes it | Now backend + web + mobile |
| 15–16, A1 | Not started | |

**Device checks:** guest → "Sign in" PASSED (user, on device, 2026-10-29). Still NOT RUN: Table E Citizen rows; Responder rows one by one; Dispatcher row 1 and the socket-kill row (row 2 reported working; row 3 needs Prompt 14).

**Git:** last commit `6a7635b`. **Everything since is uncommitted**; the user commits on `main` only when asked. Not ours: `mobile/app/home/index.tsx`, `mobile/src/components/emergency/HoldToSOS.tsx`, `mobile/src/components/emergency/SOSAlert.tsx`, `mobile/assets/login-page-background.png`, `frontend/tsconfig.tsbuildinfo`.

---

## Pending decision — RESOLVED 2026-10-29

**Resolved:** the user chose "fix now". Migration `20261029120000_facility_source_ref_unique` keys the index on `location_source_ref` alone, `assertNoDuplicate` matches the ref alone, with a 409 test; prompts C21. The user also chose to fold the triage page's private haversine into Prompt 14 (now in its step 2). Original text kept below for context.

**Duplicate hospitals by OSM ref.** The DB unique index `uq_facilities_location_source_ref` (raw SQL in migration `20261025120000_facility_coordinates`, not in `schema.prisma`) and `HospitalsService.assertNoDuplicate` key on **(location_source, location_source_ref)**. The seeded Joni Villanueva is `manual+osm-crosscheck` + `osm:way:1290448946`. Once Prompt 14 ships, a "Find location" pick of the same place sends `nominatim` + the same ref. With a differently spelled name, it would be saved as a **second facility for one real hospital** (two markers, split referrals). Not reachable today; the DB has no shared ref.

**Recommendation:** a migration replacing the index with `UNIQUE (location_source_ref) WHERE location_source_ref IS NOT NULL`; `assertNoDuplicate` matches on the ref alone; a test (same ref, other source → 409 DUPLICATE_FACILITY). `schema.prisma` unchanged; `migrate diff` must stay empty. Options to offer: fix now as a small approved change, fold it into Prompt 14 (edit the prompt pack), or record only.

## How the user works

1. One prompt per session, then an independent review that checks code, DB and tests directly, fixes what is wrong (after approval), and corrects later prompts or the plan when the code disagrees.
2. Cares most about **no duplication**, **accurate `schema.prisma` / DB data**, and **real problems that would hurt at launch** (not theory).
3. **Give the recommendation first and wait for a yes** before changing code. Out-of-prompt decisions go through AskUserQuestion.
4. Tests on real Android devices (development build) and in the browser. Terminal: **Git Bash**. Not a privacy/legal specialist: explain plainly.
5. Commit only when asked.

## What Prompt 13 added (details in the progress log)

- `backend/src/locations/maps/`:
  - `GeocodingProvider.search`, Nominatim `/search` with `RequestSpacer` (1 req/s; reverse geocoding only `note()`s and never waits).
  - `GeocodeCacheService` (Redis, 24 h, fails open); `MapsService.search`.
- `backend/src/hospitals/location-resolution/`:
  - `candidate-scoring.ts` (pure).
  - `hospital-name-assist.service.ts` (OpenAI optional, zod, coordinate-like output dropped).
  - `hospital-location-resolver.service.ts`.
- Endpoint `POST /v1/hospitals/resolve-location`: SYSTEM_ADMINISTRATOR / ORG_ADMINISTRATOR / SUPERVISOR, returns 200, throttled 10/min. The response type is `ResolveLocationResponse` in the resolver file; Prompt 14 consumes it.
- `shared/src/maps/distance.ts` `haversineMeters` (moved from `media.service.ts`). `OPENAI_GEOCODE_ASSIST_MODEL` (optional).
- Tests: `backend/test/hospitals/location-resolution.spec.ts` (22) and `backend/test/maps/geocode-search.spec.ts` (9). Fixture: `backend/test/hospitals/fixtures/nominatim-search-joni-villanueva.json` (one real recorded `/search`).
- Accepted deviations:
  - The throttle is per IP: the global guard runs before JWT.
  - Validation errors return 400, not the plan's 422.
  - Scores use the typed name, never the AI's.
  - The AI tie-break only reorders and never preselects.
  - The deterministic query is always searched.
  - At most 5 candidates are returned.

## Open follow-ups (full list in the progress log)

- Prompt 13:
  - A shared Nominatim limiter for multi-instance deployments.
  - Cache the AI normalization per input: the AI writes different queries each call, so repeat clicks miss the cache.
  - Four hand-built Redis clients could become one provider.
  - Per-user throttling.
  - The scoring thresholds are untuned.
  - A name that normalizes to empty.
  - `alreadyRegistered` can name a facility the caller cannot see (Prompt 14's link should handle a 404).
- Earlier, unchanged:
  - Remove `incident.updated { transportUpdated }`. It also fires on ETA-only PATCHes; check that first.
  - `transport_records` indexes.
  - `GET tracking/:id/eta` is not leg-aware.
  - Org Admin `setLocation` can re-route open transports.
  - `verifyLocation` / AT_CAPACITY do not notify open transports.
  - `dto.patientId` is not checked against the incident.
  - The transport list cannot tell a guest report (C17 switch, then 400).
  - The tracking-screen strings are still English.
  - MapLibre warnings.
  - The frontend lint toolchain cannot run.
  - Full object-level access review of POST/PATCH routes (propose it; do not start unasked).
- The LGU DPO sign-off on C17 is still required before production; keep `REPORTER_DESTINATION_SHARING_ENABLED` off.

## Baselines after this session

- **Backend:**
  - `pnpm test` → 1129 tests; baseline failure `barangay-notify` › FALSE_ALERT. Bcrypt `auth-phase2/3` may time out when other suites run at the same time; run the backend suite alone.
  - `pnpm typecheck` passes. Lint 1 error (`incidents.service.ts:91`) / 284 warnings.
  - DB: 23 migrations (22 + `20261029120000_facility_source_ref_unique`), `migrate diff` empty. `test/hospitals` 65 tests.
- **Frontend:** `pnpm typecheck` passes; `pnpm test` 5 suites / 115 passed; `pnpm lint` cannot run (pre-existing).
- **Mobile:** `pnpm typecheck` passes; `pnpm test` 6 suites / 64 passed; lint 6 errors / 53 warnings (pre-existing).
- **Shared:** `pnpm --filter @agap/shared build` / `typecheck` pass. Rebuild after any `shared/` change.

## Environment (additions; the rest is in the earlier handoffs)

- Redis runs in WSL Ubuntu (`wsl -d Ubuntu -- redis-cli ping` → PONG). Postgres is native on :5432.
- Backend jest: always `npx jest --config ./test/jest.config.ts <paths>`.
- Prisma 7 drift check: `cd backend && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`.
- Real-DI probe: a temporary `.ts` in `backend/` using `NestFactory.createApplicationContext(AppModule, { logger: ['error','warn'] })`, run with `npx ts-node --transpile-only`; delete it afterwards.
- Redis keys with JSON (the geocode cache): put the `redis-cli` loop in a script file, then `MSYS_NO_PATHCONV=1 wsl -d Ubuntu -- bash /mnt/c/…/script.sh`.
- `backend/.env` has `OPENAI_API_KEY` set: a manual resolve uses the real AI. Only the typed hospital name, address, municipality and province are sent.
- Nominatim policy: at most 1 request/s, no automated loops. Tests use the recorded fixture, never the network.
- The Edit/Write tools save CRLF; `core.autocrlf=true` normalizes it, so diffs stay clean.

## When the user pastes Prompt 14

- Gate: Prompts 05 and 13 DONE (yes), the Prompt 13 review done (yes), and the pending decision answered (yes, fixed).
- Read steps 1–4 ("Find location", Org Admin, Supervisor review) **and 5–8** (deactivation: `PATCH /hospitals/:id/active`, registry Deactivate/Reactivate with awan opt-in inactive listing for reviewers, the mobile responder banner for `FACILITY_DEACTIVATED`, tests).
- Files: `frontend/app/(ops)/hospitals/page.tsx`, `frontend/components/hospitals/HospitalLocationPicker.tsx`, `frontend/features/hospitals/{api,hooks,location}.ts`; for the deactivation part, `backend/src/hospitals/*`, `TransportService.notifyFacilityChanged`, `mobile/src/components/responder/transport-banners.tsx`, `mobile/src/services/api/transport.api.ts`.
- Reuse; do not duplicate: `receivingStatusBadge` / `locationStatusBadge` (web), `destination-rules.ts` (selectable rule), `HospitalMarker` and C20 for any web map.
- Verification: frontend, backend and mobile checks, plus Table E "Hospital registration" rows and Dispatcher row 3.
