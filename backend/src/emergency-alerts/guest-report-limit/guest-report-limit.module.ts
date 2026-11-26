import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { GuestReportLimitService } from './guest-report-limit.service';
import { GuestReportLimitInterceptor } from './guest-report-limit.interceptor';

/** Guest emergency-report rate limit, shared by POST /incidents and the SOS/shake alerts. */
@Module({
  // Security Events: every guest report and refusal, with the client IP.
  imports: [AuditModule],
  providers: [GuestReportLimitService, GuestReportLimitInterceptor],
  // AuditModule too, so every module using the interceptor can resolve AuditService.
  exports: [GuestReportLimitService, GuestReportLimitInterceptor, AuditModule],
})
export class GuestReportLimitModule {}
