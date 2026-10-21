# AGAP — Live Responder Tracking & Map Identity Plan

**Status:** In progress — WP1–WP6 implemented; WP7 automated checks passed 2026-10-18 (manual multi-device E2E pending) · **Date:** 2026-10-18

> **WP7 notes.** Typechecks passed for shared, backend, frontend, mobile, the cross-package test project, and the dedicated mobile integration-test project. Jest passed: backend 22 suites/196 tests, frontend 3/50, mobile 2/8, cross-package 8/102, and the dedicated mobile integration suite 4/42 (including map-icon prompt visibility, dismissal persistence, profile saving and the `PREFER_NOT_TO_SAY` no-reprompt rule). Cross-package verification exposed a category restriction that blocked guest/citizen medical and rescue reports; removed it to preserve guest access and all in-scope incident categories, and updated its regression tests. Also repaired stale Prisma/test-module fixtures and registration-test mocks. Local API smoke checks returned 200 from `/v1/health` and `/v1/locations/map-config`; the protected latest-tracking endpoint returned the expected 401 without authentication. Direct Nest routes use `/v1`, so `/api/v1/health` is not a valid local path. `backend test:e2e` could not run because `backend/test/jest-e2e.json` is missing and no automated E2E specs are present. The real multi-phone GPS/route/signal-loss flow and device presentation remain unverified.

> **WP6 notes.** Mobile tracking now seeds from `GET /locations/tracking/:incidentId/latest` and re-seeds on every Socket.IO connect/reconnect before continuing to patch the incident cache from location and ETA events. The selected unit on the single-marker citizen/transmission map is the accepted dispatch with the freshest available position; its call sign and ETA stay paired with that position. The map uses the WP4 mobile assets and shared `isWestbound`, `priorityRingColor` and `isSignalLost` helpers, including an image-load fallback, heading chevron and a five-second signal-loss refresh. The citizen tracking screen shows the unit call sign, ETA estimate, last-seen seconds, accepted-before-first-fix text and an explicit signal-loss/hotline warning; it uses the shared tokens and `AgapLogo`. Responder assignment/map views pass only the staff-authorized `reporter_sex` field. Focused tests pass for socket merge, seeded metadata retention, first-seen units, legacy events and stale event rejection. Device/browser presentation and the manual multi-phone emergency-flow test remain unverified.

> **WP5 notes.** Found and fixed a gap not listed in §2: **accepting/declining an assignment emitted no event**, so the dashboard could not leave "Awaiting crew acceptance" until it polled. `RespondersService.accept/declineAssignment` now emit `dispatch.updated` (`DispatchUpdatedPayload` in shared) to ops + the incident room. Crew names come from the staff-only `GET /dispatch?incidentId=` (now includes `dispatch_crew.users.full_name`); they are deliberately **not** added to `GET /dispatch/:id`, which is not role-restricted. The per-unit ETA cache is `['incident-units', incidentId]` seeded from `GET /locations/tracking/:id/latest` (per-dispatch, correct with two units) instead of `/eta` (first dispatch only); `responder.eta_updated` patches it. The ops-feed cache is keyed **per dispatch** (crew phones collapse), and an unknown unit triggers a 2 s debounced re-seed. The alternate `POST /responders/location` path now sends the same `dispatchId`/`callSign` contract. Non-ambulance units (boat, fire truck) use the ambulance icon with their type in the label. Deleted `frontend/components/dispatch/IncidentMap.tsx` (G9). DB at implementation time: 5 units, all with call signs; 1 `SENT` dispatch; 0 `location_history` rows; every `users.sex` NULL — so live data currently exercises the "Awaiting crew acceptance" and neutral-pin paths. Frontend ESLint cannot run (`@next/eslint-plugin-next@14` crashes on ESLint 9 — pre-existing).

