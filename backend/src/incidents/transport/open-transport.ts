import { Prisma } from '@prisma/client';
import { IncidentStatus } from '@agap/shared';

/**
 * The one definition of an "open" transport (MOD-40): not yet arrived AND the
 * incident is still TRANSPORTING. A dispatcher may resolve an incident before the
 * crew records arrival; that record keeps `arrived_at` null forever but is not
 * open, so it must never block a new transport, widen the geofence or receive
 * facility events. Every open-transport check imports this; none writes its own.
 */
export function openTransportWhere(
  extra: Prisma.TransportRecordWhereInput = {},
): Prisma.TransportRecordWhereInput {
  return { ...extra, arrived_at: null, incidents: { status: IncidentStatus.TRANSPORTING } };
}

/** Incident statuses after which an arrived unit is no longer "at the facility" for this incident. */
export const AT_FACILITY_ENDED_STATUSES = [IncidentStatus.RESOLVED, IncidentStatus.CLOSED];

/**
 * An arrived transport whose incident is not yet RESOLVED/CLOSED: the unit is at the
 * facility or driving back from it (leg AT_FACILITY). Widens the geofence like an
 * open transport, so tracking does not stop at a hospital outside Bocaue.
 */
export function atFacilityTransportWhere(
  extra: Prisma.TransportRecordWhereInput = {},
): Prisma.TransportRecordWhereInput {
  return { ...extra, arrived_at: { not: null }, incidents: { status: { notIn: AT_FACILITY_ENDED_STATUSES } } };
}
