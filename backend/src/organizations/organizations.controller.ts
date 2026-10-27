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
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'List organizations' })
  async findAll() {
    return this.organizationsService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Get organization by ID' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.organizationsService.findById(id);
  }

  @Post()
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Create an organization' })
  async create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Update an organization' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
    @Request() req: any,
  ) {
    return this.organizationsService.update(id, dto, req.user);
  }

  @Get(':id/members')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'List organization members' })
  async findMembers(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.organizationsService.findMembers(id, req.user);
  }

  @Post(':id/members')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Add a member to an organization' })
  async addMember(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMemberDto, @Request() req: any) {
    return this.organizationsService.addMember(id, dto, req.user);
  }

  @Delete(':id/members/:userId')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Remove a member from an organization' })
  async removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Request() req: any,
  ) {
    await this.organizationsService.removeMember(id, userId, req.user);
    return { message: 'Member removed' };
  }
}
