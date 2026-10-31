import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FIRE_ALARM_LEVEL_LABELS,
  NOTIFICATION_EVENT_TYPES,
  UNIT_FIELD_FLOWS,
  UserRole,
  isAlarmLevelAtLeast,
  type FireAlarmLevel,
  type FireReportAlertReason,
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
import { SubmitFireReportDto } from './dto/submit-fire-report.dto';

/** The unit a report came from, for the ops drawer's history. Never a crew name. */
export const FIRE_REPORT_INCLUDE = {
  dispatches: { select: { resources: { select: { name: true, call_sign: true } } } },
} satisfies Prisma.fire_field_reportsInclude;

type FireReportRow = Prisma.fire_field_reportsGetPayload<object>;

export interface FireReportAlert {
  reason: FireReportAlertReason;
  title: string;
  body: string;
}

/**
 * What in a report should reach dispatchers and supervisors (D1). Counts, codes and
 * the alarm level only: never notes. It only builds notices; it never acts.
 */
export function fireReportAlerts(
  report: Pick<FireReportRow, 'hazards' | 'trapped_persons' | 'alarm_level' | 'casualties_seen'>,
  reference: string,
  ambulanceOnIncident: boolean,
): FireReportAlert[] {
  const alerts: FireReportAlert[] = [];
  if (report.hazards.includes('FIREWORKS_EXPLOSIVES')) {
    alerts.push({
      reason: 'FIREWORKS_EXPLOSIVES',
      title: 'Fire report: fireworks or explosives',
      body: `${reference}: fireworks or explosives on scene. Consider an ambulance, more units or surge.`,
    });
  }
  if ((report.trapped_persons ?? 0) > 0) {
    alerts.push({
      reason: 'TRAPPED_PERSONS',
      title: 'Fire report: people trapped',
      body: `${reference}: ${report.trapped_persons} trapped. Consider an ambulance and a rescue unit.`,
    });
  }
  if (isAlarmLevelAtLeast(report.alarm_level)) {
    const level = FIRE_ALARM_LEVEL_LABELS[report.alarm_level as FireAlarmLevel];
    alerts.push({
      reason: 'HIGH_ALARM',
      title: `Fire report: ${level}`,
      body: `${reference}: ${level}. Consider more units or surge.`,
    });
  }
  if ((report.casualties_seen ?? 0) > 0 && !ambulanceOnIncident) {
    alerts.push({
      reason: 'CASUALTIES_NO_AMBULANCE',
      title: 'Fire report: casualties, no ambulance',
      body: `${reference}: ${report.casualties_seen} casualties seen and no ambulance on this incident. Consider sending one.`,
    });
  }
  return alerts;
}

/**
 * Fire truck field reports (MOD-32/36, unit field flow plan Phase 3).
 *
 * Same shape as AssessmentService: crew check, write, then best-effort audit, ops
 * event and notices, none of which can undo the report. Append-only: every report is
 * a new row (the database refuses an UPDATE) and the latest is the current picture.
 * A report never dispatches, activates surge, or changes the incident status.
 */
