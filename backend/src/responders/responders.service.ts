import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { UpdateAssignmentStatusDto } from './dto/update-assignment-status.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { TrackLocationDto } from '../locations/dto/track-location.dto';
import { AuditAction, IncidentStatus, ResponderAvailability, ResponderStatus } from '@agap/shared';

// Maps a responder-reported assignment status to the incident lifecycle status.
const STATUS_TO_INCIDENT: Record<string, IncidentStatus | undefined> = {
  EN_ROUTE: IncidentStatus.EN_ROUTE,
  ON_SCENE: IncidentStatus.ON_SCENE,
  TRANSPORTING: IncidentStatus.TRANSPORTING,
  ASSISTING: IncidentStatus.ASSISTING,
};

const RESPONDER_STATUS_STEP: Record<
  string,
  { prev: ResponderStatus; next: ResponderStatus } | undefined
> = {
  EN_ROUTE: { prev: ResponderStatus.BUSY, next: ResponderStatus.EN_ROUTE },
  ON_SCENE: { prev: ResponderStatus.EN_ROUTE, next: ResponderStatus.ON_SCENE },
};

type AvailabilityRow = { user_id: string; status: string };

@Injectable()
export class RespondersService {
  private readonly logger = new Logger(RespondersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  async findAll(_filters: Record<string, unknown>) {
    const users = await this.prisma.user.findMany({
      where: { role: 'RESPONDER' },
      select: {
        id: true,
        full_name: true,
        phone_number: true,
        status: true,
        responder_availability_user: {
          select: { status: true, changed_at: true },
        },
        organization_memberships: {
          where: { is_active: true },
          select: {
            organizations: { select: { id: true, name: true } },
          },
          orderBy: [{ organizations: { name: 'asc' } }, { id: 'asc' }],
          take: 1,
        },
      },
      orderBy: { full_name: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      full_name: u.full_name,
      phone_number: u.phone_number,
      status: u.status,
      availability_status:
        (u.responder_availability_user?.status as string) ?? 'OFF_DUTY',
      availability_changed_at:
        u.responder_availability_user?.changed_at?.toISOString() ?? null,
      organization: u.organization_memberships[0]?.organizations ?? null,
    }));
  }

  async getMySummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        full_name: true,
        role: true,
        organization_memberships: {
          where: { is_active: true },
          include: { organizations: { select: { id: true, name: true } } },
          orderBy: [{ organizations: { name: 'asc' } }, { id: 'asc' }],
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // upsert: normally the record is created at user registration, but if it
    // is absent (e.g. admin-created accounts, pre-seed state) auto-create it
    // rather than returning a hard 500 that permanently blocks the home screen.
    const availability = await this.prisma.responderAvailability.upsert({
      where:  { user_id: userId },
      update: {},
      create: {
        user_id:       userId,
        status:        'OFF_DUTY' as any,
        changed_at:    new Date(),
        changed_by_id: userId,
        source:        'SYSTEM',
      },
    });

    const activeAssignmentCount = await this.prisma.dispatches.count({
      where: {
        dispatch_crew: { some: { user_id: userId } },
        status: { in: ['PENDING', 'SENT', 'ACCEPTED'] },
      },
    });

    return {
      user: {
        id: user.id,
        full_name: user.full_name,
        role: user.role,
        organizations: user.organization_memberships.map((m) => ({
          id: m.organizations.id,
          name: m.organizations.name,
          position: m.position ?? null,
        })),
      },
      availability: {
        status: availability.status,
        changedAt: availability.changed_at.toISOString(),
        source: availability.source,
      },
      activeAssignmentCount,
    };
  }

  async updateMyAvailability(userId: string, dto: UpdateAvailabilityDto) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the row for the duration of this transaction so a concurrent
      // acceptance or dispatch cannot race against the state check.
      const locked = await tx.$queryRaw<AvailabilityRow[]>`
        SELECT user_id, status::text AS status
        FROM "responder_availability"
        WHERE user_id = ${userId}::uuid
        FOR UPDATE
      `;

      const [lockedRow] = locked;
      if (!lockedRow) {
        throw new InternalServerErrorException('AVAILABILITY_RECORD_MISSING');
      }

      const currentStatus = lockedRow.status;

      // Idempotent: return current representation without creating an audit row.
      if (currentStatus === dto.status) {
        const row = await tx.responderAvailability.findUnique({
          where: { user_id: userId },
        });
        return {
          status: row!.status as string,
          changedAt: row!.changed_at.toISOString(),
          source: row!.source,
        };
      }

      // Block going off-duty or unavailable while holding an active assignment.
      if (
        dto.status === ResponderAvailability.OFF_DUTY ||
        dto.status === ResponderAvailability.UNAVAILABLE
      ) {
        const active = await tx.dispatches.count({
          where: {
            dispatch_crew: { some: { user_id: userId } },
            status: { in: ['PENDING', 'SENT', 'ACCEPTED'] },
          },
        });
        if (active > 0) throw new ConflictException('ACTIVE_ASSIGNMENT');
      }

      const updated = await tx.responderAvailability.update({
        where: { user_id: userId },
        data: {
          status: dto.status as any,
          changed_at: new Date(),
          changed_by_id: userId,
          source: 'SELF_SERVICE',
        },
      });

      // Fail-closed: audit failure rolls back the availability change.
      await this.audit.logInTransaction(tx, {
        action: AuditAction.STATUS_CHANGE,
        actorId: userId,
        actorRole: 'RESPONDER',
        entityType: 'RESPONDER_AVAILABILITY',
        entityId: userId,
        moduleId: 'MOD-05',
        oldValues: { status: currentStatus },
        newValues: { status: dto.status },
      });

      return {
        status: updated.status as string,
        changedAt: updated.changed_at.toISOString(),
        source: updated.source,
      };
    });
  }

  async getMyAssignments(userId: string) {
    return this.prisma.dispatches.findMany({
      where: {
        dispatch_crew: { some: { user_id: userId } },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      include: {
        incidents: { include: { incident_locations: true } },
        resources: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async getAssignment(dispatchId: string, userId: string) {
    const dispatch = await this.prisma.dispatches.findUnique({
      where: { id: dispatchId },
      include: {
        incidents: { include: { incident_locations: true } },
        resources: true,
        dispatch_crew: true,
      },
    });
    if (!dispatch) throw new NotFoundException('Assignment not found');
    const isCrew = dispatch.dispatch_crew.some((c) => c.user_id === userId);
    if (!isCrew) throw new ForbiddenException('You are not assigned to this dispatch');
    return dispatch;
  }

  async acceptAssignment(dispatchId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Lock availability row first, then dispatch row — consistent order to avoid deadlocks.
      const locked = await tx.$queryRaw<AvailabilityRow[]>`
        SELECT user_id, status::text AS status
        FROM "responder_availability"
        WHERE user_id = ${userId}::uuid
        FOR UPDATE
      `;

      const [availRow] = locked;
      if (!availRow) {
        throw new InternalServerErrorException('AVAILABILITY_RECORD_MISSING');
      }

      const availStatus = availRow.status;
      if (
        availStatus === ResponderAvailability.OFF_DUTY ||
        availStatus === ResponderAvailability.UNAVAILABLE
      ) {
        throw new ConflictException('RESPONDER_NOT_AVAILABLE');
      }

      // Lock the dispatch row before re-reading and updating it.
      await tx.$queryRaw`
        SELECT id FROM "dispatches" WHERE id = ${dispatchId}::uuid FOR UPDATE
      `;

      const dispatch = await tx.dispatches.findUnique({
        where: { id: dispatchId },
        include: { dispatch_crew: true },
      });
      if (!dispatch) throw new NotFoundException('Assignment not found');
      const isCrew = dispatch.dispatch_crew.some((c) => c.user_id === userId);
      if (!isCrew) throw new ForbiddenException('You are not assigned to this dispatch');

      return tx.dispatches.update({
        where: { id: dispatchId },
        data: { status: 'ACCEPTED', accepted_at: new Date() },
      });
    });
  }

  async declineAssignment(dispatchId: string, userId: string, reason: string) {
    await this.assertCrewMember(dispatchId, userId);
    return this.prisma.dispatches.update({
      where: { id: dispatchId },
      data: { status: 'REJECTED', rejected_at: new Date(), rejected_reason: reason },
    });
  }

  async updateStatus(
    dispatchId: string,
    userId: string,
    dto: UpdateAssignmentStatusDto,
  ) {
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
          this.logger.warn(
            `Realtime emit failed for responder status change: ${String(err)}`,
          );
        }
      }
    }

    return { dispatchId, status: dto.status };
  }

  async pushLocation(dto: TrackLocationDto, userId: string) {
    // Object-level auth: the responder must have an active crew role for this
    // incident. Writing location for an unrelated incident is rejected.
    const activeDispatch = await this.prisma.dispatches.findFirst({
      where: {
        incident_id: dto.incidentId,
        dispatch_crew: { some: { user_id: userId } },
        status: { in: ['PENDING', 'SENT', 'ACCEPTED'] },
      },
    });
    if (!activeDispatch) {
      throw new ForbiddenException('Not an active responder for this incident');
    }

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
    this.logger.log(
      `Responder ${userId} pushed location for incident ${dto.incidentId}`,
    );

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
      this.logger.warn(
        `Realtime emit failed for responder location: ${String(err)}`,
      );
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
