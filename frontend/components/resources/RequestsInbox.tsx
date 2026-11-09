'use client';

import { useState, type JSX } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import {
  Badge, Button, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  type BadgeVariant, type Column,
} from '@/components/ui';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { titleCase, priorityLabel } from '@/lib/incident-format';
import { cn } from '@/lib/utils';
import { useApproveMutualAid, useDenyMutualAid, useMutualAidRequests } from '@/features/incidents/command-hooks';
import type { MutualAidListParams, MutualAidRequest } from '@/features/incidents/command';

type View = 'open' | 'ours' | 'all';

const VIEWS: { key: View; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'ours', label: 'Our organization' },
  { key: 'all', label: 'All' },
];

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: 'amber',
  OFFERED: 'blue',
  ACCEPTED: 'green',
  FULFILLED: 'green',
  REJECTED: 'red',
  CANCELLED: 'muted',
};

const PRIORITY_VARIANT: Record<string, BadgeVariant> = {
  CRITICAL: 'red',
  HIGH: 'amber',
  MEDIUM: 'blue',
  LOW: 'muted',
};

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function orgLabel(org: MutualAidRequest['requesting_org'] | null | undefined): string {
  return org?.short_name ?? org?.name ?? '—';
}

interface Pending {
  request: MutualAidRequest;
  accept: boolean;
}

/**
 * Mutual-aid requests for the Org Administrator (MOD-35, role dashboards plan Phase 6).
 * Requests go to every organization; accepting makes this organization the provider.
 * The server refuses accepting your own request and answering one twice. The System
 * Administrator can view requests; only an organization answers them (403 otherwise).
 */
