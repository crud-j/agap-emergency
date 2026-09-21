import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateAssignmentStatusDto } from './dto/update-assignment-status.dto';
import { TrackLocationDto } from '../locations/dto/track-location.dto';
import { IncidentStatus } from '@agap/shared';

// Map a responder-reported assignment status to the incident lifecycle status.
const STATUS_TO_INCIDENT: Record<string, IncidentStatus | undefined> = {
  EN_ROUTE: IncidentStatus.EN_ROUTE,
  ON_SCENE: IncidentStatus.ON_SCENE,
  TRANSPORTING: IncidentStatus.TRANSPORTING,
  ASSISTING: IncidentStatus.ASSISTING,
};

@Injectable()
export class RespondersService {
  private readonly logger = new Logger(RespondersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(_filters: Record<string, unknown>) {
    return this.prisma.user.findMany({
      where: { role: 'RESPONDER' },
      select: { id: true, full_name: true, phone_number: true, status: true },
    });
  }

  async getMyAssignments(userId: string) {
    return this.prisma.dispatches.findMany({
      where: {
        dispatch_crew: { some: { user_id: userId } },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      include: { incidents: true, resources: true },
      orderBy: { created_at: 'desc' },
    });
  }

  async getAssignment(dispatchId: string) {
    const dispatch = await this.prisma.dispatches.findUnique({
      where: { id: dispatchId },
      include: { incidents: true, resources: true, dispatch_crew: true },
    });
    if (!dispatch) throw new NotFoundException('Assignment not found');
    return dispatch;
  }

  async acceptAssignment(dispatchId: string, userId: string) {
    await this.assertCrewMember(dispatchId, userId);
    return this.prisma.dispatches.update({
      where: { id: dispatchId },
      data: { status: 'ACCEPTED', accepted_at: new Date() },
    });
  }

  async declineAssignment(dispatchId: string, userId: string, reason: string) {
    await this.assertCrewMember(dispatchId, userId);
    return this.prisma.dispatches.update({
      where: { id: dispatchId },
      data: { status: 'REJECTED', rejected_at: new Date(), rejected_reason: reason },
    });
  }

  async updateStatus(dispatchId: string, userId: string, dto: UpdateAssignmentStatusDto) {
    const dispatch = await this.assertCrewMember(dispatchId, userId);
    const incidentStatus = STATUS_TO_INCIDENT[dto.status];

    if (incidentStatus) {
      const incident = await this.prisma.incident.findUnique({
        where: { id: dispatch.incident_id },
      });
      await this.prisma.$transaction([
        this.prisma.incident.update({
          where: { id: dispatch.incident_id },
          data: {
            status: incidentStatus as any,
            ...(incidentStatus === IncidentStatus.EN_ROUTE && { en_route_at: new Date() }),
            ...(incidentStatus === IncidentStatus.ON_SCENE && { on_scene_at: new Date() }),
          },
        }),
        this.prisma.incidentEvent.create({
          data: {
            incident_id: dispatch.incident_id,
            from_status: (incident?.status ?? null) as any,
            to_status: incidentStatus as any,
            triggered_by_id: userId,
            triggered_by_role: 'RESPONDER',
            notes: dto.notes ?? null,
          },
        }),
      ]);
    }

    return { dispatchId, status: dto.status };
  }

  async pushLocation(dto: TrackLocationDto, userId: string) {
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
    this.logger.log(`Responder ${userId} pushed location for incident ${dto.incidentId}`);
    return record;
  }

  private async assertCrewMember(dispatchId: string, userId: string) {
    const dispatch = await this.prisma.dispatches.findUnique({
      where: { id: dispatchId },
      include: { dispatch_crew: true },
    });
    if (!dispatch) throw new NotFoundException('Assignment not found');
    const isCrew = dispatch.dispatch_crew.some((c) => c.user_id === userId);
    if (!isCrew) {
      throw new ForbiddenException('You are not assigned to this dispatch');
    }
    return dispatch;
  }
}
