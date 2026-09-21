import {
  Controller,
  Get,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AdministrationService } from './administration.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('administration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMINISTRATOR)
@Controller({ path: 'administration', version: '1' })
export class AdministrationController {
  constructor(private readonly administrationService: AdministrationService) {}

  @Get('users')
  @ApiOperation({ summary: 'List all users' })
  async findAllUsers(
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.administrationService.findAllUsers({
      ...(page !== undefined && { page: +page }),
      ...(perPage !== undefined && { perPage: +perPage }),
      ...(role && { role }),
      ...(status && { status }),
    });
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Change a user role' })
  async changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { role: string },
    @Request() req: any,
  ) {
    return this.administrationService.changeRole(id, body.role, req.user.id);
  }

  @Patch('users/:id/activate')
  @ApiOperation({ summary: 'Activate a user' })
  async activate(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.administrationService.activate(id, req.user.id);
  }

  @Patch('users/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate a user' })
  async deactivate(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.administrationService.deactivate(id, req.user.id);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Delete a user' })
  async deleteUser(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    await this.administrationService.deleteUser(id, req.user.id);
    return { message: 'User deleted' };
  }

  @Get('config')
  @ApiOperation({ summary: 'Get system configuration' })
  async getConfig() {
    return this.administrationService.getConfig();
  }

  @Put('config/:key')
  @ApiOperation({ summary: 'Upsert a system configuration value' })
  async upsertConfig(
    @Param('key') key: string,
    @Body() body: { value: unknown },
    @Request() req: any,
  ) {
    return this.administrationService.upsertConfig(key, body.value, req.user.id);
  }

  @Get('health')
  @ApiOperation({ summary: 'System health' })
  async health() {
    return this.administrationService.getHealth();
  }
}
