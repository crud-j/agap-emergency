'use client';

import { useState, type JSX } from 'react';
import { Check, Edit, Info, MapPinned, Plus, Power, Sparkles, Trash2, X } from 'lucide-react';
import {
  Button, Badge, DataTable, EmptyState, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  type BadgeVariant, type Column,
} from '@/components/ui';
import { titleCase } from '@/lib/incident-format';
import { cn } from '@/lib/utils';
import { useBarangayDirectory } from '@/features/admin/barangay-contacts';
import {
  useApproveRiskAreaProposal, useCreateRiskArea, useDeleteRiskArea, useDismissRiskAreaProposal,
  useRiskAreaProposals, useRiskAreas, useUpdateRiskArea,
} from '@/features/risk/hooks';
import {
  RISK_LEVELS, type RiskArea, type RiskAreaInput, type RiskAreaProposal, type RiskLevel,
} from '@/features/risk/api';

/**
 * MOD-51 risk areas, managed by the System Administrator (MODULE_GAPS_COMPLETION_PLAN.md
 * Phase 5). Lives under Administration because the Risk page and its heatmap stay
 * Supervisor/Dispatcher only (role dashboards Phase 5b). The boundary polygon is not
 * drawn here: a new area is listed and tied to a barangay.
 */

const RISK_TYPES = ['FLOOD', 'FIRE', 'INDUSTRIAL', 'ROAD_ACCIDENT', 'RESCUE', 'MEDICAL', 'NATURAL_DISASTER', 'DEBRIS', 'OTHER'] as const;
const NO_BARANGAY = '__none__';
const BOCAUE_RIVER_CRITICAL_M = 11.5;

const LEVEL_VARIANT: Record<RiskLevel, BadgeVariant> = {
  LOW: 'green', MODERATE: 'blue', HIGH: 'amber', CRITICAL: 'red',
};

const INPUT =
  'h-9 w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 text-sm text-agap-textMain ' +
  'placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green';

const threshold = (a: RiskArea) => (a.flood_threshold_meters === null ? null : Number(a.flood_threshold_meters));

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

// ─── Form dialog ──────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  riskType: string;
  riskLevel: RiskLevel;
  barangay: string;
  threshold: string;
  description: string;
  isActive: boolean;
}

function toForm(a: RiskArea | null): FormState {
  return {
    name: a?.name ?? '',
    riskType: a?.risk_type ?? 'FLOOD',
    riskLevel: (RISK_LEVELS as readonly string[]).includes(a?.risk_level ?? '') ? (a!.risk_level as RiskLevel) : 'MODERATE',
    barangay: a?.barangay ?? NO_BARANGAY,
    threshold: a && threshold(a) !== null ? String(threshold(a)) : '',
    description: a?.description ?? '',
    isActive: a?.is_active ?? true,
  };
}

