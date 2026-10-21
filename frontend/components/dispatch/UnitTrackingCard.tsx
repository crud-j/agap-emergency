'use client';

import type { JSX } from 'react';
import { Clock, Crosshair, Hourglass, LocateFixed, Navigation, Truck, Users, WifiOff } from 'lucide-react';
import { isSignalLost } from '@agap/shared';
import { useIncidentDispatches } from '@/features/dispatch/hooks';
import { useIncidentUnits, useLiveResponders } from '@/features/map/hooks';
import { formatAge, formatEta, trackingPhase } from '@/features/map/live-tracking';
import { titleCase } from '@/lib/incident-format';
import { useNow } from '@/lib/use-now';

interface UnitTrackingCardProps {
  incidentId: string;
  /** From GET /incidents/:id — the source of truth for dispatch status. */
  dispatches: ReadonlyArray<{ id: string; status: string; resource_id: string }>;
  trackedDispatchId: string | null;
  follow: boolean;
  onToggleFollow: () => void;
  onFit: () => void;
}

/**
 * Assigned-unit tracking panel (WP5 / G4, MOD-31 + MOD-43). Replaces the old
 * static "Unit dispatched — tracking live" text with: call sign, unit type,
 * crew names (staff-only view), a live ETA labelled as an estimate, the age of
 * the last position (red after 60 s), and follow / fit-to-scene camera controls.
 * Before the crew accepts it says tracking starts on acceptance.
 */
export function UnitTrackingCard({
  incidentId, dispatches, trackedDispatchId, follow, onToggleFollow, onFit,
}: UnitTrackingCardProps): JSX.Element {
  const phase = trackingPhase(dispatches);
  const now = useNow(5_000);
  const { data: details = [] } = useIncidentDispatches(incidentId);
  const { data: live = [] } = useLiveResponders();
  const { data: units = [] } = useIncidentUnits(incidentId, phase === 'accepted');

  if (phase === 'awaiting') {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
        <Hourglass size={16} className="mt-0.5 shrink-0" />
        <div>
          <p className="text-[13px] font-semibold">Awaiting crew acceptance</p>
          <p className="mt-0.5 text-[12px] leading-relaxed">Tracking starts when the crew accepts.</p>
        </div>
      </div>
    );
  }

  if (phase !== 'accepted') {
    const last = dispatches[0]?.status;
    return (
      <div className="rounded-lg border border-agap-track/40 bg-agap-surface px-4 py-3 text-[13px] text-agap-textMid">
        No unit is currently assigned{last ? ` (last dispatch ${titleCase(last)})` : ''}.
      </div>
    );
  }

  const accepted = dispatches.filter((d) => d.status === 'ACCEPTED');

  return (
    <div className="space-y-2">
      {accepted.map((d) => {
        const detail = details.find((x) => x.id === d.id);
        const unit = units.find((u) => u.dispatchId === d.id);
        const fix = live.find((r) => r.dispatchId === d.id);
        // Live feed first; the /latest seed covers a unit the ops feed hasn't reported yet.
        const updatedAt = fix?.updated_at ?? unit?.position?.updatedAt ?? null;
        const hasPosition = !!fix || !!unit?.position;
        const lost = hasPosition && isSignalLost(updatedAt, now);
        const callSign = detail?.resources?.call_sign ?? unit?.callSign ?? fix?.call_sign ?? 'Assigned unit';
        const unitType = detail?.resources?.resource_type ?? unit?.resourceType ?? fix?.resource_type ?? null;
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
                  {callSign}
                </p>
                <p className="mt-0.5 text-[11px] text-agap-textSub">
                  {unitType ? titleCase(unitType) : 'Unit'}
                  {detail?.resources?.name && detail.resources.name !== callSign ? ` · ${detail.resources.name}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[15px] font-bold tabular-nums text-agap-textMain">{formatEta(unit?.eta.seconds)}</p>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-agap-textSub">ETA · estimate</p>
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
                ? 'Accepted — waiting for the crew’s first GPS fix'
                : lost
                  ? `Signal lost — last update ${formatAge(updatedAt, now)}. Unit is still assigned.`
                  : `Last update ${formatAge(updatedAt, now)}`}
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
                  {tracked && follow ? 'Following unit' : 'Follow unit'}
                </button>
                <button
                  type="button"
                  onClick={onFit}
                  disabled={!tracked}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-agap-track/60 bg-white px-2 py-1.5 text-[12px] font-semibold text-agap-textMid transition-colors hover:border-agap-green/40 hover:text-agap-green disabled:opacity-50"
                >
                  <Crosshair size={13} />
                  Fit scene + unit
                </button>
              </div>
            )}
          </div>
        );
      })}
      <p className="flex items-center gap-1 text-[10px] text-agap-textSub">
        <Navigation size={10} className="shrink-0" />
        ETA is an estimate from the routing service — never a guarantee.
      </p>
    </div>
  );
}
