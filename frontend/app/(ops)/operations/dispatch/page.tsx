'use client';

import { useMemo, useState, type JSX, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import {
  Siren, Truck, MapPin, Users, Sparkles, CheckCircle2, ExternalLink,
  Clock, Activity, Search, X, Navigation, UserCheck, ChevronDown, ChevronUp,
  Wifi,
} from 'lucide-react';
import {
  Button, PriorityBadge, StatusChip, Badge, Skeleton,
} from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { IncidentDetailDrawer } from '@/components/incidents/IncidentDetailDrawer';
import { useWsState } from '@/lib/use-ws-state';
import {
  useDispatchQueue, useDispatchRecommendations, useAvailableUnits, useCreateDispatch,
} from '@/features/dispatch/hooks';
import { useResponders } from '@/features/responders/hooks';
import { useIncident, useUpdateIncidentStatus } from '@/features/incidents/hooks';
import { useLiveResponders } from '@/features/map/hooks';
import { categoryIcon, titleCase, timeAgo, ACTIVE_STATUSES } from '@/lib/incident-format';
import type { IncidentListItem } from '@/features/incidents/api';
import type { ResourceRecommendation } from '@/features/dispatch/api';
import type { MapIncident } from '@/components/incidents/IncidentMapView';

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const DISPATCHABLE = ['ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING'];
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
];

const PRIORITY_STRIP: Record<string, string> = {
  CRITICAL: 'border-l-[3px] border-l-red-500',
  HIGH:     'border-l-[3px] border-l-orange-500',
  MEDIUM:   'border-l-[3px] border-l-amber-400',
  LOW:      'border-l-[3px] border-l-emerald-500',
};

const PRIORITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH:     'bg-orange-500',
  MEDIUM:   'bg-amber-400',
  LOW:      'bg-emerald-500',
};

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
      <div className="flex h-full w-full items-center justify-center bg-agap-surface text-sm text-agap-textSub">
        Loading map…
      </div>
    ),
  },
);

/**
 * MOD-31 — Dispatcher Assignment and Authorization, map-centric layout.
 */
