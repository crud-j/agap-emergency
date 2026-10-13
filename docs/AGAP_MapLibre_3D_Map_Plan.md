# AGAP — MapLibre 3D Map Enhancement Plan

**Modules:** MOD-13 (Live Tracking) · MOD-22 (Real-Time Incident Map) · MOD-43 (ETA & Tracking)  
**Author:** AGAP Engineering  
**Date:** 2026-10-11  
**Status:** Implemented

---

## Context

The live tracking map used by both the citizen app (`tracking/[id].tsx`) and responder app (`responder/map.tsx`) rendered in a flat, top-down perspective (pitch = 0°). This plan documents three tiers of 3D enhancement applied to the shared `LiveTrackingMap` component.

1. **Camera perspective** — pitch tilt and heading-follow navigation mode (any style, mobile-only)
2. **3D building extrusion** — extruded building footprints at close zoom (requires OpenMapTiles style)
3. **Style upgrade** — switch to a proper tile style that includes building height data

All changes preserve the shared `LiveTrackingMap` as the single rendering surface and do not block emergency dispatch (AGAP Architectural Rule 5).

---

## Code Audit Findings

### Files involved

| File | Role | State before |
|---|---|---|
| `mobile/src/components/tracking/live-tracking-map.tsx` | Shared map component | No pitch, no heading, no buildings layer |
| `mobile/app/tracking/[id].tsx` | Citizen live tracking screen | styleUrl hardcoded to demo tiles (bug) |
| `mobile/app/responder/map.tsx` | Responder map tab | styleUrl hardcoded to demo tiles (bug) |
| `mobile/app/emergency/location.tsx` | SOS location confirm | `FALLBACK_MAP_CONFIG` missing `supports3dBuildings` |
| `shared/src/maps/map.types.ts` | `MapClientConfig` shared type | No `supports3dBuildings` field |
| `backend/…/mapbox-tile.provider.ts` | Mapbox tile provider | Missing `supports3dBuildings`; `styleUrl` served `mapbox://` |
| `backend/…/maplibre-osm-tile.provider.ts` | OSM tile provider | Missing `supports3dBuildings` |

### Critical bug: Style URL was never used

Both `tracking/[id].tsx` and `responder/map.tsx` had:

```tsx
const styleUrl =
  mapConfig?.provider === MapProvider.MAPLIBRE && mapConfig.styleUrl
    ? mapConfig.styleUrl
    : MAPLIBRE_DEMO_STYLE;
```

When `MAP_PROVIDER=mapbox` (the current default), this **always fell back** to the MapLibre demo tiles. The Mapbox `styleUrl` uses `mapbox://` sources which `@maplibre/maplibre-react-native` v11 cannot resolve without the Mapbox Maps SDK.

**Fix applied:**
```tsx
const styleUrl = mapConfig?.styleUrl ?? MAPLIBRE_DEMO_STYLE;
```

### 3D building limitation

The `demotiles.maplibre.org` style has no building height data. `FillExtrusionLayer` requires a style with an OpenMapTiles-format `building` source layer containing `height` and `min_height` properties. Available from:

- **MapTiler Streets** (free Community tier, 75k tile requests/month)
- Self-hosted `tileserver-gl` with a Philippines OSM extract
- Any style built on the OpenMapTiles schema

---

## Phase 1 — Camera Perspective & Navigation Mode

**Mobile-only · No backend changes · Works with any style**

### Changes to `live-tracking-map.tsx`

Three new props added:

```tsx
pitch?: number;                  // camera tilt degrees — caller sets higher when en-route
navigationHeading?: number | null; // rotates camera to face travel direction
supports3dBuildings?: boolean;   // enables fill-extrusion layer
```

**3D/Flat toggle button** added to the controls panel (top of existing button stack). State:

- `is3d: boolean` — user-controlled perspective toggle
- `activePitch = is3d ? externalPitch : 0`
- `activeHeading = is3d && navigationHeading != null ? navigationHeading : undefined`

The `Camera` component reactive props `pitch` and `heading` handle smooth animation when `is3d` toggles. The existing `easeTo` ref calls continue to handle position tracking. `fitRoute` sets `is3d = false` to give a flat overview.

**SkyLayer** (atmosphere) renders when `activePitch > 10`:

```tsx
{activePitch > 10 && (
  <Layer id="sky" type="sky" style={{ skyType: 'atmosphere', skyAtmosphereSun: [0.0, 90.0], skyAtmosphereSunIntensity: 15 }} />
)}
```

### Changes to `responder/map.tsx`

