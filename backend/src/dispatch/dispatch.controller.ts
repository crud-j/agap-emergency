import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DispatchService } from './dispatch.service';
import { ResourceMatchingService } from './resource-matching/resource-matching.service';
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { SubmitTriageDto } from './dto/submit-triage.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';
import { AddCrewDto, ReassignDispatchDto } from './dto/dispatch-actions.dto';

@ApiTags('dispatch')
@ApiBearerAuth()
@Controller({ path: 'dispatch', version: '1' })
export class DispatchController {
  constructor(
    private readonly dispatchService: DispatchService,
    private readonly resourceMatchingService: ResourceMatchingService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List dispatches' })
  async findAll(
    @Query('incidentId') incidentId?: string,
    @Query('status') status?: string,
  ) {
    return this.dispatchService.findAll({
      ...(incidentId && { incidentId }),
      ...(status && { status }),
    });
  }

  @Get('priority/:incidentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get priority recommendation for an incident' })
  async priority(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.dispatchService.getPriorityRecommendation(incidentId);
  }

  /**
   * MOD-30 — Suitable Response Unit Recommendation.
   * ASSISTIVE ONLY: returns a ranked list so the dispatcher can make the
   * final decision. Never auto-assigns. (CLAUDE.md rule 8)
   */
  @Get('recommendations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({
    summary:
      'Get ranked resource recommendations for an incident (MOD-30). Assistive only — dispatcher confirms.',
  })
  async recommendations(
    @Query('incidentId', ParseUUIDPipe) incidentId: string,
    @Request() req: any,
  ) {
    return this.resourceMatchingService.getRecommendations(
      incidentId,
      req.user.id,
      req.user.role,
    );
  }

  @Post('triage/:incidentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Submit triage assessment' })
  async triage(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: SubmitTriageDto,
    @Request() req: any,
  ) {
    return this.dispatchService.submitTriage({ ...dto, incidentId }, req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a dispatch' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.dispatchService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Authorize and create a dispatch' })
  async create(@Body() dto: CreateDispatchDto, @Request() req: any) {
    return this.dispatchService.create(dto, req.user.id);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Cancel a dispatch' })
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.dispatchService.cancel(id, req.user.id);
  }

  @Patch(':id/reassign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Reassign a dispatch to another resource' })
  async reassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReassignDispatchDto,
    @Request() req: any,
  ) {
    return this.dispatchService.reassign(id, body.resourceId, req.user.id);
  }

  @Post(':id/crew')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Add crew to a dispatch' })
  async addCrew(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddCrewDto,
  ) {
    return this.dispatchService.addCrew(id, body.userId);
  }

  @Delete(':id/crew/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Remove crew from a dispatch' })
  async removeCrew(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.dispatchService.removeCrew(id, userId);
    return { message: 'Crew removed' };
  }

  // Transport (MOD-40) lives on /incidents/:id/transport, and duplicate merging on
  // /incidents/:id/merge: one path each, with their checks and audit rows.
}
