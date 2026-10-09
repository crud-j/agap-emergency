'use client';

import { useState, type JSX } from 'react';
import {
  Siren, Target, Plus, Trash2, CheckCircle2,
  XCircle, Users, ChevronDown, AlertTriangle, Shield,
} from 'lucide-react';
import {
  Button, Badge, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Skeleton, EmptyState,
  type Column,
} from '@/components/ui';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { titleCase } from '@/lib/incident-format';
import { useIncidents } from '@/features/incidents/hooks';
import {
  useIncidentIcs,
  useActivateIcs,
  useUpdateIcs,
  useDeactivateIcs,
  useAddIcsPosition,
  useRemoveIcsPosition,
} from '@/features/incidents/command-hooks';
import type { IcsAssignment } from '@/features/incidents/command';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const ICS_POSITIONS = [
  'INCIDENT_COMMANDER',
  'OPERATIONS_SECTION_CHIEF',
  'LOGISTICS_SECTION_CHIEF',
  'PLANNING_SECTION_CHIEF',
  'SAFETY_OFFICER',
  'PUBLIC_INFORMATION_OFFICER',
  'LIAISON_OFFICER',
] as const;

const ACTIVE_STATUSES = [
  'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED',
  'DISPATCH_PENDING', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function positionLabel(pos: string): string {
  switch (pos) {
    case 'INCIDENT_COMMANDER':         return 'Incident Commander';
    case 'OPERATIONS_SECTION_CHIEF':   return 'Operations Chief';
    case 'LOGISTICS_SECTION_CHIEF':    return 'Logistics Chief';
    case 'PLANNING_SECTION_CHIEF':     return 'Planning Chief';
    case 'SAFETY_OFFICER':             return 'Safety Officer';
    case 'PUBLIC_INFORMATION_OFFICER': return 'PIO';
    case 'LIAISON_OFFICER':            return 'Liaison Officer';
    default:                           return titleCase(pos);
  }
}

function positionVariant(pos: string): 'red' | 'amber' | 'blue' | 'green' | 'muted' {
  switch (pos) {
    case 'INCIDENT_COMMANDER':         return 'red';
    case 'OPERATIONS_SECTION_CHIEF':   return 'amber';
    case 'LOGISTICS_SECTION_CHIEF':    return 'blue';
    case 'PLANNING_SECTION_CHIEF':     return 'green';
    default:                           return 'muted';
  }
}

function fmtTs(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Activate dialog ──────────────────────────────────────────────────────────

function ActivateDialog({
  incidentId,
  open,
  onClose,
}: {
  incidentId: string;
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const [objectivesText, setObjectivesText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const activate = useActivateIcs();

  async function handleConfirm() {
    const objectives = objectivesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      setError(null);
      await activate.mutateAsync({ incidentId, objectives });
      setObjectivesText('');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Activation failed.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Siren size={16} className="text-agap-green" />
            Activate ICS
          </DialogTitle>
          <DialogDescription>
            Activating Incident Command System structures the response and enables position assignments.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
            Objectives <span className="text-agap-textSub font-normal normal-case">(one per line, optional)</span>
          </label>
          <textarea
            rows={4}
            value={objectivesText}
            onChange={(e) => setObjectivesText(e.target.value)}
            placeholder="Life safety is the priority.&#10;Contain the hazard.&#10;Protect property."
            className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green resize-none"
          />
          {error && <p className="mt-2 text-xs text-agap-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={activate.isPending} onClick={handleConfirm}>
            Activate ICS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Position dialog ──────────────────────────────────────────────────────

function AddPositionDialog({
  incidentId,
  open,
  onClose,
}: {
  incidentId: string;
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const [position, setPosition] = useState('');
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useAddIcsPosition();

  async function handleConfirm() {
    if (!position || !userId.trim()) {
      setError('Position and User ID are required.');
      return;
    }
    try {
      setError(null);
      await add.mutateAsync({ incidentId, data: { position, userId: userId.trim() } });
      setPosition('');
      setUserId('');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Assignment failed.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus size={16} className="text-agap-green" />
            Assign ICS Position
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              Position <span className="text-agap-danger">*</span>
            </label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger>
                <SelectValue placeholder="Select position" />
              </SelectTrigger>
              <SelectContent>
                {ICS_POSITIONS.map((p) => (
                  <SelectItem key={p} value={p}>{positionLabel(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              User ID <span className="text-agap-danger">*</span>
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="User UUID"
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green font-mono"
            />
          </div>
          {error && <p className="text-xs text-agap-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={add.isPending} onClick={handleConfirm}>
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ICS Panel ────────────────────────────────────────────────────────────────

function IcsPanel({ incidentId }: { incidentId: string }): JSX.Element {
  const { data: ics, isLoading, isError } = useIncidentIcs(incidentId);
  const deactivate = useDeactivateIcs();
  const remove = useRemoveIcsPosition();
  const [activateOpen, setActivateOpen] = useState(false);
  const [addPosOpen, setAddPosOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  // 404 = no ICS yet
  if (isError || !ics) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white shadow-card p-8 flex flex-col items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-agap-surface">
            <Siren size={24} className="text-agap-textSub" />
          </div>
          <div className="text-center">
            <h3 className="font-bold text-agap-textMain">ICS Not Activated</h3>
            <p className="text-sm text-agap-textSub mt-1">
              Activate to assign command positions and track objectives.
            </p>
          </div>
          <Button variant="primary" onClick={() => setActivateOpen(true)}>
            <Siren size={15} /> Activate ICS
          </Button>
        </div>
        <ActivateDialog
          incidentId={incidentId}
          open={activateOpen}
          onClose={() => setActivateOpen(false)}
        />
      </div>
    );
  }

  const isActive = !ics.deactivated_at;

  const posColumns: Column<IcsAssignment>[] = [
    {
      key: 'position',
      header: 'Position',
      accessor: (row) => (
        <Badge variant={positionVariant(row.position)}>{positionLabel(row.position)}</Badge>
      ),
    },
    {
      key: 'user',
      header: 'Assigned To',
      accessor: (row) => (
        <span className="text-sm text-agap-textMain">
          {row.users?.full_name ?? row.users?.id ?? '—'}
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      accessor: (row) => (
        <Badge variant="muted">{titleCase(row.users?.role ?? '—')}</Badge>
      ),
    },
    {
      key: 'assigned_at',
      header: 'Assigned',
      accessor: (row) => (
        <span className="text-xs text-agap-textSub">{fmtTs(row.assigned_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      cellClassName: 'text-right',
      accessor: (row) => (
        isActive ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              remove.mutate({ incidentId, posId: row.id });
            }}
            disabled={remove.isPending}
            title="Remove assignment"
            className="p-1.5 rounded-lg hover:bg-agap-dangerSoft text-agap-textSub hover:text-agap-danger transition-colors"
          >
            <Trash2 size={14} />
          </button>
        ) : null
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* ICS status card */}
      <div className={cn(
        'rounded-2xl border p-5',
        isActive
          ? 'bg-agap-greenSoft border-[rgba(13,96,83,0.16)]'
          : 'bg-agap-surface border-[rgba(168,181,193,0.20)]',
      )}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {isActive
              ? <CheckCircle2 size={20} className="text-agap-green shrink-0" />
              : <XCircle size={20} className="text-agap-textSub shrink-0" />
            }
            <div>
              <p className="font-bold text-agap-textMain">
                ICS {isActive ? 'Active' : 'Deactivated'}
              </p>
              <p className="text-xs text-agap-textSub">
                {isActive
                  ? `Activated ${fmtTs(ics.activated_at)}`
                  : `Deactivated ${ics.deactivated_at ? fmtTs(ics.deactivated_at) : ''}`}
              </p>
            </div>
          </div>
          {isActive && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAddPosOpen(true)}
              >
                <Plus size={14} /> Add Position
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={deactivate.isPending}
                onClick={() => deactivate.mutate(incidentId)}
              >
                Deactivate
              </Button>
            </div>
          )}
        </div>

        {ics.objectives.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-2 flex items-center gap-1">
              <Target size={12} /> Objectives
            </p>
            <ul className="space-y-1">
              {ics.objectives.map((obj, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-agap-textMain">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-agap-green shrink-0" />
                  {obj}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Position assignments */}
      <div>
        <h3 className="text-sm font-bold text-agap-textMain mb-3 flex items-center gap-1.5">
          <Users size={15} className="text-agap-textSub" />
          Position Assignments
          <Badge variant="muted" className="ml-1">{ics.ics_assignments.length}</Badge>
        </h3>
        <DataTable
          columns={posColumns}
          data={ics.ics_assignments.filter(a => !a.relieved_at)}
          getRowKey={(r) => r.id}
          emptyTitle="No positions assigned"
          emptyDescription="Click 'Add Position' to assign command roles."
        />
      </div>

      <AddPositionDialog
        incidentId={incidentId}
        open={addPosOpen}
        onClose={() => setAddPosOpen(false)}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CommandPage(): JSX.Element {
  const user = useAuthUser();
  const canCommand = hasRole(user, 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR');

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: incidentData, isLoading: incLoading } = useIncidents({
    perPage: 50,
  });

  const activeIncidents = (incidentData?.data ?? []).filter((i) =>
    ACTIVE_STATUSES.includes(i.status),
  );

  const selected = activeIncidents.find((i) => i.id === selectedId);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-agap-textMain tracking-tight flex items-center gap-2">
            <Siren size={22} className="text-agap-green" />
            Incident Command
          </h1>
          <p className="text-sm text-agap-textSub mt-0.5">
            MOD-36 · ICS structure, command positions, objectives
          </p>
        </div>
        <Badge variant="amber" className="mt-1">
          <Shield size={11} /> Supervisor
        </Badge>
      </div>

      {!canCommand && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-[rgba(217,119,6,0.22)] bg-agap-amberSoft px-4 py-3">
          <AlertTriangle size={15} className="text-agap-amber shrink-0" />
          <p className="text-sm text-agap-textMid">
            ICS activation and position management require the <strong>Supervisor</strong> role.
          </p>
        </div>
      )}

      {/* Incident picker */}
      <div className="rounded-2xl bg-white border border-[rgba(168,181,193,0.20)] shadow-card p-4">
        <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-2">
          Select Active Incident
        </label>
        {incLoading ? (
          <Skeleton className="h-10 rounded-xl" />
        ) : (
          <div className="relative">
            <Select
              value={selectedId ?? ''}
              onValueChange={(v) => setSelectedId(v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose an incident…" />
              </SelectTrigger>
              <SelectContent>
                {activeIncidents.length === 0 ? (
                  <SelectItem value="__none__" disabled>No active incidents</SelectItem>
                ) : (
                  activeIncidents.map((inc) => (
                    <SelectItem key={inc.id} value={inc.id}>
                      {inc.public_reference} — {titleCase(inc.category)} ({titleCase(inc.status)})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedId && (
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-agap-textSub pointer-events-none" />
            )}
          </div>
        )}
        {selected && (
          <p className="mt-2 text-xs text-agap-textSub">
            Priority: <strong>{selected.priority}</strong> · Status: <strong>{titleCase(selected.status)}</strong>
            {selected.incident_locations?.barangay && ` · ${selected.incident_locations.barangay}`}
          </p>
        )}
      </div>

      {/* ICS panel */}
      {selectedId ? (
        <IcsPanel incidentId={selectedId} />
      ) : (
        <div className="rounded-2xl bg-white border border-[rgba(168,181,193,0.20)] shadow-card">
          <EmptyState
            icon={Siren}
            title="Select an incident"
            description="Choose an active incident above to view or activate its ICS structure."
          />
        </div>
      )}
    </div>
  );
}