```tsx
<LiveTrackingMap
  styleUrl={styleUrl}
  incident={destination}
  responder={isActive ? responderPoint : null}
  routeGeometry={isActive ? (route.geometry ?? null) : null}
  pitch={isActive ? 50 : 0}
  navigationHeading={isActive && responderPoint?.heading != null ? responderPoint.heading : null}
  supports3dBuildings={mapConfig?.supports3dBuildings ?? false}
/>
```

- **50° pitch** when on an active assignment — navigation-mode perspective
- **0° pitch** when standing by — flat overview
- **Heading follow** when heading is known — camera faces direction of travel

Style URL bug fix also applied.

### Changes to `tracking/[id].tsx`

```tsx
<LiveTrackingMap
  styleUrl={styleUrl}
  incident={incidentPoint}
  responder={responderPoint}
  routeGeometry={route.geometry}
  pitch={20}
  supports3dBuildings={mapConfig?.supports3dBuildings ?? false}
/>
```

- **20° pitch** — gentle perspective for the citizen watching the responder approach
- No heading follow (citizen is stationary)

Style URL bug fix also applied.

---

## Phase 2 — 3D Building Extrusion

**Mobile + shared type + backend providers · No Prisma changes**

### `shared/src/maps/map.types.ts`

```typescript
export interface MapClientConfig {
  provider: MapProvider;
  styleUrl: string | null;
  attribution: string;
  staticMapSupported: boolean;
  supports3dBuildings: boolean;  // true only when style has building height data
}
```

### `backend/…/mapbox-tile.provider.ts`

```typescript
clientConfig(): MapClientConfig {
  const token = this.token();
  return {
    provider: MapProvider.MAPBOX,
    styleUrl: null,               // mapbox:// sources not resolvable by MapLibre GL Native
    attribution: '© Mapbox © OpenStreetMap',
    staticMapSupported: Boolean(token),
    supports3dBuildings: false,
  };
}
```

> **Note:** `styleUrl: null` is honest — the previous `mapbox://` URL was never used by the live map client. The Mapbox static image API (used by `emergency/location.tsx`) is unaffected — it uses a separate HTTPS endpoint.

### `backend/…/maplibre-osm-tile.provider.ts`

```typescript
clientConfig(): MapClientConfig {
  const styleUrl =
    this.config.get<string>('MAP_STYLE_URL') || 'https://demotiles.maplibre.org/style.json';
  const isCustomStyle = !!this.config.get<string>('MAP_STYLE_URL');
  return {
    provider: MapProvider.MAPLIBRE,
    styleUrl,
    attribution: '© OpenStreetMap contributors',
    staticMapSupported: false,
    supports3dBuildings: isCustomStyle,  // demo tiles have no building height data
  };
}
```

### `mobile/src/components/tracking/live-tracking-map.tsx` — FillExtrusionLayer

```tsx
{supports3dBuildings && (
  <Layer
    id="3d-buildings"
    type="fill-extrusion"
    sourceID="openmaptiles"
    sourceLayerID="building"
    minZoomLevel={14}
    filter={['has', 'height']}
    style={{
      fillExtrusionColor: '#DCE3E9',
      fillExtrusionHeight: ['interpolate', ['linear'], ['zoom'], 14, 0, 16, ['coalesce', ['get', 'height'], 4]],
      fillExtrusionBase: ['coalesce', ['get', 'min_height'], 0],
      fillExtrusionOpacity: ['interpolate', ['linear'], ['zoom'], 14, 0, 16, 0.75],
    }}
  />
)}
```

- `minZoomLevel={14}` — buildings only render at street level (performance: no load at overview zoom)
- `['coalesce', ['get', 'height'], 4]` — 4 m default for buildings missing height data (common in Philippines OSM)
- Opacity fade-in on zoom 14→16 — smooth appearance as the user zooms in

### `mobile/app/emergency/location.tsx` — `FALLBACK_MAP_CONFIG`

Added `supports3dBuildings: false` to the offline fallback constant so it satisfies the updated `MapClientConfig` type.

---

## Phase 3 — Style Upgrade (Unlocks Buildings)

**Config-only · No code changes**

Phase 2 code is live but shows no buildings until a style with building data is configured. To activate:

### Option A — MapTiler (recommended)

