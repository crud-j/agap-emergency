# Frontend Map Migration: Leaflet → MapLibre GL

**Scope:** `frontend/` only. No changes to `backend/`, `mobile/`, or `shared/`.  
**From:** `leaflet@^1.9.4` + `react-leaflet@^4.2.1`  
**To:** `maplibre-gl@^4.x` + `react-map-gl@^8.x` (MapLibre-backed)  
**Related doc:** `docs/maplibre-bocaue-implementation-plan.md` (mobile MapLibre — already done)

---

## 1. Why This Migration

| Problem with Leaflet | MapLibre GL solution |
|---|---|
| Raster tiles only — blurry on HiDPI | Vector tiles — crisp at all zoom levels |
| Canvas-based "heatmap" (circle overlays) | Native WebGL `heatmap` layer type — real density rendering |
| No shared style with mobile surface | Same `styleUrl` from backend `/api/v1/locations/map-config` |
| `react-leaflet` adds a JS-bridge per render for markers | `react-map-gl` + GL layers = GPU-rendered, no per-frame JS |
| No `maxBounds` support | `maxBounds` prop locks camera to Bocaue bounding box (mirrors mobile) |

---

## 2. Files Affected

### Removed (packages + CSS)
```
leaflet                    ← uninstall
react-leaflet              ← uninstall
@types/leaflet             ← uninstall
leaflet/dist/leaflet.css   ← all CSS imports removed from components
```

### Added (packages)
```
maplibre-gl@^4.x
react-map-gl@^8.x
```

### New files (3)
```
frontend/lib/bocaue-geo.ts
frontend/features/map/api.ts              ← ADD fetchMapConfig() to existing file
frontend/features/map/hooks.ts            ← ADD useMapStyle() to existing file
frontend/components/map/MapErrorOverlay.tsx
```

### Rewritten components (3)
```
frontend/components/dispatch/IncidentMap.tsx
frontend/components/incidents/IncidentMapView.tsx
frontend/components/risk/RiskHeatmapView.tsx
```

### Comment-only changes (3 pages)
```
frontend/app/(ops)/operations/dispatch/page.tsx
frontend/app/(ops)/operations/map/page.tsx
frontend/app/(ops)/operations/risk/page.tsx
```

### Config (1)
```
frontend/next.config.mjs   ← webpack alias for maplibre-gl worker bundling
frontend/package.json      ← dep swap
```

**Total: 12 files.**

---

## 3. Critical Coordinate Order Change

Leaflet uses `[lat, lng]` (y, x). MapLibre GL uses `[lng, lat]` (x, y, GeoJSON standard). Every coordinate in the rewritten components must be flipped.

| Context | Leaflet | MapLibre |
|---|---|---|
| Map center | `[14.7969, 120.9268]` | `[120.9268, 14.7969]` |
| `CircleMarker center` | `[lat, lng]` | `longitude={lng} latitude={lat}` (Marker) |
| `flyTo` | `map.flyTo([lat, lng], zoom)` | `map.flyTo({ center: [lng, lat], zoom })` |
| GeoJSON coords | N/A | `[lng, lat]` always |

---

## 4. Bocaue Geo Constants (mirrors mobile)

**New file:** `frontend/lib/bocaue-geo.ts`

```typescript
// [west, south, east, north] — same format as mobile/src/config/bocaue-geo.ts
export const BOCAUE_BOUNDS = [120.902808, 14.784868, 121.003431, 14.912304] as [number, number, number, number];

// [lng, lat] — GeoJSON/MapLibre order
export const BOCAUE_CENTER: [number, number] = [120.953120, 14.848586];

export const BOCAUE_DEFAULT_ZOOM = 12;
export const BOCAUE_INCIDENT_ZOOM = 15;
export const BOCAUE_MIN_ZOOM = 10;
export const BOCAUE_MAX_ZOOM = 20;
```

This centralizes all Bocaue geo values. Any future bounding-box correction is a single-file change.

---

## 5. Style URL Strategy

The backend already serves `styleUrl` from its `MapLibreOsmTileProvider` via `/api/v1/locations/map-config`. The frontend should consume this just like the mobile does.

**Additions to `frontend/features/map/api.ts`:**

