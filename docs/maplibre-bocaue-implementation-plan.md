# MapLibre Bocaue Scope — Implementation Plan

**Scope:** `mobile/` only. No changes to `backend/`, `frontend/`, or `shared/`.  
**Library:** `@maplibre/maplibre-react-native` v11.4.1 (already installed).  
**Target municipality:** Bocaue, Bulacan — 19 barangays.

---

## 1. Overview / Goal

All map surfaces in the mobile app (citizen GPS confirmation, live tracking, responder navigation) must be geographically locked to the Municipality of Bocaue. The camera must not pan, zoom, or fly outside the Bocaue bounding box. A barangay boundary overlay layer is optional but recommended for operational awareness.

This is strictly a mobile-side concern. The backend continues to serve `styleUrl` from its map-config endpoint; the bounds enforcement lives in the React Native components.

---

## 2. Prerequisites & Dependencies

| Item | Status |
|---|---|
| `@maplibre/maplibre-react-native` v11.4.1 | **Already in `mobile/package.json`** |
| Expo dev build (not Expo Go) | Required — MapLibre uses a native module |
| `isNativeMapAvailable()` guard | **Already implemented** in `mobile/src/components/tracking/native-map-available.ts` |
| Bocaue barangay GeoJSON | **Needs to be sourced / committed** (see §8) |

No new npm packages are required for bounds enforcement. GeoJSON sourcing requires a one-time asset download.

---

## 3. Bocaue Bounding Box

```
[west,  south, east,   north]
[120.902808, 14.784868, 121.003431, 14.912304]
```

Center (approximate centroid):

```
lng: 120.953120
lat: 14.848586
```

Default zoom for the whole municipality: **12**.  
Default zoom when centering on a specific incident or user: **15**.

---

## 4. Folder Structure Changes (mobile/ only)

```
mobile/
└── src/
    ├── config/
    │   └── bocaue-geo.ts          ← NEW: bounds, center, zoom constants
    ├── components/
    │   └── tracking/
    │       ├── native-map-available.ts   (unchanged)
    │       ├── bocaue-boundary-layer.tsx ← NEW: optional GeoJSON outline layer
    │       ├── citizen-location-map.tsx  ← MODIFY: add maxBounds + defaultCenter
    │       └── live-tracking-map.tsx     ← MODIFY: add maxBounds
    └── assets/
        └── geo/
            └── bocaue-barangays.geojson  ← NEW: barangay boundary data (sourced once)
```

No new screens. No changes to `app/` routes.

---

## 5. Step-by-Step Implementation Tasks

### Task 1 — Create the geo constants file

**File:** `mobile/src/config/bocaue-geo.ts`

```typescript
import type { LngLatBounds } from '@maplibre/maplibre-react-native';

export const BOCAUE_BOUNDS: LngLatBounds = [
  120.902808, // west
  14.784868,  // south
  121.003431, // east
  14.912304,  // north
];

export const BOCAUE_CENTER: [number, number] = [120.953120, 14.848586];

export const BOCAUE_DEFAULT_ZOOM = 12;
export const BOCAUE_INCIDENT_ZOOM = 15;

export const BOCAUE_BARANGAYS = [
  'Antipona', 'Bagumbayan', 'Bambang', 'Batia',
  'Biñang 1st', 'Biñang 2nd', 'Bolacan', 'Bundukan',
  'Bunlo', 'Caingin', 'Duhat', 'Igulot',
  'Lolomboy', 'Poblacion', 'Sulucan', 'Taal',
  'Tambobong', 'Turo', 'Wakas',
] as const;

export type BocaueBarangay = typeof BOCAUE_BARANGAYS[number];
```

---

### Task 2 — Update `CitizenLocationMap` to enforce bounds

**File:** `mobile/src/components/tracking/citizen-location-map.tsx`

