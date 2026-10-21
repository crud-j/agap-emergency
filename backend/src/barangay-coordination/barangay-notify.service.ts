import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { IncidentStatus, QUEUE_NAMES, TERMINAL_INCIDENT_STATUSES, normalizePhPhone } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { BarangayDirectoryService } from './barangay-directory.service';
import { BarangayLinkService } from './barangay-link.service';
import type { SmsJobData } from '../jobs/processors/sms.processor';

const SHORT_CODE_ATTEMPTS = 20;

/** Single GSM-7 segment. The alert must never be split or truncated. */
export const BARANGAY_SMS_MAX_LENGTH = 160;

/** BullMQ retry policy for barangay alerts (MOD-17): 4 tries, 5 s → 10 s → 20 s. */
export const BARANGAY_SMS_JOB_OPTS = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: true,
};

/** A resend is offered once the last attempt is over and did not reach everyone. */
const RESENDABLE = new Set(['FAILED', 'PARTIAL', 'SKIPPED', 'DISABLED']);

const NOTICE_INCLUDE = { barangay: { select: { id: true, name: true } } } as const;
type NoticeWithBarangay = Prisma.incident_barangay_noticesGetPayload<{ include: typeof NOTICE_INCLUDE }>;
type SmsStatus = NoticeWithBarangay['sms_status'];

export type BarangaySmsResult = 'SENT' | 'FAILED' | 'SKIPPED';

export class BarangayNotFoundError extends Error {
  constructor(barangayId: string) {
    super(`Barangay ${barangayId} not found`);
  }
}

/** The incident has no barangay notice to resend. */
export class BarangayNoticeMissingError extends Error {
  constructor(incidentId: string) {
    super(`Incident ${incidentId} has no barangay notice`);
  }
}

/** A resend is not possible right now (flag off, closed, or still sending). */
export class BarangayResendRefusedError extends Error {}

export interface BarangayAlertSmsInput {
  shortCode: string;
  category: string;
  barangayName: string;
  isApproximate: boolean;
  latitude: number | null;
  longitude: number | null;
  reference: string;
  opsPhone?: string | null | undefined;
  /** Status-page access code (BarangayLinkService.accessCodeFor). */
  accessCode?: string | null | undefined;
  /** Set when SMS replies are on (Phase 5): adds `Reply OTW/DONE/NEED <code>.` */
  replyCode?: string | null | undefined;
}

/**
 * The MDRRMO ops number from config, or null when unset or a placeholder such as
 * +639000000000. A placeholder would otherwise get every SOS texted to nowhere (it sits
 * on the Textbee phone ~2 min, then fails) and be printed in barangay texts as the
 * number to call.
 */
export function configuredOpsPhone(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (/^(63|0)?9?0+$/.test(trimmed.replace(/\D/g, ''))) return null;
  return trimmed;
}

/**
 * Joins the parts that must fit one 160-character segment, dropping optional parts in
 * order of least value: the MDRRMO call-back first, then the SMS reply hint, then the
 * access code. Throws if the core alone is too long.
 *
 * Never put a web address in these texts: PH carriers silently drop P2P SMS containing
 * one (even a bare `maps.google.com`) while still reporting it delivered.
 */
function fitSegment(
  core: string,
  parts: { accessCode?: string | null | undefined; replyCode?: string | null | undefined; ops?: string | null | undefined },
  what: string,
): string {
  const withCode = parts.accessCode ? `${core} Code ${parts.accessCode}.` : core;
  const withReply = parts.replyCode ? `${withCode} Reply OTW/DONE/NEED ${parts.replyCode}.` : withCode;
  const o = parts.ops?.trim();
  const candidates = [
    o ? `${withReply} Call MDRRMO ${o}` : withReply,
    withReply,
    withCode,
    core,
  ];
  const fit = candidates.find((c) => c.length < BARANGAY_SMS_MAX_LENGTH);
  if (!fit) throw new Error(`${what} is ${core.length} chars; must be under ${BARANGAY_SMS_MAX_LENGTH}`);
  return fit;
}

function hasCoordinates(latitude: number | null, longitude: number | null): boolean {
  return (
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    !(latitude === 0 && longitude === 0)
  );
}

const formatCoordinates = (latitude: number, longitude: number) => `${latitude.toFixed(5)},${longitude.toFixed(5)}`;

