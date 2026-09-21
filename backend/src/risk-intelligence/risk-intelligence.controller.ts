import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RiskIntelligenceService } from './risk-intelligence.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

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

  @Get('flood-zones')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List flood risk zones' })
  async floodZones() {
    return this.riskIntelligenceService.getFloodZones();
  }

  @Get('areas')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List risk areas' })
  async areas() {
    return this.riskIntelligenceService.findAreas();
  }

  @Post('areas')
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Create a risk area' })
  async createArea(
    @Body()
    dto: {
      name: string;
      riskType: string;
      riskLevel?: string;
      barangay?: string;
      floodThresholdMeters?: number;
      description?: string;
    },
  ) {
    return this.riskIntelligenceService.createArea(dto);
  }

  @Patch('areas/:id')
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Update a risk area' })
  async updateArea(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    dto: {
      name?: string;
      riskLevel?: string;
      barangay?: string;
      floodThresholdMeters?: number;
      description?: string;
      isActive?: boolean;
    },
  ) {
    return this.riskIntelligenceService.updateArea(id, dto);
  }

  @Delete('areas/:id')
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Delete a risk area' })
  async deleteArea(@Param('id', ParseUUIDPipe) id: string) {
    await this.riskIntelligenceService.deleteArea(id);
    return { message: 'Risk area deleted' };
  }

  @Get('patterns')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Incident patterns' })
  async patterns() {
    return this.riskIntelligenceService.getPatterns();
  }
}
