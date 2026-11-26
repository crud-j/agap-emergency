import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { isIP } from 'net';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'audit', version: '1' })
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'List audit log entries (action: one value or a comma-separated list)' })
  async findAll(
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId', new ParseUUIDPipe({ optional: true })) entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('ip') ip?: string,
  ) {
    // The column is INET: a malformed value would be a database error, so refuse it here.
    if (ip && !isIP(ip)) throw new BadRequestException('ip must be an IPv4 or IPv6 address');
    return this.auditService.findAll({
      ...(ip && { ip }),
      ...(page !== undefined && { page: +page }),
      ...(perPage !== undefined && { perPage: +perPage }),
      ...(action && { action }),
      ...(actorId && { actorId }),
      ...(entityType && { entityType }),
      ...(entityId && { entityId }),
      ...(from && { from }),
      ...(to && { to }),
    });
  }

  @Get('incidents/:incidentId')
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Get audit trail for an incident' })
  async findByIncident(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.auditService.findByIncident(incidentId);
  }

  @Get(':id')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Get an audit log entry' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.auditService.findById(id);
  }
}
