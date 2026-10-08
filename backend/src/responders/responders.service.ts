import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { UpdateAssignmentStatusDto } from './dto/update-assignment-status.dto';
import { TrackLocationDto } from '../locations/dto/track-location.dto';
import { IncidentStatus, ResponderStatus } from '@agap/shared';

// Map a responder-reported assignment status to the incident lifecycle status.
const STATUS_TO_INCIDENT: Record<string, IncidentStatus | undefined> = {
  EN_ROUTE: IncidentStatus.EN_ROUTE,
  ON_SCENE: IncidentStatus.ON_SCENE,
  TRANSPORTING: IncidentStatus.TRANSPORTING,
  ASSISTING: IncidentStatus.ASSISTING,
};

// The responder's own availability derived from the assignment status they
// report. Only statuses that are valid ResponderStatus values fan out
// responder.status_changed (TRANSPORTING/ASSISTING describe the incident, not
// the unit's availability).
const RESPONDER_STATUS_STEP: Record<
  string,
  { prev: ResponderStatus; next: ResponderStatus } | undefined
> = {
  EN_ROUTE: { prev: ResponderStatus.BUSY, next: ResponderStatus.EN_ROUTE },
  ON_SCENE: { prev: ResponderStatus.EN_ROUTE, next: ResponderStatus.ON_SCENE },
};

@Injectable()
export class RespondersService {
  private readonly logger = new Logger(RespondersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

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
      // Include the incident's location so the responder sees the citizen's
      // coordinates and address (MOD-13 / MOD-32).
      include: {
        incidents: { include: { incident_locations: true } },
        resources: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async getAssignment(dispatchId: string) {
    const dispatch = await this.prisma.dispatches.findUnique({
      where: { id: dispatchId },
      include: {
        incidents: { include: { incident_locations: true } },
        resources: true,
        dispatch_crew: true,
      },
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

      // Push the status change to the citizen's incident room in real time so
      // their status screen updates without waiting for a poll. Realtime failure
      // must never undo the persisted transition.
      try {
        this.realtime.notifyIncidentStatusChanged({
          incidentId: dispatch.incident_id,
          previousStatus: (incident?.status ?? null) as any,
          newStatus: incidentStatus as any,
          changedAt: new Date().toISOString(),
          changedBy: userId,
        });
      } catch (err) {
        this.logger.warn(`Realtime emit failed for status change: ${String(err)}`);
      }

      // The responder's own availability changed (en route / on scene) — surface
      // it to ops + the incident room so fleet/tracking views update live.
      const step = RESPONDER_STATUS_STEP[dto.status];
      if (step) {
        try {
          this.realtime.responderStatus(
            {
              responderId: userId,
              previousStatus: step.prev,
              newStatus: step.next,
              changedAt: new Date().toISOString(),
            },
            dispatch.incident_id,
          );
        } catch (err) {
          this.logger.warn(`Realtime emit failed for responder status change: ${String(err)}`);
        }
      }
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

    // Fan the live position to the incident room (citizen live-tracking map) and
    // ops. Best-effort — a dropped broadcast must never fail the location write.
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
      this.logger.warn(`Realtime emit failed for responder location: ${String(err)}`);
    }

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
