import { BadRequestException } from '@nestjs/common';
import { Prisma, facility_location_status } from '@prisma/client';
import type { TransportDestinationView } from '@agap/shared';
import { toTransportDestinationView } from './facility-view';

/** Hidden from the shared directory and never selectable as a transport destination. */
export const UNREVIEWED_STATUSES: facility_location_status[] = [
  facility_location_status.PENDING_REVIEW,
  facility_location_status.REJECTED,
];

/** Receiving statuses that warn the crew but never block a transport (Reliability Rules). */
const AT_CAPACITY_RECEIVING_STATUSES = ['AT_CAPACITY', 'CLOSED'];

export type DestinationWarning = 'FACILITY_AT_CAPACITY';

export interface SelectableDestination {
  id: string;
  name: string;
  receiving_status: string;
  warnings: DestinationWarning[];
  /** What viewers are sent (numeric coordinates, verified flag). */
  view: TransportDestinationView;
}

type FacilityReader = { facility: Pick<Prisma.TransactionClient['facility'], 'findUnique'> };

/**
 * The one rule for a transport destination (MOD-39/40): an active hospital whose
 * location is not pending review or rejected. A full or closed hospital is still
 * allowed, with a warning, because the crew may have no better option.
 */
export async function assertSelectableDestination(
  prisma: FacilityReader,
  facilityId: string,
): Promise<SelectableDestination> {
  const facility = await prisma.facility.findUnique({
    where: { id: facilityId },
    select: {
      id: true, name: true, is_active: true, facility_type: true, location_status: true, receiving_status: true,
      latitude: true, longitude: true,
    },
  });
  if (!facility || facility.is_active === false) {
    throw new BadRequestException('Destination facility is not active or does not exist.');
  }
  if (facility.facility_type !== 'HOSPITAL') {
    throw new BadRequestException('Destination must be a hospital.');
  }
  if (UNREVIEWED_STATUSES.includes(facility.location_status)) {
    throw new BadRequestException('This hospital is awaiting MDRRMO review and cannot be selected yet.');
  }
  return {
    id: facility.id,
    name: facility.name,
    receiving_status: facility.receiving_status,
    warnings: AT_CAPACITY_RECEIVING_STATUSES.includes(facility.receiving_status) ? ['FACILITY_AT_CAPACITY'] : [],
    view: toTransportDestinationView(facility),
  };
}
