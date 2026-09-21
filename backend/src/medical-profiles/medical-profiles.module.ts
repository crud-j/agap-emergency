import { Module } from '@nestjs/common';
import { MedicalProfilesController } from './medical-profiles.controller';
import { MedicalProfilesService } from './medical-profiles.service';

@Module({
  controllers: [MedicalProfilesController],
  providers: [MedicalProfilesService],
  exports: [MedicalProfilesService],
})
export class MedicalProfilesModule {}
