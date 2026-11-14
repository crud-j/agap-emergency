# Handoff: easier risk-area pinning (MOD-51)

**Date:** 2026-11-15
**For:** the next agent, starting cold. **This is the current handoff; read it first.**
**First task:** ask the user how the **browser check** went (step 7 of the MOD-51 report, then steps 2–6). Don't start new work on your own.

**Earlier handoffs, still relevant:**
- [`2026-11-15_session-handoff.md`](./2026-11-15_session-handoff.md): the previous session. Its "Waiting on the user", "Decisions still open" and "Backlog" sections are **all still open**; nothing there was reported in this session.
- [`2026-11-15_risk-areas-pin-automation.md`](./2026-11-15_risk-areas-pin-automation.md): how risk areas, pins, hints and hotspot proposals work.

Approved plan for this session: `C:\Users\githu\.claude\plans\polished-wobbling-magpie.md`.

---

## Why

The user said placing a risk-area pin was a hassle. The only way to place it was to click the map, and the map opened zoomed out with no search, no barangay names, no incidents and no satellite view. They asked for a plan first, then the implementation, "accurately implemented, no errors, no duplication".

## Git

- **Committed by the user:** `b7dad2c` feat(risk): easier risk-area pinning: place search, barangay jump, incident dots, satellite (MOD-51).
- **The tree is clean.**
- **No migration;** `schema.prisma` is unchanged.

## What was built

**Pin form (Add / Edit risk area):**
1. **Find a place** ([`PinPlaceFinder.tsx`](../../frontend/components/risk/PinPlaceFinder.tsx)):
   - Typed text is searched on Enter or the Find button.
   - Coordinates or a map link are read in the browser (`parseLatLngText`) and placed with no request.
   - A result click pins the place and zooms to street level.
2. **Go to barangay:**
   - zooms to the barangay and outlines it, with no pin (a barangay is an area);
   - it is a "go to" menu (`value=""`), so the same barangay can be chosen again.
3. **Quick picks** (`quickPicks`):
   - for any type except Flood, the 3 busiest spots of that type, which pin on click;
   - for Flood, the 3 barangays with the most flood reports, which zoom on click.
4. **Pin map** ([`RiskAreaPinMap.tsx`](../../frontend/components/risk/RiskAreaPinMap.tsx)):
   - the selected type's incident dots; clicking one snaps the pin onto it;
   - flood shading per barangay when the type is Flood;
   - barangay lines and names;
   - zoom buttons, Expand (map about 60vh, one column);
   - a Streets / Satellite toggle;
   - a legend, shown only once the data has loaded (`dataReady`).
5. **Data:** everything above comes from the existing `GET /risk-intelligence/map` (90 days, the same cache key as the Risk Map). If it fails, the form says so and pinning still works.

**Backend:**
- `GET /api/v1/risk-intelligence/places?q=`:
  - Supervisor only, `@Throttle sustained 10/min` (the same as the hospital "Find location");
  - [`place-search.service.ts`](../../backend/src/risk-intelligence/place-search.service.ts) calls the shared `MapsService.search` (Nominatim: 1 request/s, 24 h Redis cache), bounded to the Bocaue box;
  - [`place-search.ts`](../../backend/src/risk-intelligence/place-search.ts) `tidyPlaceResults` keeps only points inside the Bocaue polygon, names blank results, removes duplicates and returns at most 6;
  - a provider error returns `{ results: [], unavailable: true }` instead of throwing;
  - it is a separate service, so `RiskIntelligenceService`'s constructor is unchanged; `MapsModule` is imported into `RiskIntelligenceModule`.
- **Satellite style:**
  - new env `MAP_SATELLITE_STYLE_URL` (validated, documented in `.env.example`);
  - shared `MapClientConfig.satelliteStyleUrl: string | null`; MapLibre returns it, Mapbox returns null;
  - mobile's fallback config in `mobile/app/emergency/location.tsx` got `satelliteStyleUrl: null`.

**Fix: viewport.**
- [`frontend/lib/bocaue-geo.ts`](../../frontend/lib/bocaue-geo.ts) `BOCAUE_BOUNDS` north is now **14.85** (was 14.835).
- The real boundary reaches 14.8445, so the northern tip of Bocaue (about 1 km) couldn't be shown or pinned on any web map before.
- This affects the Risk Map, the Risk areas map, the pin map and the incident map.

