import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { IncidentStatusService } from '../incident-status/incident-status.service';
import { AuditAction, IncidentStatus } from '@agap/shared';
import { StartTransportDto } from './dto/start-transport.dto';
import { RecordArrivalDto } from './dto/record-arrival.dto';

/**
 * MOD-40 — Transport and Destination Tracking.
 * Manages TransportRecord lifecycle: start → en-route → facility arrival → handover.
 * Emits `incident.transporting` on start and `incident.facility_arrival` on arrival.
 * The incident status is transitioned to TRANSPORTING when transport begins.
 * Failures in audit/realtime never block the state change (PostgreSQL is truth).
 */
@Injectable()
export class TransportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly statusService: IncidentStatusService,
  ) {}

  async listTransports(incidentId: string) {
    await this.requireIncident(incidentId);
    return this.prisma.transportRecord.findMany({
      where: { incident_id: incidentId },
      orderBy: { created_at: 'desc' },
      include: {
        facilities: { select: { id: true, name: true, facility_type: true, address: true } },
        incident_patients: { select: { id: true, patient_name: true, is_unknown: true } },
      },
    });
  }

  async startTransport(incidentId: string, dto: StartTransportDto, userId: string) {
    const incident = await this.requireIncident(incidentId);

    // Verify dispatch belongs to this incident
    const dispatch = await this.prisma.dispatches.findUnique({ where: { id: dto.dispatchId } });
    if (!dispatch || dispatch.incident_id !== incidentId) {
      throw new BadRequestException('Dispatch not found or does not belong to this incident');
    }

    // Resolve destination facility name for the event payload
    let destinationName: string | null = null;
    if (dto.destinationId) {
      const facility = await this.prisma.facility.findUnique({
        where: { id: dto.destinationId },
        select: { name: true },
      });
      destinationName = facility?.name ?? null;
    }

    const record = await this.prisma.transportRecord.create({
      data: {
        incident_id: incidentId,
        dispatch_id: dto.dispatchId,
        patient_id: dto.patientId ?? null,
        destination_id: dto.destinationId ?? null,
        transport_started_at: new Date(),
        estimated_arrival_at: dto.estimatedArrivalAt ? new Date(dto.estimatedArrivalAt) : null,
      },
    });

    // Transition incident to TRANSPORTING if currently on-scene or assisting.
    // validateTransition guards against invalid moves; errors are intentionally
    // not caught here so the caller knows about invalid state combinations.
    const transitionable = [IncidentStatus.ON_SCENE, IncidentStatus.ASSISTING] as string[];
    if (transitionable.includes(incident.status)) {
      this.statusService.validateTransition(incident.status as IncidentStatus, IncidentStatus.TRANSPORTING);
      await this.prisma.incident.update({
        where: { id: incidentId },
        data: { status: IncidentStatus.TRANSPORTING },
      });
      this.realtime.statusChanged({
        incidentId,
        previousStatus: incident.status as IncidentStatus,
        newStatus: IncidentStatus.TRANSPORTING,
        changedAt: new Date().toISOString(),
        changedBy: userId,
        reason: 'Transport started',
      });
    }

    void this.audit.log({
      action: AuditAction.STATUS_CHANGE,
      actorId: userId,
      entityType: 'transport_record',
      entityId: record.id,
      moduleId: 'MOD-40',
      incidentId,
      newValues: {
        dispatch_id: dto.dispatchId,
        destination_id: dto.destinationId ?? null,
        transport_started_at: record.transport_started_at?.toISOString(),
      },
    });

    this.realtime.incidentTransporting({
      incidentId,
      transportId: record.id,
      dispatchId: dto.dispatchId,
      destinationId: dto.destinationId ?? null,
      destinationName,
      patientId: dto.patientId ?? null,
      transportStartedAt: record.transport_started_at!.toISOString(),
    });

    return record;
  }

  async recordArrival(
    incidentId: string,
    transportId: string,
    dto: RecordArrivalDto,
    userId: string,
  ) {
    const record = await this.prisma.transportRecord.findUnique({
      where: { id: transportId },
    });
    if (!record || record.incident_id !== incidentId) {
      throw new NotFoundException('Transport record not found for this incident');
    }
    if (record.arrived_at) {
      throw new BadRequestException('Arrival already recorded for this transport');
    }

    const arrivedAt = new Date();
    const updated = await this.prisma.transportRecord.update({
      where: { id: transportId },
      data: {
        arrived_at: arrivedAt,
        ...(dto.destinationId && {
          destination_id: dto.destinationId,
          destination_changed: dto.destinationId !== record.destination_id,
        }),
      },
    });

    void this.audit.log({
      action: AuditAction.STATUS_CHANGE,
      actorId: userId,
      entityType: 'transport_record',
      entityId: transportId,
      moduleId: 'MOD-40',
      incidentId,
      newValues: {
        arrived_at: arrivedAt.toISOString(),
        destination_id: updated.destination_id,
      },
    });

    this.realtime.facilityArrival({
      incidentId,
      transportId,
      destinationId: updated.destination_id ?? null,
      arrivedAt: arrivedAt.toISOString(),
    });

    return updated;
  }

  async updateTransport(
    incidentId: string,
    transportId: string,
    dto: { destinationId?: string; estimatedArrivalAt?: string; changeReason?: string },
    userId: string,
  ) {
    const record = await this.prisma.transportRecord.findUnique({ where: { id: transportId } });
    if (!record || record.incident_id !== incidentId) {
      throw new NotFoundException('Transport record not found for this incident');
    }

    const updated = await this.prisma.transportRecord.update({
      where: { id: transportId },
      data: {
        ...(dto.destinationId !== undefined && {
          destination_id: dto.destinationId,
          destination_changed: dto.destinationId !== record.destination_id,
          change_reason: dto.changeReason ?? null,
        }),
        ...(dto.estimatedArrivalAt && {
          estimated_arrival_at: new Date(dto.estimatedArrivalAt),
        }),
      },
    });

    void this.audit.log({
      action: AuditAction.UPDATE,
      actorId: userId,
      entityType: 'transport_record',
      entityId: transportId,
      moduleId: 'MOD-40',
      incidentId,
      oldValues: {
        destination_id: record.destination_id,
        estimated_arrival_at: record.estimated_arrival_at?.toISOString() ?? null,
      },
      newValues: dto as Record<string, unknown>,
    });

    this.realtime.incidentUpdated(incidentId, { transportUpdated: transportId });
    return updated;
  }

  private async requireIncident(incidentId: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }
}
