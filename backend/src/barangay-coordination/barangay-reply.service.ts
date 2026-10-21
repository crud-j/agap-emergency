import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { QUEUE_NAMES, normalizePhPhone } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import type { SmsJobData } from '../jobs/processors/sms.processor';
import { BarangayCallbackService } from './barangay-callback.service';
import { BarangayLinkService, type LinkedNotice } from './barangay-link.service';
import { BarangayNotifyService } from './barangay-notify.service';
import { parseBarangayReply, type ParsedBarangayReply } from './barangay-reply.parser';
import type { BarangayLinkStatus } from './dto/barangay-callback.dto';

/** One SMS received on the Textbee phone, from the poller or (later) the webhook. */
export interface InboundSms {
  /** Textbee message `_id` (poll) or `idempotencyKey` (webhook). */
  providerMessageId: string;
  /** As received: `+639…` for a person, a short name such as `TM` or `8080` for a carrier. */
  from: string;
  body: string;
  receivedAt: Date;
}

export type InboundOutcome =
  | 'APPLIED'
  | 'DUPLICATE'
  | 'UNKNOWN_SENDER'
  | 'UNKNOWN_CODE'
  | 'NOT_NOTIFIED'
  | 'UNPARSED'
  | 'DISABLED';

const NOTICE_INCLUDE = { barangay: { select: { id: true, name: true } } } as const;

/** At most one automatic reply per sender per minute, so a chatty thread cannot drain the SIM. */
const AUTO_REPLY_INTERVAL_MS = 60_000;

const ACK_LABEL: Record<BarangayLinkStatus, string> = {
  SEEN: 'seen',
  ON_THE_WAY: 'on the way',
  ON_SCENE: 'on scene',
  HANDLED: 'done',
  NEEDS_BACKUP: 'need backup',
};

interface Decision {
  outcome: Exclude<InboundOutcome, 'DUPLICATE'>;
  /** Set only when the reply applies to it. */
  notice: LinkedNotice | null;
  /** The sender is a known barangay number (or the dev override phone). */
  knownSender: boolean;
}

/**
 * Phase 5 (option B): the barangay replies by SMS (`DONE 3526`). SMS works with no mobile
 * data, which is how flood-zone barangays will be during a typhoon. A reply is recorded
 * exactly like a `/b` status-page tap and **never changes incident status**; the dispatcher
 * still confirms. Every message is stored in `barangay_sms_inbound`, applied or not.
 */
