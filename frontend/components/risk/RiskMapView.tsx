'use client';

import { useMemo, useState, type JSX } from 'react';
import '@/lib/maplibre-setup';
import Map, { Source, Layer, Popup, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStyle } from '@/features/map/hooks';
import {
  BOCAUE_BOUNDS, BOCAUE_CENTER, BOCAUE_DEFAULT_ZOOM, BOCAUE_MIN_ZOOM, BOCAUE_MAX_ZOOM,
  BOCAUE_BOUNDARY_SOURCE, BOCAUE_OUTSIDE_MASK, FLOOD_PRONE_BARANGAYS, FIREWORKS_BARANGAYS,
} from '@/lib/bocaue-geo';
import { MapErrorOverlay } from '@/components/map/MapErrorOverlay';
import { resolveMissingStyleImages } from '@/components/map/missing-style-images';
import { titleCase } from '@/lib/incident-format';
import type { AreaBoundary, RiskArea, RiskMap } from '@/features/risk/api';
import { FLOOD_SHADES, RISK_CATEGORY_COLORS } from '@/features/risk/categories';

export const RISK_LEVEL_COLORS: Record<string, string> = {
  LOW: '#16A34A',
  MODERATE: '#D97706',
  HIGH: '#DC2626',
  CRITICAL: '#9B1C1C',
};

const POINT_LAYER = 'risk-points';
const AREA_LAYER = 'risk-area-fill';
const BARANGAY_LAYER = 'barangay-flood-fill';

type Selection =
  | { kind: 'point'; lng: number; lat: number; category: string; count: number; barangay: string | null; last: string }
  | { kind: 'area'; lng: number; lat: number; name: string; riskType: string; level: string }
  | { kind: 'barangay'; lng: number; lat: number; name: string; flood: number };

interface Props {
  map: RiskMap;
  areas: RiskArea[];
  /** Point categories to show. */
  categories: ReadonlySet<string>;
}

/**
 * MOD-51 Risk Map. Floods shade the barangay (a flood covers an area); every other
 * incident is a dot where it happened, sized by how many reports came from that spot.
 * All outlines are the real barangay boundaries from the backend, not approximations.
 */
