'use client';

import { Suspense, useEffect, useMemo, useState, type JSX } from 'react';
import { useSearchParams } from 'next/navigation';
import { Archive, Search } from 'lucide-react';
import {
  DataTable, PriorityBadge, StatusChip, Button, Badge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  type Column,
} from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { IncidentDetailDrawer } from '@/components/incidents/IncidentDetailDrawer';
import { cn } from '@/lib/utils';
import { useWsState } from '@/lib/use-ws-state';
import { useIncidents } from '@/features/incidents/hooks';
import { categoryIcon, titleCase, priorityLabel, timeAgo, ACTIVE_STATUSES } from '@/lib/incident-format';
import type { IncidentListItem } from '@/features/incidents/api';
import { FIRE_TONE_BADGE, fireQueueBadge } from '@/lib/fire-report-view';
import { rescueQueueBadge } from '@/lib/rescue-trip-view';

const ALL = 'ALL';
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const CATEGORIES = ['MEDICAL', 'ROAD_ACCIDENT', 'FLOOD', 'NATURAL_DISASTER', 'RESCUE', 'FIRE', 'INDUSTRIAL', 'DEBRIS', 'OTHER'];
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const STATUSES = [
  'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING',
  'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING',
  'RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE',
  'UNABLE_TO_RESPOND', 'REFERRED',
];
const ARCHIVE_STATUSES = [
  'RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE',
  'UNABLE_TO_RESPOND', 'REFERRED',
];
const QUEUE_VIEWS = ['ACTIVE', 'ARCHIVE', 'ALL'] as const;
type QueueView = (typeof QUEUE_VIEWS)[number];

type SortKey = 'newest' | 'oldest' | 'priority';

interface QueueRow {
  id: string;
  reference: string;
  category: string;
  priority: string;
  status: string;
  barangay: string;
  submitted_at: string;
  fire: ReturnType<typeof fireQueueBadge>;
  rescued: string | null;
}

/**
 * MOD-23/24 — Incident Command Queue. Filterable/sortable DataTable of incidents
 * with live insert/update (SocketProvider keeps the ['incidents'] cache fresh).
 * Row click opens the shared IncidentDetailDrawer (also used by the map).
 * `?id=<incidentId>` (the notification bell's links) opens that incident directly.
 */
export default function IncidentQueuePage(): JSX.Element {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense>
      <IncidentQueue />
    </Suspense>
  );
}

