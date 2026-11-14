import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  Request,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RiskIntelligenceService } from './risk-intelligence.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';
import { AreaSuggestionQuery, CreateRiskAreaDto, PlaceSearchQuery, UpdateRiskAreaDto } from './dto/risk-area.dto';
import { ApproveRiskAreaProposalDto, ListRiskAreaProposalsQuery } from './dto/risk-area-proposal.dto';
import { HotspotDiscoveryService } from './hotspot-discovery.service';
import { RiskPlaceSearchService } from './place-search.service';
import { DEFAULT_RISK_MAP_PERIOD, RiskMapQuery } from './dto/risk-map.dto';

@ApiTags('risk')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'risk-intelligence', version: '1' })
export class RiskIntelligenceController {
  constructor(
    private readonly riskIntelligenceService: RiskIntelligenceService,
    private readonly hotspots: HotspotDiscoveryService,
    private readonly places: RiskPlaceSearchService,
  ) {}

  @Get('map')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Risk Map: floods per barangay (with boundaries), other incidents at their spot' })
  async map(@Query() query: RiskMapQuery) {
    return this.riskIntelligenceService.getRiskMap(query.periodDays ?? DEFAULT_RISK_MAP_PERIOD);
  }

  // Risk areas are an MDRRMO operations decision: the Supervisor manages them and the
  // nightly hotspot proposals from the Risk Map. Dispatchers read them; the System
  // Administrator keeps a read-only list for support (Administration → Risk Areas) and,
  // since role dashboards Phase 5b, gets no Risk Map data.
  @Get('areas')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'List risk areas' })
  async areas() {
    return this.riskIntelligenceService.findAreas();
  }

  @Get('areas/suggest')
  @Roles(UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Add-form help for a pin: its barangay, nearby incident counts, a suggested name and level' })
  async suggest(@Query() query: AreaSuggestionQuery) {
    return this.riskIntelligenceService.suggest(query);
  }

  /**
   * Pin form "Find a place". Runs on Enter or a click only, never while typing (Nominatim
   * policy: no autocomplete). The throttler tracks the client IP, as for the hospital
   * "Find location", so 10/min is per IP.
   */
  @Get('places')
  @Roles(UserRole.SUPERVISOR)
  @Throttle({ sustained: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Find a named place inside Bocaue for the risk-area pin (map search)' })
  async searchPlaces(@Query() query: PlaceSearchQuery) {
    return this.places.search(query.q);
  }

  @Post('areas')
  @Roles(UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Create a risk area (a pin with a radius)' })
  async createArea(@Body() dto: CreateRiskAreaDto, @Request() req: any) {
    return this.riskIntelligenceService.createArea(dto, req.user.id);
  }

  @Patch('areas/:id')
  @Roles(UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Update a risk area' })
  async updateArea(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRiskAreaDto,
    @Request() req: any,
  ) {
    return this.riskIntelligenceService.updateArea(id, dto, req.user.id);
  }

  @Delete('areas/:id')
  @Roles(UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Delete a risk area' })
  async deleteArea(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    await this.riskIntelligenceService.deleteArea(id, req.user.id);
    return { message: 'Risk area deleted' };
  }

  // ── Proposed hotspots (AUTOMATION_NEEDS_PLAN Phase 2, C7) ──────────────────

  @Get('proposals/status')
  @Roles(UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'When the hotspot check last ran and when it runs next (02:30 Manila)' })
  async proposalStatus() {
    return this.hotspots.status();
  }

  @Post('proposals/check')
  @HttpCode(200)
  @Roles(UserRole.SUPERVISOR)
  // Each run scans 90 days of incidents: a couple a minute is plenty.
  @Throttle({ burst: { ttl: 60_000, limit: 2 }, sustained: { ttl: 3_600_000, limit: 10 } })
  @ApiOperation({ summary: 'Run the hotspot check now (audited); returns how many proposals it wrote' })
  async checkNow(@Request() req: any) {
    return this.hotspots.checkNow(req.user.id);
  }

  @Get('proposals')
  @Roles(UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List risk areas proposed from incident clusters and repeated barangay floods' })
  async proposals(@Query() query: ListRiskAreaProposalsQuery) {
    return this.hotspots.listProposals(query.status ?? 'PENDING');
  }

  @Post('proposals/:id/approve')
  @Roles(UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Approve a proposal: creates the risk area with its boundary (audited)' })
  async approveProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveRiskAreaProposalDto,
    @Request() req: any,
  ) {
    return this.hotspots.approve(id, dto, req.user.id);
  }

  @Post('proposals/:id/dismiss')
  @Roles(UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Dismiss a proposal (audited)' })
  async dismissProposal(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.hotspots.dismiss(id, req.user.id);
  }
}
