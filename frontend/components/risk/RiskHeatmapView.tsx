'use client';

import { useMemo, useState, type JSX } from 'react';
import '@/lib/maplibre-setup';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStyle } from '@/features/map/hooks';
import {
  BOCAUE_BOUNDS, BOCAUE_CENTER, BOCAUE_DEFAULT_ZOOM, BOCAUE_MIN_ZOOM, BOCAUE_MAX_ZOOM,
  BOCAUE_BOUNDARY_SOURCE,
  BOCAUE_OUTSIDE_MASK,
} from '@/lib/bocaue-geo';
import { MapErrorOverlay } from '@/components/map/MapErrorOverlay';
import type { HeatmapPoint, RiskArea } from '@/features/risk/api';

// Approximate barangay centroids for Bocaue — [lng, lat] MapLibre order.
// Coordinates are advisory, not authoritative boundary data.
const BARANGAY_COORDS: Record<string, [number, number]> = {
  LOLOMBOY:           [120.9436, 14.7236],
  BUNLO:              [120.9253, 14.7319],
  IGULOT:             [120.9500, 14.7097],
  BAMBANG:            [120.9103, 14.7847],
  BUNDUKAN:           [120.9450, 14.7950],
  'BIÑANG 1ST':       [120.9200, 14.7650],
  'BIÑANG 2ND':       [120.9180, 14.7580],
  BOCAUE:             [120.9268, 14.7969],
  BATIA:              [120.9300, 14.8100],
  BOLACAN:            [120.9100, 14.8200],
  'DULONG BAYAN 1ST': [120.9350, 14.8050],
  'DULONG BAYAN 2ND': [120.9380, 14.8020],
  MALHACAN:           [120.9200, 14.8150],
  'MEYTO 1ST':        [120.9350, 14.7750],
  'MEYTO 2ND':        [120.9300, 14.7700],
  PUGAD:              [120.9450, 14.7850],
  'SANTA CRUZ':       [120.9350, 14.7900],
  'SAN JUAN':         [120.9400, 14.7600],
  TURO:               [120.9300, 14.7450],
  WAKAS:              [120.9200, 14.8300],
};

/** Generates an approximate GeoJSON polygon circle. Returns a ring in [lng, lat] order. */
function circlePolygon(lng: number, lat: number, radiusM: number, steps = 64): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const dLng = (radiusM / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(angle);
    const dLat = (radiusM / 111320) * Math.sin(angle);
    coords.push([lng + dLng, lat + dLat]);
  }
  return coords;
}

const FLOOD_OVERLAYS = [
  { name: 'Lolomboy',  center: [120.9436, 14.7236] as [number, number], radiusM: 900 },
  { name: 'Bunlo',     center: [120.9253, 14.7319] as [number, number], radiusM: 800 },
  { name: 'Igulot',    center: [120.9500, 14.7097] as [number, number], radiusM: 850 },
  { name: 'Bambang',   center: [120.9103, 14.7847] as [number, number], radiusM: 900 },
];

const INDUSTRIAL_OVERLAYS = [
  { name: 'Bundukan (Fireworks)',   center: [120.9450, 14.7950] as [number, number], radiusM: 700 },
  { name: 'Biñang 1st (Fireworks)', center: [120.9200, 14.7650] as [number, number], radiusM: 700 },
];

interface Props {
  heatmap: HeatmapPoint[];
  floodZones: RiskArea[];
  riskAreas: RiskArea[];
}