> **WP4 notes.** Icons are **trimmed to the artwork** before downscaling (the citizen figures used only ~55 % of their 618 px canvas, which would leave a tiny figure in a 36–40 px marker). Mobile variants live in a new `mobile/assets/map-icons/` (`ambulance`, `citizen-male`, `citizen-female` at 48/96/144 px as `@1x/@2x/@3x`) instead of beside the 512/618 px originals, which stay untouched as sources. Web copies: `frontend/public/map-icons/*.png` (128 px). Selection rules are in `shared/src/maps/map-icons.ts` (`citizenIconKind`, `isWestbound`, `priorityRingColor`, `isSignalLost` / `RESPONDER_SIGNAL_LOST_MS`); platform helpers are `frontend/lib/map-icons.ts` and `mobile/src/lib/map-icons.ts` (`citizenIconFor`). Mobile jest is now configured (`jest-expo` preset, `.ts` before `.js`) with `@types/jest`. Legibility (open question 1): Female differs from Male only by hair shape — the hair is the same yellow as the face — so keep the "Reporter: Male/Female" popup text.

> **WP3 notes.** Participant rule lives in `backend/src/realtime/incident-participant.service.ts` (global `RealtimeModule`), used by the WS room join, `GET /locations/tracking/:incidentId/latest`, and `GET /incidents/:id`. Ops feed and `/latest` collapse crew phones to **one entry per dispatch** (open question 3 resolved: yes). Active set is the shared `ACTIVE_RESPONSE_INCIDENT_STATUSES` (DISPATCHED…ASSISTING). ETA jobs use BullMQ `deduplication { id: eta-<dispatchId>, ttl: 15 s }` (BullMQ forbids `:` in ids); the processor routes from the freshest crew fix and skips inactive dispatches. `/latest` also returns `unitName` (vehicle name, not personal data). `GET /incidents/:id` is also used by the citizen app, so `reporter_sex` is added there **only** for staff/crew callers. **Pre-existing gap, not fixed here:** that route has no ownership check, so any logged-in user can read any incident.

> **Change to WP2 (2026-10-18):** the picker is **not on registration**. It lives on the citizen **Medical Profile** screen (all states, including before medical consent) and on the **Profile** tab (with the one-time prompt), via `mobile/src/components/profile/map-icon-card.tsx`. Storage is still `users.sex` via `PATCH /users/me`, **not** `medical_profiles`: it is personal data for the reporter map icon, so it must not be gated by medical consent or treated as patient data. `POST /auth/register` still accepts optional `sex` for API compatibility, but the app no longer sends it.
>
> **WP1/WP2 notes.** `agap_database.sql` was **not** updated: it already lags four migrations behind (`20261013…` onward), so it is not the maintained bootstrap. The profile-change audit entry (MOD-46) records `changedFields: ['sex']` only, not the value, because audit rows are permanent. Backend jest now resolves `.ts` before `.js` (`test/jest.config.ts`) because stale compiled `.js` twins in `shared/src` were hiding new shared exports.
**Modules:** MOD-01 (registration/profile), MOD-13 (live tracking), MOD-20 (WebSocket), MOD-21/22 (dispatch dashboard + map), MOD-32 (responder app), MOD-42/43 (citizen status + ETA)

---

## 1. Goals

1. **Citizen** sees, live, where the assigned responder is and an **estimated** arrival time from the moment the crew accepts until they arrive.
2. **Dispatcher** sees the citizen's scene (already working) **and** the assigned responder moving toward it once the crew accepts. That includes the route, the ETA and how fresh the last position is.
3. **Responder positions** are drawn with the ambulance icon (`mobile/assets/responders-map-icons/ambulance.png`) on every map: the dispatch dashboard, the ops map, the responder app and the citizen app.
4. **Citizen positions** are drawn with `Male.png` / `Female.png` (`mobile/assets/male-female-citizen-icons/`) when the registered reporter has chosen to share their sex. Everyone else keeps the neutral pin.
5. **Registration** gets an **optional** three-option radio field: **Male / Female / Prefer not to say**.

Out of scope: ambulances that move without a crew member's phone (vehicle telematics), and hospital-leg tracking (MOD-40).

---

## 2. Current state (verified in code)

