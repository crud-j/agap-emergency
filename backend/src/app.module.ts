import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { IncidentsModule } from './incidents/incidents.module';
import { EmergencyAlertsModule } from './emergency-alerts/emergency-alerts.module';
import { FalseAlertsModule } from './false-alerts/false-alerts.module';
import { LocationsModule } from './locations/locations.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { EscalationsModule } from './escalations/escalations.module';
import { RespondersModule } from './responders/responders.module';
import { HospitalsModule } from './hospitals/hospitals.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AuditModule } from './audit/audit.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RiskIntelligenceModule } from './risk-intelligence/risk-intelligence.module';
import { DisasterModeModule } from './disaster-mode/disaster-mode.module';
import { AdministrationModule } from './administration/administration.module';
import { HealthModule } from './health/health.module';
import { JobsModule } from './jobs/jobs.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { EmergencyContactsModule } from './emergency-contacts/emergency-contacts.module';
import { MedicalProfilesModule } from './medical-profiles/medical-profiles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PrivacyModule } from './privacy/privacy.module';
import { ConsentModule } from './consent/consent.module';
import { MediaModule } from './media/media.module';
import { CommunicationsModule } from './communications/communications.module';
import { ResourcesModule } from './resources/resources.module';
import { FleetModule } from './fleet/fleet.module';
import { BarangayCoordinationModule } from './barangay-coordination/barangay-coordination.module';
import { BarangayCallbackModule } from './barangay-coordination/barangay-callback.module';
import { validateConfig } from './config/config.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateConfig,
      envFilePath: ['.env.local', '.env'],
    }),
    // Default for authenticated console traffic. One Operations Center tab polls
    // several endpoints, and staff on one office network share an IP, so the old
    // 30/min default locked staff out of their own console (429 on Resolve etc.).
    // Public endpoints carry their own stricter @Throttle (SOS/shake, barangay
    // link, auth, MFA, announcement subscribe) and are unaffected by this.
    ThrottlerModule.forRoot([
      { name: 'burst', ttl: 1000, limit: 20 },
      { name: 'sustained', ttl: 60000, limit: 600 },
    ]),
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    EmergencyContactsModule,
    MedicalProfilesModule,
    PermissionsModule,
    PrivacyModule,
    ConsentModule,
    IncidentsModule,
    EmergencyAlertsModule,
    FalseAlertsModule,
    MediaModule,
    LocationsModule,
    DispatchModule,
    EscalationsModule,
    RespondersModule,
    ResourcesModule,
    FleetModule,
    BarangayCoordinationModule,
    BarangayCallbackModule,
    OrganizationsModule,
    HospitalsModule,
    FacilitiesModule,
    CommunicationsModule,
    NotificationsModule,
    RealtimeModule,
    AnnouncementsModule,
    AuditModule,
    AnalyticsModule,
    RiskIntelligenceModule,
    DisasterModeModule,
    AdministrationModule,
    HealthModule,
    JobsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