function AreaDialog({ open, area, onClose }: {
  open: boolean;
  /** null = add. */
  area: RiskArea | null;
  onClose: () => void;
}): JSX.Element {
  const [form, setForm] = useState<FormState>(() => toForm(area));
  const [error, setError] = useState<string | null>(null);
  const barangays = useBarangayDirectory();
  const create = useCreateRiskArea();
  const update = useUpdateRiskArea();
  const busy = create.isPending || update.isPending;
  const isFlood = form.riskType === 'FLOOD';
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (form.name.trim().length < 2) { setError('Give the area a name.'); return; }
    let meters: number | null = null;
    if (isFlood && form.threshold.trim()) {
      meters = Number(form.threshold);
      if (!Number.isFinite(meters) || meters < 0 || meters > 30) { setError('Threshold must be between 0 and 30 m.'); return; }
    }
    const body: RiskAreaInput = {
      name: form.name.trim(),
      riskType: form.riskType,
      riskLevel: form.riskLevel,
      barangay: form.barangay === NO_BARANGAY ? '' : form.barangay,
      // Only a flood area is tied to the river level; switching type clears it.
      floodThresholdMeters: isFlood ? meters : null,
      description: form.description.trim(),
    };
    try {
      setError(null);
      if (area) await update.mutateAsync({ id: area.id, changes: { ...body, isActive: form.isActive } });
      else await create.mutateAsync(body);
      onClose();
    } catch (e) {
      setError(errMsg(e, 'Could not save the risk area.'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{area ? 'Edit risk area' : 'Add risk area'}</DialogTitle>
          <DialogDescription>Shown on the Risk page for Supervisors and Dispatchers.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label htmlFor="ra-name" className="mb-1 block text-xs font-semibold text-agap-textMid">Name</label>
            <input id="ra-name" className={INPUT} maxLength={255} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Lolomboy riverside" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-xs font-semibold text-agap-textMid">Type</span>
              <Select value={form.riskType} onValueChange={(v) => set('riskType', v)}>
                <SelectTrigger aria-label="Type" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_TYPES.map((t) => <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold text-agap-textMid">Level</span>
              <Select value={form.riskLevel} onValueChange={(v) => set('riskLevel', v as RiskLevel)}>
                <SelectTrigger aria-label="Level" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map((l) => <SelectItem key={l} value={l}>{titleCase(l)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold text-agap-textMid">Barangay</span>
            <Select value={form.barangay} onValueChange={(v) => set('barangay', v)} disabled={barangays.isLoading}>
              <SelectTrigger aria-label="Barangay" className="h-9">
                <SelectValue placeholder={barangays.isLoading ? 'Loading…' : 'Choose a barangay'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BARANGAY}>No specific barangay</SelectItem>
                {(barangays.data ?? []).map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {barangays.isError && <p className="mt-1 text-xs text-agap-danger">Couldn&apos;t load the barangay list.</p>}
          </div>

          {isFlood && (
            <div>
              <label htmlFor="ra-threshold" className="mb-1 block text-xs font-semibold text-agap-textMid">Flood threshold (m)</label>
              <input
                id="ra-threshold"
                type="number"
                inputMode="decimal"
                min={0}
                max={30}
                step={0.01}
                className={INPUT}
                value={form.threshold}
                onChange={(e) => set('threshold', e.target.value)}
                placeholder={String(BOCAUE_RIVER_CRITICAL_M.toFixed(2))}
              />
              <p className="mt-1 text-xs text-agap-textSub">Bocaue River critical level: 11.50 m (mandatory evacuation).</p>
            </div>
          )}

          <div>
            <label htmlFor="ra-desc" className="mb-1 block text-xs font-semibold text-agap-textMid">Description</label>
            <textarea
              id="ra-desc"
              rows={3}
              maxLength={1000}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className={cn(INPUT, 'h-auto resize-y py-2')}
            />
          </div>

          {area && (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(168,181,193,0.20)] px-3 py-2">
              <span className="text-sm text-agap-textMain">
                Active
                <span className="block text-xs text-agap-textSub">Inactive areas stay listed but are left out of flood zones.</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                onClick={() => set('isActive', !form.isActive)}
                className={cn(
                  'relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green',
                  form.isActive ? 'bg-agap-green' : 'bg-agap-track',
                )}
              >
                <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', form.isActive ? 'translate-x-5' : 'translate-x-0.5')} />
              </button>
            </label>
          )}

          {error && <p role="alert" className="text-xs text-agap-danger">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>{area ? 'Save changes' : 'Add risk area'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Remove dialog: deactivate first, delete second ───────────────────────────

function RemoveDialog({ area, onClose }: { area: RiskArea | null; onClose: () => void }): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateRiskArea();
  const remove = useDeleteRiskArea();
  const busy = update.isPending || remove.isPending;

  async function run(fn: () => Promise<unknown>, fallback: string) {
    try { setError(null); await fn(); onClose(); } catch (e) { setError(errMsg(e, fallback)); }
  }

  return (
    <Dialog open={!!area} onOpenChange={(o) => { if (!o && !busy) { setError(null); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove “{area?.name}”?</DialogTitle>
          <DialogDescription>
            Deactivating keeps the record and its history and can be undone. Deleting removes it for good; the Audit Log keeps what it was.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-xs text-agap-danger">{error}</p>}
        <DialogFooter className="flex-wrap">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            disabled={busy}
            onClick={() => area && run(() => remove.mutateAsync(area.id), 'Could not delete the area.')}
          >
            <Trash2 size={14} /> Delete
          </Button>
          {area?.is_active && (
            <Button
              variant="primary"
              loading={update.isPending}
              disabled={busy}
              onClick={() => run(() => update.mutateAsync({ id: area.id, changes: { isActive: false } }), 'Could not deactivate the area.')}
            >
              <Power size={14} /> Deactivate
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Proposed areas (AUTOMATION_NEEDS_PLAN Phase 2, C7) ───────────────────────

function ApproveDialog({ proposal, onClose }: { proposal: RiskAreaProposal; onClose: () => void }): JSX.Element {
  const approve = useApproveRiskAreaProposal();
  const [name, setName] = useState(`${proposal.barangay ?? 'Bocaue'} ${titleCase(proposal.risk_type).toLowerCase()} hotspot`);
  const [level, setLevel] = useState<RiskLevel>(proposal.incident_count >= 10 ? 'HIGH' : 'MODERATE');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (name.trim().length < 2) { setError('Give the area a name.'); return; }
    try {
      setError(null);
      await approve.mutateAsync({ id: proposal.id, body: { name: name.trim(), riskLevel: level } });
      onClose();
    } catch (e) {
      setError(errMsg(e, 'Could not approve the proposal.'));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !approve.isPending) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Approve proposed area</DialogTitle>
          <DialogDescription>
            Creates a {titleCase(proposal.risk_type).toLowerCase()} risk area
            {proposal.barangay ? ` in ${proposal.barangay}` : ''} with the cluster&apos;s map boundary
            ({proposal.incident_count} incidents in {proposal.window_days} days). Recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="rp-name" className="mb-1 block text-xs font-semibold text-agap-textMid">Name</label>
            <input id="rp-name" className={INPUT} maxLength={255} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-agap-textMid">Level</span>
            <Select value={level} onValueChange={(v) => setLevel(v as RiskLevel)}>
              <SelectTrigger aria-label="Level" className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RISK_LEVELS.map((l) => <SelectItem key={l} value={l}>{titleCase(l)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <p role="alert" className="text-xs text-agap-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={approve.isPending}>Cancel</Button>
          <Button variant="primary" loading={approve.isPending} onClick={save}><Check size={14} /> Create risk area</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProposedAreas(): JSX.Element | null {
  const proposals = useRiskAreaProposals();
  const dismiss = useDismissRiskAreaProposal();
  const [approving, setApproving] = useState<RiskAreaProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = proposals.data ?? [];

  // Nothing to review: keep the tab as it was.
  if (proposals.isLoading || (!proposals.isError && rows.length === 0)) return null;

  const columns: Column<RiskAreaProposal>[] = [
    { key: 'type', header: 'Type', accessor: (p) => <span className="text-xs font-semibold text-agap-textMain">{titleCase(p.risk_type)}</span> },
    { key: 'barangay', header: 'Barangay', accessor: (p) => <span className="text-xs text-agap-textMid">{p.barangay ?? 'Outside barangay lines'}</span> },
    {
      key: 'count',
      header: 'Incidents',
      accessor: (p) => <span className="font-mono text-xs tabular-nums text-agap-textMid">{p.incident_count} in {p.window_days} days</span>,
    },
    {
      key: 'actions',
      header: '',
      accessor: (p) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={dismiss.isPending}
            onClick={async () => {
              try { setError(null); await dismiss.mutateAsync(p.id); } catch (e) { setError(errMsg(e, 'Could not dismiss the proposal.')); }
            }}
            aria-label={`Dismiss ${titleCase(p.risk_type)} proposal${p.barangay ? ` in ${p.barangay}` : ''}`}
          >
            <X size={14} /> Dismiss
          </Button>
          <Button size="sm" variant="primary" onClick={() => setApproving(p)}>
            <Check size={14} /> Approve
          </Button>
        </div>
      ),
    },
  ];

  return (
    <section className="space-y-2 rounded-2xl border border-[rgba(217,119,6,0.25)] bg-agap-amberSoft p-4">
      <h2 className="flex items-center gap-2 text-sm font-extrabold text-agap-textMain">
        <Sparkles size={15} className="text-agap-amber" aria-hidden />
        Proposed areas
      </h2>
      <p className="text-xs text-agap-textSub">
        Found by the nightly check: places where several incidents of one type happened close together in the last 90 days.
        Nothing is added until you approve it.
      </p>
      {proposals.isError ? (
        <p className="text-xs text-agap-danger">Couldn&apos;t load proposed areas.</p>
      ) : (
        <DataTable columns={columns} data={rows} getRowKey={(p) => p.id} />
      )}
      {error && <p role="alert" className="text-xs text-agap-danger">{error}</p>}
      {approving && <ApproveDialog key={approving.id} proposal={approving} onClose={() => setApproving(null)} />}
    </section>
  );
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export function RiskAreasTab(): JSX.Element {
  const areas = useRiskAreas();
  const [editing, setEditing] = useState<{ area: RiskArea | null } | null>(null);
  const [removing, setRemoving] = useState<RiskArea | null>(null);

  const columns: Column<RiskArea>[] = [
    {
      key: 'name',
      header: 'Area',
      accessor: (a) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-agap-textMain">{a.name}</p>
          {a.description && <p className="max-w-[320px] truncate text-xs text-agap-textSub">{a.description}</p>}
        </div>
      ),
    },
    { key: 'type', header: 'Type', accessor: (a) => <span className="text-xs text-agap-textMid">{titleCase(a.risk_type)}</span> },
    {
      key: 'level',
      header: 'Level',
      accessor: (a) => <Badge variant={LEVEL_VARIANT[a.risk_level as RiskLevel] ?? 'muted'}>{titleCase(a.risk_level)}</Badge>,
    },
    { key: 'barangay', header: 'Barangay', accessor: (a) => <span className="text-xs text-agap-textMid">{a.barangay ?? '—'}</span> },
    {
      key: 'threshold',
      header: 'Threshold',
      accessor: (a) => (
        <span className="font-mono text-xs tabular-nums text-agap-textMid">
          {threshold(a) === null ? '—' : `${threshold(a)!.toFixed(2)} m`}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (a) => <Badge variant={a.is_active ? 'green' : 'muted'}>{a.is_active ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      accessor: (a) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing({ area: a })} aria-label={`Edit ${a.name}`}>
            <Edit size={14} /> Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRemoving(a)} aria-label={`Remove ${a.name}`}>
            <Trash2 size={14} /> Remove
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="flex max-w-2xl items-start gap-2 text-sm text-agap-textSub">
          <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
          Areas are listed on the Risk page and tied to a barangay. Map boundaries are not drawn here.
        </p>
        <Button variant="primary" onClick={() => setEditing({ area: null })}>
          <Plus size={15} /> Add risk area
        </Button>
      </div>

      <ProposedAreas />

      {areas.isError ? (
        <p className="rounded-xl border border-[rgba(212,72,88,0.2)] bg-agap-dangerSoft px-4 py-2.5 text-sm text-agap-danger">
          Couldn&apos;t load risk areas.
        </p>
      ) : areas.isLoading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : (areas.data ?? []).length === 0 ? (
        <EmptyState
          icon={MapPinned}
          title="No risk areas yet"
          description="Add one, for example a flood area for Lolomboy at the 11.50 m river level."
        />
      ) : (
        <DataTable columns={columns} data={areas.data ?? []} getRowKey={(a) => a.id} />
      )}

      {editing && (
        <AreaDialog key={editing.area?.id ?? 'new'} open area={editing.area} onClose={() => setEditing(null)} />
      )}
      <RemoveDialog area={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}
