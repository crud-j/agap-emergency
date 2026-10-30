import { Module } from '@nestjs/common';
import { HospitalsController } from './hospitals.controller';
import { HospitalsService } from './hospitals.service';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { MapsModule } from '../locations/maps/maps.module';
import { HospitalNameAssistService } from './location-resolution/hospital-name-assist.service';
import { HospitalLocationResolverService } from './location-resolution/hospital-location-resolver.service';

@Module({
  controllers: [HospitalsController],
  providers: [HospitalsService, HospitalNameAssistService, HospitalLocationResolverService],
  imports: [AuditModule, NotificationsModule, IncidentsModule, MapsModule],
  exports: [HospitalsService],
})
export class HospitalsModule {}
