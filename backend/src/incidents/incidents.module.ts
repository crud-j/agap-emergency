import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { IncidentStatusService } from './incident-status/incident-status.service';
import { DuplicateDetectionService } from './duplicate-detection/duplicate-detection.service';
import { PriorityService } from './priority/priority.service';
import { TriageService } from './triage/triage.service';
import { AssessmentService } from './assessment/assessment.service';
import { IncidentHandoverService } from './incident-handover/incident-handover.service';
import { TransportService } from './transport/transport.service';
import { MediaModule } from '../media/media.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AuditModule } from '../audit/audit.module';
import { EmergencyContactsModule } from '../emergency-contacts/emergency-contacts.module';
import { QUEUE_NAMES } from '@agap/shared';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.AUDIT_PROCESSING }),
    MediaModule,
    RealtimeModule,
    AuditModule,
    EmergencyContactsModule,
  ],
  controllers: [IncidentsController],
  providers: [
    IncidentsService,
    IncidentStatusService,
    DuplicateDetectionService,
    PriorityService,
    TriageService,
    AssessmentService,
    IncidentHandoverService,
    TransportService,
  ],
  exports: [IncidentsService, IncidentStatusService],
})
export class IncidentsModule {}