export default function DispatchPage(): JSX.Element {
  const wsState = useWsState();
  const { data: incidents = [], isLoading } = useDispatchQueue();
  const { data: availableUnits = [] } = useAvailableUnits();
  const { data: responders } = useLiveResponders();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');

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
        })),
    [incidents],
  );

  const criticalCount = useMemo(
    () => incidents.filter((i) => ACTIVE_STATUSES.includes(i.status) && i.priority === 'CRITICAL').length,
    [incidents],
  );
  const awaitingCount = queue.length;
  const activeCount = useMemo(
    () => incidents.filter((i) => ACTIVE_STATUSES.includes(i.status)).length,
    [incidents],
  );
  const availableCount = availableUnits.length;

  const recQuery = useDispatchRecommendations(selectedId);
  const nearestMeters = useMemo(() => {
    const ds = (recQuery.data ?? [])
      .map((r) => r.distanceMeters)
      .filter((d): d is number => d != null);
    return ds.length ? Math.min(...ds) : null;
  }, [recQuery.data]);

  return (
    <div className="relative h-[calc(100vh-6.5rem)] min-h-[560px] overflow-hidden rounded-xl border border-agap-track/40 shadow-panel">
      {/* ── Full-bleed map ────────────────────────────────────────────────── */}
      <div className="absolute inset-0">
        <IncidentMapView
          incidents={mapIncidents}
          responders={responders ?? []}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* ── Top-right: connection + live indicator ─────────────────────── */}
      <div className="pointer-events-none absolute right-3 top-3 z-[1000]">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-1 shadow-card backdrop-blur-sm border border-agap-track/30">
          <Wifi size={12} className={wsState === 'connected' ? 'text-agap-green' : 'text-agap-textSub'} />
          <ConnectionIndicator state={wsState} />
        </div>
      </div>

      {/* ── Left column: stats + queue + selected detail ──────────────── */}
      <div className="absolute left-3 top-3 z-[1000] flex max-h-[calc(100%-1.5rem)] w-[370px] max-w-[calc(100%-1.5rem)] flex-col gap-2.5">

        {/* Stats + search + queue */}
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-white shadow-panel border border-agap-track/30">

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-px bg-agap-track/20 border-b border-agap-track/30">
            <StatCard value={criticalCount} label="Critical"  tone="danger" pulse={criticalCount > 0} />
            <StatCard value={awaitingCount} label="Awaiting"  tone="amber" />
            <StatCard value={activeCount}   label="Active"    tone="info" />
            <StatCard value={availableCount} label="Units"    tone="green" />
          </div>

          {/* Search */}
          <div className="px-3 py-2.5 border-b border-agap-track/20">
            <div className="flex items-center gap-2 rounded-lg bg-agap-surface px-3 py-2 border border-agap-track/30">
              <Search size={13} className="shrink-0 text-agap-textSub" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Reference, barangay, or type…"
                className="w-full bg-transparent text-[13px] text-agap-textMain placeholder:text-agap-textSub focus:outline-none font-sans"
              />
              {search && (
                <button onClick={() => setSearch('')} className="shrink-0 text-agap-textSub hover:text-agap-textMain transition-colors">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Queue header */}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-agap-textSub">
              Awaiting Dispatch
            </span>
            {queue.length > 0 && (
              <span className="rounded-full bg-agap-amberSoft px-2 py-0.5 text-[10px] font-bold text-agap-amber tabular-nums">
                {queue.length}
              </span>
            )}
          </div>

          {/* Queue list */}
          <div className="min-h-0 max-h-[32vh] overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <div className="space-y-1.5 p-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[56px] w-full rounded-lg" />
                ))}
              </div>
            ) : queue.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <p className="text-[13px] font-medium text-agap-textSub">Queue clear</p>
                <p className="mt-0.5 text-[11px] text-agap-textSub/70">No incidents awaiting dispatch.</p>
              </div>
            ) : (
              queue.map((inc) => (
                <QueueRow
                  key={inc.id}
                  incident={inc}
                  selected={inc.id === selectedId}
                  onSelect={() => setSelectedId(inc.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Selected incident detail */}
        {selectedId && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-panel border border-agap-track/30 animate-slide-up">
            <DispatchDetail
              incidentId={selectedId}
              onOpenFullDetail={() => setDrawerOpen(true)}
              onClose={() => setSelectedId(null)}
              onDispatched={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>

      {/* ── Center-bottom: ETA pill ────────────────────────────────────── */}
      {selectedId && nearestMeters != null && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-[1000] -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-agap-sidebar/90 px-5 py-2.5 shadow-[0_4px_20px_rgba(10,22,40,0.4)] backdrop-blur-sm border border-white/10">
            <Navigation size={14} className="text-agap-green shrink-0" />
            <span className="font-mono text-sm font-semibold text-white tabular-nums">{km(nearestMeters)}</span>
            <span className="text-white/30">·</span>
            <span className="text-sm text-white/70 tabular-nums">
              ~{etaMins(nearestMeters)} min
            </span>
            <span className="rounded-full bg-agap-green/20 border border-agap-green/30 px-2 py-0.5 text-[10px] font-semibold text-agap-green uppercase tracking-wide">
              est. nearest unit
            </span>
          </div>
        </div>
      )}

      <IncidentDetailDrawer incidentId={selectedId} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  value, label, tone, pulse,
}: {
  value: number;
  label: string;
  tone: 'danger' | 'amber' | 'info' | 'green';
  pulse?: boolean;
}): JSX.Element {
  const tones: Record<string, { num: string; label: string; bg: string }> = {
    danger: { num: 'text-red-600',     label: 'text-red-400',    bg: 'bg-white' },
    amber:  { num: 'text-amber-600',   label: 'text-amber-400',  bg: 'bg-white' },
    info:   { num: 'text-blue-600',    label: 'text-blue-400',   bg: 'bg-white' },
    green:  { num: 'text-agap-green',  label: 'text-agap-green/60', bg: 'bg-white' },
  };
  const t = tones[tone] ?? tones['green']!;
  return (
    <div className={`flex flex-col items-center justify-center gap-0.5 ${t.bg} px-1 py-3`}>
      <span
        className={`font-mono text-[22px] font-bold leading-none tabular-nums ${t.num} ${pulse ? 'animate-incident-pulse' : ''}`}
      >
        {value}
      </span>
      <span className={`text-[9px] font-semibold uppercase tracking-widest ${t.label}`}>
        {label}
      </span>
    </div>
  );
}

// ─── Queue row ──────────────────────────────────────────────────────────────

function QueueRow({
  incident, selected, onSelect,
}: {
  incident: IncidentListItem;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const Icon = categoryIcon(incident.category);
  const strip = PRIORITY_STRIP[incident.priority] ?? 'border-l-[3px] border-l-agap-track';
  const dot   = PRIORITY_DOT[incident.priority]   ?? 'bg-agap-textSub';

  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 border-b border-agap-track/15 px-3 py-2.5 text-left transition-all duration-150 ${strip} ${
        selected
          ? 'bg-agap-greenSoft'
          : 'hover:bg-agap-surface'
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
        selected ? 'bg-agap-green/15 text-agap-green' : 'bg-agap-surface text-agap-textMid'
      }`}>
        <Icon size={15} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-mono text-[12px] font-semibold text-agap-textMain">{incident.public_reference}</p>
        <p className="truncate text-[11px] text-agap-textSub">
          {incident.incident_locations?.barangay ?? titleCase(incident.category)}
          {' · '}
          {timeAgo(incident.submitted_at)}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
          <span className="text-[10px] font-semibold text-agap-textSub">
            {incident.priority.charAt(0) + incident.priority.slice(1).toLowerCase()}
          </span>
        </div>
        <StatusChip status={incident.status} />
      </div>
    </button>
  );
}

// ─── Lifecycle stepper ──────────────────────────────────────────────────────

function LifecycleStepper({ status }: { status: string }): JSX.Element {
  const current = LIFECYCLE_ORDER.indexOf(status);
  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const stepIdx = LIFECYCLE_ORDER.indexOf(step.reached);
        const done = current >= stepIdx;
        const prevStep = STEPS[i - 1];
        const isCurrent = !done && (i === 0 || (prevStep != null && current >= LIFECYCLE_ORDER.indexOf(prevStep.reached)));
        return (
          <div key={step.label} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span className={`h-px flex-1 ${i === 0 ? 'opacity-0' : done ? 'bg-agap-green' : 'bg-agap-track'}`} />
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  done
                    ? 'bg-agap-green text-white'
                    : isCurrent
                      ? 'border-2 border-agap-green bg-white text-agap-green'
                      : 'border border-agap-track bg-white text-agap-textSub'
                }`}
              >
                {done ? <CheckCircle2 size={12} /> : i + 1}
              </span>
              <span className={`h-px flex-1 ${i === STEPS.length - 1 ? 'opacity-0' : current > stepIdx ? 'bg-agap-green' : 'bg-agap-track'}`} />
            </div>
            <span className={`mt-1 text-[10px] font-medium ${done || isCurrent ? 'text-agap-textMid' : 'text-agap-textSub'}`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Route points ────────────────────────────────────────────────────────────

function RoutePoints({
  sceneAddress, unitLabel, destination,
}: {
  sceneAddress: string;
  unitLabel: string | null;
  destination: string | null;
}): JSX.Element {
  const points = [
    { color: 'bg-agap-green',   ring: 'ring-agap-greenSoft', label: 'Incident scene',  value: sceneAddress },
    { color: 'bg-agap-info',    ring: 'ring-agap-infoSoft',  label: 'Assigned unit',   value: unitLabel ?? 'Not yet dispatched' },
    { color: 'bg-agap-textSub', ring: 'ring-agap-surface',   label: 'Destination',     value: destination ?? 'To be determined' },
  ];
  return (
    <div className="relative pl-1">
      {points.map((p, i) => (
        <div key={p.label} className="relative flex gap-3 pb-3 last:pb-0">
          {i < points.length - 1 && (
            <span className="absolute left-[5px] top-4 h-full w-px bg-agap-track" />
          )}
          <span className={`relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${p.color} ring-4 ${p.ring}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-agap-textSub">{p.label}</p>
            <p className="truncate text-[13px] text-agap-textMid">{p.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Detail + recommendation panel ──────────────────────────────────────────

function DispatchDetail({
  incidentId, onOpenFullDetail, onClose, onDispatched,
}: {
  incidentId: string;
  onOpenFullDetail: () => void;
  onClose: () => void;
  onDispatched: () => void;
}): JSX.Element {
  const { data: incident, isLoading } = useIncident(incidentId);
  const [tab, setTab] = useState<'dispatch' | 'route'>('dispatch');

  if (isLoading || !incident) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
      </div>
    );
  }

  const Icon = categoryIcon(incident.category);
  const loc = incident.incident_locations;
  const address =
    loc?.formatted_address ??
    ([loc?.barangay, loc?.municipality, loc?.province].filter(Boolean).join(', ') || 'Address not available');
  const hasDispatch = (incident.dispatches?.length ?? 0) > 0;
  const dispatchable = DISPATCHABLE.includes(incident.status);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-agap-track/25 px-4 py-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          incident.priority === 'CRITICAL' ? 'bg-red-50 text-red-600'
          : incident.priority === 'HIGH'   ? 'bg-orange-50 text-orange-600'
          : 'bg-agap-greenSoft text-agap-green'
        }`}>
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[14px] font-bold text-agap-textMain leading-tight">{titleCase(incident.category)}</h2>
          <p className="font-mono text-[11px] text-agap-textSub mt-0.5">{incident.public_reference}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority={incident.priority} />
            <StatusChip status={incident.status} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onOpenFullDetail}
            title="Open full incident details"
            aria-label="Open full incident details"
            className="inline-flex items-center gap-1 rounded-md border border-agap-track/50 px-2 py-1.5 text-[11px] font-semibold text-agap-textMid transition-all hover:border-agap-green/40 hover:bg-agap-greenSoft hover:text-agap-green"
          >
            <ExternalLink size={13} />
            Details
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="rounded-md p-1.5 text-agap-textSub transition-colors hover:bg-agap-surface hover:text-agap-textMain"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-agap-track/25 px-4">
        <TabButton active={tab === 'dispatch'} onClick={() => setTab('dispatch')}>Dispatch</TabButton>
        <TabButton active={tab === 'route'}    onClick={() => setTab('route')}>Location & Route</TabButton>
      </div>

      {/* Stepper */}
      <div className="px-4 pt-3 pb-1">
        <LifecycleStepper status={incident.status} />
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin">
        {tab === 'route' ? (
          <div className="space-y-3">
            <RoutePoints
              sceneAddress={address}
              unitLabel={hasDispatch ? 'Unit dispatched — tracking live' : null}
              destination={null}
            />
            {incident.number_of_patients != null && (
              <div className="flex items-center gap-2 rounded-lg bg-agap-surface px-3 py-2 text-[13px] text-agap-textMid">
                <Users size={13} className="shrink-0 text-agap-textSub" />
                <span>{incident.number_of_patients} patient(s) reported</span>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-agap-surface px-3 py-2">
              <MapPin size={13} className="mt-0.5 shrink-0 text-agap-textSub" />
              <span className="text-[13px] text-agap-textMid leading-relaxed">{address}</span>
            </div>

            {hasDispatch ? (
              <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
                <CheckCircle2 size={16} />
                <span className="text-[13px] font-semibold">Unit dispatched — tracking live.</span>
              </div>
            ) : dispatchable ? (
              <RecommendationPanel incidentId={incident.id} onDispatched={onDispatched} />
            ) : (
              <PreDispatchActions incidentId={incident.id} status={incident.status} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-1 mr-4 py-2.5 text-[12px] font-semibold transition-colors ${
        active
          ? 'border-agap-green text-agap-green'
          : 'border-transparent text-agap-textSub hover:text-agap-textMain'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Pre-dispatch lifecycle advance ──────────────────────────────────────────

function PreDispatchActions({ incidentId, status }: { incidentId: string; status: string }): JSX.Element {
  const update = useUpdateIncidentStatus();
  const next =
    status === 'SUBMITTED' ? { to: 'RECEIVED',     label: 'Mark Received' } :
    status === 'RECEIVED'  ? { to: 'ACKNOWLEDGED', label: 'Acknowledge'   } :
    null;

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-agap-textSub leading-relaxed">
        Advance this incident to acknowledge and assess it before a unit can be dispatched.
      </p>
      {update.isError && (
        <p className="text-xs text-agap-danger">
          {(update.error as Error)?.message ?? 'Transition failed.'}
        </p>
      )}
      {next && (
        <Button
          variant="primary"
          className="w-full"
          loading={update.isPending}
          onClick={() => update.mutate({ id: incidentId, status: next.to })}
        >
          {next.label}
        </Button>
      )}
    </div>
  );
}

// ─── MOD-29/30 recommendation panel ─────────────────────────────────────────

function RecommendationPanel({
  incidentId, onDispatched,
}: {
  incidentId: string;
  onDispatched: () => void;
}): JSX.Element {
  const { data: recommendations, isLoading, isError, refetch } = useDispatchRecommendations(incidentId);
  const { data: availableUnits } = useAvailableUnits();
  const {
    data: responders = [],
    isLoading: respondersLoading,
    isError: respondersError,
    refetch: refetchResponders,
  } = useResponders({ perPage: 100 });
  const createDispatch = useCreateDispatch();

  const [unitId, setUnitId] = useState<string | null>(null);
  const [crewIds, setCrewIds] = useState<string[]>([]);
  const [showCrew, setShowCrew] = useState(false);
  const [notes, setNotes] = useState('');

  const availableResponders = useMemo(
    () => responders.filter((r) => r.availability_status === 'AVAILABLE'),
    [responders],
  );

  function toggleCrew(id: string) {
    setCrewIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function authorize() {
    if (!unitId) return;
    createDispatch.mutate(
      {
        incidentId,
        resourceId: unitId,
        ...(crewIds.length ? { initialCrewIds: crewIds } : {}),
        ...(notes.trim() ? { dispatchNotes: notes.trim() } : {}),
      },
      { onSuccess: () => onDispatched() },
    );
  }

  const ranked = recommendations ?? [];
  const showFallback = !isLoading && !isError && ranked.length === 0;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-agap-info shrink-0" />
        <h3 className="text-[13px] font-bold text-agap-textMain">Recommended units</h3>
        <span className="text-[11px] text-agap-textSub">— assistive; you decide</span>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-agap-dangerSoft bg-agap-dangerSoft px-4 py-3 text-center">
          <p className="text-[13px] text-agap-danger">Couldn&apos;t load recommendations.</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void refetch()}>Retry</Button>
        </div>
      ) : showFallback ? (
        <FallbackUnits units={availableUnits ?? []} selectedId={unitId} onSelect={setUnitId} />
      ) : (
        <div className="space-y-1.5">
          {ranked.map((r) => (
            <RecommendationRow
              key={r.resourceId}
              rec={r}
              selected={unitId === r.resourceId}
              onSelect={() => setUnitId(r.resourceId)}
            />
          ))}
        </div>
      )}

      {/* Crew selection */}
      <div className="rounded-lg border border-agap-track/40 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCrew((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 bg-agap-surface text-left hover:bg-agap-track/25 transition-colors"
        >
          <div className="flex items-center gap-2">
            <UserCheck size={13} className="text-agap-textSub shrink-0" />
            <span className="text-[13px] font-semibold text-agap-textMain">Assign crew</span>
            {crewIds.length > 0 && (
              <span className="rounded-full bg-agap-green text-white text-[10px] font-bold px-1.5 py-0.5">
                {crewIds.length}
              </span>
            )}
            <span className="text-[11px] text-agap-textSub">
              {respondersLoading ? 'loading…' : `${availableResponders.length} available`}
            </span>
          </div>
          {showCrew
            ? <ChevronUp size={13} className="text-agap-textSub" />
            : <ChevronDown size={13} className="text-agap-textSub" />
          }
        </button>

        {showCrew && (
          <div className="p-2.5 space-y-1.5 bg-white max-h-44 overflow-y-auto scrollbar-thin">
            {respondersLoading ? (
              <div className="flex items-center justify-center gap-2 py-4 text-[11px] text-agap-textSub">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-agap-track border-t-agap-green" />
                Loading availability…
              </div>
            ) : respondersError ? (
              <div className="space-y-2 py-2 text-center">
                <p className="text-[12px] text-agap-danger">Couldn&apos;t load responders.</p>
                <Button variant="secondary" size="sm" onClick={() => void refetchResponders()}>Retry</Button>
              </div>
            ) : availableResponders.length === 0 ? (
              <div className="space-y-1 py-3 text-center">
                <p className="text-[12px] font-semibold text-agap-textMid">No responders available.</p>
                <p className="text-[11px] text-agap-textSub">Responders must set status to Available.</p>
              </div>
            ) : (
              availableResponders.map((r) => {
                const selected = crewIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggleCrew(r.id)}
                    className={`flex w-full items-center gap-2.5 rounded-md border p-2 text-left transition-all ${
                      selected
                        ? 'border-agap-green/40 bg-agap-greenSoft'
                        : 'border-agap-track/40 hover:bg-agap-surface'
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-[1.5px] transition-colors ${
                        selected ? 'border-agap-green bg-agap-green' : 'border-agap-track bg-white'
                      }`}
                    >
                      {selected && <CheckCircle2 size={11} className="text-white" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-agap-textMain">{r.full_name}</p>
                      {r.organization && (
                        <p className="truncate text-[10px] text-agap-textSub">{r.organization.name}</p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Available
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Authorize dispatch */}
      <div className="space-y-2 border-t border-agap-track/25 pt-3">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Dispatch notes (optional)…"
          rows={2}
          className="w-full resize-none rounded-lg border border-agap-track/40 bg-white px-3 py-2 text-[13px] text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green/40 transition-shadow"
        />
        {createDispatch.isError && (
          <p className="text-[11px] text-agap-danger">
            {(createDispatch.error as Error)?.message ?? 'Dispatch failed — try another unit.'}
          </p>
        )}
        <Button
          variant="primary"
          className="w-full"
          disabled={!unitId}
          loading={createDispatch.isPending}
          onClick={authorize}
        >
          <Siren size={15} />
          Authorize dispatch
        </Button>
      </div>
    </div>
  );
}

function RecommendationRow({
  rec, selected, onSelect,
}: {
  rec: ResourceRecommendation;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const required = rec.requiredCapabilities.length;
  const matched  = rec.matchedCapabilities.length;
  const capVariant = required === 0 ? 'muted' : matched >= required ? 'green' : matched > 0 ? 'amber' : 'red';
  const capLabel   = required === 0 ? 'No specific cap.' : `${matched}/${required} capability`;

  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-lg border p-3 text-left transition-all duration-150 ${
        selected
          ? 'border-agap-green/40 bg-agap-greenSoft shadow-[0_0_0_3px_rgba(13,96,83,0.08)]'
          : 'border-agap-track/40 hover:border-agap-track hover:bg-agap-surface'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-bold ${
            selected ? 'bg-agap-green text-white' : 'bg-agap-textMain/10 text-agap-textMid'
          }`}>
            {rec.rank}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-agap-textMain">
            <Truck size={13} className="text-agap-textSub" />
            {rec.callSign ?? rec.resourceName}
          </span>
        </div>
        <span className="font-mono text-[11px] font-semibold text-agap-textSub tabular-nums">
          {rec.score.toFixed(0)}pts
        </span>
      </div>

      {/* Score bar */}
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-agap-track/50">
        <div
          className={`h-full rounded-full transition-all ${selected ? 'bg-agap-green' : 'bg-agap-green/60'}`}
          style={{ width: `${Math.min(100, Math.max(0, rec.score))}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Badge variant="muted">{titleCase(rec.resourceType)}</Badge>
        <Badge variant={capVariant}>{capLabel}</Badge>
        <Badge variant="blue">{km(rec.distanceMeters)}</Badge>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-agap-textSub">{rec.rationale}</p>
    </button>
  );
}

function FallbackUnits({
  units, selectedId, onSelect,
}: {
  units: { id: string; name: string; call_sign: string | null; resource_type: string; base_barangay: string | null }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  if (units.length === 0) {
    return (
      <div className="rounded-lg bg-agap-amberSoft border border-agap-amber/20 px-3 py-2.5 text-[13px] text-agap-amber">
        No units available right now.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-agap-textSub leading-relaxed">
        No ranked recommendation (missing location or capabilities). Showing available units:
      </p>
      {units.map((u) => (
        <button
          key={u.id}
          onClick={() => onSelect(u.id)}
          className={`flex w-full items-center justify-between rounded-lg border p-2.5 text-left transition-all ${
            selectedId === u.id
              ? 'border-agap-green/40 bg-agap-greenSoft'
              : 'border-agap-track/40 hover:bg-agap-surface'
          }`}
        >
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-agap-textMain">
            <Truck size={13} className="text-agap-textSub" />
            {u.call_sign ?? u.name}
          </span>
          <span className="text-[11px] text-agap-textSub">
            {titleCase(u.resource_type)}{u.base_barangay ? ` · ${u.base_barangay}` : ''}
          </span>
        </button>
      ))}
    </div>
  );
}
