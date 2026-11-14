'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import '@/lib/maplibre-setup';
import Map, {
  Layer, Marker, NavigationControl, Source,
  type MapLayerMouseEvent, type MapRef, type MarkerDragEvent, type ViewStateChangeEvent,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Maximize2, Minimize2 } from 'lucide-react';
import { isCoordinateInBocaue } from '@agap/shared';
import { useMapStyle, useSatelliteStyle } from '@/features/map/hooks';
import {
  BOCAUE_BOUNDARY_SOURCE, BOCAUE_BOUNDS, BOCAUE_CENTER, BOCAUE_DEFAULT_ZOOM, BOCAUE_MAX_ZOOM, BOCAUE_MIN_ZOOM,
  BOCAUE_OUTSIDE_MASK,
} from '@/lib/bocaue-geo';
import { MapErrorOverlay } from '@/components/map/MapErrorOverlay';
import { resolveMissingStyleImages } from '@/components/map/missing-style-images';
import { titleCase } from '@/lib/incident-format';
import { cn } from '@/lib/utils';
import { circlePolygon } from '@/features/risk/area-geo';
import type { RiskMapBarangay, RiskMapPoint } from '@/features/risk/api';
import { FLOOD_SHADES, riskCategoryColor } from '@/features/risk/categories';
import { RISK_LEVEL_COLORS } from './risk-colors';

/** Where to move the map: a point (zoomed in) or a box. `seq` changes on every request. */
export type PinMapFocus =
  | { seq: number; kind: 'point'; lat: number; lng: number }
  | { seq: number; kind: 'bounds'; bounds: [[number, number], [number, number]] };

interface RiskAreaPinMapProps {
  pin: { lat: number; lng: number } | null;
  radiusM: number;
  level: string;
  /** The area's type: its incidents are drawn as dots (floods shade their barangay). */
  riskType: string;
  /** Risk Map data (last 90 days); empty while loading or if it failed. */
  barangays: RiskMapBarangay[];
  points: RiskMapPoint[];
  /** The Risk Map data has loaded: only then does the legend say what is (or isn't) there. */
  dataReady: boolean;
  focus: PinMapFocus | null;
  /** The barangay chosen in "Go to barangay" ('' = none), outlined. */
  highlightBarangay: string;
  expanded: boolean;
  onToggleExpand: () => void;
  /** A point inside Bocaue was picked (click, dot or drag). */
  onPick: (lat: number, lng: number) => void;
  /** A point outside Bocaue was clicked; it is not used. */
  onOutside: () => void;
}

const POINT_LAYER = 'pin-incident-points';
/** Zoom for a searched place, a pasted point or a quick pick: street level. */
const FOCUS_ZOOM = 16.5;

/**
 * MOD-51 add/edit form map: click the map, click an incident dot (the pin snaps to it) or
 * drag the pin; the circle shows the radius. Barangay lines and names, zoom buttons, a
 * Streets / Satellite toggle (when MAP_SATELLITE_STYLE_URL is set) and an Expand button
 * make the place easy to find. Locked to Bocaue like the Risk Map, and a point outside
 * the municipality is refused (the server checks the same polygon).
 */
