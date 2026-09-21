import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EmergencyAlertsService } from './emergency-alerts.service';
import { SosAlertDto } from './dto/sos-alert.dto';
import { Public } from '../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';

@ApiTags('alerts')
@Controller({ path: 'emergency-alerts', version: '1' })
export class EmergencyAlertsController {
  constructor(private readonly emergencyAlertsService: EmergencyAlertsService) {}

  @Post('sos')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trigger a one-button SOS emergency alert (guest OK)' })
  @ApiResponse({ status: 201, description: 'Incident created (or existing returned)' })
  async sos(@Body() dto: SosAlertDto, @Request() req: any) {
    return this.emergencyAlertsService.createFromSos(dto, 'SOS_BUTTON', req.user?.id);
  }

  @Post('shake')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trigger a shake-to-alert emergency (guest OK)' })
  async shake(@Body() dto: SosAlertDto, @Request() req: any) {
    return this.emergencyAlertsService.createFromSos(dto, 'SHAKE_GESTURE', req.user?.id);
  }

  @Post(':id/cancel')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Cancel an alert within the grace window' })
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.emergencyAlertsService.cancel(id, req.user?.id);
  }

  @Get(':id/status')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get alert/incident status' })
  async status(@Param('id', ParseUUIDPipe) id: string) {
    return this.emergencyAlertsService.getStatus(id);
  }
}
