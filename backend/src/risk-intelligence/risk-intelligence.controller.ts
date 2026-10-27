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

@ApiTags('risk')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'risk-intelligence', version: '1' })
export class RiskIntelligenceController {
  constructor(private readonly riskIntelligenceService: RiskIntelligenceService) {}

  @Get('heatmap')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Incident heatmap by barangay' })
  async heatmap() {
    return this.riskIntelligenceService.getHeatmap();
  }

  @Get('map-points')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Geo risk points for the operations map overlay (MOD-51)' })
  async mapPoints(@Query('periodDays') periodDays?: string) {
    return this.riskIntelligenceService.getGeoHeatmap(periodDays ? Number(periodDays) : 30);
  }

  @Get('flood-zones')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List flood risk zones' })
  async floodZones() {
    return this.riskIntelligenceService.getFloodZones();
  }

  // The System Administrator manages risk areas (Administration → Risk Areas) but,
  // since role dashboards Phase 5b, gets no heatmap or map points.
  @Get('areas')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'List risk areas' })
  async areas() {
    return this.riskIntelligenceService.findAreas();
  }

  @Post('areas')
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Create a risk area' })
  async createArea(@Body() dto: CreateRiskAreaDto, @Request() req: any) {
    return this.riskIntelligenceService.createArea(dto, req.user.id);
  }

  @Patch('areas/:id')
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Update a risk area' })
  async updateArea(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRiskAreaDto,
    @Request() req: any,
  ) {
    return this.riskIntelligenceService.updateArea(id, dto, req.user.id);
  }

  @Delete('areas/:id')
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Delete a risk area' })
  async deleteArea(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    await this.riskIntelligenceService.deleteArea(id, req.user.id);
    return { message: 'Risk area deleted' };
  }

  @Get('patterns')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Incident patterns' })
  async patterns() {
    return this.riskIntelligenceService.getPatterns();
  }
}
