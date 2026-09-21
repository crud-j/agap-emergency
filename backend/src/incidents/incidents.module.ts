import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { IncidentStatusService } from './incident-status/incident-status.service';
import { DuplicateDetectionService } from './duplicate-detection/duplicate-detection.service';
import { PriorityService } from './priority/priority.service';
import { TriageService } from './triage/triage.service';
import { QUEUE_NAMES } from '@agap/shared';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.AUDIT_PROCESSING }),
  ],
  controllers: [IncidentsController],
  providers: [
    IncidentsService,
    IncidentStatusService,
    DuplicateDetectionService,
    PriorityService,
    TriageService,
  ],
  exports: [IncidentsService, IncidentStatusService],
})
export class IncidentsModule {}
