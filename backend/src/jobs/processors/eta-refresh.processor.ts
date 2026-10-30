import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import type { RouteSnapshot } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { MapsService } from '../../locations/maps/maps.service';
import { simplifyLine } from '../../locations/maps/simplify-line';
import { ROUTE_CACHE_TTL_SECONDS, RouteCacheService, isRouteFor } from '../../locations/route-cache.service';
import { TransportLegService, type TransportLegResolution } from '../../incidents/transport/transport-leg.service';
import { TransportAudienceService } from '../../incidents/transport/transport-audience.service';
import { openTransportWhere } from '../../incidents/transport/open-transport';

export type EtaRefreshReason =
  | 'fix'
  | 'transport_started'
  | 'destination_changed'
  | 'facility_moved'
  | 'arrived'
  /** The crew confirmed or withdrew the reporter as the patient (C17): resend to the new audience. */
  | 'audience_changed';

/**
 * The leg and target are resolved when the job runs (C14), so a destination
 * change between enqueue and run is honoured. The coordinates are fallbacks: the
 * responder point when no crew fix is stored, the scene point only when
 * TRANSPORT_ROUTING_ENABLED=false. Immediate refreshes carry neither.
 */
export interface EtaRefreshJobData {
  dispatchId: string;
  incidentId: string;
  responderLat?: number;
  responderLng?: number;
  incidentLat?: number;
  incidentLng?: number;
  reason?: EtaRefreshReason;
}

type LatLng = { lat: number; lng: number };

@Processor(QUEUE_NAMES.LOCATION_PROCESSING)
export class EtaRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(EtaRefreshProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly maps: MapsService,
    private readonly legs: TransportLegService,
    private readonly routeCache: RouteCacheService,
    private readonly config: ConfigService,
    private readonly audience: TransportAudienceService,
  ) {
    super();
  }

  async process(job: Job<EtaRefreshJobData>): Promise<void> {
    const { dispatchId, incidentId, responderLat, responderLng } = job.data;
    this.logger.log(`Processing ETA refresh for dispatch ${dispatchId}`);

    try {
      // Jobs are throttled per dispatch, so the fix in job.data may be up to the
      // throttle window old. Route from the freshest fix of this dispatch's crew,
      // falling back to the enqueued point. Skip units that are no longer active.
      const dispatch = await this.prisma.dispatches.findUnique({
        where: { id: dispatchId },
        select: { status: true },
      });
      if (!dispatch || !['PENDING', 'SENT', 'ACCEPTED'].includes(String(dispatch.status))) {
        this.logger.log(`Skipping ETA refresh for inactive dispatch ${dispatchId}`);
        return;
      }
      const freshest = await this.prisma.location_history.findFirst({
        where: {
          incident_id: incidentId,
          users: { is: { dispatch_crew: { some: { dispatch_id: dispatchId } } } },
        },
        orderBy: { recorded_at: 'desc' },
        select: { latitude: true, longitude: true },
      });
      const from: LatLng | null = freshest
        ? { lat: Number(freshest.latitude), lng: Number(freshest.longitude) }
        : responderLat !== undefined && responderLng !== undefined
          ? { lat: responderLat, lng: responderLng }
          : null;

      if (this.config.get<string>('TRANSPORT_ROUTING_ENABLED') === 'false') {
        await this.refreshSceneEta(job.data, from);
      } else {
        await this.refreshLeg(dispatchId, incidentId, from);
      }
    } catch (err) {
      // A failed ETA calculation must never stop dispatch — log only
      this.logger.error(`ETA refresh failed for dispatch ${dispatchId}: ${String(err)}`);
    }
  }

  /** TRANSPORT_ROUTING_ENABLED=false: the Prompt 04 behaviour (scene route, ETA event only). */
  private async refreshSceneEta(data: EtaRefreshJobData, from: LatLng | null): Promise<void> {
    const { dispatchId, incidentId, incidentLat, incidentLng } = data;
    if (!from || incidentLat === undefined || incidentLng === undefined) return;

    const route = await this.maps.route(from, { lat: incidentLat, lng: incidentLng });
    if (!route.durationSeconds) {
      this.logger.warn(`Routing returned no duration for dispatch ${dispatchId}`);
      return;
    }
    this.realtime.notifyEtaUpdated(incidentId, {
      dispatchId,
      etaSeconds: route.durationSeconds,
      isEstimate: true,
      calculatedAt: new Date().toISOString(),
    });
    this.logger.log(`ETA updated for dispatch ${dispatchId}: ${route.durationSeconds}s`);
  }

  /**
   * Route to where the unit is heading now (plan §13.2). The hospital leg never
   * reaches the shared incident room, only the crew and a crew-confirmed
   * reporter-patient (TransportAudienceService, C6/C17/C18).
   */
  private async refreshLeg(dispatchId: string, incidentId: string, from: LatLng | null): Promise<void> {
    const leg = await this.legs.resolve(dispatchId);
    if (!leg) return;
    const rooms = await this.audience.roomsForDispatch(incidentId, dispatchId, leg.leg);
    const emitRoute = (route: RouteSnapshot | null) =>
      this.realtime.routeUpdated(
        { incidentId, dispatchId, leg: leg.leg, destination: leg.destination, route },
        rooms,
      );

    if (!leg.target) {
      await this.routeCache.clear(dispatchId);
      emitRoute(null);
      return;
    }

    const result = from ? await this.maps.route(from, leg.target).catch(() => null) : null;
    if (!from || !result?.durationSeconds) {
      this.logger.warn(`No route for dispatch ${dispatchId} (${leg.leg})`);
      emitRoute(await this.lastGoodRoute(dispatchId, leg));
      return;
    }

    const calculatedAt = new Date();
    const route: RouteSnapshot = {
      geometry: simplifyLine(result.geometry ?? []),
      distanceMeters: result.distanceMeters,
      durationSeconds: result.durationSeconds,
      isEstimate: true,
      calculatedAt: calculatedAt.toISOString(),
      stale: false,
    };
    await this.routeCache.set(dispatchId, { leg: leg.leg, destination: leg.destination, route, fromFix: from });

    // Only the hospital leg's ETA belongs on the transport record (G3), and only
    // while that transport is still open.
    if (leg.leg === 'TO_FACILITY' && leg.transportId) {
      await this.prisma.transportRecord.updateMany({
        where: openTransportWhere({ id: leg.transportId }),
        data: { estimated_arrival_at: new Date(calculatedAt.getTime() + result.durationSeconds * 1000) },
      });
    }

    emitRoute(route);
    this.realtime.notifyEtaUpdated(
      incidentId,
      { dispatchId, etaSeconds: result.durationSeconds, isEstimate: true, calculatedAt: route.calculatedAt },
      rooms,
    );
    this.logger.log(`ETA updated for dispatch ${dispatchId} (${leg.leg}): ${result.durationSeconds}s`);
  }

  /** The cached route for the same leg and destination, marked stale, if under 120 s old. */
  private async lastGoodRoute(dispatchId: string, leg: TransportLegResolution): Promise<RouteSnapshot | null> {
    const cached = await this.routeCache.get(dispatchId);
    if (
      !cached ||
      !isRouteFor(cached, leg.leg, leg.destination) ||
      Date.now() - Date.parse(cached.route.calculatedAt) >= ROUTE_CACHE_TTL_SECONDS * 1000
    ) {
      return null;
    }
    return { ...cached.route, stale: true };
  }
}