function IncidentQueue(): JSX.Element {
  const wsState = useWsState();
  const searchParams = useSearchParams();
  const linkedId = searchParams.get('id');
  // The bell adds `n` (the notification id), so a second notice for an already-open
  // incident still reopens the drawer.
  const linkNonce = searchParams.get('n');
  const [view, setView] = useState<QueueView>('ACTIVE');
  const [page, setPage] = useState(1);
  const queryStatuses = view === 'ACTIVE'
    ? ACTIVE_STATUSES
    : view === 'ARCHIVE'
      ? ARCHIVE_STATUSES
      : undefined;
  const { data, isLoading, isError, refetch } = useIncidents({
    perPage: 100,
    page,
    ...(queryStatuses && { statuses: queryStatuses }),
  });
  const incidents = useMemo<IncidentListItem[]>(() => data?.data ?? [], [data]);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [barangay, setBarangay] = useState(ALL);
  const [sort, setSort] = useState<SortKey>('newest');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!linkedId) return;
    setSelectedId(linkedId);
    setDrawerOpen(true);
  }, [linkedId, linkNonce]);

  const barangayOptions = useMemo(() => {
    const set = new Set<string>();
    incidents.forEach((i) => {
      const b = i.incident_locations?.barangay;
      if (b) set.add(b);
    });
    return [...set].sort();
  }, [incidents]);

  const rows = useMemo<QueueRow[]>(() => {
    const q = search.trim().toLowerCase();
    return incidents
      .filter((i) => (status === ALL ? true : i.status === status))
      .filter((i) => (category === ALL ? true : i.category === category))
      .filter((i) => (priority === ALL ? true : i.priority === priority))
      .filter((i) => (barangay === ALL ? true : i.incident_locations?.barangay === barangay))
      .filter((i) =>
        q
          ? i.public_reference.toLowerCase().includes(q) ||
            (i.incident_locations?.barangay ?? '').toLowerCase().includes(q) ||
            i.category.toLowerCase().includes(q)
          : true,
      )
      .sort((a, b) => {
        if (sort === 'priority') {
          const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
          if (pr !== 0) return pr;
          return +new Date(a.submitted_at) - +new Date(b.submitted_at);
        }
        const diff = +new Date(a.submitted_at) - +new Date(b.submitted_at);
        return sort === 'oldest' ? diff : -diff;
      })
      .map((i) => ({
        id: i.id,
        reference: i.public_reference,
        category: i.category,
        priority: i.priority,
        status: i.status,
        barangay: i.incident_locations?.barangay ?? '—',
        submitted_at: i.submitted_at,
        fire: fireQueueBadge(i),
        rescued: rescueQueueBadge(i),
      }));
  }, [incidents, search, status, category, priority, barangay, sort]);

  const columns: Column<QueueRow>[] = [
    {
      key: 'reference',
      header: 'Reference',
      accessor: (r) => <span className="font-mono text-xs font-bold text-agap-textMain">{r.reference}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      accessor: (r) => {
        const Icon = categoryIcon(r.category);
        return (
          <span className="inline-flex items-center gap-2 text-sm">
            <Icon size={16} className="text-agap-textSub" />
            {titleCase(r.category)}
          </span>
        );
      },
    },
    { key: 'priority', header: 'Priority', accessor: (r) => <PriorityBadge priority={r.priority} /> },
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <StatusChip status={r.status} />
          {/* MOD-36: the latest fire report's status (plan Phase 3). */}
          {r.fire && <Badge variant={FIRE_TONE_BADGE[r.fire.tone]}>{r.fire.text}</Badge>}
          {/* MOD-52: people rescued so far by rescue units (plan Phase 4). */}
          {r.rescued && <Badge variant="green">{r.rescued}</Badge>}
        </span>
      ),
    },
    { key: 'barangay', header: 'Barangay', accessor: (r) => <span className="text-sm text-agap-textMid">{r.barangay}</span> },
    { key: 'age', header: 'Age', accessor: (r) => <span className="text-xs text-agap-textSub tabular-nums">{timeAgo(r.submitted_at)}</span> },
  ];

  function openRow(id: string) {
    setSelectedId(id);
    setDrawerOpen(true);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-agap-textMain">Incident Queue</h1>
          <p className="mt-1 text-sm text-agap-textSub">
            {rows.length} shown · {data?.meta.total ?? rows.length}{' '}
            {view === 'ACTIVE' ? 'active' : view === 'ARCHIVE' ? 'archived' : 'total'} incidents
          </p>
        </div>
        <ConnectionIndicator state={wsState} />
      </div>

      <div role="tablist" aria-label="Incident views" className="flex w-fit flex-wrap gap-1 rounded-xl bg-agap-surface p-1">
        {QUEUE_VIEWS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={view === tab}
            onClick={() => { setView(tab); setPage(1); setStatus(ALL); }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors',
              view === tab
                ? 'bg-white text-agap-textMain shadow-tile'
                : 'text-agap-textSub hover:text-agap-textMain',
            )}
          >
            {tab === 'ARCHIVE' && <Archive size={14} aria-hidden />}
            {tab === 'ACTIVE' ? 'Active' : tab === 'ARCHIVE' ? 'Archive' : 'All incidents'}
          </button>
        ))}
      </div>
      {view === 'ARCHIVE' && (
        <p className="text-xs text-agap-textSub">
          Resolved and terminal incidents, including cancelled, duplicate, and false-alert reports.
        </p>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-agap-textSub" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref, barangay, category…"
            className="h-10 w-64 rounded-xl border border-[rgba(168,181,193,0.20)] bg-white pl-9 pr-3 text-sm text-agap-textMain shadow-tile placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
          />
        </div>

        <FilterSelect value={status} onChange={setStatus} placeholder="Status" options={STATUSES} />
        <FilterSelect value={category} onChange={setCategory} placeholder="Category" options={CATEGORIES} />
        <FilterSelect value={priority} onChange={setPriority} placeholder="Priority" options={PRIORITIES} labelFor={priorityLabel} />
        <FilterSelect value={barangay} onChange={setBarangay} placeholder="Barangay" options={barangayOptions} />

        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
          </SelectContent>
        </Select>

      </div>

      {/* Table */}
      {isError ? (
        <div className="rounded-2xl border border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft p-6 text-center">
          <p className="text-sm text-agap-danger">Couldn&apos;t load incidents.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void refetch()}>Retry</Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(r) => r.id}
          loading={isLoading}
          onRowClick={(r) => openRow(r.id)}
          selectedKey={selectedId ?? undefined}
          emptyTitle="No incidents match"
          emptyDescription={
            view === 'ARCHIVE'
              ? 'Resolved, cancelled, duplicate, and false-alert incidents will appear here.'
              : 'Adjust the filters above, or wait for new reports to arrive live.'
          }
        />
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-agap-textSub">
          <span>Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} incidents</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={!data.meta.hasPrev} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="secondary" disabled={!data.meta.hasNext} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <IncidentDetailDrawer incidentId={selectedId} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

function FilterSelect({
  value, onChange, placeholder, options, labelFor = titleCase,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
  labelFor?: (v: string) => string;
}): JSX.Element {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-40">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {placeholder.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{labelFor(o)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
