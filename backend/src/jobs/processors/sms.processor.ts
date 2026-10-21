import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import axios from 'axios';
import { QUEUE_NAMES } from '@agap/shared';
import { BARANGAY_FOLLOWUP_JOB, BarangayNotifyService } from '../../barangay-coordination/barangay-notify.service';

export interface SmsJobData {
  phone: string;
  message: string;
  incidentId?: string;
  /** Barangay alert (MOD-17): the delivery result is written back to this notice. */
  noticeId?: string;
  /**
   * Retry through BullMQ instead of swallowing the error. Enqueue with `attempts`
   * and backoff. Non-critical jobs (OTP, notifications) keep the swallow behaviour.
   */
  critical?: boolean;
}

@Processor(QUEUE_NAMES.SMS)
export class SmsProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsProcessor.name);

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly barangayNotify?: BarangayNotifyService,
    @Optional() @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue?: Queue,
  ) {
    super();
  }

  async process(job: Job<SmsJobData | DeliveryCheckData | { noticeId: string }>): Promise<void> {
    if (job.name === DELIVERY_CHECK_JOB) return this.checkDelivery(job as Job<DeliveryCheckData>);
    if (job.name === BARANGAY_FOLLOWUP_JOB) {
      return this.barangayNotify?.sendFollowup((job.data as { noticeId: string }).noticeId);
    }
    return this.processSms(job as Job<SmsJobData>);
  }

  private async processSms(job: Job<SmsJobData>): Promise<void> {
    if (job.data.critical) return this.processCritical(job);

    this.logger.log(`Processing SMS job ${job.id} to ${job.data.phone}`);
    try {
      await this.send(job.data);
      this.logger.log(`SMS delivered to ${job.data.phone} | incidentId=${job.data.incidentId ?? 'n/a'}`);
    } catch (err) {
      // Delivery is best-effort and must never fail the caller (OTP/incident).
      // We swallow the error here so the job resolves and BullMQ does not retry.
      if (err instanceof SmsNotConfiguredError) {
        this.logger.warn(`SMS skipped: TEXTBEE_API_KEY or TEXTBEE_DEVICE_ID not configured`);
        return;
      }
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401 || status === 403) {
        this.logger.warn(
          `SMS gateway rejected credentials (HTTP ${status}). Check TEXTBEE_API_KEY / ` +
            `TEXTBEE_DEVICE_ID. OTP flow is unaffected — the code is available in the ` +
            `[DEV] log line above.`,
        );
      } else {
        this.logger.error(
          `SMS job ${job.id} failed: ${String(err)} | incidentId=${job.data.incidentId ?? 'n/a'}. Incident unaffected.`,
        );
      }
    }
  }

  /**
   * Critical jobs (barangay alerts) rethrow so BullMQ retries them, and write the final
   * outcome back to the notice. Nothing here touches the incident itself.
   */
  private async processCritical(job: Job<SmsJobData>): Promise<void> {
    const { noticeId } = job.data;
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;

    if (noticeId && this.barangayNotify && !(await this.barangayNotify.isNoticeOpen(noticeId))) {
      this.logger.log(`Barangay SMS job ${job.id} skipped: notice ${noticeId} closed before sending`);
      await this.barangayNotify.recordSmsResult(noticeId, 'SKIPPED');
      return;
    }

    this.logger.log(`Processing critical SMS job ${job.id} (attempt ${attempt}/${maxAttempts})`);
    let batchId: string | undefined;
    try {
      batchId = await this.send(job.data);
    } catch (err) {
      // A missing key or device will not fix itself between retries.
      const final = err instanceof SmsNotConfiguredError || attempt >= maxAttempts;
      this.logger.error(
        `Critical SMS job ${job.id} failed (attempt ${attempt}/${maxAttempts}): ${describe(err)} | ` +
          `incidentId=${job.data.incidentId ?? 'n/a'}. Incident unaffected.`,
      );
      if (final && noticeId) await this.barangayNotify?.recordSmsResult(noticeId, 'FAILED');
      throw err instanceof SmsNotConfiguredError ? new UnrecoverableError(err.message) : err;
    }

    this.logger.log(`Critical SMS accepted by gateway | incidentId=${job.data.incidentId ?? 'n/a'}`);
    if (!noticeId) return;
    // Textbee accepting the request is not delivery: the phone can still fail (no load,
    // no signal). Confirm with a delayed status check; SENT is recorded only from there.
    if (batchId && this.smsQueue) {
      try {
        await this.smsQueue.add(
          DELIVERY_CHECK_JOB,
          { noticeId, batchId, polls: 0, incidentId: job.data.incidentId } satisfies DeliveryCheckData,
          { delay: DELIVERY_POLL_MS, removeOnComplete: true, attempts: 1 },
        );
        return;
      } catch (err) {
        this.logger.error(`Queueing delivery check failed: ${String(err)}. Recording SENT unconfirmed.`);
      }
    }
    await this.barangayNotify?.recordSmsResult(noticeId, 'SENT');
  }

  /**
   * Polls Textbee for the batch's message. delivered → SENT, failed → FAILED, otherwise
   * look again until the window closes. `sent` (left the phone, no receipt) at the end
   * counts as SENT; anything else is FAILED so the dispatcher is offered a resend.
   */
  private async checkDelivery(job: Job<DeliveryCheckData>): Promise<void> {
    const { noticeId, batchId, polls } = job.data;
    let status: string | undefined;
    try {
      status = await this.fetchMessageStatus(batchId);
    } catch (err) {
      this.logger.warn(`Delivery check for batch ${batchId} failed: ${describe(err)}`);
    }

    if (status === 'delivered') return void (await this.barangayNotify?.recordSmsResult(noticeId, 'SENT'));
    if (status === 'failed') {
      this.logger.error(`Barangay SMS failed on device | incidentId=${job.data.incidentId ?? 'n/a'}`);
      return void (await this.barangayNotify?.recordSmsResult(noticeId, 'FAILED'));
    }
    if (polls + 1 >= DELIVERY_MAX_POLLS) {
      const sent = status === 'sent';
      this.logger.warn(`Barangay SMS delivery unconfirmed (${status ?? 'unknown'}) → ${sent ? 'SENT' : 'FAILED'}`);
      return void (await this.barangayNotify?.recordSmsResult(noticeId, sent ? 'SENT' : 'FAILED'));
    }
    await this.smsQueue?.add(
      DELIVERY_CHECK_JOB,
      { ...job.data, polls: polls + 1 } satisfies DeliveryCheckData,
      { delay: DELIVERY_POLL_MS, removeOnComplete: true, attempts: 1 },
    );
  }

  private async fetchMessageStatus(batchId: string): Promise<string | undefined> {
    const apiKey = this.config.get<string>('TEXTBEE_API_KEY');
    if (!apiKey) return undefined;
    const res = await axios.get(`https://api.textbee.dev/api/v1/gateway/messages`, {
      params: { smsBatchId: batchId },
      headers: { 'x-api-key': apiKey },
      timeout: 10000,
    });
    const messages: Array<{ status?: string }> = res.data?.data ?? [];
    const statuses = messages.map((m) => m.status);
    if (statuses.length === 0) return undefined;
    if (statuses.includes('failed')) return 'failed';
    if (statuses.every((s) => s === 'delivered')) return 'delivered';
    return statuses.includes('sent') ? 'sent' : statuses[0];
  }

  /** Returns the Textbee batch id, when the response carries one. */
  private async send(data: SmsJobData): Promise<string | undefined> {
    const message = data.message.length > 160 ? data.message.slice(0, 159) + '…' : data.message;

    const apiKey = this.config.get<string>('TEXTBEE_API_KEY');
    const deviceId = this.config.get<string>('TEXTBEE_DEVICE_ID');
    if (!apiKey || !deviceId) throw new SmsNotConfiguredError();

    const res = await axios.post(
      `https://api.textbee.dev/api/v1/gateway/devices/${deviceId}/send-sms`,
      { recipients: [data.phone], message },
      { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }, timeout: 10000 },
    );
    const batchId = res?.data?.data?.smsBatchId;
    return typeof batchId === 'string' ? batchId : undefined;
  }
}

interface DeliveryCheckData {
  noticeId: string;
  batchId: string;
  polls: number;
  incidentId?: string | undefined;
}

const DELIVERY_CHECK_JOB = 'barangay-sms-delivery-check';
const DELIVERY_POLL_MS = 15_000;
/** 24 × 15 s = 6 min; a no-load failure showed up on the device after about 2 min. */
const DELIVERY_MAX_POLLS = 24;

class SmsNotConfiguredError extends Error {
  constructor() {
    super('TEXTBEE_API_KEY or TEXTBEE_DEVICE_ID not configured');
  }
}

/** HTTP status only for gateway errors: an axios error carries the API key in its config. */
function describe(err: unknown): string {
  if (axios.isAxiosError(err)) return `HTTP ${err.response?.status ?? 'no response'} (${err.code ?? 'error'})`;
  return String(err);
}
