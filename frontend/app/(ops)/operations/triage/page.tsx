'use client';

import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowLeft, ClipboardCheck, Copy, ExternalLink, MapPin, Quote, Sparkles, Users,
} from 'lucide-react';
import {
  DUPLICATE_DETECTION_RADIUS_METERS, DUPLICATE_DETECTION_WINDOW_MINUTES, haversineMeters,
} from '@agap/shared';
import {
  Button, PriorityBadge, StatusChip, Badge, Skeleton, EmptyState,
} from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { IncidentDetailDrawer } from '@/components/incidents/IncidentDetailDrawer';
import { BarangayPanel } from '@/components/incidents/BarangayPanel';
import { useWsState } from '@/lib/use-ws-state';
import {
  useIncidents, useIncident, useUpdateIncidentStatus, useMarkFalseAlert, useMergeIncident,
} from '@/features/incidents/hooks';
import { usePriorityRecommendation } from '@/features/dispatch/hooks';
import { categoryIcon, formatAffectedCount, titleCase, timeAgo } from '@/lib/incident-format';
import type { IncidentListItem } from '@/features/incidents/api';

const TRIAGE_STATUSES = ['SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED'];
const NON_DUP_TERMINAL = ['CLOSED', 'FALSE_ALERT', 'CANCELLED', 'DUPLICATE'];

const OPEN_STATUSES = [
  'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING', 'DISPATCHED',
  'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING', 'RESOLVED', 'UNABLE_TO_RESPOND', 'REFERRED',
];
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const PRIORITY_STRIP: Record<string, string> = {
  CRITICAL: 'shadow-[inset_3px_0_0_0_#ef4444]',
  HIGH:     'shadow-[inset_3px_0_0_0_#f97316]',
  MEDIUM:   'shadow-[inset_3px_0_0_0_#fbbf24]',
  LOW:      'shadow-[inset_3px_0_0_0_#10b981]',
};

const DESKTOP_QUERY = '(min-width: 1024px)';
const PANEL = 'rounded-2xl border border-agap-track/50 bg-white shadow-card';

function coordsOf(i: IncidentListItem): [number, number] | null {
  const loc = i.incident_locations;
  if (loc?.latitude == null || loc?.longitude == null) return null;
  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return [lat, lng];
}

/**
 * MOD-25 — Incident Triage and Validation. Queue on the left, the selected report on
 * the right (lg+). Below lg it is one column: the queue, then the report with a back link.
 */
