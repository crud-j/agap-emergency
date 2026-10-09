'use client';

import { useState, type JSX } from 'react';
import { ShieldCheck, ChevronLeft, ChevronRight, Search, Lock } from 'lucide-react';
import {
  Badge, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Skeleton, EmptyState,
  type Column,
} from '@/components/ui';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { titleCase } from '@/lib/incident-format';
import { useAuditLog } from '@/features/audit/hooks';
import type { AuditLogEntry, AuditLogParams } from '@/features/audit/api';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_OPTIONS = [
  'ALL',
  'CREATE',
  'READ',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'PERMISSION_DENIED',
  'STATUS_CHANGE',
  'DISPATCH',
  'ESCALATE',
  'PUBLISH',
  'SUBSCRIBE',
  'UNSUBSCRIBE',
  'CONSENT_GRANT',
  'CONSENT_WITHDRAW',
  'DATA_EXPORT',
  'SYSTEM',
] as const;

const ENTITY_TYPES = [
  'ALL',
  'Incident',
  'Dispatch',
  'Resource',
  'Responder',
  'User',
  'Organization',
  'Announcement',
  'Hospital',
  'AuditLog',
] as const;

const PER_PAGE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ActionStyle { variant: 'green' | 'amber' | 'red' | 'blue' | 'muted' | 'orange' }

function actionStyle(action: string): ActionStyle {
  switch (action) {
    case 'CREATE':           return { variant: 'green' };
    case 'UPDATE':           return { variant: 'blue' };
    case 'STATUS_CHANGE':    return { variant: 'blue' };
    case 'DISPATCH':         return { variant: 'amber' };
    case 'ESCALATE':         return { variant: 'orange' };
    case 'DELETE':           return { variant: 'red' };
    case 'PERMISSION_DENIED':return { variant: 'red' };
    case 'PUBLISH':          return { variant: 'green' };
    case 'LOGIN':            return { variant: 'muted' };
    case 'LOGOUT':           return { variant: 'muted' };
    default:                 return { variant: 'muted' };
  }
}

