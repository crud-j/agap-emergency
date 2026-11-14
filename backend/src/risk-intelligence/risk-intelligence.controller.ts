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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RiskIntelligenceService } from './risk-intelligence.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';
import { CreateRiskAreaDto, UpdateRiskAreaDto } from './dto/risk-area.dto';
import { ApproveRiskAreaProposalDto, ListRiskAreaProposalsQuery } from './dto/risk-area-proposal.dto';
import { HotspotDiscoveryService } from './hotspot-discovery.service';
import { DEFAULT_RISK_MAP_PERIOD, RiskMapQuery } from './dto/risk-map.dto';

@ApiTags('risk')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'risk-intelligence', version: '1' })
export class RiskIntelligenceController {
  constructor(
    private readonly riskIntelligenceService: RiskIntelligenceService,
    private readonly hotspots: HotspotDiscoveryService,
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

  @Post('areas')
  @Roles(UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Create a risk area' })
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

  @Get('proposals')
  @Roles(UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List risk areas proposed from incident clusters' })
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
