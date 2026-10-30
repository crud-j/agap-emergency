import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isCoordinateInBocaue, isCoordinateInServiceArea } from '@agap/shared';
import { atFacilityTransportWhere, openTransportWhere } from '../incidents/transport/open-transport';

type TransportCounter = { transportRecord: Pick<Prisma.TransactionClient['transportRecord'], 'count'> };

/**
 * Where a responder's GPS fix may be (G4). Inside Bocaue: always. Outside Bocaue but
 * inside the service area: only while the responder is crew on a dispatch of this
 * incident with an open transport (C16), i.e. carrying a patient to a hospital that
 * may lie outside Bocaue, or with an arrived transport while the incident is not yet
 * RESOLVED/CLOSED (at that hospital or driving back). Anything else: 400. The one rule
 * for POST /locations/track and POST /responders/location.
 */
export async function assertResponderFixInArea(
  client: TransportCounter,
  fix: { userId: string; incidentId: string; latitude: number; longitude: number },
): Promise<void> {
  if (isCoordinateInBocaue(fix.latitude, fix.longitude)) return;
  if (isCoordinateInServiceArea(fix.latitude, fix.longitude)) {
    const crewedOnIncident: Prisma.TransportRecordWhereInput = {
      incident_id: fix.incidentId,
      dispatches: { dispatch_crew: { some: { user_id: fix.userId } } },
    };
    const transports = await client.transportRecord.count({
      where: { OR: [openTransportWhere(crewedOnIncident), atFacilityTransportWhere(crewedOnIncident)] },
    });
    if (transports > 0) return;
  }
  throw new BadRequestException('Location must be within Bocaue Municipality, Bulacan.');
}