```typescript
export interface MapConfig {
  styleUrl: string;
  attribution: string;
  supports3dBuildings: boolean;
}

export function fetchMapConfig(): Promise<MapConfig> {
  return api.get('/locations/map-config', getToken());
}
```

**New hook in `frontend/features/map/hooks.ts`:**

```typescript
export function useMapStyle(): string {
  const { data } = useQuery({
    queryKey: ['map-config'],
    queryFn: fetchMapConfig,
    staleTime: Infinity, // style URL doesn't change at runtime
  });
  return data?.styleUrl ?? 'https://demotiles.maplibre.org/style.json';
}
```

All three map components call `useMapStyle()` to get the active tile style. The fallback keeps the map working when the backend is unreachable.

---

## 6. Shared Error Overlay

**New file:** `frontend/components/map/MapErrorOverlay.tsx`

A reusable overlay rendered on top of the map GL canvas when tiles fail to load — mirrors the mobile `errorOverlay` pattern in `live-tracking-map.tsx`. Props: `onRetry: () => void`.

Displayed when `onError` fires on the `<Map>` component. A `mapKey` state counter in each map component increments on retry, which forces a full GL remount (same pattern as mobile).

---

## 7. Task-by-Task Implementation

### Task 0 — Package swap

```bash
cd frontend
pnpm remove leaflet react-leaflet @types/leaflet
pnpm add maplibre-gl react-map-gl
```

---

### Task 1 — Create `frontend/lib/bocaue-geo.ts`

Exact content as shown in §4. No other changes.

---

### Task 2 — Update `frontend/next.config.mjs`

`maplibre-gl` bundles Web Workers internally. Next.js 14's webpack config needs a hint to avoid bundling the worker as a standard chunk:

```js
webpack: (config) => {
  config.resolve.alias['maplibre-gl'] =
    require.resolve('maplibre-gl/dist/maplibre-gl.js');
  return config;
},
```

Add this inside the existing `nextConfig` object. If it causes a build error (Next.js version already handles it), remove it — it is optional but guards against worker bundling issues.

---

### Task 3 — Add `fetchMapConfig` and `useMapStyle`

Add to `frontend/features/map/api.ts` and `frontend/features/map/hooks.ts` as shown in §5. No existing code in those files is touched.

---

### Task 4 — Create `frontend/components/map/MapErrorOverlay.tsx`

```tsx
'use client';

export function MapErrorOverlay({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-agap-surface/95">
      <span className="text-sm font-semibold text-agap-textMain">Map unavailable</span>
      <p className="max-w-xs text-center text-xs text-agap-textSub">
        Check your connection or verify the map tile configuration.
      </p>
      <button
        onClick={onRetry}
        className="rounded-xl bg-agap-green px-4 py-2 text-sm font-bold text-white"
      >
        Retry
      </button>
    </div>
  );
}
```

---

### Task 5 — Rewrite `IncidentMap.tsx` (dispatch panel map)

**File:** `frontend/components/dispatch/IncidentMap.tsx`

**Import change:**
```tsx
// BEFORE
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// AFTER
import Map, { Marker, Popup, useMap } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
```

**Key API changes:**

| Leaflet | react-map-gl/maplibre |
|---|---|
| `<MapContainer center={[lat,lng]} zoom={13}>` | `<Map initialViewState={{ longitude, latitude, zoom }} maxBounds={BOCAUE_BOUNDS}>` |
| `<TileLayer url="...">` | removed — style is in `mapStyle` prop |
| `<CircleMarker center={[lat,lng]} radius={r}>` | `<Marker longitude={lng} latitude={lat}><div style={circle} /></Marker>` |
| `<Popup>content</Popup>` | `<Popup longitude={lng} latitude={lat}>content</Popup>` |
| `useMap()` → `map.flyTo([lat,lng], z)` | `useMap()` → `map.flyTo({ center: [lng,lat], zoom: z, duration: 600 })` |

**`MapController` component becomes `MapFlyController`:**
```tsx
function MapFlyController({ incidents, selectedId }) {
  const { current: map } = useMap();
  useEffect(() => {
    if (!selectedId || !map) return;
    const inc = incidents.find((i) => i.id === selectedId);
    const c = coordsOf(inc);
    if (c) map.flyTo({ center: c, zoom: Math.max(map.getZoom(), 15), duration: 600 });
  }, [selectedId, incidents, map]);
  return null;
}
```

