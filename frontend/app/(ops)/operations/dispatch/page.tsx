'use client';

import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Siren, Truck, MapPin, Users, Sparkles, CheckCircle2, ExternalLink,
  Search, X, Navigation, UserCheck, ChevronDown, ChevronUp,
  Wifi, ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, AlertTriangle,
} from 'lucide-react';
import {
  Button, PriorityBadge, StatusChip, Badge, Skeleton,
} from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { useWsState } from '@/lib/use-ws-state';
import {
  useDispatchQueue, useDispatchRecommendations, useAvailableUnits, useCreateDispatch, useIncidentDispatches,
} from '@/features/dispatch/hooks';
import { homeCrew, planUnitSelection, type CandidateUnit, type UnitSelectionPlan } from '@/features/dispatch/unit-selection';
import { resourceTypeLabel } from '@/features/resources/resource-type';
import { useResponders } from '@/features/responders/hooks';
import { useIncident, useUpdateIncidentStatus } from '@/features/incidents/hooks';
import {
  ACTIVE_RESPONSE_INCIDENT_STATUSES, isRouteLastKnown, recommendUnitsNeeded, sanitizeIntakeAnswers,
} from '@agap/shared';
import { useIncidentUnits, useLiveResponders, useRouteLine } from '@/features/map/hooks';
import {
  destinationFacilities, formatEta, legChip, trackingPhase, unitRoutePlan,
} from '@/features/map/live-tracking';
import { LegChip } from '@/components/map/LegChip';
import { useNow } from '@/lib/use-now';
import { UnitTrackingCard } from '@/components/dispatch/UnitTrackingCard';
import { categoryIcon, formatAffectedCount, titleCase, timeAgo, ACTIVE_STATUSES } from '@/lib/incident-format';
import type { IncidentListItem } from '@/features/incidents/api';
import type { ResourceRecommendation } from '@/features/dispatch/api';
import type { MapIncident } from '@/components/incidents/IncidentMapView';
import type { IncidentDetail } from '@/features/incidents/api';

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const DISPATCHABLE = ['ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING'];
/** A unit is already responding: "Dispatch another unit" keeps the incident status (MOD-31). */
const ADDITIONAL_DISPATCH: readonly string[] = ACTIVE_RESPONSE_INCIDENT_STATUSES;
/** Dispatches still holding a unit on the incident. */
const ACTIVE_DISPATCH = ['PENDING', 'SENT', 'ACCEPTED'];
const PRE_DISPATCH = ['SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING'];

const LIFECYCLE_ORDER = [
  'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING',
  'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING', 'RESOLVED', 'CLOSED',
];

const STEPS: Array<{ label: string; reached: string }> = [
  { label: 'Acknowledge', reached: 'ACKNOWLEDGED' },
  { label: 'Assess',      reached: 'ASSESSED' },
  { label: 'Dispatch',    reached: 'DISPATCHED' },
  { label: 'On scene',    reached: 'ON_SCENE' },
  { label: 'Resolved',    reached: 'RESOLVED' },
];

const PRIORITY_STRIP: Record<string, string> = {
  CRITICAL: 'shadow-[inset_4px_0_0_0_#ef4444]',
  HIGH:     'shadow-[inset_4px_0_0_0_#f97316]',
  MEDIUM:   'shadow-[inset_4px_0_0_0_#fbbf24]',
  LOW:      'shadow-[inset_4px_0_0_0_#10b981]',
};

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH:     'bg-orange-500',
  MEDIUM:   'bg-amber-400',
  LOW:      'bg-emerald-500',
};

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-agap-green';

/** Solid card in the stacked layout; deep frosted glass floating over the map from lg. */
const PANEL =
  'rounded-[24px] border border-slate-200/60 bg-white/90 shadow-[0_8px_30px_rgb(0,0,0,0.04)] lg:border-white/40 lg:bg-white/70 lg:shadow-[0_24px_48px_-12px_rgba(15,35,55,0.2),inset_0_0_0_1px_rgba(255,255,255,0.5)] lg:backdrop-blur-xl lg:backdrop-saturate-[1.1] transition-all duration-300';

/** From lg the panels cover the left 416px (xl: 456px), so centre the pill in what remains. */
const PILL_POSITION =
  'bottom-4 left-1/2 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 sm:bottom-6 lg:left-[calc(50%+208px)] lg:max-w-[calc(100%-448px)] xl:left-[calc(50%+228px)] xl:max-w-[calc(100%-488px)] transition-all duration-500 ease-out';

const PILL =
  'pointer-events-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 rounded-full ring-1 ring-white/10 bg-slate-900/90 px-5 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-md';

const DESKTOP_QUERY = '(min-width: 1024px)';

function km(meters: number | null): string {
  if (meters == null) return 'n/a';
  return `${(meters / 1000).toFixed(2)} km`;
}

function etaMins(meters: number | null): number | null {
  if (meters == null) return null;
  return Math.max(1, Math.round((meters / 1000) * 2));
}

const IncidentMapView = dynamic(
  () => import('@/components/incidents/IncidentMapView').then((m) => m.IncidentMapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-slate-50">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <svg className="h-4 w-4 animate-spin text-[#126247]" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
          Loading operations map…
        </span>
      </div>
    ),
  },
);

