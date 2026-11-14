'use client';

import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import dynamic from 'next/dynamic';
import { isCoordinateInBocaue } from '@agap/shared';
import {
  AlertTriangle, Check, Clock, Edit, Info, Locate, MapPin, MapPinned, Plus, Power, RefreshCw, Search,
  Sparkles, Trash2, TrendingDown, TrendingUp, X,
} from 'lucide-react';
import {
  Button, Badge, EmptyState, Skeleton,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  type BadgeVariant,
} from '@/components/ui';
import { titleCase } from '@/lib/incident-format';
import { cn } from '@/lib/utils';
import {
  useApproveRiskAreaProposal, useAreaSuggestion, useCreateRiskArea, useDeleteRiskArea, useDismissRiskAreaProposal,
  useHotspotStatus, useRiskAreaProposals, useRiskAreas, useRiskMap, useRunHotspotCheck, useUpdateRiskArea,
} from '@/features/risk/hooks';
import {
  DEFAULT_RISK_MAP_PERIOD, RISK_LEVELS, type RiskArea, type RiskAreaInput, type RiskAreaProposal, type RiskLevel,
} from '@/features/risk/api';
import {
  DEFAULT_RADIUS_M, MAX_RADIUS_M, MIN_RADIUS_M, boundaryBounds, formatRadius, hintText, levelWord, placeLine, relativeDays,
} from '@/features/risk/area-geo';
import { quickPicks } from '@/features/risk/place-input';
import { PinPlaceFinder } from '@/components/risk/PinPlaceFinder';
import type { PinMapFocus } from '@/components/risk/RiskAreaPinMap';

/**
 * MOD-51 risk areas (redesigned 2026-11-15). The Supervisor manages them from the Risk
 * Map's "Risk areas" tab: pins a place with a radius, reviews AGAP's proposals and hints,
 * and runs the hotspot check. The System Administrator sees the same cards and map
 * read-only under Administration (the API refuses their writes).
 */

const MapLoading = () => (
  <div className="flex h-full w-full items-center justify-center rounded-2xl bg-agap-surface text-sm text-agap-textSub">
    Loading map…
  </div>
);
const RiskAreasMap = dynamic(() => import('@/components/risk/RiskAreasMap'), { ssr: false, loading: MapLoading });
const RiskAreaPinMap = dynamic(() => import('@/components/risk/RiskAreaPinMap'), { ssr: false, loading: MapLoading });

const RISK_TYPES = ['FLOOD', 'FIRE', 'INDUSTRIAL', 'ROAD_ACCIDENT', 'RESCUE', 'MEDICAL', 'NATURAL_DISASTER', 'DEBRIS', 'OTHER'] as const;
const ALL = '__all__';
const BOCAUE_RIVER_CRITICAL_M = 11.5;

const LEVEL_VARIANT: Record<RiskLevel, BadgeVariant> = {
  LOW: 'green', MODERATE: 'amber', HIGH: 'red', CRITICAL: 'red',
};
const levelRank = (level: string) => (RISK_LEVELS as readonly string[]).indexOf(level);

const INPUT =
  'h-9 w-full rounded-xl border border-[rgba(168,181,193,0.25)] bg-white px-3 text-sm text-agap-textMain ' +
  'placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green';
const LABEL = 'mb-1 block text-xs font-semibold text-agap-textMid';

const threshold = (a: RiskArea) => (a.flood_threshold_meters === null ? null : Number(a.flood_threshold_meters));

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

const MANILA_TIME = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
const manilaTime = (iso: string) => MANILA_TIME.format(new Date(iso));

