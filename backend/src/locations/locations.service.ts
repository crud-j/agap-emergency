import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CaptureLocationDto } from './dto/capture-location.dto';
import { TrackLocationDto } from './dto/track-location.dto';
import { MapsService } from './maps/maps.service';
import { ACTIVE_RESPONSE_INCIDENT_STATUSES, isCoordinateInBocaue, QUEUE_NAMES } from '@agap/shared';
import { IncidentParticipantService, type ParticipantActor } from '../realtime/incident-participant.service';

/** At most one routing call per dispatch in this window (ETA job dedup TTL). */
export const ETA_REFRESH_THROTTLE_MS = 15_000;
const OPS_FEED_LOOKBACK_MS = 4 * 3_600_000;

const FIX_SELECT = {
  incident_id: true,
  user_id: true,
  latitude: true,
  longitude: true,
  heading_degrees: true,
  speed_kmh: true,
  recorded_at: true,
} satisfies Prisma.location_historySelect;

type Fix = Prisma.location_historyGetPayload<{ select: typeof FIX_SELECT }>;

/** `fixes` must be ordered newest first; returns the newest fix from any of the crew. */
function freshestFixFor(fixes: Fix[], incidentId: string, crewIds: string[]): Fix | undefined {
  return fixes.find((f) => f.incident_id === incidentId && !!f.user_id && crewIds.includes(f.user_id));
}

/** Reporter-safe unit view: no responder names or phone numbers. */
export interface LatestUnitPosition {
  dispatchId: string;
  callSign: string | null;
  unitName: string | null;
  resourceType: string | null;
  position: {
    lat: number;
    lng: number;
    heading: number | null;
    speedKmh: number | null;
    updatedAt: string;
  } | null;
  eta: { seconds: number | null; isEstimate: true; calculatedAt: string | null };
}

