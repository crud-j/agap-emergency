import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, IncidentStatus, TERMINAL_INCIDENT_STATUSES } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { IncidentsService } from '../incidents/incidents.service';
import { BarangayNotifyService, configuredOpsPhone } from './barangay-notify.service';
import { BarangayLinkService, type LinkedNotice } from './barangay-link.service';
import type { BarangayLinkStatus, BarangayOutcome } from './dto/barangay-callback.dto';

export interface CallbackActor {
  id: string;
  role: string;
}

/** Set when a dispatcher accepted an AI reading of a free-text SMS reply (AI Assist). */
export interface SmsReportOptions {
  actorId?: string;
  actorRole?: string;
  aiSuggestionId?: string;
}

/** The incident has no barangay notice, or the contact is not one of its barangay's. */
export class BarangayCallbackNotFoundError extends Error {}

/** The action is not allowed in the notice or incident's current state. */
export class BarangayCallbackRefusedError extends Error {}

const OUTCOME_LABEL: Record<BarangayOutcome | BarangayLinkStatus, string> = {
  SEEN: 'barangay has seen the alert',
  ON_THE_WAY: 'barangay is acting on it',
  ON_SCENE: 'barangay is on scene',
  HANDLED: 'barangay reports the case completed',
  NEEDS_BACKUP: 'barangay needs backup',
  NO_ANSWER: 'no answer',
};

/** What the public status page shows. Deliberately no reporter or patient data. */
export interface BarangayLinkView {
  closed: boolean;
  barangayName: string;
  reference: string;
  category: string;
  /** Hidden once the case is closed: the position is only for responders on an open case. */
  location: {
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
    address: string | null;
    landmark: string | null;
    isApproximateBarangay: boolean;
  } | null;
  reportedAt: string;
  lastReport: string | null;
  lastReportAt: string | null;
  mdrrmoPhone: string | null;
}

/**
 * Phase 4 (option A): the dispatcher phones the barangay and records what happened.
 * Everything here is information for the dispatcher. None of it dispatches a unit, and
 * the only lifecycle change (confirmHandled) is an explicit dispatcher action.
 */
@Injectable()
export class BarangayCallbackService {
  private readonly logger = new Logger(BarangayCallbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly notify: BarangayNotifyService,
    private readonly incidents: IncidentsService,
    private readonly links: BarangayLinkService,
    private readonly config: ConfigService,
  ) {}

  /** The status page behind the SMS link. Null for a malformed or forged token. */
  async viewByLink(token: string): Promise<BarangayLinkView | null> {
    const notice = await this.links.resolve(token);
    if (!notice) return null;

    const incident = await this.prisma.incident.findUnique({
      where: { id: notice.incident_id },
      select: {
        public_reference: true,
        category: true,
        status: true,
        submitted_at: true,
        incident_locations: {
          select: { latitude: true, longitude: true, accuracy_meters: true, formatted_address: true, landmark: true },
        },
      },
    });
    if (!incident) return null;

    const closed =
      notice.closed_at !== null || TERMINAL_INCIDENT_STATUSES.has(incident.status as unknown as IncidentStatus);
    const loc = incident.incident_locations;
    const hasPosition =
      !!loc && Number.isFinite(Number(loc.latitude)) && !(Number(loc.latitude) === 0 && Number(loc.longitude) === 0);

    return {
      closed,
      barangayName: notice.barangay.name,
      reference: incident.public_reference,
      category: incident.category,
      location:
        !closed && hasPosition
          ? {
              latitude: Number(loc!.latitude),
              longitude: Number(loc!.longitude),
              accuracyMeters: loc!.accuracy_meters === null ? null : Number(loc!.accuracy_meters),
              address: loc!.formatted_address ?? null,
              landmark: loc!.landmark ?? null,
              isApproximateBarangay: notice.is_approximate,
            }
          : null,
      reportedAt: incident.submitted_at.toISOString(),
      lastReport: notice.last_report,
      lastReportAt: notice.last_report_at?.toISOString() ?? null,
      mdrrmoPhone: configuredOpsPhone(this.config.get<string>('MDRRMO_OPS_PHONE')),
    };
  }

  /**
   * One tap on the status page. No login: the signed link is the credential. Recorded as a
   * barangay report from source LINK, shown to the dispatcher live and on the timeline.
   * Repeating the current status is a no-op; a mistaken tap can be corrected by tapping again.
   */
  async reportByLink(token: string, status: BarangayLinkStatus): Promise<BarangayLinkView> {
    const notice = await this.links.resolve(token);
    if (!notice) throw new BarangayCallbackNotFoundError('This link is not valid');
    if (notice.closed_at !== null) {
      throw new BarangayCallbackRefusedError('This case is closed. No update is needed.');
    }
    if (!(await this.applyBarangayReport(notice, status, 'LINK'))) {
      throw new BarangayCallbackNotFoundError('This link is not valid');
    }

    const view = await this.viewByLink(token);
    if (!view) throw new BarangayCallbackNotFoundError('This link is not valid');
    return view;
  }

