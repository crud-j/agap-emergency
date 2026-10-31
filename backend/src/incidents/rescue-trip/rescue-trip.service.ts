import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  NOTIFICATION_EVENT_TYPES,
  RESCUE_PART_COUNTS,
  RESCUE_COUNT_LABELS,
  UNIT_FIELD_FLOWS,
  UserRole,
} from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  assertFlowCrew,
  findRepeatReport,
  hasActiveAmbulance,
  notifyStaffOnce,
  radioDispatch,
} from '../field-report-access';
import { latestStillWaiting, summarizeRescueTrips } from './rescue-summary';
import { SubmitRescueTripDto } from './dto/submit-rescue-trip.dto';

/** The unit and destination of a trip, for the ops drawer. Never a crew name. */
export const RESCUE_TRIP_INCLUDE = {
  dispatches: { select: { resources: { select: { name: true, call_sign: true } } } },
  facilities: { select: { id: true, name: true } },
} satisfies Prisma.rescue_trip_reportsInclude;

type RescueTripRow = Prisma.rescue_trip_reportsGetPayload<{ include: { facilities: { select: { name: true } } } }>;

/**
 * The D2 rules class-validator can't express on one field: each vulnerable count (and
 * families) is at most the people rescued, and the destination fields match `takenTo`.
 */
export function rescueTripProblems(dto: SubmitRescueTripDto): string[] {
  const problems: string[] = [];
  if (dto.rescuedCount != null) {
    for (const part of RESCUE_PART_COUNTS) {
      const value = dto[part];
      if (value != null && value > dto.rescuedCount) {
        problems.push(`${RESCUE_COUNT_LABELS[part]} (${value}) can't be more than people rescued (${dto.rescuedCount}).`);
      }
    }
  }
  if (dto.takenTo === 'EVACUATION_CENTER' && !dto.takenToFacilityId) {
    problems.push('Choose the evacuation center.');
  }
  if (dto.takenToFacilityId && dto.takenTo !== 'EVACUATION_CENTER') {
    problems.push('A facility is given only when people were taken to an evacuation center.');
  }
  if (dto.takenToOther?.trim() && dto.takenTo !== 'OTHER') {
    problems.push('"Other" place text is given only when taken to is OTHER.');
  }
  return problems;
}

/**
 * The "people still waiting" notice when a rescue crew finishes (Phase 4). Called by
 * RespondersService after the crew's Finish is saved; best-effort, never throws. A
 * notice to dispatchers, who decide: nothing is dispatched here.
 */
export async function notifyRescueStillWaiting(
  deps: { prisma: PrismaService; notifications: NotificationsService; logger: Logger },
  input: { incidentId: string; dispatchId: string; callSign: string | null },
): Promise<void> {
  try {
    const trips = await deps.prisma.rescue_trip_reports.findMany({
      where: { incident_id: input.incidentId, still_waiting: { not: null } },
      orderBy: { reported_at: 'desc' },
      take: 1,
      select: { still_waiting: true, reported_at: true },
    });
    const waiting = latestStillWaiting(trips)?.still_waiting ?? 0;
    if (waiting <= 0) return;
    const incident = await deps.prisma.incident.findUnique({
      where: { id: input.incidentId },
      select: { public_reference: true },
    });
    await notifyStaffOnce(deps, {
      eventType: NOTIFICATION_EVENT_TYPES.RESCUE_PEOPLE_WAITING,
      incidentId: input.incidentId,
      roles: ['DISPATCHER'],
      title: 'Rescue unit finished, people still waiting',
      body: `${incident?.public_reference ?? 'Incident'}: ${input.callSign ?? 'A rescue unit'} finished with about ${waiting} still waiting. Send another unit?`,
      dataPayload: { incidentId: input.incidentId, dispatchId: input.dispatchId, stillWaiting: waiting },
    });
  } catch (err) {
    deps.logger.warn(`Still-waiting notice failed for ${input.incidentId}: ${String(err)}`);
  }
}

/**
 * Rescue boat / truck trip log (MOD-32/52, unit field flow plan Phase 4).
 *
 * Same shape as FireReportService: crew check, write, then best-effort audit, ops event
 * and notices, none of which can undo the trip. Append-only: one row per trip (the
 * database refuses an UPDATE). A trip never writes a TransportRecord (transport stays
 * hospital-only), never dispatches, and never changes the incident status.
 */