### Already working
| Piece | Where | Notes |
|---|---|---|
| Responder pushes GPS every ~5 s / 15 m once dispatch is `ACCEPTED` | `mobile/src/hooks/useResponderLocationShare.ts` | Single shared watcher; reports upload failures (fixed 2026-10-18). |
| `POST /v1/locations/track` persists to `location_history` and emits `responder.location_updated` | `backend/src/locations/locations.service.ts` `trackResponder()` | Crew-membership check added 2026-10-18. Bocaue geofence enforced. |
| Event fan-out to **both** `ops:all` and `incident:{id}` rooms | `backend/src/realtime/realtime.service.ts` `responderLocation()` | Envelope = `{ incidentId, responderId, lat, lng, heading, speed, updatedAt }`. |
| ETA job → `responder.eta_updated` to incident room + ops | `backend/src/jobs/processors/eta-refresh.processor.ts` → `notifyEtaUpdated()` | Enqueued on each location push. |
| Citizen joins incident room and receives location/ETA/status | `mobile/src/hooks/useIncidentTracking.ts`, `mobile/app/tracking/[id].tsx` | Room join is participant-validated in `agap.gateway.ts`. |
| Dispatcher map shows incidents + live responder dots | `frontend/app/(ops)/operations/dispatch/page.tsx` → `frontend/components/incidents/IncidentMapView.tsx` | Positions come from `GET /locations/responders` + socket patches in `frontend/providers/socket-provider.tsx`. |

### Gaps
| # | Gap | Evidence |
|---|---|---|
| G1 | **Citizen sees nothing until the next push.** No initial position on screen open, and `GET /locations/tracking/:incidentId` is restricted to DISPATCHER/SUPERVISOR/RESPONDER. | `locations.controller.ts` `@Roles(...)` on `tracking/:incidentId` |
| G2 | **Dispatcher can't tell which dot belongs to which incident.** The socket patch in `socket-provider.tsx` drops `incidentId` and never sets `incident_id`/`responder_name`, so responders first seen through the socket have `incident_id: undefined`. The popup lookup `r.incident_id === selectedInc.id` fails for them. | `socket-provider.tsx` lines ~185–200 |
| G3 | **The ops feed is "anyone who pinged in the last 4 h".** `getAllResponderPositions()` hard-codes `status: 'active'` and keeps showing units after their mission ends. It has no dispatch id, call sign or unit. | `locations.service.ts` `getAllResponderPositions()` |
| G4 | **No "track the assigned unit" view on the dispatch dashboard.** After dispatch, the panel only shows the static text "Unit dispatched — tracking live". There's no route line, live ETA, follow-camera or last-seen age. The ETA pill uses `distance × 2 min/km` from recommendations, not the routed ETA. | `dispatch/page.tsx` `DispatchDetail`, `etaMins()` |
| G5 | **Responder markers are plain dots.** Teal/green 12–14 px circles on web; a green `medkit`/arrow circle on mobile. | `IncidentMapView.tsx`, `live-tracking-map.tsx` |
| G6 | **There is no sex on the user.** `User` has no sex/gender column; only `incident_patients.sex` (free text, **patient** data) exists. | `backend/prisma/schema.prisma` `model User` |
| G7 | **Registration has no sex field.** | `backend/src/auth/dto/register.dto.ts`, `mobile/app/auth/registration.tsx` |
| G8 | **The ETA job may attach to the wrong dispatch.** `trackResponder` picks the first non-terminal dispatch of the incident, not the pushing crew's dispatch. With two units on one incident, ETAs can be cross-labelled. | `locations.service.ts` ETA enqueue block |
| G9 | `frontend/components/dispatch/IncidentMap.tsx` is dead code. Nothing imports it. | grep: only self-references |

---

## 3. Design rules for this work

These follow from CLAUDE.md and must hold in every work package.

