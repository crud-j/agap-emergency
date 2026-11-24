import {
  Controller,
  Get,
  Post,
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
import { SystemHealthService } from './system-health.service';
import { SmsActivityService } from './sms-activity.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';
import { AdminUserActionDto } from './dto/admin-user-action.dto';
import { RequireRecentAuth } from '../common/decorators/recent-auth.decorator';
import { RecentAuthGuard } from '../common/guards/recent-auth.guard';
import { ChangeRoleDto, ConfigValueDto } from './dto/admin-requests.dto';

@ApiTags('administration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMINISTRATOR)
@Controller({ path: 'administration', version: '1' })
export class AdministrationController {
  constructor(
    private readonly administrationService: AdministrationService,
    private readonly systemHealth: SystemHealthService,
    private readonly smsActivity: SmsActivityService,
  ) {}

  @Get('users')
  @ApiOperation({ summary: 'List all users' })
  async findAllUsers(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('organizationId') organizationId?: string,
    @Query('mfa') mfa?: string,
  ) {
    return this.administrationService.findAllUsers({
      ...(page !== undefined && { page: +page }),
      ...(perPage !== undefined && { perPage: +perPage }),
      ...(role && { role }),
      ...(status && { status }),
      ...(search && { search }),
      ...(organizationId && { organizationId }),
      ...(mfa && { mfa }),
    });
  }

  @Post('users/:id/unlock')
  @UseGuards(JwtAuthGuard, RolesGuard, RecentAuthGuard)
  @RequireRecentAuth()
  @ApiOperation({ summary: 'Unlock a user account' })
  async unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminUserActionDto,
    @Request() req: any,
  ) {
    return this.administrationService.unlock(id, body, req.user.id);
  }

  @Post('users/:id/temporary-password')
  @UseGuards(JwtAuthGuard, RolesGuard, RecentAuthGuard)
  @RequireRecentAuth()
  @ApiOperation({ summary: 'Issue a one-time temporary password' })
  async temporaryPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminUserActionDto,
    @Request() req: any,
  ) {
    return this.administrationService.issueTemporaryPassword(id, body, req.user.id);
  }

  @Post('users/:id/mfa/reset')
  @UseGuards(JwtAuthGuard, RolesGuard, RecentAuthGuard)
  @RequireRecentAuth()
  @ApiOperation({ summary: 'Reset a user MFA enrollment' })
  async resetMfa(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminUserActionDto,
    @Request() req: any,
  ) {
    return this.administrationService.resetMfa(id, body, req.user.id);
  }

  @Delete('users/:id/sessions')
  @UseGuards(JwtAuthGuard, RolesGuard, RecentAuthGuard)
  @RequireRecentAuth()
  @ApiOperation({ summary: 'Revoke all sessions for a user' })
  async revokeSessions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminUserActionDto,
    @Request() req: any,
  ) {
    return this.administrationService.revokeSessions(id, body, req.user.id);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Change a user role' })
  async changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangeRoleDto,
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
  @ApiOperation({ summary: 'System configuration, paginated (push-token and job rows are never listed)' })
  async getConfig(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('search') search?: string,
  ) {
    return this.administrationService.getConfig({
      ...(page !== undefined && { page: +page }),
      ...(perPage !== undefined && { perPage: +perPage }),
      ...(search && { search }),
    });
  }

  @Put('config/:key')
  @UseGuards(JwtAuthGuard, RolesGuard, RecentAuthGuard)
  @RequireRecentAuth()
  @ApiOperation({ summary: 'Upsert a system configuration value' })
  async upsertConfig(
    @Param('key') key: string,
    @Body() body: ConfigValueDto,
    @Request() req: any,
  ) {
    return this.administrationService.upsertConfig(key, body.value, req.user.id);
  }

  @Get('health')
  @ApiOperation({ summary: 'System health: database, Redis, queues and integrations (no secrets)' })
  async health() {
    return this.systemHealth.getHealth();
  }

  @Get('sms/summary')
  @ApiOperation({ summary: 'Outbound SMS counts: last 24 h, 7 days, by kind and by day (no phone numbers)' })
  async smsSummary() {
    return this.smsActivity.summary();
  }

  @Get('sms')
  @ApiOperation({ summary: 'Outbound SMS log, newest first (last 4 digits only, no message text)' })
  async smsLog(
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.smsActivity.list({
      ...(page !== undefined && { page: +page }),
      ...(perPage !== undefined && { perPage: +perPage }),
      ...(status && { status }),
      ...(kind && { kind }),
      ...(from && { from }),
      ...(to && { to }),
    });
  }
}
