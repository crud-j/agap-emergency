import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { IncidentStatusNotifier } from '../notifications/incident-status-notifier';
import { NotificationsService } from '../notifications/notifications.service';
import { findEscalationRecipients } from '../jobs/escalation-recipients';
import { IncidentStatusService } from '../incidents/incident-status/incident-status.service';
import { TransportService } from '../incidents/transport/transport.service';
import { openTransportWhere } from '../incidents/transport/open-transport';
import { TransportAudienceService } from '../incidents/transport/transport-audience.service';
import { notifyRescueStillWaiting } from '../incidents/rescue-trip/rescue-trip.service';
import { assertResponderFixInArea } from '../locations/responder-fix-area';
import { UpdateAssignmentStatusDto } from './dto/update-assignment-status.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { TrackLocationDto } from '../locations/dto/track-location.dto';
import {
  AuditAction,
  IncidentStatus,
  INCIDENT_STATUS_TRANSITIONS,
  ResponderAvailability,
  ResponderStatus,
  fieldFlowFor,
  UNIT_FIELD_FLOWS,
  NOTIFICATION_EVENT_TYPES,
  type CrewHelpNeed,
} from '@agap/shared';
import { REPORTER_SEX_INCLUDE, reporterSexFrom } from '../common/utils/reporter-sex';

/**
 * Crew-only by construction: adds `incidents.reporter_sex` (reporter map icon)
 * and strips the raw users.sex so PREFER_NOT_TO_SAY never leaves the server.
 */
function withReporterSex<
  T extends {
    incidents: { incident_reporters: { is_guest: boolean; users: { sex: string | null } | null } | null };
  },
>(dispatch: T) {
  const { incident_reporters, ...incident } = dispatch.incidents;
  return {
    ...dispatch,
    incidents: {
      ...incident,
      incident_reporters: incident_reporters ? { is_guest: incident_reporters.is_guest } : null,
      reporter_sex: reporterSexFrom(incident_reporters),
    },
  };
}

// Maps a responder-reported assignment status to the incident lifecycle status.
const STATUS_TO_INCIDENT: Record<string, IncidentStatus | undefined> = {
  EN_ROUTE: IncidentStatus.EN_ROUTE,
  ON_SCENE: IncidentStatus.ON_SCENE,
  TRANSPORTING: IncidentStatus.TRANSPORTING,
  ASSISTING: IncidentStatus.ASSISTING,
  // Field work is done. The crew can resolve; only a dispatcher can CLOSE.
  RESOLVED: IncidentStatus.RESOLVED,
};

const RESPONDER_STATUS_STEP: Record<
  string,
  { prev: ResponderStatus; next: ResponderStatus } | undefined
> = {
  EN_ROUTE: { prev: ResponderStatus.BUSY, next: ResponderStatus.EN_ROUTE },
  ON_SCENE: { prev: ResponderStatus.EN_ROUTE, next: ResponderStatus.ON_SCENE },
  RESOLVED: { prev: ResponderStatus.ON_SCENE, next: ResponderStatus.AVAILABLE },
};

const HELP_REQUEST_DEDUP_MS = 5 * 60 * 1000;
/** No need name is a prefix of another, so `startsWith(prefix + need)` matches only that need. */
const HELP_REQUEST_EVENT_PREFIX = 'Crew asked dispatch for help: ';

type AvailabilityRow = { user_id: string; status: string };

