import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CITIZEN_SOS_SMS_MAX,
  QUEUE_NAMES,
  ReporterType,
  isCoordinateInBocaue,
  type CitizenSosParseResult,
} from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IncidentsService, SMS_OUTSIDE_BOCAUE_NOTE } from '../../incidents/incidents.service';
import { GuestReportLimitExceeded, GuestReportLimitService } from '../guest-report-limit/guest-report-limit.service';
import type { SmsJobData } from '../../jobs/processors/sms.processor';

/** Older than this when it arrives: logged, no incident (a typhoon backlog must not flood the queue). */
export const SMS_SOS_MAX_AGE_MS = 6 * 60 * 60_000;

/** At most one automatic reply per sender per minute, so a resend loop cannot drain the SIM. */
const REPLY_INTERVAL_MS = 60_000;

export type CitizenSosOutcome = 'SOS_CREATED' | 'SOS_EXISTING' | 'SOS_STALE' | 'SOS_INVALID' | 'SOS_LIMITED';

export interface CitizenSosResult {
  outcome: CitizenSosOutcome;
  /** The incident the text created or matched. */
  incidentId: string | null;
}

/** The reply to the sender. Always one SMS segment, never a web address. */
export function citizenSosReply(result: { outcome: CitizenSosOutcome; reference?: string; hasLocation?: boolean }): string {
  if ((result.outcome === 'SOS_CREATED' || result.outcome === 'SOS_EXISTING') && result.reference) {
    const where = result.hasLocation ? '' : " We don't have your location: expect a call.";
    return `AGAP: MDRRMO received your SOS. Ref ${result.reference}.${where} Keep your phone on. Life-threatening? Call 911.`;
  }
  return 'AGAP: Your SOS text could not be processed. Call 911 or the Bocaue MDRRMO hotline now.';
}

/**
 * MOD-17 / MOD-19: a citizen with no mobile data texts their report (`AGAP|<eventId>|…`)
 * to the Textbee phone. The inbound poller hands it here; it becomes an incident through
 * the same `IncidentsService.create` as the app, keyed on the same event id, so the SMS,
 * a resent SMS and a later HTTPS resend are always one incident (Rule 12).
 *
 * Off unless `CITIZEN_SMS_SOS_ENABLED=true`. Throws only when the database is unreachable,
 * so the poller retries the message; anything the message itself gets wrong is an outcome.
 */
@Injectable()
export class CitizenSmsSosService {
  private readonly logger = new Logger(CitizenSmsSosService.name);
  private readonly lastReply = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly incidents: IncidentsService,
    private readonly limits: GuestReportLimitService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
  ) {}

  enabled(): boolean {
    return this.config.get<string>('CITIZEN_SMS_SOS_ENABLED') === 'true';
  }

  /** `fromE164` null: the sender is not a PH mobile number (a carrier short code). */
  async handle(parsed: CitizenSosParseResult, fromE164: string | null, now: Date = new Date()): Promise<CitizenSosResult> {
    if (!parsed.ok || !fromE164) {
      this.logger.warn(`Citizen SOS SMS rejected: ${parsed.ok ? 'sender is not a mobile number' : parsed.reason}`);
      await this.reply(fromE164, citizenSosReply({ outcome: 'SOS_INVALID' }));
      return { outcome: 'SOS_INVALID', incidentId: null };
    }
    const sos = parsed.value;

    // A resend, or the app got through first: same incident, same reference. Before the
    // age and limit checks, so a repeat is always answered and never counted.
    const existing = await this.findByEventId(sos.eventId);
    if (existing) {
      await this.reply(fromE164, citizenSosReply({ outcome: 'SOS_EXISTING', ...existing }));
      return { outcome: 'SOS_EXISTING', incidentId: existing.id };
    }

    if (now.getTime() - sos.sentAt.getTime() > SMS_SOS_MAX_AGE_MS) {
      this.logger.warn(`Citizen SOS SMS ${sos.eventId} is older than ${SMS_SOS_MAX_AGE_MS / 3_600_000} h: logged only`);
      await this.reply(fromE164, citizenSosReply({ outcome: 'SOS_STALE' }));
      return { outcome: 'SOS_STALE', incidentId: null };
    }

    let lease;
    try {
      lease = await this.limits.reserve({ phone: fromE164 }, sos.eventId);
    } catch (err) {
      if (!(err instanceof GuestReportLimitExceeded)) throw err;
      await this.reply(fromE164, citizenSosReply({ outcome: 'SOS_LIMITED' }));
      return { outcome: 'SOS_LIMITED', incidentId: null };
    }

    // GPS outside Bocaue is not trusted as the incident location, but the dispatcher
    // still sees it: the reporter may be at the border, or the fix may be stale.
    const inside = sos.coords && isCoordinateInBocaue(sos.coords.lat, sos.coords.lng) ? sos.coords : null;
    const note = sos.coords && !inside
      ? `${SMS_OUTSIDE_BOCAUE_NOTE} ${sos.coords.lat.toFixed(5)},${sos.coords.lng.toFixed(5)}`
      : undefined;

    let incident;
    try {
      incident = await this.incidents.create(
        {
          type: sos.type,
          idempotencyKey: sos.eventId,
          triggerMethod: sos.trigger,
          ...(inside ? { lat: inside.lat, lng: inside.lng } : {}),
          ...(note ? { description: note } : {}),
          reporter: { type: ReporterType.GUEST_REPORTER },
        },
        undefined,
        undefined,
        { channel: 'SMS', senderPhone: fromE164, sentAt: sos.sentAt },
      );
    } catch (err) {
      await lease.release();
      // The message itself is unusable; retrying it would block every later SMS.
      if (err instanceof BadRequestException) {
        this.logger.warn(`Citizen SOS SMS ${sos.eventId} refused: ${err.message}`);
        await this.reply(fromE164, citizenSosReply({ outcome: 'SOS_INVALID' }));
        return { outcome: 'SOS_INVALID', incidentId: null };
      }
      throw err;
    }

    this.logger.log(`Citizen SOS SMS ${sos.eventId} → ${incident.public_reference}`);
    await this.reply(
      fromE164,
      citizenSosReply({ outcome: 'SOS_CREATED', reference: incident.public_reference, hasLocation: !!inside }),
      incident.id,
    );
    return { outcome: 'SOS_CREATED', incidentId: incident.id };
  }

  private async findByEventId(eventId: string) {
    const row = await this.prisma.incident.findFirst({
      where: { client_event_id: eventId },
      select: { id: true, public_reference: true, incident_locations: { select: { id: true } } },
    });
    return row ? { id: row.id, reference: row.public_reference, hasLocation: !!row.incident_locations } : null;
  }

  /** Best-effort: the incident is already saved (or deliberately not), whatever happens here. */
  private async reply(phone: string | null, message: string, incidentId?: string): Promise<void> {
    if (!phone) return;
    const now = Date.now();
    if (now - (this.lastReply.get(phone) ?? 0) < REPLY_INTERVAL_MS) return;
    this.lastReply.set(phone, now);
    try {
      await this.smsQueue.add(
        'citizen-sos-reply',
        { phone, message: message.slice(0, CITIZEN_SOS_SMS_MAX), ...(incidentId ? { incidentId } : {}) } satisfies SmsJobData,
        { removeOnComplete: true, attempts: 1 },
      );
    } catch (err) {
      this.logger.error(`Queueing the citizen SOS reply failed: ${String(err)}`);
    }
  }
}