`coordsOf` must now return `[lng, lat]` (not `[lat, lng]`).

**Incident markers:** Replace `<CircleMarker>` with `<Marker>` + a styled `<div>` (circle via Tailwind/inline style). Priority colours stay the same (`PRIORITY_HEX`). Selected marker gets a white ring outline.

**Responder markers:** Same approach — `<Marker>` + teal `<div>`.

---

### Task 6 — Rewrite `IncidentMapView.tsx` (live operations map)

**File:** `frontend/components/incidents/IncidentMapView.tsx`

This component adds flood-prone barangay overlays (circles with advisory labels). In MapLibre GL these become GeoJSON polygon circles rendered as `<Source>` + `<Layer>`.

**Flood zone circle generation (no turf dependency):**
```typescript
function circlePolygon(lng: number, lat: number, radiusM: number, steps = 64): GeoJSON.Feature {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLng = (radiusM / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(angle);
    const dLat = (radiusM / 111320) * Math.sin(angle);
    coords.push([lng + dLng, lat + dLat]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}
```

Build a single `FeatureCollection` from all four flood zones and render it with `<Source type="geojson">` + two layers: `fill` (low-opacity blue) + `line` (stroke).

**Flood zone barangay labels:** Use a `symbol` layer on the same GeoJSON source, with `text-field` from a `name` property added to each feature. This replaces Leaflet's `<Tooltip permanent>`.

The rest of the component (incident markers, responder markers, `MapFlyController`) follows the same pattern as Task 5.

---

### Task 7 — Rewrite `RiskHeatmapView.tsx` (MOD-51 risk intelligence)

**File:** `frontend/components/risk/RiskHeatmapView.tsx`

This is the biggest visual improvement. Replace the fake Leaflet circle-as-heatmap with a proper MapLibre WebGL heatmap layer.

**Data prep:**
```typescript
const heatmapGeoJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: plotPoints.map((p) => ({
    type: 'Feature',
    properties: { count: p.count, barangay: p.barangay },
    geometry: { type: 'Point', coordinates: [p.coords[0], p.coords[1]] }, // [lng, lat]
  })),
};
```

**Layer stack (bottom to top):**

1. **Flood overlays** — `<Source>` + `<Layer type="fill">` + `<Layer type="line">` (generated with `circlePolygon()` from Task 6)
2. **Industrial/fireworks zones** — same, with red dashed style
3. **Flood zones from backend risk_areas** — same source pattern, cyan dashed
4. **Heatmap** — `<Source>` + `<Layer type="heatmap">` with `heatmap-weight` mapped from `count` property
5. **Barangay density circles** — `<Source>` + `<Layer type="circle">` sized and coloured by count (replaces the Leaflet `CircleMarker` approach but without the JS-bridge overhead)
6. **Barangay name symbols** — `<Layer type="symbol">` at minzoom 13, showing `barangay` property

**Heatmap layer paint config:**
```typescript
{
  'heatmap-weight': ['interpolate', ['linear'], ['get', 'count'], 0, 0, maxCount, 1],
  'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 15, 1.5],
  'heatmap-color': [
    'interpolate', ['linear'], ['heatmap-density'],
    0, 'rgba(0,0,0,0)',
    0.33, '#0D6053',  // agap-green (low)
    0.66, '#D97706',  // amber (mid)
    1, '#DC2626',     // red (high)
  ],
  'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 20, 14, 50],
  'heatmap-opacity': 0.75,
}
```

This gives a real density gradient instead of the current discrete circles, greatly improving risk-area perception.

---

### Task 8 — Update dynamic import comments in 3 pages

In `operations/dispatch/page.tsx`, `operations/map/page.tsx`, and `operations/risk/page.tsx`, change the comment on the `dynamic()` import from:

```tsx
// Leaflet touches `window`; load the map client-side only.
```

to:

```tsx
// MapLibre GL uses WebGL + Web Workers; must be client-side only.
```

No functional changes to these files.

---

## 8. Component Prop Interfaces — No Changes

`IncidentMap`, `IncidentMapView`, and `RiskHeatmapView` keep **identical TypeScript prop interfaces**. Callers (`dispatch/page.tsx`, `map/page.tsx`, `risk/page.tsx`) require **zero changes** beyond the comment update. The `dynamic()` import call and the `ssr: false` option remain unchanged.

