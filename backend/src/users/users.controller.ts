import {
  Controller,
  Get,
  Patch,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { MAX_PROFILE_PHOTO_BYTES, ProfilePhotoService } from './profile-photo/profile-photo.service';
import { MULTER_MEMORY_STORAGE } from '../media/media.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ReportReadinessDto } from './dto/report-readiness.dto';
import { ResponderPhotoSharingDto } from './dto/responder-photo-sharing.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('users')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly profilePhoto: ProfilePhotoService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my profile' })
  async findMe(@Request() req: any) {
    return this.usersService.findMe(req.user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update my profile' })
  async updateMe(@Request() req: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(req.user.id, dto);
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate my account' })
  async deleteMe(@Request() req: any) {
    await this.usersService.deleteMe(req.user.id);
  }

  @Get('me/readiness')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my latest emergency readiness status (MOD-05)' })
  @ApiQuery({ name: 'deviceId', required: false, description: 'Limit to one device; defaults to the most recent report' })
  async getReadiness(@Request() req: any, @Query('deviceId') deviceId?: string) {
    return this.usersService.getReadiness(req.user.id, deviceId || undefined);
  }

  @Put('me/readiness')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Report this device’s readiness check and get the evaluated status (MOD-05)' })
  async reportReadiness(@Request() req: any, @Body() dto: ReportReadinessDto) {
    return this.usersService.reportReadiness(req.user.id, dto);
  }

  @Get('me/photo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'My profile picture (JPEG). 404 when none is set (MOD-01)' })
  async getMyPhoto(@Request() req: any, @Res({ passthrough: true }) res: Response) {
    const jpeg = await this.profilePhoto.read(req.user.id);
    // The app adds ?v=<updated_at>, so a new photo is a new URL; private: never in a shared cache.
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return new StreamableFile(jpeg, { type: 'image/jpeg', length: jpeg.length });
  }

  @Post('me/photo')
  @UseGuards(JwtAuthGuard)
  @Throttle({ burst: { ttl: 1000, limit: 2 }, sustained: { ttl: 60_000, limit: 10 } })
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Set my profile picture from a live selfie (MOD-01). Once every 5 months; 409 before then',
  })
  @UseInterceptors(
    FileInterceptor('photo', { storage: MULTER_MEMORY_STORAGE, limits: { fileSize: MAX_PROFILE_PHOTO_BYTES } }),
  )
  async uploadMyPhoto(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('captureSource') captureSource?: string,
  ) {
    return this.profilePhoto.upload(req.user.id, file, captureSource);
  }

  @Put('me/photo/responder-sharing')
  @UseGuards(JwtAuthGuard)
  @Throttle({ burst: { ttl: 1000, limit: 3 }, sustained: { ttl: 60_000, limit: 20 } })
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Turn on or off showing my profile photo to the staff and crew of my active reports (MOD-01/48)',
  })
  async setResponderPhotoSharing(@Request() req: any, @Body() dto: ResponderPhotoSharingDto) {
    return this.profilePhoto.setResponderSharing(req.user.id, dto.enabled);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user by ID' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List users' })
  async findAll(
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
    @Query('role') role?: UserRole,
  ) {
    return this.usersService.findAll({
      ...(page !== undefined && { page: +page }),
      ...(perPage !== undefined && { perPage: +perPage }),
      ...(role !== undefined && { role }),
    });
  }
}
