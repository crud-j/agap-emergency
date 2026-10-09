'use client';

import { useState, type JSX, type FormEvent } from 'react';
import {
  Siren, ShieldAlert, Users, Truck, Megaphone,
  CheckCircle2, XCircle, Clock, AlertTriangle, Waves,
} from 'lucide-react';
import {
  Card, CardHeader, CardTitle, Badge, Button, DataTable, Skeleton, EmptyState,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  type Column,
} from '@/components/ui';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import {
  useSurgeState,
  useActivateSurge,
  useDeactivateSurge,
  useTriageTags,
  useSurgeResources,
  useSurgeBroadcast,
} from '@/features/surge/hooks';
import type { TriageTag, SurgeResource } from '@/features/surge/api';

// ─── Constants ───────────────────────────────────────────────────────────────

const BOCAUE_BARANGAYS = [
  'Lolomboy', 'Bunlo', 'Igulot', 'Bambang', 'Bundukan', 'Biñang 1st',
  'Biñang 2nd', 'Bocaue', 'Batia', 'Bolacan', 'Dulong Bayan 1st',
  'Dulong Bayan 2nd', 'Malhacan', 'Meyto 1st', 'Meyto 2nd', 'Pugad',
  'Santa Cruz', 'San Juan', 'Turo', 'Wakas', 'Poblacion',
];

const SURGE_CATEGORIES = [
  'FLOOD', 'FIRE', 'MEDICAL', 'ROAD_ACCIDENT', 'RESCUE', 'INDUSTRIAL', 'OTHER',
];

const TRIAGE_META: Record<string, { label: string; bg: string; text: string }> = {
  RED:    { label: 'Immediate',  bg: 'bg-red-100',    text: 'text-red-700' },
  YELLOW: { label: 'Delayed',    bg: 'bg-yellow-100', text: 'text-yellow-700' },
  GREEN:  { label: 'Minor',      bg: 'bg-emerald-100',text: 'text-emerald-700' },
  BLACK:  { label: 'Deceased',   bg: 'bg-gray-200',   text: 'text-gray-700' },
};

