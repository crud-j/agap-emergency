import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { IncidentStatusNotifier } from '../notifications/incident-status-notifier';
import { addAgencyParticipant } from '../incidents/agency-participants';
import { ACTIVE_DISPATCH_STATUSES } from '../incidents/field-report-access';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { DispatchChangeDto, ReassignDispatchDto } from './dto/dispatch-actions.dto';
import { SubmitTriageDto } from './dto/submit-triage.dto';
import { LockedDispatch, lockIncidentAndDispatch, releaseDispatchedUnit } from './dispatch-release';
import { assertCrewFree } from './crew-assignment';
import {
  ASSIGNMENT_PUSH_JOB,
  ASSIGNMENT_PUSH_OPTS,
  assignmentPush,
  assignmentPushJobId,
} from './assignment-push';
import {
  ACTIVE_RESPONSE_INCIDENT_STATUSES,
  AuditAction,
  CHANGEABLE_DISPATCH_STATUSES,
  IncidentStatus,
  QUEUE_NAMES,
  TERMINAL_INCIDENT_STATUSES,
  describeDispatchChange,
  recommendIntakePriority,
  sanitizeIntakeAnswers,
} from '@agap/shared';
import { Prisma } from '@prisma/client';

/** First unit: the dispatch moves the incident to DISPATCHED. */
const DISPATCHABLE_STATUSES = ['ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING'];
/** Additional unit: a unit is already responding, so the incident status is kept. */
const ADDITIONAL_DISPATCH_STATUSES: readonly string[] = ACTIVE_RESPONSE_INCIDENT_STATUSES;

type AvailabilityRow = { user_id: string; status: string };

/** "ALPHA-1", or the unit's name when it has no call sign. */
function unitName(resource: { call_sign?: string | null; name?: string | null } | null | undefined): string {
  return resource?.call_sign ?? resource?.name ?? 'unit';
}

/** A unit can be recalled or replaced only while it is still on its way (MOD-31). */
function assertChangeable(locked: LockedDispatch): void {
  if (!CHANGEABLE_DISPATCH_STATUSES.includes(locked.dispatchStatus)) {
    throw new ConflictException({
      code: 'DISPATCH_CLOSED',
      message: `This unit is no longer on the incident (${locked.dispatchStatus.toLowerCase()}).`,
    });
  }
  if (locked.onSceneAt) {
    throw new ConflictException({
      code: 'UNIT_ON_SCENE',
      message: 'This unit is already on scene. The crew ends its part with Finish on the responder app.',
    });
  }
}

/**
 * Refuse a dispatch whose sender didn't see every unit already on the incident:
 * two people on the same incident (a Dispatcher and a Supervisor, or two
 * Dispatchers) would otherwise send two units where one was meant. Called inside
 * the create transaction, after the incident row lock.
 */
