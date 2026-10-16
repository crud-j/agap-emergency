'use client';

import { useMemo, useState, type JSX } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, CheckCircle2, ArrowUpRight, Clock } from 'lucide-react';
import {
  Button, Badge, DataTable, PriorityBadge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  type Column,
} from '@/components/ui';
import { titleCase, timeAgo } from '@/lib/incident-format';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import {
  useEscalations,
  useAcknowledgeEscalation,
  useResolveEscalation,
} from '@/features/escalations/hooks';
import type { Escalation } from '@/features/escalations/api';

const ALL = 'ALL';
const STATUSES = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED'] as const;

function levelLabel(level: string): string {
  switch (level) {
    case 'LEVEL_1_SUPERVISOR':         return 'L1 · Supervisor';
    case 'LEVEL_2_INCIDENT_COMMANDER': return 'L2 · Incident Commander';
    case 'LEVEL_3_ADMINISTRATOR':      return 'L3 · Administrator';
    case 'LEVEL_4_DRRMO':              return 'L4 · DRRMO';
    default:                           return titleCase(level);
  }
}

function levelVariant(level: string): 'amber' | 'orange' | 'red' | 'muted' {
  switch (level) {
    case 'LEVEL_1_SUPERVISOR':         return 'amber';
    case 'LEVEL_2_INCIDENT_COMMANDER': return 'orange';
    case 'LEVEL_3_ADMINISTRATOR':
    case 'LEVEL_4_DRRMO':              return 'red';
    default:                           return 'muted';
  }
}

function statusVariant(status: string): 'red' | 'amber' | 'green' | 'muted' {
  switch (status) {
    case 'ACTIVE':       return 'red';
    case 'ACKNOWLEDGED': return 'amber';
    case 'RESOLVED':     return 'green';
    default:             return 'muted';
  }
}

function breachLabel(iso: string): { text: string; overdue: boolean } {
  const overdue = new Date(iso).getTime() < Date.now();
  return { text: timeAgo(iso), overdue };
}

export default function EscalationsPage(): JSX.Element {
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const user = useAuthUser();
  const canManageEscalations = hasRole(user, 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR');

  const { data, isLoading, isError, refetch } = useEscalations(
    statusFilter === ALL ? undefined : { status: statusFilter },
    { enabled: canManageEscalations },
  );
  const acknowledge = useAcknowledgeEscalation();
  const resolve = useResolveEscalation();

  const rows = useMemo<Escalation[]>(() => data ?? [], [data]);

  if (user && !canManageEscalations) {
    return (
      <div className="rounded-2xl border border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft p-6 text-center">
        <p className="text-sm text-agap-danger">
          Escalation monitoring requires the Supervisor or System Administrator role.
        </p>
      </div>
    );
  }

  const columns: Column<Escalation>[] = [
    {
      key: 'incident',
      header: 'Incident',
      accessor: (e) =>
        e.incidents ? (
          <Link
            href={`/operations/incidents?focus=${e.incident_id}`}
            className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-agap-green hover:underline"
          >
            {e.incidents.public_reference}
            <ArrowUpRight size={12} />
          </Link>
        ) : (
          <span className="font-mono text-xs text-agap-textSub">{e.incident_id.slice(0, 8)}</span>
        ),
    },
    {
      key: 'category',
      header: 'Category',
      accessor: (e) => (
        <span className="text-sm text-agap-textMid">
          {e.incidents ? titleCase(e.incidents.category) : '—'}
        </span>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      accessor: (e) => (e.incidents ? <PriorityBadge priority={e.incidents.priority} /> : <span>—</span>),
    },
    {
      key: 'level',
      header: 'Level',
      accessor: (e) => <Badge variant={levelVariant(e.escalation_level)}>{levelLabel(e.escalation_level)}</Badge>,
    },
    {
      key: 'reason',
      header: 'Reason',
      accessor: (e) => <span className="text-sm text-agap-textMid">{e.triggered_reason}</span>,
    },
    {
      key: 'breach',
      header: 'SLA breach',
      accessor: (e) => {
        const { text, overdue } = breachLabel(e.sla_breach_at);
        return (
          <span className={`inline-flex items-center gap-1 text-xs tabular-nums ${overdue ? 'text-agap-danger font-semibold' : 'text-agap-textSub'}`}>
            <Clock size={12} /> {text}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (e) => <Badge variant={statusVariant(e.status)}>{titleCase(e.status)}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      cellClassName: 'text-right',
      accessor: (e) => {
        if (e.status === 'RESOLVED' || e.status === 'CANCELLED') {
          return <span className="text-xs text-agap-textSub">{e.resolved_at ? timeAgo(e.resolved_at) : '—'}</span>;
        }
        return (
          <div className="flex justify-end gap-2">
            {e.status === 'ACTIVE' && (
              <Button
                variant="secondary"
                size="sm"
                loading={acknowledge.isPending && acknowledge.variables === e.id}
                onClick={() => acknowledge.mutate(e.id)}
              >
                <Check size={13} className="mr-1" /> Acknowledge
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              loading={resolve.isPending && resolve.variables === e.id}
              onClick={() => resolve.mutate(e.id)}
            >
              <CheckCircle2 size={13} className="mr-1" /> Resolve
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-agap-textMain flex items-center gap-2">
            <AlertTriangle size={22} className="text-agap-amber" />
            Escalations
          </h1>
          <p className="mt-0.5 text-sm text-agap-textSub">
            MOD-41 · SLA breaches awaiting supervisor action
            {!isLoading && ` · ${rows.length} shown`}
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(acknowledge.isError || resolve.isError) && (
        <p className="rounded-xl bg-agap-dangerSoft px-4 py-2 text-sm text-agap-danger">
          Action failed — please retry.
        </p>
      )}

      {isError ? (
        <div className="rounded-2xl border border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft p-6 text-center">
          <p className="text-sm text-agap-danger">Could not load escalations.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void refetch()}>Retry</Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(e) => e.id}
          loading={isLoading}
          emptyTitle="No escalations"
          emptyDescription="SLA breaches that need escalation will appear here."
        />
      )}
    </div>
  );
}
