import { Module } from '@nestjs/common';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';
import { IdentityVerificationModule } from '../identity-verification/identity-verification.module';

@Module({
  imports: [IdentityVerificationModule],
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