async function assertNoUnseenDispatch(
  tx: Prisma.TransactionClient,
  incidentId: string,
  expectedActiveUnits: number,
  senderId: string,
): Promise<void> {
  const active = await tx.dispatches.findMany({
    where: { incident_id: incidentId, status: { in: ACTIVE_DISPATCH_STATUSES as any[] } },
    orderBy: { created_at: 'desc' },
    select: {
      dispatcher_id: true,
      created_at: true,
      resources: { select: { name: true, call_sign: true } },
      users: { select: { full_name: true } },
    },
  });
  if (active.length <= expectedActiveUnits) return;
  const latest = active[0]!;
  const who = latest.dispatcher_id === senderId ? 'You' : latest.users?.full_name ?? 'Another dispatcher';
  throw new ConflictException({
    code: 'INCIDENT_DISPATCH_CHANGED',
    message:
      `${who} already dispatched ${unitName(latest.resources)} to this incident. ` +
      'Your unit was not sent. Check the incident, then use “Dispatch another unit” if it needs more help.',
    activeUnits: active.length,
    latestUnit: unitName(latest.resources),
    latestDispatcher: who,
    latestDispatchedAt: latest.created_at,
  });
}

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationQueue: Queue,
    @Optional() private readonly statusNotifier?: IncidentStatusNotifier,
  ) {}

  async findAll(filters: { incidentId?: string; status?: string }) {
    const where: Prisma.dispatchesWhereInput = {};
    if (filters.incidentId) where.incident_id = filters.incidentId;
    if (filters.status) where.status = filters.status as any;
    // Staff-only route (DISPATCHER/SUPERVISOR): crew names are shown on the
    // dispatch dashboard's unit tracking card (MOD-31 / MOD-43). Never add names
    // to findById — that route is not role-restricted.
    return this.prisma.dispatches.findMany({
      where,
      include: {
        incidents: true,
        resources: true,
        dispatch_crew: { include: { users: { select: { id: true, full_name: true } } } },
      },
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
   *
   * The first unit moves the incident to DISPATCHED. An additional unit (the
   * incident is already DISPATCHED … ASSISTING) keeps the incident status and adds
   * a timeline note; the responder side resolves only when the last unit finishes.
   */
  async create(dto: CreateDispatchDto, dispatcherId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: dto.incidentId },
      include: { incident_reporters: true },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    // For the error message only; the status that decides is re-read under the lock.
    if (!DISPATCHABLE_STATUSES.includes(incident.status) && !ADDITIONAL_DISPATCH_STATUSES.includes(incident.status)) {
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

    const { created: dispatch, previousStatus, additionalUnit } = await this.prisma.$transaction(async (tx) => {
      // Lock the incident so a dispatch can't race a resolve, or another first dispatch.
      const [lockedIncident] = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status::text AS status FROM incidents WHERE id = ${dto.incidentId}::uuid FOR UPDATE`;
      if (!lockedIncident) throw new NotFoundException('Incident not found');
      const previousStatus = lockedIncident.status;
      const additionalUnit = ADDITIONAL_DISPATCH_STATUSES.includes(previousStatus);
      if (!additionalUnit && !DISPATCHABLE_STATUSES.includes(previousStatus)) {
        throw new ConflictException({
          code: 'INCIDENT_STATUS_CHANGED',
          message: `Incident status ${previousStatus} is not dispatchable`,
        });
      }
      // Under the lock every other create/reassign on this incident has committed, so
      // this count is exact. Without it, a dispatch that lost the race becomes a
      // silent second unit (the status already reads DISPATCHED).
      if (dto.expectedActiveUnits !== undefined) {
        await assertNoUnseenDispatch(tx, dto.incidentId, dto.expectedActiveUnits, dispatcherId);
      }
      // The AVAILABLE check above ran without a lock: two dispatchers may send the same
      // unit to two incidents, or a Supervisor may set it Out of service meanwhile.
      // Re-read under a row lock (as reassign does) so the second one fails cleanly.
      const [lockedResource] = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status::text AS status FROM resources WHERE id = ${dto.resourceId}::uuid FOR UPDATE`;
      if (lockedResource?.status !== 'AVAILABLE') {
        throw new ConflictException({ code: 'RESOURCE_NOT_AVAILABLE', message: `${unitName(resource)} is no longer available.` });
      }

      const created = await this.insertDispatch(tx, {
        incidentId: dto.incidentId,
        resource,
        dispatcherId,
        notes: dto.dispatchNotes ?? null,
        crewIds: dto.initialCrewIds,
      });

      if (additionalUnit) {
        // Same status, note only (as "… finished field work"): no status change and
        // no dispatched_at overwrite, so the first unit's timings stay as they were.
        await tx.incidentEvent.create({
          data: {
            incident_id: dto.incidentId,
            from_status: previousStatus as any,
            to_status: previousStatus as any,
            triggered_by_id: dispatcherId,
            triggered_by_role: 'DISPATCHER',
            notes: `Additional unit ${unitName(resource)} dispatched`,
          },
        });
        return { created, previousStatus, additionalUnit };
      }

      await tx.incident.update({
        where: { id: dto.incidentId },
        data: { status: IncidentStatus.DISPATCHED as any, dispatched_at: new Date() },
      });

      await tx.incidentEvent.create({
        data: {
          incident_id: dto.incidentId,
          from_status: previousStatus as any,
          to_status: IncidentStatus.DISPATCHED as any,
          triggered_by_id: dispatcherId,
          triggered_by_role: 'DISPATCHER',
        },
      });

      return { created, previousStatus, additionalUnit };
    });

    this.logger.log(`Dispatch ${dispatch.id} created by ${dispatcherId}`);

    if (!additionalUnit) {
      this.emitStatusChanged(dispatch.incident_id, previousStatus, IncidentStatus.DISPATCHED, dispatcherId, dispatch.created_at);
    }
    await this.announceDispatch(dispatch, incident, resource, dispatcherId, dto.initialCrewIds ?? [], {
      ...(additionalUnit && { additionalUnit: true }),
    });

    // The reporter and their emergency contacts heard "help is on the way" with the
    // first unit; an additional unit changes no status, so they aren't told again.
    if (additionalUnit) return dispatch;

    // "Help is on the way" to the reporter: feed row + push, deduplicated per status.
    void this.statusNotifier?.notifyReporter(incident.id, IncidentStatus.DISPATCHED);

    const reporterUserId = incident.incident_reporters?.user_id;
    try {
      if (reporterUserId) {
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

  /**
   * MOD-31 — recall a unit before it reaches the scene. The unit becomes
   * AVAILABLE again; if it was the incident's only unit and nobody had arrived,
   * the incident goes back to DISPATCH_PENDING so it returns to the dispatch
   * queue (and its SLA timer) instead of claiming help is on the way.
   */
  async cancel(id: string, userId: string, change: DispatchChangeDto) {
    const dispatch = await this.findById(id);
    const reasonText = describeDispatchChange(change.reason, change.notes);

    const { updated, release, incidentStatus } = await this.prisma.$transaction(async (tx) => {
      const locked = await lockIncidentAndDispatch(tx, dispatch.incident_id, id);
      assertChangeable(locked);

      const updated = await tx.dispatches.update({ where: { id }, data: { status: 'CANCELLED' } });
      const release = await releaseDispatchedUnit(tx, dispatch, locked.incidentStatus);
      await tx.incidentEvent.create({
        data: {
          incident_id: dispatch.incident_id,
          from_status: locked.incidentStatus as any,
          to_status: (release.revertedTo ?? locked.incidentStatus) as any,
          triggered_by_id: userId,
          triggered_by_role: 'DISPATCHER',
          notes: `Unit ${unitName(dispatch.resources)} recalled: ${reasonText}`,
        },
      });
      return { updated, release, incidentStatus: locked.incidentStatus };
    });

    if (release.revertedTo) {
      this.emitStatusChanged(dispatch.incident_id, incidentStatus, release.revertedTo, userId);
    }
    await this.announceCancellation(dispatch, release.released);

    void this.audit.log({
      action: AuditAction.UPDATE,
      actorId: userId,
      entityId: id,
      entityType: 'dispatch',
      moduleId: 'MOD-31',
      incidentId: dispatch.incident_id,
      oldValues: { status: dispatch.status },
      newValues: {
        status: 'CANCELLED',
        reason: change.reason,
        ...(change.notes?.trim() && { notes: change.notes.trim() }),
        ...(release.revertedTo && { incidentStatus: release.revertedTo }),
      },
    });

    return { ...updated, incidentStatus: release.revertedTo ?? incidentStatus };
  }

  /**
   * MOD-31 — replace a unit that hasn't reached the scene with another one, in one
   * transaction: the old dispatch is cancelled and the new one created together,
   * so a failure (unit taken, crew busy) leaves the original unit assigned.
   */
  async reassign(id: string, dto: ReassignDispatchDto, userId: string) {
    const old = await this.findById(id);
    if (dto.resourceId === old.resource_id) {
      throw new BadRequestException('Choose a different unit to replace this one.');
    }
    const [incident, resource] = await Promise.all([
      this.prisma.incident.findUnique({ where: { id: old.incident_id }, include: { incident_reporters: true } }),
      this.prisma.resources.findUnique({ where: { id: dto.resourceId } }),
    ]);
    if (!incident) throw new NotFoundException('Incident not found');
    if (!resource) throw new NotFoundException('Resource not found');
    const reasonText = describeDispatchChange(dto.reason, dto.notes);

    const { created, release, previousStatus, newStatus } = await this.prisma.$transaction(async (tx) => {
      const locked = await lockIncidentAndDispatch(tx, old.incident_id, id);
      assertChangeable(locked);
      if (!ADDITIONAL_DISPATCH_STATUSES.includes(locked.incidentStatus)) {
        throw new ConflictException({
          code: 'INCIDENT_STATUS_CHANGED',
          message: `A ${locked.incidentStatus} incident can't get a replacement unit.`,
        });
      }
      // Two dispatchers may pick the same unit; the lock makes the second one fail cleanly.
      const [lockedResource] = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status::text AS status FROM resources WHERE id = ${dto.resourceId}::uuid FOR UPDATE`;
      if (lockedResource?.status !== 'AVAILABLE') {
        throw new ConflictException({ code: 'RESOURCE_NOT_AVAILABLE', message: `${unitName(resource)} is no longer available.` });
      }

      await tx.dispatches.update({ where: { id }, data: { status: 'CANCELLED' } });
      const release = await releaseDispatchedUnit(tx, old, locked.incidentStatus, { keepStatus: true });
      const created = await this.insertDispatch(tx, {
        incidentId: old.incident_id,
        resource,
        dispatcherId: userId,
        notes: old.dispatch_notes ?? null,
        crewIds: dto.crewIds,
      });

      // The replacement hasn't moved yet. If the replaced unit was the only one on
      // the road, the incident steps back from EN_ROUTE to DISPATCHED.
      let newStatus = locked.incidentStatus as IncidentStatus;
      if (locked.incidentStatus === IncidentStatus.EN_ROUTE) {
        const othersOnTheWay = await tx.dispatches.count({
          where: {
            incident_id: old.incident_id,
            id: { notIn: [id, created.id] },
            status: { in: ACTIVE_DISPATCH_STATUSES as any[] },
          },
        });
        if (othersOnTheWay === 0) {
          newStatus = IncidentStatus.DISPATCHED;
          await tx.incident.update({ where: { id: old.incident_id }, data: { status: newStatus as any } });
        }
      }

      await tx.incidentEvent.create({
        data: {
          incident_id: old.incident_id,
          from_status: locked.incidentStatus as any,
          to_status: newStatus as any,
          triggered_by_id: userId,
          triggered_by_role: 'DISPATCHER',
          notes: `Unit ${unitName(old.resources)} replaced by ${unitName(resource)}: ${reasonText}`,
        },
      });
      return { created, release, previousStatus: locked.incidentStatus, newStatus };
    });

    this.logger.log(`Dispatch ${id} replaced by ${created.id} (${userId})`);

    if (newStatus !== previousStatus) {
      this.emitStatusChanged(old.incident_id, previousStatus, newStatus, userId);
    }
    await this.announceCancellation(old, release.released);
    void this.audit.log({
      action: AuditAction.UPDATE,
      actorId: userId,
      entityId: id,
      entityType: 'dispatch',
      moduleId: 'MOD-31',
      incidentId: old.incident_id,
      oldValues: { status: old.status, resourceId: old.resource_id },
      newValues: {
        status: 'CANCELLED',
        reason: dto.reason,
        ...(dto.notes?.trim() && { notes: dto.notes.trim() }),
        replacedByDispatchId: created.id,
      },
    });
    // The new unit is announced like any dispatch; the reporter's status didn't move forward.
    await this.announceDispatch(created, incident, resource, userId, dto.crewIds ?? [], {
      replacesDispatchId: id,
    });

    return created;
  }

  /**
   * The dispatch row, its crew (availability locked and checked) and the unit's
   * DISPATCHED status, inside the caller's transaction and incident lock.
   */
  private async insertDispatch(
    tx: Prisma.TransactionClient,
    args: {
      incidentId: string;
      resource: { id: string; organization_id: string };
      dispatcherId: string;
      notes: string | null;
      crewIds?: string[] | undefined;
    },
  ) {
    const created = await tx.dispatches.create({
      data: {
        incident_id: args.incidentId,
        resource_id: args.resource.id,
        dispatcher_id: args.dispatcherId,
        organization_id: args.resource.organization_id,
        status: 'PENDING',
        dispatch_notes: args.notes,
      },
    });

    if (args.crewIds?.length) {
      // Lock all target availability rows in sorted UUID order to prevent
      // deadlocks when multiple dispatches target overlapping responders.
      const sorted = [...new Set(args.crewIds)].sort();
      const locked = await tx.$queryRaw<AvailabilityRow[]>(
        Prisma.sql`
          SELECT user_id, status::text AS status
          FROM "responder_availability"
          WHERE user_id = ANY(ARRAY[${Prisma.join(sorted)}]::uuid[])
          ORDER BY user_id
          FOR UPDATE
        `,
      );

      if (locked.length !== sorted.length) {
        throw new InternalServerErrorException('AVAILABILITY_RECORD_MISSING');
      }

      const unavailable = locked.find((r) => r.status !== 'AVAILABLE');
      if (unavailable) {
        throw new ConflictException('RESPONDER_NOT_AVAILABLE');
      }

      // Not on another active unit, on this incident or any other.
      await assertCrewFree(tx, sorted, args.incidentId);

      await tx.dispatch_crew.createMany({
        data: sorted.map((uid) => ({ dispatch_id: created.id, user_id: uid })),
        skipDuplicates: true,
      });
    }

    await tx.resources.update({
      where: { id: args.resource.id },
      data: { status: 'DISPATCHED', current_incident_id: args.incidentId },
    });

    return created;
  }

  /**
   * After a new dispatch commits: audit, agency participation, live events and the
   * crew's assignment push. Each step is best-effort and never undoes the dispatch.
   */
  private async announceDispatch(
    dispatch: { id: string; incident_id: string; resource_id: string; status: unknown; created_at: Date | null },
    incident: Parameters<typeof assignmentPush>[1],
    resource: { status: unknown; organization_id: string | null; resource_type: unknown },
    dispatcherId: string,
    /** The crew the dispatcher sent; the first one is the assignment's lead responder. */
    requestedCrewIds: string[],
    auditExtra: Record<string, unknown>,
  ) {
    // Audit — DISPATCH is the most consequential operational action (MOD-46/31).
    void this.audit.log({
      action: AuditAction.DISPATCH,
      actorId: dispatcherId,
      entityId: dispatch.id,
      entityType: 'dispatch',
      moduleId: 'MOD-31',
      incidentId: dispatch.incident_id,
      newValues: { resourceId: dispatch.resource_id, crewIds: requestedCrewIds, ...auditExtra },
    });

    // MOD-34 (decision D5): the unit's organization joins the incident's agencies, with
    // the unit type as its role. Idempotent; a failure here never affects the dispatch.
    if (resource.organization_id) {
      try {
        await addAgencyParticipant(
          { prisma: this.prisma, audit: this.audit, realtime: this.realtime },
          {
            incidentId: dispatch.incident_id,
            organizationId: resource.organization_id,
            actorId: dispatcherId,
            roleInIncident: String(resource.resource_type),
          },
        );
      } catch (err) {
        this.logger.warn(`Agency participant not added for dispatch ${dispatch.id}: ${String(err)}`);
      }
    }

    // MOD-18 / MOD-32: wake every crew phone. A failed push never affects the dispatch.
    let crewIds: string[] = [];
    try {
      const crew = await this.prisma.dispatch_crew.findMany({
        where: { dispatch_id: dispatch.id },
        select: { user_id: true },
      });
      crewIds = crew.map((c) => c.user_id);
    } catch (err) {
      this.logger.error(`Crew lookup failed for dispatch ${dispatch.id}: ${String(err)}. Dispatch unaffected.`);
    }

    // persist → commit → emit (best-effort). A WS failure never affects dispatch.
    try {
      const assignedAt = (dispatch.created_at ?? new Date()).toISOString();
      this.realtime.incidentAssigned({
        incidentId: dispatch.incident_id,
        assignmentId: dispatch.id,
        responderId: requestedCrewIds[0] ?? '',
        responseUnitId: dispatch.resource_id,
        assignedAt,
      });
      this.realtime.notifyDispatchCreated(dispatch.incident_id, {
        dispatchId: dispatch.id,
        resourceId: dispatch.resource_id,
        status: dispatch.status as any,
      });
      this.realtime.resourceStatusChanged({
        resourceId: dispatch.resource_id,
        previousStatus: String(resource.status),
        newStatus: 'DISPATCHED',
        changedAt: assignedAt,
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for dispatch create: ${String(err)}`);
    }

    try {
      await this.queueAssignmentPushes(
        crewIds.map((userId) => ({
          data: assignmentPush('ASSIGNMENT', incident, dispatch.id, userId),
          jobId: assignmentPushJobId('ASSIGNMENT', dispatch.id, userId),
        })),
      );
    } catch (err) {
      this.logger.error(`Responder push enqueue failed: ${String(err)}. Dispatch unaffected.`);
    }
  }

  /** After a cancellation commits: live events and the crew's "stand down" push. */
  private async announceCancellation(
    dispatch: Awaited<ReturnType<DispatchService['findById']>>,
    released: boolean,
  ) {
    try {
      this.realtime.notifyDispatchCancelled(dispatch.incident_id, {
        dispatchId: dispatch.id,
        resourceId: dispatch.resource_id,
      });
      if (released) {
        this.realtime.resourceStatusChanged({
          resourceId: dispatch.resource_id,
          newStatus: 'AVAILABLE',
          changedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      this.logger.warn(`Realtime emit failed for dispatch cancel: ${String(err)}`);
    }

    // Tell the crew to stand down. Best-effort: the cancellation is already stored.
    try {
      await this.queueAssignmentPushes(
        (dispatch.dispatch_crew ?? []).map((c) => ({
          data: assignmentPush('ASSIGNMENT_CANCELLED', dispatch.incidents, dispatch.id, c.user_id),
          jobId: assignmentPushJobId('ASSIGNMENT_CANCELLED', dispatch.id, c.user_id),
        })),
      );
    } catch (err) {
      this.logger.error(`Responder cancel push enqueue failed: ${String(err)}. Dispatch unaffected.`);
    }
  }

  private emitStatusChanged(
    incidentId: string,
    previousStatus: string,
    newStatus: IncidentStatus,
    changedBy: string,
    at?: Date | null,
  ) {
    try {
      this.realtime.notifyIncidentStatusChanged({
        incidentId,
        previousStatus: previousStatus as unknown as IncidentStatus,
        newStatus,
        changedAt: (at ?? new Date()).toISOString(),
        changedBy,
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for incident status change: ${String(err)}`);
    }
  }

  async addCrew(dispatchId: string, userId: string, actorId?: string) {
    const dispatch = await this.findById(dispatchId);

    const crew = await this.prisma.$transaction(async (tx) => {
      // Lock the responder's availability row before adding to crew.
      const locked = await tx.$queryRaw<AvailabilityRow[]>`
        SELECT user_id, status::text AS status
        FROM "responder_availability"
        WHERE user_id = ${userId}::uuid
        FOR UPDATE
      `;

      const [crewRow] = locked;
      if (!crewRow) {
        throw new InternalServerErrorException('AVAILABILITY_RECORD_MISSING');
      }

      if (crewRow.status !== 'AVAILABLE') {
        throw new ConflictException('RESPONDER_NOT_AVAILABLE');
      }
      await assertCrewFree(tx, [userId], dispatch.incident_id);

      return tx.dispatch_crew.create({
        data: { dispatch_id: dispatchId, user_id: userId },
      });
    });

    void this.audit.log({
      action: AuditAction.UPDATE,
      actorId: actorId ?? userId,
      entityId: dispatchId,
      entityType: 'dispatch',
      moduleId: 'MOD-31',
      newValues: { addedCrewUserId: userId },
    });

    // Push the added responder only. Timestamped jobId: removed and re-added crew get it again.
    try {
      await this.queueAssignmentPushes([
        {
          data: assignmentPush('ASSIGNMENT', dispatch.incidents, dispatchId, userId),
          jobId: `${assignmentPushJobId('ASSIGNMENT', dispatchId, userId)}-${Date.now()}`,
        },
      ]);
    } catch (err) {
      this.logger.error(`Responder push enqueue failed: ${String(err)}. Crew change unaffected.`);
    }
    return crew;
  }

  /** One PUSH job per crew member on the notifications queue (NotificationProcessor.sendPush). */
  private async queueAssignmentPushes(
    jobs: Array<{ data: ReturnType<typeof assignmentPush>; jobId: string }>,
  ): Promise<void> {
    await Promise.all(
      jobs.map((j) =>
        this.notificationQueue.add(ASSIGNMENT_PUSH_JOB, j.data, { ...ASSIGNMENT_PUSH_OPTS, jobId: j.jobId }),
      ),
    );
  }

  async removeCrew(dispatchId: string, crewUserId: string, actorId?: string) {
    await this.prisma.dispatch_crew.deleteMany({
      where: { dispatch_id: dispatchId, user_id: crewUserId },
    });
    void this.audit.log({
      action: AuditAction.DELETE,
      actorId: actorId ?? crewUserId,
      entityId: dispatchId,
      entityType: 'dispatch',
      moduleId: 'MOD-31',
      newValues: { removedCrewUserId: crewUserId },
    });
  }

  async getPriorityRecommendation(incidentId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: { incident_details: { select: { caller_answers: true } } },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    // Recomputed from the stored caller answers so the rule set can evolve
    // without rewriting old incidents.
    const answers = sanitizeIntakeAnswers(incident.category, incident.incident_details?.caller_answers);
    const { priority, reasons } = recommendIntakePriority(incident.category, answers);
    return {
      incidentId,
      currentPriority: incident.priority,
      recommendedPriority: priority,
      reasons,
      note: 'Recommendation is assistive; dispatcher confirms the final priority',
    };
  }

  async submitTriage(dto: SubmitTriageDto & { incidentId: string }, userId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: dto.incidentId },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    if (TERMINAL_INCIDENT_STATUSES.has(incident.status as unknown as IncidentStatus)) {
      throw new BadRequestException(`A ${incident.status} incident's priority can no longer be changed.`);
    }

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

    void this.audit.log({
      action: AuditAction.UPDATE,
      actorId: userId,
      entityId: dto.incidentId,
      entityType: 'incident',
      moduleId: 'MOD-25',
      incidentId: dto.incidentId,
      oldValues: { priority: incident.priority },
      newValues: { priority: dto.priorityAssessment, ...(dto.notes ? { notes: dto.notes } : {}) },
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
}
