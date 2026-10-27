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
