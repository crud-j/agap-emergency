import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdDocumentCryptoService } from './id-document-crypto.service';
import { IdReviewNotifier } from './id-review-notifier';
import { IdentityVerificationAdminController } from './identity-verification-admin.controller';
import { IdentityVerificationReviewService } from './identity-verification-review.service';
import { IdentityVerificationService } from './identity-verification.service';
import { IdOcrService } from './id-ocr.service';

/**
 * MOD-01 / MOD-48: ID verification at citizen registration. The scan route
 * (IdentityVerificationController) is registered in AuthModule, which imports this module:
 * it needs AuthService's geo-fence, and AuthService needs this module to claim scans.
 * The staff review routes (plan §7) live here.
 */
@Module({
  imports: [
    AuditModule,
    MediaModule,
    NotificationsModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }, { name: QUEUE_NAMES.SMS }),
  ],
  controllers: [IdentityVerificationAdminController],
  providers: [
    IdentityVerificationService,
    IdDocumentCryptoService,
    IdOcrService,
    IdentityVerificationReviewService,
    IdReviewNotifier,
  ],
  exports: [IdentityVerificationService],
})
export class IdentityVerificationModule {}
