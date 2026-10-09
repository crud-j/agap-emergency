'use client';

import { useState, type JSX } from 'react';
import {
  Network, Plus, Package, ArrowRightLeft, CheckCircle2,
  XCircle, Clock, AlertTriangle, Shield, Building2, ClipboardList,
  HandshakeIcon,
} from 'lucide-react';
import {
  Button, Badge, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Skeleton, EmptyState,
  Tabs, TabsList, TabsTrigger,
  type Column,
} from '@/components/ui';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { titleCase } from '@/lib/incident-format';
import { useIncidents } from '@/features/incidents/hooks';
import {
  useIncidentAgencies,
  useAvailableAgencies,
  useAddAgency,
  useHandovers,
  useCreateHandover,
  useAcknowledgeHandover,
  useMutualAidRequests,
  useCreateMutualAidRequest,
  useApproveMutualAid,
  useDenyMutualAid,
} from '@/features/incidents/command-hooks';
import type {
  AgencyParticipant,
  HandoverRecord,
  MutualAidRequest,
  CreateMutualAidBody,
} from '@/features/incidents/command';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const RESOURCE_TYPES = [
  'AMBULANCE', 'RESCUE_BOAT', 'FIRE_TRUCK', 'RESCUE_TRUCK',
  'CLEARING_EQUIPMENT', 'MOTORCYCLE_RESPONDER', 'COMMAND_VEHICLE', 'OTHER',
] as const;

