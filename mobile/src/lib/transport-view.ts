import type { LatestUnitPosition } from '@/src/services/api/locations.api';

/**
 * What the reporter's tracking screen shows about transport (plan §17, Correction C17):
 * - TO_SCENE: the existing scene UI.
 * - TO_FACILITY_VISIBLE / AT_FACILITY_VISIBLE: the server sent this reporter the
 *   destination (only after the crew confirmed them as the patient).
 * - TO_FACILITY_REDACTED / AT_FACILITY_REDACTED: the hospital leg, without a destination.
 * - COMPLETE: RESOLVED / CLOSED.
 */
export type TransportView =
  | 'TO_SCENE'
  | 'TO_FACILITY_VISIBLE'
  | 'TO_FACILITY_REDACTED'
  | 'AT_FACILITY_VISIBLE'
  | 'AT_FACILITY_REDACTED'
  | 'COMPLETE';

export interface TransportViewResult {
  view: TransportView;
  /** The unit the view is about; null on TO_SCENE / COMPLETE, or when no hospital-leg unit is known yet. */
  unit: LatestUnitPosition | null;
}

const COMPLETE_STATUSES = new Set(['RESOLVED', 'CLOSED']);

/**
 * Derives the view from what the server sent. The client never decides visibility:
 * VISIBLE needs a destination in the payload, and the reporter's own "I am the
 * patient" answer is not an input. While the incident is TRANSPORTING but no unit on
 * the hospital leg has arrived in the cache yet, the view is the status-only one.
 * Several units: a visible one wins (the crew confirmed this reporter on that
 * transport), then a unit still travelling over one that has arrived.
 */
export function deriveTransportView(
  status: string | null | undefined,
  units: LatestUnitPosition[] | undefined,
): TransportViewResult {
  if (status && COMPLETE_STATUSES.has(status)) return { view: 'COMPLETE', unit: null };

  const hospitalLeg = (units ?? []).filter((u) => u.leg === 'TO_FACILITY' || u.leg === 'AT_FACILITY');
  const rank = (u: LatestUnitPosition) => (u.destination ? 0 : 2) + (u.leg === 'TO_FACILITY' ? 0 : 1);
  const unit = [...hospitalLeg].sort((a, b) => rank(a) - rank(b))[0];

  if (!unit) {
    return status === 'TRANSPORTING'
      ? { view: 'TO_FACILITY_REDACTED', unit: null }
      : { view: 'TO_SCENE', unit: null };
  }
  const visible = !!unit.destination;
  if (unit.leg === 'AT_FACILITY') return { view: visible ? 'AT_FACILITY_VISIBLE' : 'AT_FACILITY_REDACTED', unit };
  return { view: visible ? 'TO_FACILITY_VISIBLE' : 'TO_FACILITY_REDACTED', unit };
}