/**
 * `AGAP 4821 ROAD_ACCIDENT Brgy Batia 14.83221,120.94920 INC-2026-001234. Code 4821-KXPM. Call MDRRMO +639…`
 *
 * The coordinates are the exact reported position; the code opens the status page (map,
 * directions, status buttons) when typed on the saved `/b` page. Carries no reporter or
 * patient data. The MDRRMO call-back is dropped before the code, and the code before the
 * alert itself; throws if the core alone does not fit one segment.
 */
export function buildBarangayAlertSms(input: BarangayAlertSmsInput): string {
  const where = hasCoordinates(input.latitude, input.longitude)
    ? formatCoordinates(input.latitude!, input.longitude!)
    : 'no GPS';
  const brgy = `Brgy ${input.barangayName}${input.isApproximate ? ' (approx)' : ''}`;
  const core = `AGAP ${input.shortCode} ${input.category} ${brgy} ${where} ${input.reference}.`;
  return fitSegment(
    core,
    { accessCode: input.accessCode, replyCode: input.replyCode, ops: input.opsPhone },
    'Barangay alert SMS',
  );
}

/**
 * The second text after the alert: the coordinates alone, so a long-press copies exactly
 * what Google Maps search needs. Null without a usable position.
 */
export function buildBarangayCoordinatesSms(latitude: number | null, longitude: number | null): string | null {
  return hasCoordinates(latitude, longitude) ? formatCoordinates(latitude!, longitude!) : null;
}

/** SMS-queue job name for the "has not reported back" reminder (Phase 4). */
export const BARANGAY_FOLLOWUP_JOB = 'barangay-followup';
const DEFAULT_FOLLOWUP_MINUTES = 20;

/** `AGAP 4821 REMINDER Brgy Batia INC-2026-001234: please report status. Code 4821-KXPM. Call MDRRMO +639…` */
export function buildBarangayFollowupSms(input: {
  shortCode: string;
  barangayName: string;
  reference: string;
  opsPhone?: string | null | undefined;
  accessCode?: string | null | undefined;
  replyCode?: string | null | undefined;
}): string {
  const core = `AGAP ${input.shortCode} REMINDER Brgy ${input.barangayName} ${input.reference}: please report status.`;
  return fitSegment(
    core,
    { accessCode: input.accessCode, replyCode: input.replyCode, ops: input.opsPhone },
    'Barangay reminder SMS',
  );
}

@Injectable()
export class BarangayNotifyService {
  private readonly logger = new Logger(BarangayNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: BarangayDirectoryService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
    @Optional() private readonly links?: BarangayLinkService,
  ) {}

  /**
   * Tag the incident with its barangay and, when `BARANGAY_ALERTS_ENABLED=true`,
   * text the barangay's primary + backup numbers (information only).
   * Never throws: the incident is already persisted and nothing here may touch it.
   */
  async notifyForIncident(incidentId: string): Promise<void> {
    try {
      const existing = await this.prisma.incident_barangay_notices.findFirst({
        where: { incident_id: incidentId },
        select: { id: true },
      });
      if (existing) return; // idempotent; also never overrides a manual correction

      const location = await this.prisma.incident_locations.findUnique({
        where: { incident_id: incidentId },
        select: { latitude: true, longitude: true, source: true },
      });
      if (!location || location.source === 'MANUAL') return;

      const match = await this.directory.resolve(Number(location.latitude), Number(location.longitude));
      if (!match) return;

      await this.prisma.incident_locations.update({
        where: { incident_id: incidentId },
        data: { barangay: match.name },
      });

      let notice = await this.createNotice({
        incidentId,
        barangayId: match.barangayId,
        matchMethod: match.matchMethod,
        isApproximate: match.isApproximate,
      });
      notice = await this.sendAlert(notice);
      this.emit(notice);
    } catch (err) {
      this.logger.error(`Barangay tagging failed for incident ${incidentId}: ${String(err)}`);
    }
  }

