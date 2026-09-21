import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CaptureLocationDto } from './dto/capture-location.dto';
import { GeocodeDto } from './dto/geocode.dto';
import { TrackLocationDto } from './dto/track-location.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('locations')
@Controller({ path: 'locations', version: '1' })
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post('capture')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Capture a GPS location (guest OK)' })
  async capture(@Body() dto: CaptureLocationDto, @Request() req: any) {
    return this.locationsService.capture(dto, req.user?.id);
  }

  @Post('geocode')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reverse geocode coordinates' })
  async geocode(@Body() dto: GeocodeDto) {
    return this.locationsService.reverseGeocode(dto.latitude, dto.longitude);
  }

  @Post('track')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Push a responder location update' })
  async track(@Body() dto: TrackLocationDto, @Request() req: any) {
    return this.locationsService.trackResponder(dto, req.user.id);
  }

  @Get('tracking/:incidentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.RESPONDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Live tracking positions for an incident' })
  async liveTracking(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.locationsService.getLiveTracking(incidentId);
  }

  @Get('tracking/:incidentId/eta')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estimated time of arrival (labeled estimate)' })
  async eta(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.locationsService.getEta(incidentId);
  }

  @Get('tracking/:incidentId/responders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Responder positions for an incident' })
  async responders(@Param('incidentId', ParseUUIDPipe) incidentId: string) {
    return this.locationsService.getResponderPositions(incidentId);
  }

  @Get('history/:resourceId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Location history for a resource' })
  async history(@Param('resourceId', ParseUUIDPipe) resourceId: string) {
    return this.locationsService.getResourceHistory(resourceId);
  }
}
