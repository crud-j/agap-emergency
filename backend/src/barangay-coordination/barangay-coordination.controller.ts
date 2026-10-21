import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@agap/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BarangayDirectoryService } from './barangay-directory.service';
import {
  BarangayNotFoundError,
  BarangayNoticeMissingError,
  BarangayNotifyService,
  BarangayResendRefusedError,
} from './barangay-notify.service';
import { SetBarangayDto } from './dto/set-barangay.dto';

@ApiTags('barangay-coordination')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
@Controller({ version: '1' })
export class BarangayCoordinationController {
  constructor(
    private readonly notify: BarangayNotifyService,
    private readonly directory: BarangayDirectoryService,
  ) {}

  @Get('barangays')
  @ApiOperation({ summary: 'List barangays (for the manual-correction dropdown)' })
  listBarangays() {
    return this.directory.listBarangays();
  }

  @Get('incidents/:id/barangay')
  @ApiOperation({ summary: 'The incident barangay notice and that barangay contacts' })
  getForIncident(@Param('id', ParseUUIDPipe) id: string) {
    return this.notify.getForIncident(id);
  }

  @Patch('incidents/:id/barangay')
  @ApiOperation({ summary: 'Manually set or correct the incident barangay (audited)' })
  async setManual(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBarangayDto,
    @Request() req: any,
  ) {
    try {
      await this.notify.setManual(id, dto.barangayId, req.user.id);
    } catch (err) {
      if (err instanceof BarangayNotFoundError) throw new BadRequestException(err.message);
      throw err;
    }
    return this.notify.getForIncident(id);
  }

  @Post('incidents/:id/barangay/resend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resend the barangay alert SMS after a failure (audited)' })
  async resend(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    try {
      await this.notify.resend(id, req.user.id);
    } catch (err) {
      if (err instanceof BarangayNoticeMissingError) throw new NotFoundException(err.message);
      if (err instanceof BarangayResendRefusedError) throw new ConflictException(err.message);
      throw err;
    }
    return this.notify.getForIncident(id);
  }
}