---

## 9. Known Migration Pitfalls

| Pitfall | Mitigation |
|---|---|
| Coordinate order flip `[lat,lng]` → `[lng,lat]` | All `coordsOf` helpers return `[lng, lat]` in the rewritten components. Double-check every `map.flyTo` and `<Marker>` call. |
| `maplibre-gl` worker bundling in Next.js | webpack alias in `next.config.mjs` (Task 2). Remove if build succeeds without it. |
| `react-map-gl` v8 requires `maplibre-gl` as peer dep | Install both explicitly — `pnpm add maplibre-gl react-map-gl`. |
| CSS: `leaflet.css` → `maplibre-gl/dist/maplibre-gl.css` | Remove old import, add new one inside each map component (same pattern). |
| `useMap()` hook scoping | In `react-map-gl`, `useMap()` must be called inside a component that is a **child** of `<Map>`. The `MapFlyController` child component pattern (Tasks 5–6) satisfies this. |
| Popup requires explicit position | Leaflet `<Popup>` is bound to its marker parent. In `react-map-gl`, `<Popup>` is standalone and requires `longitude` + `latitude` props — manage with a `hoveredId` state. |
| `maxBounds` format | react-map-gl accepts `[west, south, east, north]` flat array — same as `@maplibre/maplibre-react-native`. Use `BOCAUE_BOUNDS` from `lib/bocaue-geo.ts` directly. |
| `heatmax-weight` needs `maxCount > 0` guard | Cap the `heatmap-weight` interpolation at `Math.max(maxCount, 1)` to avoid division-by-zero when no heatmap data is loaded. |

---

## 10. Testing Checklist

### After each task
- [ ] `pnpm typecheck` in `frontend/` — zero errors

### Functional testing (browser)

**Dispatch map (`/operations/dispatch`)**
- [ ] Map renders Bocaue on load — not world origin.
- [ ] Incident markers appear coloured by priority.
- [ ] Clicking an incident flies the map to it.
- [ ] Selecting from the queue also flies the map.
- [ ] Live responder markers appear (teal dot).
- [ ] Popup shows reference, category, priority, status.

**Live map (`/operations/map`)**
- [ ] Flood-prone barangay circles appear as advisory blue overlays.
- [ ] Barangay name labels visible at zoom ≥ 13.
- [ ] Selecting an incident opens the drawer.
- [ ] Legend still correct.

**Risk intelligence (`/operations/risk`)**
- [ ] WebGL heatmap renders incident density across barangays.
- [ ] Flood zone fill overlays (blue) visible.
- [ ] Industrial/fireworks zone fill overlays (red, dashed) visible.
- [ ] Barangay density circles appear on top of heatmap.
- [ ] Side panel hotspot list still correct.

**Error handling**
- [ ] Setting `MAP_STYLE_URL` to an invalid URL shows the retry overlay.
- [ ] Clicking Retry remounts the map and clears the error.
- [ ] If backend map-config is unreachable, fallback to `demotiles.maplibre.org` style.

**Camera restrictions**
- [ ] Panning outside Bocaue bounding box is blocked.
- [ ] `minZoom=10` prevents zooming out to national level.

---

## 11. Dependency Version Pins

| Package | Version to install | Notes |
|---|---|---|
| `maplibre-gl` | `^4.7.0` (latest stable as of Oct 2026) | Peer dep of react-map-gl |
| `react-map-gl` | `^8.x` | v8 drops Mapbox; MapLibre-only |

Pin with `^` (minor-compatible) to pick up patch fixes. Do **not** use `latest` (rule 18 of CLAUDE.md).

---

## 12. Out of Scope

- Backend changes — the `MapLibreOsmTileProvider` already serves the correct `styleUrl`.
- Mobile changes — already on MapLibre (see `maplibre-bocaue-implementation-plan.md`).
- Shared package changes — no map types in `shared/`.
- GeoJSON barangay boundary layer — the mobile plan (Task 4 in `maplibre-bocaue-implementation-plan.md`) covers sourcing the GeoJSON. Once available at `mobile/src/assets/geo/bocaue-barangays.geojson`, a follow-up frontend task can add the same layer to `IncidentMapView` and `RiskHeatmapView` using `<Source type="geojson">` + `<Layer type="line">`.
