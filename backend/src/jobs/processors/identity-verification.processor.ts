import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { IdentityVerificationService } from '../../identity-verification/identity-verification.service';

/**
 * MOD-01 / MOD-48: every 10 minutes, expire PhilHealth ID scans nobody registered with in
 * time and delete every ID image that is no longer needed (plan §5.2a), including deletes
 * that failed earlier. Logs counts only — never names, PINs or storage contents.
 */
@Injectable()
export class IdentityVerificationCleanupProcessor {
  private readonly logger = new Logger(IdentityVerificationCleanupProcessor.name);

  constructor(private readonly identityVerification: IdentityVerificationService) {}

  @Cron('*/10 * * * *', { name: 'identity-verification-cleanup' })
  async run(): Promise<void> {
    try {
      const { expired, deleted, failed } = await this.identityVerification.cleanup();
      if (expired || deleted || failed) {
        this.logger.log(`ID scans: ${expired} expired, ${deleted} images deleted, ${failed} deletes to retry`);
      }
    } catch (err: unknown) {
      this.logger.error(`ID scan cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
