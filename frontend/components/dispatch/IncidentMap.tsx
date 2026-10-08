'use client';

import { useEffect, type ReactElement } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { IncidentListItem } from '@/hooks/useDispatch';
import { titleCase } from '@/lib/incident-format';

export interface ResponderPing {
  responderId: string;
  incidentId: string;
  lat: number;
  lng: number;
  updatedAt: string;
}

// Bocaue municipal center.
const BOCAUE: [number, number] = [14.7969, 120.9268];

const PRIORITY_HEX: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#f59e0b',
  LOW: '#22c55e',
};

function coordsOf(inc: IncidentListItem): [number, number] | null {
  const loc = inc.incident_locations;
  if (loc?.latitude == null || loc?.longitude == null) return null;
  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  // (0,0) is the sentinel for manual/address-only entries — not mappable.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return [lat, lng];
}

/** Flies the map to the selected incident whenever the selection changes. */
function MapController({
  incidents,
  selectedId,
}: {
  incidents: IncidentListItem[];
  selectedId: string | null;
}): null {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const inc = incidents.find((i) => i.id === selectedId);
    const c = inc ? coordsOf(inc) : null;
    if (c) map.flyTo(c, Math.max(map.getZoom(), 15), { duration: 0.6 });
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
  return (
    <MapContainer center={BOCAUE} zoom={13} className="h-full w-full" style={{ background: '#0b1220' }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapController incidents={incidents} selectedId={selectedId} />

      {incidents.map((inc) => {
        const c = coordsOf(inc);
        if (!c) return null;
        const color = PRIORITY_HEX[inc.priority] ?? '#64748b';
        const selected = inc.id === selectedId;
        return (
          <CircleMarker
            key={inc.id}
            center={c}
            radius={selected ? 11 : 8}
            pathOptions={{
              color: selected ? '#ffffff' : color,
              weight: selected ? 3 : 1.5,
              fillColor: color,
              fillOpacity: 0.85,
            }}
            eventHandlers={{ click: () => onSelect(inc.id) }}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-bold">{titleCase(inc.category)}</div>
                <div className="font-mono text-[10px] text-slate-500">{inc.public_reference}</div>
                <div>
                  {titleCase(inc.priority)} · {titleCase(inc.status)}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {responders.map((r) => (
        <CircleMarker
          key={r.responderId}
          center={[r.lat, r.lng]}
          radius={7}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#14b8a6', fillOpacity: 1 }}
        >
          <Popup>
            <div className="text-xs font-semibold">Responding unit</div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

export default IncidentMap;
