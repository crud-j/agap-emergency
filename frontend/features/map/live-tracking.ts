import type { ResponderEtaUpdatedPayload, ResponderLocationUpdatedPayload } from '@agap/shared';
import type { LatestUnitPosition, LiveResponderPosition } from './api';

/**
 * Pure live-tracking rules for the dispatch dashboard (WP5). Kept free of React
 * so the socket merge, staleness and ETA wording can be unit-tested.
 */

/** Dispatch statuses that still need the dashboard's attention. */
export const OPEN_DISPATCH_STATUSES = ['PENDING', 'SENT', 'ACCEPTED'] as const;

function sameUnit(row: LiveResponderPosition, p: ResponderLocationUpdatedPayload): boolean {
  // One marker per dispatch (crew phones collapse onto their unit); fall back to
  // the responder id for payloads from older backends without dispatchId.
  if (p.dispatchId && row.dispatchId) return row.dispatchId === p.dispatchId;
  return row.responderId === p.responderId;
}

/**
 * Applies buffered `responder.location_updated` payloads to the
 * ['live-responders'] cache. `sawUnknown` tells the caller to refetch the REST
 * seed so a unit first seen over the socket gets its name and unit details.
 */
export function mergeResponderLocations(
  old: LiveResponderPosition[] | undefined,
  payloads: Iterable<ResponderLocationUpdatedPayload>,
): { next: LiveResponderPosition[]; sawUnknown: boolean } {
  let next = old ? [...old] : [];
  let sawUnknown = false;

  for (const p of payloads) {
    const patch: Partial<LiveResponderPosition> & Pick<LiveResponderPosition, 'responderId'> = {
      responderId: p.responderId,
      lat: p.lat,
      lng: p.lng,
      heading: p.heading ?? null,
      speed: p.speed ?? null,
      updated_at: p.updatedAt,
      ...(p.incidentId ? { incident_id: p.incidentId } : {}),
      ...(p.dispatchId ? { dispatchId: p.dispatchId } : {}),
      ...(p.callSign !== undefined ? { call_sign: p.callSign } : {}),
    };
    const idx = next.findIndex((r) => sameUnit(r, p));
    if (idx === -1) {
      sawUnknown = true;
      next = [
        ...next,
        { responder_name: null, resource_name: null, incident_id: p.incidentId ?? null, ...patch } as LiveResponderPosition,
      ];
    } else {
      next = next.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    }
  }
  return { next, sawUnknown };
}

/** Patches one unit's ETA in the ['incident-units', incidentId] cache. */
export function applyEtaUpdate(
  units: LatestUnitPosition[] | undefined,
  payload: ResponderEtaUpdatedPayload,
): LatestUnitPosition[] | undefined {
  if (!units) return units;
  return units.map((u) =>
    u.dispatchId === payload.dispatchId
      ? { ...u, eta: { seconds: payload.etaSeconds, isEstimate: true, calculatedAt: payload.calculatedAt } }
      : u,
  );
}

export type TrackingPhase = 'none' | 'awaiting' | 'accepted' | 'closed';

/**
 * Where the incident's dispatches stand: no dispatch yet, waiting for the crew
 * to accept, at least one unit accepted (track it), or every dispatch ended.
 */
export function trackingPhase(dispatches: ReadonlyArray<{ status: string }> | null | undefined): TrackingPhase {
  if (!dispatches || dispatches.length === 0) return 'none';
  if (dispatches.some((d) => d.status === 'ACCEPTED')) return 'accepted';
  if (dispatches.some((d) => d.status === 'PENDING' || d.status === 'SENT')) return 'awaiting';
  return 'closed';
}

/** "12 s ago" / "3 min ago" / "1 h ago"; "no update yet" when missing. */
export function formatAge(updatedAt: string | null | undefined, now: number): string {
  if (!updatedAt) return 'no update yet';
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return 'no update yet';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
}

/**
 * ETA wording. Always an estimate (Rule 13); a missing value reads
 * "Calculating…" rather than a made-up number.
 */
export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'Calculating…';
  if (seconds < 60) return '<1 min';
  return `~${Math.round(seconds / 60)} min`;
}
