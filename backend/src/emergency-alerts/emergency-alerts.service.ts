import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SosAlertDto } from './dto/sos-alert.dto';
import { RealtimeService } from '../realtime/realtime.service';
import { IncidentStatus } from '@agap/shared';
import * as crypto from 'crypto';

@Injectable()
export class EmergencyAlertsService {
  private readonly logger = new Logger(EmergencyAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async createFromSos(
    dto: SosAlertDto,
    triggerMethod: 'SOS_BUTTON' | 'SHAKE_GESTURE',
    userId?: string,
  ) {
    const clientEventId = dto.clientEventId ?? crypto.randomUUID();

    // Idempotency: same client event id → same incident, never a duplicate.
    const existing = await this.prisma.incident.findFirst({
      where: { client_event_id: clientEventId },
      include: { incident_locations: true, incident_reporters: true },
    });
    if (existing) {
      this.logger.log(`Idempotent SOS for ${clientEventId}: ${existing.id}`);
      return { incident: existing, duplicate: true };
    }

    const reference = await this.generateReference();

    const incident = await this.prisma.$transaction(async (tx) => {
      const inc = await tx.incident.create({
        data: {
          public_reference: reference,
          category: dto.incidentType as any,
          status: IncidentStatus.SUBMITTED as any,
          trigger_method: triggerMethod as any,
          client_event_id: clientEventId,
          description: dto.description ?? null,
          number_of_patients: dto.numberOfPatients ?? 1,
          ...(dto.consciousnessState && {
            consciousness_state: dto.consciousnessState as any,
          }),
          ...(dto.breathingStatus && { breathing_status: dto.breathingStatus as any }),
        },
      });

      await tx.incidentReporter.create({
        data: {
          incident_id: inc.id,
          user_id: userId ?? null,
          is_guest: !userId,
          reporter_name: dto.reporterName ?? null,
          reporter_phone: dto.reporterPhone ?? null,
        },
      });

      await tx.incident_patients.create({
        data: {
          incident_id: inc.id,
          is_reporter: dto.patientIsReporter ?? false,
          is_unknown: dto.patientIsUnknown ?? true,
          patient_name: dto.patientName ?? null,
        },
      });

      if (dto.latitude !== undefined && dto.longitude !== undefined) {
        await tx.incident_locations.create({
          data: {
            incident_id: inc.id,
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracy_meters: dto.accuracyMeters ?? null,
          },
        });
      }

      await tx.alert_triggers.create({
        data: {
          incident_id: inc.id,
          user_id: userId ?? null,
          trigger_method: triggerMethod as any,
          client_event_id: clientEventId,
          latitude: dto.latitude ?? null,
          longitude: dto.longitude ?? null,
          accuracy_meters: dto.accuracyMeters ?? null,
          cancel_deadline_at: new Date(Date.now() + 15_000),
        },
      });

      await tx.incidentEvent.create({
        data: {
          incident_id: inc.id,
          to_status: IncidentStatus.SUBMITTED as any,
          triggered_by_id: userId ?? null,
        },
      });

      return inc;
    });

    // Realtime is best-effort; failure must never affect the persisted incident.
    try {
      this.realtime.notifyIncidentCreated({
        incidentId: incident.id,
        type: incident.category as any,
        priority: incident.priority as any,
        status: incident.status as any,
        location:
          dto.latitude !== undefined && dto.longitude !== undefined
            ? { lat: dto.latitude, lng: dto.longitude }
            : null,
        reportedAt: incident.created_at.toISOString(),
      });
    } catch (err) {
      this.logger.error(`Realtime notify failed for ${incident.id}: ${String(err)}`);
    }

    this.logger.log(`SOS incident created: ${incident.public_reference}`);
    return { incident, duplicate: false };
  }

  async cancel(incidentId: string, _userId?: string) {
    const trigger = await this.prisma.alert_triggers.findFirst({
      where: { incident_id: incidentId },
      orderBy: { triggered_at: 'desc' },
    });
    if (!trigger) throw new NotFoundException('No alert trigger found for incident');

    if (trigger.cancel_deadline_at && trigger.cancel_deadline_at < new Date()) {
      throw new BadRequestException('Cancellation window has expired');
    }

    const [, incident] = await this.prisma.$transaction([
      this.prisma.alert_triggers.update({
        where: { id: trigger.id },
        data: {
          was_cancelled: true,
          cancelled_at: new Date(),
          cancellation_reason: 'ACCIDENTAL_TRIGGER',
        },
      }),
      this.prisma.incident.update({
        where: { id: incidentId },
        data: { status: IncidentStatus.CANCELLED as any },
      }),
    ]);

    await this.prisma.incidentEvent.create({
      data: {
        incident_id: incidentId,
        to_status: IncidentStatus.CANCELLED as any,
        notes: 'Cancelled by reporter within grace window',
      },
    });

    return incident;
  }

  async getStatus(incidentId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: { incident_locations: true, incident_reporters: true },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }

  private async generateReference(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INC-${year}-`;
    const count = await this.prisma.incident.count({
      where: { public_reference: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(6, '0')}`;
  }
}
