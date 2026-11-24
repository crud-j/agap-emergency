import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';

export const DEFAULT_SMS_LOG_RETENTION_DAYS = 90;

/** Days of sms_log to keep: SMS_LOG_RETENTION_DAYS, 7–730, else the default. */
export function smsLogRetentionDays(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 7 && n <= 730 ? n : DEFAULT_SMS_LOG_RETENTION_DAYS;
}

/** Deletes outbound SMS log rows older than the retention window, once a day (03:30). */
@Injectable()
export class SmsLogRetentionService {
  private readonly logger = new Logger(SmsLogRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron('30 3 * * *', { name: 'sms-log-retention' })
  async prune(now = new Date()): Promise<number> {
    const days = smsLogRetentionDays(this.config.get<string>('SMS_LOG_RETENTION_DAYS'));
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    try {
      const { count } = await this.prisma.sms_log.deleteMany({ where: { created_at: { lt: cutoff } } });
      if (count > 0) this.logger.log(`Pruned ${count} SMS log rows older than ${days} days`);
      return count;
    } catch (err) {
      this.logger.warn(`SMS log pruning failed: ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
  }
}
