import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  IncidentStatus,
  TERMINAL_INCIDENT_STATUSES,
  UserRole,
} from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { ICS_POSITION_LABELS, IcsNotifier, type IcsNoticeKind } from '../../notifications/ics-notifier';

/** Mirrors the frontend's SITUATION_NOTES_MAX and UpdateIcsDto. */
export const ICS_SITUATION_NOTES_MAX = 4000;

export const INCIDENT_COMMANDER = 'INCIDENT_COMMANDER';

/** Who may hold a command job: staff and field crew with an AGAP account. */
const ASSIGNABLE_ROLES: readonly string[] = [UserRole.SUPERVISOR, UserRole.DISPATCHER, UserRole.RESPONDER];

const ICS_INCLUDE = {
  ics_assignments: {
    orderBy: { assigned_at: 'asc' },
    include: {
      users: { select: { id: true, full_name: true, role: true } },
      organizations: { select: { id: true, name: true, short_name: true } },
    },
  },
} satisfies Prisma.incident_command_structuresInclude;

type Tx = Prisma.TransactionClient;

interface Notice {
  kind: IcsNoticeKind;
  userId: string;
  assignmentId: string;
  position: string;
}

/**
 * Incident Command (MOD-36). One command per incident; it can be ended and started
 * again. Nothing is deleted: ending command stamps deactivated_at, relieving someone
 * stamps relieved_at, so the history stays for after-action review (Rule 11).
 * The database enforces one Incident Commander at a time (uq_ics_assignments_one_commander).
 */
@Injectable()
export class IncidentCommandService {
  private readonly logger = new Logger(IncidentCommandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    @Optional() private readonly notifier?: IcsNotifier,
  ) {}

  // ─── Read ──────────────────────────────────────────────────────────────────

  /** The command for an incident, running or ended, with everyone who has held a job. */
  async get(incidentId: string) {
    const ics = await this.prisma.incident_command_structures.findUnique({
      where: { incident_id: incidentId },
      include: ICS_INCLUDE,
    });
    if (!ics) throw new NotFoundException('This incident has never been under Incident Command.');
    return ics;
  }

  /** Does this person hold a command job on this incident right now? (responder read access) */
  async holdsCurrentJob(userId: string, incidentId: string): Promise<boolean> {
    const count = await this.prisma.ics_assignments.count({
      where: {
        user_id: userId,
        relieved_at: null,
        incident_command_structures: { incident_id: incidentId, deactivated_at: null },
      },
    });
    return count > 0;
  }

  // ─── Start ─────────────────────────────────────────────────────────────────

  async start(
    incidentId: string,
    input: { objectives?: string[]; commanderUserId?: string },
    actorId: string,
  ) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { status: true },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    if (isFinished(incident.status)) {
      throw new BadRequestException('Command can only be started for an active incident.');
    }
    if (input.commanderUserId) await this.assertAssignable(input.commanderUserId);
    const objectives = cleanObjectives(input.objectives);

    const notices: Notice[] = [];
    const ics = await this.inTx(async (tx) => {
      const existing = await tx.incident_command_structures.findUnique({ where: { incident_id: incidentId } });
      if (existing && !existing.deactivated_at) {
        throw new ConflictException('This incident is already under command.');
      }
      const now = new Date();
      const structure = existing
        ? await tx.incident_command_structures.update({
            where: { id: existing.id },
            // Starting again: a fresh plan. Earlier jobs stay as relieved history.
            data: { activated_at: now, deactivated_at: null, objectives, situation_notes: null, updated_at: now },
          })
        : await tx.incident_command_structures.create({
            data: { incident_id: incidentId, objectives },
          });

      if (input.commanderUserId) {
        const assignment = await tx.ics_assignments.create({
          data: { ics_id: structure.id, user_id: input.commanderUserId, position: INCIDENT_COMMANDER as never },
        });
        notices.push({ kind: 'ASSIGNED', userId: input.commanderUserId, assignmentId: assignment.id, position: INCIDENT_COMMANDER });
      }
      return structure;
    });

