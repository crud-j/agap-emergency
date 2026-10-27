import { Module } from '@nestjs/common';
import { MedicalProfilesController } from './medical-profiles.controller';
import { MedicalProfilesService } from './medical-profiles.service';
import { MedicalCryptoService } from './medical-crypto.service';

@Module({
  controllers: [MedicalProfilesController],
  providers: [MedicalProfilesService, MedicalCryptoService],
  exports: [MedicalProfilesService, MedicalCryptoService],
})
export class MedicalProfilesModule {}
