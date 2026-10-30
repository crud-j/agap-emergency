import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import axios from 'axios';
import { PrismaService } from '../common/prisma/prisma.service';
import { BarangayReplyService, type InboundSms } from './barangay-reply.service';

/**
 * Its own queue, not the SMS queue: a slow Textbee read must never hold up an alert send
 * behind it. One worker, so polls never overlap.
 */
export const BARANGAY_INBOUND_QUEUE = 'barangay-sms-inbound';
const POLL_JOB = 'barangay-sms-poll';
const POLL_EVERY_MS = 15_000;
const PAGE_SIZE = 50;
const MAX_PAGES = 10;
/** Look back this far before the newest stored message: Textbee does not document which timestamp `from` filters on. */
const OVERLAP_MS = 2 * 60_000;
/** On the first run, only recent replies; older traffic (carrier promos, tests) is ignored. */
const FIRST_RUN_LOOKBACK_MS = 10 * 60_000;
/** Textbee itself stops webhooks for SMS uploaded more than 48 h late. */
const MAX_LOOKBACK_MS = 48 * 60 * 60_000;

interface TextbeeReceived {
  _id?: unknown;
  sender?: unknown;
  message?: unknown;
  receivedAt?: unknown;
  createdAt?: unknown;
  device?: unknown;
}

/**
 * Phase 5 receiver, polling mode (`BARANGAY_SMS_INBOUND_MODE=poll`, the default): reads the
 * Textbee phone's received SMS every 15 s. Needs no public URL, so it works from a laptop.
 * Where it left off comes from the database, so a restart neither loses nor repeats a reply.
 * Runs when barangay replies or announcement STOP processing (MOD-53) is on.
 */
@Injectable()
export class BarangaySmsPoller implements OnApplicationBootstrap {
  private readonly logger = new Logger(BarangaySmsPoller.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly replies: BarangayReplyService,
    @InjectQueue(BARANGAY_INBOUND_QUEUE) private readonly queue: Queue,
  ) {}

  /** Not awaited: a missing Redis must not hold up boot. */
  onApplicationBootstrap(): void {
    if (!this.pollingOn()) {
      void this.queue.removeJobScheduler(POLL_JOB).catch(() => undefined);
      return;
    }
    void this.queue
      .upsertJobScheduler(POLL_JOB, { every: POLL_EVERY_MS }, {
        name: POLL_JOB,
        opts: { removeOnComplete: true, removeOnFail: 20 },
      })
      .then(() => this.logger.log(`Polling Textbee for barangay SMS replies every ${POLL_EVERY_MS / 1000} s`))
      .catch((err) => this.logger.error(`Scheduling the barangay SMS poll failed: ${String(err)}`));
  }

  pollingOn(): boolean {
    const mode = this.config.get<string>('BARANGAY_SMS_INBOUND_MODE')?.trim() || 'poll';
    return (
      (this.replies.repliesEnabled() || this.replies.optOutEnabled()) &&
      mode === 'poll' &&
      !!this.config.get<string>('TEXTBEE_API_KEY')
    );
  }

  /** One poll. Returns how many messages were handed to the reply service. */
  async poll(): Promise<number> {
    if (!this.pollingOn()) return 0;
    const apiKey = this.config.get<string>('TEXTBEE_API_KEY')!;
    const deviceId = this.config.get<string>('TEXTBEE_DEVICE_ID')?.trim();
    const from = await this.since();

    let handled = 0;
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      let body: { data?: TextbeeReceived[]; meta?: { hasMore?: boolean; nextCursor?: string } };
      try {
        const res = await axios.get('https://api.textbee.dev/api/v1/gateway/messages', {
          params: { direction: 'received', order: 'asc', limit: PAGE_SIZE, from: from.toISOString(), ...(cursor ? { cursor } : {}) },
          headers: { 'x-api-key': apiKey },
          timeout: 8000,
        });
        body = res.data ?? {};
      } catch (err) {
        // The next poll starts from the same place; nothing is lost.
        this.logger.warn(`Reading barangay SMS replies failed: ${describe(err)}`);
        return handled;
      }

      for (const raw of body.data ?? []) {
        if (deviceId && deviceOf(raw) && deviceOf(raw) !== deviceId) continue;
        const msg = toInbound(raw);
        if (!msg) continue;
        // A database failure throws: stop here and let the next poll retry from this message.
        await this.replies.handleInbound(msg);
        handled++;
      }

      cursor = body.meta?.hasMore && body.meta.nextCursor ? body.meta.nextCursor : undefined;
      if (!cursor) break;
    }
    return handled;
  }

  /** Where to read from: just before the newest message already stored. */
  private async since(): Promise<Date> {
    const now = Date.now();
    const newest = await this.prisma.barangay_sms_inbound.aggregate({ _max: { created_at: true } });
    const last = newest._max.created_at?.getTime();
    if (!last) return new Date(now - FIRST_RUN_LOOKBACK_MS);
    return new Date(Math.max(last - OVERLAP_MS, now - MAX_LOOKBACK_MS));
  }
}

@Processor(BARANGAY_INBOUND_QUEUE)
export class BarangaySmsPollProcessor extends WorkerHost {
  constructor(private readonly poller: BarangaySmsPoller) {
    super();
  }

  async process(): Promise<void> {
    await this.poller.poll();
  }
}

/** A Textbee message as an InboundSms, or null when it lacks an id or sender. */
export function toInbound(raw: TextbeeReceived): InboundSms | null {
  if (typeof raw._id !== 'string' || typeof raw.sender !== 'string' || !raw.sender.trim()) return null;
  return {
    providerMessageId: raw._id,
    from: raw.sender.trim(),
    body: typeof raw.message === 'string' ? raw.message : '',
    // One test message carried a 1999 receivedAt: fall back to when Textbee stored it.
    receivedAt: plausibleDate(raw.receivedAt) ?? plausibleDate(raw.createdAt) ?? new Date(),
  };
}

function plausibleDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) && t > Date.UTC(2020, 0, 1) && t < Date.now() + 24 * 60 * 60_000 ? d : null;
}

function deviceOf(raw: TextbeeReceived): string | null {
  const d = raw.device;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object' && typeof (d as { _id?: unknown })._id === 'string') return (d as { _id: string })._id;
  return null;
}

/** HTTP status only: an axios error carries the API key in its config. */
function describe(err: unknown): string {
  if (axios.isAxiosError(err)) return `HTTP ${err.response?.status ?? 'no response'} (${err.code ?? 'error'})`;
  return String(err);
}
