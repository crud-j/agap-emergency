import { Module } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AdministrationController } from './administration.controller';
import { AdministrationService } from './administration.service';
import { HEALTH_QUEUES, HEALTH_QUEUE_NAMES, SystemHealthService } from './system-health.service';
import { AuditModule } from '../audit/audit.module';
import { SessionsModule } from '../auth/sessions/sessions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuditModule,
    SessionsModule,
    AuthModule,
    // Read-only handles for health counts; no worker is registered here.
    BullModule.registerQueue(...HEALTH_QUEUE_NAMES.map((name) => ({ name }))),
  ],
  controllers: [AdministrationController],
  providers: [
    AdministrationService,
    SystemHealthService,
    {
      provide: HEALTH_QUEUES,
      inject: HEALTH_QUEUE_NAMES.map((name) => getQueueToken(name)),
      useFactory: (...queues: Queue[]) => queues,
    },
  ],
  exports: [AdministrationService],
})
export class AdministrationModule {}
