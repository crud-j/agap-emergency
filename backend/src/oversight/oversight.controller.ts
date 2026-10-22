import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@agap/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { OversightService } from './oversight.service';

/** Supervisor dashboard and Command / ICS reads. Supervisor only; no writes. */
@ApiTags('oversight')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPERVISOR)
@Controller({ path: 'oversight', version: '1' })
export class OversightController {
  constructor(private readonly oversight: OversightService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Operations summary counts, units and 7-day performance' })
  summary() {
    return this.oversight.getSummary();
  }

  @Get('workload')
  @ApiOperation({ summary: 'Open dispatches and recent actions per Dispatcher / Supervisor' })
  workload() {
    return this.oversight.getWorkload();
  }

  @Get('exceptions')
  @ApiOperation({ summary: 'Long waits, rejected dispatches and stale unit locations' })
  exceptions() {
    return this.oversight.getExceptions();
  }

  @Get('handovers')
  @ApiOperation({ summary: 'Handovers awaiting acknowledgement' })
  handovers() {
    return this.oversight.getPendingHandovers();
  }

  @Get('activity')
  @ApiOperation({ summary: 'Latest incident status changes and dispatch decisions (no notes)' })
  activity() {
    return this.oversight.getActivity();
  }

  @Get('major-incidents')
  @ApiOperation({ summary: 'Active incidents under ICS command or in an active surge' })
  majorIncidents() {
    return this.oversight.getMajorIncidents();
  }
}
