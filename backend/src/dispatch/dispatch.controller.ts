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
import { CreateDispatchDto } from './dto/create-dispatch.dto';
import { SubmitTriageDto } from './dto/submit-triage.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('dispatch')
@ApiBearerAuth()
@Controller({ path: 'dispatch', version: '1' })
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

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

  @Post('duplicates/:incidentId/merge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Merge an incident into a master as duplicate' })
  async mergeDuplicates(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() body: { masterIncidentId: string },
  ) {
    return this.dispatchService.mergeDuplicates(incidentId, body.masterIncidentId);
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
    @Body() body: { resourceId: string },
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
    @Body() body: { userId: string },
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
}