@Injectable()
export class BarangayReplyService {
  private readonly logger = new Logger(BarangayReplyService.name);
  private readonly lastAutoReply = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly links: BarangayLinkService,
    private readonly callbacks: BarangayCallbackService,
    private readonly notify: BarangayNotifyService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
  ) {}

  repliesEnabled(): boolean {
    return this.config.get<string>('BARANGAY_SMS_REPLIES_ENABLED') === 'true';
  }

  /**
   * Handles one inbound SMS. Throws only when the database is unreachable, so the poller
   * retries the message on its next run; the same message is never applied twice.
   */
  async handleInbound(msg: InboundSms): Promise<InboundOutcome> {
    const seen = await this.prisma.barangay_sms_inbound.findUnique({
      where: { provider_message_id: msg.providerMessageId },
      select: { id: true },
    });
    if (seen) return 'DUPLICATE';

    const phone = normalizePhPhone(msg.from);
    const fromE164 = phone.kind === 'MOBILE' ? phone.e164 : null;
    const parsed = parseBarangayReply(msg.body);
    const decision = await this.decide(fromE164, parsed);

    // Applied before the row is stored: if applying fails, nothing is stored and the next
    // poll tries again. Re-applying the same status is a no-op, so a race is harmless.
    if (decision.outcome === 'APPLIED') await this.callbacks.reportBySms(decision.notice!, parsed!.status);

    try {
      await this.prisma.barangay_sms_inbound.create({
        data: {
          provider_message_id: msg.providerMessageId.slice(0, 100),
          from_phone: msg.from.slice(0, 32),
          from_phone_e164: fromE164,
          body: msg.body.slice(0, 1000),
          received_at: msg.receivedAt,
          parsed_command: parsed?.status ?? null,
          parsed_code: parsed?.code ?? null,
          notice_id: decision.notice?.id ?? null,
          outcome: decision.outcome,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'DUPLICATE';
      throw err;
    }

    this.logger.log(`Barangay SMS ${msg.providerMessageId}: ${decision.outcome}`);
    // The dispatcher's message log reads these rows: refresh it now the row exists.
    if (decision.notice) await this.notify.emitUpdated(decision.notice.id);
    if (decision.knownSender && fromE164) await this.autoReply(fromE164, decision.outcome, parsed);
    return decision.outcome;
  }

  /** The checks, in order. The first that fails decides the outcome. */
  private async decide(fromE164: string | null, parsed: ParsedBarangayReply | null): Promise<Decision> {
    const none = { notice: null };
    if (!this.repliesEnabled()) return { outcome: 'DISABLED', knownSender: false, ...none };

    const production = this.config.get<string>('NODE_ENV') === 'production';
    // Demo rule: every barangay's alert goes to the one override phone outside production,
    // so a reply from it may answer any barangay's case.
    const isOverride = !production && !!fromE164 && fromE164 === this.overridePhone();
    const contacts = fromE164
      ? await this.prisma.barangay_contacts.findMany({
          where: { phone_e164: fromE164, is_active: true, ...(production ? { is_demo: false } : {}) },
          select: { barangay_id: true },
        })
      : [];
    if (!isOverride && contacts.length === 0) return { outcome: 'UNKNOWN_SENDER', knownSender: false, ...none };

    if (!parsed) return { outcome: 'UNPARSED', knownSender: true, ...none };

    // Open short codes are unique (partial unique index), so this is the only candidate.
    const notice = await this.prisma.incident_barangay_notices.findFirst({
      where: { short_code: parsed.code, closed_at: null },
      include: NOTICE_INCLUDE,
    });
    if (!notice || (parsed.letters && !this.links.lettersMatch(notice.id, parsed.letters))) {
      return { outcome: 'UNKNOWN_CODE', knownSender: true, ...none };
    }
    if (!isOverride && !contacts.some((c) => c.barangay_id === notice.barangay_id)) {
      return { outcome: 'NOT_NOTIFIED', knownSender: true, ...none };
    }
    return { outcome: 'APPLIED', knownSender: true, notice };
  }

  /**
   * Tells a known barangay number what happened to its reply. Unknown senders never get a
   * reply: no texting strangers, and no loops with carrier senders such as `TM`.
   * Best-effort: the reply is already recorded.
   */
  private async autoReply(
    phone: string,
    outcome: InboundOutcome,
    parsed: ParsedBarangayReply | null,
  ): Promise<void> {
    const message = replyText(outcome, parsed);
    if (!message) return;

    const now = Date.now();
    if (now - (this.lastAutoReply.get(phone) ?? 0) < AUTO_REPLY_INTERVAL_MS) return;
    this.lastAutoReply.set(phone, now);

    try {
      await this.smsQueue.add(
        'barangay-reply-ack',
        { phone, message } satisfies SmsJobData,
        { removeOnComplete: true, attempts: 1 },
      );
    } catch (err) {
      this.logger.error(`Queueing barangay reply acknowledgement failed: ${String(err)}`);
    }
  }

  private overridePhone(): string | null {
    const phone = normalizePhPhone(this.config.get<string>('BARANGAY_SMS_TEST_OVERRIDE_PHONE'));
    return phone.canSms ? phone.e164 : null;
  }
}

/** The automatic reply for an outcome, or null for none. Never contains a web address. */
export function replyText(outcome: InboundOutcome, parsed: ParsedBarangayReply | null): string | null {
  switch (outcome) {
    case 'APPLIED':
      return (
        `AGAP ${parsed!.code}: received "${ACK_LABEL[parsed!.status]}".` +
        (parsed!.status === 'NEEDS_BACKUP' ? ' MDRRMO has been alerted.' : '') +
        ' Salamat.'
      );
    case 'UNPARSED':
      return 'AGAP: reply with one word and the 4-digit case code, e.g. OTW 1234, DONE 1234 or NEED 1234.';
    case 'UNKNOWN_CODE':
      return `AGAP: no open case has code ${parsed!.code}. Check the code in the alert text.`;
    case 'NOT_NOTIFIED':
      return `AGAP: case ${parsed!.code} is not assigned to your barangay.`;
    default:
      return null;
  }
}
