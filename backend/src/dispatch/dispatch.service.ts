import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { SubmitTriageDto } from './dto/submit-triage.dto';
import { IncidentStatus } from '@agap/shared';
import { Prisma } from '@prisma/client';

const DISPATCHABLE_STATUSES = ['ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING'];

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    return dispatch;
  }

  async cancel(id: string, _userId: string) {
    const dispatch = await this.findById(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dispatches.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
      await tx.resources.update({
        where: { id: dispatch.resource_id },
        data: { status: 'AVAILABLE', current_incident_id: null },
      });
      return updated;
    });
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
}