export function RiskHeatmapView({ heatmap, floodZones, riskAreas }: Props): JSX.Element {
  const styleUrl = useMapStyle();
  const [mapKey, setMapKey] = useState(0);
  const [tileError, setTileError] = useState(false);

  const maxCount = Math.max(0, ...heatmap.map((h) => h.count));

  const plotPoints = useMemo(() =>
    heatmap
      .filter((h) => h.barangay != null)
      .map((h) => {
        const key = h.barangay!.toUpperCase();
        const coords = BARANGAY_COORDS[key] ?? null;
        return { ...h, coords };
      })
      .filter((p): p is typeof p & { coords: [number, number] } => p.coords !== null),
  [heatmap]);

  // Heatmap GeoJSON — one point per barangay, weighted by incident count.
  const heatmapGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: plotPoints.map((p) => ({
      type: 'Feature' as const,
      properties: { count: p.count, barangay: p.barangay },
      geometry: { type: 'Point' as const, coordinates: p.coords },
    })),
  }), [plotPoints]);

  // Flood-zone advisory circles (MDRRMO, static).
  const floodCirclesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: FLOOD_OVERLAYS.map((f) => ({
      type: 'Feature' as const,
      properties: { name: f.name },
      geometry: { type: 'Polygon' as const, coordinates: [circlePolygon(f.center[0], f.center[1], f.radiusM)] },
    })),
  }), []);

  // Industrial / fireworks zone circles (static).
  const industrialCirclesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: INDUSTRIAL_OVERLAYS.map((f) => ({
      type: 'Feature' as const,
      properties: { name: f.name },
      geometry: { type: 'Polygon' as const, coordinates: [circlePolygon(f.center[0], f.center[1], f.radiusM)] },
    })),
  }), []);

  // Backend-sourced flood risk areas (barangay centroid fallback).
  const backendFloodGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: floodZones
      .map((fz) => {
        if (!fz.barangay) return null;
        const coords = BARANGAY_COORDS[fz.barangay.toUpperCase()] ?? null;
        if (!coords) return null;
        return {
          type: 'Feature' as const,
          properties: { name: fz.name, risk_level: fz.risk_level },
          geometry: { type: 'Polygon' as const, coordinates: [circlePolygon(coords[0], coords[1], 600)] },
        };
      })
      .filter(Boolean),
  }), [floodZones]);

  // Other risk areas (non-flood).
  const riskAreaGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: riskAreas
      .filter((ra) => ra.barangay)
      .map((ra) => {
        const coords = BARANGAY_COORDS[ra.barangay!.toUpperCase()] ?? null;
        if (!coords) return null;
        return {
          type: 'Feature' as const,
          properties: { name: ra.name, risk_type: ra.risk_type, risk_level: ra.risk_level },
          geometry: { type: 'Point' as const, coordinates: coords },
        };
      })
      .filter(Boolean),
  }), [riskAreas]);

  const safeMax = Math.max(maxCount, 1);

  return (
    <div className="relative h-full w-full" style={{ borderRadius: '1rem', overflow: 'hidden' }}>
      <Map
        key={mapKey}
        mapStyle={styleUrl}
        styleDiffing={false}
        initialViewState={{
          longitude: BOCAUE_CENTER[0],
          latitude: BOCAUE_CENTER[1],
          zoom: BOCAUE_DEFAULT_ZOOM,
        }}
        maxBounds={BOCAUE_BOUNDS}
        minZoom={BOCAUE_MIN_ZOOM}
        maxZoom={BOCAUE_MAX_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollZoom
        onError={() => setTileError(true)}
        onLoad={() => setTileError(false)}
      >
        <Source id="bocaue-outside-mask" type="geojson" data={BOCAUE_OUTSIDE_MASK}>
          <Layer id="bocaue-outside-opacity" type="fill" paint={{ 'fill-color': '#0F172A', 'fill-opacity': 0.62 }} />
        </Source>

        {/* Municipal Bocaue boundary; replace the asset only if a higher-authority file is provided. */}
        <Source id="bocaue-boundary" type="geojson" data={BOCAUE_BOUNDARY_SOURCE}>
          <Layer id="bocaue-outline" type="line" paint={{ 'line-color': '#0080ff', 'line-width': 3 }} />
        </Source>

        {/* Flood-prone zone fills (MDRRMO advisory) */}
        <Source id="flood-circles" type="geojson" data={floodCirclesGeoJSON}>
          <Layer id="flood-fill"    type="fill" paint={{ 'fill-color': '#3B82F6', 'fill-opacity': 0.10 }} />
          <Layer id="flood-outline" type="line" paint={{ 'line-color': '#3B82F6', 'line-width': 1.5, 'line-opacity': 0.7 }} />
        </Source>

        {/* Industrial / fireworks zone fills */}
        <Source id="industrial-circles" type="geojson" data={industrialCirclesGeoJSON}>
          <Layer id="industrial-fill"    type="fill" paint={{ 'fill-color': '#DC2626', 'fill-opacity': 0.08 }} />
          <Layer id="industrial-outline" type="line" paint={{ 'line-color': '#DC2626', 'line-width': 1.5, 'line-opacity': 0.6, 'line-dasharray': [6, 4] }} />
        </Source>

        {/* Backend flood risk areas */}
        <Source id="backend-flood" type="geojson" data={backendFloodGeoJSON as object}>
          <Layer id="backend-flood-fill"    type="fill" paint={{ 'fill-color': '#0891B2', 'fill-opacity': 0.12 }} />
          <Layer id="backend-flood-outline" type="line" paint={{ 'line-color': '#0891B2', 'line-width': 1, 'line-opacity': 0.6, 'line-dasharray': [4, 3] }} />
        </Source>

        {/* WebGL heatmap layer — incident density */}
        <Source id="heatmap-data" type="geojson" data={heatmapGeoJSON}>
          <Layer
            id="heatmap-layer"
            type="heatmap"
            paint={{
              'heatmap-weight': ['interpolate', ['linear'], ['get', 'count'], 0, 0, safeMax, 1],
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 15, 1.5],
              'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(0,0,0,0)',
                0.33, '#0D6053',
                0.66, '#D97706',
                1, '#DC2626',
              ],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 20, 14, 50],
              'heatmap-opacity': 0.75,
            } as object}
          />
          {/* Per-barangay density circles on top of the heatmap */}
          <Layer
            id="barangay-circles"
            type="circle"
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 0, 8, safeMax, 22],
              'circle-color': [
                'interpolate', ['linear'], ['get', 'count'],
                0, '#0D6053',
                Math.ceil(safeMax / 2), '#D97706',
                safeMax, '#DC2626',
              ],
              'circle-opacity': 0.7,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#ffffff',
            } as object}
          />
          <Layer
            id="barangay-labels"
            type="symbol"
            minzoom={13}
            layout={{ 'text-field': ['get', 'barangay'], 'text-size': 11, 'text-offset': [0, 1.8] } as object}
            paint={{ 'text-color': '#1C2B3A', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } as object}
          />
        </Source>

        {/* Other risk area dots */}
        <Source id="risk-areas" type="geojson" data={riskAreaGeoJSON as object}>
          <Layer
            id="risk-area-dots"
            type="circle"
            paint={{ 'circle-radius': 6, 'circle-color': '#D97706', 'circle-opacity': 0.7, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' }}
          />
        </Source>
      </Map>

      {tileError && <MapErrorOverlay onRetry={() => { setTileError(false); setMapKey((k) => k + 1); }} />}
    </div>
  );
}
