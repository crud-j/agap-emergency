import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CaptureLocationDto } from './dto/capture-location.dto';
import { TrackLocationDto } from './dto/track-location.dto';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  async reverseGeocode(_lat: number, _lng: number) {
    // Placeholder — real map-provider integration is a later step.
    return {
      formatted_address: 'Bocaue, Bulacan',
      barangay: null,
      municipality: 'Bocaue',
      province: 'Bulacan',
    };
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
    const exists = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!exists) throw new BadRequestException('Incident not found');
    return {
      eta_seconds: null,
      is_estimate: true,
      message: 'ETA calculation requires active dispatch',
    };
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