**Choices worth knowing:**
- **No search-as-you-type:** the public Nominatim policy forbids autocomplete.
- **Switching Streets / Satellite remounts the map** (`key` includes the mode) and keeps the last view through `onMoveEnd`. This is more predictable than relying on react-map-gl to re-add layers after `setStyle`.
- **When a pin and a zoom request arrive in the same render**, the zoom effect is declared after the "pin off-screen" effect, so its `flyTo` wins.

## The user's local config (non-secret)

- `backend/.env` now has `MAP_SATELLITE_STYLE_URL` set (a MapTiler hybrid URL). Never print its key.
- **The backend must be restarted** for the toggle to appear; whether that happened is unknown.

## Verification (last run, before the commit)

- `tsc --noEmit`: shared, backend, frontend and mobile are all clean. Shared was rebuilt (`pnpm build`) because the backend resolves `@agap/shared` from `dist`.
- Backend full run: **137/137 suites, 2396 tests**. New: `test/risk-intelligence/place-search.spec.ts`, `test/locations/map-client-config.spec.ts`.
- Frontend `npx jest`: **25 suites, 248 tests**. New: `__tests__/risk-place-input.spec.ts`.
- Mobile `npx jest`: 21 suites, 266 tests.
- **Live check:** a Nominatim search inside Bocaue returned the right places for "public market", "Bocaue river", "church", "Lolomboy" and "NLEX". The results also included the blank names, duplicates and Santa Maria entries that `tidyPlaceResults` now handles.
- **Not run:** anything in a browser. **Most at risk:** the Satellite toggle keeping dots, lines and the pin, and the Select placeholder behaving with `value=""`.

## Waiting on the user

1. **Browser check:** [MOD-51 report](../module-reports/MOD-51_Emergency_Intelligence_and_Risk_Visualization.md) "Test before signing", **step 7** (new), then steps 2–6 (still unreported). Restart the backend first.
2. **Everything in "Waiting on the user"** in [`2026-11-15_session-handoff.md`](./2026-11-15_session-handoff.md): AI summary second look, barangay-targeted announcement, citizen SOS by SMS on a device, and the older SLA, CSV, Live Dispatch, Fleet and device checks.

## Findings from this session (not fixed; ask before acting)

1. **Risk areas don't affect live operations.** The user asked what risk areas are for, and the code shows they appear only on the Risk Map page and the read-only admin list. Nothing else reads them:
   - not Live Dispatch;
   - not the responder app or its routes;
   - not surge mode;
   - not announcements.
   - Suggested next step, **not started**: show "Inside risk area: … (type, level)" on an incident in Live Dispatch.
2. **`flood_threshold_meters` is saved but never checked.** The surge detector compares one Bocaue River reading with the fixed 11.50 m and ignores each area's threshold.
3. **The northern cut-off still exists in two places:**
   - `mobile/src/config/bocaue-geo.ts` (north 14.835);
   - `backend/src/media/media.service.ts:58` (`BOCAUE_BOUNDS` north 14.835, used for photo-location checks).

## Decisions still open

- **New:**
  - Should risk areas feed Live Dispatch (finding 1), and should area thresholds raise alerts (finding 2)?
  - Fix the mobile and media bounds (finding 3)?
- **Carried over:** the five in [`2026-11-15_session-handoff.md`](./2026-11-15_session-handoff.md):
  - "Thank you." vs "Salamat";
  - dispatcher access to medical profiles;
  - who the System Administrator is;
  - AI summary follow-ups;
  - Gemini model ID.

## Backlog

- **Road hazards** (planned 2026-11-14; Supervisor-only writes): can reuse `PinPlaceFinder` and `GET /risk-intelligence/places` for placing a point. A road stretch would still need a new drawing tool.
- The rest is unchanged from the previous handoff (dead code, SMS gaps, SLA gaps, users' barangay never collected, and lower-value items).

## How the user works (still true)

- "/plan then implement": plan mode first, with the plan approved before any code. The user asked for exactly this again in this session.
- One item at a time. Read the real code first and report what's there, including flaws.
- Typecheck all four packages, avoid duplication, and check against `schema.prisma`.
- Plain explanations.
- Tests in the browser and on real Android devices.
- **Commits only when asked**, from Git Bash (`git commit -F - <<'EOF' … EOF`).
- `tsc` touches `frontend/tsconfig.tsbuildinfo`: restore it with `git checkout -- frontend/tsconfig.tsbuildinfo` rather than committing it.
