import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@agap/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { authContextFromRequest } from '../auth/request-context';
import { SlaPoliciesService } from './sla-policies.service';
import { SlaScheduleService } from './sla-schedule.service';
import { UpdateSlaPolicyDto } from './dto/update-sla-policy.dto';

type AuthedRequest = {
  user: { id: string; role: string };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

/** MOD-41 response targets. Read by the console; changed only by Supervisor or System Administrator. */
@ApiTags('escalations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'sla-policies', version: '1' })
export class SlaPoliciesController {
  constructor(
    private readonly policies: SlaPoliciesService,
    private readonly schedule: SlaScheduleService,
  ) {}

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Response targets (SLA) per priority / category, plus the fallback' })
  list() {
    return this.policies.list();
  }

  @Patch(':id')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Change one policy’s targets (audited)' })
  @ApiResponse({ status: 400, description: 'Out of range, or not acknowledge ≤ dispatch ≤ on scene' })
  async update(@Request() req: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSlaPolicyDto) {
    const ctx = authContextFromRequest(req);
    const saved = await this.policies.update(id, dto, {
      id: req.user.id,
      role: req.user.role,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
    // Open incidents get checks at the new deadlines now. Best-effort, after the save.
    void this.schedule.rescheduleOpenIncidents();
    return saved;
  }
}