export default function RiskAreaPinMap({
  pin, radiusM, level, riskType, barangays, points, dataReady, focus, highlightBarangay, expanded, onToggleExpand, onPick, onOutside,
}: RiskAreaPinMapProps): JSX.Element {
  const streetsUrl = useMapStyle();
  const satelliteUrl = useSatelliteStyle();
  const [satellite, setSatellite] = useState(false);
  const styleUrl = satellite && satelliteUrl ? satelliteUrl : streetsUrl;

  const mapRef = useRef<MapRef | null>(null);
  const attachMap = useCallback((map: MapRef | null) => {
    mapRef.current = map;
    resolveMissingStyleImages(map);
  }, []);
  // Switching style remounts the map (a fresh style keeps every layer below); the last
  // view is kept so the switch doesn't jump.
  const view = useRef({
    longitude: pin?.lng ?? BOCAUE_CENTER[0],
    latitude: pin?.lat ?? BOCAUE_CENTER[1],
    zoom: pin ? 15 : BOCAUE_DEFAULT_ZOOM,
  });
  const [mapKey, setMapKey] = useState(0);
  const [tileError, setTileError] = useState(false);
  const [overDot, setOverDot] = useState(false);

  // An existing pin off-screen (editing, or dragged near the edge): bring it into view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pin) return;
    if (!map.getBounds().contains([pin.lng, pin.lat])) map.easeTo({ center: [pin.lng, pin.lat], duration: 500 });
  }, [pin]);

  // A search result, pasted point, quick pick or barangay. Declared after the effect above,
  // so when both run in one render this zooming move is the one that stays.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if (focus.kind === 'point') {
      map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), FOCUS_ZOOM), duration: 700 });
    } else {
      map.fitBounds(focus.bounds, { padding: 32, maxZoom: 16, duration: 700 });
    }
  }, [focus]);

  // The map changes size when expanded: let it redraw at the new size.
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.resize(), 50);
    return () => clearTimeout(t);
  }, [expanded]);

  const circle = useMemo(
    () =>
      pin
        ? { type: 'Feature' as const, properties: {}, geometry: circlePolygon(pin.lat, pin.lng, radiusM) }
        : { type: 'FeatureCollection' as const, features: [] },
    [pin, radiusM],
  );
  const color = RISK_LEVEL_COLORS[level] ?? '#D97706';
  const isFlood = riskType === 'FLOOD';

  const barangayGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: barangays.map((b) => ({
      type: 'Feature' as const,
      properties: { name: b.name, flood: b.flood_incidents },
      geometry: b.boundary,
    })),
  }), [barangays]);

  const typePoints = useMemo(() => points.filter((p) => p.category === riskType), [points, riskType]);
  const pointGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: typePoints.map((p) => ({
      type: 'Feature' as const,
      properties: { count: p.incident_count },
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
    })),
  }), [typePoints]);

  const maxFlood = Math.max(0, ...barangays.map((b) => b.flood_incidents));
  // Interpolate stops must rise strictly, whatever the largest count is.
  const midFlood = Math.max(2, Math.ceil(maxFlood / 2));
  const topFlood = Math.max(midFlood + 1, maxFlood);
  const floodCount = barangays.reduce((n, b) => n + b.flood_incidents, 0) + (isFlood ? typePoints.reduce((n, p) => n + p.incident_count, 0) : 0);

  // Light lines and labels read on satellite; dark ones on streets.
  const lineColor = satellite ? '#FFFFFF' : '#64748B';
  const labelColor = satellite ? '#FFFFFF' : '#1C2B3A';
  const haloColor = satellite ? 'rgba(15,23,42,0.85)' : '#FFFFFF';

  function pick(lat: number, lng: number): void {
    if (isCoordinateInBocaue(lat, lng)) onPick(lat, lng);
    else onOutside();
  }

  function onClick(e: MapLayerMouseEvent): void {
    const dot = e.features?.find((f) => f.layer.id === POINT_LAYER);
    if (dot) {
      const [lng, lat] = (dot.geometry as { coordinates: [number, number] }).coordinates;
      pick(lat, lng);
    } else {
      pick(e.lngLat.lat, e.lngLat.lng);
    }
  }

  const typeWord = titleCase(riskType).toLowerCase();
  const legend = isFlood
    ? floodCount > 0
      ? 'Blue barangays: flood reports, last 90 days.'
      : 'No flood reports in the last 90 days.'
    : typePoints.length > 0
      ? `Dots: ${typeWord} reports, last 90 days. Click one to pin it.`
      : `No ${typeWord} reports in the last 90 days.`;

  return (
    <div className="relative h-full min-h-[260px] w-full overflow-hidden rounded-xl border border-[rgba(168,181,193,0.25)]">
      <Map
        key={`${mapKey}-${satellite ? 'sat' : 'st'}`}
        ref={attachMap}
        mapStyle={styleUrl}
        styleDiffing={false}
        initialViewState={view.current}
        onMoveEnd={(e: ViewStateChangeEvent) => {
          view.current = { longitude: e.viewState.longitude, latitude: e.viewState.latitude, zoom: e.viewState.zoom };
        }}
        maxBounds={BOCAUE_BOUNDS}
        minZoom={BOCAUE_MIN_ZOOM}
        maxZoom={BOCAUE_MAX_ZOOM}
        style={{ height: '100%', width: '100%' }}
        interactiveLayerIds={[POINT_LAYER]}
        cursor={overDot ? 'pointer' : 'crosshair'}
        onMouseEnter={() => setOverDot(true)}
        onMouseLeave={() => setOverDot(false)}
        onClick={onClick}
        onError={() => setTileError(true)}
        onLoad={() => setTileError(false)}
      >
        <NavigationControl position="top-right" showCompass={false} />

        <Source id="pin-outside-mask" type="geojson" data={BOCAUE_OUTSIDE_MASK}>
          <Layer id="pin-outside-opacity" type="fill" paint={{ 'fill-color': '#0F172A', 'fill-opacity': 0.55 }} />
        </Source>
        <Source id="pin-bocaue-boundary" type="geojson" data={BOCAUE_BOUNDARY_SOURCE}>
          <Layer id="pin-bocaue-outline" type="line" paint={{ 'line-color': '#0080ff', 'line-width': 2 }} />
        </Source>

        <Source id="pin-barangays" type="geojson" data={barangayGeoJSON as object}>
          {isFlood && (
            <Layer
              id="pin-barangay-flood"
              type="fill"
              paint={{
                'fill-color': [
                  'interpolate', ['linear'], ['get', 'flood'],
                  1, FLOOD_SHADES[0], midFlood, FLOOD_SHADES[1], topFlood, FLOOD_SHADES[2],
                ],
                'fill-opacity': ['case', ['>', ['get', 'flood'], 0], 0.45, 0],
              } as object}
            />
          )}
          <Layer id="pin-barangay-outline" type="line" paint={{ 'line-color': lineColor, 'line-width': 1, 'line-opacity': 0.7 }} />
          <Layer
            id="pin-barangay-highlight"
            type="line"
            filter={['==', ['get', 'name'], highlightBarangay] as never}
            paint={{ 'line-color': '#0E5E52', 'line-width': 3.5 }}
          />
          <Layer
            id="pin-barangay-labels"
            type="symbol"
            layout={{
              'text-field': isFlood
                ? ['case', ['>', ['get', 'flood'], 0],
                    ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'flood']], ' flood'],
                    ['get', 'name']]
                : ['get', 'name'],
              'text-size': 11,
            } as object}
            paint={{ 'text-color': labelColor, 'text-halo-color': haloColor, 'text-halo-width': 1.5 } as object}
          />
        </Source>

        <Source id="pin-circle" type="geojson" data={circle as object}>
          <Layer id="pin-circle-fill" type="fill" paint={{ 'fill-color': color, 'fill-opacity': 0.18 }} />
          <Layer id="pin-circle-line" type="line" paint={{ 'line-color': color, 'line-width': 2 }} />
        </Source>

        <Source id="pin-incidents" type="geojson" data={pointGeoJSON as object}>
          <Layer
            id={POINT_LAYER}
            type="circle"
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 6, 5, 10, 20, 16],
              'circle-color': riskCategoryColor(riskType),
              'circle-opacity': 0.85,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#ffffff',
            } as object}
          />
          <Layer
            id="pin-incident-counts"
            type="symbol"
            filter={['>', ['get', 'count'], 1] as never}
            layout={{ 'text-field': ['to-string', ['get', 'count']], 'text-size': 10, 'text-allow-overlap': true } as object}
            paint={{ 'text-color': '#ffffff' }}
          />
        </Source>

        {pin && (
          <Marker
            longitude={pin.lng}
            latitude={pin.lat}
            anchor="bottom"
            draggable
            onDragEnd={(e: MarkerDragEvent) => pick(e.lngLat.lat, e.lngLat.lng)}
          >
            <MapPin size={32} strokeWidth={2.25} className="text-agap-danger drop-shadow" fill="#fff" aria-label="Risk area pin" />
          </Marker>
        )}
      </Map>

      {/* Map controls: style and size. */}
      <div className="absolute left-2 top-2 flex gap-1.5">
        {satelliteUrl && (
          <div role="group" aria-label="Map style" className="flex rounded-lg bg-white/95 p-0.5 text-xs font-semibold shadow-card">
            {([['Streets', false], ['Satellite', true]] as const).map(([label, value]) => (
              <button
                key={label}
                type="button"
                aria-pressed={satellite === value}
                onClick={() => setSatellite(value)}
                className={cn('rounded-md px-2 py-1', satellite === value ? 'bg-agap-green text-white' : 'text-agap-textMid hover:text-agap-textMain')}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={expanded ? 'Make the map smaller' : 'Make the map bigger'}
          title={expanded ? 'Smaller map' : 'Bigger map'}
          className="rounded-lg bg-white/95 p-1.5 text-agap-textMid shadow-card hover:text-agap-textMain"
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {!pin && (
        <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center">
          <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-agap-textMain shadow-card">
            Click the map where the risk is
          </span>
        </div>
      )}

      {dataReady && (
        <div className="pointer-events-none absolute bottom-2 left-2 right-12">
          <span className="inline-block rounded-lg bg-white/95 px-2 py-1 text-[11px] text-agap-textMid shadow-card">
            {!isFlood && typePoints.length > 0 && (
              <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: riskCategoryColor(riskType) }} aria-hidden />
            )}
            {legend}
          </span>
        </div>
      )}

      {tileError && <MapErrorOverlay onRetry={() => { setTileError(false); setMapKey((k) => k + 1); }} />}
    </div>
  );
}
