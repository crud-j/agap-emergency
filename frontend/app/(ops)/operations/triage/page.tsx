'use client';

import { useMemo, useState, type JSX } from 'react';
import { ClipboardCheck, MapPin, Users, Copy, Sparkles, AlertTriangle, ExternalLink } from 'lucide-react';
import {
  DUPLICATE_DETECTION_RADIUS_METERS, DUPLICATE_DETECTION_WINDOW_MINUTES,
} from '@agap/shared';
import {
  Card, Button, PriorityBadge, StatusChip, Badge, Skeleton, EmptyState,
} from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { IncidentDetailDrawer } from '@/components/incidents/IncidentDetailDrawer';
import { useWsState } from '@/lib/use-ws-state';
import {
  useIncidents, useIncident, useUpdateIncidentStatus, useMarkFalseAlert, useMergeIncident,
} from '@/features/incidents/hooks';
import { usePriorityRecommendation } from '@/features/dispatch/hooks';
import { categoryIcon, titleCase, timeAgo } from '@/lib/incident-format';
import type { IncidentListItem } from '@/features/incidents/api';

const TRIAGE_STATUSES = ['SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED'];
const NON_DUP_TERMINAL = ['CLOSED', 'FALSE_ALERT', 'CANCELLED', 'DUPLICATE'];
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function coordsOf(i: IncidentListItem): [number, number] | null {
  const loc = i.incident_locations;
  if (loc?.latitude == null || loc?.longitude == null) return null;
  const lat = Number(loc.latitude);
  const lng = Number(loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return [lat, lng];
}

function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * MOD-25 — Triage & Validation. Validate/assess the intake queue; mark ASSESSED
 * (ready for dispatch) or FALSE_ALERT (MOD-08). Surfaces nearby same-category
 * duplicate candidates (MOD-26) with an advisory, human-confirmed merge action.
 */
export default function TriagePage(): JSX.Element {
  const wsState = useWsState();
  const { data, isLoading } = useIncidents({ perPage: 100 });
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

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[520px] flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-agap-textMain">Triage &amp; Validation</h1>
          <p className="mt-1 text-sm text-agap-textSub">
            {queue.length} incident{queue.length === 1 ? '' : 's'} awaiting triage
          </p>
        </div>
        <ConnectionIndicator state={wsState} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Queue */}
        <Card padding="none" className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-[rgba(168,181,193,0.20)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-agap-textSub">
            Triage Queue
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : queue.length === 0 ? (
              <EmptyState title="Nothing to triage" description="All incoming incidents have been validated." />
            ) : (
              queue.map((inc) => {
                const Icon = categoryIcon(inc.category);
                return (
                  <button
                    key={inc.id}
                    onClick={() => setSelectedId(inc.id)}
                    className={`flex w-full items-center gap-3 border-b border-[rgba(168,181,193,0.12)] px-4 py-3 text-left transition-colors ${
                      inc.id === selectedId ? 'bg-agap-greenSoft' : 'hover:bg-agap-surface'
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-agap-greenSoft text-agap-green">
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-bold text-agap-textMain">{inc.public_reference}</p>
                      <p className="truncate text-xs text-agap-textSub">
                        {inc.incident_locations?.barangay ?? titleCase(inc.category)} · {timeAgo(inc.submitted_at)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <PriorityBadge priority={inc.priority} showDot={false} />
                      <StatusChip status={inc.status} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Detail */}
        <Card padding="none" className="flex min-h-0 flex-col overflow-hidden">
          {selectedId ? (
            <TriageDetail
              incidentId={selectedId}
              allIncidents={incidents}
              onOpenFullDetail={() => setDrawerOpen(true)}
              onResolved={() => setSelectedId(null)}
            />
          ) : (
            <EmptyState
              icon={ClipboardCheck}
              title="Select an incident"
              description="Choose an incident from the queue to validate, assess, or flag."
            />
          )}
        </Card>
      </div>

      <IncidentDetailDrawer incidentId={selectedId} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

// ─── Triage detail ──────────────────────────────────────────────────────────

function TriageDetail({
  incidentId, allIncidents, onOpenFullDetail, onResolved,
}: {
  incidentId: string;
  allIncidents: IncidentListItem[];
  onOpenFullDetail: () => void;
  onResolved: () => void;
}): JSX.Element {
  const { data: incident, isLoading } = useIncident(incidentId);

  if (isLoading || !incident) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const Icon = categoryIcon(incident.category);
  const loc = incident.incident_locations;
  const address =
    loc?.formatted_address ??
    ([loc?.barangay, loc?.municipality, loc?.province].filter(Boolean).join(', ') || 'Address not available');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Summary */}
      <div className="border-b border-[rgba(168,181,193,0.20)] p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-agap-greenSoft text-agap-green">
            <Icon size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-agap-textMain">{titleCase(incident.category)}</h2>
            <p className="font-mono text-xs text-agap-textSub">{incident.public_reference}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PriorityBadge priority={incident.priority} />
              <StatusChip status={incident.status} />
              <span className="text-xs text-agap-textSub">· {timeAgo(incident.submitted_at)}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onOpenFullDetail}>
            <ExternalLink size={14} /> Detail
          </Button>
        </div>
        <div className="mt-3 flex items-start gap-2 text-sm text-agap-textMid">
          <MapPin size={15} className="mt-0.5 shrink-0 text-agap-textSub" />
          <span>{address}</span>
        </div>
        {incident.number_of_patients != null && (
          <div className="mt-1 flex items-center gap-2 text-sm text-agap-textMid">
            <Users size={15} className="shrink-0 text-agap-textSub" />
            <span>{incident.number_of_patients} patient(s)</span>
          </div>
        )}
        {incident.description && (
          <p className="mt-2 text-sm text-agap-textMid">{incident.description}</p>
        )}
      </div>

      <div className="space-y-5 p-5">
        <PriorityRecChip incidentId={incident.id} currentPriority={incident.priority} />
        <TriageActions incidentId={incident.id} status={incident.status} onResolved={onResolved} />
        <DuplicateCandidates
          incident={incident}
          allIncidents={allIncidents}
          onMerged={onResolved}
        />
      </div>
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

  // Only offer transitions the lifecycle map permits from the current status.
  const advance =
    status === 'SUBMITTED' ? { to: 'RECEIVED', label: 'Mark Received' } :
    status === 'RECEIVED' ? { to: 'ACKNOWLEDGED', label: 'Acknowledge' } :
    status === 'ACKNOWLEDGED' ? { to: 'ASSESSED', label: 'Mark Assessed' } :
    null;
  const canFalseAlert = status === 'ACKNOWLEDGED'; // map allows ACKNOWLEDGED/ASSESSED → FALSE_ALERT

  const err = (update.error ?? falseAlert.error) as Error | null;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-agap-textSub">Triage actions</h3>
      {err && <p className="mb-2 text-xs text-agap-danger">{err.message ?? 'Action failed.'}</p>}
      <div className="flex flex-wrap gap-2">
        {advance && (
          <Button
            variant="primary"
            loading={update.isPending}
            onClick={() => update.mutate({ id: incidentId, status: advance.to }, { onSuccess: () => { if (advance.to === 'ASSESSED') onResolved(); } })}
          >
            {advance.label}
          </Button>
        )}
        {canFalseAlert && (
          <Button
            variant="danger"
            loading={falseAlert.isPending}
            onClick={() => falseAlert.mutate({ id: incidentId }, { onSuccess: onResolved })}
          >
            <AlertTriangle size={14} /> False Alert
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── MOD-24 priority recommendation chip ───────────────────────────────────────

function PriorityRecChip({ incidentId, currentPriority }: { incidentId: string; currentPriority: string }): JSX.Element | null {
  const { data } = usePriorityRecommendation(incidentId);
  if (!data) return null;
  const differs = data.recommendedPriority !== currentPriority;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-agap-infoSoft bg-agap-infoSoft/60 px-3 py-2" title={data.note}>
      <Sparkles size={15} className="shrink-0 text-agap-info" />
      <span className="text-sm text-agap-textMain">
        Recommended priority: <PriorityBadge priority={data.recommendedPriority} />
        <span className="ml-1 text-xs text-agap-textSub">
          {differs ? '— differs (assistive)' : '— matches current'}
        </span>
      </span>
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
        const distance = selfCoords && cc ? haversineMeters(selfCoords, cc) : null;
        return { incident: c, distance };
      })
      // If both have coordinates, require proximity; otherwise keep as a weaker
      // (category + time-window) candidate for human review.
      .filter((x) => x.distance == null || x.distance <= DUPLICATE_DETECTION_RADIUS_METERS)
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
      .slice(0, 5);
  }, [incident, allIncidents]);

  if (candidates.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-agap-textSub">
        <Copy size={13} /> Possible duplicates ({candidates.length})
      </h3>
      <p className="mb-2 text-xs text-agap-textSub">
        Same category within {DUPLICATE_DETECTION_WINDOW_MINUTES} min
        {' '}and {DUPLICATE_DETECTION_RADIUS_METERS} m. Advisory — confirm before merging.
      </p>
      {merge.isError && (
        <p className="mb-2 text-xs text-agap-danger">{(merge.error as Error)?.message ?? 'Merge failed.'}</p>
      )}
      <div className="space-y-2">
        {candidates.map(({ incident: c, distance }) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(168,181,193,0.20)] p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-mono text-xs font-bold text-agap-textMain">{c.public_reference}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <StatusChip status={c.status} />
                <Badge variant="blue">
                  {distance == null ? 'distance n/a' : `${Math.round(distance)} m`}
                </Badge>
                <span className="text-xs text-agap-textSub">{timeAgo(c.submitted_at)}</span>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={merge.isPending && merge.variables?.duplicateOfId === c.id}
              onClick={() =>
                merge.mutate({ id: incident.id, duplicateOfId: c.id }, { onSuccess: onMerged })
              }
            >
              Merge
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
