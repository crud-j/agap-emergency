'use client';

import { useEffect, useMemo, useState, type JSX } from 'react';
import '@/lib/maplibre-setup';
import Map, { Marker, Popup, Source, Layer, useMap, type MarkerEvent, type MapEvent } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStyle } from '@/features/map/hooks';
import {
  BOCAUE_BOUNDS, BOCAUE_CENTER, BOCAUE_DEFAULT_ZOOM, BOCAUE_MIN_ZOOM, BOCAUE_MAX_ZOOM,
  BOCAUE_BOUNDARY_SOURCE,
  BOCAUE_OUTSIDE_MASK,
  isWithinBocaue,
} from '@/lib/bocaue-geo';
import { MapErrorOverlay } from '@/components/map/MapErrorOverlay';
import { titleCase, timeAgo } from '@/lib/incident-format';
import type { LiveResponderPosition } from '@/features/map/api';

/**
 * Flood-prone barangays (CLAUDE.md Bocaue Operational Context). Centers are
 * [lng, lat] — MapLibre order. Radii are advisory only, not authoritative boundaries.
 */
const FLOOD_PRONE: Array<{ name: string; center: [number, number]; radiusM: number }> = [
  { name: 'Lolomboy', center: [120.9436, 14.7236], radiusM: 900 },
  { name: 'Bunlo',    center: [120.9253, 14.7319], radiusM: 800 },
  { name: 'Igulot',   center: [120.9500, 14.7097], radiusM: 850 },
  { name: 'Bambang',  center: [120.9103, 14.7847], radiusM: 900 },
];

const PRIORITY_HEX: Record<string, string> = {
  CRITICAL: '#DC2626',
  HIGH: '#EA580C',
  MEDIUM: '#CA8A04',
  LOW: '#16A34A',
};

const RESPONDER_HEX = '#0D6053';

export interface MapIncident {
  id: string;
  public_reference: string;
  category: string;
  priority: string;
  status: string;
  lat: number | null;
  lng: number | null;
}

// Returns [lng, lat] — MapLibre / GeoJSON order.
function coordsOf(i: MapIncident): [number, number] | null {
  if (i.lat == null || i.lng == null) return null;
  const lat = Number(i.lat);
  const lng = Number(i.lng);
  if (!isWithinBocaue(lng, lat) || (lat === 0 && lng === 0)) return null;
  return [lng, lat];
}

/** Generates a GeoJSON polygon approximating a circle. Returns ring coordinates in [lng, lat] order. */
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

/** Flies to the selected incident whenever the selection changes. */
function MapFlyController({ incidents, selectedId }: { incidents: MapIncident[]; selectedId: string | null }): null {
  const { current: map } = useMap();
  useEffect(() => {
    if (!selectedId || !map) return;
    const inc = incidents.find((i) => i.id === selectedId);
    const c = inc ? coordsOf(inc) : null;
    if (c) map.flyTo({ center: c, zoom: Math.max(map.getZoom(), 15), duration: 600 });
  }, [selectedId, incidents, map]);
  return null;
}