  /**
   * Dispatcher correction. Throws on bad input; the caller is an authenticated request.
   * When the barangay actually changes, the new barangay is texted: the old text went
   * to the wrong place, and the correct one has heard nothing.
   */
  async setManual(incidentId: string, barangayId: string, actorId: string): Promise<NoticeWithBarangay> {
    const barangay = await this.directory.barangayExists(barangayId);
    if (!barangay) throw new BarangayNotFoundError(barangayId);

    const previous = await this.prisma.incident_barangay_notices.findFirst({
      where: { incident_id: incidentId },
      include: NOTICE_INCLUDE,
    });

    let notice: NoticeWithBarangay;
    if (previous) {
      notice = await this.prisma.incident_barangay_notices.update({
        where: { id: previous.id },
        data: { barangay_id: barangayId, match_method: 'MANUAL', is_approximate: false },
        include: NOTICE_INCLUDE,
      });
    } else {
      notice = await this.createNotice({
        incidentId,
        barangayId,
        matchMethod: 'MANUAL',
        isApproximate: false,
      });
    }

    await this.prisma.incident_locations
      .update({ where: { incident_id: incidentId }, data: { barangay: barangay.name } })
      .catch(() => undefined); // an incident with no location row still gets its notice

    await this.audit.log({
      action: 'UPDATE',
      actorId,
      entityType: 'incident_barangay_notice',
      entityId: notice.id,
      moduleId: 'MOD-34',
      incidentId,
      oldValues: { barangay_id: previous?.barangay_id ?? null },
      newValues: { barangay_id: barangayId, match_method: 'MANUAL' },
    });

    if (previous?.barangay_id !== barangayId && notice.closed_at === null) {
      notice = await this.sendAlert(notice);
    }

    this.emit(notice);
    return notice;
  }

  /** Dispatcher-requested resend to the current barangay's targets. Audited. */
  async resend(incidentId: string, actorId: string): Promise<NoticeWithBarangay> {
    const notice = await this.prisma.incident_barangay_notices.findFirst({
      where: { incident_id: incidentId },
      include: NOTICE_INCLUDE,
    });
    if (!notice) throw new BarangayNoticeMissingError(incidentId);
    if (!this.alertsEnabled()) {
      throw new BarangayResendRefusedError('Barangay SMS alerts are switched off (BARANGAY_ALERTS_ENABLED).');
    }
    if (notice.closed_at !== null) {
      throw new BarangayResendRefusedError('The incident is closed; the barangay is no longer alerted.');
    }
    if (!RESENDABLE.has(notice.sms_status)) {
      throw new BarangayResendRefusedError(`The alert is ${notice.sms_status}; resend is only offered after a failure.`);
    }

    const sent = await this.sendAlert(notice);

    await this.audit.log({
      action: 'UPDATE',
      actorId,
      entityType: 'incident_barangay_notice',
      entityId: notice.id,
      moduleId: 'MOD-17',
      incidentId,
      oldValues: { sms_status: notice.sms_status },
      newValues: { sms_status: sent.sms_status, action: 'RESEND' },
    });

    this.emit(sent);
    return sent;
  }

