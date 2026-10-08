'use client';

import { useMemo, useState, type JSX } from 'react';
import { Search } from 'lucide-react';
import {
  DataTable, PriorityBadge, StatusChip, Button,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  type Column,
} from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { IncidentDetailDrawer } from '@/components/incidents/IncidentDetailDrawer';
import { useWsState } from '@/lib/use-ws-state';
import { useIncidents } from '@/features/incidents/hooks';
import { categoryIcon, titleCase, timeAgo, ACTIVE_STATUSES } from '@/lib/incident-format';
import type { IncidentListItem } from '@/features/incidents/api';

const ALL = 'ALL';
const PRIORITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const CATEGORIES = ['MEDICAL', 'ROAD_ACCIDENT', 'FLOOD', 'RESCUE', 'FIRE', 'INDUSTRIAL', 'DEBRIS', 'OTHER'];
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const STATUSES = [
  'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING',
  'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING',
  'RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE',
];

type SortKey = 'newest' | 'oldest' | 'priority';

interface QueueRow {
  id: string;
  reference: string;
  category: string;
  priority: string;
  status: string;
  barangay: string;
  submitted_at: string;
}

/**
 * MOD-23/24 — Incident Command Queue. Filterable/sortable DataTable of incidents
 * with live insert/update (SocketProvider keeps the ['incidents'] cache fresh).
 * Row click opens the shared IncidentDetailDrawer (also used by the map).
 */
export default function IncidentQueuePage(): JSX.Element {
  const wsState = useWsState();
  const { data, isLoading, isError, refetch } = useIncidents({ perPage: 100 });
  const incidents = useMemo<IncidentListItem[]>(() => data?.data ?? [], [data]);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [priority, setPriority] = useState(ALL);
  const [barangay, setBarangay] = useState(ALL);
  const [sort, setSort] = useState<SortKey>('newest');
  const [onlyActive, setOnlyActive] = useState(true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      .filter((i) => (onlyActive ? ACTIVE_STATUSES.includes(i.status) : true))
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
      }));
  }, [incidents, search, status, category, priority, barangay, sort, onlyActive]);

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
    { key: 'status', header: 'Status', accessor: (r) => <StatusChip status={r.status} /> },
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
            {rows.length} {onlyActive ? 'active' : 'total'} incident{rows.length === 1 ? '' : 's'}
          </p>
        </div>
        <ConnectionIndicator state={wsState} />
      </div>

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
        <FilterSelect value={priority} onChange={setPriority} placeholder="Priority" options={PRIORITIES} />
        <FilterSelect value={barangay} onChange={setBarangay} placeholder="Barangay" options={barangayOptions} />

        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="priority">Priority</SelectItem>
          </SelectContent>
        </Select>

        <Button variant={onlyActive ? 'primary' : 'secondary'} size="sm" onClick={() => setOnlyActive((v) => !v)}>
          {onlyActive ? 'Active only' : 'All statuses'}
        </Button>
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
          emptyDescription="Adjust the filters above, or wait for new reports to arrive live."
        />
      )}

      <IncidentDetailDrawer incidentId={selectedId} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}

function FilterSelect({
  value, onChange, placeholder, options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}): JSX.Element {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-40">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {placeholder.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{titleCase(o)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
