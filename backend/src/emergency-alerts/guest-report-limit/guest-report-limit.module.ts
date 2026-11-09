import { Module } from '@nestjs/common';
import { GuestReportLimitService } from './guest-report-limit.service';
import { GuestReportLimitInterceptor } from './guest-report-limit.interceptor';

/** Guest emergency-report rate limit, shared by POST /incidents and the SOS/shake alerts. */
@Module({
  providers: [GuestReportLimitService, GuestReportLimitInterceptor],
  exports: [GuestReportLimitService, GuestReportLimitInterceptor],
})
export class GuestReportLimitModule {}