export function RiskMapView({ map, areas, categories }: Props): JSX.Element {
  const styleUrl = useMapStyle();
  const [mapKey, setMapKey] = useState(0);
  const [tileError, setTileError] = useState(false);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [hovering, setHovering] = useState(false);

  const maxFlood = Math.max(0, ...map.barangays.map((b) => b.flood_incidents));

  const barangayGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: map.barangays.map((b) => ({
      type: 'Feature' as const,
      properties: {
        name: b.name,
        flood: b.flood_incidents,
        floodProne: FLOOD_PRONE_BARANGAYS.includes(b.name),
        fireworks: FIREWORKS_BARANGAYS.includes(b.name),
      },
      geometry: b.boundary,
    })),
  }), [map.barangays]);

  // An approved hotspot has its own outline; any other area covers its whole barangay.
  const areaGeoJSON = useMemo(() => {
    const byName = new globalThis.Map(map.barangays.map((b) => [b.name, b.boundary]));
    return {
      type: 'FeatureCollection' as const,
      features: areas.flatMap((a) => {
        const geometry: AreaBoundary | undefined = a.boundary ?? (a.barangay ? byName.get(a.barangay) : undefined);
        if (!geometry) return [];
        return [{
          type: 'Feature' as const,
          properties: { name: a.name, riskType: a.risk_type, level: a.risk_level },
          geometry,
        }];
      }),
    };
  }, [areas, map.barangays]);

  const pointGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: map.points
      .filter((p) => categories.has(p.category))
      .map((p) => ({
        type: 'Feature' as const,
        properties: {
          category: p.category,
          count: p.incident_count,
          barangay: p.barangay ?? '',
          last: p.last_reported_at,
        },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      })),
  }), [map.points, categories]);

  // Interpolate stops must rise strictly, whatever the largest count is.
  const midFlood = Math.max(2, Math.ceil(maxFlood / 2));
  const topFlood = Math.max(midFlood + 1, maxFlood);

  const categoryColor = [
    'match', ['get', 'category'],
    ...Object.entries(RISK_CATEGORY_COLORS).flat(),
    RISK_CATEGORY_COLORS.OTHER,
  ];
  const levelColor = [
    'match', ['get', 'level'],
    ...Object.entries(RISK_LEVEL_COLORS).flat(),
    '#8795A3',
  ];

  function onClick(e: MapLayerMouseEvent): void {
    const f = e.features?.[0];
    if (!f) { setSelected(null); return; }
    const p = f.properties as Record<string, unknown>;
    const { lng, lat } = e.lngLat;
    if (f.layer.id === POINT_LAYER) {
      const [plng, plat] = (f.geometry as { coordinates: [number, number] }).coordinates;
      setSelected({
        kind: 'point', lng: plng, lat: plat,
        category: String(p.category), count: Number(p.count),
        barangay: p.barangay ? String(p.barangay) : null, last: String(p.last),
      });
    } else if (f.layer.id === AREA_LAYER) {
      setSelected({ kind: 'area', lng, lat, name: String(p.name), riskType: String(p.riskType), level: String(p.level) });
    } else {
      setSelected({ kind: 'barangay', lng, lat, name: String(p.name), flood: Number(p.flood) });
    }
  }

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
        ref={resolveMissingStyleImages}
        onError={() => setTileError(true)}
        onLoad={() => setTileError(false)}
        interactiveLayerIds={[POINT_LAYER, AREA_LAYER, BARANGAY_LAYER]}
        onClick={onClick}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        cursor={hovering ? 'pointer' : 'grab'}
      >
        <Source id="bocaue-outside-mask" type="geojson" data={BOCAUE_OUTSIDE_MASK}>
          <Layer id="bocaue-outside-opacity" type="fill" paint={{ 'fill-color': '#0F172A', 'fill-opacity': 0.62 }} />
        </Source>

        <Source id="bocaue-boundary" type="geojson" data={BOCAUE_BOUNDARY_SOURCE}>
          <Layer id="bocaue-outline" type="line" paint={{ 'line-color': '#0080ff', 'line-width': 3 }} />
        </Source>

        {/* Barangays: flood reports shade the whole barangay; advisory zones are dashed outlines. */}
        <Source id="barangays" type="geojson" data={barangayGeoJSON as object}>
          <Layer
            id={BARANGAY_LAYER}
            type="fill"
            paint={{
              'fill-color': [
                'interpolate', ['linear'], ['get', 'flood'],
                1, FLOOD_SHADES[0], midFlood, FLOOD_SHADES[1], topFlood, FLOOD_SHADES[2],
              ],
              // Near-invisible when there is no flood report, so the barangay is still clickable.
              'fill-opacity': ['case', ['>', ['get', 'flood'], 0], 0.5, 0.001],
            } as object}
          />
          <Layer id="barangay-outline" type="line" paint={{ 'line-color': '#64748B', 'line-width': 0.8, 'line-opacity': 0.6 }} />
          <Layer
            id="flood-prone-outline"
            type="line"
            filter={['==', ['get', 'floodProne'], true] as never}
            paint={{ 'line-color': '#2563EB', 'line-width': 2, 'line-dasharray': [3, 2] }}
          />
          <Layer
            id="fireworks-outline"
            type="line"
            filter={['==', ['get', 'fireworks'], true] as never}
            paint={{ 'line-color': '#DC2626', 'line-width': 2, 'line-dasharray': [6, 3] }}
          />
          <Layer
            id="barangay-labels"
            type="symbol"
            minzoom={13}
            layout={{
              'text-field': [
                'case', ['>', ['get', 'flood'], 0],
                ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'flood']], ' flood'],
                ['get', 'name'],
              ],
              'text-size': 11,
            } as object}
            paint={{ 'text-color': '#1C2B3A', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } as object}
          />
        </Source>

        {/* Registered risk areas, coloured by level. */}
        <Source id="risk-areas" type="geojson" data={areaGeoJSON as object}>
          <Layer id={AREA_LAYER} type="fill" paint={{ 'fill-color': levelColor, 'fill-opacity': 0.12 } as object} />
          <Layer id="risk-area-outline" type="line" paint={{ 'line-color': levelColor, 'line-width': 2 } as object} />
        </Source>

        {/* Incidents where they happened. */}
        <Source id="risk-points" type="geojson" data={pointGeoJSON as object}>
          <Layer
            id={POINT_LAYER}
            type="circle"
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 6, 5, 10, 20, 16],
              'circle-color': categoryColor,
              'circle-opacity': 0.85,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#ffffff',
            } as object}
          />
          <Layer
            id="risk-point-counts"
            type="symbol"
            filter={['>', ['get', 'count'], 1] as never}
            layout={{ 'text-field': ['to-string', ['get', 'count']], 'text-size': 10, 'text-allow-overlap': true } as object}
            paint={{ 'text-color': '#ffffff' }}
          />
        </Source>

        {selected && (
          <Popup
            longitude={selected.lng}
            latitude={selected.lat}
            onClose={() => setSelected(null)}
            closeOnClick={false}
            offset={12}
          >
            <SelectionDetails selection={selected} periodDays={map.period_days} />
          </Popup>
        )}
      </Map>

      {tileError && <MapErrorOverlay onRetry={() => { setTileError(false); setMapKey((k) => k + 1); }} />}
    </div>
  );
}

function SelectionDetails({ selection: s, periodDays }: { selection: Selection; periodDays: number }): JSX.Element {
  if (s.kind === 'point') {
    return (
      <div className="text-xs">
        <div className="font-bold text-[#1C2B3A]">{titleCase(s.category)}</div>
        <div className="text-[#40536D]">
          {s.count} {s.count === 1 ? 'report' : 'reports'} at this spot · last {days(periodDays)}
        </div>
        <div className="text-[#8795A3]">{s.barangay ?? 'Outside barangay boundaries'}</div>
        <div className="text-[#8795A3]">Latest {new Date(s.last).toLocaleDateString()}</div>
      </div>
    );
  }
  if (s.kind === 'area') {
    return (
      <div className="text-xs">
        <div className="font-bold text-[#1C2B3A]">{s.name}</div>
        <div className="text-[#40536D]">{titleCase(s.riskType)} risk area · {s.level}</div>
      </div>
    );
  }
  return (
    <div className="text-xs">
      <div className="font-bold text-[#1C2B3A]">{s.name}</div>
      <div className="text-[#40536D]">
        {s.flood === 0 ? 'No flood reports' : `${s.flood} flood ${s.flood === 1 ? 'report' : 'reports'}`} · last {days(periodDays)}
      </div>
    </div>
  );
}

const days = (n: number): string => (n === 365 ? '12 months' : `${n} days`);
