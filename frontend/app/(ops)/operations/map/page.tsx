'use client';

import { useMemo, useState, type JSX } from 'react';
import dynamic from 'next/dynamic';
import { Hospital } from 'lucide-react';
import { Card } from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { IncidentDetailDrawer } from '@/components/incidents/IncidentDetailDrawer';
import { useWsState } from '@/lib/use-ws-state';
import { useIncidentLocations, useIncidentsUnits, useLiveResponders } from '@/features/map/hooks';
import { destinationFacilities, isUnitOnMap, legChip } from '@/features/map/live-tracking';
import { useHospitals } from '@/features/hospitals/hooks';
import { ACTIVE_STATUSES } from '@/lib/incident-format';
import type { MapFacility, MapIncident, MapRoute } from '@/components/incidents/IncidentMapView';
import { LEG_COLORS, LegChip } from '@/components/map/LegChip';
import { isWithinBocaue } from '@/lib/bocaue-geo';
import { useNow } from '@/lib/use-now';
import { PRIORITY_LABELS, PRIORITY_RING_COLORS, isRouteLastKnown } from '@agap/shared';
import { AMBULANCE_ICON_URL } from '@/lib/map-icons';

/** The optional hospital layer re-reads GET /hospitals at most every 5 minutes (plan §16.3). */
const HOSPITAL_LAYER_STALE_MS = 5 * 60_000;

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

// Same palette as the scene markers and reporter-icon rings (@agap/shared PRIORITY_RING_COLORS).
const LEGEND = [
  { label: PRIORITY_LABELS.CRITICAL, color: PRIORITY_RING_COLORS.CRITICAL },
  { label: PRIORITY_LABELS.HIGH, color: PRIORITY_RING_COLORS.HIGH },
  { label: PRIORITY_LABELS.MEDIUM, color: PRIORITY_RING_COLORS.MEDIUM },
  { label: PRIORITY_LABELS.LOW, color: PRIORITY_RING_COLORS.LOW },
];

/**
 * MOD-22 — Real-Time Incident Map. Incidents (coloured by priority) + live
 * responder positions over Bocaue, with flood-prone barangay overlays. Clicking
 * a marker opens the shared IncidentDetailDrawer (also used by the queue).
 * Each tracked unit's server route is drawn by leg (scene solid, hospital dashed)
 * with its destination hospital; "Show hospitals" adds every VERIFIED hospital.
 */
