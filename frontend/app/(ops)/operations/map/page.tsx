'use client';

import { useMemo, useState, type JSX } from 'react';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { IncidentDetailDrawer } from '@/components/incidents/IncidentDetailDrawer';
import { useWsState } from '@/lib/use-ws-state';
import { useIncidentLocations, useLiveResponders } from '@/features/map/hooks';
import { ACTIVE_STATUSES } from '@/lib/incident-format';
import type { MapIncident } from '@/components/incidents/IncidentMapView';

// MapLibre GL uses WebGL + Web Workers; must be client-side only.
const IncidentMapView = dynamic(
  () => import('@/components/incidents/IncidentMapView').then((m) => m.IncidentMapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-agap-surface text-sm text-agap-textSub">
        Loading map…
      </div>
    ),
  },
);

const LEGEND = [
  { label: 'Critical', color: '#DC2626' },
  { label: 'High', color: '#EA580C' },
  { label: 'Medium', color: '#CA8A04' },
  { label: 'Low', color: '#16A34A' },
  { label: 'Responder', color: '#0D6053' },
];

/**
 * MOD-22 — Real-Time Incident Map. Incidents (coloured by priority) + live
 * responder positions over Bocaue, with flood-prone barangay overlays. Clicking
 * a marker opens the shared IncidentDetailDrawer (also used by the queue).
 */
export default function MapPage(): JSX.Element {
  const wsState = useWsState();
  const { data: incidentLocations, isError } = useIncidentLocations();
  const { data: responders } = useLiveResponders();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Only plot incidents still needing attention.
  const incidents = useMemo<MapIncident[]>(
    () => (incidentLocations ?? []).filter((i) => ACTIVE_STATUSES.includes(i.status)),
    [incidentLocations],
  );

  function select(id: string) {
    setSelectedId(id);
    setDrawerOpen(true);
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[520px] flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-agap-textMain">Real-Time Incident Map</h1>
          <p className="mt-1 text-sm text-agap-textSub">
            {incidents.length} active · {responders?.length ?? 0} responder{(responders?.length ?? 0) === 1 ? '' : 's'} live · Bocaue, Bulacan
          </p>
        </div>
        <ConnectionIndicator state={wsState} />
      </div>

      {/* Map */}
      <Card padding="none" className="relative flex-1 overflow-hidden">
        {isError && (
          <div className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-lg bg-agap-dangerSoft px-3 py-1.5 text-xs font-semibold text-agap-danger shadow-card">
            Incident layer failed to load — responder positions may still update.
          </div>
        )}
        <IncidentMapView
          incidents={incidents}
          responders={responders ?? []}
          selectedId={selectedId}
          onSelect={select}
        />

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-[1000] flex flex-col gap-1.5 rounded-xl border border-[rgba(168,181,193,0.20)] bg-white/95 px-3 py-2.5 shadow-card backdrop-blur">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-agap-textSub">Legend</span>
          {LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-2 text-xs text-agap-textMid">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
          <span className="flex items-center gap-2 text-xs text-agap-textMid">
            <span className="h-2.5 w-2.5 rounded-full border border-[#3B82F6] bg-[#3B82F6]/20" />
            Flood-prone barangay
          </span>
        </div>
      </Card>

      <IncidentDetailDrawer incidentId={selectedId} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
