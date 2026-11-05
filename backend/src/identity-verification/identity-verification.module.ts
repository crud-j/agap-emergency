import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MediaModule } from '../media/media.module';
import { IdDocumentCryptoService } from './id-document-crypto.service';
import { IdentityVerificationService } from './identity-verification.service';
import { PhilhealthOcrService } from './philhealth-ocr.service';

/**
 * MOD-01 / MOD-48: PhilHealth ID verification at citizen registration. The scan route
 * (IdentityVerificationController) is registered in AuthModule, which imports this module:
 * it needs AuthService's geo-fence, and AuthService needs this module to claim scans.
 */
@Module({
  imports: [AuditModule, MediaModule],
  providers: [IdentityVerificationService, IdDocumentCryptoService, PhilhealthOcrService],
  exports: [IdentityVerificationService],
})
export class IdentityVerificationModule {}