interface IncidentMapViewProps {
  incidents: MapIncident[];
  responders: LiveResponderPosition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Real-time incident map (MOD-22). Incident markers are coloured by priority;
 * responder markers update live from `responder.location_updated` (patched into
 * the ['live-responders'] cache by SocketProvider). Clicking an incident selects
 * it — the parent opens the shared detail Drawer. Flood-prone barangay advisory
 * circles are rendered as MapLibre GL fill + line layers.
 */
export function IncidentMapView({ incidents, responders, selectedId, onSelect }: IncidentMapViewProps): JSX.Element {
  const styleUrl = useMapStyle();
  const [mapKey, setMapKey] = useState(0);
  const [tileError, setTileError] = useState(false);

  const selectedInc = selectedId ? incidents.find((i) => i.id === selectedId) : null;
  const selectedCoords = selectedInc ? coordsOf(selectedInc) : null;

  const floodCirclesGeoJSON = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: FLOOD_PRONE.map((b) => ({
      type: 'Feature' as const,
      properties: { name: b.name },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [circlePolygon(b.center[0], b.center[1], b.radiusM)],
      },
    })),
  }), []);

  return (
    <div className="relative h-full w-full" style={{ background: '#F2F5F8' }}>
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
        onError={() => setTileError(true)}
        onLoad={(event: MapEvent) => {
          // Some configured MapLibre styles reference optional sprite images
          // that are not present in the style's sprite sheet. Resolve those
          // references with a transparent placeholder so the map remains
          // usable without repeated style-image warnings.
          const resolvedImageIds = new Set<string>();
          event.target.setMissingStyleImageResolver((imageId: string) => {
            // Some style JSON contains an empty sprite reference. It cannot be
            // registered as a MapLibre image and should be ignored.
            if (!imageId?.trim() || resolvedImageIds.has(imageId) || event.target.hasImage(imageId)) return;
            resolvedImageIds.add(imageId);
            event.target.addImage(imageId, {
              width: 1,
              height: 1,
              data: new Uint8Array(4),
            });
          });
          setTileError(false);
        }}
      >
        <MapFlyController incidents={incidents} selectedId={selectedId} />

        <Source id="bocaue-outside-mask" type="geojson" data={BOCAUE_OUTSIDE_MASK}>
          <Layer
            id="bocaue-outside-opacity"
            type="fill"
            paint={{ 'fill-color': '#0F172A', 'fill-opacity': 0.62 }}
          />
        </Source>

        {/* Municipal Bocaue boundary; replace the asset only if a higher-authority file is provided. */}
        <Source id="bocaue-boundary" type="geojson" data={BOCAUE_BOUNDARY_SOURCE}>
          <Layer
            id="bocaue-outline"
            type="line"
            paint={{ 'line-color': '#0080ff', 'line-width': 3 }}
          />
        </Source>

        {/* Flood-prone barangay advisory circles */}
        <Source id="flood-circles" type="geojson" data={floodCirclesGeoJSON}>
          <Layer
            id="flood-fill"
            type="fill"
            paint={{ 'fill-color': '#3B82F6', 'fill-opacity': 0.08 }}
          />
          <Layer
            id="flood-outline"
            type="line"
            paint={{ 'line-color': '#3B82F6', 'line-width': 1, 'line-opacity': 0.6 }}
          />
          <Layer
            id="flood-labels"
            type="symbol"
            minzoom={13}
            layout={{ 'text-field': ['get', 'name'], 'text-size': 11 } as object}
            paint={{ 'text-color': '#1D4ED8', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } as object}
          />
        </Source>

        {/* Incident markers */}
        {incidents.map((inc) => {
          const c = coordsOf(inc);
          if (!c) return null;
          const color = PRIORITY_HEX[inc.priority] ?? '#8795A3';
          const selected = inc.id === selectedId;
          return (
            <Marker
              key={inc.id}
              longitude={c[0]}
              latitude={c[1]}
              anchor="center"
              onClick={(e: MarkerEvent<MouseEvent>) => {
                e.originalEvent.stopPropagation();
                onSelect(inc.id);
              }}
            >
              <div
                style={{
                  width: selected ? 24 : 16,
                  height: selected ? 24 : 16,
                  borderRadius: '50%',
                  backgroundColor: color,
                  border: `${selected ? 3 : 1.5}px solid ${selected ? '#1C2B3A' : color}`,
                  cursor: 'pointer',
                  boxShadow: selected ? '0 0 0 4px rgba(28,43,58,0.15)' : undefined,
                  transition: 'all 0.15s',
                }}
              />
            </Marker>
          );
        })}

        {/* Live responder markers */}
        {responders.map((r) => {
          if (r.lat == null || r.lng == null || !isWithinBocaue(r.lng, r.lat)) return null;
          return (
            <Marker key={r.responderId} longitude={r.lng} latitude={r.lat} anchor="center">
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: RESPONDER_HEX,
                  border: '2px solid #ffffff',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                }}
              />
            </Marker>
          );
        })}

        {selectedCoords && selectedInc && (
          <Popup
            longitude={selectedCoords[0]}
            latitude={selectedCoords[1]}
            onClose={() => {}}
            closeButton={false}
            offset={14}
          >
            <div className="text-xs">
              <div className="font-bold text-[#1C2B3A]">{titleCase(selectedInc.category)}</div>
              <div className="font-mono text-[10px] text-[#8795A3]">{selectedInc.public_reference}</div>
              <div className="text-[#40536D]">{titleCase(selectedInc.priority)} · {titleCase(selectedInc.status)}</div>
              {responders.find((r) => r.incident_id === selectedInc.id) && (
                <div className="mt-0.5 text-[10px] text-[#8795A3]">
                  updated {timeAgo(responders.find((r) => r.incident_id === selectedInc.id)!.updated_at)}
                </div>
              )}
              <button
                onClick={() => onSelect(selectedInc.id)}
                className="mt-1 font-semibold text-[#0D6053] underline"
              >
                Open detail
              </button>
            </div>
          </Popup>
        )}
      </Map>

      {tileError && <MapErrorOverlay onRetry={() => { setTileError(false); setMapKey((k) => k + 1); }} />}
    </div>
  );
}

export default IncidentMapView;
