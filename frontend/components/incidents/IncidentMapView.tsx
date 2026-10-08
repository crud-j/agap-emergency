'use client';

import { useEffect, type JSX } from 'react';
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { titleCase, timeAgo } from '@/lib/incident-format';
import type { LiveResponderPosition } from '@/features/map/api';

// Bocaue municipal center.
const BOCAUE: [number, number] = [14.7969, 120.9268];

/**
 * Flood-prone barangays (CLAUDE.md Bocaue Operational Context). Coordinates are
 * approximate barangay centroids used only to render advisory flood overlays —
 * not authoritative boundaries.
 */
const FLOOD_PRONE: Array<{ name: string; center: [number, number]; radiusM: number }> = [
  { name: 'Lolomboy', center: [14.7236, 120.9436], radiusM: 900 },
  { name: 'Bunlo',    center: [14.7319, 120.9253], radiusM: 800 },
  { name: 'Igulot',   center: [14.7097, 120.9500], radiusM: 850 },
  { name: 'Bambang',  center: [14.7847, 120.9103], radiusM: 900 },
];

const PRIORITY_HEX: Record<string, string> = {
  CRITICAL: '#DC2626',
  HIGH: '#EA580C',
  MEDIUM: '#CA8A04',
  LOW: '#16A34A',
};

const RESPONDER_HEX = '#0D6053'; // agap green — distinct from incident priority colors

export interface MapIncident {
  id: string;
  public_reference: string;
  category: string;
  priority: string;
  status: string;
  lat: number | null;
  lng: number | null;
}

function coordsOf(i: MapIncident): [number, number] | null {
  if (i.lat == null || i.lng == null) return null;
  const lat = Number(i.lat);
  const lng = Number(i.lng);
  // (0,0) is the sentinel for address-only / manual entries — not mappable.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return [lat, lng];
}

/** Flies to the selected incident whenever the selection changes. */
function MapController({ incidents, selectedId }: { incidents: MapIncident[]; selectedId: string | null }): null {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const inc = incidents.find((i) => i.id === selectedId);
    const c = inc ? coordsOf(inc) : null;
    if (c) map.flyTo(c, Math.max(map.getZoom(), 15), { duration: 0.6 });
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
 * it — the parent opens the shared detail Drawer.
 */
export function IncidentMapView({ incidents, responders, selectedId, onSelect }: IncidentMapViewProps): JSX.Element {
  return (
    <MapContainer center={BOCAUE} zoom={13} className="h-full w-full" style={{ background: '#F2F5F8' }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapController incidents={incidents} selectedId={selectedId} />

      {/* Flood-prone barangay advisory overlays */}
      {FLOOD_PRONE.map((b) => (
        <Circle
          key={b.name}
          center={b.center}
          radius={b.radiusM}
          pathOptions={{ color: '#3B82F6', weight: 1, fillColor: '#3B82F6', fillOpacity: 0.08 }}
        >
          <Tooltip direction="center" permanent className="!bg-transparent !border-0 !shadow-none !text-[#1D4ED8] !font-semibold">
            {b.name}
          </Tooltip>
        </Circle>
      ))}

      {/* Incident markers */}
      {incidents.map((inc) => {
        const c = coordsOf(inc);
        if (!c) return null;
        const color = PRIORITY_HEX[inc.priority] ?? '#8795A3';
        const selected = inc.id === selectedId;
        return (
          <CircleMarker
            key={inc.id}
            center={c}
            radius={selected ? 12 : 8}
            pathOptions={{
              color: selected ? '#1C2B3A' : color,
              weight: selected ? 3 : 1.5,
              fillColor: color,
              fillOpacity: 0.85,
            }}
            eventHandlers={{ click: () => onSelect(inc.id) }}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-bold text-[#1C2B3A]">{titleCase(inc.category)}</div>
                <div className="font-mono text-[10px] text-[#8795A3]">{inc.public_reference}</div>
                <div className="text-[#40536D]">{titleCase(inc.priority)} · {titleCase(inc.status)}</div>
                <button
                  onClick={() => onSelect(inc.id)}
                  className="mt-1 font-semibold text-[#0D6053] underline"
                >
                  Open detail
                </button>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Live responder markers */}
      {responders.map((r) => {
        if (r.lat == null || r.lng == null) return null;
        return (
          <CircleMarker
            key={r.responderId}
            center={[r.lat, r.lng]}
            radius={6}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: RESPONDER_HEX, fillOpacity: 1 }}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-bold text-[#0D6053]">
                  {r.resource_name ?? r.responder_name ?? 'Responding unit'}
                </div>
                {r.status && <div className="text-[#40536D]">{titleCase(r.status)}</div>}
                <div className="mt-0.5 flex items-center gap-1 text-[10px] text-[#8795A3]">
                  ETA pending est. · updated {timeAgo(r.updated_at)}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

export default IncidentMapView;
