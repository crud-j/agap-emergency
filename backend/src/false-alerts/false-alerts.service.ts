import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { IncidentsService } from '../incidents/incidents.service';
import { IncidentStatusService } from '../incidents/incident-status/incident-status.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { IncidentStatus, AuditAction, UserRole } from '@agap/shared';
import { type Incident } from '@prisma/client';
import { CancellationReason } from './dto/cancel-incident.dto';

const DISPATCHER_ROLES = new Set<string>([
  UserRole.DISPATCHER,
  UserRole.SUPERVISOR,
  UserRole.ORG_ADMINISTRATOR,
  UserRole.SYSTEM_ADMINISTRATOR,
]);

// Statuses from which a citizen reporter can initiate cancellation (pre-dispatch)
const CITIZEN_CANCELLABLE: ReadonlySet<IncidentStatus> = new Set([
  IncidentStatus.DRAFT,
  IncidentStatus.SUBMITTED,
  IncidentStatus.RECEIVED,
  IncidentStatus.ACKNOWLEDGED,
  IncidentStatus.ASSESSED,
  IncidentStatus.DISPATCH_PENDING,
]);

@Injectable()
export class FalseAlertsService {
  private readonly logger = new Logger(FalseAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly incidents: IncidentsService,
    private readonly statusService: IncidentStatusService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Cancel an incident.
   *
   * Authorization:
   *  - Dispatchers/Supervisors/Admins: any cancellable status.
   *  - Citizens/Bystanders (reporters): pre-dispatch states only; ownership required.
   *  - Responders: forbidden.
   *
   * Persists reason in incidentEvent.notes and, if an alert_trigger record
   * exists for this incident, also updates the trigger's cancellation_reason.
   */
  async cancel(
    incidentId: string,
    actorId: string,
    actorRole: string,
    reason: CancellationReason,
    notes?: string,
  ): Promise<Incident> {
    // Responders cannot cancel
    if (actorRole === UserRole.RESPONDER) {
      throw new ForbiddenException('Responders cannot cancel incidents');
    }

    const incident = await this.incidents.findById(incidentId);
    const currentStatus = incident.status as unknown as IncidentStatus;

    // Citizens: ownership + pre-dispatch window
    if (!DISPATCHER_ROLES.has(actorRole)) {
      const reporter = (incident as any).incident_reporters;
      if (!reporter || reporter.user_id !== actorId) {
        throw new ForbiddenException('You can only cancel your own incidents');
      }
      if (!CITIZEN_CANCELLABLE.has(currentStatus)) {
        throw new BadRequestException(
          `Cancellation is not available once the incident has been dispatched. Current status: ${currentStatus}`,
        );
      }
    }

    // Validate lifecycle transition (throws 400 on invalid)
    this.statusService.validateTransition(currentStatus, IncidentStatus.CANCELLED);

    const now = new Date();
    const eventNotes = notes ? `${reason}: ${notes}` : reason;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.incident.update({
        where: { id: incidentId },
        data: { status: IncidentStatus.CANCELLED as any },
      });

      await tx.incidentEvent.create({
        data: {
          incident_id: incidentId,
          from_status: incident.status as any,
          to_status: IncidentStatus.CANCELLED as any,
          triggered_by_id: actorId,
          notes: eventNotes,
        },
      });

      // Persist cancellation_reason on the alert_trigger if one exists.
      // Best-effort — trigger record may not exist for all submission paths.
      try {
        await tx.alert_triggers.updateMany({
          where: { incident_id: incidentId, was_cancelled: false },
          data: {
            was_cancelled: true,
            cancelled_at: now,
            cancellation_reason: reason as any,
          },
        });
      } catch {
        // Non-critical — trigger record may not exist; incident update already committed
      }

      return result;
    });

    // Audit — insert-only, never blocks the operation
    void this.audit.log({
      action: AuditAction.STATUS_CHANGE,
      actorId,
      actorRole,
      entityId: incidentId,
      entityType: 'Incident',
      incidentId,
      oldValues: { status: currentStatus },
      newValues: { status: IncidentStatus.CANCELLED, reason: eventNotes },
    });

    // Emit — best-effort, failure must never undo the persisted transition
    try {
      this.realtime.statusChanged({
        incidentId,
        previousStatus: currentStatus,
        newStatus: IncidentStatus.CANCELLED,
        changedAt: now.toISOString(),
        changedBy: actorId,
        reason: eventNotes,
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for incident.cancelled: ${String(err)}`);
    }

    return updated;
  }

  /**
   * Mark an incident as a false alert.
   * Dispatcher/Supervisor/Admin only. Valid from ACKNOWLEDGED or ASSESSED.
   */
  async markFalseAlert(
    incidentId: string,
    actorId: string,
    actorRole: string,
    notes?: string,
  ): Promise<Incident> {
    if (!DISPATCHER_ROLES.has(actorRole)) {
      throw new ForbiddenException('Only dispatchers or supervisors can mark incidents as false alerts');
    }

    const incident = await this.incidents.findById(incidentId);
    const currentStatus = incident.status as unknown as IncidentStatus;

    // Validates the transition; throws 400 if not allowed (e.g. already dispatched)
    this.statusService.validateTransition(currentStatus, IncidentStatus.FALSE_ALERT);

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.incident.update({
        where: { id: incidentId },
        data: { status: IncidentStatus.FALSE_ALERT as any },
      });

      await tx.false_alerts.create({
        data: {
          incident_id: incidentId,
          classified_by_id: actorId,
          false_alert_type: 'MISIDENTIFIED' as any,
          notes: notes ?? null,
        },
      });

      await tx.incidentEvent.create({
        data: {
          incident_id: incidentId,
          from_status: incident.status as any,
          to_status: IncidentStatus.FALSE_ALERT as any,
          triggered_by_id: actorId,
          notes: notes ?? null,
        },
      });

      return result;
    });

    void this.audit.log({
      action: AuditAction.STATUS_CHANGE,
      actorId,
      actorRole,
      entityId: incidentId,
      entityType: 'Incident',
      incidentId,
      oldValues: { status: currentStatus },
      newValues: { status: IncidentStatus.FALSE_ALERT, notes },
    });

    try {
      this.realtime.statusChanged({
        incidentId,
        previousStatus: currentStatus,
        newStatus: IncidentStatus.FALSE_ALERT,
        changedAt: now.toISOString(),
        changedBy: actorId,
        ...(notes ? { reason: notes } : {}),
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for false-alert status change: ${String(err)}`);
    }

    return updated;
  }
}