    void this.audit.log({
      action: AuditAction.CREATE,
      actorId,
      entityType: 'incident_command_structure',
      entityId: ics.id,
      moduleId: 'MOD-36',
      incidentId,
      newValues: { event: 'COMMAND_STARTED', objectives, commanderUserId: input.commanderUserId ?? null },
    });
    this.emit(incidentId, { icsActivated: true });
    this.sendNotices(incidentId, notices, actorId);
    return this.get(incidentId);
  }

  // ─── Plan ──────────────────────────────────────────────────────────────────

  async updatePlan(
    incidentId: string,
    dto: { objectives?: string[]; situationNotes?: string | null },
    actorId: string,
  ) {
    const ics = await this.requireRunning(incidentId);
    if (dto.objectives !== undefined && !(Array.isArray(dto.objectives) && dto.objectives.every((o) => typeof o === 'string'))) {
      throw new BadRequestException('objectives must be a list of strings');
    }
    if (dto.situationNotes !== undefined && dto.situationNotes !== null) {
      if (typeof dto.situationNotes !== 'string') throw new BadRequestException('situationNotes must be text');
      if (dto.situationNotes.length > ICS_SITUATION_NOTES_MAX) {
        throw new BadRequestException(`situationNotes is limited to ${ICS_SITUATION_NOTES_MAX} characters`);
      }
    }
    const notes = dto.situationNotes === undefined ? undefined : dto.situationNotes?.trim() || null;
    const objectives = dto.objectives === undefined ? undefined : cleanObjectives(dto.objectives);

    await this.prisma.incident_command_structures.update({
      where: { id: ics.id },
      data: {
        ...(objectives !== undefined && { objectives }),
        ...(notes !== undefined && { situation_notes: notes }),
        updated_at: new Date(),
      },
    });
    void this.audit.log({
      action: AuditAction.UPDATE,
      actorId,
      entityType: 'incident_command_structure',
      entityId: ics.id,
      moduleId: 'MOD-36',
      incidentId,
      oldValues: { objectives: ics.objectives, situationNotes: ics.situation_notes },
      newValues: {
        ...(objectives !== undefined && { objectives }),
        ...(notes !== undefined && { situationNotes: notes }),
      },
    });
    this.emit(incidentId, { icsUpdated: true });
    return this.get(incidentId);
  }

  // ─── Jobs ──────────────────────────────────────────────────────────────────

  /** Give someone a job. The Incident Commander has its own call (setCommander). */
  async assign(
    incidentId: string,
    dto: { userId: string; position: string; organizationId?: string },
    actorId: string,
  ) {
    if (dto.position === INCIDENT_COMMANDER) {
      const current = await this.currentCommander(incidentId);
      if (current) {
        throw new ConflictException(
          `${current.users?.full_name ?? 'Someone'} is already the Incident Commander. Use "Change commander" to hand command over.`,
        );
      }
    }
    const ics = await this.requireRunning(incidentId);
    await this.assertAssignable(dto.userId);

    const assignment = await this.inTx((tx) =>
      tx.ics_assignments.create({
        data: {
          ics_id: ics.id,
          user_id: dto.userId,
          position: dto.position as never,
          organization_id: dto.organizationId ?? null,
        },
      }),
    );

    void this.audit.log({
      action: AuditAction.CREATE,
      actorId,
      entityType: 'ics_assignment',
      entityId: assignment.id,
      moduleId: 'MOD-36',
      incidentId,
      newValues: { position: dto.position, assignedUserId: dto.userId },
    });
    this.emit(incidentId, { icsPositionAdded: dto.position, userId: dto.userId });
    this.sendNotices(incidentId, [{ kind: 'ASSIGNED', userId: dto.userId, assignmentId: assignment.id, position: dto.position }], actorId);
    return this.get(incidentId);
  }

  /**
   * Name the Incident Commander, or hand command to someone else. The current
   * commander is relieved in the same transaction, so there is never a moment with
   * two commanders, nor one with none.
   */
  async setCommander(
    incidentId: string,
    dto: { userId: string; organizationId?: string },
    actorId: string,
  ) {
    const ics = await this.requireRunning(incidentId);
    await this.assertAssignable(dto.userId);

    const notices: Notice[] = [];
    const { previous, assignment } = await this.inTx(async (tx) => {
      const prev = await tx.ics_assignments.findFirst({
        where: { ics_id: ics.id, position: INCIDENT_COMMANDER as never, relieved_at: null },
      });
      if (prev?.user_id === dto.userId) {
        throw new ConflictException('This person is already the Incident Commander.');
      }
      if (prev) {
        await tx.ics_assignments.update({ where: { id: prev.id }, data: { relieved_at: new Date() } });
        notices.push({ kind: 'RELIEVED', userId: prev.user_id, assignmentId: prev.id, position: INCIDENT_COMMANDER });
      }
      const created = await tx.ics_assignments.create({
        data: {
          ics_id: ics.id,
          user_id: dto.userId,
          position: INCIDENT_COMMANDER as never,
          organization_id: dto.organizationId ?? null,
        },
      });
      notices.push({ kind: 'ASSIGNED', userId: dto.userId, assignmentId: created.id, position: INCIDENT_COMMANDER });
      return { previous: prev, assignment: created };
    });

    void this.audit.log({
      action: previous ? AuditAction.UPDATE : AuditAction.CREATE,
      actorId,
      entityType: 'ics_assignment',
      entityId: assignment.id,
      moduleId: 'MOD-36',
      incidentId,
      ...(previous && { oldValues: { position: INCIDENT_COMMANDER, commanderUserId: previous.user_id } }),
      newValues: { event: previous ? 'COMMAND_TRANSFERRED' : 'COMMANDER_NAMED', commanderUserId: dto.userId },
    });
    this.emit(incidentId, { icsCommanderChanged: true, userId: dto.userId });
    this.sendNotices(incidentId, notices, actorId);
    return this.get(incidentId);
  }

  /** Relieve someone of a job. The row stays, stamped relieved_at. */
  async relieve(incidentId: string, assignmentId: string, actorId: string) {
    const assignment = await this.prisma.ics_assignments.findUnique({
      where: { id: assignmentId },
      include: { incident_command_structures: { select: { incident_id: true, deactivated_at: true } } },
    });
    // The assignment must belong to the incident in the URL.
    if (!assignment || assignment.incident_command_structures.incident_id !== incidentId) {
      throw new NotFoundException('Command job not found for this incident');
    }
    if (assignment.relieved_at) throw new ConflictException('This person was already relieved of this job.');
    if (assignment.incident_command_structures.deactivated_at) {
      throw new ConflictException('Command has ended for this incident.');
    }

    await this.prisma.ics_assignments.update({ where: { id: assignmentId }, data: { relieved_at: new Date() } });

    void this.audit.log({
      action: AuditAction.UPDATE,
      actorId,
      entityType: 'ics_assignment',
      entityId: assignmentId,
      moduleId: 'MOD-36',
      incidentId,
      oldValues: { position: assignment.position, assignedUserId: assignment.user_id, relievedAt: null },
      newValues: { event: 'RELIEVED' },
    });
    this.emit(incidentId, { icsPositionRelieved: assignment.position, userId: assignment.user_id });
    this.sendNotices(
      incidentId,
      [{ kind: 'RELIEVED', userId: assignment.user_id, assignmentId, position: assignment.position }],
      actorId,
    );
    return this.get(incidentId);
  }

  // ─── End ───────────────────────────────────────────────────────────────────

  async end(incidentId: string, actorId: string | undefined, reason?: string) {
    const ics = await this.requireRunning(incidentId, { forEnd: true });
    const now = new Date();
    const holders = await this.prisma.ics_assignments.findMany({
      where: { ics_id: ics.id, relieved_at: null },
      select: { id: true, user_id: true, position: true },
    });

    await this.inTx(async (tx) => {
      await tx.ics_assignments.updateMany({ where: { ics_id: ics.id, relieved_at: null }, data: { relieved_at: now } });
      await tx.incident_command_structures.update({
        where: { id: ics.id },
        data: { deactivated_at: now, updated_at: now },
      });
    });

    void this.audit.log({
      action: AuditAction.UPDATE,
      ...(actorId && { actorId }),
      entityType: 'incident_command_structure',
      entityId: ics.id,
      moduleId: 'MOD-36',
      incidentId,
      // The plan and team as they stood when command ended.
      oldValues: {
        objectives: ics.objectives,
        situationNotes: ics.situation_notes,
        team: holders.map((h) => ({ position: h.position, userId: h.user_id })),
      },
      newValues: { event: 'COMMAND_ENDED', ...(reason && { reason }) },
    });
    this.emit(incidentId, { icsDeactivated: true });
    this.sendNotices(
      incidentId,
      holders.map((h) => ({ kind: 'COMMAND_ENDED' as const, userId: h.user_id, assignmentId: h.id, position: h.position })),
      actorId,
    );
    return this.get(incidentId);
  }

  /**
   * Ends command when the incident itself is resolved or closed. Never throws: a
   * failure here must not undo the status change.
   */
  async endIfRunning(incidentId: string, actorId: string | undefined, reason: string): Promise<void> {
    try {
      const ics = await this.prisma.incident_command_structures.findUnique({
        where: { incident_id: incidentId },
        select: { deactivated_at: true },
      });
      if (ics && !ics.deactivated_at) await this.end(incidentId, actorId, reason);
    } catch (err) {
      this.logger.warn(`Auto-ending command for incidentId=${incidentId} failed: ${String(err)}`);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Command must be running; changes (other than ending it) also need the incident still open. */
  private async requireRunning(incidentId: string, opts: { forEnd?: boolean } = {}) {
    const found = await this.prisma.incident_command_structures.findUnique({
      where: { incident_id: incidentId },
      include: { incidents: { select: { status: true } } },
    });
    if (!found) throw new NotFoundException('This incident is not under Incident Command.');
    if (found.deactivated_at) throw new ConflictException('Command has ended for this incident. Start it again first.');
    if (!opts.forEnd && isFinished(found.incidents.status)) {
      throw new ConflictException('This incident is resolved or closed. Command can only be ended now.');
    }
    const { incidents: _incident, ...ics } = found;
    return ics;
  }

  private currentCommander(incidentId: string) {
    return this.prisma.ics_assignments.findFirst({
      where: {
        position: INCIDENT_COMMANDER as never,
        relieved_at: null,
        incident_command_structures: { incident_id: incidentId, deactivated_at: null },
      },
      include: { users: { select: { full_name: true } } },
    });
  }

  private async assertAssignable(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true },
    });
    if (!user) throw new BadRequestException('That person was not found.');
    if (user.status !== 'ACTIVE') throw new BadRequestException('That account is not active.');
    if (!ASSIGNABLE_ROLES.includes(user.role)) {
      throw new BadRequestException('Command jobs go to Supervisors, Dispatchers and Responders.');
    }
  }

  /** Runs a transaction and turns a broken one-holder rule into a clear 409. */
  private async inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = JSON.stringify(err.meta ?? {});
        throw new ConflictException(
          target.includes('one_commander') || target.includes('"ics_id"]')
            ? 'This incident already has an Incident Commander. Use "Change commander" to hand command over.'
            : 'This person already holds that job.',
        );
      }
      throw err;
    }
  }

  private emit(incidentId: string, payload: Record<string, unknown>) {
    this.realtime.incidentUpdated(incidentId, { ics: true, ...payload });
  }

  /** Not awaited: a slow queue must not hold the request. Nobody is told about their own action. */
  private sendNotices(incidentId: string, notices: Notice[], actorId: string | undefined) {
    if (!this.notifier) return;
    for (const n of notices) {
      if (n.userId === actorId) continue;
      void this.notifier.notify({ ...n, incidentId });
    }
  }
}

/** Resolved, or in a terminal status (closed, cancelled, false alert, duplicate...). */
function isFinished(status: string): boolean {
  return status === IncidentStatus.RESOLVED || TERMINAL_INCIDENT_STATUSES.has(status as IncidentStatus);
}

function cleanObjectives(objectives: string[] | undefined): string[] {
  return (objectives ?? []).map((o) => o.trim()).filter(Boolean);
}

export function icsPositionLabel(position: string): string {
  return ICS_POSITION_LABELS[position] ?? position;
}