  /**
   * A barangay SMS reply (Phase 5) that BarangayReplyService has already matched to this
   * open notice. Recorded exactly like a status-page tap. Never changes incident status.
   * `opts` is set when a dispatcher accepted an AI reading of a free-text reply (AI Assist):
   * the report is then recorded under that dispatcher, with the suggestion ID.
   */
  async reportBySms(notice: LinkedNotice, status: BarangayLinkStatus, opts?: SmsReportOptions): Promise<void> {
    if (notice.closed_at !== null) throw new BarangayCallbackRefusedError('This case is closed.');
    if (!(await this.applyBarangayReport(notice, status, 'SMS_REPLY', opts))) {
      throw new BarangayCallbackNotFoundError('Incident not found');
    }
  }

  /**
   * Records a report the barangay sent itself (status page or SMS reply): no logged-in
   * user, unless a dispatcher accepted an AI reading of the reply (`opts`). Repeating the
   * current status is a no-op, so a mistaken report is corrected by sending the right one.
   * False when the incident no longer exists.
   */
  private async applyBarangayReport(
    notice: LinkedNotice,
    status: BarangayLinkStatus,
    source: 'LINK' | 'SMS_REPLY',
    opts?: SmsReportOptions,
  ): Promise<boolean> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: notice.incident_id },
      select: { status: true, public_reference: true },
    });
    if (!incident) return false;
    if (notice.last_report === status) return true;

    await this.prisma.incident_barangay_notices.update({
      where: { id: notice.id },
      data: {
        last_report: status,
        last_report_source: source,
        last_report_at: new Date(),
        last_report_by_user_id: opts?.actorId ?? null,
      },
    });
    const actor = opts?.actorId ? { id: opts.actorId, role: opts.actorRole ?? null } : null;
    await this.timeline(
      notice.incident_id,
      actor,
      `Brgy ${notice.barangay.name} via ${source === 'LINK' ? 'link' : 'SMS reply'}: ${OUTCOME_LABEL[status]}.` +
        (opts?.aiSuggestionId ? ' (AI reading of a free-text reply, accepted by the dispatcher)' : ''),
    );
    await this.audit.log({
      action: AuditAction.UPDATE,
      ...(opts?.actorId && { actorId: opts.actorId }),
      entityType: 'incident_barangay_notice',
      entityId: notice.id,
      moduleId: 'MOD-34',
      incidentId: notice.incident_id,
      oldValues: { last_report: notice.last_report },
      newValues: { last_report: status, source, ...(opts?.aiSuggestionId && { aiSuggestionId: opts.aiSuggestionId }) },
    });
    if (status === 'NEEDS_BACKUP') await this.escalate(notice.incident_id, notice.barangay.name, incident, undefined);
    await this.notify.emitUpdated(notice.id);
    return true;
  }

  /** The dispatcher tapped a barangay number: put the attempt on the timeline. */
  async logCallAttempt(incidentId: string, contactId: string, actor: CallbackActor): Promise<void> {
    const notice = await this.openNotice(incidentId);
    const contact = await this.prisma.barangay_contacts.findFirst({
      where: { id: contactId, barangay_id: notice.barangay_id, is_active: true },
      select: { role: true, label: true },
    });
    if (!contact) throw new BarangayCallbackNotFoundError('That number is not on file for this barangay');

    const who = `${contact.role.toLowerCase()}${contact.label ? ` (${contact.label})` : ''}`;
    await this.timeline(incidentId, actor, `Called Brgy ${notice.barangay.name} ${who} number`);
    await this.audit.log({
      action: AuditAction.UPDATE,
      actorId: actor.id,
      entityType: 'incident_barangay_notice',
      entityId: notice.id,
      moduleId: 'MOD-34',
      incidentId,
      newValues: { action: 'CALL_ATTEMPT', contact_id: contactId },
    });
  }

  /** What the barangay said on the phone. NEEDS_BACKUP also raises a supervisor escalation. */
  async recordOutcome(
    incidentId: string,
    outcome: BarangayOutcome,
    notes: string | undefined,
    actor: CallbackActor,
  ): Promise<void> {
    const notice = await this.openNotice(incidentId);
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { status: true, public_reference: true },
    });
    if (!incident) throw new BarangayCallbackNotFoundError('Incident not found');

    await this.prisma.incident_barangay_notices.update({
      where: { id: notice.id },
      data: {
        last_report: outcome,
        last_report_source: 'PHONE_CALL',
        last_report_at: new Date(),
        last_report_by_user_id: actor.id,
      },
    });

    const note = notes?.trim();
    await this.timeline(
      incidentId,
      actor,
      `Brgy ${notice.barangay.name} by phone: ${OUTCOME_LABEL[outcome]}.${note ? ` ${note}` : ''}`,
    );
    await this.audit.log({
      action: AuditAction.UPDATE,
      actorId: actor.id,
      entityType: 'incident_barangay_notice',
      entityId: notice.id,
      moduleId: 'MOD-34',
      incidentId,
      oldValues: { last_report: notice.last_report },
      newValues: { last_report: outcome, source: 'PHONE_CALL' },
    });

    if (outcome === 'NEEDS_BACKUP') await this.escalate(incidentId, notice.barangay.name, incident, note);
    await this.notify.emitUpdated(notice.id);
  }

  /**
   * The barangay has it. Records a HANDLED_BY_BARANGAY resolution and moves ASSESSED → REFERRED;
   * the dispatcher closes with the normal close action afterwards.
   */
  async confirmHandled(incidentId: string, actor: CallbackActor, notes?: string): Promise<void> {
    const notice = await this.openNotice(incidentId);
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { status: true },
    });
    if (!incident) throw new BarangayCallbackNotFoundError('Incident not found');
    if ((incident.status as unknown as IncidentStatus) !== IncidentStatus.ASSESSED) {
      throw new BarangayCallbackRefusedError(
        `The incident is ${incident.status}; assess it first, then confirm the barangay has it handled.`,
      );
    }

    const note = notes?.trim();
    const resolution = await this.incidents.createResolution(
      incidentId,
      { outcome: 'HANDLED_BY_BARANGAY', resolutionNotes: note ?? `Handled by Brgy ${notice.barangay.name}` },
      actor.id,
    );
    try {
      await this.incidents.updateStatus(
        incidentId,
        IncidentStatus.REFERRED,
        actor.id,
        `Referred to Brgy ${notice.barangay.name}: handled by barangay`,
      );
    } catch (err) {
      // Do not leave a resolution behind for an incident that was not referred: it would
      // block the retry (one resolution per incident).
      await this.prisma.incident_resolutions
        .delete({ where: { id: resolution.id } })
        .catch((e) => this.logger.error(`Could not roll back resolution ${resolution.id}: ${String(e)}`));
      throw err;
    }

    await this.prisma.incident_barangay_notices.update({
      where: { id: notice.id },
      data: {
        last_report: 'HANDLED',
        last_report_source: 'PHONE_CALL',
        last_report_at: new Date(),
        last_report_by_user_id: actor.id,
      },
    });
    await this.audit.log({
      action: AuditAction.UPDATE,
      actorId: actor.id,
      entityType: 'incident_barangay_notice',
      entityId: notice.id,
      moduleId: 'MOD-34',
      incidentId,
      newValues: { action: 'CONFIRM_HANDLED', status: IncidentStatus.REFERRED },
    });
    await this.notify.emitUpdated(notice.id);
  }

  private async openNotice(incidentId: string) {
    const notice = await this.prisma.incident_barangay_notices.findFirst({
      where: { incident_id: incidentId },
      include: { barangay: { select: { id: true, name: true } } },
    });
    if (!notice) throw new BarangayCallbackNotFoundError('This incident has no barangay notice');
    if (notice.closed_at !== null) {
      throw new BarangayCallbackRefusedError('The incident is closed; the barangay is no longer being coordinated.');
    }
    return notice;
  }

  /** Same pattern as DispatchService.submitTriage: from = to = current status, with notes. */
  private async timeline(
    incidentId: string,
    actor: { id: string; role: string | null } | null,
    notes: string,
  ): Promise<void> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: { status: true },
    });
    if (!incident) return;
    await this.prisma.incidentEvent.create({
      data: {
        incident_id: incidentId,
        from_status: incident.status as any,
        to_status: incident.status as any,
        // A report from the status link has no logged-in user.
        triggered_by_id: actor?.id ?? null,
        triggered_by_role: (actor?.role ?? null) as any,
        notes,
      },
    });
  }

  private async escalate(
    incidentId: string,
    barangayName: string,
    incident: { status: unknown; public_reference: string },
    note: string | undefined,
  ): Promise<void> {
    try {
      const escalation = await this.prisma.escalation.create({
        data: {
          incident_id: incidentId,
          escalation_level: 'LEVEL_1_SUPERVISOR',
          triggered_reason: `Barangay requested backup: Brgy ${barangayName}, ${incident.public_reference}${note ? `. ${note}` : ''}`,
          sla_breach_at: new Date(),
        },
      });
      this.realtime.notifyEscalation(incidentId, {
        escalationId: escalation.id,
        escalationType: 'BARANGAY_BACKUP_REQUESTED',
        incidentStatus: String(incident.status),
      });
    } catch (err) {
      // The outcome is already recorded; a failed escalation must not undo it.
      this.logger.error(`Backup escalation for incident ${incidentId} failed: ${String(err)}`);
    }
  }
}
