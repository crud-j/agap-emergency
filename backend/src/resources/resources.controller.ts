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
import { VerifyCapabilityDto } from './dto/verify-capability.dto';
import { ResourceRequestDto } from './dto/resource-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';
import { RequestDecisionDto, RespondRequestDto } from './dto/request-decision.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';

@ApiTags('resources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'resources', version: '1' })
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
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
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'List available resources' })
  async findAvailable() {
    return this.resourcesService.findAvailable();
  }

  @Get('capabilities')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'List the capability catalog (MOD-29)' })
  async listCapabilities() {
    return this.resourcesService.listCapabilities();
  }

  @Get('recommend/:incidentId')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Recommend resources for an incident (assistive only)' })
  async recommend(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.resourcesService.recommend(incidentId);
  }

  @Get('requests')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'List mutual-aid resource requests (MOD-35); filter by incidentId, orgId, status' })
  async listRequests(
    @Query('incidentId') incidentId?: string,
    @Query('orgId') orgId?: string,
    @Query('status') status?: string,
  ) {
    return this.resourcesService.listRequests({
      ...(incidentId && { incidentId }),
      ...(orgId && { orgId }),
      ...(status && { status }),
    });
  }

  @Post('requests')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Create a mutual-aid resource request (MOD-35)' })
  async createRequest(@Body() dto: ResourceRequestDto, @Request() req: any) {
    const orgId = await this.resourcesService.resolveOrgForUser(req.user.id);
    return this.resourcesService.createRequest(dto, orgId, req.user.id);
  }

  @Patch('requests/:id/approve')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Approve a resource request — providing org accepts and fulfills (MOD-35)' })
  async approveRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequestDecisionDto,
    @Request() req: any,
  ) {
    const providingOrgId = await this.resourcesService.resolveAnsweringOrg(req.user.id);
    return this.resourcesService.respondToRequest(id, true, body.notes, req.user.id, providingOrgId);
  }

  @Patch('requests/:id/deny')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Deny a resource request (MOD-35)' })
  async denyRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RequestDecisionDto,
    @Request() req: any,
  ) {
    // Same 403 as approve for an actor with no organization; a denial sets no provider.
    await this.resourcesService.resolveAnsweringOrg(req.user.id);
    return this.resourcesService.respondToRequest(id, false, body.notes, req.user.id);
  }

  // Keep old /request routes as aliases for backwards compat with existing callers
  @Post('request')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Create a mutual-aid resource request (deprecated — use /requests)' })
  async createRequestLegacy(@Body() dto: ResourceRequestDto, @Request() req: any) {
    const orgId = await this.resourcesService.resolveOrgForUser(req.user.id);
    return this.resourcesService.createRequest(dto, orgId, req.user.id);
  }

  @Patch('request/:id/respond')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Respond to a resource request (deprecated — use /requests/:id/approve or /deny)' })
  async respondToRequestLegacy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RespondRequestDto,
    @Request() req: any,
  ) {
    // Accepting makes the actor's organization the provider, as on /requests/:id/approve;
    // either answer needs an organization, as on /approve and /deny.
    const answeringOrgId = await this.resourcesService.resolveAnsweringOrg(req.user.id);
    const providingOrgId = body.accept ? answeringOrgId : undefined;
    return this.resourcesService.respondToRequest(id, body.accept, body.notes, req.user.id, providingOrgId);
  }

  @Get(':id')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Get resource by ID' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.resourcesService.findById(id);
  }

  @Post()
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Create a resource' })
  async create(@Body() dto: CreateResourceDto, @Request() req: any) {
    return this.resourcesService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Update a resource' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResourceDto,
    @Request() req: any,
  ) {
    return this.resourcesService.update(id, dto, req.user);
  }

  @Patch(':id/status')
  // Fleet board only. Responders set their own availability on /responders/me/availability.
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
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
    @Request() req: any,
  ) {
    return this.resourcesService.addCapability(id, dto.capabilityId, req.user);
  }

  @Delete(':id/capabilities/:capId')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Remove a capability from a resource' })
  async removeCapability(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('capId', ParseUUIDPipe) capId: string,
    @Request() req: any,
  ) {
    await this.resourcesService.removeCapability(id, capId, req.user);
    return { message: 'Capability removed' };
  }

  @Patch(':id/capabilities/:capId/verify')
  // The organization that claims a capability is not the one that confirms it.
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Verify or unverify a capability assigned to a resource (MOD-29)' })
  async verifyCapability(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('capId', ParseUUIDPipe) capId: string,
    @Body() dto: VerifyCapabilityDto,
    @Request() req: any,
  ) {
    return this.resourcesService.verifyCapability(id, capId, dto.verified, req.user);
  }
}