  /**
   * Called by the SMS processor once per target when a send has finished for good.
   * The merge is order-independent: both sent → SENT, both failed → FAILED, mixed → PARTIAL.
   * Never throws: the text has already gone (or not), and a retry would duplicate it.
   */
  async recordSmsResult(noticeId: string, result: BarangaySmsResult): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE incident_barangay_notices
           SET sms_status = (CASE
                 WHEN ${result} = 'SENT' THEN
                   CASE sms_status WHEN 'PENDING' THEN 'SENT' WHEN 'FAILED' THEN 'PARTIAL' ELSE sms_status::text END
                 WHEN ${result} = 'FAILED' THEN
                   CASE sms_status WHEN 'PENDING' THEN 'FAILED' WHEN 'SENT' THEN 'PARTIAL' ELSE sms_status::text END
                 ELSE
                   CASE sms_status WHEN 'PENDING' THEN 'SKIPPED' ELSE sms_status::text END
               END)::barangay_sms_status,
               sms_sent_at = CASE WHEN ${result} = 'SENT' THEN COALESCE(sms_sent_at, now()) ELSE sms_sent_at END,
               updated_at = now()
         WHERE id = ${noticeId}::uuid`;

      const notice = await this.prisma.incident_barangay_notices.findUnique({
        where: { id: noticeId },
        include: NOTICE_INCLUDE,
      });
      if (notice) this.emit(notice);
    } catch (err) {
      this.logger.error(`Recording barangay SMS result ${result} for notice ${noticeId} failed: ${String(err)}`);
    }
  }

  /** The processor skips a text whose incident was cancelled while it waited in the queue. */
  async isNoticeOpen(noticeId: string): Promise<boolean> {
    try {
      const notice = await this.prisma.incident_barangay_notices.findUnique({
        where: { id: noticeId },
        select: { closed_at: true },
      });
      return !!notice && notice.closed_at === null;
    } catch {
      return true; // when unsure, send: a stray text is better than a missed alert
    }
  }

  /** Frees the short codes once the incident is resolved or terminal. Best-effort. */
  async closeNoticesForIncident(incidentId: string): Promise<void> {
    try {
      await this.prisma.incident_barangay_notices.updateMany({
        where: { incident_id: incidentId, closed_at: null },
        data: { closed_at: new Date() },
      });
    } catch (err) {
      this.logger.error(`Closing barangay notices failed for incident ${incidentId}: ${String(err)}`);
    }
  }

  /** Re-broadcasts the notice to ops (used after a dispatcher records a callback outcome). */
  async emitUpdated(noticeId: string): Promise<void> {
    try {
      const notice = await this.prisma.incident_barangay_notices.findUnique({
        where: { id: noticeId },
        include: NOTICE_INCLUDE,
      });
      if (notice) this.emit(notice);
    } catch (err) {
      this.logger.error(`Emitting barangay notice ${noticeId} failed: ${String(err)}`);
    }
  }

  /**
   * One reminder SMS when the barangay has not reported back by `followup_due_at`.
   * Never throws and never touches sms_status; the guards make a stale or repeated job a no-op.
   */
  async sendFollowup(noticeId: string): Promise<void> {
    try {
      const notice = await this.prisma.incident_barangay_notices.findUnique({
        where: { id: noticeId },
        include: NOTICE_INCLUDE,
      });
      if (!notice || notice.closed_at !== null || notice.last_report !== null) return;
      if (notice.followup_sent_at !== null) return;
      // A resend moves the due time: the job from the earlier send is then stale.
      if (!notice.followup_due_at || notice.followup_due_at.getTime() > Date.now()) return;

      const incident = await this.prisma.incident.findUnique({
        where: { id: notice.incident_id },
        select: { public_reference: true, status: true },
      });
      if (!incident) return;
      if (TERMINAL_INCIDENT_STATUSES.has(incident.status as unknown as IncidentStatus)) return;

      const resolved = await this.resolveTargets(notice);
      if ('status' in resolved) return;

      const message = buildBarangayFollowupSms({
        shortCode: notice.short_code,
        barangayName: notice.barangay.name,
        reference: incident.public_reference,
        opsPhone: configuredOpsPhone(this.config.get<string>('MDRRMO_OPS_PHONE')),
        accessCode: this.links?.accessCodeFor(notice) ?? null,
        replyCode: this.repliesEnabled() ? notice.short_code : null,
      });
      // No noticeId: the reminder must not rewrite the alert's sms_status.
      await this.smsQueue.addBulk(
        resolved.phones.map((phone) => ({
          name: 'barangay-followup-sms',
          data: { phone, message, incidentId: notice.incident_id, critical: true } satisfies SmsJobData,
          opts: BARANGAY_SMS_JOB_OPTS,
        })),
      );
      const updated = await this.prisma.incident_barangay_notices.update({
        where: { id: notice.id },
        data: { followup_sent_at: new Date() },
        include: NOTICE_INCLUDE,
      });
      this.logger.log(`Barangay reminder queued for notice ${notice.id}: ${resolved.phones.length} target(s)`);
      this.emit(updated);
    } catch (err) {
      this.logger.error(`Barangay follow-up for notice ${noticeId} failed: ${String(err)}`);
    }
  }

  private followupMinutes(): number {
    const n = Number(this.config.get<string>('BARANGAY_FOLLOWUP_MINUTES'));
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_FOLLOWUP_MINUTES;
  }

  /** Stores the due time and queues the reminder. Best-effort: the alert itself is already queued. */
  private async scheduleFollowup(noticeId: string): Promise<void> {
    try {
      const delay = Math.round(this.followupMinutes() * 60_000);
      await this.prisma.incident_barangay_notices.update({
        where: { id: noticeId },
        data: { followup_due_at: new Date(Date.now() + delay), followup_sent_at: null },
      });
      await this.smsQueue.add(BARANGAY_FOLLOWUP_JOB, { noticeId }, { delay, removeOnComplete: true, attempts: 1 });
    } catch (err) {
      this.logger.error(`Scheduling barangay follow-up for notice ${noticeId} failed: ${String(err)}`);
    }
  }

  async getForIncident(incidentId: string) {
    const notice = await this.prisma.incident_barangay_notices.findFirst({
      where: { incident_id: incidentId },
      include: NOTICE_INCLUDE,
    });
    if (!notice) return { notice: null, contacts: [], smsReplies: [] };
    const contacts = await this.directory.listContacts(notice.barangay_id);
    // Phase 5: the barangay's SMS replies on this case, newest first. A secondary view:
    // failing to read it must not hide the rest of the panel.
    const smsReplies = await Promise.resolve()
      .then(() =>
        this.prisma.barangay_sms_inbound.findMany({
          where: { notice_id: notice.id },
          orderBy: { received_at: 'desc' },
          take: 10,
          select: { id: true, body: true, received_at: true, parsed_command: true, outcome: true },
        }),
      )
      .catch((err) => {
        this.logger.error(`Reading SMS replies for notice ${notice.id} failed: ${String(err)}`);
        return [];
      });
    return { notice, contacts, smsReplies };
  }

  private alertsEnabled(): boolean {
    return this.config.get<string>('BARANGAY_ALERTS_ENABLED') === 'true';
  }

  /** Phase 5: barangays may reply by SMS, so the texts say how. */
  private repliesEnabled(): boolean {
    return this.config.get<string>('BARANGAY_SMS_REPLIES_ENABLED') === 'true';
  }

  private isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  /** E.164 override phone, or null when unset. An unusable value counts as unset. */
  private overridePhone(): string | null {
    const raw = this.config.get<string>('BARANGAY_SMS_TEST_OVERRIDE_PHONE')?.trim();
    if (!raw) return null;
    const phone = normalizePhPhone(raw);
    return phone.canSms ? phone.e164 : null;
  }

  /**
   * Decide and queue the barangay alert for this notice, and store the resulting
   * `sms_status`. Never throws; a queue failure is recorded as FAILED.
   */
  private async sendAlert(notice: NoticeWithBarangay): Promise<NoticeWithBarangay> {
    let status: SmsStatus;
    try {
      status = await this.queueAlert(notice);
    } catch (err) {
      this.logger.error(`Queueing barangay alert for notice ${notice.id} failed: ${String(err)}`);
      status = 'FAILED';
    }
    try {
      if (status === 'PENDING') {
        // queueAlert() already stored PENDING before queueing, and a worker may have
        // merged a result since: re-read rather than overwrite it.
        const fresh = await this.prisma.incident_barangay_notices.findUnique({
          where: { id: notice.id },
          include: NOTICE_INCLUDE,
        });
        return fresh ?? notice;
      }
      if (status === notice.sms_status) return notice;
      return await this.prisma.incident_barangay_notices.update({
        where: { id: notice.id },
        data: { sms_status: status },
        include: NOTICE_INCLUDE,
      });
    } catch (err) {
      this.logger.error(`Storing barangay SMS status for notice ${notice.id} failed: ${String(err)}`);
      return notice;
    }
  }

  /**
   * Phones to text for this notice, or the status to store when nobody can be texted.
   * Outside production every text goes to the override phone; in production demo
   * numbers are never texted.
   */
  private async resolveTargets(
    notice: NoticeWithBarangay,
  ): Promise<{ status: SmsStatus } | { phones: string[]; overridden: boolean }> {
    if (!this.alertsEnabled()) return { status: 'DISABLED' };

    const override = this.overridePhone();
    if (!override && !this.isProduction()) {
      // Config validation refuses this at boot; this guard is for a hot config change.
      this.logger.warn('Barangay SMS not sent: BARANGAY_SMS_TEST_OVERRIDE_PHONE is required outside production');
      return { status: 'DISABLED' };
    }

    let targets = await this.directory.getAlertTargets(notice.barangay_id);
    if (this.isProduction()) {
      const demo = targets.filter((t) => t.is_demo);
      if (demo.length) {
        this.logger.warn(`Refusing ${demo.length} demo barangay number(s) for ${notice.barangay_id} in production`);
      }
      targets = targets.filter((t) => !t.is_demo);
    }
    if (targets.length === 0) return { status: 'SKIPPED' };
    return { phones: targets.map((t) => override ?? t.phone_e164), overridden: !!override };
  }

  private async queueAlert(notice: NoticeWithBarangay): Promise<SmsStatus> {
    const resolved = await this.resolveTargets(notice);
    if ('status' in resolved) return resolved.status;

    const incident = await this.prisma.incident.findUnique({
      where: { id: notice.incident_id },
      select: {
        public_reference: true,
        category: true,
        incident_locations: { select: { latitude: true, longitude: true } },
      },
    });
    if (!incident) return 'SKIPPED';

    const loc = incident.incident_locations;
    const latitude = loc ? Number(loc.latitude) : null;
    const longitude = loc ? Number(loc.longitude) : null;
    const message = buildBarangayAlertSms({
      shortCode: notice.short_code,
      category: incident.category,
      barangayName: notice.barangay.name,
      isApproximate: notice.is_approximate,
      latitude,
      longitude,
      reference: incident.public_reference,
      opsPhone: configuredOpsPhone(this.config.get<string>('MDRRMO_OPS_PHONE')),
      accessCode: this.links?.accessCodeFor(notice) ?? null,
      replyCode: this.repliesEnabled() ? notice.short_code : null,
    });
    const coordinates = buildBarangayCoordinatesSms(latitude, longitude);

    // Mark PENDING before queueing so a fast worker's result merges onto PENDING.
    await this.prisma.incident_barangay_notices.update({
      where: { id: notice.id },
      data: { sms_status: 'PENDING', sms_sent_at: null },
    });

    await this.smsQueue.addBulk(
      resolved.phones.flatMap((phone) => [
        {
          name: 'barangay-alert-sms',
          data: {
            phone,
            message,
            incidentId: notice.incident_id,
            noticeId: notice.id,
            critical: true,
          } satisfies SmsJobData,
          opts: BARANGAY_SMS_JOB_OPTS,
        },
        // A convenience copy of the position. No noticeId: it must not rewrite sms_status.
        ...(coordinates
          ? [{
              name: 'barangay-coordinates-sms',
              data: { phone, message: coordinates, incidentId: notice.incident_id, critical: true } satisfies SmsJobData,
              opts: BARANGAY_SMS_JOB_OPTS,
            }]
          : []),
      ]),
    );
    this.logger.log(
      `Barangay alert queued for ${notice.barangay_id}: ${resolved.phones.length} target(s)` +
        (resolved.overridden ? ' (test override phone)' : ''),
    );
    await this.scheduleFollowup(notice.id);
    return 'PENDING';
  }

  private async createNotice(input: {
    incidentId: string;
    barangayId: string;
    matchMethod: 'POLYGON' | 'NEAREST' | 'MANUAL';
    isApproximate: boolean;
  }): Promise<NoticeWithBarangay> {
    // The short code is unique among OPEN notices only (partial index), so a collision
    // means another live incident holds it: draw again.
    for (let attempt = 0; attempt < SHORT_CODE_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.incident_barangay_notices.create({
          data: {
            incident_id: input.incidentId,
            barangay_id: input.barangayId,
            match_method: input.matchMethod,
            is_approximate: input.isApproximate,
            short_code: String(Math.floor(Math.random() * 10000)).padStart(4, '0'),
            // sendAlert() moves it on; DISABLED until then so a crash never shows "sending".
            sms_status: 'DISABLED',
          },
          include: NOTICE_INCLUDE,
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
        // Either the short code or the (incident, barangay) pair collided. Prisma cannot
        // name the partial index reliably, so check the pair directly.
        const raced = await this.prisma.incident_barangay_notices.findFirst({
          where: { incident_id: input.incidentId, barangay_id: input.barangayId },
          include: NOTICE_INCLUDE,
        });
        if (raced) return raced;
      }
    }
    throw new Error('Could not allocate a free barangay short code');
  }

  private emit(notice: NoticeWithBarangay): void {
    this.realtime.barangayNoticeUpdated({
      incidentId: notice.incident_id,
      barangayId: notice.barangay_id,
      barangayName: notice.barangay.name,
      isApproximate: notice.is_approximate,
      smsStatus: notice.sms_status,
      lastReport: notice.last_report ?? null,
      lastReportAt: notice.last_report_at?.toISOString() ?? null,
      // "Has not reported back": the reminder time has passed and no report has come in.
      followupDue:
        notice.last_report === null &&
        notice.followup_due_at !== null &&
        notice.followup_due_at.getTime() <= Date.now(),
    });
  }
}
