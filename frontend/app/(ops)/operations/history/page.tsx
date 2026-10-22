'use client';

import { useState, type JSX } from 'react';
import { Archive } from 'lucide-react';
import { Badge, Button, DataTable, PriorityBadge, Skeleton, StatusChip, type Column } from '@/components/ui';
import { IncidentDetailDrawer } from '@/components/incidents/IncidentDetailDrawer';
import { useIncidents } from '@/features/incidents/hooks';
import type { IncidentListItem } from '@/features/incidents/api';
import { categoryIcon, titleCase } from '@/lib/incident-format';
import { cn } from '@/lib/utils';

/**
 * Incident History (spec §0): incidents that left the active queue. Filters map to
 * stored statuses and use GET /incidents?statuses=…, so counts come from the database
 * (meta.total), not from the rows on screen. Rows open the shared incident drawer,
 * which offers no actions on ended incidents.
 */
const FILTERS = [
  { key: 'ALL', label: 'All', statuses: ['RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND', 'REFERRED'] },
  { key: 'RESOLVED', label: 'Resolved & closed', statuses: ['RESOLVED', 'CLOSED'] },
  { key: 'REFERRED', label: 'Referred', statuses: ['REFERRED'] },
  { key: 'CANCELLED', label: 'Cancelled & false alerts', statuses: ['CANCELLED', 'FALSE_ALERT'] },
  { key: 'DUPLICATE', label: 'Duplicates', statuses: ['DUPLICATE'] },
  { key: 'UNABLE', label: 'Unable to respond', statuses: ['UNABLE_TO_RESPOND'] },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

const PER_PAGE = 25;

function fmtManila(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const columns: Column<IncidentListItem>[] = [
  {
    key: 'incident',
    header: 'Incident',
    accessor: (row) => {
      const Icon = categoryIcon(row.category);
      return (
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-agap-surface text-agap-textMid">
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[12px] font-semibold text-agap-textMain">{row.public_reference}</p>
            <p className="text-[11px] text-agap-textSub">{titleCase(row.category)}</p>
          </div>
        </div>
      );
    },
  },
  { key: 'priority', header: 'Priority', accessor: (row) => <PriorityBadge priority={row.priority} /> },
  { key: 'status', header: 'Outcome', accessor: (row) => <StatusChip status={row.status} /> },
  {
    key: 'barangay',
    header: 'Barangay',
    accessor: (row) => (
      <span className="text-xs text-agap-textMid">
        {row.incident_locations?.barangay ?? row.barangay_notices?.[0]?.barangay.name ?? '—'}
      </span>
    ),
  },
  {
    key: 'submitted',
    header: 'Reported',
    accessor: (row) => <span className="whitespace-nowrap text-xs text-agap-textSub">{fmtManila(row.submitted_at)}</span>,
  },
  {
    key: 'ended',
    header: 'Resolved / closed',
    accessor: (row) => (
      <span className="whitespace-nowrap text-xs text-agap-textSub">{fmtManila(row.closed_at ?? row.resolved_at)}</span>
    ),
  },
];

export default function IncidentHistoryPage(): JSX.Element {
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const statuses = [...FILTERS.find((f) => f.key === filter)!.statuses];
  const { data, isLoading, isError, refetch } = useIncidents({ statuses, page, perPage: PER_PAGE });
  const rows = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-agap-textMain">
          <Archive size={22} className="text-agap-green" aria-hidden />
          Incident History
        </h1>
        <p className="mt-0.5 text-sm text-agap-textSub">
          Incidents no longer in the active queue: resolved, closed, referred, cancelled, false alerts and duplicates.
        </p>
      </div>

      <div role="tablist" className="flex w-fit flex-wrap gap-1 rounded-xl bg-agap-surface p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={cn(
              'rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors',
              filter === f.key ? 'bg-white text-agap-textMain shadow-tile' : 'text-agap-textSub hover:text-agap-textMain',
            )}
          >
            {f.label}
          </button>
        ))}
        {data && <Badge variant="muted" className="ml-1 self-center">{data.meta.total}</Badge>}
      </div>

      {isError ? (
        <div className="flex items-center justify-between rounded-xl border border-agap-danger/20 bg-agap-dangerSoft px-4 py-3 text-sm text-agap-danger">
          Couldn&apos;t load incident history.
          <Button size="sm" variant="secondary" onClick={() => void refetch()}>Retry</Button>
        </div>
      ) : isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          selectedKey={selectedId ?? undefined}
          emptyTitle="No incidents here"
          emptyDescription="Incidents appear here once they leave the active queue."
        />
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-agap-textSub">
          <span>Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} total</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={!data.meta.hasPrev} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="secondary" disabled={!data.meta.hasNext} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <IncidentDetailDrawer
        incidentId={selectedId}
        open={!!selectedId}
        onOpenChange={(open) => { if (!open) setSelectedId(null); }}
      />
    </div>
  );
}
