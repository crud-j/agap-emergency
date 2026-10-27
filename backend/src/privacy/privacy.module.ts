import { Module } from '@nestjs/common';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';
import { MedicalProfilesModule } from '../medical-profiles/medical-profiles.module';

@Module({
  imports: [MedicalProfilesModule],
  controllers: [PrivacyController],
  providers: [PrivacyService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