Changes:
1. Import `BOCAUE_BOUNDS`, `BOCAUE_CENTER`, `BOCAUE_DEFAULT_ZOOM` from `@/src/config/bocaue-geo`.
2. Add the `maxBounds` prop to `<Map>`.
3. When `coords` is `null`, use `BOCAUE_CENTER` as `initialViewState` so the camera opens on Bocaue instead of `[0, 0]`.
4. Import and optionally render `<BocaueBarangayBoundaryLayer />` (see Task 4).

**Key diff (pseudocode — apply with Edit tool when implementing):**

```diff
- import { Map, Camera, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
+ import { Map, Camera, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
+ import { BOCAUE_BOUNDS, BOCAUE_CENTER, BOCAUE_DEFAULT_ZOOM } from '@/src/config/bocaue-geo';

  <Map
    key={mapKey}
    style={StyleSheet.absoluteFill}
    mapStyle={styleUrl}
+   maxBounds={BOCAUE_BOUNDS}
    onDidFinishLoadingStyle={onStyleLoaded}
    onDidFailLoadingMap={onMapFailed}
  >
    <Camera
      ref={cameraRef}
      {...(coords
        ? { initialViewState: { center: [coords.lng, coords.lat], zoom: 15 } }
-       : {})}
+       : { initialViewState: { center: BOCAUE_CENTER, zoom: BOCAUE_DEFAULT_ZOOM } }
+     )}
    />
```

---

### Task 3 — Update `LiveTrackingMap` to enforce bounds

**File:** `mobile/src/components/tracking/live-tracking-map.tsx`