export default function TriagePage(): JSX.Element {
  const wsState = useWsState();
  const { data, isLoading } = useIncidents({ statuses: OPEN_STATUSES, perPage: 100 });
  const incidents = useMemo<IncidentListItem[]>(() => data?.data ?? [], [data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const queue = useMemo(
    () =>
      incidents
        .filter((i) => TRIAGE_STATUSES.includes(i.status))
        .sort((a, b) => {
          const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
          if (pr !== 0) return pr;
          return +new Date(a.submitted_at) - +new Date(b.submitted_at);
        }),
    [incidents],
  );

  // Single-column layout: opening a report moves focus to it; going back returns to its row.
  const detailRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const previousId = useRef<string | null>(null);
  useEffect(() => {
    const from = previousId.current;
    previousId.current = selectedId;
    if (window.matchMedia(DESKTOP_QUERY).matches) return;
    if (selectedId && !from) {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView({ block: 'start' });
    } else if (!selectedId && from) {
      listRef.current?.querySelector<HTMLElement>(`[data-incident-id="${from}"]`)?.focus();
    }
  }, [selectedId]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 lg:h-[calc(100dvh-6.5rem)] lg:min-h-[560px] lg:[html[data-ops-nav=dock]_&]:h-[calc(100dvh-11rem)]">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-agap-textMain">Triage &amp; Validation</h1>
          <p className="mt-1 flex items-center gap-2 text-[13px] text-slate-600" aria-live="polite">
            {queue.length > 0 ? (
              <span aria-hidden="true" className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-agap-green opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-agap-green" />
              </span>
            ) : (
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-slate-300" />
            )}
            {isLoading ? 'Loading reports…' : `${queue.length} report${queue.length === 1 ? '' : 's'} awaiting triage`}
          </p>
        </div>
        <ConnectionIndicator state={wsState} />
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)] xl:gap-5">

        {/* ── Queue ─────────────────────────────────────────────────────── */}
        <section
          aria-labelledby="triage-queue-title"
          className={`${PANEL} min-h-0 flex-col overflow-hidden ${selectedId ? 'hidden lg:flex' : 'flex'}`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-agap-track/40 px-4 py-3 sm:px-5">
            <div>
              <h2 id="triage-queue-title" className="text-[13px] font-bold text-agap-textMain">Triage queue</h2>
              <p className="text-xs text-slate-500">Highest priority first, then oldest</p>
            </div>
            {queue.length > 0 && (
              <span className="rounded-full bg-agap-amberSoft px-2.5 py-0.5 text-xs font-bold text-agap-amber tabular-nums">
                {queue.length}
              </span>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <div className="space-y-2 p-3" aria-busy="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
                ))}
              </div>
            ) : queue.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="Queue clear"
                description="All incoming reports have been validated."
                className="my-10"
              />
            ) : (
              <ul ref={listRef} className="divide-y divide-agap-track/30">
                {queue.map((inc) => (
                  <li key={inc.id}>
                    <QueueRow incident={inc} selected={inc.id === selectedId} onSelect={() => setSelectedId(inc.id)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ── Selected report ───────────────────────────────────────────── */}
        <section
          ref={detailRef}
          tabIndex={-1}
          aria-label="Selected report"
          className={`${PANEL} min-h-0 scroll-mt-4 flex-col outline-none lg:overflow-hidden ${selectedId ? 'flex' : 'hidden lg:flex'}`}
        >
          {selectedId ? (
            <TriageDetail
              key={selectedId}
              incidentId={selectedId}
              allIncidents={incidents}
              onBack={() => setSelectedId(null)}
              onOpenFullDetail={() => setDrawerOpen(true)}
              onResolved={() => setSelectedId(null)}
            />
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title="Select a report"
              description="Choose a report from the queue to validate, assess, or flag it."
              className="m-auto"
            />
          )}
        </section>
      </div>

      <IncidentDetailDrawer incidentId={selectedId} open={drawerOpen} onOpenChange={setDrawerOpen} />
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
  const strip = PRIORITY_STRIP[incident.priority] ?? 'shadow-[inset_3px_0_0_0_#cbd5e1]';
  const notice = incident.barangay_notices?.[0];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-incident-id={incident.id}
      className={`flex min-h-[76px] w-full items-start gap-3 px-4 py-3.5 text-left transition-colors sm:px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-agap-green/60 ${strip} ${
        selected ? 'bg-agap-greenSoft/70' : 'hover:bg-agap-surface/60'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
          selected ? 'bg-agap-green text-white' : 'bg-agap-greenSoft text-agap-green'
        }`}
      >
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-mono text-[12px] font-bold text-agap-textMain">{incident.public_reference}</span>
          <span className="shrink-0 text-xs text-slate-500 tabular-nums">{timeAgo(incident.submitted_at)}</span>
        </span>
        <span className="mt-0.5 block truncate text-[13px] font-medium text-agap-textMid">
          {incident.incident_locations?.barangay ?? titleCase(incident.category)}
        </span>
        {notice && (
          <span className="block truncate text-xs text-slate-500">
            Brgy {notice.barangay.name}
            {notice.is_approximate ? ' (approx.)' : ''}
          </span>
        )}
        <span className="mt-2 flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={incident.priority} showDot={false} />
          <StatusChip status={incident.status} />
        </span>
      </span>
    </button>
  );
}

// ─── Triage detail ──────────────────────────────────────────────────────────

function TriageDetail({
  incidentId, allIncidents, onBack, onOpenFullDetail, onResolved,
}: {
  incidentId: string;
  allIncidents: IncidentListItem[];
  onBack: () => void;
  onOpenFullDetail: () => void;
  onResolved: () => void;
}): JSX.Element {
  const { data: incident, isLoading } = useIncident(incidentId);

  const backBar = (
    <div className="border-b border-agap-track/40 px-2 py-1.5 lg:hidden">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-agap-textMid transition-colors hover:bg-agap-surface hover:text-agap-textMain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/60"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Triage queue
      </button>
    </div>
  );

  if (isLoading || !incident) {
    return (
      <>
        {backBar}
        <div className="space-y-4 p-5 sm:p-6" aria-busy="true">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </>
    );
  }

  const Icon = categoryIcon(incident.category);
  const loc = incident.incident_locations;
  const address =
    loc?.formatted_address ??
    ([loc?.barangay, loc?.municipality, loc?.province].filter(Boolean).join(', ') || 'Address not available');
  const affected = formatAffectedCount(incident.hazard_flags, incident.number_of_patients);

  return (
    <>
      {backBar}

      {/* Scrolls on lg; the action bar below stays in view. */}
      <div className="min-h-0 flex-1 lg:overflow-y-auto lg:scrollbar-thin">
        {/* Summary */}
        <div className="border-b border-agap-track/40 px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-agap-greenSoft text-agap-green">
                <Icon size={22} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-tight tracking-tight text-agap-textMain">
                  {titleCase(incident.category)}
                </h2>
                <p className="mt-0.5 font-mono text-xs font-medium text-slate-500">{incident.public_reference}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <PriorityBadge priority={incident.priority} />
                  <StatusChip status={incident.status} />
                  <span className="text-xs text-slate-500">· reported {timeAgo(incident.submitted_at)}</span>
                </div>
              </div>
            </div>
            <Button variant="secondary" size="md" onClick={onOpenFullDetail} className="shrink-0">
              <ExternalLink size={15} aria-hidden="true" />
              Full details
            </Button>
          </div>

          <dl className="mt-4 grid gap-2 rounded-xl bg-agap-surface/60 p-3.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <MapPin size={13} aria-hidden="true" /> Location
            </dt>
            <dd className="font-medium text-agap-textMain">{address}</dd>
            {affected && (
              <>
                <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <Users size={13} aria-hidden="true" /> Affected
                </dt>
                <dd className="font-medium text-agap-textMain">{affected}</dd>
              </>
            )}
          </dl>

          {incident.description && (
            <figure className="mt-4 flex gap-2.5">
              <Quote size={15} aria-hidden="true" className="mt-1 shrink-0 text-slate-400" />
              <div>
                <figcaption className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reporter&apos;s description</figcaption>
                <blockquote className="mt-1 text-[15px] leading-relaxed text-agap-textMid">{incident.description}</blockquote>
              </div>
            </figure>
          )}
        </div>

        {/* Review, then act */}
        <div className="flex flex-col gap-4 px-4 py-5 sm:px-6">
          <PriorityRecChip incidentId={incident.id} currentPriority={incident.priority} />
          <DuplicateCandidates incident={incident} allIncidents={allIncidents} onMerged={onResolved} />
          <BarangayPanel incidentId={incident.id} incidentStatus={incident.status} />
        </div>
      </div>

      <TriageActions incidentId={incident.id} status={incident.status} onResolved={onResolved} />
    </>
  );
}

// ─── Two-step confirm for irreversible actions ─────────────────────────────────

function ConfirmButton({
  label, icon, confirmLabel, hint, loading, onConfirm,
}: {
  label: string;
  icon?: ReactNode;
  confirmLabel: string;
  hint: string;
  loading: boolean;
  onConfirm: () => void;
}): JSX.Element {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="danger" size="md" onClick={() => setAsking(true)} className="w-full sm:w-auto">
        {icon}
        {label}
      </Button>
    );
  }
  return (
    <div role="group" aria-label={label} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <p className="w-full text-xs text-agap-danger">{hint}</p>
      <Button
        variant="danger"
        size="md"
        autoFocus
        loading={loading}
        onClick={onConfirm}
        className="flex-1 border-transparent bg-agap-danger text-white hover:bg-red-700 sm:flex-none"
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size="md" disabled={loading} onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </div>
  );
}

