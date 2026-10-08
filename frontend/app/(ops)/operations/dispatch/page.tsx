'use client';

import { useMemo, useState, type JSX } from 'react';
import { Siren, Truck, MapPin, Users, Sparkles, CheckCircle2, ExternalLink } from 'lucide-react';
import {
  Card, Button, PriorityBadge, StatusChip, Badge, Skeleton, EmptyState,
} from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { IncidentDetailDrawer } from '@/components/incidents/IncidentDetailDrawer';
import { useWsState } from '@/lib/use-ws-state';
import { useDispatchQueue, useDispatchRecommendations, useAvailableUnits, useCreateDispatch } from '@/features/dispatch/hooks';
import { useIncident, useUpdateIncidentStatus } from '@/features/incidents/hooks';
import { categoryIcon, titleCase, timeAgo } from '@/lib/incident-format';
import type { IncidentListItem } from '@/features/incidents/api';
import type { ResourceRecommendation } from '@/features/dispatch/api';

const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const DISPATCHABLE = ['ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING'];
const PRE_DISPATCH = ['SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING'];

function km(meters: number | null): string {
  if (meters == null) return 'distance n/a';
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * MOD-31 — Dispatcher Assignment and Authorization, with the MOD-29/30 ranked
 * unit recommendation panel. Recommendations are strictly assistive: the
 * dispatcher selects and confirms (CLAUDE.md rule 8). Assignment emits
 * incident.assigned / dispatch.created; the queue reflects it live.
 */
export default function DispatchPage(): JSX.Element {
  const wsState = useWsState();
  const { data: incidents = [], isLoading } = useDispatchQueue();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const queue = useMemo(
    () =>
      incidents
        .filter((i: IncidentListItem) => PRE_DISPATCH.includes(i.status))
        .sort((a, b) => {
          const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
          if (pr !== 0) return pr;
          return +new Date(a.submitted_at) - +new Date(b.submitted_at);
        }),
    [incidents],
  );

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[520px] flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-agap-textMain">Dispatch Operations</h1>
          <p className="mt-1 text-sm text-agap-textSub">
            {queue.length} incident{queue.length === 1 ? '' : 's'} awaiting dispatch · Bocaue MDRRMO
          </p>
        </div>
        <ConnectionIndicator state={wsState} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* Queue */}
        <Card padding="none" className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-[rgba(168,181,193,0.20)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-agap-textSub">
            Awaiting Dispatch
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : queue.length === 0 ? (
              <EmptyState title="Queue clear" description="No incidents are awaiting dispatch." />
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
        </Card>

        {/* Detail + recommendations */}
        <Card padding="none" className="flex min-h-0 flex-col overflow-hidden">
          {selectedId ? (
            <DispatchDetail
              incidentId={selectedId}
              onOpenFullDetail={() => setDrawerOpen(true)}
              onDispatched={() => setSelectedId(null)}
            />
          ) : (
            <EmptyState
              icon={Siren}
              title="Select an incident"
              description="Choose an emergency from the queue to review recommendations and authorize a unit."
            />
          )}
        </Card>
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
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-3 border-b border-[rgba(168,181,193,0.12)] px-4 py-3 text-left transition-colors ${
        selected ? 'bg-agap-greenSoft' : 'hover:bg-agap-surface'
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-agap-greenSoft text-agap-green">
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs font-bold text-agap-textMain">{incident.public_reference}</p>
        <p className="truncate text-xs text-agap-textSub">
          {incident.incident_locations?.barangay ?? titleCase(incident.category)} · {timeAgo(incident.submitted_at)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <PriorityBadge priority={incident.priority} showDot={false} />
        <StatusChip status={incident.status} />
      </div>
    </button>
  );
}

// ─── Detail + recommendation panel ────────────────────────────────────────────

function DispatchDetail({
  incidentId, onOpenFullDetail, onDispatched,
}: {
  incidentId: string;
  onOpenFullDetail: () => void;
  onDispatched: () => void;
}): JSX.Element {
  const { data: incident, isLoading } = useIncident(incidentId);

  if (isLoading || !incident) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
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
      </div>

      {/* Body */}
      <div className="flex-1 p-5">
        {hasDispatch ? (
          <div className="flex items-center gap-2 rounded-xl border border-agap-greenSoft bg-agap-greenSoft/60 px-4 py-3 text-agap-green">
            <CheckCircle2 size={18} />
            <span className="text-sm font-semibold">Unit dispatched — tracking live.</span>
          </div>
        ) : dispatchable ? (
          <RecommendationPanel incidentId={incident.id} onDispatched={onDispatched} />
        ) : (
          <PreDispatchActions incidentId={incident.id} status={incident.status} />
        )}
      </div>
    </div>
  );
}

// ─── Pre-dispatch lifecycle advance (SUBMITTED/RECEIVED → dispatchable) ─────────

function PreDispatchActions({ incidentId, status }: { incidentId: string; status: string }): JSX.Element {
  const update = useUpdateIncidentStatus();
  // Faithful to the lifecycle map: SUBMITTED→RECEIVED→ACKNOWLEDGED→ASSESSED.
  const next =
    status === 'SUBMITTED' ? { to: 'RECEIVED', label: 'Mark Received' } :
    status === 'RECEIVED' ? { to: 'ACKNOWLEDGED', label: 'Acknowledge' } :
    null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-agap-textSub">
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
          loading={update.isPending}
          onClick={() => update.mutate({ id: incidentId, status: next.to })}
        >
          {next.label}
        </Button>
      )}
    </div>
  );
}

