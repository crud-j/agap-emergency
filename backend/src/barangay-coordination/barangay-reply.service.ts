import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { QUEUE_NAMES, normalizePhPhone } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import type { SmsJobData } from '../jobs/processors/sms.processor';
import { AnnouncementsService } from '../announcements/announcements.service';
import { isOptOut } from '../announcements/sms-opt-out';
import { BarangayCallbackService } from './barangay-callback.service';
import { BarangayLinkService, type LinkedNotice } from './barangay-link.service';
import { BarangayNotifyService } from './barangay-notify.service';
import { parseBarangayReply, type ParsedBarangayReply } from './barangay-reply.parser';
import type { BarangayLinkStatus } from './dto/barangay-callback.dto';
import { aiAssistEnabled } from '../ai-assist/ai-assist.flags';
import { BARANGAY_REPLY_JOB, barangayReplyJobId, type AiAssistJobData } from '../ai-assist/ai-assist.jobs';

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
  | 'DISABLED'
  | 'OPT_OUT';

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
    private readonly announcements: AnnouncementsService,
    @InjectQueue(QUEUE_NAMES.AI_ASSIST) private readonly aiQueue: Queue,
  ) {}

  repliesEnabled(): boolean {
    return this.config.get<string>('BARANGAY_SMS_REPLIES_ENABLED') === 'true';
  }

  /** MOD-53: process announcement subscribers' STOP replies. On unless set to 'false'. */
  optOutEnabled(): boolean {
    return (this.config.get<string>('SMS_OPT_OUT_ENABLED')?.trim() || 'true') === 'true';
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

    // MOD-53: an announcement subscriber's STOP, checked before any barangay logic. A
    // barangay hotline's (or the override phone's) STOP is a barangay reply: today's path.
    if (fromE164 && this.optOutEnabled() && isOptOut(msg.body) && !(await this.isBarangaySender(fromE164))) {
      // Throws on a database error, like the rest of this method: the next poll retries.
      if (await this.announcements.optOutBySms(fromE164)) {
        if (!(await this.store(msg, fromE164, null, 'OPT_OUT', null))) return 'DUPLICATE';
        this.logger.log(`SMS ${msg.providerMessageId}: OPT_OUT`);
        return 'OPT_OUT';
      }
    }

    const parsed = parseBarangayReply(msg.body);
    const decision = await this.decide(fromE164, parsed);

    // Applied before the row is stored: if applying fails, nothing is stored and the next
    // poll tries again. Re-applying the same status is a no-op, so a race is harmless.
    if (decision.outcome === 'APPLIED') await this.callbacks.reportBySms(decision.notice!, parsed!.status);

    const row = await this.store(msg, fromE164, parsed, decision.outcome, decision.notice?.id ?? null);
    if (!row) return 'DUPLICATE';

    this.logger.log(`Barangay SMS ${msg.providerMessageId}: ${decision.outcome}`);
    // The dispatcher's message log reads these rows: refresh it now the row exists.
    if (decision.notice) await this.notify.emitUpdated(decision.notice.id);
    // AI Assist (C4): only free text linked to one open case is read; an exact code, an
    // unknown sender, an opt-out or an unlinked reply never reaches Gemini.
    if (decision.outcome === 'UNPARSED' && decision.notice) await this.queueAiReading(row.id);
    if (decision.knownSender && fromE164) await this.autoReply(fromE164, decision.outcome, parsed);
    return decision.outcome;
  }

  /** Best-effort: the reply is stored and shown either way. Off unless AI Assist is enabled. */
  private async queueAiReading(inboundId: string): Promise<void> {
    if (!aiAssistEnabled(this.config)) return;
    try {
      await this.aiQueue.add(
        BARANGAY_REPLY_JOB,
        { task: 'BARANGAY_REPLY', inboundId } satisfies AiAssistJobData,
        { jobId: barangayReplyJobId(inboundId), attempts: 1, removeOnComplete: true, removeOnFail: true },
      );
    } catch (err) {
      this.logger.error(`Queueing AI reading of barangay SMS ${inboundId} failed: ${String(err)}`);
    }
  }

  /**
   * Stores the inbound row and returns it. Null when another poll stored the same message
   * first (unique violation); any other database error throws.
   */
  private async store(
    msg: InboundSms,
    fromE164: string | null,
    parsed: ParsedBarangayReply | null,
    outcome: Exclude<InboundOutcome, 'DUPLICATE'>,
    noticeId: string | null,
  ): Promise<{ id: string } | null> {
    try {
      return await this.prisma.barangay_sms_inbound.create({
        data: {
          provider_message_id: msg.providerMessageId.slice(0, 100),
          from_phone: msg.from.slice(0, 32),
          from_phone_e164: fromE164,
          body: msg.body.slice(0, 1000),
          received_at: msg.receivedAt,
          parsed_command: parsed?.status ?? null,
          parsed_code: parsed?.code ?? null,
          notice_id: noticeId,
          outcome,
        },
        select: { id: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
  }

  /** The sender's barangays, and whether it is the dev override phone (answers any barangay). */
  private async sender(fromE164: string | null): Promise<{ isOverride: boolean; contacts: { barangay_id: string }[] }> {
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
    return { isOverride, contacts };
  }

  private async isBarangaySender(fromE164: string): Promise<boolean> {
    const { isOverride, contacts } = await this.sender(fromE164);
    return isOverride || contacts.length > 0;
  }

  /** The checks, in order. The first that fails decides the outcome. */
  private async decide(fromE164: string | null, parsed: ParsedBarangayReply | null): Promise<Decision> {
    const none = { notice: null };
    if (!this.repliesEnabled()) return { outcome: 'DISABLED', knownSender: false, ...none };

    const { isOverride, contacts } = await this.sender(fromE164);
    if (!isOverride && contacts.length === 0) return { outcome: 'UNKNOWN_SENDER', knownSender: false, ...none };

    // Free text: link it to the case when the sender's barangay has exactly one open one,
    // so the dispatcher sees it in that case's message log. The outcome stays UNPARSED.
    if (!parsed) return { outcome: 'UNPARSED', knownSender: true, notice: await this.singleOpenNotice(isOverride, contacts) };

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
   * The one open notice for the sender's barangays, or null when there are none or several
   * (then nothing is linked: a free-text reply can't say which case it means). The dev
   * override phone answers any barangay, so it counts the open notices of all of them.
   */
  private async singleOpenNotice(
    isOverride: boolean,
    contacts: { barangay_id: string }[],
  ): Promise<LinkedNotice | null> {
    const open = await this.prisma.incident_barangay_notices.findMany({
      where: {
        closed_at: null,
        ...(!isOverride && { barangay_id: { in: [...new Set(contacts.map((c) => c.barangay_id))] } }),
      },
      include: NOTICE_INCLUDE,
      take: 2,
    });
    return open.length === 1 ? open[0]! : null;
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
