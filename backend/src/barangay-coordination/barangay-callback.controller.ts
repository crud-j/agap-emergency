import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@agap/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  BarangayCallbackNotFoundError,
  BarangayCallbackRefusedError,
  BarangayCallbackService,
} from './barangay-callback.service';
import { BarangayNotifyService } from './barangay-notify.service';
import { BarangayOutcomeDto, CallAttemptDto, ConfirmHandledDto } from './dto/barangay-callback.dto';

@ApiTags('barangay-coordination')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
@Controller({ version: '1' })
export class BarangayCallbackController {
  constructor(
    private readonly callbacks: BarangayCallbackService,
    private readonly notify: BarangayNotifyService,
  ) {}

  @Post('incidents/:id/barangay/call-attempts')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log that the dispatcher called a barangay number (timeline + audit)' })
  async callAttempt(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CallAttemptDto, @Request() req: any) {
    await this.run(() => this.callbacks.logCallAttempt(id, dto.contactId, req.user));
    return this.notify.getForIncident(id);
  }

  @Post('incidents/:id/barangay/outcome')
  @HttpCode(200)
  @ApiOperation({ summary: 'Record what the barangay said by phone (backup request escalates)' })
  async outcome(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BarangayOutcomeDto, @Request() req: any) {
    await this.run(() => this.callbacks.recordOutcome(id, dto.outcome, dto.notes, req.user));
    return this.notify.getForIncident(id);
  }

  @Post('incidents/:id/barangay/confirm-handled')
  @HttpCode(200)
  @ApiOperation({ summary: 'Barangay has it handled: ASSESSED → REFERRED with a resolution record' })
  async confirmHandled(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmHandledDto, @Request() req: any) {
    await this.run(() => this.callbacks.confirmHandled(id, req.user, dto.notes));
    return this.notify.getForIncident(id);
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      if (err instanceof BarangayCallbackNotFoundError) throw new NotFoundException(err.message);
      if (err instanceof BarangayCallbackRefusedError) throw new ConflictException(err.message);
      throw err;
    }
  }
}
