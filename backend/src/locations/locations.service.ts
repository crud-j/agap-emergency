import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CaptureLocationDto } from './dto/capture-location.dto';
import { TrackLocationDto } from './dto/track-location.dto';
import { QUEUE_NAMES } from '@agap/shared';
import axios from 'axios';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.LOCATION_PROCESSING) private readonly locationProcessingQueue: Queue,
  ) {}

  async capture(dto: CaptureLocationDto, _userId?: string) {
    if (!dto.incidentId) {
      // Standalone capture without an incident: echo back the point.
      return {
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyMeters: dto.accuracyMeters ?? null,
      };
    }

    return this.prisma.incident_locations.upsert({
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
  }

  async reverseGeocode(lat: number, lng: number) {
    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: { lat, lon: lng, format: 'json', 'accept-language': 'en', zoom: 18 },
        headers: { 'User-Agent': 'AGAP Emergency System (agap@bocaue.gov.ph)' },
        timeout: 5000,
      });
      const addr = response.data?.address ?? {};
      const parts = [
        addr.village ?? addr.suburb ?? addr.neighbourhood ?? addr.hamlet,
        addr.town ?? addr.city ?? addr.municipality ?? 'Bocaue',
        addr.state ?? 'Bulacan',
      ].filter(Boolean);
      return {
        formatted_address: parts.join(', ') || null,
        barangay: addr.village ?? addr.suburb ?? addr.neighbourhood ?? null,
        municipality: addr.town ?? addr.city ?? 'Bocaue',
        province: addr.state ?? 'Bulacan',
        raw: response.data,
      };
    } catch (err) {
      this.logger.warn(`Geocoding failed for ${lat},${lng}: ${String(err)}`);
      return { formatted_address: null, barangay: null, municipality: 'Bocaue', province: 'Bulacan' };
    }
  }

  async trackResponder(dto: TrackLocationDto, userId: string) {
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

      const routingBase =
        this.config.get<string>('MAP_PROVIDER_ROUTING_URL') ?? 'http://router.project-osrm.org';
      const srcLng = Number(responderLoc.longitude);
      const srcLat = Number(responderLoc.latitude);
      const dstLng = Number(incidentLoc.longitude);
      const dstLat = Number(incidentLoc.latitude);
      const url = `${routingBase}/route/v1/driving/${srcLng},${srcLat};${dstLng},${dstLat}?overview=false`;

      const response = await axios.get(url, { timeout: 5000 });
      const duration = response.data?.routes?.[0]?.duration as number | undefined;
      if (!duration) {
        return { eta_seconds: null, is_estimate: true };
      }

      const etaSeconds = Math.round(duration);
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

  async getResourceHistory(resourceId: string) {
    return this.prisma.location_history.findMany({
      where: { resource_id: resourceId },
      orderBy: { recorded_at: 'desc' },
      take: 200,
    });
  }
}