// ─── MOD-29/30 recommendation panel ────────────────────────────────────────────

function RecommendationPanel({
  incidentId, onDispatched,
}: {
  incidentId: string;
  onDispatched: () => void;
}): JSX.Element {
  const { data: recommendations, isLoading, isError, refetch } = useDispatchRecommendations(incidentId);
  const { data: availableUnits } = useAvailableUnits();
  const createDispatch = useCreateDispatch();

  const [unitId, setUnitId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  function authorize() {
    if (!unitId) return;
    createDispatch.mutate(
      { incidentId, resourceId: unitId, ...(notes.trim() ? { dispatchNotes: notes.trim() } : {}) },
      { onSuccess: () => onDispatched() },
    );
  }

  const ranked = recommendations ?? [];
  const showFallback = !isLoading && !isError && ranked.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-agap-info" />
        <h3 className="text-sm font-bold text-agap-textMain">Recommended units</h3>
        <span className="text-xs text-agap-textSub">— assistive; you decide</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft p-4 text-center">
          <p className="text-sm text-agap-danger">Couldn&apos;t load recommendations.</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void refetch()}>Retry</Button>
        </div>
      ) : showFallback ? (
        <FallbackUnits units={availableUnits ?? []} selectedId={unitId} onSelect={setUnitId} />
      ) : (
        <div className="space-y-2">
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

      {/* Confirm-to-assign */}
      <div className="space-y-2 border-t border-[rgba(168,181,193,0.20)] pt-4">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Dispatch notes (optional)…"
          rows={2}
          className="w-full resize-none rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
        />
        {createDispatch.isError && (
          <p className="text-xs text-agap-danger">
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
          <Siren size={16} /> Authorize dispatch
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
  const matched = rec.matchedCapabilities.length;
  const capVariant = required === 0 ? 'muted' : matched >= required ? 'green' : matched > 0 ? 'amber' : 'red';
  const capLabel = required === 0 ? 'No specific capability' : `${matched}/${required} capability`;

  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-left transition-colors ${
        selected ? 'border-agap-green bg-agap-greenSoft' : 'border-[rgba(168,181,193,0.20)] hover:bg-agap-surface'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-agap-green text-xs font-bold text-white">
            {rec.rank}
          </span>
          <span className="flex items-center gap-1.5 font-semibold text-agap-textMain">
            <Truck size={14} className="text-agap-textSub" />
            {rec.callSign ?? rec.resourceName}
          </span>
        </div>
        <span className="text-xs font-semibold text-agap-textSub tabular-nums">score {rec.score.toFixed(0)}</span>
      </div>

      {/* Score bar */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-agap-track">
        <div className="h-full rounded-full bg-agap-green" style={{ width: `${Math.min(100, Math.max(0, rec.score))}%` }} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="muted">{titleCase(rec.resourceType)}</Badge>
        <Badge variant={capVariant}>{capLabel}</Badge>
        <Badge variant="blue">{km(rec.distanceMeters)}</Badge>
      </div>
      <p className="mt-1.5 text-xs text-agap-textSub">{rec.rationale}</p>
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
    return <p className="text-sm text-agap-amber">No units available right now.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-agap-textSub">
        No ranked recommendation available (missing location or capabilities). Showing available units:
      </p>
      {units.map((u) => (
        <button
          key={u.id}
          onClick={() => onSelect(u.id)}
          className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors ${
            selectedId === u.id ? 'border-agap-green bg-agap-greenSoft' : 'border-[rgba(168,181,193,0.20)] hover:bg-agap-surface'
          }`}
        >
          <span className="flex items-center gap-1.5 font-semibold text-agap-textMain">
            <Truck size={14} className="text-agap-textSub" />
            {u.call_sign ?? u.name}
          </span>
          <span className="text-xs text-agap-textSub">
            {titleCase(u.resource_type)}{u.base_barangay ? ` · ${u.base_barangay}` : ''}
          </span>
        </button>
      ))}
    </div>
  );
}
