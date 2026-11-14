'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import '@/lib/maplibre-setup';
import Map, { Layer, Source, type MapLayerMouseEvent, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStyle } from '@/features/map/hooks';
import {
  BOCAUE_BOUNDARY_SOURCE, BOCAUE_BOUNDS, BOCAUE_CENTER, BOCAUE_DEFAULT_ZOOM, BOCAUE_MAX_ZOOM, BOCAUE_MIN_ZOOM,
  BOCAUE_OUTSIDE_MASK,
} from '@/lib/bocaue-geo';
import { MapErrorOverlay } from '@/components/map/MapErrorOverlay';
import { resolveMissingStyleImages } from '@/components/map/missing-style-images';
import type { RiskArea, RiskAreaProposal } from '@/features/risk/api';
import { boundaryBounds } from '@/features/risk/area-geo';
import { PROPOSAL_COLOR, RISK_LEVEL_COLORS } from './risk-colors';

const AREA_FILL = 'ra-area-fill';
const PROPOSAL_FILL = 'ra-proposal-fill';

interface RiskAreasMapProps {
  areas: RiskArea[];
  proposals: RiskAreaProposal[];
  /** The area or proposal to highlight and zoom to. */
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * MOD-51 Risk areas tab: every area as it is drawn on the Risk Map (pin circle, hotspot
 * outline or whole barangay, coloured by level; inactive ones faint), and the pending
 * proposals as dashed amber outlines. Clicking a shape selects its card.
 */
export default function RiskAreasMap({ areas, proposals, selectedId, onSelect }: RiskAreasMapProps): JSX.Element {
  const styleUrl = useMapStyle();
  const mapRef = useRef<MapRef | null>(null);
  const attachMap = useCallback((map: MapRef | null) => {
    mapRef.current = map;
    resolveMissingStyleImages(map);
  }, []);
  const [mapKey, setMapKey] = useState(0);
  const [tileError, setTileError] = useState(false);
  const [hovering, setHovering] = useState(false);

  const areaGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: areas.flatMap((a) =>
      a.boundary
        ? [{
            type: 'Feature' as const,
            properties: { id: a.id, level: a.risk_level, active: a.is_active, selected: a.id === selectedId },
            geometry: a.boundary,
          }]
        : [],
    ),
  }), [areas, selectedId]);

  const proposalGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: proposals.flatMap((p) =>
      p.boundary
        ? [{ type: 'Feature' as const, properties: { id: p.id, selected: p.id === selectedId }, geometry: p.boundary }]
        : [],
    ),
  }), [proposals, selectedId]);

  // Zoom to the selected shape (a card's "Show on map", or a click on the map).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const boundary = areas.find((a) => a.id === selectedId)?.boundary ?? proposals.find((p) => p.id === selectedId)?.boundary;
    if (!boundary) return;
    map.fitBounds(boundaryBounds(boundary), { padding: 48, maxZoom: 16, duration: 600 });
  }, [selectedId, areas, proposals]);

  const levelColor = ['match', ['get', 'level'], ...Object.entries(RISK_LEVEL_COLORS).flat(), '#8795A3'];

  function onClick(e: MapLayerMouseEvent): void {
    const id = e.features?.[0]?.properties?.id;
    if (typeof id === 'string') onSelect(id);
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-[rgba(168,181,193,0.20)]">
      <Map
        key={mapKey}
        ref={attachMap}
        mapStyle={styleUrl}
        styleDiffing={false}
        initialViewState={{ longitude: BOCAUE_CENTER[0], latitude: BOCAUE_CENTER[1], zoom: BOCAUE_DEFAULT_ZOOM }}
        maxBounds={BOCAUE_BOUNDS}
        minZoom={BOCAUE_MIN_ZOOM}
        maxZoom={BOCAUE_MAX_ZOOM}
        style={{ height: '100%', width: '100%' }}
        interactiveLayerIds={[AREA_FILL, PROPOSAL_FILL]}
        onClick={onClick}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        cursor={hovering ? 'pointer' : 'grab'}
        onError={() => setTileError(true)}
        onLoad={() => setTileError(false)}
      >
        <Source id="ra-outside-mask" type="geojson" data={BOCAUE_OUTSIDE_MASK}>
          <Layer id="ra-outside-opacity" type="fill" paint={{ 'fill-color': '#0F172A', 'fill-opacity': 0.55 }} />
        </Source>
        <Source id="ra-bocaue-boundary" type="geojson" data={BOCAUE_BOUNDARY_SOURCE}>
          <Layer id="ra-bocaue-outline" type="line" paint={{ 'line-color': '#0080ff', 'line-width': 2 }} />
        </Source>

        <Source id="ra-areas" type="geojson" data={areaGeoJSON as object}>
          <Layer
            id={AREA_FILL}
            type="fill"
            paint={{
              'fill-color': levelColor,
              'fill-opacity': ['case', ['get', 'selected'], 0.32, ['get', 'active'], 0.16, 0.05],
            } as object}
          />
          <Layer
            id="ra-area-line"
            type="line"
            paint={{
              'line-color': levelColor,
              'line-width': ['case', ['get', 'selected'], 3.5, 2],
              'line-opacity': ['case', ['get', 'active'], 1, 0.35],
            } as object}
          />
        </Source>

        <Source id="ra-proposals" type="geojson" data={proposalGeoJSON as object}>
          <Layer
            id={PROPOSAL_FILL}
            type="fill"
            paint={{ 'fill-color': PROPOSAL_COLOR, 'fill-opacity': ['case', ['get', 'selected'], 0.25, 0.08] } as object}
          />
          <Layer
            id="ra-proposal-line"
            type="line"
            paint={{
              'line-color': PROPOSAL_COLOR,
              'line-width': ['case', ['get', 'selected'], 3, 2],
              'line-dasharray': [3, 2],
            } as object}
          />
        </Source>
      </Map>

      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-1.5 rounded-lg bg-white/90 px-2 py-1 text-[10px] text-agap-textMid shadow-card">
        {Object.entries(RISK_LEVEL_COLORS).map(([level, color]) => (
          <span key={level} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            {level.charAt(0) + level.slice(1).toLowerCase()}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="h-2 w-3 border-t-2 border-dashed" style={{ borderColor: PROPOSAL_COLOR }} />
          Proposed
        </span>
      </div>
      {tileError && <MapErrorOverlay onRetry={() => { setTileError(false); setMapKey((k) => k + 1); }} />}
    </div>
  );
}