Changes:
1. Import `BOCAUE_BOUNDS`, `BOCAUE_CENTER`, `BOCAUE_DEFAULT_ZOOM`.
2. Add `maxBounds={BOCAUE_BOUNDS}` to `<Map>`.
3. Guard the `fitBounds` call in `fitRoute()` so the computed bounds are clamped to `BOCAUE_BOUNDS` before being passed to the camera (prevents zooming out to world level when both points fall outside the municipality — shouldn't happen in production but a defensive guard).
4. When no `center` is available, fall back to `BOCAUE_CENTER` + `BOCAUE_DEFAULT_ZOOM` as `initialViewState`.

**Key diff (pseudocode):**

```diff
+ import { BOCAUE_BOUNDS, BOCAUE_CENTER, BOCAUE_DEFAULT_ZOOM } from '@/src/config/bocaue-geo';

  <Map
    key={mapKey}
    style={StyleSheet.absoluteFill}
    mapStyle={styleUrl}
+   maxBounds={BOCAUE_BOUNDS}
    onRegionIsChanging={onRegionIsChanging}
    onDidFinishLoadingStyle={onStyleLoaded}
    onDidFailLoadingMap={onMapFailed}
  >
    <Camera
      ref={cameraRef}
      pitch={activePitch}
      bearing={activeBearing}
      duration={600}
      easing="ease"
      {...(center
        ? { initialViewState: { center: [center.lng, center.lat], zoom: 14 } }
-       : {})}
+       : { initialViewState: { center: BOCAUE_CENTER, zoom: BOCAUE_DEFAULT_ZOOM } }
+     )}
    />
```

In `fitRoute()`, clamp the computed bounds before calling `fitBounds`:

```typescript
function clampToBocaue(bounds: LngLatBounds): LngLatBounds {
  return [
    Math.max(bounds[0], BOCAUE_BOUNDS[0]),
    Math.max(bounds[1], BOCAUE_BOUNDS[1]),
    Math.min(bounds[2], BOCAUE_BOUNDS[2]),
    Math.min(bounds[3], BOCAUE_BOUNDS[3]),
  ];
}
// ... inside fitRoute():
cameraRef.current?.fitBounds(clampToBocaue(bounds), { duration: 600 });
```

---

### Task 4 — Create `BocaueBarangayBoundaryLayer` (optional, recommended)

**File:** `mobile/src/components/tracking/bocaue-boundary-layer.tsx`

This component renders the barangay polygon outlines as a `GeoJSONSource` + `Layer` on top of the base tile. It is toggled by a prop; callers can pass `showBoundary={false}` to skip it in production until the GeoJSON is verified.

```typescript
import React from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bocaueGeoJSON = require('@/src/assets/geo/bocaue-barangays.geojson');

export function BocaueBarangayBoundaryLayer({ show = true }: { show?: boolean }) {
  if (!show) return null;

  return (
    <GeoJSONSource id="bocaue-barangays" data={bocaueGeoJSON}>
      {/* Polygon fill */}
      <Layer
        id="barangay-fill"
        type="fill"
        style={{ fillColor: '#0D6053', fillOpacity: 0.06 }}
      />
      {/* Outline */}
      <Layer
        id="barangay-outline"
        type="line"
        style={{ lineColor: '#0D6053', lineWidth: 1.2, lineOpacity: 0.45 }}
      />
      {/* Barangay name labels — show at zoom ≥ 13 */}
      <Layer
        id="barangay-labels"
        type="symbol"
        minzoom={13}
        style={{
          textField: ['get', 'NAME'],    // adjust property key to match your GeoJSON
          textSize: 11,
          textColor: '#0D6053',
          textHaloColor: '#FFFFFF',
          textHaloWidth: 1.5,
          textFont: ['Open Sans Regular'],
        } as any}
      />
    </GeoJSONSource>
  );
}
```

> **Property key note:** The `NAME` property in `textField` must match the actual key in the sourced GeoJSON. Common values from Philippine PSGC sources: `"NAME"`, `"ADM4_EN"`, `"brgy_name"`. Verify after downloading (see §8).

Integrate into `CitizenLocationMap` and `LiveTrackingMap`:

```tsx
import { BocaueBarangayBoundaryLayer } from './bocaue-boundary-layer';

// Inside <Map>:
<BocaueBarangayBoundaryLayer show={showBoundary} />
```

Add a `showBoundary?: boolean` prop (default `false` until QA-verified) to both map components. Enable it in `mobile/app/responder/map.tsx` and `mobile/app/emergency/location.tsx` once the GeoJSON is confirmed.

---

### Task 5 — Source and commit the Bocaue GeoJSON

**File:** `mobile/src/assets/geo/bocaue-barangays.geojson`

**Recommended sources (ranked by reliability):**

1. **GADM** — `gadm.org` → Philippines → Level 4 (barangay) → filter for Bocaue. Download as GeoJSON.
2. **Overpass Turbo** — Query `relation["name"="Bocaue"]["admin_level"="8"]`; export as GeoJSON.
3. **faeldon/philippines-json-maps** — GitHub repo with PSGC-aligned Philippine administrative boundaries. Filter by `province = "Bulacan"` and `municipality = "Bocaue"`.
4. **PSA / PhilGIS open datasets** — Philippines Statistics Authority publishes shapefiles; convert to GeoJSON with `ogr2gdal` or `mapshaper`.

After download:
- Open in [geojson.io](https://geojson.io) to confirm all 19 barangays are present.
- Simplify geometry (if file > 500 KB) using `mapshaper -simplify 15%` to keep the bundle small.
- Confirm the bounding box fits inside `BOCAUE_BOUNDS` — discard any features outside the municipality.
- Check the `NAME` / barangay-name property key and update `bocaue-boundary-layer.tsx` accordingly.
- Commit to `mobile/src/assets/geo/bocaue-barangays.geojson`.

The file must be bundled as a static asset (Expo's Metro bundler includes JSON automatically).

---

### Task 6 — Wire `maxBounds` + fallback center into `tracking/[id].tsx`

**File:** `mobile/app/tracking/[id].tsx`

This screen also renders a live-tracking map for the citizen watching their incident. Verify it passes `styleUrl` correctly and that, after Task 3, the `<LiveTrackingMap>` it renders inherits the `maxBounds` from the component. No screen-level changes are expected, but review the screen to confirm no custom `initialViewState` override bypasses the Bocaue defaults.

---

### Task 7 — (Optional) Smoke-test `maxBounds` on device

After Tasks 1–3 are implemented, run on a physical Android device (the only valid test target for MapLibre native module):

```bash
cd mobile
npx expo run:android
```

Open the GPS location screen (`/emergency/location`) and the responder map (`/responder/map`). Try panning the map north of Bocaue and confirm the camera snaps back at the boundary.

---

## 6. Camera Restriction Strategy

### Primary mechanism: `maxBounds`

The `<Map maxBounds={BOCAUE_BOUNDS}>` prop is the canonical MapLibre restriction. It prevents the camera viewport from showing tiles outside the rectangle. The camera physically cannot be moved outside this box — panning stops at the edge.

```
BOCAUE_BOUNDS = [120.902808, 14.784868, 121.003431, 14.912304]
                  west        south       east         north
```

`LngLatBounds` format in `@maplibre/maplibre-react-native` is `[minLng, minLat, maxLng, maxLat]`.

### Fallback default center

When no incident or GPS fix is available, `initialViewState` is set to `BOCAUE_CENTER` at `BOCAUE_DEFAULT_ZOOM` (zoom 12), which shows the full municipality.

### `fitBounds` guard

The `fitRoute()` function in `LiveTrackingMap` computes a bounding box from the route + markers. The `clampToBocaue()` helper (Task 3) prevents it from requesting a viewport larger than `BOCAUE_BOUNDS`. Without this guard, a route that clips the edge of the municipality would attempt to zoom out past the maxBounds constraint, causing a jarring snap.

### What `maxBounds` does NOT restrict

- It does not restrict where in Bocaue the camera can center.
- It does not restrict zoom level (set `minZoom`/`maxZoom` on `<Map>` if needed — suggested: `minZoom={10}`, `maxZoom={20}`).
- It does not restrict what barangay a marker can be placed in.

---

## 7. Optional GeoJSON Boundary Layer

See Task 4 for implementation. Summary of design decisions:

| Decision | Rationale |
|---|---|
| Render as `GeoJSONSource` + `Layer` inside `<Map>` | Uses MapLibre's native GL rendering — smooth, no JS bridge per frame |
| Thin teal outline + low-opacity fill | Matches AGAP brand color (`#0D6053`); readable without obscuring the base map |
| Labels at zoom ≥ 13 | At zoom 12 the labels overlap; 13 gives enough space for the 19 barangay names |
| `show` prop defaults `false` | GeoJSON must be verified before enabling in production; avoids crash on malformed data |
| Bundle as a local asset | Works offline (critical for flood-zone connectivity); no CDN dependency |

---

## 8. Configuration Constants Reference

All Bocaue geo values are centralized in `mobile/src/config/bocaue-geo.ts` so future updates (e.g. a corrected bounding box) require a single file change.

| Constant | Value | Use |
|---|---|---|
| `BOCAUE_BOUNDS` | `[120.902808, 14.784868, 121.003431, 14.912304]` | `maxBounds` on all `<Map>` instances |
| `BOCAUE_CENTER` | `[120.953120, 14.848586]` | `initialViewState.center` fallback |
| `BOCAUE_DEFAULT_ZOOM` | `12` | Shows the full municipality |
| `BOCAUE_INCIDENT_ZOOM` | `15` | Street-level detail for incident pins |
| `BOCAUE_BARANGAYS` | Array of 19 names | Validation, dropdowns, labels |

Tile style URL is **not** a constant here — it comes from the backend's `/api/v1/locations/map-config` endpoint and falls back to `https://demotiles.maplibre.org/style.json` at the call site.

---

## 9. Testing Checklist

### Map bounds
- [ ] Open `/emergency/location` with no GPS fix — camera opens on Bocaue, not world origin.
- [ ] Open `/emergency/location` with a GPS fix — camera centers on the fix inside Bocaue.
- [ ] Pan the map north past Bambang / Lolomboy — camera clamps at northern bound (14.912304).
- [ ] Pan the map south past Batia — camera clamps at southern bound (14.784868).
- [ ] Pan west past Sulucan / Taal — camera clamps at western bound (120.902808).
- [ ] Pan east past the eastern boundary — camera clamps at eastern bound (121.003431).
- [ ] Zoom out past zoom 10 (if `minZoom` set) — zoom is clamped.

### Responder map
- [ ] Open `/responder/map` with no active assignment — camera opens on Bocaue.
- [ ] Open `/responder/map` with an active assignment — camera centers on destination.
- [ ] Tap "Fit Route" — route overview stays within Bocaue bounds.
- [ ] "Retry" on map error remounts the GL surface and still enforces bounds.

### Barangay boundary layer (when `show={true}`)
- [ ] Teal outline is visible at zoom ≥ 12.
- [ ] Barangay name labels appear at zoom ≥ 13.
- [ ] All 19 barangays have outlines (spot-check: Bundukan, Bambang, Lolomboy).
- [ ] No GeoJSON parse errors in Metro / native logs.
- [ ] Layer does not obscure incident or responder markers.

### Fallback behavior
- [ ] When `isNativeMapAvailable()` returns `false`, no MapLibre import is attempted.
- [ ] Map error boundary displays "Retry" on tile load failure; retry re-applies bounds.

---

## 10. Potential Issues & Mitigations

| Issue | Mitigation |
|---|---|
| `maxBounds` is not honored on older MapLibre RN versions | v11+ supports it; `package.json` pins `^11.4.1`. Lock to `11.x` in `.npmrc` if needed. |
| GeoJSON bundle size bloats APK | Simplify with `mapshaper -simplify 15%` before committing. Target < 500 KB. |
| Barangay name property key mismatch | Print `Object.keys(feature.properties)` in a dev build to confirm the key, then update `bocaue-boundary-layer.tsx`. |
| Camera snaps harshly at bounds edge | MapLibre's `maxBounds` uses a smooth spring constraint by default; no extra action needed. |
| Demo tile style shows very few labels | Set `MAP_STYLE_URL` in `backend/.env` to a self-hosted MapTiler / OpenFreeMap style for Bocaue — the backend already serves `styleUrl` via map-config. |
| Responder map opens on `[0,0]` when `center` is null | Task 3 fallback to `BOCAUE_CENTER` fixes this. |
| `fitBounds` fighting `maxBounds` on edge incidents | `clampToBocaue()` guard in `fitRoute()` prevents requesting viewport outside bounds. |
| Android emulator missing NDK / GL support | MapLibre requires a physical Android device or an AVD with hardware acceleration enabled. |

---

## 11. Future Improvements

- **Flood-zone layer:** Add a toggleable flood-inundation polygon layer (Lolomboy, Bunlo, Igulot, Bambang) sourced from PAGASA / NDRRMC shapefiles. Toggle it on when the backend broadcasts a flood alert.
- **Risk heatmap overlay:** The `RiskHeatmapView` component (already in the frontend) could be ported to the mobile map for situational awareness.
- `minZoom` / `maxZoom`: Set `minZoom={10}` and `maxZoom={20}` on all `<Map>` instances so operators can't zoom out to regional level or zoom in past useful tile resolution.
- **Offline tile cache:** Integrate MapLibre's offline region API to pre-download Bocaue tiles for use during typhoon-related connectivity loss (aligns with MOD-19 offline strategy).
- **Barangay-scoped incident filtering:** Use `BOCAUE_BARANGAYS` to validate the `barangay` field returned by reverse geocoding and warn the dispatcher if an incident is reported outside municipality bounds.
