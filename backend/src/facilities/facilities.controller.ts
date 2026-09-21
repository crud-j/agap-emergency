import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FacilitiesService } from './facilities.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

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
    @Body()
    dto: {
      name: string;
      facilityType: string;
      barangay?: string;
      municipality?: string;
      contactNumber?: string;
      isEvacuationCenter?: boolean;
    },
  ) {
    return this.facilitiesService.create(dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Update facility receiving status/capacity' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { receivingStatus?: string; capacityAvailable?: number },
  ) {
    return this.facilitiesService.updateStatus(id, dto);
  }
}
