'use client';

import { useState, type JSX } from 'react';
import { Clock, Crosshair, Hourglass, LocateFixed, Navigation, Repeat, Truck, Undo2, Users, WifiOff } from 'lucide-react';
import { isDispatchChangeable, isSignalLost } from '@agap/shared';
import { useIncidentDispatches } from '@/features/dispatch/hooks';
import type { IncidentDispatch } from '@/features/dispatch/api';
import { useIncidentUnits, useLiveResponders } from '@/features/map/hooks';
import { formatAge, formatEta, trackingPhase } from '@/features/map/live-tracking';
import { titleCase } from '@/lib/incident-format';
import { useNow } from '@/lib/use-now';
import { UnitChangePanel, type UnitChangeMode } from './UnitChangePanel';

const ACTIVE_DISPATCH = ['PENDING', 'SENT', 'ACCEPTED'];

interface UnitTrackingCardProps {
  incidentId: string;
  /** Shown in the recall / replace confirmations. */
  reference: string;
  /** From GET /incidents/:id — the source of truth for dispatch status. */
  dispatches: ReadonlyArray<{ id: string; status: string; resource_id: string }>;
  trackedDispatchId: string | null;
  follow: boolean;
  onToggleFollow: () => void;
  onFit: () => void;
}

/**
 * Assigned-unit tracking panel (WP5 / G4, MOD-31 + MOD-43). One row per active
 * unit: a unit still waiting for its crew says so; an accepted one shows call
 * sign, unit type, crew names (staff-only view), a live ETA labelled as an
 * estimate, the age of the last position (red after 60 s), and follow /
 * fit-to-scene camera controls. Until a unit reaches the scene the dispatcher
 * can replace or recall it (MOD-31).
 */
