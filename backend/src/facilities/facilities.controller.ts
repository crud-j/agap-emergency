import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FacilitiesService } from './facilities.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';
import { CreateFacilityDto, FacilityStatusDto } from './dto/facility-status.dto';
import type { OrgActor } from '../organizations/org-scope';

@ApiTags('facilities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'facilities', version: '1' })
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List facilities' })
  async findAll() {
    return this.facilitiesService.findAll();
  }

  /** Rescue crews pick where they took people (unit field flow plan Phase 4). Before `:id`. */
  @Get('evacuation-centers')
  @Roles(UserRole.RESPONDER, UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Active evacuation centers (name, barangay, coordinates)' })
  async evacuationCenters() {
    return this.facilitiesService.listEvacuationCenters();
  }

  @Get(':id')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get a facility' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.facilitiesService.findById(id);
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Create a facility' })
  async create(
    @Body() dto: CreateFacilityDto,
  ) {
    return this.facilitiesService.create(dto);
  }

  /** Hospital users report only for their own organization's facilities (checked in the service). */
  @Patch(':id/status')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.HOSPITAL_USER)
  @ApiOperation({ summary: 'Update facility receiving status/capacity' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FacilityStatusDto,
    @Request() req: { user: OrgActor },
  ) {
    return this.facilitiesService.updateStatus(id, dto, req.user);
  }
}
