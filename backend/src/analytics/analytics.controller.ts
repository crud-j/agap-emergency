import {
  Controller,
  Get,
  BadRequestException,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  Request,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiProduces } from '@nestjs/swagger';
import type { Response } from 'express';
import { AnalyticsService, defaultAnalyticsDateRange, type AnalyticsDateRange } from './analytics.service';
import {
  ANALYTICS_EXPORT_DATASETS,
  AnalyticsExportService,
  type AnalyticsExportDataset,
} from './export/analytics-export.service';
import { authContextFromRequest } from '../auth/request-context';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'analytics', version: '1' })
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly exportService: AnalyticsExportService,
  ) {}

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

  @Get('export')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({
    summary: 'Download analytics as CSV (summary aggregates or one row per incident). Audited as DATA_EXPORT.',
  })
  @ApiQuery({ name: 'dataset', enum: ANALYTICS_EXPORT_DATASETS })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date; default 30 days ago' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date; default now' })
  @ApiProduces('text/csv')
  async exportCsv(
    @Request() req: { user: { id: string; role: string }; ip?: string; headers?: Record<string, string | string[] | undefined> },
    @Res({ passthrough: true }) res: Response,
    @Query('dataset') dataset?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<StreamableFile> {
    if (!isExportDataset(dataset)) {
      throw new BadRequestException(`dataset must be one of: ${ANALYTICS_EXPORT_DATASETS.join(', ')}.`);
    }
    const ctx = authContextFromRequest(req);
    const file = await this.exportService.export(dataset, parseRange(from, to), {
      id: req.user.id,
      role: req.user.role,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Export-Rows', String(file.rows));
    const body = Buffer.from(file.content, 'utf8');
    return new StreamableFile(body, {
      type: 'text/csv; charset=utf-8',
      length: body.length,
      disposition: `attachment; filename="${file.filename}"`,
    });
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

function isExportDataset(value: string | undefined): value is AnalyticsExportDataset {
  return (ANALYTICS_EXPORT_DATASETS as readonly string[]).includes(value ?? '');
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
