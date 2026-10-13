'use client';

import { type JSX } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, Tooltip } from 'react-leaflet';
import { isCoordinateInBocaue } from '@agap/shared';
import 'leaflet/dist/leaflet.css';
import type { HeatmapPoint, RiskArea } from '@/features/risk/api';
import { BOCAUE_CENTER, BOCAUE_MAP_OPTIONS, BocaueMapBoundary } from '@/components/map/BocaueMapBoundary';

// Approximate barangay centroids for Bocaue (used for heatmap placement).
// Coordinates are advisory — not authoritative boundary data.
const BARANGAY_COORDS: Record<string, [number, number]> = {
  LOLOMBOY:   [14.7236, 120.9436],
  BUNLO:      [14.7319, 120.9253],
  IGULOT:     [14.7097, 120.9500],
  BAMBANG:    [14.7847, 120.9103],
  BUNDUKAN:   [14.7950, 120.9450],
  'BIÑANG 1ST': [14.7650, 120.9200],
  'BIÑANG 2ND': [14.7580, 120.9180],
  BOCAUE:     [14.7969, 120.9268],
  BATIA:      [14.8100, 120.9300],
  BOLACAN:    [14.8200, 120.9100],
  'DULONG BAYAN 1ST': [14.8050, 120.9350],
  'DULONG BAYAN 2ND': [14.8020, 120.9380],
  MALHACAN:   [14.8150, 120.9200],
  'MEYTO 1ST':  [14.7750, 120.9350],
  'MEYTO 2ND':  [14.7700, 120.9300],
  PUGAD:      [14.7850, 120.9450],
  'SANTA CRUZ': [14.7900, 120.9350],
  'SAN JUAN':   [14.7600, 120.9400],
  TURO:       [14.7450, 120.9300],
  WAKAS:      [14.8300, 120.9200],
};

// Flood-prone overlays — same source as IncidentMapView.
const FLOOD_OVERLAYS = [
  { name: 'Lolomboy',  center: [14.7236, 120.9436] as [number, number], radiusM: 900 },
  { name: 'Bunlo',     center: [14.7319, 120.9253] as [number, number], radiusM: 800 },
  { name: 'Igulot',    center: [14.7097, 120.9500] as [number, number], radiusM: 850 },
  { name: 'Bambang',   center: [14.7847, 120.9103] as [number, number], radiusM: 900 },
];

// Fireworks industry zones
const INDUSTRIAL_OVERLAYS = [
  { name: 'Bundukan (Fireworks)',  center: [14.7950, 120.9450] as [number, number], radiusM: 700 },
  { name: 'Biñang 1st (Fireworks)', center: [14.7650, 120.9200] as [number, number], radiusM: 700 },
];

function heatColor(count: number, max: number): string {
  if (max === 0) return '#0D6053';
  const t = Math.min(count / max, 1);
  if (t < 0.33) return '#0D6053';   // low  — agap-green
  if (t < 0.66) return '#D97706';   // mid  — amber
  return '#DC2626';                   // high — red
}

function heatRadius(count: number, max: number): number {
  if (max === 0) return 300;
  const t = Math.min(count / max, 1);
  return 300 + t * 800; // 300 m – 1100 m
}

interface Props {
  heatmap: HeatmapPoint[];
  floodZones: RiskArea[];
  riskAreas: RiskArea[];
}

