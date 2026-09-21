import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('administration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'permissions', version: '1' })
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'List all permissions' })
  async findAll() {
    return this.permissionsService.findAll();
  }

  @Get('roles/:role')
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'List permissions for a role' })
  async findByRole(@Param('role') role: UserRole) {
    return this.permissionsService.findByRole(role);
  }

  @Post('roles/:role')
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Grant a permission to a role' })
  async grant(@Param('role') role: UserRole, @Body() body: { permissionId: string }) {
    return this.permissionsService.grantToRole(role, body.permissionId);
  }

  @Delete('roles/:role/:permission')
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Revoke a permission from a role' })
  async revoke(
    @Param('role') role: UserRole,
    @Param('permission', ParseUUIDPipe) permission: string,
  ) {
    await this.permissionsService.revokeFromRole(role, permission);
    return { message: 'Permission revoked' };
  }
}
