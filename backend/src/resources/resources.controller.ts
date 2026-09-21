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
import { ResourcesService } from './resources.service';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceStatusDto } from './dto/update-resource-status.dto';
import { AddCapabilityDto } from './dto/add-capability.dto';
import { ResourceRequestDto } from './dto/resource-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('resources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'resources', version: '1' })
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List resources' })
  async findAll(
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('orgId') orgId?: string,
  ) {
    return this.resourcesService.findAll({
      ...(status && { status }),
      ...(type && { type }),
      ...(orgId && { orgId }),
    });
  }

  @Get('available')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List available resources' })
  async findAvailable() {
    return this.resourcesService.findAvailable();
  }

  @Get('recommend/:incidentId')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Recommend resources for an incident (assistive only)' })
  async recommend(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.resourcesService.recommend(incidentId);
  }

  @Post('request')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Create a mutual-aid resource request' })
  async createRequest(@Body() dto: ResourceRequestDto, @Request() req: any) {
    const orgId = await this.resourcesService.resolveOrgForUser(req.user.id);
    return this.resourcesService.createRequest(dto, orgId);
  }

  @Patch('request/:id/respond')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Respond to a resource request' })
  async respondToRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { accept: boolean; notes?: string },
  ) {
    return this.resourcesService.respondToRequest(id, body.accept, body.notes);
  }

  @Get(':id')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get resource by ID' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.resourcesService.findById(id);
  }

  @Post()
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Create a resource' })
  async create(@Body() dto: CreateResourceDto) {
    return this.resourcesService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Update a resource' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateResourceDto>,
  ) {
    return this.resourcesService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.RESPONDER)
  @ApiOperation({ summary: 'Update resource status' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResourceStatusDto,
    @Request() req: any,
  ) {
    return this.resourcesService.updateStatus(id, dto, req.user.id);
  }

  @Post(':id/capabilities')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Assign a capability to a resource' })
  async addCapability(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCapabilityDto,
  ) {
    return this.resourcesService.addCapability(id, dto.capabilityId);
  }

  @Delete(':id/capabilities/:capId')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Remove a capability from a resource' })
  async removeCapability(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('capId', ParseUUIDPipe) capId: string,
  ) {
    await this.resourcesService.removeCapability(id, capId);
    return { message: 'Capability removed' };
  }
}