export function RiskHeatmapView({ heatmap, floodZones, riskAreas }: Props): JSX.Element {
  const max = Math.max(0, ...heatmap.map((h) => h.count));

  // Merge known barangay coords with API heatmap data
  const plotPoints = heatmap.filter((h) => h.barangay != null).map((h) => {
    const key = h.barangay!.toUpperCase();
    const coords = BARANGAY_COORDS[key] ?? null;
    return { ...h, coords };
  }).filter((p): p is typeof p & { coords: [number, number] } =>
    p.coords !== null && isCoordinateInBocaue(p.coords[0], p.coords[1]),
  );

  // Also plot flood zones that have PostGIS geometry (use barangay centroid fallback)
  const floodZonePoints = floodZones.map((fz) => {
    if (!fz.barangay) return null;
    const key = fz.barangay.toUpperCase();
    const coords = BARANGAY_COORDS[key] ?? null;
    return coords && isCoordinateInBocaue(coords[0], coords[1]) ? { ...fz, coords } : null;
  }).filter(Boolean) as Array<RiskArea & { coords: [number, number] }>;

  return (
    <MapContainer
      center={BOCAUE_CENTER}
      zoom={13}
      {...BOCAUE_MAP_OPTIONS}
      style={{ height: '100%', width: '100%', borderRadius: '1rem' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Bocaue boundary: <a href="https://www.geoboundaries.org/">geoBoundaries</a> (<a href="https://creativecommons.org/licenses/by/3.0/igo/">CC BY 3.0 IGO</a>)'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <BocaueMapBoundary />

      {/* Flood-prone barangay overlays (advisory) */}
      {FLOOD_OVERLAYS.filter(({ center: [lat, lng] }) => isCoordinateInBocaue(lat, lng)).map((fo) => (
        <Circle
          key={fo.name}
          center={fo.center}
          radius={fo.radiusM}
          pathOptions={{ color: '#3B82F6', fillColor: '#3B82F6', fillOpacity: 0.10, weight: 1.5 }}
        >
          <Tooltip sticky>{fo.name} — flood-prone</Tooltip>
        </Circle>
      ))}

      {/* Industrial / fireworks zones */}
      {INDUSTRIAL_OVERLAYS.filter(({ center: [lat, lng] }) => isCoordinateInBocaue(lat, lng)).map((io) => (
        <Circle
          key={io.name}
          center={io.center}
          radius={io.radiusM}
          pathOptions={{ color: '#DC2626', fillColor: '#DC2626', fillOpacity: 0.08, weight: 1.5, dashArray: '6 4' }}
        >
          <Tooltip sticky>{io.name}</Tooltip>
        </Circle>
      ))}

      {/* Flood zones from backend risk_areas */}
      {floodZonePoints.map((fz) => (
        <Circle
          key={fz.id}
          center={fz.coords}
          radius={600}
          pathOptions={{ color: '#0891B2', fillColor: '#0891B2', fillOpacity: 0.12, weight: 1, dashArray: '4 3' }}
        >
          <Popup>
            <strong>{fz.name}</strong>
            <br />
            Risk level: {fz.risk_level}
            {fz.flood_threshold_meters && (
              <><br />Flood threshold: {fz.flood_threshold_meters} m</>
            )}
          </Popup>
        </Circle>
      ))}

      {/* Incident density circles (heatmap) */}
      {plotPoints.map((p) => (
        <CircleMarker
          key={p.barangay}
          center={p.coords}
          radius={Math.max(8, Math.round(12 * Math.min(p.count / Math.max(max, 1), 1) + 8))}
          pathOptions={{
            color: heatColor(p.count, max),
            fillColor: heatColor(p.count, max),
            fillOpacity: 0.55,
            weight: 1.5,
          }}
        >
          <Tooltip>
            <strong>{p.barangay}</strong>
            <br />
            {p.count} incident{p.count === 1 ? '' : 's'}
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Risk areas from API without coordinate match */}
      {riskAreas
        .filter((ra) => ra.barangay)
        .map((ra) => {
          const key = ra.barangay!.toUpperCase();
          const coords = BARANGAY_COORDS[key];
          if (!coords || !isCoordinateInBocaue(coords[0], coords[1])) return null;
          return (
            <CircleMarker
              key={ra.id}
              center={coords}
              radius={6}
              pathOptions={{ color: '#D97706', fillColor: '#D97706', fillOpacity: 0.7, weight: 1 }}
            >
              <Popup>
                <strong>{ra.name}</strong>
                <br />
                {ra.risk_type} · {ra.risk_level}
                {ra.description && <><br />{ra.description}</>}
              </Popup>
            </CircleMarker>
          );
        })}
    </MapContainer>
  );
}
