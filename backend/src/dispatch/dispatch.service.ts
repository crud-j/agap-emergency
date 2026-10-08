import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { SubmitTriageDto } from './dto/submit-triage.dto';
import { IncidentStatus, QUEUE_NAMES } from '@agap/shared';
import { Prisma } from '@prisma/client';

const DISPATCHABLE_STATUSES = ['ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING'];

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationQueue: Queue,
  ) {}

  async findAll(filters: { incidentId?: string; status?: string }) {
    const where: Prisma.dispatchesWhereInput = {};
    if (filters.incidentId) where.incident_id = filters.incidentId;
    if (filters.status) where.status = filters.status as any;
    return this.prisma.dispatches.findMany({
      where,
      include: { incidents: true, resources: true, dispatch_crew: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async findById(id: string) {
    const dispatch = await this.prisma.dispatches.findUnique({
      where: { id },
      include: { dispatch_crew: true, incidents: true, resources: true },
    });
    if (!dispatch) throw new NotFoundException('Dispatch not found');
    return dispatch;
  }

  /**
   * Authorize and create a dispatch. Dispatch is never autonomous — the
   * authenticated dispatcher's identity is attached to the record.
   */
  async create(dto: CreateDispatchDto, dispatcherId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: dto.incidentId },
      include: { incident_reporters: true },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    if (!DISPATCHABLE_STATUSES.includes(incident.status)) {
      throw new BadRequestException(
        `Incident status ${incident.status} is not dispatchable`,
      );
    }

    const resource = await this.prisma.resources.findUnique({
      where: { id: dto.resourceId },
    });
    if (!resource) throw new NotFoundException('Resource not found');
    if (resource.status !== 'AVAILABLE') {
      throw new BadRequestException('Resource is not available');
    }

    const dispatch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.dispatches.create({
        data: {
          incident_id: dto.incidentId,
          resource_id: dto.resourceId,
          dispatcher_id: dispatcherId,
          organization_id: resource.organization_id,
          status: 'PENDING',
          dispatch_notes: dto.dispatchNotes ?? null,
        },
      });

      if (dto.initialCrewIds?.length) {
        await tx.dispatch_crew.createMany({
          data: dto.initialCrewIds.map((uid) => ({
            dispatch_id: created.id,
            user_id: uid,
          })),
          skipDuplicates: true,
        });
      }

      await tx.resources.update({
        where: { id: dto.resourceId },
        data: { status: 'DISPATCHED', current_incident_id: dto.incidentId },
      });

      await tx.incident.update({
        where: { id: dto.incidentId },
        data: { status: IncidentStatus.DISPATCHED as any, dispatched_at: new Date() },
      });

      await tx.incidentEvent.create({
        data: {
          incident_id: dto.incidentId,
          from_status: incident.status as any,
          to_status: IncidentStatus.DISPATCHED as any,
          triggered_by_id: dispatcherId,
          triggered_by_role: 'DISPATCHER',
        },
      });

      return created;
    });

    this.logger.log(`Dispatch ${dispatch.id} created by ${dispatcherId}`);

    // persist → commit → emit (best-effort). The incident was transitioned to
    // DISPATCHED inside the transaction above, so fan out: the assignment, the
    // status change (which also carries the dedicated incident.dispatched
    // milestone), and the dispatch record. A WS failure never affects dispatch.
    try {
      const assignedAt = (dispatch.created_at ?? new Date()).toISOString();
      this.realtime.incidentAssigned({
        incidentId: dispatch.incident_id,
        assignmentId: dispatch.id,
        responderId: dto.initialCrewIds?.[0] ?? '',
        responseUnitId: dispatch.resource_id,
        assignedAt,
      });
      this.realtime.notifyIncidentStatusChanged({
        incidentId: dispatch.incident_id,
        previousStatus: incident.status as unknown as IncidentStatus,
        newStatus: IncidentStatus.DISPATCHED,
        changedAt: assignedAt,
        changedBy: dispatcherId,
      });
      this.realtime.notifyDispatchCreated(dispatch.incident_id, {
        dispatchId: dispatch.id,
        resourceId: dispatch.resource_id,
        status: dispatch.status,
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for dispatch create: ${String(err)}`);
    }

    const reporterUserId = incident.incident_reporters?.user_id;
    try {
      if (reporterUserId) {
        await this.notificationQueue.add('dispatch-created-push', {
          userId: reporterUserId,
          channel: 'PUSH',
          title: 'Help is on the way',
          body: `Responders have been dispatched. Ref: ${incident.public_reference}`,
          data: { incidentId: incident.id, type: 'DISPATCH_CREATED' },
        });
        await this.notificationQueue.add('dispatch-contact-notify', {
          userId: reporterUserId,
          channel: 'EMERGENCY_CONTACTS',
          body: `AGAP: Emergency responders dispatched for ${incident.public_reference}. Help is on the way.`,
        });
      }
    } catch (err) {
      this.logger.error(`Dispatch notification failed: ${String(err)}. Dispatch unaffected.`);
    }

    return dispatch;
  }

  async cancel(id: string, _userId: string) {
    const dispatch = await this.findById(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.dispatches.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
      await tx.resources.update({
        where: { id: dispatch.resource_id },
        data: { status: 'AVAILABLE', current_incident_id: null },
      });
      return result;
    });

    try {
      this.realtime.notifyDispatchCancelled(dispatch.incident_id, {
        dispatchId: id,
        resourceId: dispatch.resource_id,
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for dispatch cancel: ${String(err)}`);
    }

    return updated;
  }

  async reassign(id: string, newResourceId: string, userId: string) {
    const dispatch = await this.findById(id);
    await this.cancel(id, userId);
    return this.create(
      {
        incidentId: dispatch.incident_id,
        resourceId: newResourceId,
        ...(dispatch.dispatch_notes ? { dispatchNotes: dispatch.dispatch_notes } : {}),
      },
      userId,
    );
  }

  async addCrew(dispatchId: string, userId: string) {
    await this.findById(dispatchId);
    return this.prisma.dispatch_crew.create({
      data: { dispatch_id: dispatchId, user_id: userId },
    });
  }

  async removeCrew(dispatchId: string, crewUserId: string) {
    await this.prisma.dispatch_crew.deleteMany({
      where: { dispatch_id: dispatchId, user_id: crewUserId },
    });
  }

  async getPriorityRecommendation(incidentId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return {
      incidentId,
      currentPriority: incident.priority,
      recommendedPriority: incident.priority,
      note: 'Recommendation is assistive; dispatcher confirms the final priority',
    };
  }

  async submitTriage(dto: SubmitTriageDto, userId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: dto.incidentId },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    const updated = await this.prisma.incident.update({
      where: { id: dto.incidentId },
      data: { priority: dto.priorityAssessment as any },
    });

    await this.prisma.incidentEvent.create({
      data: {
        incident_id: dto.incidentId,
        from_status: incident.status as any,
        to_status: incident.status as any,
        triggered_by_id: userId,
        triggered_by_role: 'DISPATCHER',
        notes: `Triage: priority ${dto.priorityAssessment}. ${dto.notes ?? ''}`.trim(),
      },
    });

    // Priority is an incident-record change (not a lifecycle status change), so
    // broadcast incident.updated to refresh the ops queue chip live. Best-effort.
    try {
      this.realtime.incidentUpdated(dto.incidentId, {
        priority: updated.priority,
        reason: 'triage',
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for triage update: ${String(err)}`);
    }

    return updated;
  }

  async mergeDuplicates(incidentId: string, masterIncidentId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    const updated = await this.prisma.incident.update({
      where: { id: incidentId },
      data: { status: IncidentStatus.DUPLICATE as any },
    });

    await this.prisma.incidentEvent.create({
      data: {
        incident_id: incidentId,
        from_status: incident.status as any,
        to_status: IncidentStatus.DUPLICATE as any,
        notes: `Merged into master incident ${masterIncidentId}`,
      },
    });

    return updated;
  }

  // ---- Transport lifecycle (MOD-40) ----

  async startTransport(
    dispatchId: string,
    dto: { destinationId?: string; patientId?: string },
    _userId: string,
  ) {
    const dispatch = await this.findById(dispatchId);
    return this.prisma.transportRecord.create({
      data: {
        dispatch_id: dispatchId,
        incident_id: dispatch.incident_id,
        destination_id: dto.destinationId ?? null,
        patient_id: dto.patientId ?? null,
        transport_started_at: new Date(),
      },
    });
  }

  async getTransport(dispatchId: string) {
    const record = await this.prisma.transportRecord.findFirst({
      where: { dispatch_id: dispatchId },
      orderBy: { created_at: 'desc' },
    });
    if (!record) throw new NotFoundException('Transport record not found');
    return record;
  }

  async changeTransportDestination(
    dispatchId: string,
    dto: { destinationId: string; reason?: string },
    _userId: string,
  ) {
    const record = await this.getTransport(dispatchId);
    return this.prisma.transportRecord.update({
      where: { id: record.id },
      data: {
        destination_id: dto.destinationId,
        destination_changed: true,
        change_reason: dto.reason ?? null,
      },
    });
  }

  async markTransportArrived(dispatchId: string, _userId: string) {
    const record = await this.getTransport(dispatchId);
    return this.prisma.transportRecord.update({
      where: { id: record.id },
      data: { arrived_at: new Date() },
    });
  }

  async completePatientHandover(dispatchId: string, _userId: string) {
    const record = await this.getTransport(dispatchId);
    return this.prisma.transportRecord.update({
      where: { id: record.id },
      data: { handover_completed_at: new Date() },
    });
  }
}
