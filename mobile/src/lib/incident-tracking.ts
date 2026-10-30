import type {
  IncidentTransportUpdatedPayload,
  ResponderLocationUpdatedPayload,
  ResponderRouteUpdatedPayload,
} from '@agap/shared';
import type { LatestUnitPosition } from '@/src/services/api/locations.api';

const NO_ETA: LatestUnitPosition['eta'] = { seconds: null, isEstimate: true, calculatedAt: null };

/**
 * Merge a live location into its unit, preserving unit metadata from the REST seed
 * (including its leg, destination and route, which a location event does not carry).
 */
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
    ...current,
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
    eta: current?.eta ?? NO_ETA,
  };

  if (index < 0) next.push(updated);
  else next[index] = updated;
  return next;
}

/**
 * `responder.route_updated`: the unit's leg, destination and server route replace the
 * cached ones. A unit not seen yet is added without a position. A withdrawal
 * (`destination` and `route` null) clears what this viewer was shown.
 */
export function mergeRouteUpdate(
  units: LatestUnitPosition[] | undefined,
  payload: ResponderRouteUpdatedPayload,
): LatestUnitPosition[] {
  const next = [...(units ?? [])];
  const index = next.findIndex((unit) => unit.dispatchId === payload.dispatchId);
  const current = index >= 0 ? next[index] : undefined;
  const updated: LatestUnitPosition = {
    dispatchId: payload.dispatchId,
    callSign: null,
    unitName: null,
    resourceType: null,
    position: null,
    eta: NO_ETA,
    ...current,
    leg: payload.leg,
    destination: payload.destination,
    route: payload.route,
  };
  if (index < 0) next.push(updated);
  else next[index] = updated;
  return next;
}

/**
 * `incident.transport_updated`: the hospital of that dispatch's transport changed. The
 * destination is patched; a route to a different hospital is dropped, and the next
 * route_updated brings the new one. The user copy has no facility id, and none is kept.
 */
export function mergeTransportUpdate(
  units: LatestUnitPosition[] | undefined,
  payload: IncidentTransportUpdatedPayload,
): LatestUnitPosition[] | undefined {
  if (!units) return units;
  return units.map((unit) => {
    if (unit.dispatchId !== payload.dispatchId) return unit;
    if (!payload.destination) return { ...unit, destination: null, route: null };
    const { id: _id, ...destination } = payload.destination;
    const before = unit.destination;
    const sameHospital =
      !!before &&
      before.name === destination.name &&
      before.latitude === destination.latitude &&
      before.longitude === destination.longitude;
    return { ...unit, destination, ...(sameHospital ? {} : { route: null }) };
  });
}
