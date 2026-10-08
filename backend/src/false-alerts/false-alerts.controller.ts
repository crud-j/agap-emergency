import {
  Controller,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { FalseAlertsService } from './false-alerts.service';
import { CancelIncidentDto, MarkFalseAlertDto } from './dto/cancel-incident.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('false-alerts')
@Controller({ path: 'false-alerts', version: '1' })
export class FalseAlertsController {
  constructor(private readonly falseAlertsService: FalseAlertsService) {}

  /**
   * Cancel an incident.
   *
   * - Citizens may cancel their own pre-dispatch incidents (SUBMITTED →
   *   DISPATCH_PENDING); requires ownership.
   * - Dispatchers/Supervisors/Admins may cancel any cancellable incident.
   * - Responders may not cancel.
   *
   * A valid reason from the cancellation_reason enum is required.
   */
  @Patch(':incidentId/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.CITIZEN,
    UserRole.BYSTANDER,
    UserRole.DISPATCHER,
    UserRole.SUPERVISOR,
    UserRole.ORG_ADMINISTRATOR,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an incident (MOD-08)' })
  @ApiParam({ name: 'incidentId', description: 'Incident UUID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Incident cancelled' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 403, description: 'Forbidden (wrong role or ownership)' })
  async cancel(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: CancelIncidentDto,
    @Request() req: any,
  ) {
    return this.falseAlertsService.cancel(
      incidentId,
      req.user.id,
      req.user.role,
      dto.reason,
      dto.notes,
    );
  }

  /**
   * Mark an incident as a false alert.
   * Dispatcher/Supervisor/Admin only. Valid from ACKNOWLEDGED or ASSESSED.
   */
  @Patch(':incidentId/false-alert')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.DISPATCHER,
    UserRole.SUPERVISOR,
    UserRole.ORG_ADMINISTRATOR,
    UserRole.SYSTEM_ADMINISTRATOR,
  )
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark incident as false alert (MOD-08)' })
  @ApiParam({ name: 'incidentId', description: 'Incident UUID', type: 'string' })
  @ApiResponse({ status: 200, description: 'Marked as false alert' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async markFalseAlert(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() dto: MarkFalseAlertDto,
    @Request() req: any,
  ) {
    return this.falseAlertsService.markFalseAlert(
      incidentId,
      req.user.id,
      req.user.role,
      dto.notes,
    );
  }
}