@Injectable()
export class RescueTripService {
  private readonly logger = new Logger(RescueTripService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Running totals and every trip, newest first (the ops drawer and the crew's screen). */
  async summary(incidentId: string) {
    const trips = await this.prisma.rescue_trip_reports.findMany({
      where: { incident_id: incidentId },
      orderBy: { reported_at: 'desc' },
      include: RESCUE_TRIP_INCLUDE,
    });
    return { ...summarizeRescueTrips(trips), trips };
  }

  async submit(incidentId: string, dto: SubmitRescueTripDto, actor: { id: string; role: string }) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, public_reference: true },
    });
    if (!incident) throw new NotFoundException(`Incident ${incidentId} not found`);

    // An offline resend (same client request ID) gets the first trip back.
    const repeat = await this.findRepeat(dto.clientRequestId, incidentId, actor.id);
    if (repeat) return repeat;

    const problems = rescueTripProblems(dto);
    if (problems.length > 0) throw new BadRequestException(problems);

    const dispatchId = actor.role === UserRole.RESPONDER
      ? await assertFlowCrew(this.prisma, {
          incidentId,
          responderId: actor.id,
          flow: UNIT_FIELD_FLOWS.RESCUE,
          code: 'RESCUE_TRIP_NOT_FOR_UNIT',
          message: 'Only a rescue unit logs a rescue trip.',
        })
      : await radioDispatch(this.prisma, incidentId, dto.dispatchId);

    if (dto.takenToFacilityId) {
      const facility = await this.prisma.facility.findFirst({
        where: { id: dto.takenToFacilityId, is_active: true, facility_type: 'EVACUATION_CENTER' },
        select: { id: true },
      });
      if (!facility) throw new BadRequestException('Choose an active evacuation center.');
    }

    let trip: RescueTripRow;
    try {
      trip = await this.prisma.rescue_trip_reports.create({
        data: {
          incident_id: incidentId,
          dispatch_id: dispatchId,
          reported_by_id: actor.id,
          rescued_count: dto.rescuedCount ?? null,
          families: dto.families ?? null,
          children: dto.children ?? null,
          elderly: dto.elderly ?? null,
          pwd: dto.pwd ?? null,
          pregnant: dto.pregnant ?? null,
          still_waiting: dto.stillWaiting ?? null,
          water_level: dto.waterLevel ?? null,
          access: dto.access ?? null,
          taken_to: dto.takenTo ?? null,
          taken_to_facility_id: dto.takenToFacilityId ?? null,
          taken_to_other: dto.takenTo === 'OTHER' ? dto.takenToOther?.trim() || null : null,
          notes: dto.notes?.trim() || null,
          client_request_id: dto.clientRequestId ?? null,
        },
        include: { facilities: { select: { name: true } } },
      });
    } catch (err) {
      // The same resend arriving twice at once: the first one's row stands.
      if (dto.clientRequestId && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const first = await this.findRepeat(dto.clientRequestId, incidentId, actor.id);
        if (first) return first;
      }
      throw err;
    }

    const counts = {
      rescuedCount: trip.rescued_count,
      families: trip.families,
      children: trip.children,
      elderly: trip.elderly,
      pwd: trip.pwd,
      pregnant: trip.pregnant,
      stillWaiting: trip.still_waiting,
    };

    // Immutable audit trail (MOD-46) — best-effort, never blocks the trip. No notes.
    try {
      await this.audit.log({
        action: 'CREATE',
        actorId: actor.id,
        actorRole: actor.role,
        entityType: 'rescue_trip_report',
        entityId: trip.id,
        moduleId: 'MOD-32',
        incidentId,
        newValues: {
          dispatchId,
          ...counts,
          waterLevel: trip.water_level,
          access: trip.access,
          takenTo: trip.taken_to,
          takenToFacilityId: trip.taken_to_facility_id,
          hasNote: trip.notes != null,
        },
      });
    } catch (err) {
      this.logger.warn(`Audit log failed for rescue trip ${trip.id}: ${String(err)}`);
    }

    // The ops drawer, queue and surge page (best-effort). Counts, codes and the
    // destination's name only: never notes or the free-text "other" place.
    try {
      this.realtime.fieldReport({
        incidentId,
        kind: 'RESCUE',
        reportId: trip.id,
        dispatchId,
        reportedAt: trip.reported_at.toISOString(),
        ...counts,
        waterLevel: trip.water_level,
        access: trip.access,
        takenTo: trip.taken_to,
        takenToFacilityName: trip.facilities?.name ?? null,
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for rescue trip ${trip.id}: ${String(err)}`);
    }

    // Handed to an ambulance, but none is on the incident: suggest one (a person decides).
    if (trip.taken_to === 'HANDED_TO_AMBULANCE') {
      try {
        if (!(await hasActiveAmbulance(this.prisma, incidentId))) {
          await notifyStaffOnce(
            { prisma: this.prisma, notifications: this.notifications, logger: this.logger },
            {
              eventType: NOTIFICATION_EVENT_TYPES.RESCUE_AMBULANCE_SUGGESTED,
              incidentId,
              roles: ['DISPATCHER'],
              title: 'Rescue trip: no ambulance on this incident',
              body: `${incident.public_reference}: ${trip.rescued_count ?? 'Some'} rescued were handed to an ambulance, but none is dispatched here. Consider sending one.`,
              dataPayload: { incidentId, reportId: trip.id, rescuedCount: trip.rescued_count },
            },
          );
        }
      } catch (err) {
        this.logger.warn(`Rescue ambulance notice failed for ${incidentId}: ${String(err)}`);
      }
    }

    return trip;
  }

  private findRepeat(clientRequestId: string | undefined, incidentId: string, actorId: string) {
    return findRepeatReport(
      (id) => this.prisma.rescue_trip_reports.findUnique({
        where: { client_request_id: id },
        include: { facilities: { select: { name: true } } },
      }),
      clientRequestId,
      incidentId,
      actorId,
    );
  }
}
