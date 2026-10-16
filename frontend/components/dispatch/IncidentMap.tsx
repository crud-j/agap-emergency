'use client';

import { useEffect, useState, type ReactElement } from 'react';
import '@/lib/maplibre-setup';
import Map, { Layer, Marker, Popup, Source, useMap, type MapEvent, type MarkerEvent } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useMapStyle } from '@/features/map/hooks';
import {
  BOCAUE_BOUNDS, BOCAUE_CENTER, BOCAUE_DEFAULT_ZOOM, BOCAUE_MIN_ZOOM, BOCAUE_MAX_ZOOM,
  BOCAUE_BOUNDARY_SOURCE,
  BOCAUE_OUTSIDE_MASK,
  isWithinBocaue,
} from '@/lib/bocaue-geo';
import { MapErrorOverlay } from '@/components/map/MapErrorOverlay';
import type { IncidentListItem } from '@/hooks/useDispatch';
import { titleCase } from '@/lib/incident-format';

export interface ResponderPing {
  responderId: string;
  incidentId: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

const PRIORITY_HEX: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#f59e0b',
  LOW: '#22c55e',
};

// Returns [lng, lat] — MapLibre / GeoJSON order.
function coordsOf(inc: IncidentListItem): [number, number] | null {
  const loc = inc.incident_locations;
  if (loc?.latitude == null || loc?.longitude == null) return null;
  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  if (!isWithinBocaue(lng, lat) || (lat === 0 && lng === 0)) return null;
  return [lng, lat];
}

/** Flies the map to the selected incident whenever the selection changes. */
function MapFlyController({
  incidents,
  selectedId,
}: {
  incidents: IncidentListItem[];
  selectedId: string | null;
}): null {
  const { current: map } = useMap();
  useEffect(() => {
    if (!selectedId || !map) return;
    const inc = incidents.find((i) => i.id === selectedId);
    const c = inc ? coordsOf(inc) : null;
    if (c) map.flyTo({ center: c, zoom: Math.max(map.getZoom(), 15), duration: 600 });
  }, [selectedId, incidents, map]);
  return null;
}

/**
 * Real-time incident map (MOD-22). Plots active incidents (coloured by priority)
 * and live responder pings from the ops WebSocket feed. Clicking an incident
 * marker selects it, keeping the queue, map, and detail panel in sync.
 */
export function IncidentMap({
  incidents,
  responders,
  selectedId,
  onSelect,
}: {
  incidents: IncidentListItem[];
  responders: ResponderPing[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): ReactElement {
  const styleUrl = useMapStyle();
  const [mapKey, setMapKey] = useState(0);
  const [tileError, setTileError] = useState(false);

  const selectedInc = selectedId ? incidents.find((i) => i.id === selectedId) : null;
  const selectedCoords = selectedInc ? coordsOf(selectedInc) : null;

  return (
    <div className="relative h-full w-full" style={{ background: '#0b1220' }}>
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
        onLoad={(e: MapEvent) => {
          const resolved = new Set<string>();
          e.target.setMissingStyleImageResolver((id: string) => {
            if (!id?.trim() || resolved.has(id) || e.target.hasImage(id)) return;
            resolved.add(id);
            e.target.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
          });
          setTileError(false);
        }}
      >
        <MapFlyController incidents={incidents} selectedId={selectedId} />

        <Source id="bocaue-outside-mask" type="geojson" data={BOCAUE_OUTSIDE_MASK}>
          <Layer id="bocaue-outside-opacity" type="fill" paint={{ 'fill-color': '#0F172A', 'fill-opacity': 0.62 }} />
        </Source>

        {/* Municipal Bocaue boundary; replace the asset only if a higher-authority file is provided. */}
        <Source id="bocaue-boundary" type="geojson" data={BOCAUE_BOUNDARY_SOURCE}>
          <Layer id="bocaue-outline" type="line" paint={{ 'line-color': '#0080ff', 'line-width': 3 }} />
        </Source>

        {incidents.map((inc) => {
          const c = coordsOf(inc);
          if (!c) return null;
          const color = PRIORITY_HEX[inc.priority] ?? '#64748b';
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
                  width: selected ? 22 : 16,
                  height: selected ? 22 : 16,
                  borderRadius: '50%',
                  backgroundColor: color,
                  border: `${selected ? 3 : 1.5}px solid ${selected ? '#ffffff' : color}`,
                  cursor: 'pointer',
                  boxShadow: selected ? '0 0 0 4px rgba(255,255,255,0.25)' : undefined,
                  transition: 'all 0.15s',
                }}
              />
            </Marker>
          );
        })}

        {responders.filter((r) => isWithinBocaue(r.lng, r.lat)).map((r) => (
          <Marker key={r.responderId} longitude={r.lng} latitude={r.lat} anchor="center">
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: '#14b8a6',
                border: '2px solid #ffffff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}
            />
          </Marker>
        ))}

        {selectedCoords && selectedInc && (
          <Popup
            longitude={selectedCoords[0]}
            latitude={selectedCoords[1]}
            onClose={() => onSelect(selectedInc.id)}
            closeButton={false}
            offset={14}
          >
            <div className="text-xs">
              <div className="font-bold">{titleCase(selectedInc.category)}</div>
              <div className="font-mono text-[10px] text-slate-500">{selectedInc.public_reference}</div>
              <div>
                {titleCase(selectedInc.priority)} · {titleCase(selectedInc.status)}
              </div>
            </div>
          </Popup>
        )}
      </Map>

      {tileError && <MapErrorOverlay onRetry={() => { setTileError(false); setMapKey((k) => k + 1); }} />}
    </div>
  );
}

export default IncidentMap;