1. Create a free account at [maptiler.com](https://www.maptiler.com) → API Keys
2. In `backend/.env`:
   ```
   MAP_PROVIDER=maplibre
   MAP_STYLE_URL=https://api.maptiler.com/maps/streets-v2/style.json?key=YOUR_KEY
   ```
3. Restart the backend. `GET /v1/locations/map-config` will return `supports3dBuildings: true`.

**Why MapTiler:**
- Free Community tier: 75k tile requests/month — sufficient for MDRRMO ops scale
- Philippines OSM coverage with full building height data in OpenMapTiles schema
- Standard HTTPS vector tile URLs — no `mapbox://` dependencies

### Option B — Self-hosted `tileserver-gl`

```yaml
# Add to docker-compose.yml:
tileserver:
  image: maptiler/tileserver-gl:latest
  volumes:
    - ./infrastructure/tiles:/data
  ports:
    - "8080:8080"
```

Set `MAP_STYLE_URL=http://tileserver:8080/styles/basic/style.json`. Requires a Philippines OSM extract (~2–5 GB `.mbtiles`) placed in `infrastructure/tiles/`.

Self-hosted gives complete data sovereignty and zero tile cost at the expense of infrastructure maintenance.

---

## Performance Notes

| Feature | GL cost | Mitigation |
|---|---|---|
| Camera pitch | Zero (single GL transform) | None needed |
| SkyLayer | Single GL pass | Only renders when `pitch > 10` |
| FillExtrusionLayer | Extra GL draw call per tile | `minZoomLevel={14}` prevents load at overview |
| Extrusion fade-in | Expression evaluated per vertex | Interpolation expression is cheap in MapLibre GL Native |
| Heading-follow | `easeTo` 600 ms | Same as existing position follow |

MapLibre GL Native renders all layers in a single native GL context — React Native re-renders on prop changes only, not on each animation frame.

---

## No-Change Surfaces

| Surface | Reason |
|---|---|
| `mobile/app/emergency/location.tsx` | Uses a Mapbox static image (`<Image>`), not `LiveTrackingMap`. 3D not applicable. |
| `frontend/` ops dashboard | Separate browser map implementation. Out of scope. |
| Backend routing/geocoding | OSRM + Nominatim unaffected by tile provider changes. |
| Prisma schema | No schema changes. |
| WebSocket events | Map rendering is client-side; no new WS events needed. |

---

## Verification

### Phase 1 (camera)

```bash
cd backend && pnpm start:dev
cd mobile && npx expo start
```

1. Log in as RESPONDER → accept an assignment
2. Map tab: confirm 50° tilt when en-route, camera rotates to face heading
3. Tap the cube icon (3D toggle) → map flattens to 0° → tap again → re-tilts
4. Tap fit-route button → camera frames full route in flat view
5. Log in as CITIZEN with an active incident → tap "Track Responder"
6. Confirm ~20° gentle tilt on the citizen tracking screen
7. `cd mobile && npx tsc --noEmit` → clean

### Phase 2 (buildings — requires Phase 3 style active)

1. Set `MAP_PROVIDER=maplibre` + a valid `MAP_STYLE_URL`
2. `curl http://localhost:3000/v1/locations/map-config` → `supports3dBuildings: true`
3. Open live tracking screen → zoom to level 15+
4. Building footprints extrude into 3D blocks with fade-in
5. At zoom < 14: no building layer rendered
6. `cd backend && pnpm typecheck` + `cd mobile && npx tsc --noEmit` → clean
7. `cd shared && pnpm build` → `MapClientConfig` includes `supports3dBuildings`

### Phase 3 (style)

1. `GET /v1/locations/map-config` → `provider: "maplibre"` + non-demo `styleUrl`
2. Open map → tiles load correctly for Bocaue area
3. SOS location confirm screen: static map image still loads (separate Mapbox static API path)
4. `pnpm test` → no regressions

---

## Files Changed Summary

| File | Phases | Change |
|---|---|---|
| `mobile/src/components/tracking/live-tracking-map.tsx` | 1 + 2 | pitch/heading/3d-toggle, SkyLayer, FillExtrusionLayer |
| `mobile/app/responder/map.tsx` | 1 + 2 | pass pitch/heading, fix styleUrl bug, pass supports3dBuildings |
| `mobile/app/tracking/[id].tsx` | 1 + 2 | pass gentle pitch, fix styleUrl bug, pass supports3dBuildings |
| `mobile/app/emergency/location.tsx` | 2 | add `supports3dBuildings: false` to `FALLBACK_MAP_CONFIG` |
| `shared/src/maps/map.types.ts` | 2 | add `supports3dBuildings` to `MapClientConfig` |
| `backend/…/mapbox-tile.provider.ts` | 2 + 3 | `supports3dBuildings: false`, `styleUrl: null` |
| `backend/…/maplibre-osm-tile.provider.ts` | 2 | `supports3dBuildings` conditional on `MAP_STYLE_URL` |
| `.env.example` | 3 | improve `MAP_STYLE_URL` comment with 3D buildings guidance |
