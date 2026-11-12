'use client';

import { useState, type JSX, type FormEvent } from 'react';
import {
  Siren, ShieldAlert, Users, Truck, Megaphone,
  CheckCircle2, XCircle, Clock, AlertTriangle, Waves, Edit, SlidersHorizontal, LifeBuoy,
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
  useSurgeRules,
  useUpdateSurgeRule,
  useRiverLevel,
  useSetRiverLevel,
  useSurgeRecommendation,
  type SurgeRecommendation,
} from '@/features/surge/hooks';
import type { TriageTag, SurgeResource, SurgeRule, RiverLevel, BarangayRescueTotal } from '@/features/surge/api';
import { useMarkRead } from '@/features/notifications/hooks';
import { useBarangays } from '@/hooks/useBarangay';

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

/** Values a surge recommendation prefills; the Supervisor can change all of them. */
interface ActivatePrefill {
  name: string;
  description: string;
  category: string;
  barangays: string[];
  riverLevel: string;
}

function ActivateDialog({ onClose, initial, onActivated }: {
  onClose: () => void;
  initial?: ActivatePrefill;
  onActivated?: () => void;
}): JSX.Element {
  const activate = useActivateSurge();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'FLOOD');
  const [selectedBarangays, setSelectedBarangays] = useState<string[]>(initial?.barangays ?? []);
  const [riverLevel, setRiverLevel] = useState(initial?.riverLevel ?? '');
  // A recommendation's barangays are geo_regions names, which this list may not have:
  // show them as chips too, so they can be seen and removed.
  const barangayChoices = [...new Set([...BOCAUE_BARANGAYS, ...(initial?.barangays ?? [])])];

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
      { onSuccess: () => { onActivated?.(); onClose(); } },
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
            {barangayChoices.map((b) => (
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
  const result = broadcast.data as { delivered?: number; recipientCount?: number } | undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    broadcast.mutate({ surgeId, message: message.trim() });
  }

  if (broadcast.isSuccess) {
    return (
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone size={16} className="text-agap-amber" />
            Broadcast sent
          </DialogTitle>
          <DialogDescription>
            Delivered to {result?.delivered ?? 0} of {result?.recipientCount ?? 0} active responder
            {result?.recipientCount === 1 ? '' : 's'}. It shows on their AGAP home screen.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="primary" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Megaphone size={16} className="text-agap-amber" />
          Broadcast to Responders
        </DialogTitle>
        <DialogDescription>
          Sent to every active responder account as a notice on their AGAP home screen.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="mt-2 space-y-3">
        <textarea
          className="w-full rounded-xl border border-agap-track bg-white px-3 py-2 text-sm text-agap-textMain placeholder-agap-textSub outline-none focus:border-agap-green focus:ring-1 focus:ring-agap-green resize-none"
          placeholder="Surge broadcast message…"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
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

// ─── Surge recommendation (AUTOMATION_NEEDS_PLAN Phase 2, C2) ─────────────────

/** The activate form a recommendation opens with. The rule only suggests; the Supervisor edits and decides. */
function prefillFrom(rec: SurgeRecommendation, river: RiverLevel | undefined): ActivatePrefill {
  const { data } = rec;
  const category = data.category ?? 'OTHER';
  const where = data.barangays.length ? ` — ${data.barangays.join(', ')}` : '';
  const name =
    data.ruleKey === 'RIVER_LEVEL'
      ? 'Bocaue River critical level'
      : `${data.category ? labelCase(data.category) : 'Incident'} surge${where}`;
  const level = data.riverLevelM ?? river?.meters ?? null;
  return {
    name,
    description: rec.notification.body,
    category,
    barangays: data.barangays,
    riverLevel: level !== null ? String(level) : '',
  };
}

function RecommendationBanner({ rec, onActivate, onDismiss, dismissing }: {
  rec: SurgeRecommendation;
  onActivate: () => void;
  onDismiss: () => void;
  dismissing: boolean;
}): JSX.Element {
  return (
    <div
      role="status"
      className="rounded-2xl border border-[rgba(217,119,6,0.30)] bg-agap-amberSoft p-4 flex flex-wrap items-start gap-3"
    >
      <AlertTriangle size={20} className="shrink-0 text-agap-amber mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="font-extrabold text-sm text-agap-textMain">Surge mode recommended</p>
        <p className="mt-0.5 text-sm text-agap-textMid">{rec.notification.body}</p>
        <p className="mt-1 text-xs text-agap-textSub">
          Automatic check · {fmtTs(rec.notification.created_at)} · nothing has been activated
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDismiss} loading={dismissing}>Dismiss</Button>
        <Button variant="danger" size="sm" onClick={onActivate}>
          <Siren size={14} />
          Review &amp; activate
        </Button>
      </div>
    </div>
  );
}

function RiverLevelCard({ canEdit }: { canEdit: boolean }): JSX.Element {
  const river = useRiverLevel();
  const save = useSetRiverLevel();
  const [value, setValue] = useState('');
  const meters = river.data?.meters ?? null;
  const critical = river.data?.criticalMeters ?? 11.5;
  const entered = value.trim() ? Number(value) : null;
  const valid = entered !== null && Number.isFinite(entered) && entered >= 0 && entered <= 30;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    save.mutate(Math.round(entered! * 100) / 100, { onSuccess: () => setValue('') });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Waves size={15} className="text-agap-info" />
          Bocaue River Level
        </CardTitle>
        <span className="text-xs text-agap-textSub">critical at {critical.toFixed(2)} m</span>
      </CardHeader>
      {river.isLoading ? (
        <Skeleton className="h-10 w-1/2" />
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className={`text-3xl font-extrabold tabular-nums ${meters !== null && meters >= critical ? 'text-agap-danger' : 'text-agap-textMain'}`}>
              {meters !== null ? `${meters.toFixed(2)} m` : '—'}
            </p>
            <p className="text-xs text-agap-textSub">
              {river.data?.recordedAt ? `Entered ${fmtTs(river.data.recordedAt)}` : 'No reading entered yet'}
            </p>
          </div>
          {canEdit && (
            <form onSubmit={submit} className="flex items-end gap-2">
              <div>
                <label htmlFor="river-level" className="mb-1 block text-xs font-semibold text-agap-textSub">New reading (m)</label>
                <input
                  id="river-level"
                  type="number"
                  step="0.01"
                  min="0"
                  max="30"
                  inputMode="decimal"
                  className="w-32 rounded-xl border border-agap-track bg-white px-3 py-2 text-sm text-agap-textMain outline-none focus:border-agap-green focus:ring-1 focus:ring-agap-green"
                  placeholder="e.g. 11.50"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
              <Button type="submit" variant="primary" size="sm" loading={save.isPending} disabled={!valid}>Save</Button>
            </form>
          )}
        </div>
      )}
      {valid && entered! >= critical && (
        <p className="mt-2 text-xs font-semibold text-agap-danger">
          ⚠ At or above critical level. Supervisors are told within 5 minutes; surge mode is not activated automatically.
        </p>
      )}
      {save.isError && (
        <p className="mt-2 text-xs text-agap-danger">{(save.error as Error)?.message ?? 'Could not save the reading.'}</p>
      )}
    </Card>
  );
}

function RuleDialog({ rule, onClose }: { rule: SurgeRule; onClose: () => void }): JSX.Element {
  const update = useUpdateSurgeRule();
  const barangays = useBarangays();
  const [windowMinutes, setWindowMinutes] = useState(String(rule.window_minutes));
  const [minIncidents, setMinIncidents] = useState(String(rule.min_incidents));
  const [selected, setSelected] = useState<string[]>(rule.barangays);
  const [isActive, setIsActive] = useState(rule.is_active);
  const win = Number(windowMinutes);
  const min = Number(minIncidents);
  const valid = Number.isInteger(win) && win >= 5 && win <= 1440 && Number.isInteger(min) && min >= 1 && min <= 500;
  const INPUT_CLS =
    'w-full rounded-xl border border-agap-track bg-white px-3 py-2 text-sm text-agap-textMain outline-none focus:border-agap-green focus:ring-1 focus:ring-agap-green';

  function toggle(b: string) {
    setSelected((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    update.mutate(
      { id: rule.id, changes: { windowMinutes: win, minIncidents: min, barangays: selected, isActive } },
      { onSuccess: onClose },
    );
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Edit rule: {labelCase(rule.rule_key)}</DialogTitle>
        <DialogDescription>
          {rule.category ? `${labelCase(rule.category)} incidents` : 'All incidents'} · Supervisors are told when the
          count is reached. Changes are recorded in the audit log.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="mt-2 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="rule-window" className="text-xs font-semibold text-agap-textSub">Window (minutes)</label>
            <input id="rule-window" type="number" min={5} max={1440} className={INPUT_CLS} value={windowMinutes} onChange={(e) => setWindowMinutes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rule-min" className="text-xs font-semibold text-agap-textSub">Incidents needed</label>
            <input id="rule-min" type="number" min={1} max={500} className={INPUT_CLS} value={minIncidents} onChange={(e) => setMinIncidents(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-agap-textSub">Barangays (none selected = any barangay)</span>
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-agap-track bg-agap-surface p-2">
            {barangays.isLoading && <Skeleton className="h-6 w-40" />}
            {(barangays.data ?? []).map((b) => (
              <button
                type="button"
                key={b.id}
                onClick={() => toggle(b.name)}
                aria-pressed={selected.includes(b.name)}
                className={`rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                  selected.includes(b.name)
                    ? 'bg-agap-green text-white'
                    : 'bg-white text-agap-textMid border border-agap-track hover:border-agap-green'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-agap-textMain">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Rule is on
        </label>

        {!valid && <p className="text-xs text-agap-danger">Window: 5–1440 minutes. Incidents needed: 1–500.</p>}
        {update.isError && (
          <p className="text-xs text-agap-danger">{(update.error as Error)?.message ?? 'Could not save the rule.'}</p>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={update.isPending}>Cancel</Button>
          <Button type="submit" variant="primary" loading={update.isPending} disabled={!valid}>Save rule</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/**
 * MOD-52 (unit field flow plan Phase 4): people rescued and still waiting per barangay,
 * from the rescue crews' trip logs since the surge was declared. Most waiting first.
 */
function RescueByBarangayCard({ totals }: { totals: BarangayRescueTotal[] }): JSX.Element {
  const rescued = totals.reduce((sum, t) => sum + t.rescued, 0);
  const waiting = totals.reduce((sum, t) => sum + t.stillWaiting, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LifeBuoy size={15} className="text-agap-textSub" />
          Rescue by Barangay
        </CardTitle>
        <span className="text-xs text-agap-textSub">
          {rescued} rescued · ~{waiting} still waiting · from rescue crews&apos; trip logs
        </span>
      </CardHeader>
      {totals.length === 0 ? (
        <EmptyState icon={LifeBuoy} title="No rescue trips yet" description="Trips logged by rescue boats and trucks appear here." />
      ) : (
        <table className="w-full text-sm" data-testid="rescue-by-barangay">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-agap-textSub">
              <th className="py-2 pr-3 font-semibold">Barangay</th>
              <th className="py-2 pr-3 text-right font-semibold">Rescued</th>
              <th className="py-2 pr-3 text-right font-semibold">Still waiting</th>
              <th className="py-2 text-right font-semibold">Trips</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.barangay ?? 'unknown'} className="border-t border-[rgba(168,181,193,0.20)]">
                <td className="py-2 pr-3 font-semibold text-agap-textMain">{t.barangay ?? 'Barangay not given'}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{t.rescued}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {t.stillWaiting > 0 ? <Badge variant="amber">~{t.stillWaiting}</Badge> : '0'}
                </td>
                <td className="py-2 text-right tabular-nums text-agap-textSub">{t.trips}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function SurgeRulesCard(): JSX.Element {
  const rules = useSurgeRules();
  const [editing, setEditing] = useState<SurgeRule | null>(null);
  const cols: Column<SurgeRule>[] = [
    {
      key: 'rule',
      header: 'Rule',
      accessor: (r) => (
        <div>
          <p className="text-sm font-semibold text-agap-textMain">{labelCase(r.rule_key)}</p>
          <p className="text-xs text-agap-textSub">{r.category ? labelCase(r.category) : 'Any category'}</p>
        </div>
      ),
    },
    {
      key: 'threshold',
      header: 'Trips at',
      accessor: (r) => (
        <span className="text-xs text-agap-textMid tabular-nums">{r.min_incidents} in {r.window_minutes} min</span>
      ),
    },
    {
      key: 'barangays',
      header: 'Barangays',
      accessor: (r) => (
        <span className="text-xs text-agap-textMid">{r.barangays.length ? r.barangays.join(', ') : 'Any'}</span>
      ),
    },
    {
      key: 'active',
      header: 'Status',
      accessor: (r) => <Badge variant={r.is_active ? 'green' : 'muted'}>{r.is_active ? 'On' : 'Off'}</Badge>,
    },
    {
      key: 'edit',
      header: '',
      accessor: (r) => (
        <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Edit ${labelCase(r.rule_key)}`}>
          <Edit size={14} /> Edit
        </Button>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-agap-textSub" />
          Surge Recommendation Rules
        </CardTitle>
        <span className="text-xs text-agap-textSub">checked every 5 min · MDRRMO-editable defaults</span>
      </CardHeader>
      {rules.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rules.isError ? (
        <EmptyState icon={XCircle} title="Could not load the rules" description="Refresh to retry." />
      ) : (
        <DataTable columns={cols} data={rules.data ?? []} getRowKey={(r) => r.id} />
      )}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        {editing && <RuleDialog key={editing.id} rule={editing} onClose={() => setEditing(null)} />}
      </Dialog>
    </Card>
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
  const surge = surgeQ.data;
  const isActive = surge?.is_active ?? false;

  const triageQ = useTriageTags({ enabled: isActive });
  const resourcesQ = useSurgeResources();

  const canManage = hasRole(user, 'SUPERVISOR');
  const recommendation = useSurgeRecommendation();
  const river = useRiverLevel();
  const markRead = useMarkRead();

  const [showActivate, setShowActivate] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  // Set when the activate dialog was opened from a recommendation (prefilled).
  const [fromRecommendation, setFromRecommendation] = useState<SurgeRecommendation | null>(null);

  function openActivate(rec: SurgeRecommendation | null) {
    setFromRecommendation(rec);
    setShowActivate(true);
  }

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
          <Button variant="danger" onClick={() => openActivate(null)}>
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

      {/* Surge recommendation (C2): a suggestion only; the Supervisor reviews and activates. */}
      {canManage && !isActive && !surgeQ.isLoading && recommendation && (
        <RecommendationBanner
          rec={recommendation}
          onActivate={() => openActivate(recommendation)}
          onDismiss={() => markRead.mutate(recommendation.notification.id)}
          dismissing={markRead.isPending}
        />
      )}

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
                <Button variant="danger" onClick={() => openActivate(null)}>
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

          <RescueByBarangayCard totals={surge?.rescue_by_barangay ?? []} />

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

      {/* River reading and the recommendation rules (C2) */}
      <RiverLevelCard canEdit={canManage} />
      {canManage && <SurgeRulesCard />}

      {/* Dialogs */}
      <Dialog open={showActivate} onOpenChange={setShowActivate}>
        {showActivate && (
          <ActivateDialog
            onClose={() => setShowActivate(false)}
            {...(fromRecommendation && {
              initial: prefillFrom(fromRecommendation, river.data),
              // The recommendation was acted on: clear it from the banner and the bell.
              onActivated: () => markRead.mutate(fromRecommendation.notification.id),
            })}
          />
        )}
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
