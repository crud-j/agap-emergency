import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { HospitalsService } from './hospitals.service';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { CreateReferralDto } from './dto/create-referral.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { NearbyQueryDto } from './dto/nearby-query.dto';
import { SetLocationDto } from './dto/set-location.dto';
import { VerifyLocationDto } from './dto/verify-location.dto';

/**
 * Pre-arrival notes can carry medical detail: never citizens, bystanders or the
 * System Administrator. Hospital users are further limited to their own hospital
 * (checked in the service).
 */
const REFERRAL_READERS = [
  UserRole.DISPATCHER,
  UserRole.SUPERVISOR,
  UserRole.RESPONDER,
  UserRole.HOSPITAL_USER,
] as const;

@ApiTags('hospitals')
@ApiBearerAuth()
@Controller({ path: 'hospitals', version: '1' })
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List hospitals' })
  async findAll(@Query('includeUnreviewed') includeUnreviewed: string | undefined, @Request() req: any) {
    return this.hospitalsService.findAll(req.user, includeUnreviewed === 'true');
  }

  @Get('nearby')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List nearby hospitals' })
  async findNearby(@Query() query: NearbyQueryDto) {
    return this.hospitalsService.findNearby(query.lat, query.lng, query.limit);
  }

  @Get('referrals/:refId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...REFERRAL_READERS)
  @ApiOperation({ summary: 'Get a referral' })
  async findReferral(@Param('refId', ParseUUIDPipe) refId: string, @Request() req: any) {
    return this.hospitalsService.findReferralFor(refId, req.user);
  }

  @Patch('referrals/:refId/acknowledge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOSPITAL_USER)
  @ApiOperation({ summary: 'Acknowledge a referral' })
  async acknowledgeReferral(
    @Param('refId', ParseUUIDPipe) refId: string,
    @Request() req: any,
  ) {
    return this.hospitalsService.acknowledgeReferral(refId, req.user);
  }

  @Patch('referrals/:refId/arrived')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOSPITAL_USER, UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Mark referral patient arrived' })
  async markArrived(@Param('refId', ParseUUIDPipe) refId: string, @Request() req: any) {
    return this.hospitalsService.markArrived(refId, req.user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a hospital' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.hospitalsService.findVisibleById(id, req.user);
  }

  /** Org Administrators may create only for their own HOSPITAL organization (checked in the service). */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMINISTRATOR, UserRole.ORG_ADMINISTRATOR)
  @ApiOperation({ summary: 'Create a hospital' })
  async create(@Body() dto: CreateHospitalDto, @Request() req: any) {
    return this.hospitalsService.create(dto, req.user);
  }

  @Patch(':id/location')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMINISTRATOR, UserRole.SUPERVISOR, UserRole.ORG_ADMINISTRATOR)
  @ApiOperation({ summary: 'Set hospital coordinates' })
  async setLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetLocationDto,
    @Request() req: any,
  ) {
    return this.hospitalsService.setLocation(id, dto, req.user);
  }

  @Post(':id/location/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMINISTRATOR, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Verify or reject hospital coordinates' })
  async verifyLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyLocationDto,
    @Request() req: any,
  ) {
    return this.hospitalsService.verifyLocation(id, dto, req.user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Update a hospital' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHospitalDto,
    @Request() req: any,
  ) {
    return this.hospitalsService.update(id, dto, req.user);
  }

  @Post(':id/referrals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER, UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Create a hospital referral' })
  async createReferral(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateReferralDto,
    @Request() req: any,
  ) {
    return this.hospitalsService.createReferral(id, body, req.user.id);
  }

  @Get('referrals/incident/:incidentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...REFERRAL_READERS)
  @ApiOperation({ summary: 'List referrals for an incident' })
  async findIncidentReferrals(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Request() req: any,
  ) {
    return this.hospitalsService.findIncidentReferrals(incidentId, req.user);
  }

  @Get(':id/referrals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...REFERRAL_READERS)
  @ApiOperation({ summary: 'List hospital referrals' })
  async findReferrals(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.hospitalsService.findReferrals(id, req.user);
  }
}