export default function DispatchPage(): JSX.Element {
  const wsState = useWsState();
  const { data: incidents = [], isLoading } = useDispatchQueue();
  const { data: availableUnits = [] } = useAvailableUnits();
  const { data: responders } = useLiveResponders();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [followUnit, setFollowUnit] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);

  useEffect(() => {
    setFollowUnit(false);
  }, [selectedId]);

  // One panel, two views (queue ⇄ incident). Moving between them keeps focus with the user:
  // opening an incident focuses its view; going back refocuses the row it came from.
  const panelRef = useRef<HTMLElement>(null);
  const detailViewRef = useRef<HTMLDivElement>(null);
  const queueListRef = useRef<HTMLDivElement>(null);
  const previousId = useRef<string | null>(null);
  useEffect(() => {
    const from = previousId.current;
    previousId.current = selectedId;
    if (selectedId && !from) {
      detailViewRef.current?.focus({ preventScroll: true });
      // Stacked layout: the panel sits under the map, possibly off-screen.
      if (!window.matchMedia(DESKTOP_QUERY).matches) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        panelRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    } else if (!selectedId && from) {
      queueListRef.current?.querySelector<HTMLElement>(`[data-incident-id="${from}"]`)?.focus();
    }
  }, [selectedId]);

  const queue = useMemo(
    () =>
      incidents
        .filter((i: IncidentListItem) => PRE_DISPATCH.includes(i.status))
        .filter((i) => {
          if (!search.trim()) return true;
          const q = search.toLowerCase();
          return (
            i.public_reference.toLowerCase().includes(q) ||
            (i.incident_locations?.barangay ?? '').toLowerCase().includes(q) ||
            i.category.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => {
          const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
          if (pr !== 0) return pr;
          return +new Date(a.submitted_at) - +new Date(b.submitted_at);
        }),
    [incidents, search],
  );

  const mapIncidents = useMemo<MapIncident[]>(
    () =>
      incidents
        .filter((i) => ACTIVE_STATUSES.includes(i.status))
        .map((i) => ({
          id: i.id,
          public_reference: i.public_reference,
          category: i.category,
          priority: i.priority,
          status: i.status,
          lat: i.incident_locations?.latitude ?? null,
          lng: i.incident_locations?.longitude ?? null,
          reporter_sex: i.reporter_sex ?? null,
          reporter_is_guest: i.incident_reporters?.is_guest ?? null,
        })),
    [incidents],
  );

  const criticalCount = useMemo(() => incidents.filter((i) => ACTIVE_STATUSES.includes(i.status) && i.priority === 'CRITICAL').length, [incidents]);
  const awaitingCount = queue.length;
  const activeCount = useMemo(() => incidents.filter((i) => ACTIVE_STATUSES.includes(i.status)).length, [incidents]);
  const availableCount = availableUnits.length;

  // Previous / next within the queue while an incident is open (a map pick may be outside it).
  const queueIndex = selectedId ? queue.findIndex((i) => i.id === selectedId) : -1;
  const prevId = queueIndex > 0 ? queue[queueIndex - 1]?.id ?? null : null;
  const nextId = queueIndex >= 0 ? queue[queueIndex + 1]?.id ?? null : null;

  const { data: selectedIncident } = useIncident(selectedId);
  const phase = trackingPhase(selectedIncident?.dispatches);
  const tracked = useMemo(() => pickTrackedUnit(selectedIncident, responders ?? []), [selectedIncident, responders]);
  const scene = useMemo(() => {
    const loc = selectedIncident?.incident_locations;
    return loc?.latitude != null && loc?.longitude != null ? { lat: Number(loc.latitude), lng: Number(loc.longitude) } : null;
  }, [selectedIncident]);
  const { data: units } = useIncidentUnits(selectedId, phase === 'accepted');
  const trackedUnit = units?.find((u) => u.dispatchId === tracked.dispatchId) ?? null;
  const plan = unitRoutePlan(trackedUnit, scene);
  const fromPoint = tracked.position ?? trackedUnit?.position ?? null;
  const route = useRouteLine(phase === 'accepted' && plan.fallbackTo ? fromPoint : null, phase === 'accepted' ? plan.fallbackTo : null);
  const now = useNow(5_000);
  const routeGeometry = phase === 'accepted' ? plan.server?.geometry ?? route.data?.geometry ?? null : null;
  const routeDistance = plan.server?.distanceMeters ?? (plan.fallbackTo ? route.data?.distanceMeters : null) ?? null;
  const routeLastKnown = isRouteLastKnown(plan.server, now);
  const trackedEtaSeconds = trackedUnit?.eta.seconds ?? plan.server?.durationSeconds ?? route.data?.durationSeconds ?? null;
  const trackedChip = legChip(trackedUnit);
  const unitLegs = useMemo(() => Object.fromEntries((units ?? []).map((u) => [u.dispatchId, legChip(u)])), [units]);
  const facilities = useMemo(() => destinationFacilities(units), [units]);

  const recQuery = useDispatchRecommendations(phase === 'none' ? selectedId : null);
  const nearestMeters = useMemo(() => {
    const ds = (recQuery.data ?? []).map((r) => r.distanceMeters).filter((d): d is number => d != null);
    return ds.length ? Math.min(...ds) : null;
  }, [recQuery.data]);

  return (
    <div className="flex flex-col gap-4 lg:relative lg:block lg:h-[calc(100dvh-6.5rem)] lg:min-h-[560px] lg:overflow-hidden lg:rounded-[24px] lg:border lg:border-slate-200 lg:bg-[#f8fafc] lg:shadow-sm lg:[html[data-ops-nav=dock]_&]:h-[calc(100dvh-11rem)] animate-in fade-in duration-500">
      
      {/* ── Map ───────────────────────────────────────────────────────────── */}
      <div className="relative h-[46vh] min-h-[280px] overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50 shadow-sm sm:h-[52vh] lg:absolute lg:inset-0 lg:h-auto lg:min-h-0 lg:rounded-none lg:border-0 lg:shadow-none">
        <div className="absolute inset-0">
          <IncidentMapView
            incidents={mapIncidents}
            responders={responders ?? []}
            selectedId={selectedId}
            onSelect={setSelectedId}
            tracking={{ dispatchId: tracked.dispatchId, follow: followUnit, onFollowChange: setFollowUnit, fitRequest }}
            routeGeometry={routeGeometry}
            routeStyle={plan.leg === 'TO_FACILITY' ? 'TO_FACILITY' : 'TO_SCENE'}
            routeLastKnown={routeLastKnown}
            facilities={phase === 'accepted' ? facilities : []}
            unitLegs={unitLegs}
          />
        </div>

        {/* ── Top-right: connection + live indicator ─────────────────────── */}
        <div className="pointer-events-none absolute right-4 top-4 z-[1000]">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/60 bg-white/80 px-3.5 py-1.5 shadow-sm backdrop-blur-md transition-all">
            <Wifi size={13} aria-hidden="true" className={wsState === 'connected' ? 'text-emerald-500' : 'text-slate-400'} />
            <div className="scale-90"><ConnectionIndicator state={wsState} /></div>
          </div>
        </div>

        {/* ── Bottom: ETA pill ────────────────────────────────────────────── */}
        {selectedId && phase === 'accepted' && tracked.dispatchId ? (
          <div className={`pointer-events-none absolute z-[1000] ${PILL_POSITION} animate-in slide-in-from-bottom-4 fade-in duration-500`}>
            <div className={PILL}>
              <Navigation size={14} aria-hidden="true" className="text-emerald-400 shrink-0" />
              <span className="text-[13px] font-semibold text-white tracking-wide">{tracked.callSign ?? 'Assigned unit'}</span>
              <LegChip chip={trackedChip} tone="dark" />
              {plan.leg !== 'AT_FACILITY' && (
                <>
                  {routeDistance != null && (
                    <>
                      <span aria-hidden="true" className="text-white/20">·</span>
                      <span className="font-mono text-sm font-medium text-emerald-50 tabular-nums">{km(routeDistance)}</span>
                    </>
                  )}
                  <span aria-hidden="true" className="text-white/20">·</span>
                  <span className="text-sm font-medium text-emerald-50 tabular-nums">{formatEta(trackedEtaSeconds)}</span>
                  <span className="rounded bg-emerald-500/20 border border-emerald-400/30 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 uppercase tracking-widest">
                    est
                  </span>
                  {routeLastKnown && (
                    <span className="rounded bg-amber-500/20 border border-amber-400/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-300">
                      last known
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        ) : selectedId && phase === 'none' && nearestMeters != null ? (
          <div className={`pointer-events-none absolute z-[1000] ${PILL_POSITION} animate-in slide-in-from-bottom-4 fade-in duration-500`}>
            <div className={PILL}>
              <Navigation size={14} aria-hidden="true" className="text-emerald-400 shrink-0" />
              <span className="font-mono text-[13px] font-semibold text-white tabular-nums">{km(nearestMeters)}</span>
              <span aria-hidden="true" className="text-white/20">·</span>
              <span className="text-[13px] font-medium text-emerald-50 tabular-nums">
                ~{etaMins(nearestMeters)} min
              </span>
              <span className="rounded bg-emerald-500/20 border border-emerald-400/30 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 uppercase tracking-widest">
                nearest unit
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Dispatch panel: one drawer that navigates queue ⇄ incident ─────── */}
      <section
        ref={panelRef}
        aria-label="Dispatch"
        className={`flex min-h-0 scroll-mt-4 flex-col overflow-hidden ${PANEL} animate-in slide-in-from-left-4 fade-in duration-500 lg:absolute lg:left-4 lg:top-4 lg:z-[1000] lg:max-h-[calc(100%-2rem)] lg:w-[420px] xl:w-[460px] ${
          selectedId ? 'lg:bottom-4' : ''
        }`}
      >
        {/* Queue view — stays mounted while an incident is open, so the list keeps its scroll position. */}
        <div className={`min-h-0 flex-1 flex-col animate-in slide-in-from-left-4 fade-in duration-300 motion-reduce:animate-none ${selectedId ? 'hidden' : 'flex'}`}>

          {/* Stats Grid */}
          <dl className="grid shrink-0 grid-cols-2 gap-px bg-slate-200/50 p-[1px] sm:grid-cols-4">
            <StatCard value={criticalCount} label="Critical" tone="danger" pulse={criticalCount > 0} />
            <StatCard value={awaitingCount} label="Awaiting" tone="amber" />
            <StatCard value={activeCount} label="Active" tone="info" />
            <StatCard value={availableCount} label="Units" tone="green" />
          </dl>

          {/* Header & Search */}
          <div className="shrink-0 border-b border-slate-100 bg-white/50 px-5 py-4 backdrop-blur-md">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[15px] font-bold text-slate-900 tracking-tight">Dispatch Queue</h2>
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 ring-1 ring-inset ring-emerald-500/20">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-700">Live</span>
                </div>
              </div>
              {queue.length > 0 && (
                <span className="flex h-6 items-center justify-center rounded-full bg-amber-100 px-2.5 text-[11px] font-bold text-amber-700 tabular-nums">
                  {queue.length}
                </span>
              )}
            </div>

            <div className="group relative flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3.5 pr-1.5 shadow-sm transition-all focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20">
              <Search size={14} className="shrink-0 text-slate-400 group-focus-within:text-emerald-500 transition-colors" aria-hidden="true" />
              <input
                id="dispatch-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reference, barangay..."
                className="h-full w-full bg-transparent text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 active:scale-95"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Queue list */}
          <div ref={queueListRef} className="min-h-0 max-h-[60vh] flex-1 overflow-y-auto bg-white/40 scrollbar-thin lg:max-h-none">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : queue.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-10 text-center animate-in fade-in duration-300">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
                  <CheckCircle2 size={20} className="text-emerald-500" aria-hidden="true" />
                </div>
                <p className="text-[14px] font-bold text-slate-900">
                  {search.trim() ? 'No matching incidents' : 'Queue is clear'}
                </p>
                <p className="mt-1 max-w-[200px] text-xs leading-relaxed text-slate-500">
                  {search.trim() ? 'Try adjusting your search terms.' : 'All incidents have been successfully dispatched.'}
                </p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-slate-100/60">
                {queue.map((inc) => (
                  <li key={inc.id}>
                    <QueueRow incident={inc} selected={inc.id === selectedId} onSelect={() => setSelectedId(inc.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Incident view — replaces the queue inside the same panel. */}
        {selectedId && (
          <div
            ref={detailViewRef}
            tabIndex={-1}
            aria-label="Selected incident"
            role="region"
            onKeyDown={(e) => {
              // Escape goes back, except while typing (it would drop unsent dispatch notes).
              const el = e.target as HTMLElement;
              if (e.key === 'Escape' && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) setSelectedId(null);
            }}
            className="flex min-h-0 flex-1 flex-col outline-none animate-in slide-in-from-right-4 fade-in duration-300 motion-reduce:animate-none"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/60 bg-white/80 px-2.5 py-2 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 ${FOCUS_RING}`}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Dispatch queue
                {queue.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-bold leading-5 text-amber-700 tabular-nums">
                    {queue.length}
                  </span>
                )}
              </button>
              {queueIndex >= 0 && queue.length > 1 && (
                <div className="flex items-center gap-1">
                  <span className="mr-1 text-xs font-medium text-slate-500 tabular-nums">
                    {queueIndex + 1} of {queue.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => prevId && setSelectedId(prevId)}
                    disabled={!prevId}
                    aria-label="Previous incident in queue"
                    title="Previous incident"
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-35 ${FOCUS_RING}`}
                  >
                    <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => nextId && setSelectedId(nextId)}
                    disabled={!nextId}
                    aria-label="Next incident in queue"
                    title="Next incident"
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-35 ${FOCUS_RING}`}
                  >
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            {/* Keyed so the tab and form state reset when moving to another incident. */}
            <DispatchDetail
              key={selectedId}
              incidentId={selectedId}
              onDispatched={() => setSelectedId(null)}
              trackedDispatchId={tracked.dispatchId}
              followUnit={followUnit}
              onToggleFollow={() => setFollowUnit((f) => !f)}
              onFit={() => { setFollowUnit(false); setFitRequest((n) => n + 1); }}
            />
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Tracked unit ────────────────────────────────────────────────────────────

/**
 * The selected incident's accepted unit to highlight, follow and route: the
 * first ACCEPTED dispatch, with its live position from the ops feed (one row
 * per dispatch). Position is null until the crew's first GPS fix.
 */
function pickTrackedUnit(
  incident: IncidentDetail | undefined,
  responders: ReadonlyArray<{ dispatchId?: string; lat: number; lng: number; call_sign?: string | null }>,
): { dispatchId: string | null; position: { lat: number; lng: number } | null; callSign: string | null } {
  const accepted = incident?.dispatches?.find((d) => d.status === 'ACCEPTED');
  if (!accepted) return { dispatchId: null, position: null, callSign: null };
  const fix = responders.find((r) => r.dispatchId === accepted.id);
  return {
    dispatchId: accepted.id,
    position: fix ? { lat: fix.lat, lng: fix.lng } : null,
    callSign: fix?.call_sign ?? null,
  };
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ value, label, tone, pulse }: { value: number; label: string; tone: 'danger' | 'amber' | 'info' | 'green'; pulse?: boolean; }): JSX.Element {
  const tones = {
    danger: { num: 'text-red-600', label: 'text-red-700', dot: 'bg-red-500', bg: 'bg-white' },
    amber:  { num: 'text-amber-600', label: 'text-amber-700', dot: 'bg-amber-500', bg: 'bg-white' },
    info:   { num: 'text-blue-600', label: 'text-blue-700', dot: 'bg-blue-500', bg: 'bg-white' },
    green:  { num: 'text-emerald-600', label: 'text-emerald-700', dot: 'bg-emerald-500', bg: 'bg-white' },
  };
  const t = tones[tone] ?? tones['green']!;
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 p-3 sm:py-4 ${t.bg} transition-colors hover:bg-slate-50`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${t.dot} ${pulse ? 'animate-pulse' : ''} shadow-sm`} />
      <dd className={`font-mono text-xl font-bold leading-none tabular-nums tracking-tight sm:text-2xl ${t.num}`}>{value}</dd>
      <dt className={`text-[9px] font-bold uppercase tracking-[0.15em] ${t.label}`}>{label}</dt>
    </div>
  );
}

// ─── Queue row ──────────────────────────────────────────────────────────────

function QueueRow({ incident, selected, onSelect }: { incident: IncidentListItem; selected: boolean; onSelect: () => void; }): JSX.Element {
  const Icon = categoryIcon(incident.category);
  const strip = PRIORITY_STRIP[incident.priority] ?? 'shadow-[inset_4px_0_0_0_#cbd5e1]';
  const dot = PRIORITY_DOT[incident.priority] ?? 'bg-slate-400';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-incident-id={incident.id}
      className={`relative flex w-full items-start gap-3.5 px-5 py-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/50 ${strip} ${
        selected ? 'bg-emerald-50/80 shadow-[inset_4px_0_0_0_#126247]' : 'hover:bg-slate-50/80'
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm transition-colors ${
        selected ? 'bg-emerald-100 text-emerald-700' : 'bg-white border border-slate-200 text-slate-500'
      }`}>
        <Icon size={18} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-mono text-[13px] font-bold text-slate-900 tracking-tight">{incident.public_reference}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {incident.priority}
            </span>
          </div>
        </div>
        <p className="mt-1 truncate text-[12px] font-medium text-slate-500">
          {incident.incident_locations?.barangay ?? titleCase(incident.category)}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <StatusChip status={incident.status} />
          <span className="text-[11px] text-slate-400 font-medium">{timeAgo(incident.submitted_at)}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Lifecycle stepper ──────────────────────────────────────────────────────

function LifecycleStepper({ status }: { status: string }): JSX.Element {
  const current = LIFECYCLE_ORDER.indexOf(status);
  return (
    <div className="flex items-center" role="list" aria-label="Incident progress">
      {STEPS.map((step, i) => {
        const stepIdx = LIFECYCLE_ORDER.indexOf(step.reached);
        const done = current >= stepIdx;
        const prevStep = STEPS[i - 1];
        const isCurrent = !done && (i === 0 || (prevStep != null && current >= LIFECYCLE_ORDER.indexOf(prevStep.reached)));
        return (
          <div key={step.label} role="listitem" aria-current={isCurrent ? 'step' : undefined} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex w-full items-center" aria-hidden="true">
              <span className={`h-0.5 flex-1 transition-colors duration-500 ${i === 0 ? 'opacity-0' : done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold transition-all duration-500 ${
                done ? 'bg-emerald-500 text-white shadow-sm' : isCurrent ? 'bg-white ring-2 ring-emerald-500 text-emerald-600 scale-110 shadow-sm' : 'bg-slate-100 text-slate-400'
              }`}>
                {done ? <CheckCircle2 size={12} strokeWidth={3} /> : i + 1}
              </span>
              <span className={`h-0.5 flex-1 transition-colors duration-500 ${i === STEPS.length - 1 ? 'opacity-0' : current > stepIdx ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            </div>
            <span aria-hidden="true" className={`mt-2 max-w-full truncate text-[10px] font-semibold uppercase tracking-wider transition-colors duration-300 ${
              done || isCurrent ? 'text-slate-700' : 'text-slate-400'
            }`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Route points ────────────────────────────────────────────────────────────

function RoutePoints({ sceneAddress, unitLabel, destination }: { sceneAddress: string; unitLabel: string | null; destination: string | null; }): JSX.Element {
  const points = [
    { color: 'bg-emerald-500', ring: 'ring-emerald-100', label: 'Incident Scene', value: sceneAddress },
    { color: 'bg-blue-500', ring: 'ring-blue-100', label: 'Assigned Unit', value: unitLabel ?? 'Not yet dispatched' },
    { color: 'bg-slate-400', ring: 'ring-slate-100', label: 'Destination', value: destination ?? 'To be determined' },
  ];
  return (
    <div className="relative pl-2 py-1">
      {points.map((p, i) => (
        <div key={p.label} className="group relative flex gap-4 pb-5 last:pb-0">
          {i < points.length - 1 && <span className="absolute left-[5px] top-5 h-[calc(100%-8px)] w-0.5 rounded-full bg-slate-200" />}
          <span className={`relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full ${p.color} ring-4 ${p.ring} transition-transform group-hover:scale-110`} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{p.label}</p>
            <p className="mt-0.5 truncate text-[13px] font-medium text-slate-800">{p.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Detail + recommendation panel ──────────────────────────────────────────

function DispatchDetail({
  incidentId, onDispatched, trackedDispatchId, followUnit, onToggleFollow, onFit,
}: {
  incidentId: string; onDispatched: () => void; trackedDispatchId: string | null; followUnit: boolean; onToggleFollow: () => void; onFit: () => void;
}): JSX.Element {
  const { data: incident, isLoading } = useIncident(incidentId);
  const [tab, setTab] = useState<'dispatch' | 'route'>('dispatch');
  // Which incident the "Dispatch another unit" panel is open for; selecting another closes it.
  const [addingUnitFor, setAddingUnitFor] = useState<string | null>(null);
  // Keeps the dispatch panel open while its units go out one by one (the first one
  // already gives the incident a dispatch), and keeps a partial failure in view after.
  const [sendingUnits, setSendingUnits] = useState(false);
  const [dispatchIssue, setDispatchIssue] = useState<string | null>(null);

  if (isLoading || !incident) {
    return (
      <div className="space-y-4 p-5">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const Icon = categoryIcon(incident.category);
  const loc = incident.incident_locations;
  const address = loc?.formatted_address ?? ([loc?.barangay, loc?.municipality, loc?.province].filter(Boolean).join(', ') || 'Address not available');
  const phase = trackingPhase(incident.dispatches);
  const hasDispatch = phase !== 'none';
  const dispatchable = DISPATCHABLE.includes(incident.status);
  const canAddUnit = hasDispatch && ADDITIONAL_DISPATCH.includes(incident.status);
  const addingUnit = canAddUnit && addingUnitFor === incident.id;
  const activeUnits = (incident.dispatches ?? []).filter((d) => ACTIVE_DISPATCH.includes(d.status)).length;
  const unitLabel = phase === 'accepted' ? 'Unit accepted — tracking live' : phase === 'awaiting' ? 'Awaiting crew acceptance' : phase === 'closed' ? 'No active unit' : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white/60">
      {/* Header */}
      <div className="flex items-start gap-4 border-b border-slate-200/60 bg-white/80 px-5 py-5 backdrop-blur-sm">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm ${
          incident.priority === 'CRITICAL' ? 'bg-red-50 text-red-600 border border-red-100'
          : incident.priority === 'HIGH' ? 'bg-orange-50 text-orange-600 border border-orange-100'
          : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
        }`}>
          <Icon size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="truncate text-[16px] font-bold text-slate-900 leading-tight">{titleCase(incident.category)}</h2>
          <p className="font-mono text-[12px] font-medium text-slate-500 mt-1">{incident.public_reference}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <PriorityBadge priority={incident.priority} />
            <StatusChip status={incident.status} />
            {activeUnits > 0 && (
              <Badge variant="blue">
                <Truck size={11} aria-hidden="true" /> {activeUnits} unit{activeUnits === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
        </div>
        {/* Closing is the "Dispatch queue" back button above; this opens the full page. */}
        <Link
          href={`/operations/dispatch/${incident.id}`}
          title="Open full incident details"
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm transition-all hover:border-emerald-300 hover:text-emerald-600 active:scale-95 ${FOCUS_RING}`}
        >
          <ExternalLink size={14} aria-hidden="true" />
          Details
        </Link>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Incident views" className="flex gap-6 border-b border-slate-200/60 bg-white/80 px-6 backdrop-blur-sm">
        <TabButton id="dispatch" active={tab === 'dispatch'} onClick={() => setTab('dispatch')}>Dispatch Control</TabButton>
        <TabButton id="route" active={tab === 'route'} onClick={() => setTab('route')}>Location & Route</TabButton>
      </div>

      {/* Stepper */}
      <div className="border-b border-slate-200/60 bg-white px-4 pb-4 pt-5 shadow-[0_4px_12px_rgb(0,0,0,0.02)] sm:px-6 z-10">
        <LifecycleStepper status={incident.status} />
      </div>

      {/* Body */}
      <div role="tabpanel" id={`dispatch-tabpanel-${tab}`} aria-labelledby={`dispatch-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 p-5 scrollbar-thin">
        {tab === 'route' ? (
          <div className="space-y-4 animate-in fade-in duration-300">
            <RoutePoints sceneAddress={address} unitLabel={unitLabel} destination={null} />
            {formatAffectedCount(incident.hazard_flags, incident.number_of_patients) && (
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] font-medium text-slate-600 shadow-sm">
                <Users size={16} className="shrink-0 text-emerald-500" />
                <span>Affected: <strong className="text-slate-900">{formatAffectedCount(incident.hazard_flags, incident.number_of_patients)}</strong></span>
              </div>
            )}
          </div>
        ) : (
          <div className="animate-in fade-in duration-300">
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
              <MapPin size={16} className="mt-0.5 shrink-0 text-emerald-500" />
              <span className="text-[13px] font-medium text-slate-700 leading-relaxed">{address}</span>
            </div>
            {hasDispatch && !sendingUnits ? (
              <div className="space-y-4">
                {dispatchIssue && (
                  <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span className="flex-1">{dispatchIssue}</span>
                    <button type="button" onClick={() => setDispatchIssue(null)} aria-label="Dismiss" className={`shrink-0 rounded text-amber-700 hover:text-amber-900 ${FOCUS_RING}`}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <UnitTrackingCard incidentId={incident.id} dispatches={incident.dispatches} trackedDispatchId={trackedDispatchId} follow={followUnit} onToggleFollow={onToggleFollow} onFit={onFit} />
                {addingUnit ? (
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13px] font-bold text-slate-900">Dispatch another unit</p>
                      <Button variant="secondary" size="sm" onClick={() => setAddingUnitFor(null)}>Cancel</Button>
                    </div>
                    {/* Closing this view keeps the tracking card; the incident status doesn't change. */}
                    <RecommendationPanel
                      incidentId={incident.id}
                      onDispatched={() => { setDispatchIssue(null); setAddingUnitFor(null); }}
                      onPartialDispatch={setDispatchIssue}
                    />
                  </div>
                ) : canAddUnit ? (
                  <Button variant="secondary" className="w-full" onClick={() => setAddingUnitFor(incident.id)}>
                    <Truck size={16} aria-hidden="true" /> Dispatch another unit
                  </Button>
                ) : null}
              </div>
            ) : dispatchable || sendingUnits ? (
              <RecommendationPanel
                incidentId={incident.id}
                onDispatched={onDispatched}
                onBusyChange={setSendingUnits}
                onPartialDispatch={setDispatchIssue}
              />
            ) : (
              <PreDispatchActions incidentId={incident.id} status={incident.status} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({ id, active, onClick, children }: { id: string; active: boolean; onClick: () => void; children: ReactNode; }): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      id={`dispatch-tab-${id}`}
      aria-selected={active}
      aria-controls={`dispatch-tabpanel-${id}`}
      onClick={onClick}
      className={`relative -mb-px px-1 py-3.5 text-[13px] font-bold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/50 ${
        active ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
      {active && <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-emerald-500" />}
    </button>
  );
}

// ─── Pre-dispatch lifecycle advance ──────────────────────────────────────────

function PreDispatchActions({ incidentId, status }: { incidentId: string; status: string }): JSX.Element {
  const update = useUpdateIncidentStatus();
  const next = status === 'SUBMITTED' ? { to: 'RECEIVED', label: 'Mark as Received' } : status === 'RECEIVED' ? { to: 'ACKNOWLEDGED', label: 'Acknowledge Incident' } : null;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[13px] font-medium text-slate-600 leading-relaxed">
        Advance this incident to acknowledge and assess it before a unit can be dispatched.
      </p>
      {update.isError && <p className="text-[13px] font-semibold text-red-600">{(update.error as Error)?.message ?? 'Transition failed.'}</p>}
      {next && (
        <Button variant="primary" className="w-full shadow-md" loading={update.isPending} onClick={() => update.mutate({ id: incidentId, status: next.to })}>
          {next.label}
        </Button>
      )}
    </div>
  );
}

// ─── MOD-29/30 recommendation panel ─────────────────────────────────────────

function RecommendationPanel({
  incidentId, onDispatched, onBusyChange, onPartialDispatch,
}: {
  incidentId: string;
  onDispatched: () => void;
  /** True while the selected units are being sent, one dispatch each. */
  onBusyChange?: (busy: boolean) => void;
  /** Some units went out and one failed; the message outlives this panel. */
  onPartialDispatch?: (message: string) => void;
}): JSX.Element {
  const { data: incident } = useIncident(incidentId);
  const { data: incidentDispatches, isFetching: dispatchesFetching } = useIncidentDispatches(incidentId);
  const { data: recommendations, isLoading, isFetching: recommendationsFetching, isError, refetch } = useDispatchRecommendations(incidentId);
  const { data: availableUnits, isFetching: unitsFetching } = useAvailableUnits();
  const { data: responders = [], isLoading: respondersLoading, isError: respondersError, refetch: refetchResponders } = useResponders({ perPage: 100 });
  const createDispatch = useCreateDispatch();
  const [plan, setPlan] = useState<UnitSelectionPlan | null>(null);
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [crewByUnit, setCrewByUnit] = useState<Record<string, string[]>>({});
  const [crewTarget, setCrewTarget] = useState<string | null>(null);
  const [showCrew, setShowCrew] = useState(false);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableResponders = useMemo(() => responders.filter((r) => r.availability_status === 'AVAILABLE'), [responders]);
  const availableResponderIds = useMemo(() => new Set(availableResponders.map((r) => r.id)), [availableResponders]);
  const activeDispatches = useMemo(() => (incidentDispatches ?? []).filter((d) => ACTIVE_DISPATCH.includes(d.status)), [incidentDispatches]);
  // A responder on a unit already responding can't also crew a new one (RESPONDER_ALREADY_ON_INCIDENT).
  const busyResponderIds = useMemo(() => new Set(activeDispatches.flatMap((d) => d.dispatch_crew.map((c) => c.user_id))), [activeDispatches]);

  const needs = useMemo(
    () => incident ? recommendUnitsNeeded(incident.category, sanitizeIntakeAnswers(incident.category, incident.incident_details?.caller_answers)) : [],
    [incident],
  );

  // Ranked recommendations first, then any other AVAILABLE unit; each with its home crew.
  const units = useMemo(() => {
    const byId = new Map<string, CandidateUnit & { label: string }>();
    const crewOf = new Map((availableUnits ?? []).map((u) => [u.id, (u.crew ?? []).map((c) => c.id)]));
    for (const r of recommendations ?? []) {
      byId.set(r.resourceId, { id: r.resourceId, resourceType: r.resourceType, crewIds: crewOf.get(r.resourceId) ?? [], label: r.callSign ?? r.resourceName });
    }
    for (const u of availableUnits ?? []) {
      if (!byId.has(u.id)) byId.set(u.id, { id: u.id, resourceType: u.resource_type, crewIds: crewOf.get(u.id) ?? [], label: u.call_sign ?? u.name });
    }
    return byId;
  }, [recommendations, availableUnits]);
  const crewNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const u of availableUnits ?? []) for (const c of u.crew ?? []) names.set(c.id, c.full_name);
    for (const r of responders) names.set(r.id, r.full_name);
    return names;
  }, [availableUnits, responders]);
  const unitLabel = (id: string) => units.get(id)?.label ?? 'Unit';

  // Pre-select once everything the plan reads is fresh (a cached list could miss a
  // unit sent moments ago). Later refetches never overwrite the dispatcher's changes.
  const ready = !!incident && !recommendationsFetching && !unitsFetching && !respondersLoading && !dispatchesFetching;
  useEffect(() => {
    if (!ready || plan) return;
    const next = planUnitSelection({
      needs,
      candidates: [...units.values()],
      respondingTypes: activeDispatches.map((d) => d.resources?.resource_type ?? ''),
      availableResponderIds,
      busyResponderIds,
    });
    setPlan(next);
    setUnitIds(next.unitIds);
    setCrewByUnit(next.crewByUnit);
  }, [ready, plan, needs, units, activeDispatches, availableResponderIds, busyResponderIds]);

  function toggleUnit(id: string) {
    setError(null);
    if (unitIds.includes(id)) {
      setUnitIds((prev) => prev.filter((x) => x !== id));
      setCrewByUnit(({ [id]: _removed, ...rest }) => rest);
      if (crewTarget === id) setCrewTarget(null);
      return;
    }
    const unit = units.get(id);
    const used = new Set([...busyResponderIds, ...Object.values(crewByUnit).flat()]);
    const crew = unit ? homeCrew(unit, availableResponderIds, used) : [];
    setUnitIds((prev) => [...prev, id]);
    setCrewByUnit((prev) => ({ ...prev, [id]: crew }));
  }

  // Manual crew picks go to one selected unit; a responder rides one unit only.
  const target = crewTarget && unitIds.includes(crewTarget) ? crewTarget : unitIds[0] ?? null;
  const crewIds = target ? crewByUnit[target] ?? [] : [];
  function toggleCrew(id: string) {
    if (!target) return;
    setCrewByUnit((prev) => {
      const onTarget = (prev[target] ?? []).includes(id);
      const next: Record<string, string[]> = {};
      for (const [unit, crew] of Object.entries(prev)) next[unit] = crew.filter((x) => x !== id);
      next[target] = onTarget ? next[target] ?? [] : [...(next[target] ?? []), id];
      return next;
    });
  }

  async function authorize() {
    if (!unitIds.length || sending) return;
    setSending(true);
    setError(null);
    onBusyChange?.(true);
    const sent: string[] = [];
    let failure: string | null = null;
    for (const id of unitIds) {
      const crew = crewByUnit[id] ?? [];
      try {
        await createDispatch.mutateAsync({
          incidentId,
          resourceId: id,
          ...(crew.length ? { initialCrewIds: crew } : {}),
          ...(notes.trim() ? { dispatchNotes: notes.trim() } : {}),
        });
        sent.push(id);
      } catch (err) {
        failure = `${unitLabel(id)}: ${(err as Error)?.message ?? 'Dispatch failed'}`;
        break;
      }
    }
    setSending(false);
    onBusyChange?.(false);
    if (!failure) {
      onDispatched();
      return;
    }
    // Units already sent stay sent; the rest stay selected so the dispatcher can retry.
    setUnitIds((prev) => prev.filter((x) => !sent.includes(x)));
    setError(`${failure} — try another unit.`);
    if (sent.length) {
      onPartialDispatch?.(
        `Dispatched ${sent.map(unitLabel).join(', ')}. Not dispatched — ${failure}. Use “Dispatch another unit” to send the rest.`,
      );
    }
  }

  const ranked = recommendations ?? [];
  const showFallback = !isLoading && !isError && ranked.length === 0;

  return (
    <div className="space-y-4">
      <UnitsNeeded plan={plan} unitLabel={unitLabel} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-amber-500 shrink-0" />
          <h3 className="text-[14px] font-bold text-slate-900">Recommended Units</h3>
        </div>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">System Match</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
          <p className="text-[13px] font-medium text-red-700">Couldn&apos;t load recommendations.</p>
          <Button variant="secondary" size="sm" className="mt-3 bg-white" onClick={() => void refetch()}>Retry Loading</Button>
        </div>
      ) : showFallback ? (
        <FallbackUnits units={availableUnits ?? []} selectedIds={unitIds} onToggle={toggleUnit} />
      ) : (
        <div className="space-y-2">
          {ranked.map((r) => <RecommendationRow key={r.resourceId} rec={r} selected={unitIds.includes(r.resourceId)} onSelect={() => toggleUnit(r.resourceId)} />)}
        </div>
      )}

      {unitIds.length > 0 && (
        <SelectedUnits
          unitIds={unitIds}
          crewByUnit={crewByUnit}
          unitLabel={unitLabel}
          crewName={(id) => crewNames.get(id) ?? 'Responder'}
          homeCrewCount={(id) => units.get(id)?.crewIds.length ?? 0}
        />
      )}

      {/* Crew selection */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-all duration-300">
        <button
          type="button"
          onClick={() => setShowCrew((v) => !v)}
          aria-expanded={showCrew}
          className={`flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/50 ${showCrew ? 'bg-slate-50 border-b border-slate-100' : 'hover:bg-slate-50'}`}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <UserCheck size={14} aria-hidden="true" />
            </div>
            <span className="text-[13px] font-bold text-slate-900">Assign Crew</span>
            {crewIds.length > 0 && <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">{crewIds.length}</span>}
            <span className="text-[11px] font-medium text-slate-500 hidden sm:inline-block">— {respondersLoading ? 'loading…' : `${availableResponders.length} available`}</span>
          </div>
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform">
            {showCrew ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </button>

        {showCrew && (
          <div id="dispatch-crew-list" className="p-3 space-y-2 max-h-64 overflow-y-auto scrollbar-thin bg-slate-50/50">
            {unitIds.length > 1 && target && (
              <div role="group" aria-label="Add crew to unit" className="flex flex-wrap items-center gap-1.5 pb-1">
                <span className="text-[11px] font-semibold text-slate-500">Add crew to:</span>
                {unitIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setCrewTarget(id)}
                    aria-pressed={id === target}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${FOCUS_RING} ${
                      id === target ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {unitLabel(id)}
                  </button>
                ))}
              </div>
            )}
            {!target ? (
              <p className="py-5 text-center text-[12px] font-medium text-slate-500">Select a unit first.</p>
            ) : respondersLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-[12px] font-medium text-slate-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-500" />
                Loading availability…
              </div>
            ) : respondersError ? (
              <div className="space-y-3 py-4 text-center">
                <p className="text-[13px] font-medium text-red-600">Couldn&apos;t load responders.</p>
                <Button variant="secondary" size="sm" className="bg-white shadow-sm" onClick={() => void refetchResponders()}>Retry</Button>
              </div>
            ) : availableResponders.length === 0 ? (
              <div className="space-y-1.5 py-5 text-center">
                <p className="text-[13px] font-bold text-slate-700">No responders available.</p>
                <p className="text-[12px] text-slate-500">Personnel must set their status to Available in the app.</p>
              </div>
            ) : (
              availableResponders.map((r) => {
                const selected = crewIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleCrew(r.id)}
                    aria-pressed={selected}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${FOCUS_RING} ${
                      selected ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2 transition-colors ${
                      selected ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white'
                    }`}>
                      {selected && <CheckCircle2 size={12} strokeWidth={3} className="text-white" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[13px] font-bold ${selected ? 'text-emerald-900' : 'text-slate-900'}`}>{r.full_name}</p>
                      {r.organization && <p className="truncate text-[11px] font-medium text-slate-500 mt-0.5">{r.organization.name}</p>}
                    </div>
                    <span className="shrink-0 rounded-md bg-emerald-100/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-500/20">
                      Avail
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="space-y-3 pt-2">
        <label htmlFor="dispatch-notes" className="block text-[13px] font-bold text-slate-700">
          Dispatch Notes <span className="font-normal text-slate-400 ml-1">(Optional)</span>
        </label>
        <textarea
          id="dispatch-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Approach from MacArthur Highway..."
          rows={2}
          className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-[13px] font-medium text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
        />
        {error && <p role="alert" className="text-[13px] font-semibold text-red-600">{error}</p>}

        <Button
          variant="primary"
          className="w-full h-12 text-[14px] font-bold shadow-md transition-all active:scale-[0.98] mt-2 bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 border border-emerald-800/20"
          disabled={unitIds.length === 0}
          loading={sending}
          onClick={() => void authorize()}
        >
          <Siren size={16} aria-hidden="true" />
          {unitIds.length > 1 ? `Authorize Dispatch (${unitIds.length} units)` : 'Authorize Dispatch'}
        </Button>
      </div>
    </div>
  );
}

function RecommendationRow({ rec, selected, onSelect }: { rec: ResourceRecommendation; selected: boolean; onSelect: () => void; }): JSX.Element {
  const required = rec.requiredCapabilities.length;
  const matched = rec.matchedCapabilities.length;
  const capVariant = required === 0 ? 'muted' : matched >= required ? 'green' : matched > 0 ? 'amber' : 'red';
  const capLabel = required === 0 ? 'No spec required' : `${matched}/${required} capability`;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group w-full rounded-xl border p-4 text-left transition-all duration-200 ${FOCUS_RING} ${
        selected ? 'border-emerald-500 bg-emerald-50 shadow-[0_4px_12px_rgba(16,185,129,0.15)] ring-1 ring-inset ring-emerald-500/20' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-bold shadow-sm transition-colors ${
            selected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
          }`}>
            {rec.rank}
          </span>
          <span className={`flex items-center gap-2 text-[14px] font-bold tracking-tight ${selected ? 'text-emerald-900' : 'text-slate-900'}`}>
            <Truck size={14} className={selected ? 'text-emerald-600' : 'text-slate-400'} />
            {rec.callSign ?? rec.resourceName}
          </span>
        </div>
        <span className="font-mono text-[12px] font-bold text-slate-400 tabular-nums">
          {rec.score.toFixed(0)} <span className="text-[10px] uppercase tracking-wider">pts</span>
        </span>
      </div>

      {/* Score bar */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all duration-500 ${selected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`} style={{ width: `${Math.min(100, Math.max(0, rec.score))}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge variant="muted" className="bg-slate-100">{titleCase(rec.resourceType)}</Badge>
        <Badge variant={capVariant}>{capLabel}</Badge>
        <Badge variant="blue">{km(rec.distanceMeters)}</Badge>
      </div>
      <p className="mt-2 text-[12px] font-medium leading-relaxed text-slate-500">{rec.rationale}</p>
    </button>
  );
}

function FallbackUnits({ units, selectedIds, onToggle }: { units: { id: string; name: string; call_sign: string | null; resource_type: string; base_barangay: string | null }[]; selectedIds: string[]; onToggle: (id: string) => void; }): JSX.Element {
  if (units.length === 0) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800">No units available right now.</div>;
  }
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-1">
      <p className="px-3 pt-2 text-[12px] font-medium text-slate-500">No ranked recommendations available. Showing active units:</p>
      {units.map((u) => (
        <button
          key={u.id}
          type="button"
          onClick={() => onToggle(u.id)}
          aria-pressed={selectedIds.includes(u.id)}
          className={`flex min-h-12 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border p-3 text-left transition-all ${FOCUS_RING} ${
            selectedIds.includes(u.id) ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-transparent hover:bg-white hover:border-slate-200 hover:shadow-sm'
          }`}
        >
          <span className="flex items-center gap-2 text-[13px] font-bold text-slate-900">
            <Truck size={14} className="text-slate-400" />
            {u.call_sign ?? u.name}
          </span>
          <span className="text-[11px] font-medium text-slate-500">
            {titleCase(u.resource_type)}{u.base_barangay ? ` · ${u.base_barangay}` : ''}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── MOD-29/30 units needed (pre-selection) ─────────────────────────────────

function UnitsNeeded({ plan, unitLabel }: { plan: UnitSelectionPlan | null; unitLabel: (id: string) => string }): JSX.Element {
  return (
    <section aria-label="Units needed" className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="shrink-0 text-emerald-600" aria-hidden="true" />
          <h3 className="text-[14px] font-bold text-slate-900">Units Needed</h3>
        </div>
        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Auto-selected</span>
      </div>

      {!plan ? (
        <Skeleton className="mt-3 h-10 w-full rounded-lg" />
      ) : plan.needs.length === 0 ? (
        <p className="mt-2 text-[12px] font-medium text-slate-600">No unit type suggested for this report. Choose the units below.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {plan.needs.map((n) => {
            const wanted = Math.max(0, n.need.count - n.responding);
            return (
              <li key={n.need.resourceType} className="text-[13px]">
                <p className="font-bold text-slate-900">
                  {n.need.count} × {resourceTypeLabel(n.need.resourceType)}
                  <span className="ml-1.5 font-medium text-slate-500">— {n.need.reasons.join(' · ')}</span>
                </p>
                <p className="mt-0.5 text-[12px] font-medium">
                  {n.responding > 0 && <span className="text-blue-700">{n.responding} already responding. </span>}
                  {n.unitIds.length > 0 && <span className="text-emerald-700">Selected: {n.unitIds.map(unitLabel).join(', ')}. </span>}
                  {n.alternativeUsed && (
                    <span className="text-amber-700">
                      No {resourceTypeLabel(n.need.resourceType).toLowerCase()} available, using {resourceTypeLabel(n.alternativeUsed).toLowerCase()}.{' '}
                    </span>
                  )}
                  {n.short > 0 && (
                    <span className={n.unitIds.length ? 'text-amber-700' : 'text-red-700'}>
                      {n.unitIds.length ? `Only ${n.unitIds.length} of ${wanted} available.` : 'None available right now.'}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] font-medium text-slate-500">
        Suggested from the report. Review the units and crew, then authorize.
      </p>
    </section>
  );
}

function SelectedUnits({
  unitIds, crewByUnit, unitLabel, crewName, homeCrewCount,
}: {
  unitIds: string[];
  crewByUnit: Record<string, string[]>;
  unitLabel: (id: string) => string;
  crewName: (id: string) => string;
  homeCrewCount: (id: string) => number;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[13px] font-bold text-slate-900">
        Selected ({unitIds.length} unit{unitIds.length === 1 ? '' : 's'})
      </p>
      <ul className="mt-2 space-y-1.5">
        {unitIds.map((id) => {
          const crew = crewByUnit[id] ?? [];
          return (
            <li key={id} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
              <span className="font-bold text-slate-800">{unitLabel(id)}</span>
              {crew.length > 0 ? (
                <span className="font-medium text-slate-600">Crew: {crew.map(crewName).join(', ')}</span>
              ) : (
                <span className="flex items-center gap-1 font-medium text-amber-700">
                  <AlertTriangle size={12} aria-hidden="true" />
                  {homeCrewCount(id) > 0 ? 'Home crew not on duty. Assign crew or the unit gets no alert.' : 'No crew assigned. Assign crew or the unit gets no alert.'}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
