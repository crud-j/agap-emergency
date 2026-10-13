import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CaptureLocationDto } from './dto/capture-location.dto';
import { TrackLocationDto } from './dto/track-location.dto';
import { MapsService } from './maps/maps.service';
import { isCoordinateInBocaue, QUEUE_NAMES } from '@agap/shared';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly maps: MapsService,
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
      this.realtime.notifyResponderLocationUpdated(dto.incidentId, {
        responderId: userId,
        lat: dto.latitude,
        lng: dto.longitude,
        heading: dto.headingDegrees ?? null,
        speed: dto.speedKmh ?? null,
        updatedAt: record.recorded_at.toISOString(),
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for location update: ${String(err)}`);
    }

    // Enqueue ETA recalculation — failure must never affect location tracking
    try {
      const activeDispatch = await this.prisma.dispatches.findFirst({
        where: {
          incident_id: dto.incidentId,
          status: { notIn: ['CANCELLED', 'COMPLETED'] as any[] },
        },
        include: { incidents: { include: { incident_locations: true } } },
      });
      const incidentLoc = activeDispatch?.incidents?.incident_locations;
      if (activeDispatch && incidentLoc) {
        await this.locationProcessingQueue.add('eta-refresh', {
          dispatchId: activeDispatch.id,
          incidentId: activeDispatch.incident_id,
          responderLat: dto.latitude,
          responderLng: dto.longitude,
          incidentLat: Number(incidentLoc.latitude),
          incidentLng: Number(incidentLoc.longitude),
        });
      }
    } catch (err) {
      this.logger.warn(`ETA job enqueue failed for incident ${dto.incidentId}: ${String(err)}`);
    }

    return record;
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

  async getEta(incidentId: string) {
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
   * Latest recorded position for every responder active within the last 4 hours.
   * Used by the ops map (MOD-22) to show all live responder dots without needing
   * a specific incident ID. Returns the same shape as getResponderPositions.
   */
  async getAllResponderPositions() {
    const since = new Date(Date.now() - 4 * 3_600_000);
    const history = await this.prisma.location_history.findMany({
      where: { user_id: { not: null }, recorded_at: { gte: since } },
      orderBy: { recorded_at: 'desc' },
      take: 500,
      include: { users: { select: { full_name: true } } },
    });
    const latest = new Map<string, (typeof history)[number]>();
    for (const row of history) {
      if (row.user_id && !latest.has(row.user_id)) latest.set(row.user_id, row);
    }
    return Array.from(latest.values()).map((row) => ({
      responderId: row.user_id,
      responder_name: row.users?.full_name ?? null,
      resource_name: null,
      lat: Number(row.latitude),
      lng: Number(row.longitude),
      heading: row.heading_degrees != null ? Number(row.heading_degrees) : null,
      speed: row.speed_kmh != null ? Number(row.speed_kmh) : null,
      status: 'active',
      incident_id: row.incident_id,
      updated_at: row.recorded_at.toISOString(),
    }));
  }

  async getResourceHistory(resourceId: string) {
    return this.prisma.location_history.findMany({
      where: { resource_id: resourceId },
      orderBy: { recorded_at: 'desc' },
      take: 200,
    });
  }
}
