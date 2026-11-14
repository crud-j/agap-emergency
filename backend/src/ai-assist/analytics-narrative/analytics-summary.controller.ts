import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@agap/shared';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { parseAnalyticsRange } from '../../analytics/analytics-range';
import { AnalyticsNarrativeService } from './analytics-narrative.service';

/** The summary compares a period with the one before it; a year each is plenty. */
const MAX_SUMMARY_DAYS = 366;

type AuthedRequest = { user: { id: string; role: string } };

/**
 * MOD-50 AI summary on the Analytics page. Supervisors only (the user's decision,
 * 2026-11-14): they generate it, read it and accept or dismiss it. Every call is audited.
 */
@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERVISOR)
@Controller({ path: 'analytics/ai-summary', version: '1' })
export class AnalyticsSummaryController {
  constructor(private readonly narratives: AnalyticsNarrativeService) {}

  @Get()
  @ApiOperation({ summary: 'The latest AI summary for a period of this length (last 24 h), and whether AI is on' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async latest(@Query('from') from?: string, @Query('to') to?: string) {
    return this.narratives.latest(parseAnalyticsRange(from, to, MAX_SUMMARY_DAYS));
  }

  @Post()
  @HttpCode(200)
  // Each call can cost a Gemini request: a few a minute, 20 an hour per client.
  @Throttle({ burst: { ttl: 60_000, limit: 3 }, sustained: { ttl: 3_600_000, limit: 20 } })
  @ApiOperation({ summary: 'Write an AI summary of the period (aggregates only; audited)' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async generate(@Request() req: AuthedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.narratives.generate(parseAnalyticsRange(from, to, MAX_SUMMARY_DAYS), {
      id: req.user.id,
      role: req.user.role,
    });
  }

  @Post(':id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark the AI summary as reviewed and fit for reports (audited)' })
  async accept(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthedRequest) {
    return this.narratives.accept(id, { id: req.user.id, role: req.user.role });
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  @ApiOperation({ summary: 'Dismiss the AI summary (audited)' })
  async dismiss(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthedRequest) {
    return this.narratives.dismiss(id, { id: req.user.id, role: req.user.role });
  }
}