const REQUEST_STATUSES = ['ALL', 'PENDING', 'OFFERED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'FULFILLED'] as const;

const ACTIVE_STATUSES = [
  'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED',
  'DISPATCH_PENDING', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTs(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function requestStatusVariant(status: string): 'green' | 'amber' | 'blue' | 'red' | 'muted' {
  switch (status) {
    case 'ACCEPTED':  return 'green';
    case 'FULFILLED': return 'green';
    case 'PENDING':   return 'amber';
    case 'OFFERED':   return 'blue';
    case 'REJECTED':  return 'red';
    case 'CANCELLED': return 'muted';
    default:          return 'muted';
  }
}

// ─── Incident Picker ──────────────────────────────────────────────────────────

function IncidentPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}): JSX.Element {
  const { data, isLoading } = useIncidents({ perPage: 50 });
  const active = (data?.data ?? []).filter((i) => ACTIVE_STATUSES.includes(i.status));

  if (isLoading) return <Skeleton className="h-10 rounded-xl" />;

  return (
    <Select value={value ?? ''} onValueChange={(v) => onChange(v || null)}>
      <SelectTrigger>
        <SelectValue placeholder="Choose an active incident…" />
      </SelectTrigger>
      <SelectContent>
        {active.length === 0 ? (
          <SelectItem value="__none__" disabled>No active incidents</SelectItem>
        ) : (
          active.map((inc) => (
            <SelectItem key={inc.id} value={inc.id}>
              {inc.public_reference} — {titleCase(inc.category)} ({titleCase(inc.status)})
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

// ─── Agencies Tab ─────────────────────────────────────────────────────────────

function AddAgencyDialog({
  incidentId,
  open,
  onClose,
}: {
  incidentId: string;
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const { data: available } = useAvailableAgencies(incidentId, undefined);
  const [orgId, setOrgId] = useState('');
  const [role, setRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useAddAgency();

  async function handleConfirm() {
    if (!orgId) { setError('Select an organization.'); return; }
    try {
      setError(null);
      await add.mutateAsync({ incidentId, organizationId: orgId, ...(role && { roleInIncident: role }) });
      setOrgId(''); setRole('');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to add agency.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus size={16} className="text-agap-green" /> Add Agency
          </DialogTitle>
          <DialogDescription>
            Invite an organization to participate in this incident.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              Organization <span className="text-agap-danger">*</span>
            </label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {(available ?? []).map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.short_name ?? org.name} ({org.organization_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              Role in Incident <span className="text-agap-textSub font-normal normal-case">(optional)</span>
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Fire suppression lead"
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
            />
          </div>
          {error && <p className="text-xs text-agap-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={add.isPending} onClick={handleConfirm}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgenciesTab(): JSX.Element {
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const canEdit = useAuthUser();
  const isSuper = hasRole(canEdit, 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR');

  const { data: agencies, isLoading } = useIncidentAgencies(incidentId);

  const columns: Column<AgencyParticipant>[] = [
    {
      key: 'org',
      header: 'Organization',
      accessor: (row) => (
        <div>
          <p className="font-semibold text-agap-textMain">
            {row.organizations?.name ?? '—'}
          </p>
          {row.organizations?.short_name && (
            <p className="text-xs text-agap-textSub">{row.organizations.short_name}</p>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      accessor: (row) => (
        <Badge variant="blue">{row.organizations?.organization_type ?? '—'}</Badge>
      ),
    },
    {
      key: 'role',
      header: 'Role in Incident',
      accessor: (row) => (
        <span className="text-sm text-agap-textMid">{row.role_in_incident ?? '—'}</span>
      ),
    },
    {
      key: 'joined',
      header: 'Joined',
      accessor: (row) => <span className="text-xs text-agap-textSub">{fmtTs(row.joined_at)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (row) => (
        row.left_at
          ? <Badge variant="muted">Left {fmtTs(row.left_at)}</Badge>
          : <Badge variant="green">Active</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white border border-[rgba(168,181,193,0.20)] shadow-card p-4 flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
            Incident
          </label>
          <IncidentPicker value={incidentId} onChange={setIncidentId} />
        </div>
        {incidentId && isSuper && (
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add Agency
          </Button>
        )}
      </div>

      {incidentId ? (
        <DataTable
          columns={columns}
          data={agencies ?? []}
          getRowKey={(r) => r.id}
          loading={isLoading}
          emptyTitle="No agencies participating"
          emptyDescription="No external organizations have been added to this incident."
        />
      ) : (
        <div className="rounded-2xl bg-white border border-[rgba(168,181,193,0.20)] shadow-card">
          <EmptyState icon={Building2} title="Select an incident" description="Choose an incident above to see its participating agencies." />
        </div>
      )}

      {incidentId && (
        <AddAgencyDialog
          incidentId={incidentId}
          open={addOpen}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Mutual Aid Tab ───────────────────────────────────────────────────────────

function CreateRequestDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<CreateMutualAidBody>>({
    quantity: 1,
    priority: 'HIGH',
  });
  const [error, setError] = useState<string | null>(null);
  const create = useCreateMutualAidRequest();

  async function handleSubmit() {
    if (!incidentId || !form.resourceType) {
      setError('Incident and resource type are required.');
      return;
    }
    try {
      setError(null);
      await create.mutateAsync({
        incidentId,
        resourceType: form.resourceType!,
        quantity: form.quantity ?? 1,
        priority: form.priority ?? 'HIGH',
        ...(form.requestNotes && { requestNotes: form.requestNotes }),
      });
      setForm({ quantity: 1, priority: 'HIGH' });
      setIncidentId(null);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Request failed.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package size={16} className="text-agap-green" /> Request Mutual Aid
          </DialogTitle>
          <DialogDescription>
            Request additional resources from partner agencies.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              Incident <span className="text-agap-danger">*</span>
            </label>
            <IncidentPicker value={incidentId} onChange={setIncidentId} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
                Resource Type <span className="text-agap-danger">*</span>
              </label>
              <Select value={form.resourceType ?? ''} onValueChange={(v) => setForm(f => ({ ...f, resourceType: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((t) => <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
                Quantity
              </label>
              <input
                type="number"
                min={1}
                value={form.quantity ?? 1}
                onChange={(e) => setForm(f => ({ ...f, quantity: +e.target.value }))}
                className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain focus:outline-none focus:ring-2 focus:ring-agap-green"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              Priority
            </label>
            <Select value={form.priority ?? 'HIGH'} onValueChange={(v) => setForm(f => ({ ...f, priority: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['CRITICAL','HIGH','MEDIUM','LOW'].map(p => <SelectItem key={p} value={p}>{titleCase(p)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              Notes
            </label>
            <textarea
              rows={2}
              value={form.requestNotes ?? ''}
              onChange={(e) => setForm(f => ({ ...f, requestNotes: e.target.value }))}
              placeholder="Additional context…"
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green resize-none"
            />
          </div>
          {error && <p className="text-xs text-agap-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={handleSubmit}>Submit Request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MutualAidTab(): JSX.Element {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const user = useAuthUser();
  const canRequest = hasRole(user, 'DISPATCHER', 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR');
  const canRespond = hasRole(user, 'ORG_ADMINISTRATOR', 'SYSTEM_ADMINISTRATOR');

  const params = statusFilter !== 'ALL' ? { status: statusFilter } : {};
  const { data, isLoading } = useMutualAidRequests(params);
  const approve = useApproveMutualAid();
  const deny = useDenyMutualAid();

  const rows: MutualAidRequest[] = data?.data ?? [];

  const columns: Column<MutualAidRequest>[] = [
    {
      key: 'type',
      header: 'Resource',
      accessor: (row) => (
        <div>
          <p className="font-semibold text-agap-textMain">{titleCase(row.resource_type)}</p>
          <p className="text-xs text-agap-textSub">Qty: {row.quantity}</p>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      accessor: (row) => {
        const v = row.priority === 'CRITICAL' ? 'red' : row.priority === 'HIGH' ? 'amber' : row.priority === 'MEDIUM' ? 'blue' : 'muted';
        return <Badge variant={v as 'red' | 'amber' | 'blue' | 'muted'}>{titleCase(row.priority)}</Badge>;
      },
    },
    {
      key: 'requesting_org',
      header: 'Requesting',
      accessor: (row) => (
        <span className="text-sm text-agap-textMain">
          {row.requesting_org?.short_name ?? row.requesting_org?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'providing_org',
      header: 'Providing',
      accessor: (row) => (
        <span className="text-sm text-agap-textMid">
          {row.providing_org?.short_name ?? row.providing_org?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      accessor: (row) => (
        <Badge variant={requestStatusVariant(row.status)}>{titleCase(row.status)}</Badge>
      ),
    },
    {
      key: 'requested_at',
      header: 'Requested',
      accessor: (row) => <span className="text-xs text-agap-textSub">{fmtTs(row.requested_at)}</span>,
    },
    ...(canRespond ? [{
      key: 'actions',
      header: '',
      cellClassName: 'text-right',
      headerClassName: 'text-right',
      accessor: (row: MutualAidRequest) =>
        row.status === 'PENDING' ? (
          <div className="flex items-center gap-1 justify-end">
            <button
              onClick={(e) => { e.stopPropagation(); approve.mutate({ id: row.id }); }}
              disabled={approve.isPending}
              title="Approve"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-agap-greenSoft text-agap-green hover:bg-agap-green hover:text-white transition-colors"
            >
              <CheckCircle2 size={11} /> Accept
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); deny.mutate({ id: row.id }); }}
              disabled={deny.isPending}
              title="Deny"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-agap-dangerSoft text-agap-danger hover:bg-red-100 transition-colors"
            >
              <XCircle size={11} /> Deny
            </button>
          </div>
        ) : null,
    } satisfies Column<MutualAidRequest>] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 rounded-xl bg-agap-surface p-1">
          {REQUEST_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                statusFilter === s
                  ? 'bg-white text-agap-green shadow-tile'
                  : 'text-agap-textSub hover:text-agap-textMain',
              )}
            >
              {s === 'ALL' ? 'All' : titleCase(s)}
            </button>
          ))}
        </div>
        {canRequest && (
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)} className="ml-auto">
            <Plus size={14} /> New Request
          </Button>
        )}
        {data && (
          <span className="text-xs text-agap-textSub">{data.meta.total} request{data.meta.total !== 1 ? 's' : ''}</span>
        )}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No requests"
        emptyDescription={statusFilter !== 'ALL' ? `No ${titleCase(statusFilter).toLowerCase()} requests.` : 'No mutual-aid requests found.'}
      />

      <CreateRequestDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

// ─── Handover Tab ─────────────────────────────────────────────────────────────

function CreateHandoverDialog({
  incidentId,
  open,
  onClose,
}: {
  incidentId: string;
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const [toUserId, setToUserId] = useState('');
  const [summary, setSummary] = useState('');
  const [actionsText, setActionsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateHandover();

  async function handleSubmit() {
    if (!toUserId.trim() || !summary.trim()) {
      setError('Incoming user ID and situation summary are required.');
      return;
    }
    const pendingActions = actionsText.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      setError(null);
      await create.mutateAsync({
        incidentId,
        data: { toUserId: toUserId.trim(), situationSummary: summary, pendingActions },
      });
      setToUserId(''); setSummary(''); setActionsText('');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Handover failed.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft size={16} className="text-agap-green" /> Create Handover
          </DialogTitle>
          <DialogDescription>
            Transfer situational awareness to an incoming operator. A handover is incomplete until the incoming user acknowledges.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              Incoming User ID <span className="text-agap-danger">*</span>
            </label>
            <input
              type="text"
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              placeholder="UUID of the incoming dispatcher/supervisor"
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm font-mono text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              Situation Summary <span className="text-agap-danger">*</span>
            </label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Current situation, responder positions, notable hazards…"
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              Pending Actions <span className="text-agap-textSub font-normal normal-case">(one per line, optional)</span>
            </label>
            <textarea
              rows={3}
              value={actionsText}
              onChange={(e) => setActionsText(e.target.value)}
              placeholder="Await BFP ETD confirmation.&#10;Notify hospital of patient count."
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green resize-none"
            />
          </div>
          {error && <p className="text-xs text-agap-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={handleSubmit}>
            Create Handover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HandoverTab(): JSX.Element {
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const user = useAuthUser();
  const canCreate = hasRole(user, 'DISPATCHER', 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR');

  const { data: handovers, isLoading } = useHandovers(incidentId);
  const acknowledge = useAcknowledgeHandover();

  const rows: HandoverRecord[] = handovers ?? [];

  const columns: Column<HandoverRecord>[] = [
    {
      key: 'summary',
      header: 'Situation Summary',
      accessor: (row) => (
        <p className="text-sm text-agap-textMain line-clamp-2 max-w-xs">{row.situation_summary}</p>
      ),
    },
    {
      key: 'from',
      header: 'From',
      accessor: (row) => (
        <code className="text-xs font-mono text-agap-textSub">
          {row.from_user_id.slice(0, 8)}…
        </code>
      ),
    },
    {
      key: 'to',
      header: 'To',
      accessor: (row) => (
        <code className="text-xs font-mono text-agap-textSub">
          {row.to_user_id.slice(0, 8)}…
        </code>
      ),
    },
    {
      key: 'handed_over_at',
      header: 'Handed Over',
      accessor: (row) => (
        <span className="text-xs text-agap-textSub">{fmtTs(row.handed_over_at)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Acknowledged',
      accessor: (row) =>
        row.acknowledged_at ? (
          <Badge variant="green">
            <CheckCircle2 size={11} /> {fmtTs(row.acknowledged_at)}
          </Badge>
        ) : (
          <Badge variant="amber">
            <Clock size={11} /> Pending
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      cellClassName: 'text-right',
      accessor: (row) =>
        !row.acknowledged_at && user?.id === row.to_user_id ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (incidentId) acknowledge.mutate(incidentId);
            }}
            disabled={acknowledge.isPending}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-agap-greenSoft text-agap-green hover:bg-agap-green hover:text-white transition-colors"
          >
            <CheckCircle2 size={11} /> Acknowledge
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white border border-[rgba(168,181,193,0.20)] shadow-card p-4 flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
            Incident
          </label>
          <IncidentPicker value={incidentId} onChange={setIncidentId} />
        </div>
        {incidentId && canCreate && (
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} /> Handover
          </Button>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-[rgba(59,130,246,0.22)] bg-agap-infoSoft px-4 py-3">
        <ArrowRightLeft size={15} className="text-agap-info mt-0.5 shrink-0" />
        <p className="text-sm text-agap-textMid">
          A handover is <strong>incomplete</strong> until the incoming operator explicitly acknowledges.
          The record persists regardless.
        </p>
      </div>

      {incidentId ? (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(r) => r.id}
          loading={isLoading}
          emptyTitle="No handovers"
          emptyDescription="No handover records for this incident."
        />
      ) : (
        <div className="rounded-2xl bg-white border border-[rgba(168,181,193,0.20)] shadow-card">
          <EmptyState
            icon={ArrowRightLeft}
            title="Select an incident"
            description="Choose an incident to view or create handover records."
          />
        </div>
      )}

      {incidentId && (
        <CreateHandoverDialog
          incidentId={incidentId}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MultiAgencyPage(): JSX.Element {
  const [tab, setTab] = useState<'agencies' | 'mutual-aid' | 'handover'>('agencies');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-agap-textMain tracking-tight flex items-center gap-2">
            <Network size={22} className="text-agap-green" />
            Multi-Agency Coordination
          </h1>
          <p className="text-sm text-agap-textSub mt-0.5">
            MOD-34/35/44 · Agencies · Mutual Aid · Handover
          </p>
        </div>
        <Badge variant="blue" className="mt-1">
          <Shield size={11} /> Dispatcher+
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="agencies">
            <Building2 size={13} /> Agencies
          </TabsTrigger>
          <TabsTrigger value="mutual-aid">
            <Package size={13} /> Mutual Aid
          </TabsTrigger>
          <TabsTrigger value="handover">
            <ArrowRightLeft size={13} /> Handover
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Content */}
      {tab === 'agencies' && <AgenciesTab />}
      {tab === 'mutual-aid' && <MutualAidTab />}
      {tab === 'handover' && <HandoverTab />}
    </div>
  );
}