/** The value, once it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

// ─── Add / edit dialog (pin + radius, smart suggestions) ──────────────────────

interface FormState {
  name: string;
  riskType: string;
  riskLevel: RiskLevel;
  pin: { lat: number; lng: number } | null;
  radius: number;
  threshold: string;
  description: string;
  isActive: boolean;
}

function toForm(a: RiskArea | null): FormState {
  return {
    name: a?.name ?? '',
    riskType: a?.risk_type ?? 'FLOOD',
    riskLevel: (RISK_LEVELS as readonly string[]).includes(a?.risk_level ?? '') ? (a!.risk_level as RiskLevel) : 'MODERATE',
    pin: a?.pin ? { lat: a.pin.lat, lng: a.pin.lng } : null,
    radius: a?.pin?.radius_m ?? DEFAULT_RADIUS_M,
    threshold: a && threshold(a) !== null ? String(threshold(a)) : '',
    description: a?.description ?? '',
    isActive: a?.is_active ?? true,
  };
}

function AreaDialog({ area, onClose }: {
  /** null = add. */
  area: RiskArea | null;
  onClose: () => void;
}): JSX.Element {
  const [form, setForm] = useState<FormState>(() => toForm(area));
  // An existing area keeps its own name and level; a new one takes AGAP's suggestions
  // until the Supervisor types or picks their own.
  const [nameTouched, setNameTouched] = useState(!!area);
  const [levelTouched, setLevelTouched] = useState(!!area);
  const [error, setError] = useState<string | null>(null);
  const [outside, setOutside] = useState(false);
  // Finding the place (2026-11-15): incidents and barangay lines on the map, search, barangay, quick picks.
  // 90 days, the Risk Map's default: the same cached data when the Map tab was opened first.
  const riskMap = useRiskMap(DEFAULT_RISK_MAP_PERIOD);
  const [focus, setFocus] = useState<PinMapFocus | null>(null);
  const focusSeq = useRef(0);
  const [barangay, setBarangay] = useState('');
  const [expanded, setExpanded] = useState(false);
  const create = useCreateRiskArea();
  const update = useUpdateRiskArea();
  const busy = create.isPending || update.isPending;
  const isFlood = form.riskType === 'FLOOD';
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const query = useDebounced(
    useMemo(
      () => (form.pin ? { lat: form.pin.lat, lng: form.pin.lng, radius: form.radius, riskType: form.riskType } : null),
      [form.pin, form.radius, form.riskType],
    ),
    400,
  );
  const suggestion = useAreaSuggestion(query);
  const s = suggestion.data;

  useEffect(() => {
    if (!s) return;
    setForm((f) => ({
      ...f,
      ...(!nameTouched && { name: s.suggestedName }),
      ...(!levelTouched && { riskLevel: s.suggestedLevel }),
    }));
  }, [s, nameTouched, levelTouched]);

  const barangays = riskMap.data?.barangays ?? [];
  const points = riskMap.data?.points ?? [];
  const picks = useMemo(() => quickPicks(riskMap.data, form.riskType), [riskMap.data, form.riskType]);
  const barangayNames = useMemo(() => barangays.map((b) => b.name), [barangays]);

  /** A click, dot or drag on the map (already checked to be inside Bocaue). */
  function placePin(lat: number, lng: number) {
    setOutside(false);
    set('pin', { lat, lng });
  }

  /** A search result, pasted point or quick pick: pin it and zoom in to street level. */
  function pinAndShow(lat: number, lng: number) {
    if (!isCoordinateInBocaue(lat, lng)) { setOutside(true); return; }
    placePin(lat, lng);
    setFocus({ seq: ++focusSeq.current, kind: 'point', lat, lng });
  }

  function goToBarangay(name: string) {
    const b = barangays.find((x) => x.name === name);
    if (!b) return;
    setBarangay(name);
    setFocus({ seq: ++focusSeq.current, kind: 'bounds', bounds: boundaryBounds(b.boundary) });
  }

  const pinMoved =
    !!form.pin &&
    (!area?.pin || area.pin.lat !== form.pin.lat || area.pin.lng !== form.pin.lng || area.pin.radius_m !== form.radius);

  async function save() {
    if (!form.pin && !area) { setError('Place the pin: find a place, pick a spot or click the map.'); return; }
    if (form.name.trim().length < 2) { setError('Give the area a name.'); return; }
    let meters: number | null = null;
    if (isFlood && form.threshold.trim()) {
      meters = Number(form.threshold);
      if (!Number.isFinite(meters) || meters < 0 || meters > 30) { setError('The flood threshold must be between 0 and 30 m.'); return; }
    }
    const body: RiskAreaInput = {
      name: form.name.trim(),
      riskType: form.riskType,
      riskLevel: form.riskLevel,
      // Only a flood area is tied to the river level; switching type clears it.
      floodThresholdMeters: isFlood ? meters : null,
      description: form.description.trim(),
      ...(form.pin && pinMoved && {
        latitude: Number(form.pin.lat.toFixed(7)),
        longitude: Number(form.pin.lng.toFixed(7)),
        radiusMeters: form.radius,
      }),
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

  const suggestedMark = (touched: boolean) =>
    !touched && s ? <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-px text-[10px] font-bold uppercase text-violet-700">Suggested</span> : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{area ? `Edit “${area.name}”` : 'Add risk area'}</DialogTitle>
          <DialogDescription>
            Find the place, then put the pin where the risk is and set how far it reaches. AGAP fills in the barangay,
            a name and a level from the incidents nearby; change anything before saving.
          </DialogDescription>
        </DialogHeader>

        <PinPlaceFinder
          barangays={barangayNames}
          picks={picks}
          riskType={form.riskType}
          onPin={pinAndShow}
          onBarangay={goToBarangay}
        />

        <div className={cn('grid grid-cols-1 gap-4', !expanded && 'md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]')}>
          {/* Map + what AGAP found */}
          <div className="space-y-2">
            <div className={expanded ? 'h-[60vh]' : 'h-[280px] md:h-[360px]'}>
              <RiskAreaPinMap
                pin={form.pin}
                radiusM={form.radius}
                level={form.riskLevel}
                riskType={form.riskType}
                barangays={barangays}
                points={points}
                dataReady={riskMap.isSuccess}
                focus={focus}
                highlightBarangay={barangay}
                expanded={expanded}
                onToggleExpand={() => setExpanded((v) => !v)}
                onPick={placePin}
                onOutside={() => setOutside(true)}
              />
            </div>
            {riskMap.isError && (
              <p className="text-xs text-agap-textSub">
                Couldn&apos;t load the incidents and barangay lines. You can still search or click the map.
              </p>
            )}
            {outside && <p role="alert" className="text-xs text-agap-danger">That spot is outside Bocaue. Pick a place inside the municipality.</p>}
            {area && !area.pin && !form.pin && (
              <p className="flex items-start gap-1.5 text-xs text-agap-textSub">
                <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
                {area.shape === 'OUTLINE'
                  ? 'This area keeps the outline of the incidents that formed it.'
                  : 'This area covers its whole barangay.'}{' '}
                Click the map to replace it with a pin and radius, or leave it as it is.
              </p>
            )}
            {form.pin && (
              <div className="rounded-xl border border-[rgba(124,58,237,0.20)] bg-violet-50/60 px-3 py-2 text-xs text-agap-textMid">
                <p className="flex items-center gap-1.5 font-semibold text-agap-textMain">
                  <MapPin size={13} className="text-violet-600" aria-hidden />
                  {suggestion.isFetching && !s ? 'Looking up this spot…' : s?.barangay ? `Barangay ${s.barangay}` : s ? 'Outside every barangay line' : 'Barangay from the pin'}
                </p>
                {s && (
                  <p className="mt-0.5">
                    {s.incidentsByType.length === 0
                      ? `No incidents within ${formatRadius(form.radius)} in the last ${s.windowDays} days.`
                      : `Within ${formatRadius(form.radius)}, last ${s.windowDays} days: ` +
                        s.incidentsByType.map((r) => `${r.count} ${titleCase(r.category).toLowerCase()}`).join(', ') + '.'}
                  </p>
                )}
                {suggestion.isError && <p className="mt-0.5 text-agap-danger">Couldn&apos;t look up this spot. You can still save.</p>}
              </div>
            )}
          </div>

          {/* Fields */}
          <div className="space-y-3">
            <div>
              <span className={LABEL}>Type</span>
              <Select value={form.riskType} onValueChange={(v) => set('riskType', v)}>
                <SelectTrigger aria-label="Type" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_TYPES.map((t) => <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="ra-radius" className={cn(LABEL, 'flex justify-between')}>
                <span>Reach (radius)</span>
                <span className="font-mono tabular-nums text-agap-textMain">{formatRadius(form.radius)}</span>
              </label>
              <input
                id="ra-radius"
                type="range"
                min={MIN_RADIUS_M}
                max={MAX_RADIUS_M}
                step={50}
                value={form.radius}
                onChange={(e) => set('radius', Number(e.target.value))}
                className="w-full accent-agap-green"
              />
              <div className="flex justify-between text-[10px] text-agap-textSub"><span>{formatRadius(MIN_RADIUS_M)}</span><span>{formatRadius(MAX_RADIUS_M)}</span></div>
            </div>

            <div>
              <label htmlFor="ra-name" className={LABEL}>Name{suggestedMark(nameTouched)}</label>
              <input
                id="ra-name"
                className={INPUT}
                maxLength={255}
                value={form.name}
                onChange={(e) => { setNameTouched(true); set('name', e.target.value); }}
                placeholder="Drop a pin for a suggestion"
              />
            </div>

            <div>
              <span className={LABEL}>Level{suggestedMark(levelTouched)}</span>
              <Select value={form.riskLevel} onValueChange={(v) => { setLevelTouched(true); set('riskLevel', v as RiskLevel); }}>
                <SelectTrigger aria-label="Level" className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map((l) => <SelectItem key={l} value={l}>{titleCase(l)}</SelectItem>)}
                </SelectContent>
              </Select>
              {s && (
                <p className="mt-1 text-[11px] text-agap-textSub">
                  {s.sameTypeIncidents} {titleCase(form.riskType).toLowerCase()} incident{s.sameTypeIncidents === 1 ? '' : 's'} here in {s.windowDays} days
                  → {levelWord(s.suggestedLevel)}
                  {levelTouched && s.suggestedLevel !== form.riskLevel && (
                    <button type="button" className="ml-1.5 font-semibold text-agap-green hover:underline" onClick={() => set('riskLevel', s.suggestedLevel)}>
                      Use it
                    </button>
                  )}
                </p>
              )}
            </div>

            {isFlood && (
              <div>
                <label htmlFor="ra-threshold" className={LABEL}>River level that triggers it (m, optional)</label>
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
                  placeholder={BOCAUE_RIVER_CRITICAL_M.toFixed(2)}
                />
                <p className="mt-1 text-[11px] text-agap-textSub">Bocaue River critical level: 11.50 m (mandatory evacuation).</p>
              </div>
            )}

            <div>
              <label htmlFor="ra-desc" className={LABEL}>Notes (optional)</label>
              <textarea
                id="ra-desc"
                rows={2}
                maxLength={1000}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                className={cn(INPUT, 'h-auto resize-y py-2')}
                placeholder="e.g. Low road beside the creek floods first"
              />
            </div>

            {area && (
              <label className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(168,181,193,0.25)] px-3 py-2">
                <span className="text-sm text-agap-textMain">
                  Active
                  <span className="block text-xs text-agap-textSub">Inactive areas stay listed but are hidden from the Risk Map.</span>
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
          </div>
        </div>

        {error && <p role="alert" className="text-xs text-agap-danger">{error}</p>}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save} disabled={busy || (!area && !form.pin)}>
            {area ? 'Save changes' : 'Add risk area'}
          </Button>
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

// ─── Proposals (AUTOMATION_NEEDS_PLAN Phase 2, C7) ────────────────────────────

const proposalPlace = (p: RiskAreaProposal) =>
  p.risk_type === 'FLOOD'
    ? `Whole barangay · ${p.barangay ?? 'Bocaue'}`
    : `Incident cluster · ${p.barangay ?? 'outside barangay lines'}`;

function ApproveDialog({ proposal, onClose }: { proposal: RiskAreaProposal; onClose: () => void }): JSX.Element {
  const approve = useApproveRiskAreaProposal();
  const [name, setName] = useState(`${proposal.barangay ?? 'Bocaue'} ${titleCase(proposal.risk_type).toLowerCase()} area`);
  const [level, setLevel] = useState<RiskLevel>(
    proposal.incident_count >= 10 ? 'CRITICAL' : proposal.incident_count >= 6 ? 'HIGH' : 'MODERATE',
  );
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
          <DialogTitle>Create this risk area?</DialogTitle>
          <DialogDescription>
            {proposal.risk_type === 'FLOOD'
              ? `A flood area covering all of ${proposal.barangay ?? 'the barangay'}`
              : `A ${titleCase(proposal.risk_type).toLowerCase()} area with the outline of the incidents that formed it`}
            {' '}({proposal.incident_count} incidents in {proposal.window_days} days). Recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="rp-name" className={LABEL}>Name</label>
            <input id="rp-name" className={INPUT} maxLength={255} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <span className={LABEL}>Level</span>
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

function ProposalCard({ proposal: p, selected, onSelect, onApprove }: {
  proposal: RiskAreaProposal;
  selected: boolean;
  onSelect: () => void;
  onApprove: () => void;
}): JSX.Element {
  const dismiss = useDismissRiskAreaProposal();
  return (
    <li
      className={cn(
        'rounded-xl border bg-white px-3 py-2.5 transition',
        selected ? 'border-agap-amber ring-2 ring-agap-amber/40' : 'border-[rgba(217,119,6,0.30)]',
      )}
    >
      <button type="button" className="block w-full text-left" onClick={onSelect}>
        <p className="text-sm font-bold text-agap-textMain">{titleCase(p.risk_type)}</p>
        <p className="text-xs text-agap-textMid">{proposalPlace(p)}</p>
        <p className="mt-0.5 text-xs text-agap-textSub">{p.incident_count} incidents in the last {p.window_days} days</p>
      </button>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button size="sm" variant="primary" className="h-7" onClick={onApprove}><Check size={13} /> Approve</Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          loading={dismiss.isPending}
          onClick={() => dismiss.mutate(p.id)}
          aria-label={`Dismiss ${titleCase(p.risk_type)} proposal${p.barangay ? ` in ${p.barangay}` : ''}`}
        >
          <X size={13} /> Dismiss
        </Button>
      </div>
      {dismiss.isError && <p role="alert" className="mt-1 text-xs text-agap-danger">{errMsg(dismiss.error, 'Could not dismiss it.')}</p>}
    </li>
  );
}

// ─── Area card ────────────────────────────────────────────────────────────────

function AreaCard({ area: a, canManage, selected, onSelect, onEdit, onRemove }: {
  area: RiskArea;
  canManage: boolean;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
}): JSX.Element {
  const update = useUpdateRiskArea();
  const st = a.stats;
  const trend = st.incidents_90d - st.incidents_prev_90d;
  const hint = canManage && a.hint ? hintText(a.hint) : null;

  function applyHint() {
    if (!a.hint) return;
    update.mutate({ id: a.id, changes: a.hint.kind === 'RAISE' ? { riskLevel: a.hint.suggestedLevel } : { isActive: false } });
  }

  return (
    <li
      className={cn(
        'rounded-2xl border bg-white p-3.5 shadow-card transition',
        selected ? 'border-agap-green ring-2 ring-agap-green/30' : 'border-[rgba(168,181,193,0.22)]',
        !a.is_active && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-2">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
          <p className="truncate text-sm font-bold text-agap-textMain">{a.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-agap-textMid">
            <MapPin size={12} className="shrink-0 text-agap-textSub" aria-hidden />
            <span className="truncate">{titleCase(a.risk_type)} · {placeLine(a)}</span>
          </p>
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={LEVEL_VARIANT[a.risk_level as RiskLevel] ?? 'muted'}>{titleCase(a.risk_level)}</Badge>
          {!a.is_active && <Badge variant="muted">Inactive</Badge>}
        </div>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-agap-textSub">
        <span className="font-semibold text-agap-textMid">
          {st.incidents_90d === 0 ? 'No incidents in 90 days' : `${st.incidents_90d} incident${st.incidents_90d === 1 ? '' : 's'} in 90 days`}
        </span>
        {trend !== 0 && (st.incidents_90d > 0 || st.incidents_prev_90d > 0) && (
          <span className={cn('inline-flex items-center gap-0.5', trend > 0 ? 'text-agap-danger' : 'text-agap-green')}>
            {trend > 0 ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
            {trend > 0 ? `up from ${st.incidents_prev_90d}` : `down from ${st.incidents_prev_90d}`}
          </span>
        )}
        {st.last_incident_at && <span>· latest {relativeDays(st.last_incident_at)}</span>}
        {threshold(a) !== null && <span>· river ≥ {threshold(a)!.toFixed(2)} m</span>}
      </p>
      {a.description && <p className="mt-1 line-clamp-2 text-xs text-agap-textSub">{a.description}</p>}

      {hint && (
        <div
          className={cn(
            'mt-2.5 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs',
            a.hint!.kind === 'RAISE' ? 'bg-agap-amberSoft text-agap-textMain' : 'bg-agap-surface text-agap-textMid',
          )}
        >
          {a.hint!.kind === 'RAISE'
            ? <AlertTriangle size={13} className="shrink-0 text-agap-amber" aria-hidden />
            : <Clock size={13} className="shrink-0 text-agap-textSub" aria-hidden />}
          <span className="min-w-0 flex-1">{hint.message}</span>
          <Button size="sm" variant={a.hint!.kind === 'RAISE' ? 'primary' : 'secondary'} className="h-7" loading={update.isPending} onClick={applyHint}>
            {hint.action}
          </Button>
          {update.isError && <span role="alert" className="w-full text-agap-danger">Could not save. Try again.</span>}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1 border-t border-[rgba(168,181,193,0.18)] pt-2">
        <Button size="sm" variant="ghost" className="h-7" onClick={onSelect} disabled={!a.boundary} aria-label={`Show ${a.name} on the map`}>
          <Locate size={13} /> Show on map
        </Button>
        {canManage && (
          <>
            <Button size="sm" variant="ghost" className="h-7" onClick={onEdit} aria-label={`Edit ${a.name}`}>
              <Edit size={13} /> Edit
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={onRemove} aria-label={`Remove ${a.name}`}>
              <Trash2 size={13} /> Remove
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

// ─── Hotspot check status ─────────────────────────────────────────────────────

function CheckStatus(): JSX.Element {
  const status = useHotspotStatus();
  const run = useRunHotspotCheck();
  const last = status.data?.lastRun;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-agap-textSub">
      <Sparkles size={13} className="text-violet-600" aria-hidden />
      <span>
        {status.isLoading
          ? 'Checking status…'
          : last
            ? <>Last checked {manilaTime(last.at)}{last.trigger === 'MANUAL' ? ' (by hand)' : ''}{last.failed ? ' · failed' : ''}</>
            : 'Not checked yet'}
        {status.data && <> · next {manilaTime(status.data.nextRunAt)}</>}
      </span>
      <Button size="sm" variant="secondary" className="h-7" loading={run.isPending} onClick={() => run.mutate()}>
        {!run.isPending && <RefreshCw size={13} />} Check now
      </Button>
      {run.isSuccess && (
        <span role="status" className="font-semibold text-agap-textMid">
          {run.data.written === 0 ? 'Nothing new found.' : `${run.data.written} proposal${run.data.written === 1 ? '' : 's'} to review.`}
        </span>
      )}
      {run.isError && <span role="alert" className="text-agap-danger">{errMsg(run.error, 'The check could not run.')}</span>}
    </div>
  );
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

/** canManage: the Supervisor's tab on the Risk Map. false: the System Administrator's read-only view. */
export function RiskAreasTab({ canManage }: { canManage: boolean }): JSX.Element {
  const areas = useRiskAreas();
  const proposalsQ = useRiskAreaProposals(canManage);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ area: RiskArea | null } | null>(null);
  const [removing, setRemoving] = useState<RiskArea | null>(null);
  const [approving, setApproving] = useState<RiskAreaProposal | null>(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>(ALL);
  const [show, setShow] = useState<'all' | 'active' | 'inactive'>('all');

  const all = useMemo(() => areas.data ?? [], [areas.data]);
  const proposals = canManage ? proposalsQ.data ?? [] : [];
  const needReview = all.filter((a) => a.hint).length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((a) => (show === 'all' ? true : show === 'active' ? a.is_active : !a.is_active))
      .filter((a) => type === ALL || a.risk_type === type)
      .filter((a) => !q || `${a.name} ${a.barangay ?? ''} ${a.description ?? ''}`.toLowerCase().includes(q))
      // Active first, then the most serious, then the busiest.
      .sort((x, y) =>
        Number(y.is_active) - Number(x.is_active) ||
        levelRank(y.risk_level) - levelRank(x.risk_level) ||
        y.stats.incidents_90d - x.stats.incidents_90d ||
        x.name.localeCompare(y.name),
      );
  }, [all, search, type, show]);

  const nothingYet = !areas.isLoading && !areas.isError && all.length === 0 && proposals.length === 0;

  return (
    <div className="space-y-4">
      {/* Summary and actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white px-4 py-3 shadow-card">
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-agap-greenSoft px-2.5 py-0.5 font-semibold text-agap-green">
              {all.filter((a) => a.is_active).length} active
            </span>
            {canManage && needReview > 0 && (
              <span className="rounded-full bg-agap-amberSoft px-2.5 py-0.5 font-semibold text-agap-amber">{needReview} to review</span>
            )}
            {canManage && proposals.length > 0 && (
              <span className="rounded-full bg-violet-100 px-2.5 py-0.5 font-semibold text-violet-700">
                {proposals.length} proposed
              </span>
            )}
          </div>
          {canManage ? (
            <CheckStatus />
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-agap-textSub">
              <Info size={13} aria-hidden />
              Read-only. Supervisors add, change and approve risk areas from the Risk Map.
            </p>
          )}
        </div>
        {canManage && (
          <Button variant="primary" onClick={() => setEditing({ area: null })}>
            <Plus size={15} /> Add risk area
          </Button>
        )}
      </div>

      {areas.isError && (
        <p className="rounded-xl border border-[rgba(212,72,88,0.2)] bg-agap-dangerSoft px-4 py-2.5 text-sm text-agap-danger">
          Couldn&apos;t load risk areas. Check your connection and refresh.
        </p>
      )}

      {nothingYet ? (
        <div className="rounded-2xl border border-dashed border-[rgba(168,181,193,0.40)] bg-white">
          <EmptyState
            icon={MapPinned}
            title="No risk areas yet"
            description={
              canManage
                ? 'Pin a place you know is risky, like a riverside street or a fireworks storage site. AGAP also checks the incidents every night at 2:30 AM and proposes areas where the same kind of incident keeps happening, or where a barangay keeps flooding.'
                : 'Supervisors have not added any yet.'
            }
            action={canManage ? (
              <Button variant="primary" onClick={() => setEditing({ area: null })}><Plus size={15} /> Add risk area</Button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,44%)]">
          {/* Map: above the list on a phone, beside it (and staying in view) on a wide screen */}
          <div className="h-[280px] lg:sticky lg:top-0 lg:order-2 lg:h-[calc(100vh-15rem)] lg:min-h-[420px]">
            <RiskAreasMap areas={all} proposals={proposals} selectedId={selectedId} onSelect={setSelectedId} />
          </div>

          <div className="space-y-4 lg:order-1">
            {canManage && proposals.length > 0 && (
              <section className="rounded-2xl border border-[rgba(217,119,6,0.28)] bg-agap-amberSoft p-3.5">
                <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-agap-textMain">
                  <Sparkles size={15} className="text-agap-amber" aria-hidden /> Proposed by AGAP
                </h2>
                <p className="mt-0.5 text-xs text-agap-textSub">
                  Places where the same kind of incident keeps happening, and barangays with repeated floods (last 90 days).
                  Nothing is added until you approve it.
                </p>
                <ul className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {proposals.map((p) => (
                    <ProposalCard
                      key={p.id}
                      proposal={p}
                      selected={selectedId === p.id}
                      onSelect={() => setSelectedId(p.id)}
                      onApprove={() => setApproving(p)}
                    />
                  ))}
                </ul>
              </section>
            )}
            {canManage && proposalsQ.isError && <p className="text-xs text-agap-danger">Couldn&apos;t load proposed areas.</p>}

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[180px] flex-1">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-agap-textSub" aria-hidden />
                <input
                  className={cn(INPUT, 'pl-8')}
                  placeholder="Search name, barangay, notes"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search risk areas"
                />
              </label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger aria-label="Type" className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  {RISK_TYPES.map((t) => <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>)}
                </SelectContent>
              </Select>
              <div role="group" aria-label="Show" className="flex rounded-xl border border-[rgba(168,181,193,0.30)] bg-white p-0.5">
                {(['all', 'active', 'inactive'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={show === v}
                    onClick={() => setShow(v)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-semibold capitalize transition',
                      show === v ? 'bg-agap-green text-white' : 'text-agap-textMid hover:bg-agap-surface',
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {areas.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}
              </div>
            ) : visible.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[rgba(168,181,193,0.40)] bg-white px-4 py-6 text-center text-sm text-agap-textSub">
                {all.length === 0 ? 'No risk areas yet. Approve a proposal above or add one.' : 'No risk areas match these filters.'}
              </p>
            ) : (
              <ul className="space-y-2.5">
                {visible.map((a) => (
                  <AreaCard
                    key={a.id}
                    area={a}
                    canManage={canManage}
                    selected={selectedId === a.id}
                    onSelect={() => setSelectedId(a.id)}
                    onEdit={() => setEditing({ area: a })}
                    onRemove={() => setRemoving(a)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {editing && <AreaDialog key={editing.area?.id ?? 'new'} area={editing.area} onClose={() => setEditing(null)} />}
      <RemoveDialog area={removing} onClose={() => setRemoving(null)} />
      {approving && <ApproveDialog key={approving.id} proposal={approving} onClose={() => setApproving(null)} />}
    </div>
  );
}
