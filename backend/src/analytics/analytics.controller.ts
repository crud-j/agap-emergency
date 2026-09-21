import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('response-times')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Average response times by category' })
  async responseTimes() {
    return this.analyticsService.getResponseTimes({});
  }

  @Get('volume')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Incident volume breakdown' })
  async volume() {
    return this.analyticsService.getVolume({});
  }

  @Get('sla-compliance')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'SLA compliance stats' })
  async slaCompliance() {
    return this.analyticsService.getSlaCompliance({});
  }

  @Get('false-alert-rate')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'False alert rate' })
  async falseAlertRate() {
    return this.analyticsService.getFalseAlertRate({});
  }

  @Get('resource-utilization')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Resource utilization' })
  async resourceUtilization() {
    return this.analyticsService.getResourceUtilization({});
  }

  @Get('reports/:incidentId')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Incident timeline report' })
  async incidentReport(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.analyticsService.getIncidentTimeline(incidentId);
  }

  @Get('daily')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Daily incident summary' })
  async daily(@Query('date') date?: string) {
    return this.analyticsService.getDailySummary(date);
  }
}
