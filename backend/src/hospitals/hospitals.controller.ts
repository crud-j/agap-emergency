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

@ApiTags('hospitals')
@ApiBearerAuth()
@Controller({ path: 'hospitals', version: '1' })
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List hospitals' })
  async findAll() {
    return this.hospitalsService.findAll();
  }

  @Get('nearby')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List nearby hospitals' })
  async findNearby(@Query('lat') lat?: number, @Query('lng') lng?: number) {
    return this.hospitalsService.findNearby(lat ? +lat : 0, lng ? +lng : 0);
  }

  @Get('referrals/:refId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a referral' })
  async findReferral(@Param('refId', ParseUUIDPipe) refId: string) {
    return this.hospitalsService.findReferral(refId);
  }

  @Patch('referrals/:refId/acknowledge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.HOSPITAL_USER)
  @ApiOperation({ summary: 'Acknowledge a referral' })
  async acknowledgeReferral(
    @Param('refId', ParseUUIDPipe) refId: string,
    @Request() req: any,
  ) {
    return this.hospitalsService.acknowledgeReferral(refId, req.user.id);
  }

  @Patch('referrals/:refId/arrived')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mark referral patient arrived' })
  async markArrived(@Param('refId', ParseUUIDPipe) refId: string, @Request() req: any) {
    return this.hospitalsService.markArrived(refId, req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get a hospital' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.hospitalsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Create a hospital' })
  async create(@Body() dto: CreateHospitalDto) {
    return this.hospitalsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Update a hospital' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateHospitalDto>,
  ) {
    return this.hospitalsService.update(id, dto);
  }

  @Post(':id/referrals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER, UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Create a hospital referral' })
  async createReferral(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateReferralDto & { incidentId: string },
    @Request() req: any,
  ) {
    return this.hospitalsService.createReferral(id, body.incidentId, body, req.user.id);
  }

  @Get(':id/referrals')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List hospital referrals' })
  async findReferrals(@Param('id', ParseUUIDPipe) id: string) {
    return this.hospitalsService.findReferrals(id);
  }
}
