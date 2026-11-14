import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { AuditModule } from '../audit/audit.module';
import { SlaPoliciesController } from './sla-policies.controller';
import { SlaPoliciesService } from './sla-policies.service';
import { SlaScheduleService } from './sla-schedule.service';

/**
 * MOD-41 response targets: the single source for the escalation alarm, analytics and
 * the console. Depends only on Prisma (global), Audit and the SLA queue, so any module
 * can import it without a cycle.
 */
@Module({
  imports: [AuditModule, BullModule.registerQueue({ name: QUEUE_NAMES.SLA_MONITOR })],
  controllers: [SlaPoliciesController],
  providers: [SlaPoliciesService, SlaScheduleService],
  exports: [SlaPoliciesService, SlaScheduleService],
})
export class SlaPoliciesModule {}
