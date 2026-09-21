import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DisasterModeService } from './disaster-mode.service';
import { ActivateSurgeDto } from './dto/activate-surge.dto';
import { TriageTagDto } from './dto/triage-tag.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('surge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'disaster-mode', version: '1' })
export class DisasterModeController {
  constructor(private readonly disasterModeService: DisasterModeService) {}

  @Get('status')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get surge mode status' })
  async status() {
    return this.disasterModeService.getStatus();
  }

  @Post('activate')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Activate disaster surge mode' })
  async activate(@Body() dto: ActivateSurgeDto, @Request() req: any) {
    const orgId = await this.disasterModeService.resolveOrgForUser(req.user.id);
    return this.disasterModeService.activate(dto, req.user.id, orgId);
  }

  @Post('deactivate')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Deactivate disaster surge mode' })
  async deactivate(@Body() body: { surgeId: string }, @Request() req: any) {
    return this.disasterModeService.deactivate(body.surgeId, req.user.id);
  }

  @Post('incidents')
  @Roles(UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Link an incident to a surge' })
  async linkIncident(@Body() body: { surgeId: string; incidentId: string }) {
    return this.disasterModeService.linkIncident(body.surgeId, body.incidentId);
  }

  @Post('triage')
  @Roles(UserRole.RESPONDER)
  @ApiOperation({ summary: 'Create a triage tag' })
  async createTriage(@Body() dto: TriageTagDto, @Request() req: any) {
    return this.disasterModeService.createTriageTag(dto, req.user.id);
  }

  @Get('triage')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List triage tags for the active surge' })
  async getTriage() {
    const surgeId = await this.disasterModeService.resolveActiveSurgeId();
    return this.disasterModeService.getTriageTags(surgeId);
  }

  @Patch('triage/:tagId')
  @Roles(UserRole.RESPONDER)
  @ApiOperation({ summary: 'Update a triage tag' })
  async updateTriage(
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @Body() dto: Partial<TriageTagDto>,
    @Request() req: any,
  ) {
    return this.disasterModeService.updateTriageTag(tagId, dto, req.user.id);
  }

  @Get('resources')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List available resources for surge' })
  async resources() {
    return this.disasterModeService.getAvailableResources();
  }
}