// ─── Triage actions (assess / false alert) ─────────────────────────────────────

function TriageActions({
  incidentId, status, onResolved,
}: {
  incidentId: string;
  status: string;
  onResolved: () => void;
}): JSX.Element {
  const update = useUpdateIncidentStatus();
  const falseAlert = useMarkFalseAlert();

  const advance =
    status === 'SUBMITTED' ? { to: 'RECEIVED', label: 'Mark as received' } :
    status === 'RECEIVED' ? { to: 'ACKNOWLEDGED', label: 'Acknowledge' } :
    status === 'ACKNOWLEDGED' ? { to: 'ASSESSED', label: 'Assess · ready for dispatch' } :
    null;
  const canFalseAlert = status === 'ACKNOWLEDGED';

  const err = (update.error ?? falseAlert.error) as Error | null;

  return (
    // Stays reachable: pinned under the scrolling report on lg, and above the floating dock below lg.
    <div className="sticky bottom-[5rem] z-10 rounded-b-2xl border-t border-agap-track/50 bg-white/95 px-4 py-3.5 backdrop-blur-sm sm:px-6 lg:static lg:bottom-auto">
      {err && (
        <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg bg-agap-dangerSoft px-3 py-2 text-sm text-agap-danger">
          <AlertTriangle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          {err.message ?? 'Action failed. Please try again.'}
        </p>
      )}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Triage action</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {canFalseAlert && (
            <ConfirmButton
              label="Flag false alert"
              icon={<AlertTriangle size={15} aria-hidden="true" />}
              confirmLabel="Confirm false alert"
              hint="This closes the report as a false alert and removes it from the queue."
              loading={falseAlert.isPending}
              onConfirm={() => falseAlert.mutate({ id: incidentId }, { onSuccess: onResolved })}
            />
          )}
          {advance && (
            <Button
              variant="primary"
              size="md"
              loading={update.isPending}
              className="w-full sm:w-auto"
              onClick={() =>
                update.mutate(
                  { id: incidentId, status: advance.to },
                  { onSuccess: () => { if (advance.to === 'ASSESSED') onResolved(); } },
                )
              }
            >
              {advance.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MOD-24 priority recommendation ─────────────────────────────────────────────

function PriorityRecChip({ incidentId, currentPriority }: { incidentId: string; currentPriority: string }): JSX.Element | null {
  const { data } = usePriorityRecommendation(incidentId);
  if (!data) return null;
  const differs = data.recommendedPriority !== currentPriority;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 ${
        differs ? 'border-agap-info/30 bg-agap-infoSoft/50' : 'border-agap-track/50 bg-agap-surface/40'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          differs ? 'bg-agap-info/15 text-agap-info' : 'bg-white text-slate-500'
        }`}
      >
        <Sparkles size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-semibold text-agap-textMain">Suggested priority</h3>
          <PriorityBadge priority={data.recommendedPriority} />
          <span className="text-xs text-slate-600">
            {differs ? 'Differs from current' : 'Matches current'}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">{data.note}</p>
      </div>
    </div>
  );
}

// ─── MOD-26 duplicate candidates ───────────────────────────────────────────────

function DuplicateCandidates({
  incident, allIncidents, onMerged,
}: {
  incident: IncidentListItem;
  allIncidents: IncidentListItem[];
  onMerged: () => void;
}): JSX.Element | null {
  const merge = useMergeIncident();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const anchorTime = +new Date(incident.submitted_at);
    const windowMs = DUPLICATE_DETECTION_WINDOW_MINUTES * 60_000;
    const selfCoords = coordsOf(incident);

    return allIncidents
      .filter((c) => c.id !== incident.id)
      .filter((c) => c.category === incident.category)
      .filter((c) => !NON_DUP_TERMINAL.includes(c.status))
      .filter((c) => Math.abs(+new Date(c.submitted_at) - anchorTime) <= windowMs)
      .map((c) => {
        const cc = coordsOf(c);
        const distance = selfCoords && cc ? haversineMeters(selfCoords[0], selfCoords[1], cc[0], cc[1]) : null;
        return { incident: c, distance };
      })
      .filter((x) => x.distance == null || x.distance <= DUPLICATE_DETECTION_RADIUS_METERS)
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
      .slice(0, 5);
  }, [incident, allIncidents]);

  if (candidates.length === 0) return null;

  return (
    <section aria-labelledby="dup-title" className="rounded-xl border border-orange-200 bg-orange-50/50 px-4 py-4">
      <h3 id="dup-title" className="flex items-center gap-2 text-[13px] font-semibold text-orange-900">
        <Copy size={15} aria-hidden="true" /> Possible duplicates
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800 tabular-nums">{candidates.length}</span>
      </h3>
      <p className="mt-1 text-xs leading-5 text-orange-900/80">
        Same category, reported within {DUPLICATE_DETECTION_WINDOW_MINUTES} min and {DUPLICATE_DETECTION_RADIUS_METERS} m.
        Review before merging.
      </p>

      {merge.isError && (
        <p role="alert" className="mt-3 rounded-lg bg-agap-dangerSoft px-3 py-2 text-xs font-medium text-agap-danger">
          {(merge.error as Error)?.message ?? 'Merge failed.'}
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {candidates.map(({ incident: c, distance }) => {
          const asking = confirmId === c.id;
          const pending = merge.isPending && merge.variables?.duplicateOfId === c.id;
          return (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-orange-200/70 bg-white px-3.5 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-[13px] font-bold text-agap-textMain">{c.public_reference}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusChip status={c.status} />
                  <Badge variant="blue">{distance == null ? 'Distance n/a' : `${Math.round(distance)} m away`}</Badge>
                  <span className="text-xs text-slate-500">{timeAgo(c.submitted_at)}</span>
                </div>
              </div>
              {asking ? (
                <div role="group" aria-label={`Merge into ${c.public_reference}`} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <p className="w-full text-xs text-orange-900 sm:w-auto">
                    Mark {incident.public_reference} as a duplicate of this?
                  </p>
                  <Button
                    variant="primary"
                    size="md"
                    autoFocus
                    loading={pending}
                    onClick={() => merge.mutate({ id: incident.id, duplicateOfId: c.id }, { onSuccess: onMerged })}
                  >
                    Confirm merge
                  </Button>
                  <Button variant="ghost" size="md" disabled={pending} onClick={() => setConfirmId(null)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" size="md" onClick={() => setConfirmId(c.id)} className="shrink-0">
                  Merge…
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
