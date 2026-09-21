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
import { FleetService } from './fleet.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('fleet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'fleet', version: '1' })
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List vehicles' })
  async findAll() {
    return this.fleetService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get vehicle by ID' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.fleetService.findById(id);
  }

  @Post()
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Register a vehicle' })
  async create(@Body() dto: CreateVehicleDto) {
    return this.fleetService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Update a vehicle' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateVehicleDto>,
  ) {
    return this.fleetService.update(id, dto);
  }

  @Patch(':id/activate')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Activate a vehicle' })
  async activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.fleetService.activate(id);
  }

  @Patch(':id/deactivate')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Deactivate a vehicle' })
  async deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.fleetService.deactivate(id);
  }
}