- **The citizen icon represents the REPORTER, never the patient.** Reporter ≠ Patient. The icon sits at the incident location the reporter submitted. Tooltips and labels say "Reporter", never "Patient". Patient sex stays in `incident_patients.sex` and is not used for map icons.
- **Unknown is valid.** Guest reports, bystander reports, users who registered before this change, users who chose "Prefer not to say", and missing data all get the **neutral incident pin** (today's priority-coloured marker). A missing sex must never block registration, reporting or dispatch.
- **Sex is optional and never required.** It is collected only to choose a map icon and to help responders spot the reporter on arrival. Under the Data Privacy Act (RA 10173) collection must be proportionate to purpose, so the field is optional, includes an explicit opt-out, and the form explains why it's asked ("Used only for your icon on the responder's map").
- **Least privilege.** Sex is *Personal* data. Expose it only as a single derived field (`reporter_sex`) to staff and to crews assigned to that incident. Never send it in SMS payloads, never log it, and never show it to other citizens.
- **Rule 15:** responders and dispatchers see the reporter's icon, but citizens never see other citizens. Only the assigned responder's marker is ever shown to a citizen.
- **ETA is always labelled an estimate** (Rule 13). A failed ETA calculation shows "Calculating…" and never hides the map or blocks dispatch.
- **No silent failure.** Every map shows a "last updated Xs ago" age for the responder. After 60 s without an update, the marker greys out and shows a "signal lost" badge.
- **WebSocket distributes; PostgreSQL is the source of truth.** Every live view must be able to rebuild from REST (seed) and then patch from the socket.

---

## 4. Work packages

Recommended order: **WP1 → WP2 → WP3 → (WP4, WP5, WP6 in parallel) → WP7.**

### WP1 — Schema: reporter sex (G6)

**`backend/prisma/schema.prisma`**
```prisma
enum user_sex {
  MALE
  FEMALE
  PREFER_NOT_TO_SAY
}

model User {
  // ...
  sex  user_sex?   // null = never asked (legacy, guests, admin-created); PREFER_NOT_TO_SAY = asked and declined
  // ...
  @@map("users")
}
```

**Migration** `backend/prisma/migrations/20261018120000_add_user_sex/migration.sql`
```sql
CREATE TYPE "user_sex" AS ENUM ('MALE', 'FEMALE', 'PREFER_NOT_TO_SAY');
ALTER TABLE "users" ADD COLUMN "sex" "user_sex";
COMMENT ON COLUMN "users"."sex" IS 'Optional, self-declared. Personal data — used only for reporter map icon. Not patient data.';
```
- The column is nullable with no default, so no backfill is needed. Existing users show the neutral icon until they set it in Profile.
- `PREFER_NOT_TO_SAY` is stored explicitly (not as null) so the app can tell "declined" apart from "never asked". Users who declined are never prompted again.
- Also update `backend/prisma/agap_database.sql` if that file is still maintained as the bootstrap script.
- **Shared:** add `export enum UserSex { MALE = 'MALE', FEMALE = 'FEMALE', PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY' }` to `shared/src/enums/` and export it from the index.

### WP2 — Registration & profile: optional Male / Female / Prefer not to say (G7)

**Backend**
- `backend/src/auth/dto/register.dto.ts`: add
  ```ts
  @ApiPropertyOptional({ enum: UserSex })
  @IsOptional()
  @IsEnum(UserSex)
  sex?: UserSex;
  ```
  It's **optional** on the API and in the form. Older app builds without the field still register.
- `backend/src/auth/auth.service.ts` `register()`: persist `sex: dto.sex ?? null` in `prisma.user.create`. The guest path (`reporterName` branch) leaves it null.
- Add `sex` to the safe-user select so `/auth/me` and the login response return it. Profile update: `backend/src/users` DTO accepts `sex` (`IsOptional`, `IsEnum`).
- Audit: emit the existing profile-update audit entry when `sex` changes (MOD-46). Never log the value in application logs.

**Mobile**
- `mobile/app/auth/registration.tsx`:
  - State: `const [sex, setSex] = useState<'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY' | null>(null);`
  - Zod schema: `sex: z.enum(['MALE', 'FEMALE', 'PREFER_NOT_TO_SAY']).optional()`. Submit is **never** blocked by this field.
  - UI: place it directly under **Full name**, labelled "Sex (optional)". Show three radio cards (≥ 48 px touch target) in one row (Male · Female · Prefer not to say), using the existing `inputLabel` style. Each card shows a radio circle and the label. The selected card uses the primary green border and `primarySoft` background, matching the form's focused-input treatment. Tapping a selected card again clears it.
  - Helper text under the row: "Used only for your icon on the responder's map."
  - Accessibility: wrap them in `accessibilityRole="radiogroup"`. Each option gets `accessibilityRole="radio"` and `accessibilityState={{ checked }}`.
  - Send `sex` in the `register({...})` payload only when one is selected.
- `mobile/src/services/api/auth.api.ts`: add `sex?: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY'` to `RegisterDto` and `sex: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY' | null` to `SafeUser`.
- `mobile/src/i18n/translations.ts`: add `registration.sex`, `registration.male`, `registration.female`, `registration.preferNotToSay`, `registration.sexHelp` (en + fil: *Kasarian (opsyonal)*, *Lalaki*, *Babae*, *Ayaw kong sabihin*, *Gagamitin lamang para sa iyong icon sa mapa ng responder.*).
- `mobile/app/profile/index.tsx`: the same three cards so anyone can set or change it. Show a one-time, dismissible soft prompt ("Choose your map icon") only when `sex == null` (never asked). Never prompt users who chose `PREFER_NOT_TO_SAY`, and never make it a hard block.

### WP3 — Backend tracking API (G1, G2, G3, G8)

1. **Citizen-safe latest position (G1).** New endpoint:
   `GET /v1/locations/tracking/:incidentId/latest`, guarded by `JwtAuthGuard`.
   - Authorization: staff roles **or** reporter (`incident_reporters.user_id === user.id`) **or** a crew member on that incident. Mirror the participant check in `agap.gateway.ts` `handleJoinIncident` and extract it into a shared `IncidentParticipantService.assertParticipant()`, so the WebSocket and REST rules can't drift.
   - Response, one object per **active** dispatch on the incident (dispatch `ACCEPTED`, incident not terminal):
     ```ts
     {
       dispatchId: string; callSign: string | null; resourceType: string;
       position: { lat: number; lng: number; heading: number | null; speedKmh: number | null; updatedAt: string } | null;
       eta: { seconds: number | null; isEstimate: true; calculatedAt: string | null };
     }[]
     ```
   - Never return the responder's name or phone to a citizen. Return `callSign`/unit only.
2. **Ops feed scoped to active missions (G3).** Rewrite `getAllResponderPositions()`:
   - Source: latest `location_history` row per user **joined to** dispatches where the user is crew, dispatch is `ACCEPTED`, and the incident is in `DISPATCHED | EN_ROUTE | ON_SCENE | TRANSPORTING | ASSISTING`.
   - Return `{ responderId, responder_name, dispatchId, incident_id, resource_name, call_sign, lat, lng, heading, speed, incident_status, updated_at }`.
   - Drop the hard-coded `status: 'active'`.
   - Keep a 4 h lookback as a secondary bound.
3. **Richer socket payload (G2).** In `trackResponder()`, include `dispatchId` and `callSign` in `notifyResponderLocationUpdated(...)`. Extend `ResponderLocationUpdatedPayload` in `shared/src/events/` with optional `incidentId`, `dispatchId` and `callSign` (the envelope already carries `incidentId`). Make these additive, optional fields so older clients keep working.
4. **Correct ETA attribution (G8).** Use the crew check's dispatch (`crewed.id`, already queried) as the `dispatchId` for the `eta-refresh` job instead of a second `findFirst`. That removes a query and fixes cross-labelling.
5. **Throttle ETA jobs.** Enqueue with a BullMQ `jobId` of `eta:${dispatchId}` plus a ~15 s `delay`/dedupe. That way a 5 s GPS stream doesn't trigger a routing call on every fix. ETA failures stay swallowed: emit nothing and keep the last value.
6. **Expose reporter sex (least privilege).** Add a derived `reporter_sex: 'MALE' | 'FEMALE' | null` (from `incident_reporters → users.sex`; `PREFER_NOT_TO_SAY` is mapped to `null` so the declined value never leaves the server) to:
   - incident list/detail responses used by ops (`/v1/incidents`, `/v1/incidents/:id`);
   - responder assignment responses (`/v1/responders/me/assignments`, `/v1/responders/assignments/:id`), crew-only by construction.
   Guest reporters are always `null`. Do **not** add it to `GET /incidents/:id/status` (citizen-facing), because the citizen already has their own `sex` in the auth store.

### WP4 — Map icon assets

| Source | Web copy (`frontend/public/map-icons/`) | Mobile |
|---|---|---|
| `mobile/assets/responders-map-icons/ambulance.png` (512×512, side view facing **right**) | `ambulance.png`, downscaled to 128×128 | Add `ambulance@2x.png` / `@3x.png` (96 / 144 px) next to the original |
| `mobile/assets/male-female-citizen-icons/Male.png` (618×618) | `citizen-male.png`, 128×128 | `Male@2x/@3x` (96 / 144 px) |
| `.../Female.png` (618×618) | `citizen-female.png`, 128×128 | `Female@2x/@3x` |

- Downscaling matters because 600 px PNGs inside dozens of DOM/native markers hurt frame rate. That's already flagged in `docs/PERFORMANCE_ROOT_CAUSE_ANALYSIS.md`.
- **Ambulance orientation:** the artwork is a side view facing right. **Do not rotate it by heading**, because it would render upside-down when heading west. Instead:
  - flip horizontally (`scaleX(-1)`) when `heading` is between 180° and 360° (travelling west), so it faces its direction of travel;
  - show precise heading with a small separate chevron (rotated by `heading`) on the marker ring.
- **Citizen icons** have a white background. Render them inside a **circular mask** with a 3 px ring. The **ring colour = incident priority colour** (CRITICAL red, HIGH orange, MEDIUM amber, LOW green), so priority stays readable at a glance.
- Shared helper (one per platform) so all maps pick icons the same way:
  ```ts
  citizenIconFor(sex: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY' | null): IconSource | null
  // MALE / FEMALE → icon; PREFER_NOT_TO_SAY or null → null → render neutral pin
  ```

### WP5 — Dispatch dashboard: track the accepted unit (G2, G4, G5, G9)

Files: `frontend/components/incidents/IncidentMapView.tsx`, `frontend/app/(ops)/operations/dispatch/page.tsx`, `frontend/providers/socket-provider.tsx`, `frontend/features/map/{api,hooks}.ts`.

1. **Fix the socket patch (G2).** Map `payload.incidentId → incident_id` and copy `dispatchId`/`callSign` in `socket-provider.tsx`. When the socket reports a responder that isn't in the cache, invalidate `['live-responders']` (debounced) so the REST seed fills in name and unit.
2. **Ambulance markers (G5).** Replace the 12 px dots with a 36 px ambulance marker: west-flip plus heading chevron (WP4). Show the call-sign label under the marker from zoom 14 up. Grey it out with a "signal lost" badge when `updated_at` is more than 60 s old. Re-render staleness on a 5 s ticker, not on every socket event.
3. **Citizen markers.** In `MapIncident`, add `reporter_sex`. The marker becomes the Male/Female icon in a priority-coloured ring when `reporter_sex` is known, and today's priority dot otherwise. The popup always labels it as the **Reporter**, never the patient: "Reporter: Female (registered)", "Reporter (registered)" when not shared, or "Guest report".
4. **Assigned-unit tracking panel (G4).** In `DispatchDetail`, when `incident.dispatches` contains an `ACCEPTED` dispatch, replace the static "Unit dispatched — tracking live" with a `<UnitTrackingCard>`:
   - Call sign, unit type, crew names (staff-only).
   - Live ETA from `responder.eta_updated` (cache key `['incident-eta', incidentId]`, seeded from `GET /locations/tracking/:incidentId/eta`). It's labelled **"estimate"**. If none has arrived, show "Calculating…".
   - "Last update 12 s ago" age; a red state after 60 s.
   - **Follow unit** toggle: the map camera eases to the unit every update while on. A user pan turns it off. This mirrors the mobile follow mode.
   - **Fit scene + unit** button: `fitBounds` on both points.
   - Before acceptance (dispatch `PENDING`/`SENT`), show "Awaiting crew acceptance — tracking starts when the crew accepts."
5. **Route line.** For the selected incident's accepted unit, draw the routed line from the unit to the scene. Reuse `POST /v1/locations/route`. Key the request on positions rounded to 4 decimals and refetch every 20 s (same strategy as mobile `useRouteLine`). Render it as a GeoJSON `line` layer in AGAP green, 5 px, under the markers.
6. **ETA pill.** Once a unit is accepted, the centre-bottom pill shows the **routed live ETA** for the assigned unit. The `distance × 2` heuristic stays only for the *pre-dispatch* "nearest unit" hint and keeps its "est." label.
7. **Ops map page** (`/operations/map`) gets the same marker components for free through `IncidentMapView`.
8. **Delete** `frontend/components/dispatch/IncidentMap.tsx` (G9) once the above lands.

### WP6 — Mobile maps: ambulance + citizen icons, citizen seeding (G1, G5)

**`mobile/src/components/tracking/live-tracking-map.tsx`**
- New props: `responderIcon?: 'ambulance'` (default ambulance) and `citizenSex?: 'MALE' | 'FEMALE' | null`.
- Responder marker: `<Image source={ambulance}>` 40 px, west-flip plus heading chevron (WP4). The current green circle stays as the fallback if the image fails.
- Incident marker: Male/Female icon in a priority ring when `citizenSex` is known. Otherwise keep today's red `alert` pin.

**Citizen side**
- `mobile/src/hooks/useIncidentTracking.ts`: on mount, **seed** from `GET /locations/tracking/:incidentId/latest` (WP3.1) via React Query, then patch from the socket. On socket reconnect, re-seed so positions missed while offline are corrected.
- `mobile/app/tracking/[id].tsx`:
  - Pass `citizenSex={user?.sex}` (own profile, from `useAuthStore`) and the ambulance icon.
  - Bottom sheet: unit call sign, live ETA (with the "estimate" tag already present), and "Responder last seen Xs ago". Grey state after 60 s: "Responder signal lost — they are still assigned. Call 911 / MDRRMO if urgent."
  - Show the status line "Responder accepted — tracking will start shortly" between `DISPATCHED` and the first position.
- `mobile/app/emergency/transmission.tsx` already receives live positions (2026-10-18). Pass the same icon props.
- Restyle `tracking/[id].tsx` to the shared tokens (`src/theme/tokens.ts`) and the `AgapLogo` header for consistency with the responder screens.

**Responder side**
- `mobile/app/responder/assignment/[id].tsx` and `mobile/app/responder/map.tsx`: pass `citizenSex={assignment.incidents.reporter_sex}` (WP3.6) and the ambulance icon for the responder's own position.

### WP7 — Tests & verification

**Backend (jest, `--config ./test/jest.config.ts`)**
- `auth.register`: persists `MALE`, `FEMALE` and `PREFER_NOT_TO_SAY`; rejects an invalid value (`'OTHER'` → 400); accepts a missing value (stored as null).
- `GET /locations/tracking/:id/latest`: the reporter gets 200; another citizen gets 403; a crew member gets 200; the response never contains a responder name or phone for the citizen role.
- `getAllResponderPositions`: excludes responders whose dispatch is `COMPLETED`/`CANCELLED` or whose incident is terminal.
- `trackResponder`: the ETA job uses the pushing crew's dispatch id; it's deduped per dispatch.
- Incident/assignment serializers: `reporter_sex` is null for guest reports and for `PREFER_NOT_TO_SAY`.

**Frontend**
- `socket-provider`: a location event for an unseen responder sets `incident_id` and triggers a seed refetch.
- `UnitTrackingCard`: staleness turns red after 60 s (fake timers); ETA shows "Calculating…" when null.

**Mobile**
- Registration: submits without a `sex` property. Per the WP2 deviation above, sex selection is on the profile/medical-profile surfaces, not registration.
- Profile prompt shows when `sex == null` and never when `PREFER_NOT_TO_SAY`.
- `citizenIconFor(null)` and `citizenIconFor('PREFER_NOT_TO_SAY')` → neutral pin.
- Latest tracking seed is patched by socket locations without losing unit metadata/ETA; stale socket locations cannot replace newer seeded positions.

**Manual end-to-end** (two phones + ops browser, device GPS **inside Bocaue**):
1. Register a citizen choosing Female and report an incident. The dispatcher map shows the female icon in a priority ring.
2. The dispatcher dispatches a unit. The panel shows "Awaiting crew acceptance".
3. The responder accepts. Within about 5 s the ambulance appears on the dispatcher map, the responder map and the citizen tracking screen.
4. The responder taps **Mark En Route** and drives. The route line, ETA and "last update" all advance on all three surfaces, and the ambulance faces its direction of travel.
5. Kill the responder's data connection. After 60 s all three surfaces show "signal lost", and the incident is untouched.
6. Repeat as a **guest** reporter, and as a registered citizen who chose **Prefer not to say**. The neutral pin is shown and nothing breaks.
7. Run the emergency-flow E2E suite (CLAUDE.md requirement).

---

## 5. File change list

| Area | Files |
|---|---|
| Schema | `backend/prisma/schema.prisma`, `backend/prisma/migrations/20261018120000_add_user_sex/migration.sql`, `backend/prisma/agap_database.sql` |
| Shared | `shared/src/enums/user-sex.ts` (new), `shared/src/events/responder.events.ts` / payload types |
| Backend auth/users | `backend/src/auth/dto/register.dto.ts`, `backend/src/auth/auth.service.ts`, `backend/src/users/*` (profile DTO + select) |
| Backend tracking | `backend/src/locations/locations.controller.ts`, `locations.service.ts`, `backend/src/realtime/agap.gateway.ts` (extract participant check), new `IncidentParticipantService`, `backend/src/jobs/processors/eta-refresh.processor.ts` |
| Backend serializers | `backend/src/incidents/incidents.service.ts`, `backend/src/responders/responders.service.ts` (`reporter_sex`) |
| Frontend | `frontend/public/map-icons/*` (new), `frontend/components/incidents/IncidentMapView.tsx`, new `frontend/components/map/{AmbulanceMarker,CitizenMarker}.tsx`, new `frontend/components/dispatch/UnitTrackingCard.tsx`, `frontend/app/(ops)/operations/dispatch/page.tsx`, `frontend/providers/socket-provider.tsx`, `frontend/features/map/{api,hooks}.ts`; delete `frontend/components/dispatch/IncidentMap.tsx` |
| Mobile | `mobile/assets/**` (scaled variants), `mobile/app/auth/registration.tsx`, `mobile/app/profile/index.tsx`, `mobile/src/services/api/auth.api.ts`, `mobile/src/i18n/translations.ts`, `mobile/src/components/tracking/live-tracking-map.tsx`, new `mobile/src/lib/map-icons.ts`, `mobile/src/hooks/useIncidentTracking.ts`, `mobile/src/services/api/locations.api.ts`, `mobile/app/tracking/[id].tsx`, `mobile/app/emergency/transmission.tsx`, `mobile/app/responder/{map.tsx,assignment/[id].tsx}`, `mobile/src/lib/incident-tracking.ts` and its focused tests |

---

## 6. Acceptance criteria

- [ ] A citizen with an accepted dispatch sees the ambulance on the map **within 5 s of opening** the tracking screen, with no need to wait for a new GPS fix.
- [ ] The citizen sees an ETA labelled "estimate", the unit call sign, and a "last seen" age. Never the responder's name or phone.
- [ ] Within 5 s of a crew accepting, the dispatcher sees the assigned ambulance, a route line to the scene, a routed ETA and a "last update" age for the selected incident, and can follow the unit.
- [ ] The ops feed shows only responders on active missions. Finished missions disappear.
- [ ] Every responder marker on web and mobile uses the ambulance icon and faces its direction of travel.
- [ ] Registered reporters who chose Male or Female appear as that icon in a priority-coloured ring, labelled "Reporter". Guest, unknown and "Prefer not to say" reporters keep the neutral pin.
- [ ] Registration offers Male / Female / Prefer not to say, is optional, and never blocks submission. Old app builds can still register.
- [ ] A lost responder signal is visibly flagged on all three surfaces within 60 s and never alters the incident.
- [ ] New backend tests pass, and the emergency-flow E2E suite passes.

---

## 7. Open questions

1. **Male vs Female legibility.** At 36–40 px the two icons differ only by hairstyle. The plan adds "Reporter: Male/Female" to the popup to compensate. Confirm with dispatchers during testing.
2. ~~**Third option.**~~ **Resolved 2026-10-18:** the field is optional with three choices (Male / Female / Prefer not to say). See §3 and WP2.
3. **Multiple crew phones on one ambulance.** If two crew members share a unit, both phones push positions, so the plan would show two ambulances. Should the map collapse them to one marker per `dispatchId`, using the freshest fix? **Recommendation:** yes. Group by `dispatchId` in WP5/WP6.
4. **Retention.** `location_history` grows every 5 s per active crew phone. Is there a retention or downsampling policy for MOD-48? Track it separately; it doesn't block this plan.