function fmtTs(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function labelCase(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Triage badge ─────────────────────────────────────────────────────────────

function TriageBadge({ color }: { color: string }): JSX.Element {
  const meta = TRIAGE_META[color] ?? { label: color, bg: 'bg-agap-surface', text: 'text-agap-textSub' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${meta.bg} ${meta.text}`}>
      {meta.label}
    </span>
  );
}

// ─── Activate dialog ──────────────────────────────────────────────────────────

function ActivateDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const activate = useActivateSurge();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('FLOOD');
  const [selectedBarangays, setSelectedBarangays] = useState<string[]>([]);
  const [riverLevel, setRiverLevel] = useState('');

  function toggleBarangay(b: string) {
    setSelectedBarangays((prev) =>
      prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b],
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    activate.mutate(
      {
        name: name.trim(),
        category,
        ...(description.trim() && { description: description.trim() }),
        ...(selectedBarangays.length && { affectedBarangays: selectedBarangays }),
        ...(riverLevel && { bocaueRiverLevel: parseFloat(riverLevel) }),
      },
      { onSuccess: onClose },
    );
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-agap-danger">
          <Siren size={18} />
          Activate Disaster Surge Mode
        </DialogTitle>
        <DialogDescription>
          Activating surge mode broadcasts a mass-casualty advisory to all responders
          and enables START triage tagging. Requires SUPERVISOR authorization.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="mt-2 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-agap-textSub">Surge Name *</label>
          <input
            className="w-full rounded-xl border border-agap-track bg-white px-3 py-2 text-sm text-agap-textMain placeholder-agap-textSub outline-none focus:border-agap-green focus:ring-1 focus:ring-agap-green"
            placeholder="e.g. Typhoon Carina Flood Response"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-agap-textSub">Category</label>
          <select
            className="w-full rounded-xl border border-agap-track bg-white px-3 py-2 text-sm text-agap-textMain outline-none focus:border-agap-green focus:ring-1 focus:ring-agap-green"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {SURGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{labelCase(c)}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-agap-textSub">Description (optional)</label>
          <textarea
            className="w-full rounded-xl border border-agap-track bg-white px-3 py-2 text-sm text-agap-textMain placeholder-agap-textSub outline-none focus:border-agap-green focus:ring-1 focus:ring-agap-green resize-none"
            placeholder="Brief description of the emergency situation"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Bocaue River Level */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-agap-textSub flex items-center gap-1.5">
            <Waves size={12} className="text-agap-info" />
            Bocaue River Level (m) — critical at 11.50 m
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="20"
            className="w-full rounded-xl border border-agap-track bg-white px-3 py-2 text-sm text-agap-textMain placeholder-agap-textSub outline-none focus:border-agap-green focus:ring-1 focus:ring-agap-green"
            placeholder="e.g. 11.50"
            value={riverLevel}
            onChange={(e) => setRiverLevel(e.target.value)}
          />
          {riverLevel && parseFloat(riverLevel) >= 11.5 && (
            <p className="text-xs text-agap-danger font-semibold">
              ⚠ At or above critical level — mandatory evacuation threshold
            </p>
          )}
        </div>

        {/* Affected barangays */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-agap-textSub">Affected Barangays</label>
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-agap-track bg-agap-surface p-2">
            {BOCAUE_BARANGAYS.map((b) => (
              <button
                type="button"
                key={b}
                onClick={() => toggleBarangay(b)}
                className={`rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                  selectedBarangays.includes(b)
                    ? 'bg-agap-green text-white'
                    : 'bg-white text-agap-textMid border border-agap-track hover:border-agap-green'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {activate.isError && (
          <p className="text-xs text-agap-danger">
            {(activate.error as Error)?.message ?? 'Activation failed. Try again.'}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={activate.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={activate.isPending} disabled={!name.trim()}>
            <Siren size={14} />
            Activate Surge Mode
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ─── Deactivate dialog ───────────────────────────────────────────────────────

function DeactivateDialog({ surgeId, onClose }: { surgeId: string; onClose: () => void }): JSX.Element {
  const deactivate = useDeactivateSurge();

  function confirm() {
    deactivate.mutate(surgeId, { onSuccess: onClose });
  }

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Deactivate Surge Mode?</DialogTitle>
        <DialogDescription>
          This will end the mass-casualty event and notify all active responders.
          All triage tags and incident links will be retained for the record.
        </DialogDescription>
      </DialogHeader>
      {deactivate.isError && (
        <p className="text-xs text-agap-danger">
          {(deactivate.error as Error)?.message ?? 'Deactivation failed.'}
        </p>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={deactivate.isPending}>Cancel</Button>
        <Button variant="primary" loading={deactivate.isPending} onClick={confirm}>
          <CheckCircle2 size={14} />
          Confirm Deactivate
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── Broadcast dialog ────────────────────────────────────────────────────────

function BroadcastDialog({ surgeId, onClose }: { surgeId: string; onClose: () => void }): JSX.Element {
  const broadcast = useSurgeBroadcast();
  const [message, setMessage] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    broadcast.mutate({ surgeId, message: message.trim() }, { onSuccess: onClose });
  }

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Megaphone size={16} className="text-agap-amber" />
          Broadcast to Responders
        </DialogTitle>
        <DialogDescription>
          Message will be delivered to all online RESPONDER accounts.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="mt-2 space-y-3">
        <textarea
          className="w-full rounded-xl border border-agap-track bg-white px-3 py-2 text-sm text-agap-textMain placeholder-agap-textSub outline-none focus:border-agap-green focus:ring-1 focus:ring-agap-green resize-none"
          placeholder="Surge broadcast message…"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
        />
        {broadcast.isError && (
          <p className="text-xs text-agap-danger">
            {(broadcast.error as Error)?.message ?? 'Broadcast failed.'}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={broadcast.isPending} disabled={!message.trim()}>
            Send Broadcast
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ─── Triage table ─────────────────────────────────────────────────────────────

const TRIAGE_COLS: Column<TriageTag>[] = [
  {
    key: 'triage_color',
    header: 'Triage',
    accessor: (t) => <TriageBadge color={t.triage_color} />,
  },
  {
    key: 'incident_id',
    header: 'Incident',
    accessor: (t) => (
      <span className="font-mono text-xs text-agap-textMid">{t.incident_id ?? '—'}</span>
    ),
  },
  {
    key: 'triage_notes',
    header: 'Notes',
    accessor: (t) => (
      <span className="text-xs text-agap-textMid truncate max-w-[180px] block">{t.triage_notes ?? '—'}</span>
    ),
  },
  {
    key: 'tagged_at',
    header: 'Tagged',
    accessor: (t) => (
      <span className="text-xs text-agap-textSub tabular-nums">{fmtTs(t.tagged_at)}</span>
    ),
  },
];

// ─── Resources table ──────────────────────────────────────────────────────────

const RESOURCE_COLS: Column<SurgeResource>[] = [
  {
    key: 'name',
    header: 'Unit',
    accessor: (r) => <span className="text-sm font-semibold text-agap-textMain">{r.name}</span>,
  },
  {
    key: 'resource_type',
    header: 'Type',
    accessor: (r) => (
      <span className="text-xs text-agap-textMid">{labelCase(r.resource_type)}</span>
    ),
  },
  {
    key: 'status',
    header: 'Status',
    accessor: (r) => <Badge variant="green">{r.status}</Badge>,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * MOD-52 — Disaster Surge and Mass-Casualty Mode.
 * Activate / deactivate surge, view START triage tags, and pool available
 * resources. The dashboard shows a surge banner when active.
 */
export default function SurgePage(): JSX.Element {
  const user = useAuthUser();
  const surgeQ = useSurgeState();
  const triageQ = useTriageTags();
  const resourcesQ = useSurgeResources();

  const surge = surgeQ.data;
  const isActive = surge?.is_active ?? false;

  const canManage = hasRole(user, 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR');

  const [showActivate, setShowActivate] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);

  const triageCounts: Record<string, number> = {};
  for (const tag of triageQ.data ?? []) {
    triageCounts[tag.triage_color] = (triageCounts[tag.triage_color] ?? 0) + 1;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-agap-textMain">Disaster Surge Mode</h1>
          <p className="mt-1 text-sm text-agap-textSub">
            MOD-52 · mass-casualty management, START triage, resource pooling
          </p>
        </div>
        {canManage && !isActive && !surgeQ.isLoading && (
          <Button variant="danger" onClick={() => setShowActivate(true)}>
            <Siren size={14} />
            Activate Surge Mode
          </Button>
        )}
        {canManage && isActive && surge?.id && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setShowBroadcast(true)}>
              <Megaphone size={14} />
              Broadcast
            </Button>
            <Button variant="ghost" onClick={() => setShowDeactivate(true)}>
              <XCircle size={14} />
              Deactivate
            </Button>
          </div>
        )}
      </div>

      {/* Active surge banner */}
      {isActive && surge && (
        <div className="rounded-2xl border border-[rgba(212,72,88,0.25)] bg-agap-dangerSoft p-4 flex items-start gap-3">
          <Siren size={20} className="shrink-0 text-agap-danger mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-agap-danger text-sm">
              SURGE MODE ACTIVE — {surge.activation_reason ?? 'Emergency declared'}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-agap-danger/80">
              <span className="flex items-center gap-1">
                <Clock size={11} /> Activated {fmtTs(surge.activated_at)}
              </span>
              {surge.affected_barangays.length > 0 && (
                <span>Affected: {surge.affected_barangays.join(', ')}</span>
              )}
            </div>
          </div>
          <Badge variant="red" className="shrink-0">ACTIVE</Badge>
        </div>
      )}

      {/* Inactive state */}
      {!isActive && !surgeQ.isLoading && (
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="No active surge"
            description={
              canManage
                ? 'Activate surge mode when a mass-casualty or disaster event requires coordinated multi-unit response.'
                : 'Surge mode is currently inactive. A SUPERVISOR or Administrator can activate it.'
            }
            action={
              canManage ? (
                <Button variant="danger" onClick={() => setShowActivate(true)}>
                  <Siren size={14} />
                  Activate Surge Mode
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {surgeQ.isLoading && (
        <Card>
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </Card>
      )}

      {/* Active content */}
      {isActive && (
        <>
          {/* Triage summary tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(['RED', 'YELLOW', 'GREEN', 'BLACK'] as const).map((color) => {
              const meta = TRIAGE_META[color]!;
              return (
                <div key={color} className={`rounded-2xl p-4 flex flex-col gap-1 ${meta.bg}`}>
                  <span className={`text-xs font-semibold uppercase tracking-wide ${meta.text}`}>
                    {meta.label}
                  </span>
                  <span className={`text-3xl font-extrabold tabular-nums ${meta.text}`}>
                    {triageCounts[color] ?? 0}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Triage tags table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users size={15} className="text-agap-textSub" />
                Triage Tags
              </CardTitle>
              <span className="text-xs text-agap-textSub">
                {triageQ.data?.length ?? 0} tagged · filed by responders in field
              </span>
            </CardHeader>
            {triageQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : triageQ.isError ? (
              <EmptyState icon={XCircle} title="Could not load triage tags" description="Refresh to retry." />
            ) : !triageQ.data?.length ? (
              <EmptyState
                icon={Users}
                title="No triage tags yet"
                description="Responders submit START triage tags from the mobile app. They will appear here in real time."
              />
            ) : (
              <DataTable columns={TRIAGE_COLS} data={triageQ.data} getRowKey={(t) => t.id} />
            )}
          </Card>

          {/* Available resources */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck size={15} className="text-agap-textSub" />
                Available Resources
              </CardTitle>
              <span className="text-xs text-agap-textSub">
                {resourcesQ.data?.length ?? 0} units available
              </span>
            </CardHeader>
            {resourcesQ.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : resourcesQ.isError ? (
              <EmptyState icon={XCircle} title="Could not load resources" />
            ) : !resourcesQ.data?.length ? (
              <EmptyState
                icon={Truck}
                title="No available units"
                description="All resources are currently deployed or unavailable."
              />
            ) : (
              <DataTable columns={RESOURCE_COLS} data={resourcesQ.data} getRowKey={(r) => r.id} />
            )}
          </Card>
        </>
      )}

      {/* Dialogs */}
      <Dialog open={showActivate} onOpenChange={setShowActivate}>
        {showActivate && <ActivateDialog onClose={() => setShowActivate(false)} />}
      </Dialog>

      <Dialog open={showDeactivate} onOpenChange={setShowDeactivate}>
        {showDeactivate && surge?.id && (
          <DeactivateDialog surgeId={surge.id} onClose={() => setShowDeactivate(false)} />
        )}
      </Dialog>

      <Dialog open={showBroadcast} onOpenChange={setShowBroadcast}>
        {showBroadcast && surge?.id && (
          <BroadcastDialog surgeId={surge.id} onClose={() => setShowBroadcast(false)} />
        )}
      </Dialog>
    </div>
  );
}
