import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import axios from 'axios';
import { QUEUE_NAMES } from '@agap/shared';

export interface SmsJobData {
  phone: string;
  message: string;
  incidentId?: string;
}

@Processor(QUEUE_NAMES.SMS)
export class SmsProcessor extends WorkerHost {
  private readonly logger = new Logger(SmsProcessor.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async process(job: Job<SmsJobData>): Promise<void> {
    this.logger.log(`Processing SMS job ${job.id} to ${job.data.phone}`);
    try {
      const message = job.data.message.length > 160
        ? job.data.message.slice(0, 159) + '…'
        : job.data.message;

      const apiKey = this.config.get<string>('TEXTBEE_API_KEY');
      const deviceId = this.config.get<string>('TEXTBEE_DEVICE_ID');

      if (!apiKey || !deviceId) {
        this.logger.warn(`SMS skipped: TEXTBEE_API_KEY or TEXTBEE_DEVICE_ID not configured`);
        return;
      }

      await axios.post(
        `https://api.textbee.dev/api/v1/gateway/devices/${deviceId}/send-sms`,
        { recipients: [job.data.phone], message },
        { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }, timeout: 10000 },
      );

      this.logger.log(`SMS delivered to ${job.data.phone} | incidentId=${job.data.incidentId ?? 'n/a'}`);
    } catch (err) {
      // Delivery is best-effort and must never fail the caller (OTP/incident).
      // We swallow the error here so the job resolves and BullMQ does not retry.
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
}
