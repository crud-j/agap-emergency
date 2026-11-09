import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { IncidentStatusService } from './incident-status/incident-status.service';
import { DuplicateDetectionService } from './duplicate-detection/duplicate-detection.service';
import { PriorityService } from './priority/priority.service';
import { TriageService } from './triage/triage.service';
import { AssessmentService } from './assessment/assessment.service';
import { FireReportService } from './fire-report/fire-report.service';
import { RescueTripService } from './rescue-trip/rescue-trip.service';
import { IncidentHandoverService } from './incident-handover/incident-handover.service';
import { TransportService } from './transport/transport.service';
import { TransportRequestCacheService } from './transport/transport-request-cache.service';
import { TransportLegModule } from './transport/transport-leg.module';
import { MediaModule } from '../media/media.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AuditModule } from '../audit/audit.module';
import { EmergencyContactsModule } from '../emergency-contacts/emergency-contacts.module';
import { BarangayCoordinationModule } from '../barangay-coordination/barangay-coordination.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmergencyAlertsModule } from '../emergency-alerts/emergency-alerts.module';
import { LocationsModule } from '../locations/locations.module';
import { GuestReportLimitModule } from '../emergency-alerts/guest-report-limit/guest-report-limit.module';
import { QUEUE_NAMES } from '@agap/shared';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATIONS }),
    BullModule.registerQueue({ name: QUEUE_NAMES.AUDIT_PROCESSING }),
    MediaModule,
    RealtimeModule,
    AuditModule,
    EmergencyContactsModule,
    BarangayCoordinationModule,
    NotificationsModule,
    EmergencyAlertsModule,
    LocationsModule,
    TransportLegModule,
    GuestReportLimitModule,
  ],
  controllers: [IncidentsController],
  providers: [
    IncidentsService,
    IncidentStatusService,
    DuplicateDetectionService,
    PriorityService,
    TriageService,
    AssessmentService,
    FireReportService,
    RescueTripService,
    IncidentHandoverService,
    TransportService,
    TransportRequestCacheService,
  ],
  exports: [IncidentsService, IncidentStatusService, TransportService, TransportLegModule],
})
export class IncidentsModule {}
