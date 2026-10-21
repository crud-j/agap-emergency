import type { ResponderLocationUpdatedPayload } from '@agap/shared';
import type { LatestUnitPosition } from '@/src/services/api/locations.api';

/** Merge a live location into its unit, preserving unit metadata from the REST seed. */
export function mergeTrackingLocation(
  units: LatestUnitPosition[] | undefined,
  payload: ResponderLocationUpdatedPayload,
): LatestUnitPosition[] {
  const next = [...(units ?? [])];
  const index = payload.dispatchId
    ? next.findIndex((unit) => unit.dispatchId === payload.dispatchId)
    : next.length === 1
      ? 0
      : -1;
  const current = index >= 0 ? next[index] : undefined;
  const dispatchId = payload.dispatchId ?? current?.dispatchId ?? payload.responderId;
  const currentUpdatedAt = current?.position?.updatedAt;
  if (
    currentUpdatedAt &&
    Date.parse(currentUpdatedAt) > Date.parse(payload.updatedAt)
  ) {
    return next;
  }

  const updated: LatestUnitPosition = {
    dispatchId,
    callSign: payload.callSign ?? current?.callSign ?? null,
    unitName: current?.unitName ?? null,
    resourceType: current?.resourceType ?? null,
    position: {
      lat: payload.lat,
      lng: payload.lng,
      heading: payload.heading ?? null,
      speedKmh: payload.speed ?? null,
      updatedAt: payload.updatedAt,
    },
    eta: current?.eta ?? { seconds: null, isEstimate: true, calculatedAt: null },
  };

  if (index < 0) next.push(updated);
  else next[index] = updated;
  return next;
}
