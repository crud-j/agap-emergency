import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { EmergencyAlertsService } from './emergency-alerts.service';
import { SosAlertDto } from './dto/sos-alert.dto';
import { Public } from '../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { GuestReportLimitInterceptor } from './guest-report-limit/guest-report-limit.interceptor';

@ApiTags('alerts')
@Controller({ path: 'emergency-alerts', version: '1' })
export class EmergencyAlertsController {
  constructor(private readonly emergencyAlertsService: EmergencyAlertsService) {}

  @Post('sos')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @UseInterceptors(GuestReportLimitInterceptor)
  @Throttle({ burst: { ttl: 1000, limit: 1 }, sustained: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trigger a one-button SOS emergency alert (guest OK)' })
  @ApiResponse({ status: 201, description: 'Incident created (or existing returned)' })
  async sos(@Body() dto: SosAlertDto, @Request() req: any) {
    return this.emergencyAlertsService.createFromSos(dto, 'SOS_BUTTON', req.user?.id);
  }

  @Post('shake')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @UseInterceptors(GuestReportLimitInterceptor)
  @Throttle({ burst: { ttl: 1000, limit: 1 }, sustained: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trigger a shake-to-alert emergency (guest OK)' })
  async shake(@Body() dto: SosAlertDto, @Request() req: any) {
    return this.emergencyAlertsService.createFromSos(dto, 'SHAKE_GESTURE', req.user?.id);
  }

  // Removed 2026-11-25: `POST :id/cancel` and `GET :id/status`. Nothing called them, and
  // anyone holding an incident id could cancel it, or read the reporter's name and phone.
  // Cancel: PATCH /v1/false-alerts/:id/cancel (ownership checked). Status: the reporter's
  // GET /v1/incidents/:id/timeline, or a guest's GET /v1/guest-reports/status.
}