function fmtTs(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function truncateId(id: string | null): string {
  if (!id) return '—';
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

// ─── Detail dialog ────────────────────────────────────────────────────────────

interface DetailDialogProps {
  entry: AuditLogEntry | null;
  onClose: () => void;
}

function DetailDialog({ entry, onClose }: DetailDialogProps): JSX.Element {
  if (!entry) return <></>;
  return (
    <Dialog open={!!entry} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-agap-green" />
            Audit Entry — Read-Only
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <Row label="Occurred At" value={fmtTs(entry.created_at)} />
          <Row label="Action">
            <Badge variant={actionStyle(entry.action).variant}>{entry.action}</Badge>
          </Row>
          <Row label="Entity Type" value={entry.entity_type ?? '—'} />
          <Row label="Entity ID">
            <code className="text-xs bg-agap-surface px-2 py-0.5 rounded font-mono break-all">
              {entry.entity_id ?? '—'}
            </code>
          </Row>
          <Row label="Actor">
            {entry.actor?.full_name
              ? <span className="font-medium text-agap-textMain">{entry.actor.full_name}</span>
              : <span className="text-agap-textSub">{entry.actor_id ? truncateId(entry.actor_id) : 'System'}</span>}
          </Row>
          <Row label="Actor Role">
            {entry.actor_role
              ? <Badge variant="muted">{entry.actor_role}</Badge>
              : <span className="text-agap-textSub">—</span>}
          </Row>
          <Row label="Org ID" value={entry.organization_id ? truncateId(entry.organization_id) : '—'} />
          <Row label="IP Address" value={entry.ip_address ?? '—'} />
          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1">Metadata</p>
              <pre className="rounded-xl bg-agap-surface p-3 text-xs text-agap-textMid overflow-x-auto">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-1.5 rounded-xl bg-agap-surface px-3 py-2">
          <Lock size={12} className="text-agap-textSub shrink-0" />
          <p className="text-xs text-agap-textSub">Immutable record — this entry cannot be edited or deleted.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label, value, children,
}: { label: string; value?: string; children?: JSX.Element }): JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <span className="w-28 shrink-0 text-xs font-semibold text-agap-textSub uppercase tracking-wide pt-0.5">{label}</span>
      <span className="flex-1">
        {children ?? <span className="text-agap-textMain">{value}</span>}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditPage(): JSX.Element {
  const user = useAuthUser();
  const authorized = hasRole(user, 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR');

  const [page, setPage] = useState(1);
  const [filterAction, setFilterAction] = useState('ALL');
  const [filterEntityType, setFilterEntityType] = useState('ALL');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const params: AuditLogParams = {
    page,
    perPage: PER_PAGE,
    ...(filterAction !== 'ALL' && { action: filterAction }),
    ...(filterEntityType !== 'ALL' && { entityType: filterEntityType }),
    ...(filterFrom && { from: new Date(filterFrom).toISOString() }),
    ...(filterTo && { to: new Date(filterTo + 'T23:59:59').toISOString() }),
  };

  const { data, isLoading } = useAuditLog(params);
  const rows: AuditLogEntry[] = data?.data ?? [];

  function resetFilters() {
    setFilterAction('ALL');
    setFilterEntityType('ALL');
    setFilterFrom('');
    setFilterTo('');
    setPage(1);
  }

  // ─── Columns ────────────────────────────────────────────────────────────

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'occurred_at',
      header: 'Occurred At',
      sortable: true,
      accessor: (row) => (
        <span className="text-xs text-agap-textMid whitespace-nowrap font-mono">
          {fmtTs(row.created_at)}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      sortable: true,
      accessor: (row) => (
        <Badge variant={actionStyle(row.action).variant} className="font-mono text-xs">
          {row.action}
        </Badge>
      ),
    },
    {
      key: 'entity_type',
      header: 'Entity',
      accessor: (row) => (
        <span className="text-sm font-medium text-agap-textMain">{row.entity_type ?? '—'}</span>
      ),
    },
    {
      key: 'entity_id',
      header: 'Entity ID',
      accessor: (row) => (
        <code className="text-xs text-agap-textSub font-mono">{truncateId(row.entity_id)}</code>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      accessor: (row) => (
        <span className="text-sm text-agap-textMain">
          {row.actor?.full_name ?? (row.actor_id ? truncateId(row.actor_id) : 'System')}
        </span>
      ),
    },
    {
      key: 'actor_role',
      header: 'Role',
      accessor: (row) =>
        row.actor_role
          ? <Badge variant="muted" className="text-xs">{titleCase(row.actor_role)}</Badge>
          : <span className="text-agap-textSub">—</span>,
    },
  ];

  // ─── Not authorized ──────────────────────────────────────────────────────

  if (!authorized && user !== null) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-agap-dangerSoft">
          <Lock size={28} className="text-agap-danger" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-agap-textMain">Access Restricted</h2>
          <p className="text-sm text-agap-textSub mt-1">
            The audit trail is accessible to Supervisors and System Administrators only.
          </p>
        </div>
      </div>
    );
  }

  // ─── Loading skeleton ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-10 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  const totalPages = data?.meta.totalPages ?? 1;
  const totalCount = data?.meta.total ?? 0;
  const hasFilters = filterAction !== 'ALL' || filterEntityType !== 'ALL' || !!filterFrom || !!filterTo;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-agap-textMain tracking-tight flex items-center gap-2">
            <ShieldCheck size={22} className="text-agap-green" />
            Audit Trail
          </h1>
          <p className="text-sm text-agap-textSub mt-0.5">
            MOD-46 · Immutable system log — no records can be edited or deleted
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[rgba(168,181,193,0.20)] bg-agap-surface px-3 py-1.5">
          <Lock size={13} className="text-agap-textSub" />
          <span className="text-xs font-semibold text-agap-textSub uppercase tracking-wide">Read-Only</span>
        </div>
      </div>

      {/* Immutable notice */}
      <div className="flex items-center gap-2.5 rounded-2xl border border-[rgba(13,96,83,0.16)] bg-agap-greenSoft px-4 py-3">
        <ShieldCheck size={15} className="text-agap-green shrink-0" />
        <p className="text-sm text-agap-textMid">
          Audit logs are <span className="font-semibold text-agap-textMain">insert-only</span>.
          Every consequential action is recorded here. Records cannot be updated, deleted, or filtered out of existence.
        </p>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl bg-white border border-[rgba(168,181,193,0.20)] shadow-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Action */}
          <div>
            <label className="block text-xs font-semibold text-agap-textSub mb-1.5 uppercase tracking-wide">
              Action
            </label>
            <Select value={filterAction} onValueChange={(v) => { setFilterAction(v); setPage(1); }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Any action" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a === 'ALL' ? 'Any action' : a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Entity type */}
          <div>
            <label className="block text-xs font-semibold text-agap-textSub mb-1.5 uppercase tracking-wide">
              Entity Type
            </label>
            <Select value={filterEntityType} onValueChange={(v) => { setFilterEntityType(v); setPage(1); }}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Any entity" />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t === 'ALL' ? 'Any entity' : t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* From */}
          <div>
            <label className="block text-xs font-semibold text-agap-textSub mb-1.5 uppercase tracking-wide">
              From
            </label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => { setFilterFrom(e.target.value); setPage(1); }}
              className="w-full h-9 rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 text-sm text-agap-textMain focus:outline-none focus:ring-2 focus:ring-agap-green"
            />
          </div>

          {/* To */}
          <div>
            <label className="block text-xs font-semibold text-agap-textSub mb-1.5 uppercase tracking-wide">
              To
            </label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => { setFilterTo(e.target.value); setPage(1); }}
              className="w-full h-9 rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 text-sm text-agap-textMain focus:outline-none focus:ring-2 focus:ring-agap-green"
            />
          </div>
        </div>

        {hasFilters && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-agap-textSub">
              <Search size={11} className="inline mr-1" />
              Filters active
            </p>
            <button
              onClick={resetFilters}
              className="text-xs font-semibold text-agap-green hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Count */}
      <p className="text-xs text-agap-textSub">
        {totalCount.toLocaleString()} entr{totalCount !== 1 ? 'ies' : 'y'}
        {hasFilters ? ' matching current filters' : ' total'}
      </p>

      {/* Table — no edit/delete affordances, row click = read-only detail */}
      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(row) => row.id}
        onRowClick={(row) => setSelected(row)}
        emptyTitle="No audit entries"
        emptyDescription={
          hasFilters
            ? 'No entries match the current filters. Try widening the date range or changing the action/entity type.'
            : 'Audit events will appear here as operations are performed.'
        }
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-agap-textSub">
            Page {page} of {totalPages} · {rows.length} entries shown
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                page === 1
                  ? 'border-[rgba(168,181,193,0.20)] text-agap-textSub cursor-not-allowed bg-agap-surface'
                  : 'border-[rgba(168,181,193,0.20)] text-agap-textMid hover:bg-agap-surface bg-white',
              )}
            >
              <ChevronLeft size={13} /> Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                page === totalPages
                  ? 'border-[rgba(168,181,193,0.20)] text-agap-textSub cursor-not-allowed bg-agap-surface'
                  : 'border-[rgba(168,181,193,0.20)] text-agap-textMid hover:bg-agap-surface bg-white',
              )}
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Read-only detail dialog */}
      <DetailDialog entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
