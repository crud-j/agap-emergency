import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { IncidentStatusService } from '../incident-status/incident-status.service';
import { AuditAction, IncidentStatus, UserRole } from '@agap/shared';
import { OrgActor, activeMemberOrgIds } from '../../organizations/org-scope';
import { DestinationWarning, assertSelectableDestination } from '../../hospitals/destination-rules';
import { toFacilityView } from '../../hospitals/facility-view';
import { openTransportWhere } from './open-transport';
import { StartTransportDto } from './dto/start-transport.dto';
import { RecordArrivalDto } from './dto/record-arrival.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';

/**
 * MOD-40 — Transport and Destination Tracking.
 * Manages TransportRecord lifecycle: start → en-route → facility arrival → handover.
 * Emits `incident.transporting` on start and `incident.facility_arrival` on arrival.
 * Starting a transport on an ON_SCENE incident moves it to TRANSPORTING in the same
 * transaction as the record and its audit row; realtime events follow the commit.
 */
@Injectable()
export class TransportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly statusService: IncidentStatusService,
  ) {}

  /** Hospital users see only transports bound for their own organization's facilities (contains patient names). */
  async listTransports(incidentId: string, actor: OrgActor) {
    await this.requireIncident(incidentId);
    const ownOrgs = actor.role === UserRole.HOSPITAL_USER ? await activeMemberOrgIds(this.prisma, actor.id) : null;
    const records = await this.prisma.transportRecord.findMany({
      where: {
        incident_id: incidentId,
        ...(ownOrgs && { facilities: { organization_id: { in: ownOrgs } } }),
      },
      orderBy: { created_at: 'desc' },
      include: {
        facilities: {
          select: {
            id: true, name: true, facility_type: true, address: true,
            latitude: true, longitude: true, location_status: true, receiving_status: true,
          },
        },
        incident_patients: { select: { id: true, patient_name: true, is_unknown: true } },
      },
    });
    if (ownOrgs && records.length === 0) {
      throw new ForbiddenException('No transport on this incident is bound for your hospital.');
    }
    return records.map((record) => ({
      ...record,
      facilities: record.facilities ? toFacilityView(record.facilities) : null,
    }));
  }

  async startTransport(incidentId: string, dto: StartTransportDto, userId: string, role?: string) {
    const incident = await this.requireIncident(incidentId);
    const previousStatus = incident.status as unknown as IncidentStatus;

    // ON_SCENE moves to TRANSPORTING; TRANSPORTING means another unit or patient.
    // Anything else (EN_ROUTE, ASSISTING, RESOLVED, …) cannot start a transport.
    if (previousStatus !== IncidentStatus.ON_SCENE && previousStatus !== IncidentStatus.TRANSPORTING) {
      throw new ConflictException({
        code: 'TRANSPORT_NOT_ALLOWED_IN_STATUS',
        status: previousStatus,
        message: `A transport can start only when the incident is ON_SCENE or TRANSPORTING (it is ${previousStatus}).`,
      });
    }

    // Verify dispatch belongs to this incident
    const dispatch = await this.prisma.dispatches.findUnique({ where: { id: dto.dispatchId } });
    if (!dispatch || dispatch.incident_id !== incidentId) {
      throw new BadRequestException('Dispatch not found or does not belong to this incident');
    }
    await this.assertCrew(dto.dispatchId, userId, role);

    const openTransport = await this.prisma.transportRecord.findFirst({
      where: openTransportWhere({ dispatch_id: dto.dispatchId }),
    });
    if (openTransport) {
      throw new ConflictException('This dispatch already has an open transport record.');
    }

    const destination = dto.destinationId
      ? await assertSelectableDestination(this.prisma, dto.destinationId)
      : null;
    const warnings: DestinationWarning[] = destination?.warnings ?? [];
    const transitions = previousStatus === IncidentStatus.ON_SCENE;

    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.transportRecord.create({
        data: {
          incident_id: incidentId,
          dispatch_id: dto.dispatchId,
          patient_id: dto.patientId ?? null,
          destination_id: dto.destinationId ?? null,
          transport_started_at: new Date(),
          estimated_arrival_at: dto.estimatedArrivalAt ? new Date(dto.estimatedArrivalAt) : null,
        },
      });
      if (transitions) {
        await this.statusService.recordTransition(tx, {
          incidentId,
          from: previousStatus,
          to: IncidentStatus.TRANSPORTING,
          actorId: userId,
          ...(role && { actorRole: role }),
          notes: 'Transport started',
        });
      }
      await this.audit.logInTransaction(tx, {
        action: AuditAction.STATUS_CHANGE,
        actorId: userId,
        ...(role && { actorRole: role }),
        entityType: 'transport_record',
        entityId: created.id,
        moduleId: 'MOD-40',
        incidentId,
        newValues: {
          dispatch_id: dto.dispatchId,
          destination_id: dto.destinationId ?? null,
          transport_started_at: created.transport_started_at?.toISOString(),
          ...(warnings.length > 0 && { warnings }),
        },
      });
      return created;
    });

    // persist → commit → emit (best-effort).
    if (transitions) {
      this.realtime.statusChanged({
        incidentId,
        previousStatus,
        newStatus: IncidentStatus.TRANSPORTING,
        changedAt: new Date().toISOString(),
        changedBy: userId,
        reason: 'Transport started',
      });
    }
    this.realtime.incidentTransporting({
      incidentId,
      transportId: record.id,
      dispatchId: dto.dispatchId,
      destinationId: dto.destinationId ?? null,
      destinationName: destination?.name ?? null,
      patientId: dto.patientId ?? null,
      transportStartedAt: record.transport_started_at!.toISOString(),
    });

    return { ...record, warnings };
  }

  async recordArrival(
    incidentId: string,
    transportId: string,
    dto: RecordArrivalDto,
    userId: string,
    role?: string,
  ) {
    const record = await this.prisma.transportRecord.findUnique({
      where: { id: transportId },
    });
    if (!record || record.incident_id !== incidentId) {
      throw new NotFoundException('Transport record not found for this incident');
    }
    await this.assertCrew(record.dispatch_id, userId, role);
    if (record.arrived_at) {
      throw new BadRequestException('Arrival already recorded for this transport');
    }
    if (dto.destinationId) {
      await assertSelectableDestination(this.prisma, dto.destinationId);
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
      dispatchId: record.dispatch_id,
      destinationId: updated.destination_id ?? null,
      arrivedAt: arrivedAt.toISOString(),
    });

    return updated;
  }

  async updateTransport(
    incidentId: string,
    transportId: string,
    dto: UpdateTransportDto,
    userId: string,
    role?: string,
  ) {
    const record = await this.prisma.transportRecord.findUnique({ where: { id: transportId } });
    if (!record || record.incident_id !== incidentId) {
      throw new NotFoundException('Transport record not found for this incident');
    }
    // A crew member sets the destination after "Decide later" or changes it en route;
    // once arrival is recorded the record is the dispatcher's to correct.
    await this.assertCrew(record.dispatch_id, userId, role);
    if (role === 'RESPONDER' && record.arrived_at) {
      throw new BadRequestException('Arrival is already recorded for this transport.');
    }

    if (dto.destinationId !== undefined) {
      await assertSelectableDestination(this.prisma, dto.destinationId);
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

  /** A Responder acts only on transports of a dispatch they are crewing. */
  private async assertCrew(dispatchId: string, userId: string, role?: string) {
    if (role !== 'RESPONDER') return;
    const crew = await this.prisma.dispatch_crew.findUnique({
      where: { dispatch_id_user_id: { dispatch_id: dispatchId, user_id: userId } },
    });
    if (!crew) throw new ForbiddenException('You are not on the crew for this dispatch.');
  }

  private async requireIncident(incidentId: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException('Incident not found');
    return incident;
  }
}