/** Staff-only ops map row (one per active unit). */
export interface OpsResponderPosition {
  responderId: string;
  responder_name: string | null;
  dispatchId: string;
  incident_id: string;
  incident_status: string;
  resource_name: string | null;
  call_sign: string | null;
  resource_type: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  updated_at: string;
}

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly maps: MapsService,
    private readonly participants: IncidentParticipantService,
    @InjectQueue(QUEUE_NAMES.LOCATION_PROCESSING) private readonly locationProcessingQueue: Queue,
  ) {}

  private assertBocaueCoordinate(latitude: number, longitude: number): void {
    if (!isCoordinateInBocaue(latitude, longitude)) {
      throw new BadRequestException('Location must be within Bocaue Municipality, Bulacan.');
    }
  }

  async capture(dto: CaptureLocationDto, _userId?: string) {
    this.assertBocaueCoordinate(dto.latitude, dto.longitude);

    if (!dto.incidentId) {
      // Standalone capture without an incident: echo back the point.
      return {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyMeters: dto.accuracyMeters ?? null,
      };
    }

    const location = await this.prisma.incident_locations.upsert({
      where: { incident_id: dto.incidentId },
      create: {
        incident_id: dto.incidentId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy_meters: dto.accuracyMeters ?? null,
        altitude_meters: dto.altitudeMeters ?? null,
      },
      update: {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy_meters: dto.accuracyMeters ?? null,
        altitude_meters: dto.altitudeMeters ?? null,
      },
    });

    // The incident's own location was set/updated (MOD-11/MOD-13) — push it to the
    // ops map + the incident room. Best-effort; PostgreSQL remains the source of truth.
    try {
      this.realtime.incidentLocationUpdated({
        incidentId: dto.incidentId,
        lat: dto.latitude,
        lng: dto.longitude,
        ...(dto.accuracyMeters !== undefined ? { accuracy: dto.accuracyMeters } : {}),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for incident location: ${String(err)}`);
    }

    return location;
  }

  /**
   * MOD-12 reverse geocoding via the provider-agnostic {@link MapsService}. The
   * response keeps its snake_case wire shape for backward compatibility with the
   * mobile/frontend clients.
   */
  async reverseGeocode(lat: number, lng: number) {
    this.assertBocaueCoordinate(lat, lng);
    const result = await this.maps.reverseGeocode({ lat, lng });
    return {
      formatted_address: result.formattedAddress,
      barangay: result.barangay,
      municipality: result.municipality,
      province: result.province,
      ...(result.raw !== undefined ? { raw: result.raw } : {}),
    };
  }

  /** Safe, non-secret map configuration for clients (MOD-22 / mobile map views). */
  getMapConfig() {
    return this.maps.clientConfig();
  }

  /**
   * Driving route + ETA between two points for the in-app route line (MOD-43).
   * ETA is always a labeled estimate; a routing failure returns nulls.
   */
  getRouteBetween(fromLat: number, fromLng: number, toLat: number, toLng: number) {
    this.assertBocaueCoordinate(fromLat, fromLng);
    this.assertBocaueCoordinate(toLat, toLng);
    return this.maps.route({ lat: fromLat, lng: fromLng }, { lat: toLat, lng: toLng });
  }

  async trackResponder(dto: TrackLocationDto, userId: string) {
    this.assertBocaueCoordinate(dto.latitude, dto.longitude);

    // Object-level auth: a responder may only publish a position into an incident
    // they are crewed on, otherwise they could inject a marker into any citizen's
    // incident room. This row is also the dispatch the fix belongs to (G8), so the
    // ETA job and the socket event are attributed to the pushing crew's unit.
    // `status desc` prefers ACCEPTED over PENDING/SENT (enum declaration order).
    const crewed = await this.prisma.dispatches.findFirst({
      where: {
        incident_id: dto.incidentId,
        dispatch_crew: { some: { user_id: userId } },
        status: { in: ['PENDING', 'SENT', 'ACCEPTED'] as any[] },
      },
      orderBy: { status: 'desc' },
      select: {
        id: true,
        resources: { select: { call_sign: true } },
        incidents: { select: { incident_locations: { select: { latitude: true, longitude: true } } } },
      },
    });
    if (!crewed) {
      throw new ForbiddenException('Not an active responder for this incident');
    }

    const record = await this.prisma.location_history.create({
      data: {
        incident_id: dto.incidentId,
        user_id: userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy_meters: dto.accuracyMeters ?? null,
        speed_kmh: dto.speedKmh ?? null,
        heading_degrees: dto.headingDegrees ?? null,
      },
    });
    this.logger.log(`Responder ${userId} location tracked for incident ${dto.incidentId}`);

    try {
      // Reaches the reporter too: call sign only, never the responder's name/phone.
      this.realtime.notifyResponderLocationUpdated(dto.incidentId, {
        responderId: userId,
        dispatchId: crewed.id,
        callSign: crewed.resources?.call_sign ?? null,
        lat: dto.latitude,
        lng: dto.longitude,
        heading: dto.headingDegrees ?? null,
        speed: dto.speedKmh ?? null,
        updatedAt: record.recorded_at.toISOString(),
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for location update: ${String(err)}`);
    }

    // Enqueue ETA recalculation; failure must never affect location tracking.
    // Throttled per dispatch: a 5 s GPS stream triggers at most one routing call
    // per ETA_REFRESH_THROTTLE_MS. The processor reads the freshest crew fix at
    // run time, so a throttled job never routes from a stale point.
    const incidentLoc = crewed.incidents?.incident_locations;
    if (incidentLoc) {
      try {
        await this.locationProcessingQueue.add(
          'eta-refresh',
          {
            dispatchId: crewed.id,
            incidentId: dto.incidentId,
            responderLat: dto.latitude,
            responderLng: dto.longitude,
            incidentLat: Number(incidentLoc.latitude),
            incidentLng: Number(incidentLoc.longitude),
          },
          {
            // BullMQ forbids ':' in custom ids.
            deduplication: { id: `eta-${crewed.id}`, ttl: ETA_REFRESH_THROTTLE_MS },
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      } catch (err) {
        this.logger.warn(`ETA job enqueue failed for incident ${dto.incidentId}: ${String(err)}`);
      }
    }

    return record;
  }

  /**
   * Latest position + estimated ETA of every unit actively responding to an
   * incident (G1). Lets a citizen's tracking screen show the ambulance as soon
   * as it opens, then patch from the socket.
   *
   * Authorized for staff, the reporter and crew via the same participant rule as
   * the WebSocket room join. The response is safe for the reporter: unit call
   * sign / name and type only, never a responder's name or phone (Rule 15).
   * Crew phones on one unit collapse into one entry per dispatch (freshest fix).
   */
  async getLatestUnitPositions(incidentId: string, actor: ParticipantActor): Promise<LatestUnitPosition[]> {
    await this.participants.assertParticipant(actor, incidentId);

    const dispatches = await this.prisma.dispatches.findMany({
      where: {
        incident_id: incidentId,
        status: 'ACCEPTED',
        incidents: { status: { in: [...ACTIVE_RESPONSE_INCIDENT_STATUSES] as any[] } },
      },
      orderBy: { accepted_at: 'asc' },
      select: {
        id: true,
        resources: { select: { name: true, call_sign: true, resource_type: true } },
        dispatch_crew: { select: { user_id: true } },
        incidents: { select: { incident_locations: { select: { latitude: true, longitude: true } } } },
      },
    });
    if (dispatches.length === 0) return [];

    const crewIds = [...new Set(dispatches.flatMap((d) => d.dispatch_crew.map((c) => c.user_id)))];
    const fixes = crewIds.length
      ? await this.prisma.location_history.findMany({
          where: { incident_id: incidentId, user_id: { in: crewIds } },
          orderBy: { recorded_at: 'desc' },
          distinct: ['user_id'],
          select: FIX_SELECT,
        })
      : [];

    return Promise.all(
      dispatches.map(async (d): Promise<LatestUnitPosition> => {
        const fix = freshestFixFor(fixes, incidentId, d.dispatch_crew.map((c) => c.user_id));
        const incidentLoc = d.incidents?.incident_locations;
        return {
          dispatchId: d.id,
          callSign: d.resources?.call_sign ?? null,
          unitName: d.resources?.name ?? null,
          resourceType: d.resources?.resource_type != null ? String(d.resources.resource_type) : null,
          position: fix
            ? {
                lat: Number(fix.latitude),
                lng: Number(fix.longitude),
                heading: fix.heading_degrees != null ? Number(fix.heading_degrees) : null,
                speedKmh: fix.speed_kmh != null ? Number(fix.speed_kmh) : null,
                updatedAt: fix.recorded_at.toISOString(),
              }
            : null,
          eta: fix && incidentLoc
            ? await this.estimateEta(
                { lat: Number(fix.latitude), lng: Number(fix.longitude) },
                { lat: Number(incidentLoc.latitude), lng: Number(incidentLoc.longitude) },
              )
            : { seconds: null, isEstimate: true, calculatedAt: null },
        };
      }),
    );
  }

  /** Routed ETA; a routing failure yields null and never throws (Rule 13). */
  private async estimateEta(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<LatestUnitPosition['eta']> {
    try {
      const route = await this.maps.route(from, to);
      const seconds = route.durationSeconds ?? null;
      return { seconds, isEstimate: true, calculatedAt: seconds ? new Date().toISOString() : null };
    } catch (err) {
      this.logger.warn(`ETA estimate failed: ${String(err)}`);
      return { seconds: null, isEstimate: true, calculatedAt: null };
    }
  }

  async getLiveTracking(incidentId: string) {
    const history = await this.prisma.location_history.findMany({
      where: { incident_id: incidentId },
      orderBy: { recorded_at: 'desc' },
      take: 200,
    });

    // Latest position per resource/user.
    const latest = new Map<string, (typeof history)[number]>();
    for (const row of history) {
      const key = row.resource_id ?? row.user_id ?? row.id;
      if (!latest.has(key)) latest.set(key, row);
    }
    return Array.from(latest.values());
  }

  async getEta(incidentId: string, actor: ParticipantActor) {
    // Same rule as the live positions: staff, the reporter or assigned crew.
    await this.participants.assertParticipant(actor, incidentId);
    try {
      const incidentLoc = await this.prisma.incident_locations.findFirst({
        where: { incident_id: incidentId },
        orderBy: { captured_at: 'desc' },
      });
      if (!incidentLoc) {
        return { eta_seconds: null, is_estimate: true, reason: 'No incident location' };
      }

      const dispatch = await this.prisma.dispatches.findFirst({
        where: { incident_id: incidentId, status: { in: ['PENDING', 'SENT', 'ACCEPTED'] } },
        include: { resources: true },
      });
      if (!dispatch) {
        return { eta_seconds: null, is_estimate: true, reason: 'No active dispatch' };
      }

      const responderLoc = await this.prisma.location_history.findFirst({
        where: { incident_id: incidentId },
        orderBy: { recorded_at: 'desc' },
      });
      if (!responderLoc) {
        return { eta_seconds: null, is_estimate: true, reason: 'No responder location' };
      }

      const route = await this.maps.route(
        { lat: Number(responderLoc.latitude), lng: Number(responderLoc.longitude) },
        { lat: Number(incidentLoc.latitude), lng: Number(incidentLoc.longitude) },
      );
      if (!route.durationSeconds) {
        return { eta_seconds: null, is_estimate: true };
      }

      const etaSeconds = route.durationSeconds;
      return {
        eta_seconds: etaSeconds,
        is_estimate: true,
        estimated_arrival: new Date(Date.now() + etaSeconds * 1000).toISOString(),
      };
    } catch (err) {
      this.logger.warn(`ETA calculation failed for incident ${incidentId}: ${String(err)}`);
      return { eta_seconds: null, is_estimate: true };
    }
  }

  async getResponderPositions(incidentId: string) {
    const history = await this.prisma.location_history.findMany({
      where: { incident_id: incidentId, user_id: { not: null } },
      orderBy: { recorded_at: 'desc' },
      take: 200,
    });
    const latest = new Map<string, (typeof history)[number]>();
    for (const row of history) {
      if (row.user_id && !latest.has(row.user_id)) latest.set(row.user_id, row);
    }
    return Array.from(latest.values());
  }

  /**
   * Ops map feed (MOD-22, G3): one entry per unit on an active mission, i.e. an
   * ACCEPTED dispatch whose incident is still in ACTIVE_RESPONSE_INCIDENT_STATUSES.
   * Units drop off as soon as the mission ends. Crew phones on one unit collapse
   * into one marker per dispatch (freshest fix). A 4 h lookback bounds the scan.
   * Staff-only endpoint, so crew names are included here.
   */
  async getAllResponderPositions(): Promise<OpsResponderPosition[]> {
    const dispatches = await this.prisma.dispatches.findMany({
      where: {
        status: 'ACCEPTED',
        incidents: { status: { in: [...ACTIVE_RESPONSE_INCIDENT_STATUSES] as any[] } },
      },
      select: {
        id: true,
        incident_id: true,
        incidents: { select: { status: true } },
        resources: { select: { name: true, call_sign: true, resource_type: true } },
        dispatch_crew: { select: { user_id: true, users: { select: { full_name: true } } } },
      },
    });
    const crewed = dispatches.filter((d) => d.dispatch_crew.length > 0);
    if (crewed.length === 0) return [];

    const since = new Date(Date.now() - OPS_FEED_LOOKBACK_MS);
    const fixes = await this.prisma.location_history.findMany({
      where: {
        recorded_at: { gte: since },
        OR: crewed.map((d) => ({
          incident_id: d.incident_id,
          user_id: { in: d.dispatch_crew.map((c) => c.user_id) },
        })),
      },
      orderBy: { recorded_at: 'desc' },
      distinct: ['incident_id', 'user_id'],
      select: FIX_SELECT,
    });

    const positions: OpsResponderPosition[] = [];
    for (const d of crewed) {
      const fix = freshestFixFor(fixes, d.incident_id, d.dispatch_crew.map((c) => c.user_id));
      if (!fix?.user_id) continue; // accepted but no GPS fix yet: nothing to draw
      const crewMember = d.dispatch_crew.find((c) => c.user_id === fix.user_id);
      positions.push({
        responderId: fix.user_id,
        responder_name: crewMember?.users?.full_name ?? null,
        dispatchId: d.id,
        incident_id: d.incident_id,
        incident_status: String(d.incidents.status),
        resource_name: d.resources?.name ?? null,
        call_sign: d.resources?.call_sign ?? null,
        resource_type: d.resources?.resource_type != null ? String(d.resources.resource_type) : null,
        lat: Number(fix.latitude),
        lng: Number(fix.longitude),
        heading: fix.heading_degrees != null ? Number(fix.heading_degrees) : null,
        speed: fix.speed_kmh != null ? Number(fix.speed_kmh) : null,
        updated_at: fix.recorded_at.toISOString(),
      });
    }
    return positions;
  }

  async getResourceHistory(resourceId: string) {
    return this.prisma.location_history.findMany({
      where: { resource_id: resourceId },
      orderBy: { recorded_at: 'desc' },
      take: 200,
    });
  }
}
