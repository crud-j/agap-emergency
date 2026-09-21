import { Module } from '@nestjs/common';
import { DisasterModeController } from './disaster-mode.controller';
import { DisasterModeService } from './disaster-mode.service';

@Module({
  controllers: [DisasterModeController],
  providers: [DisasterModeService],
  exports: [DisasterModeService],
})
export class DisasterModeModule {}
