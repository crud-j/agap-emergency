import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { IncidentsModule } from '../../incidents/incidents.module';
import { GuestReportLimitModule } from '../guest-report-limit/guest-report-limit.module';
import { CitizenSmsSosService } from './citizen-sms-sos.service';

/**
 * Citizen SOS by SMS (MOD-17 / MOD-19). Imported by BarangayCallbackModule, whose inbound
 * poller reads the Textbee phone. Its own module because it calls IncidentsService, and
 * IncidentsModule imports EmergencyAlertsModule (a cycle otherwise).
 */
@Module({
  imports: [IncidentsModule, GuestReportLimitModule, BullModule.registerQueue({ name: QUEUE_NAMES.SMS })],
  providers: [CitizenSmsSosService],
  exports: [CitizenSmsSosService],
})
export class CitizenSmsSosModule {}
