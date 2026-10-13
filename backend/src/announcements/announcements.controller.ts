import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { MediaService, MULTER_MEMORY_STORAGE } from '../media/media.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { SmsSubscribeDto } from './dto/sms-subscribe.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('announcements')
@Controller({ path: 'announcements', version: '1' })
export class AnnouncementsController {
  constructor(
    private readonly announcementsService: AnnouncementsService,
    private readonly mediaService: MediaService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List published announcements' })
  async findPublished(
    @Query('category') category?: string,
    @Query('barangay') barangay?: string,
  ) {
    return this.announcementsService.findPublished({
      ...(category && { category }),
      ...(barangay && { barangay }),
    });
  }

  @Post('subscribe')
  @Public()
  @ApiOperation({ summary: 'Subscribe to SMS announcements' })
  async subscribe(@Body() dto: SmsSubscribeDto) {
    return this.announcementsService.subscribe(dto);
  }

  @Post('unsubscribe')
  @Public()
  @ApiOperation({ summary: 'Unsubscribe from SMS announcements' })
  async unsubscribe(@Body() body: { phoneNumber: string }) {
    return this.announcementsService.unsubscribe(body.phoneNumber);
  }

  @Get('publisher/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all announcements for publisher view (includes drafts)' })
  async findAllForPublisher(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.announcementsService.findAllForPublisher({
      ...(status && { status }),
      ...(category && { category }),
      ...(page !== undefined && { page: +page }),
      ...(perPage !== undefined && { perPage: +perPage }),
    });
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get an announcement' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcementsService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an announcement draft' })
  async create(@Body() dto: CreateAnnouncementDto, @Request() req: any) {
    return this.announcementsService.create(dto, req.user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an announcement draft' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateAnnouncementDto>,
  ) {
    return this.announcementsService.update(id, dto);
  }

  @Post(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish an announcement' })
  async publish(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.announcementsService.publish(id, req.user.id);
  }

  @Post(':id/schedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Schedule an announcement' })
  async schedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { scheduledAt: string },
    @Request() req: any,
  ) {
    return this.announcementsService.schedule(id, body.scheduledAt, req.user.id);
  }

  @Post(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an image for an announcement (jpeg/png/webp, max 5 MB)' })
  @UseInterceptors(FileInterceptor('file', { storage: MULTER_MEMORY_STORAGE }))
  async uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.mediaService.uploadAnnouncementImage(file, id);
  }

  @Post(':id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archive an announcement' })
  async archive(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.announcementsService.archive(id, req.user.id);
  }

  @Post(':id/supersede')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Supersede an announcement' })
  async supersede(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { newAnnouncementId: string },
    @Request() req: any,
  ) {
    return this.announcementsService.supersede(id, body.newAnnouncementId, req.user.id);
  }

  @Get(':id/delivery')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get delivery stats' })
  async delivery(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcementsService.getDeliveryStats(id);
  }
}