@Injectable()
export class FireReportService {
  private readonly logger = new Logger(FireReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(incidentId: string) {
    return this.prisma.fire_field_reports.findMany({
      where: { incident_id: incidentId },
      orderBy: { reported_at: 'desc' },
      include: FIRE_REPORT_INCLUDE,
    });
  }

  async submit(incidentId: string, dto: SubmitFireReportDto, actor: { id: string; role: string }) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { id: true, public_reference: true },
    });
    if (!incident) throw new NotFoundException(`Incident ${incidentId} not found`);

    // An offline resend (same client request ID) gets the first report back.
    const repeat = await this.findRepeat(dto.clientRequestId, incidentId, actor.id);
    if (repeat) return repeat;

    const dispatchId = actor.role === UserRole.RESPONDER
      ? await assertFlowCrew(this.prisma, {
          incidentId,
          responderId: actor.id,
          flow: UNIT_FIELD_FLOWS.FIRE,
          code: 'FIRE_REPORT_NOT_FOR_UNIT',
          message: 'Only a fire unit files a fire report.',
        })
      : await radioDispatch(this.prisma, incidentId, dto.dispatchId);

    let report: FireReportRow;
    try {
      report = await this.prisma.fire_field_reports.create({
        data: {
          incident_id: incidentId,
          dispatch_id: dispatchId,
          reported_by_id: actor.id,
          alarm_level: dto.alarmLevel ?? null,
          fire_status: dto.fireStatus ?? null,
          structures_involved: dto.structuresInvolved ?? null,
          occupancy_type: dto.occupancyType ?? null,
          hazards: dto.hazards ?? [],
          spreading: dto.spreading ?? null,
          evacuation_needed: dto.evacuationNeeded ?? null,
          casualties_seen: dto.casualtiesSeen ?? null,
          trapped_persons: dto.trappedPersons ?? null,
          notes: dto.notes?.trim() || null,
          client_request_id: dto.clientRequestId ?? null,
        },
      });
    } catch (err) {
      // The same resend arriving twice at once: the first one's row stands.
      if (dto.clientRequestId && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const first = await this.findRepeat(dto.clientRequestId, incidentId, actor.id);
        if (first) return first;
      }
      throw err;
    }

    // Immutable audit trail (MOD-46) — best-effort, never blocks the report. No notes.
    try {
      await this.audit.log({
        action: 'CREATE',
        actorId: actor.id,
        actorRole: actor.role,
        entityType: 'fire_field_report',
        entityId: report.id,
        moduleId: 'MOD-36',
        incidentId,
        newValues: {
          dispatchId,
          fireStatus: report.fire_status,
          alarmLevel: report.alarm_level,
          hazards: report.hazards,
          structuresInvolved: report.structures_involved,
          casualtiesSeen: report.casualties_seen,
          trappedPersons: report.trapped_persons,
          hasNote: report.notes != null,
        },
      });
    } catch (err) {
      this.logger.warn(`Audit log failed for fire report ${report.id}: ${String(err)}`);
    }

    // The ops drawer and queue (best-effort). Statuses, codes and counts only.
    try {
      this.realtime.fieldReport({
        incidentId,
        kind: 'FIRE',
        reportId: report.id,
        dispatchId,
        reportedAt: report.reported_at.toISOString(),
        fireStatus: report.fire_status,
        alarmLevel: report.alarm_level,
        hazards: report.hazards,
        casualtiesSeen: report.casualties_seen,
        trappedPersons: report.trapped_persons,
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for fire report ${report.id}: ${String(err)}`);
    }

    try {
      await this.notifyDangerousFindings(report, incident.public_reference);
    } catch (err) {
      this.logger.warn(`Fire report notices failed for ${incidentId}: ${String(err)}`);
    }

    return report;
  }

  private findRepeat(clientRequestId: string | undefined, incidentId: string, actorId: string) {
    return findRepeatReport(
      (id) => this.prisma.fire_field_reports.findUnique({ where: { client_request_id: id } }),
      clientRequestId,
      incidentId,
      actorId,
    );
  }

  /**
   * IN_APP notice to Dispatchers and Supervisors for each dangerous finding, once per
   * incident + reason per 10 minutes. A person decides; nothing is dispatched here.
   */
  private async notifyDangerousFindings(report: FireReportRow, reference: string): Promise<void> {
    const ambulanceOnIncident = (report.casualties_seen ?? 0) > 0
      ? await hasActiveAmbulance(this.prisma, report.incident_id)
      : true;
    const alerts = fireReportAlerts(report, reference, ambulanceOnIncident);
    if (alerts.length === 0) return;

    for (const alert of alerts) {
      await notifyStaffOnce(
        { prisma: this.prisma, notifications: this.notifications, logger: this.logger },
        {
          eventType: NOTIFICATION_EVENT_TYPES.FIRE_REPORT_ALERT,
          incidentId: report.incident_id,
          reason: alert.reason,
          roles: ['DISPATCHER', 'SUPERVISOR'],
          title: alert.title,
          body: alert.body,
          dataPayload: {
            incidentId: report.incident_id,
            reason: alert.reason,
            reportId: report.id,
            fireStatus: report.fire_status,
            alarmLevel: report.alarm_level,
            hazards: report.hazards,
            casualtiesSeen: report.casualties_seen,
            trappedPersons: report.trapped_persons,
          },
        },
      );
    }
  }
}