export function UnitTrackingCard({
  incidentId, reference, dispatches, trackedDispatchId, follow, onToggleFollow, onFit,
}: UnitTrackingCardProps): JSX.Element {
  const phase = trackingPhase(dispatches);
  const now = useNow(5_000);
  const { data: details = [] } = useIncidentDispatches(incidentId);
  const { data: live = [] } = useLiveResponders();
  const { data: units = [] } = useIncidentUnits(incidentId, phase === 'accepted');
  const [change, setChange] = useState<{ dispatchId: string; mode: UnitChangeMode } | null>(null);

  const active = dispatches.filter((d) => ACTIVE_DISPATCH.includes(d.status));

  if (active.length === 0) {
    const last = dispatches[0]?.status;
    return (
      <div className="rounded-lg border border-agap-track/40 bg-agap-surface px-4 py-3 text-[13px] text-agap-textMid">
        No unit assigned right now{last ? ` (last one: ${titleCase(last)})` : ''}.
      </div>
    );
  }

  /** Crew on the incident's other active units: they can't also ride a replacement. */
  const busyCrewExcept = (dispatchId: string) => new Set(
    details
      .filter((x) => x.id !== dispatchId && ACTIVE_DISPATCH.includes(x.status))
      .flatMap((x) => x.dispatch_crew.map((c) => c.user_id)),
  );

  return (
    <div className="space-y-2">
      {active.map((d) => {
        const detail = details.find((x) => x.id === d.id);
        const callSign = detail?.resources?.call_sign ?? 'Assigned unit';
        const unitType = detail?.resources?.resource_type ?? null;
        // Uses the staff list's row (it carries on_scene_at); without it, no actions yet.
        const changeable = !!detail && isDispatchChangeable(detail);
        const open = change?.dispatchId === d.id ? change.mode : null;
        const actions = changeable && (
          <ChangeActions
            open={open}
            onReplace={() => setChange({ dispatchId: d.id, mode: 'replace' })}
            onRecall={() => setChange({ dispatchId: d.id, mode: 'recall' })}
          />
        );
        const panel = open && detail && (
          <UnitChangePanel
            incidentId={incidentId}
            reference={reference}
            dispatch={detail}
            mode={open}
            busyResponderIds={busyCrewExcept(d.id)}
            onClose={() => setChange(null)}
          />
        );

        if (d.status !== 'ACCEPTED') {
          return (
            <div key={d.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-amber-800">
              <div className="flex items-start gap-2.5">
                <Hourglass size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold">
                    {detail?.resources ? `${callSign} · waiting for the crew to accept` : 'Waiting for the crew to accept'}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed">Their location shows here once they accept.</p>
                </div>
              </div>
              {actions}
              {panel}
            </div>
          );
        }

        const unit = units.find((u) => u.dispatchId === d.id);
        const fix = live.find((r) => r.dispatchId === d.id);
        // Live feed first; the /latest seed covers a unit the ops feed hasn't reported yet.
        const updatedAt = fix?.updated_at ?? unit?.position?.updatedAt ?? null;
        const hasPosition = !!fix || !!unit?.position;
        const lost = hasPosition && isSignalLost(updatedAt, now);
        const shownCallSign = detail?.resources?.call_sign ?? unit?.callSign ?? fix?.call_sign ?? 'Assigned unit';
        const shownType = unitType ?? unit?.resourceType ?? fix?.resource_type ?? null;
        const crew = (detail?.dispatch_crew ?? []).map((c) => c.users?.full_name).filter(Boolean) as string[];
        const tracked = d.id === trackedDispatchId;

        return (
          <div
            key={d.id}
            className={`rounded-lg border px-3.5 py-3 ${
              lost ? 'border-red-200 bg-red-50/60' : 'border-emerald-200 bg-emerald-50/60'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[14px] font-bold text-agap-textMain">
                  <Truck size={14} className="shrink-0 text-agap-green" />
                  {shownCallSign}
                </p>
                <p className="mt-0.5 text-[12px] text-agap-textMid">
                  {shownType ? titleCase(shownType) : 'Unit'}
                  {detail?.resources?.name && detail.resources.name !== shownCallSign ? ` · ${detail.resources.name}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[15px] font-bold tabular-nums text-agap-textMain">{formatEta(unit?.eta.seconds)}</p>
                <p className="text-[12px] font-medium text-agap-textMid">ETA (estimate)</p>
              </div>
            </div>

            {crew.length > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-agap-textMid">
                <Users size={12} className="shrink-0 text-agap-textSub" />
                <span className="truncate">{crew.join(', ')}</span>
              </p>
            )}

            <p
              className={`mt-1.5 flex items-center gap-1.5 text-[12px] ${
                lost ? 'font-semibold text-red-700' : 'text-agap-textMid'
              }`}
              aria-live="polite"
            >
              {lost ? <WifiOff size={12} className="shrink-0" /> : <Clock size={12} className="shrink-0 text-agap-textSub" />}
              {!hasPosition
                ? 'Accepted · waiting for their GPS'
                : lost
                  ? `Signal lost (last seen ${formatAge(updatedAt, now)}). Unit is still assigned.`
                  : `Updated ${formatAge(updatedAt, now)}`}
            </p>

            {hasPosition && (
              <div className="mt-2.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={onToggleFollow}
                  disabled={!tracked}
                  aria-pressed={tracked && follow}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50 ${
                    tracked && follow
                      ? 'border-agap-green bg-agap-green text-white'
                      : 'border-agap-track/60 bg-white text-agap-textMid hover:border-agap-green/40 hover:text-agap-green'
                  }`}
                >
                  <LocateFixed size={13} />
                  {tracked && follow ? 'Following' : 'Follow unit'}
                </button>
                <button
                  type="button"
                  onClick={onFit}
                  disabled={!tracked}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-agap-track/60 bg-white px-2 py-1.5 text-[12px] font-semibold text-agap-textMid transition-colors hover:border-agap-green/40 hover:text-agap-green disabled:opacity-50"
                >
                  <Crosshair size={13} />
                  Show scene + unit
                </button>
              </div>
            )}
            {actions}
            {panel}
          </div>
        );
      })}
      {phase === 'accepted' && (
        <p className="flex items-center gap-1 text-[12px] text-agap-textSub">
          <Navigation size={10} className="shrink-0" />
          ETA is an estimate, not a guarantee.
        </p>
      )}
    </div>
  );
}

/** Replace / Recall, shown until the unit reaches the scene. Hidden while its panel is open. */
function ChangeActions({
  open, onReplace, onRecall,
}: { open: UnitChangeMode | null; onReplace: () => void; onRecall: () => void }): JSX.Element | null {
  if (open) return null;
  const base = 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border bg-white px-2 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2';
  return (
    <div className="mt-2.5 flex gap-1.5">
      <button
        type="button"
        onClick={onReplace}
        className={`${base} border-agap-track/60 text-agap-textMid hover:border-agap-green/40 hover:text-agap-green focus-visible:ring-emerald-500/50`}
      >
        <Repeat size={13} aria-hidden="true" />
        Replace
      </button>
      <button
        type="button"
        onClick={onRecall}
        className={`${base} border-red-200 text-red-700 hover:bg-red-50 focus-visible:ring-red-400/50`}
      >
        <Undo2 size={13} aria-hidden="true" />
        Recall
      </button>
    </div>
  );
}
