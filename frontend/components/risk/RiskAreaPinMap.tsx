'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import '@/lib/maplibre-setup';
import Map, {
  Layer, Marker, Source, type MapLayerMouseEvent, type MapRef, type MarkerDragEvent,
} from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin } from 'lucide-react';
import { isCoordinateInBocaue } from '@agap/shared';
import { useMapStyle } from '@/features/map/hooks';
import {
  BOCAUE_BOUNDARY_SOURCE, BOCAUE_BOUNDS, BOCAUE_CENTER, BOCAUE_DEFAULT_ZOOM, BOCAUE_MAX_ZOOM, BOCAUE_MIN_ZOOM,
  BOCAUE_OUTSIDE_MASK,
} from '@/lib/bocaue-geo';
import { MapErrorOverlay } from '@/components/map/MapErrorOverlay';
import { resolveMissingStyleImages } from '@/components/map/missing-style-images';
import { circlePolygon } from '@/features/risk/area-geo';
import { RISK_LEVEL_COLORS } from './risk-colors';

interface RiskAreaPinMapProps {
  pin: { lat: number; lng: number } | null;
  radiusM: number;
  level: string;
  /** A point inside Bocaue was picked (click or drag). */
  onPick: (lat: number, lng: number) => void;
  /** A point outside Bocaue was clicked; it is not used. */
  onOutside: () => void;
}

/**
 * MOD-51 add/edit form: click the map (or drag the pin) to place a risk area; the circle
 * shows the radius. Locked to Bocaue like the Risk Map, and a click outside the
 * municipality is refused (the server checks the same polygon).
 */
export default function RiskAreaPinMap({ pin, radiusM, level, onPick, onOutside }: RiskAreaPinMapProps): JSX.Element {
  const styleUrl = useMapStyle();
  const mapRef = useRef<MapRef | null>(null);
  const attachMap = useCallback((map: MapRef | null) => {
    mapRef.current = map;
    resolveMissingStyleImages(map);
  }, []);
  const [mapKey, setMapKey] = useState(0);
  const [tileError, setTileError] = useState(false);

  // An existing pin off-screen (editing): bring it into view.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pin) return;
    if (!map.getBounds().contains([pin.lng, pin.lat])) map.easeTo({ center: [pin.lng, pin.lat], duration: 500 });
  }, [pin]);

  const circle = useMemo(
    () =>
      pin
        ? { type: 'Feature' as const, properties: {}, geometry: circlePolygon(pin.lat, pin.lng, radiusM) }
        : { type: 'FeatureCollection' as const, features: [] },
    [pin, radiusM],
  );
  const color = RISK_LEVEL_COLORS[level] ?? '#D97706';

  function pick(lat: number, lng: number): void {
    if (isCoordinateInBocaue(lat, lng)) onPick(lat, lng);
    else onOutside();
  }

  return (
    <div className="relative h-full min-h-[260px] w-full overflow-hidden rounded-xl border border-[rgba(168,181,193,0.25)]">
      <Map
        key={mapKey}
        ref={attachMap}
        mapStyle={styleUrl}
        styleDiffing={false}
        initialViewState={{
          longitude: pin?.lng ?? BOCAUE_CENTER[0],
          latitude: pin?.lat ?? BOCAUE_CENTER[1],
          zoom: pin ? 15 : BOCAUE_DEFAULT_ZOOM,
        }}
        maxBounds={BOCAUE_BOUNDS}
        minZoom={BOCAUE_MIN_ZOOM}
        maxZoom={BOCAUE_MAX_ZOOM}
        style={{ height: '100%', width: '100%' }}
        cursor="crosshair"
        onClick={(e: MapLayerMouseEvent) => pick(e.lngLat.lat, e.lngLat.lng)}
        onError={() => setTileError(true)}
        onLoad={() => setTileError(false)}
      >
        <Source id="pin-outside-mask" type="geojson" data={BOCAUE_OUTSIDE_MASK}>
          <Layer id="pin-outside-opacity" type="fill" paint={{ 'fill-color': '#0F172A', 'fill-opacity': 0.55 }} />
        </Source>
        <Source id="pin-bocaue-boundary" type="geojson" data={BOCAUE_BOUNDARY_SOURCE}>
          <Layer id="pin-bocaue-outline" type="line" paint={{ 'line-color': '#0080ff', 'line-width': 2 }} />
        </Source>
        <Source id="pin-circle" type="geojson" data={circle as object}>
          <Layer id="pin-circle-fill" type="fill" paint={{ 'fill-color': color, 'fill-opacity': 0.18 }} />
          <Layer id="pin-circle-line" type="line" paint={{ 'line-color': color, 'line-width': 2 }} />
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

      {!pin && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-agap-textMain shadow-card">
            Click the map where the risk is
          </span>
        </div>
      )}
      {tileError && <MapErrorOverlay onRetry={() => { setTileError(false); setMapKey((k) => k + 1); }} />}
    </div>
  );
}
