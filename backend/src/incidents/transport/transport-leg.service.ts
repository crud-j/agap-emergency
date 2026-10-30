import { Injectable } from '@nestjs/common';
import type { TransportDestinationView, TransportLeg } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DESTINATION_VIEW_SELECT, toTransportDestinationView } from '../../hospitals/facility-view';
import { AT_FACILITY_ENDED_STATUSES, openTransportWhere } from './open-transport';

/** Where a dispatch is heading right now (MOD-40/43). Derived on every call, never stored. */
export interface TransportLegResolution {
  leg: TransportLeg;
  /** Scene coordinates on TO_SCENE, hospital coordinates on TO_FACILITY; null when there is nothing to route to. */
  target: { lat: number; lng: number } | null;
  destination: TransportDestinationView | null;
  transportId: string | null;
  incidentId: string;
}

const FINISHED: readonly string[] = AT_FACILITY_ENDED_STATUSES;

/**
 * Resolves a dispatch's current leg (plan §12 "Leg" row):
 * - open transport (openTransportWhere, C16) → TO_FACILITY; target = hospital coordinates,
 *   or null when no destination is chosen yet or the hospital has no coordinates;
 * - latest transport arrived and the incident is not RESOLVED/CLOSED → AT_FACILITY, target null;
 * - otherwise → TO_SCENE, target = the incident location (null if missing).
 */
@Injectable()
export class TransportLegService {
  constructor(private readonly prisma: PrismaService) {}

  /** Null when the dispatch does not exist. */
  async resolve(dispatchId: string): Promise<TransportLegResolution | null> {
    // Two reads in parallel: the open-transport rule is a where filter (C16), so it
    // gets its own query instead of being re-checked here in code.
    const [open, dispatch] = await Promise.all([
      this.prisma.transportRecord.findFirst({
        where: openTransportWhere({ dispatch_id: dispatchId }),
        orderBy: { created_at: 'desc' },
        select: { id: true, facilities: { select: DESTINATION_VIEW_SELECT } },
      }),
      this.prisma.dispatches.findUnique({
        where: { id: dispatchId },
        select: {
          incident_id: true,
          incidents: {
            select: {
              status: true,
              incident_locations: { select: { latitude: true, longitude: true } },
            },
          },
          transport_records: {
            orderBy: { created_at: 'desc' },
            take: 1,
            select: { id: true, arrived_at: true, facilities: { select: DESTINATION_VIEW_SELECT } },
          },
        },
      }),
    ]);
    if (!dispatch) return null;
    const incidentId = dispatch.incident_id;

    if (open) {
      const destination = toDestinationView(open.facilities);
      const target =
        destination && destination.latitude !== null && destination.longitude !== null
          ? { lat: destination.latitude, lng: destination.longitude }
          : null;
      return { leg: 'TO_FACILITY', target, destination, transportId: open.id, incidentId };
    }

    const latest = dispatch.transport_records[0];
    if (latest?.arrived_at && !FINISHED.includes(String(dispatch.incidents.status))) {
      return {
        leg: 'AT_FACILITY',
        target: null,
        destination: toDestinationView(latest.facilities),
        transportId: latest.id,
        incidentId,
      };
    }

    const scene = dispatch.incidents.incident_locations;
    return {
      leg: 'TO_SCENE',
      target: scene ? { lat: Number(scene.latitude), lng: Number(scene.longitude) } : null,
      destination: null,
      transportId: null,
      incidentId,
    };
  }
}

function toDestinationView(
  facility: Parameters<typeof toTransportDestinationView>[0] | null,
): TransportDestinationView | null {
  return facility ? toTransportDestinationView(facility) : null;
}
