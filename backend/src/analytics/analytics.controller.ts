import {
  Controller,
  Get,
  BadRequestException,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService, defaultAnalyticsDateRange, type AnalyticsDateRange } from './analytics.service';
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

  @Get('municipal-overview')
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Municipal overview for the Office of the Mayor (counts only)' })
  async municipalOverview() {
    return this.analyticsService.getMunicipalOverview();
  }

  @Get('dispatch-summary')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Dispatcher dashboard counts (counts only)' })
  async dispatchSummary() {
    return this.analyticsService.getDispatchSummary();
  }

  @Get('response-times')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Average response times by category' })
  async responseTimes(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getResponseTimes(parseRange(from, to));
  }

  @Get('volume')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Incident volume breakdown' })
  async volume(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getVolume(parseRange(from, to));
  }

  @Get('sla-compliance')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'SLA compliance stats' })
  async slaCompliance(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getSlaCompliance(parseRange(from, to));
  }

  @Get('false-alert-rate')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'False alert rate' })
  async falseAlertRate(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getFalseAlertRate(parseRange(from, to));
  }

  @Get('resource-utilization')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Resource utilization' })
  async resourceUtilization(@Query('from') from?: string, @Query('to') to?: string) {
    return this.analyticsService.getResourceUtilization(parseRange(from, to));
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

function parseRange(from?: string, to?: string): AnalyticsDateRange {
  const defaults = defaultAnalyticsDateRange();
  const parsedFrom = from ? new Date(from) : defaults.from;
  const parsedTo = to ? new Date(to) : defaults.to;
  if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime())) {
    throw new BadRequestException('from and to must be valid ISO dates.');
  }
  if (parsedFrom >= parsedTo) {
    throw new BadRequestException('from must be earlier than to.');
  }
  return { from: parsedFrom, to: parsedTo };
}