export function RequestsInbox(): JSX.Element {
  const user = useAuthUser();
  const ownOrgId = user?.orgId;
  const viewOnly = hasRole(user, 'SYSTEM_ADMINISTRATOR') && !ownOrgId;
  const [view, setView] = useState<View>('open');
  const [pending, setPending] = useState<Pending | null>(null);
  const [notes, setNotes] = useState('');

  const params: MutualAidListParams =
    view === 'open' ? { status: 'PENDING' } : view === 'ours' && ownOrgId ? { orgId: ownOrgId } : {};
  const { data, isLoading, isError } = useMutualAidRequests(params);
  const approve = useApproveMutualAid();
  const deny = useDenyMutualAid();
  const rows = data?.data ?? [];

  const busy = approve.isPending || deny.isPending;
  const error = (approve.error ?? deny.error) as Error | null;

  function openDialog(request: MutualAidRequest, accept: boolean) {
    approve.reset();
    deny.reset();
    setNotes('');
    setPending({ request, accept });
  }

  async function confirm() {
    if (!pending) return;
    const body = { id: pending.request.id, ...(notes.trim() && { notes: notes.trim() }) };
    try {
      await (pending.accept ? approve : deny).mutateAsync(body);
      setPending(null);
    } catch {
      // Shown in the dialog.
    }
  }

  const columns: Column<MutualAidRequest>[] = [
    {
      key: 'resource',
      header: 'Needed',
      accessor: (row) => (
        <div className="min-w-0">
          <p className="font-semibold text-agap-textMain">
            {row.quantity} × {titleCase(row.resource_type)}
          </p>
          {row.capability_needed.length > 0 && (
            <p className="text-xs text-agap-textSub">{row.capability_needed.map(titleCase).join(', ')}</p>
          )}
          {row.request_notes && <p className="mt-0.5 max-w-sm text-xs text-agap-textMid">{row.request_notes}</p>}
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      accessor: (row) => <Badge variant={PRIORITY_VARIANT[row.priority] ?? 'default'}>{priorityLabel(row.priority)}</Badge>,
    },
    {
      key: 'requesting',
      header: 'Requested by',
      accessor: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-agap-textMain">{orgLabel(row.requesting_org)}</span>
          {row.requesting_org_id === ownOrgId && <Badge variant="muted">Yours</Badge>}
        </div>
      ),
    },
    {
      key: 'providing',
      header: 'Provider',
      accessor: (row) => <span className="text-sm text-agap-textMid">{orgLabel(row.providing_org)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (row) => <Badge variant={STATUS_VARIANT[row.status] ?? 'default'}>{titleCase(row.status)}</Badge>,
    },
    {
      key: 'requested_at',
      header: 'Requested',
      accessor: (row) => <span className="whitespace-nowrap text-xs text-agap-textSub">{fmtTs(row.requested_at)}</span>,
    },
    {
      key: 'actions',
      header: '',
      cellClassName: 'text-right',
      headerClassName: 'text-right',
      accessor: (row) => {
        if (row.status !== 'PENDING') return null;
        // Say why a Pending request can't be answered here instead of showing nothing.
        if (ownOrgId && row.requesting_org_id === ownOrgId) {
          return <span className="text-xs text-agap-textSub">Your organization made this request</span>;
        }
        if (!ownOrgId) {
          return (
            <span className="text-xs text-agap-textSub">
              Only an Org Administrator of another organization can provide units.
            </span>
          );
        }
        return (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => openDialog(row, true)}
              className="inline-flex items-center gap-1 rounded-lg bg-agap-greenSoft px-2.5 py-1 text-xs font-semibold text-agap-green transition-colors hover:bg-agap-green hover:text-white"
            >
              <CheckCircle2 size={11} /> Provide
            </button>
            <button
              type="button"
              onClick={() => openDialog(row, false)}
              className="inline-flex items-center gap-1 rounded-lg bg-agap-dangerSoft px-2.5 py-1 text-xs font-semibold text-agap-danger transition-colors hover:bg-red-100"
            >
              <XCircle size={11} /> Deny
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {viewOnly && (
        <p className="rounded-xl bg-agap-infoSoft px-4 py-3 text-sm text-agap-textMid">
          You can view requests. An organization&apos;s administrator answers them.
        </p>
      )}
      {!ownOrgId && !viewOnly && (
        <p className="rounded-xl bg-agap-amberSoft px-4 py-3 text-sm text-agap-amber">
          Your account is not linked to an organization, so you can view requests but not answer them.
          Ask the System Administrator to add you to your organization.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex items-center gap-1 rounded-xl bg-agap-surface p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                view === v.key ? 'bg-white text-agap-green shadow-tile' : 'text-agap-textSub hover:text-agap-textMain',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-agap-textSub">
          {rows.length} request{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {isError ? (
        <p className="rounded-xl bg-agap-dangerSoft px-4 py-3 text-sm text-agap-danger">Couldn&apos;t load requests.</p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(r) => r.id}
          loading={isLoading}
          emptyTitle={view === 'open' ? 'No open requests' : 'No requests'}
          emptyDescription={
            view === 'open'
              ? 'When MDRRMO or a partner agency asks for units, the request appears here.'
              : 'Requests your organization made or answered will appear here.'
          }
        />
      )}

      <Dialog open={!!pending} onOpenChange={(open) => { if (!open && !busy) setPending(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pending?.accept ? 'Provide these units?' : 'Deny this request?'}</DialogTitle>
            {pending && (
              <DialogDescription>
                {pending.request.quantity} × {titleCase(pending.request.resource_type)} for{' '}
                {orgLabel(pending.request.requesting_org)}.{' '}
                {pending.accept
                  ? `${user?.orgName ?? 'Your organization'} becomes the provider.`
                  : 'The request closes for every organization.'}
              </DialogDescription>
            )}
          </DialogHeader>
          <div>
            <label htmlFor="request-notes" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-agap-textSub">
              Notes (optional)
            </label>
            <textarea
              id="request-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={pending?.accept ? 'Unit call sign, ETA to staging…' : 'Reason…'}
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain focus:outline-none focus:ring-2 focus:ring-agap-green"
            />
            {error && <p className="mt-1.5 text-xs text-agap-danger">{error.message}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>Cancel</Button>
            <Button variant={pending?.accept ? 'primary' : 'danger'} loading={busy} onClick={confirm}>
              {pending?.accept ? 'Provide' : 'Deny'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
