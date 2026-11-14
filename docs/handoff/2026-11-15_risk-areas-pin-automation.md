# Handoff: Risk areas: pinpoint, automation, redesign (MOD-51)

**Date:** 2026-11-15
**For:** the next agent, starting cold. This is the current handoff; read it first.
**First task:** ask the user how the **browser check** went (section "Waiting on the user"). Don't start new work on your own.
**Earlier handoffs:**
- [`2026-11-14_analytics-ai-summary.md`](./2026-11-14_analytics-ai-summary.md): AI summary and the AI provider setting; committed.
- [`2026-11-14_citizen-sms-fallback.md`](./2026-11-14_citizen-sms-fallback.md): device checks still unreported.

Approved plan: `C:\Users\githu\.claude\plans\compressed-crafting-forest.md`.

---

## Why

The user's screenshot of Risk Intelligence → Risk areas showed a big empty gap and an inner scrollbar, with nothing in the tab. They asked to automate it, add a pinpoint location, and fix the UI/UX.

**User decisions (2026-11-15):**
- all four automation items: live stats and hints, flood areas per barangay, "Check now" with last-run status, a smart add form;
- **pin + radius** for the location.

## What was found and fixed

1. **Layout bug:**
   - Radix keeps an inactive tab panel mounted with `hidden`, and the Map panel's `flex flex-1` overrode it, so the empty Map panel kept half the height.
   - Fix: `data-[state=inactive]:hidden` in [`components/ui/tabs.tsx`](../../frontend/components/ui/tabs.tsx). It applies to every tab in the console.
2. **Automation couldn't show:**
   - The nightly check needed 4 or more same-type incidents within 150 m (demo data never meets that).
   - It had no on-demand run and no visible status.
   - Its cron had **no time zone** ("02:30" meant the server's time); it now uses `Asia/Manila`.
   - Floods were clustered as points, unlike the Risk Map; they're now proposed per barangay.
3. **No pinpoint:** new areas are a pin plus a radius (50–2000 m).

## Changes

**Database:**
- Migration `20261115120000_risk_area_pin`: `risk_areas.pin_latitude`, `pin_longitude`, `radius_meters`, with a CHECK (all or none, radius 50–2000).
- `area_boundary` is the circle (`ST_Buffer` on geography).
- **Applied to the local DB**; `migrate diff` is empty.

**Backend** (`backend/src/risk-intelligence/`):
- `risk-area-rules.ts` (pure):
  - `levelFromCount`: 0–2 Low, 3–5 Moderate, 6–9 High, 10 or more Critical;
  - `reviewHint`: RAISE or QUIET; never lowers a level;
  - `suggestAreaName`;
  - `nextNightlyRun`.
- `RiskIntelligenceService`:
  - **`findAreas`** adds `shape` (PIN/OUTLINE/BARANGAY/NONE), the drawn `boundary` (the barangay polygon when there's no own boundary), `pin`, `stats` (incidents of the area's type inside it: 90 d, the previous 90 d, the latest) and `hint`.
  - **`suggest`** gives, for a pin: the barangay, counts by type within the radius in 90 days, a suggested level and name. Counts only.
  - **`createArea`** needs a pin (`{ requirePin: false }` for an approved proposal); the barangay comes from the pin; row, circle and audit are in one transaction.
  - **`updateArea`**: moving the pin moves the barangay and redraws the circle. A pinned area ignores a typed barangay.
- `HotspotDiscoveryService`:
  - **`nightly()`**: `@Cron('30 2 * * *', { timeZone: 'Asia/Manila' })`.
  - **`discover(trigger, actorId)`**: DBSCAN without floods, plus a `flood_barangays` branch (`FLOOD_BARANGAY_MIN = 3`). It records `{ at, trigger, written, failed }` in `system_configurations` under `risk.hotspot_check.last_run`.
  - **`checkNow`** is audited `SYSTEM` / `hotspot_check`.
  - **`status`**.
  - **`listProposals`** adds the outline GeoJSON.
- **Routes**, all Supervisor only:
  - `GET areas/suggest`;
  - `GET proposals/status`;
  - `POST proposals/check` (throttled 2/min, 10/h).

**Web:**
- [`RiskAreasTab.tsx`](../../frontend/components/admin/RiskAreasTab.tsx), redesigned:
  - summary bar: counts, last and next check, Check now, Add;
  - cards on the left and a sticky map on the right (the map is above the list on a phone);
  - proposal cards: Approve, Dismiss, show on the map;
  - area cards: place line, live counts and trend, hint strip with a one-click action, Show on map, Edit, Remove;
  - filters: search, type, all/active/inactive;
  - an empty state that explains the automation;
  - add/edit dialog: pin map with radius circle, slider, name and level marked "Suggested" until edited, nearby incident counts.
- New:
  - [`RiskAreasMap.tsx`](../../frontend/components/risk/RiskAreasMap.tsx);
  - [`RiskAreaPinMap.tsx`](../../frontend/components/risk/RiskAreaPinMap.tsx), which refuses clicks outside Bocaue using shared `isCoordinateInBocaue`;
  - [`risk-colors.ts`](../../frontend/components/risk/risk-colors.ts);
  - [`features/risk/area-geo.ts`](../../frontend/features/risk/area-geo.ts): circle, radius and time labels, hint text, place line.
- `RiskMapView.tsx` draws the server's `boundary` directly.

## Verification (last run)

- `tsc --noEmit`: all four packages are clean.
- Backend full run: **135/135 suites, 2379 tests**. Frontend: 24 suites, 239 tests. Mobile: 21 suites, 266 tests.
- **Real SQL on the local PostGIS**, run through the real services in one transaction that was rolled back (script: scratchpad `risk-sql-check.ts`):
  - the pin lands in the right barangay, and the circle area is about πr²;
  - the CHECK refuses a partial pin and a 10 m radius;
  - after moving 7 demo incidents (rolled back): `findAreas` counted 4 road accidents in the circle and hinted LOW → MODERATE; `suggest` gave the same; discovery wrote a road-accident cluster **and a whole-barangay Lolomboy flood proposal**.
- **Not run:** the screens in a browser.

## Waiting on the user

**Browser check:** steps 2–6 in the [MOD-51 report](../module-reports/MOD-51_Emergency_Intelligence_and_Risk_Visualization.md) "Test before signing". Restart the backend first; the migration is already applied locally.

## Known gaps

1. **Live stats count only incidents with a stored `incident_locations.point`**, the same as hotspot discovery.
2. **The suggested level is a simple count rule.** It doesn't weigh severity (a single explosion vs. several minor falls).
3. **Pinned areas can't be redrawn as polygons** (the user chose pin + radius).
4. **"Check now" runs the whole 90-day scan** inside the request. It's fine at Bocaue's volume, and throttled.
5. The `flood_barangays` branch skips floods outside every barangay polygon (the Risk Map still shows them as points).