export default function MapPage(): JSX.Element {
  const wsState = useWsState();
  const { data: incidentLocations, isError } = useIncidentLocations();
  const { data: responders } = useLiveResponders();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showHospitals, setShowHospitals] = useState(false);
  const now = useNow(5_000);

  // Leg, destination and server route of every tracked unit (one query per incident).
  const trackedIncidentIds = useMemo(
    () => [...new Set((responders ?? []).map((r) => r.incident_id).filter((id): id is string => !!id))].sort(),
    [responders],
  );
  const units = useIncidentsUnits(trackedIncidentIds);
  const unitLegs = useMemo(() => Object.fromEntries(units.map((u) => [u.dispatchId, legChip(u)])), [units]);
  const routes = useMemo<MapRoute[]>(
    () =>
      units.flatMap((u) =>
        u.route && u.leg !== 'AT_FACILITY'
          ? [{ id: u.dispatchId, geometry: u.route.geometry, leg: u.leg ?? 'TO_SCENE', lastKnown: isRouteLastKnown(u.route, now) }]
          : [],
      ),
    [units, now],
  );
  const { data: hospitals } = useHospitals({ enabled: showHospitals, staleTime: HOSPITAL_LAYER_STALE_MS });
  const facilities = useMemo<MapFacility[]>(() => {
    const verified = showHospitals
      ? (hospitals ?? []).flatMap((h) =>
          h.location_status === 'VERIFIED' && h.latitude != null && h.longitude != null
            ? [{ id: h.id, name: h.name, latitude: h.latitude, longitude: h.longitude, verified: true }]
            : [],
        )
      : [];
    return [...verified, ...destinationFacilities(units)];
  }, [showHospitals, hospitals, units]);

  // Only plot incidents still needing attention.
  const incidents = useMemo<MapIncident[]>(
    () => (incidentLocations ?? []).filter((i) => ACTIVE_STATUSES.includes(i.status)),
    [incidentLocations],
  );
  const excludedIncidents = incidents.filter(
    (incident) =>
      incident.lat != null &&
      incident.lng != null &&
      (incident.lat !== 0 || incident.lng !== 0) &&
      !isWithinBocaue(incident.lng, incident.lat),
  ).length;
  const excludedResponders = (responders ?? []).filter(
    (responder) => !isUnitOnMap(responder.lng, responder.lat),
  ).length;
  const referenceOf = (incidentId: string | null) =>
    (incidentId && incidentLocations?.find((i) => i.id === incidentId)?.public_reference) || null;
  const missionRows = (responders ?? []).filter((r) => r.incident_id);

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
        {(excludedIncidents > 0 || excludedResponders > 0) && (
          <div className="absolute right-4 top-4 z-[1000] max-w-sm rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 shadow-card">
            {excludedIncidents + excludedResponders} incident/responder location(s) outside Bocaue are omitted from the map.
          </div>
        )}
        <IncidentMapView
          incidents={incidents}
          responders={responders ?? []}
          selectedId={selectedId}
          onSelect={select}
          routes={routes}
          facilities={facilities}
          unitLegs={unitLegs}
        />

        {/* Hospital layer toggle + units on mission (leg per row) */}
        <div className="absolute left-4 top-4 z-[1000] flex w-[min(300px,calc(100%-2rem))] flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowHospitals((v) => !v)}
            aria-pressed={showHospitals}
            className={`inline-flex items-center gap-1.5 self-start rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-card backdrop-blur ${
              showHospitals
                ? 'border-[#D44858]/40 bg-white text-[#D44858]'
                : 'border-agap-track/50 bg-white/95 text-agap-textMid hover:text-agap-textMain'
            }`}
          >
            <Hospital size={13} aria-hidden />
            {showHospitals ? 'Hide hospitals' : 'Show hospitals'}
          </button>
          {missionRows.length > 0 && (
            <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-[rgba(168,181,193,0.20)] bg-white/95 py-1.5 shadow-card backdrop-blur">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-agap-textSub">Units on mission</p>
              {missionRows.map((r) => {
                const chip = r.dispatchId ? unitLegs[r.dispatchId] : undefined;
                return (
                  <button
                    key={r.dispatchId ?? r.responderId}
                    type="button"
                    onClick={() => r.incident_id && select(r.incident_id)}
                    className="flex w-full flex-col items-start gap-1 px-3 py-1.5 text-left hover:bg-agap-surface"
                  >
                    <span className="flex w-full items-center justify-between gap-2 text-xs font-bold text-agap-textMain">
                      <span className="truncate">{r.call_sign ?? r.resource_name ?? 'Unit'}</span>
                      <span className="shrink-0 font-mono text-[10px] font-normal text-agap-textSub">
                        {referenceOf(r.incident_id) ?? ''}
                      </span>
                    </span>
                    <LegChip chip={chip ?? legChip(null)} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
            {/* eslint-disable-next-line @next/next/no-img-element -- legend icon */}
            <img src={AMBULANCE_ICON_URL} alt="" width={14} height={14} />
            Responder unit (grey = signal lost)
          </span>
          <span className="flex items-center gap-2 text-xs text-agap-textMid">
            <span className="h-0.5 w-4 rounded" style={{ background: LEG_COLORS.TO_SCENE }} />
            Route to scene
          </span>
          <span className="flex items-center gap-2 text-xs text-agap-textMid">
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: LEG_COLORS.TO_FACILITY }} />
            Route to hospital
          </span>
          <span className="flex items-center gap-2 text-xs text-agap-textMid">
            <Hospital size={13} className="text-[#D44858]" aria-hidden />
            Hospital (dashed grey = location not verified)
          </span>
          <span className="flex items-center gap-2 text-xs text-agap-textMid">
            {/* eslint-disable-next-line @next/next/no-img-element -- legend icon */}
            <img src="/map-icons/citizen-female.png" alt="" width={14} height={14} className="rounded-full" />
            Reporter (when shared)
          </span>
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
