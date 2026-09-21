import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MedicalProfilesService } from './medical-profiles.service';
import { CreateMedicalProfileDto } from './dto/create-medical-profile.dto';
import { UpdateMedicalProfileDto } from './dto/update-medical-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('medical')
@ApiBearerAuth()
@Controller({ path: 'medical-profiles', version: '1' })
export class MedicalProfilesController {
  constructor(private readonly medicalProfilesService: MedicalProfilesService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get my medical profile' })
  async findMine(@Request() req: any) {
    return this.medicalProfilesService.findMine(req.user.id);
  }

  @Post('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create my medical profile (requires consent)' })
  async create(@Request() req: any, @Body() dto: CreateMedicalProfileDto) {
    return this.medicalProfilesService.create(req.user.id, dto);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update my medical profile' })
  async update(@Request() req: any, @Body() dto: UpdateMedicalProfileDto) {
    return this.medicalProfilesService.update(req.user.id, dto);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete my medical profile and withdraw consent' })
  async deleteMine(@Request() req: any) {
    await this.medicalProfilesService.deleteMine(req.user.id);
  }

  @Get(':userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER, UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'Access a patient medical profile (audited)' })
  async findForResponder(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Request() req: any,
  ) {
    return this.medicalProfilesService.findForResponder(userId, req.user.id);
  }
}