@Injectable()
export class RespondersService {
  private readonly logger = new Logger(RespondersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly statusService: IncidentStatusService,
    private readonly transport: TransportService,
    private readonly audience: TransportAudienceService,
    @Optional() private readonly statusNotifier?: IncidentStatusNotifier,
    @Optional() private readonly notifications?: NotificationsService,
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
    const dispatches = await this.prisma.dispatches.findMany({
      where: {
        dispatch_crew: { some: { user_id: userId } },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      include: {
        incidents: { include: { incident_locations: true, incident_reporters: REPORTER_SEX_INCLUDE } },
        resources: true,
      },
      orderBy: { created_at: 'desc' },
    });
    const activeCounts = await Promise.all(dispatches.map((d) => this.prisma.dispatches.count({
      where: { incident_id: d.incident_id, status: { in: ['PENDING', 'SENT', 'ACCEPTED'] } },
    })));
    return dispatches.map((dispatch, index) => ({
      ...withReporterSex(dispatch),
      active_dispatch_count: activeCounts[index],
    }));
  }

  async getAssignment(dispatchId: string, userId: string) {
    const dispatch = await this.prisma.dispatches.findUnique({
      where: { id: dispatchId },
      include: {
        incidents: { include: { incident_locations: true, incident_reporters: REPORTER_SEX_INCLUDE } },
        resources: true,
        dispatch_crew: true,
      },
    });
    if (!dispatch) throw new NotFoundException('Assignment not found');
    const isCrew = dispatch.dispatch_crew.some((c) => c.user_id === userId);
    if (!isCrew) throw new ForbiddenException('You are not assigned to this dispatch');
    const activeDispatchCount = await this.prisma.dispatches.count({
      where: { incident_id: dispatch.incident_id, status: { in: ['PENDING', 'SENT', 'ACCEPTED'] } },
    });
    return { ...withReporterSex(dispatch), active_dispatch_count: activeDispatchCount };
  }

  async acceptAssignment(dispatchId: string, userId: string) {
    const accepted = await this.prisma.$transaction(async (tx) => {
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
    void this.audit.log({
      action: AuditAction.STATUS_CHANGE,
      actorId: userId,
      actorRole: 'RESPONDER',
      entityType: 'dispatch',
      entityId: dispatchId,
      moduleId: 'MOD-32',
      incidentId: accepted.incident_id,
      newValues: { status: 'ACCEPTED' },
    });
    // Emitted after commit; a failed emit never affects the acceptance.
    this.emitDispatchUpdated(accepted);
    return accepted;
  }

  async declineAssignment(dispatchId: string, userId: string, reason: string) {
    await this.assertCrewMember(dispatchId, userId);
    const declined = await this.prisma.dispatches.update({
      where: { id: dispatchId },
      data: { status: 'REJECTED', rejected_at: new Date(), rejected_reason: reason },
    });
    void this.audit.log({
      action: AuditAction.STATUS_CHANGE,
      actorId: userId,
      actorRole: 'RESPONDER',
      entityType: 'dispatch',
      entityId: dispatchId,
      moduleId: 'MOD-32',
      incidentId: declined.incident_id,
      newValues: { status: 'REJECTED', reason },
    });
    this.emitDispatchUpdated(declined);
    return declined;
  }

  private emitDispatchUpdated(dispatch: {
    id: string;
    incident_id: string;
    resource_id: string;
    status: unknown;
    en_route_at?: Date | null;
    on_scene_at?: Date | null;
    field_done_at?: Date | null;
  }) {
    try {
      this.realtime.dispatchUpdated(dispatch.incident_id, {
        dispatchId: dispatch.id,
        resourceId: dispatch.resource_id,
        status: String(dispatch.status),
        ...(dispatch.en_route_at !== undefined && { enRouteAt: dispatch.en_route_at?.toISOString() ?? null }),
        ...(dispatch.on_scene_at !== undefined && { onSceneAt: dispatch.on_scene_at?.toISOString() ?? null }),
        ...(dispatch.field_done_at !== undefined && { fieldDoneAt: dispatch.field_done_at?.toISOString() ?? null }),
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for dispatch ${dispatch.id}: ${String(err)}`);
    }
  }

  async updateStatus(
    dispatchId: string,
    userId: string,
    dto: UpdateAssignmentStatusDto,
  ) {
    const dispatch = await this.assertCrewMember(dispatchId, userId);
    // "Start transport" from the phone's outbox may be a retry (plan §19); other steps are not queued.
    const clientRequestId =
      STATUS_TO_INCIDENT[dto.status] === IncidentStatus.TRANSPORTING ? dto.clientRequestId : undefined;
    return this.transport.once(dispatchId, dispatch.incident_id, clientRequestId, () =>
      this.applyStatus(dispatch, userId, dto, clientRequestId),
    );
  }

  private async applyStatus(
    dispatch: Awaited<ReturnType<RespondersService['assertCrewMember']>>,
    userId: string,
    dto: UpdateAssignmentStatusDto,
    clientRequestId: string | undefined,
  ) {
    const dispatchId = dispatch.id;
    const incidentStatus = STATUS_TO_INCIDENT[dto.status];
    if (!incidentStatus) {
      throw new BadRequestException(
        `Unsupported assignment status ${dto.status}. Allowed: ${Object.keys(STATUS_TO_INCIDENT).join(', ')}`,
      );
    }
    if (dispatch.status !== 'ACCEPTED') {
      throw new ConflictException('Accept the assignment before updating its status');
    }
    const flow = fieldFlowFor(dispatch.resources?.resource_type);
    if (dispatch.resources?.resource_type &&
      incidentStatus === IncidentStatus.TRANSPORTING && flow !== UNIT_FIELD_FLOWS.MEDICAL_TRANSPORT) {
      throw new ConflictException({ code: 'TRANSPORT_NOT_FOR_UNIT', message: 'This unit cannot transport patients.' });
    }
    if (dispatch.resources?.resource_type && incidentStatus === IncidentStatus.ASSISTING && flow !== UNIT_FIELD_FLOWS.MEDICAL_TRANSPORT &&
      flow !== UNIT_FIELD_FLOWS.MEDICAL_FIRST) {
      throw new ConflictException({ code: 'ASSISTING_NOT_FOR_UNIT', message: 'This unit cannot mark treating on scene.' });
    }

    const incident = await this.prisma.incident.findUnique({
      where: { id: dispatch.incident_id },
      select: { status: true },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    const currentStatus = incident.status as unknown as IncidentStatus;
    // TRANSPORTING goes through the one transport entry path, which checks the
    // status itself (ON_SCENE, TRANSPORTING or ASSISTING for a second unit) under a row lock.
    const transporting = incidentStatus === IncidentStatus.TRANSPORTING;
    const resolving = incidentStatus === IncidentStatus.RESOLVED;
    const progressStatus = incidentStatus === IncidentStatus.EN_ROUTE || incidentStatus === IncidentStatus.ON_SCENE;
    // Steps of a still-open incident; RESOLVED and the terminal statuses are left
    // out so a late EN_ROUTE / ON_SCENE on a finished incident is refused below.
    const progressRank: Partial<Record<IncidentStatus, number>> = {
      [IncidentStatus.DISPATCHED]: 0,
      [IncidentStatus.EN_ROUTE]: 1,
      [IncidentStatus.ON_SCENE]: 2,
      [IncidentStatus.ASSISTING]: 3,
      [IncidentStatus.TRANSPORTING]: 3,
    };
    const alreadyAhead = progressStatus &&
      (progressRank[currentStatus] ?? -1) >= (progressRank[incidentStatus] ?? Number.MAX_SAFE_INTEGER);
    // Same lifecycle rules the dispatcher endpoint enforces (MOD-15), except a
    // unit may record progress after another unit has moved the incident ahead.
    if (!transporting && !alreadyAhead && !INCIDENT_STATUS_TRANSITIONS[currentStatus]?.includes(incidentStatus)) {
      throw new ConflictException(
        `Cannot move incident from ${currentStatus} to ${incidentStatus}`,
      );
    }

    const now = new Date();

    const { finishedDispatches, begun, stampedDispatch, resultingIncidentStatus } = await this.prisma.$transaction(async (tx) => {
      if (transporting) {
        // The record exists from this tap on, even if the destination picker is cancelled.
        const begun = await this.transport.beginTransport(tx, {
          incidentId: dispatch.incident_id,
          dispatchId,
          actor: { id: userId, role: 'RESPONDER' },
          notes: dto.notes ?? null,
          at: now,
          ...(clientRequestId && { clientRequestId }),
        });
        return { finishedDispatches: [], begun, stampedDispatch: null, resultingIncidentStatus: incidentStatus };
      }

      // Lock the incident so two crews finishing at once can't both see the other
      // as still active (and leave the incident open with no unit on it).
      const [locked] = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM incidents WHERE id = ${dispatch.incident_id}::uuid FOR UPDATE`;
      if (locked && locked.status !== currentStatus) {
        throw new ConflictException({
          code: 'INCIDENT_STATUS_CHANGED',
          message: 'Another unit just updated this incident. Refresh and try again.',
        });
      }

      const active = await tx.dispatches.findMany({
        where: {
          incident_id: dispatch.incident_id,
          status: { in: ['PENDING', 'SENT', 'ACCEPTED'] },
        },
        select: { id: true, resource_id: true, status: true },
      });
      const callerIsLastActive = active.length === 1 && active[0]!.id === dispatchId;

      if (resolving && callerIsLastActive) {
        // The crew records arrival first; a dispatcher can still resolve (override).
        const open = await tx.transportRecord.findFirst({
          where: openTransportWhere({ incident_id: dispatch.incident_id }),
          select: { id: true },
        });
        if (open) {
          throw new ConflictException({
            code: 'TRANSPORT_OPEN',
            transportId: open.id,
            message: 'Record arrival at the hospital before resolving.',
          });
        }
      }

      const shouldTransition = !alreadyAhead && (!resolving || callerIsLastActive);
      if (shouldTransition) {
        await this.statusService.recordTransition(tx, {
          incidentId: dispatch.incident_id,
          from: currentStatus,
          to: incidentStatus,
          actorId: userId,
          actorRole: 'RESPONDER',
          notes: dto.notes ?? null,
          at: now,
        });
      }

      if (progressStatus) {
        const stamped = await tx.dispatches.update({
          where: { id: dispatchId },
          data: incidentStatus === IncidentStatus.EN_ROUTE
            ? { en_route_at: now }
            : { on_scene_at: now },
        });
        return {
          finishedDispatches: [],
          begun: null,
          stampedDispatch: stamped,
          resultingIncidentStatus: shouldTransition ? incidentStatus : currentStatus,
        };
      }

      if (!resolving) {
        return { finishedDispatches: [], begun: null, stampedDispatch: null, resultingIncidentStatus: incidentStatus };
      }

      await tx.dispatches.update({
        where: { id: dispatchId },
        data: { status: 'COMPLETED', completed_at: now, field_done_at: now },
      });
      await tx.resources.updateMany({
        where: {
          id: dispatch.resource_id,
          current_incident_id: dispatch.incident_id,
        },
        data: { status: 'AVAILABLE', current_incident_id: null },
      });
      if (!callerIsLastActive) {
        await tx.incidentEvent.create({
          data: {
            incident_id: dispatch.incident_id,
            from_status: currentStatus,
            to_status: currentStatus,
            triggered_by_id: userId,
            triggered_by_role: 'RESPONDER',
            notes: `${dispatch.resources?.call_sign ?? 'Unit'} finished field work`,
          },
        });
      }
      return {
        finishedDispatches: [{ id: dispatchId, resource_id: dispatch.resource_id, status: 'COMPLETED' as const, field_done_at: now }],
        begun: null,
        stampedDispatch: null,
        resultingIncidentStatus: callerIsLastActive ? incidentStatus : currentStatus,
      };
    });

    // A second unit starting its own transport leaves the incident TRANSPORTING:
    // no status change to audit, announce or notify (its transport record is audited).
    const previousStatus = begun?.previousStatus ?? currentStatus;
    if (stampedDispatch) {
      this.emitDispatchUpdated({ ...stampedDispatch, incident_id: dispatch.incident_id });
    }
    if ((!begun || begun.statusChanged) && resultingIncidentStatus !== currentStatus) {
      void this.audit.log({
        action: AuditAction.STATUS_CHANGE,
        actorId: userId,
        actorRole: 'RESPONDER',
        entityId: dispatch.incident_id,
        entityType: 'incident',
        moduleId: resolving ? 'MOD-45' : 'MOD-32',
        incidentId: dispatch.incident_id,
        oldValues: { status: previousStatus },
        newValues: { status: incidentStatus, dispatchId, ...(dto.notes && { notes: dto.notes }) },
      });

      // persist → commit → emit (best-effort).
      try {
        this.realtime.notifyIncidentStatusChanged({
          incidentId: dispatch.incident_id,
          previousStatus,
          newStatus: incidentStatus,
          changedAt: now.toISOString(),
          changedBy: userId,
          ...(dto.notes ? { reason: dto.notes } : {}),
        });
      } catch (err) {
        this.logger.warn(`Realtime emit failed for status change: ${String(err)}`);
      }

      // Tell the reporter and the assigning dispatcher after commit; not awaited,
      // and the notifier never throws.
      try {
        void this.statusNotifier?.notifyReporter(dispatch.incident_id, incidentStatus);
        void this.statusNotifier?.notifyDispatcher(dispatch.incident_id, incidentStatus, dispatchId);
      } catch (err) {
        this.logger.warn(`Status notification failed for ${dispatch.incident_id}: ${String(err)}`);
      }
    }
    // incident.transporting (status-only in the incident room) and the first hospital route.
    if (begun) await this.transport.announceTransportBegun(begun);

    for (const d of finishedDispatches) {
      // The unit is free again (only units still pinned to this incident were released).
      try {
        this.realtime.resourceStatusChanged({
          resourceId: d.resource_id,
          newStatus: 'AVAILABLE',
          changedAt: now.toISOString(),
        });
      } catch (err) {
        this.logger.warn(`Realtime emit failed for unit ${d.resource_id}: ${String(err)}`);
      }
      this.emitDispatchUpdated({ ...d, incident_id: dispatch.incident_id });
    }

    // A rescue crew finishing while its trips say people are still waiting: tell the
    // dispatchers (Phase 4). After the Finish is saved; never throws, never dispatches.
    if (finishedDispatches.length > 0 && flow === UNIT_FIELD_FLOWS.RESCUE && this.notifications) {
      await notifyRescueStillWaiting(
        { prisma: this.prisma, notifications: this.notifications, logger: this.logger },
        { incidentId: dispatch.incident_id, dispatchId, callSign: dispatch.resources?.call_sign ?? null },
      );
    }

    const step = RESPONDER_STATUS_STEP[dto.status];
    if (step) {
      try {
        this.realtime.responderStatus(
          {
            responderId: userId,
            previousStatus: step.prev,
            newStatus: step.next,
            changedAt: now.toISOString(),
          },
          dispatch.incident_id,
        );
      } catch (err) {
        this.logger.warn(
          `Realtime emit failed for responder status change: ${String(err)}`,
        );
      }
    }

    return { dispatchId, status: dto.status, incidentStatus: resultingIncidentStatus };
  }

  async pushLocation(dto: TrackLocationDto, userId: string) {
    await assertResponderFixInArea(this.prisma, { userId, ...dto });

    // Object-level auth: the responder must have an active crew role for this
    // incident. Writing location for an unrelated incident is rejected.
    const activeDispatch = await this.prisma.dispatches.findFirst({
      where: {
        incident_id: dto.incidentId,
        dispatch_crew: { some: { user_id: userId } },
        status: { in: ['PENDING', 'SENT', 'ACCEPTED'] },
      },
      orderBy: { status: 'desc' }, // prefer ACCEPTED (enum declaration order)
      select: { id: true, resources: { select: { call_sign: true } } },
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
      // Same contract and audience as LocationsService.trackResponder: dispatch +
      // call sign so maps can group crew phones per unit; never a name or phone;
      // the incident room only on the scene leg.
      const rooms = await this.audience.roomsForDispatch(dto.incidentId, activeDispatch.id);
      this.realtime.notifyResponderLocationUpdated(
        dto.incidentId,
        {
          responderId: userId,
          dispatchId: activeDispatch.id,
          callSign: activeDispatch.resources?.call_sign ?? null,
          lat: dto.latitude,
          lng: dto.longitude,
          heading: dto.headingDegrees ?? null,
          speed: dto.speedKmh ?? null,
          updatedAt: record.recorded_at.toISOString(),
        },
        rooms,
      );
    } catch (err) {
      this.logger.warn(
        `Realtime emit failed for responder location: ${String(err)}`,
      );
    }

    return record;
  }

  async requestHelp(dispatchId: string, userId: string, dto: {
    need: CrewHelpNeed;
    count?: number;
    note?: string;
    clientRequestId?: string;
  }) {
    const dispatch = await this.prisma.dispatches.findUnique({
      where: { id: dispatchId },
      include: { dispatch_crew: true, incidents: { select: { id: true, public_reference: true, status: true } } },
    });
    if (!dispatch) throw new NotFoundException('Assignment not found');
    if (!dispatch.dispatch_crew.some((crew) => crew.user_id === userId)) {
      throw new ForbiddenException('You are not assigned to this dispatch');
    }
    if (!['PENDING', 'SENT', 'ACCEPTED'].includes(String(dispatch.status))) {
      throw new ConflictException('This assignment is no longer active');
    }
    // One request per incident + need per 5 minutes, from any crew. Keyed on the
    // saved event, so it holds even when no dispatcher was on duty to get a notice.
    const duplicate = await this.prisma.incidentEvent.findFirst({
      where: {
        incident_id: dispatch.incident_id,
        occurred_at: { gte: new Date(Date.now() - HELP_REQUEST_DEDUP_MS) },
        notes: { startsWith: `${HELP_REQUEST_EVENT_PREFIX}${dto.need}` },
      },
      select: { id: true },
    });
    if (duplicate) return { deduplicated: true, incidentId: dispatch.incident_id };

    const summary = `${dto.need}${dto.count ? ` (${dto.count})` : ''}`;
    // Persist first. The citizen's timeline shows incident-event notes, so the
    // crew's free-text note never goes there, nor into a notice body or a WS payload.
    await this.prisma.incidentEvent.create({
      data: {
        incident_id: dispatch.incident_id,
        from_status: dispatch.incidents.status,
        to_status: dispatch.incidents.status,
        triggered_by_id: userId,
        triggered_by_role: 'RESPONDER',
        notes: `${HELP_REQUEST_EVENT_PREFIX}${summary}`,
      },
    });
    void this.audit.log({
      action: AuditAction.CREATE, actorId: userId, actorRole: 'RESPONDER',
      entityType: 'crew_help_request', entityId: dispatchId, moduleId: 'MOD-32',
      incidentId: dispatch.incident_id,
      newValues: { need: dto.need, ...(dto.count != null ? { count: dto.count } : {}), hasNote: Boolean(dto.note) },
    });

    // A notice to the dispatchers (they decide; nothing is dispatched here). Best-effort.
    const payload = { need: dto.need, ...(dto.count != null ? { count: dto.count } : {}), dispatchId };
    try {
      const recipients = await findEscalationRecipients(this.prisma, ['DISPATCHER']);
      const results = await Promise.allSettled(recipients.map((recipient) =>
        this.notifications!.create({
          userId: recipient.id,
          eventType: NOTIFICATION_EVENT_TYPES.CREW_HELP_REQUESTED,
          title: 'Crew help requested',
          body: `${dispatch.incidents.public_reference}: ${summary}`,
          incidentId: dispatch.incident_id,
          // The note rides only in the recipient's own notice (notification.created carries no dataPayload).
          dataPayload: { ...payload, ...(dto.note ? { note: dto.note } : {}) },
        })));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) this.logger.warn(`Crew help request: ${failed} dispatcher notice(s) failed for ${dispatch.incident_id}`);
    } catch (err) {
      this.logger.warn(`Crew help request notices failed for ${dispatch.incident_id}: ${String(err)}`);
    }
    try {
      this.realtime.incidentUpdated(dispatch.incident_id, { type: NOTIFICATION_EVENT_TYPES.CREW_HELP_REQUESTED, ...payload });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for crew help request: ${String(err)}`);
    }
    return { deduplicated: false, incidentId: dispatch.incident_id };
  }

  private async assertCrewMember(dispatchId: string, userId: string) {
    const dispatch = await this.prisma.dispatches.findUnique({
      where: { id: dispatchId },
      include: { dispatch_crew: true, resources: true },
    });
    if (!dispatch) throw new NotFoundException('Assignment not found');
    const isCrew = dispatch.dispatch_crew.some((c) => c.user_id === userId);
    if (!isCrew) {
      throw new ForbiddenException('You are not assigned to this dispatch');
    }
    return dispatch;
  }
}
