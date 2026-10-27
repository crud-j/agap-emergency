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
  Res,
  ParseUUIDPipe,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import type { Response } from 'express';
import { AnnouncementsService } from './announcements.service';
import { MediaService, MULTER_MEMORY_STORAGE } from '../media/media.service';
import { CancelAnnouncementDto, CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { ReturnAnnouncementDto, SubmitAnnouncementDto } from './dto/approval.dto';
import { SmsSubscribeDto } from './dto/sms-subscribe.dto';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';
import { ScheduleAnnouncementDto, SupersedeAnnouncementDto, UnsubscribeDto } from './dto/announcement-actions.dto';

@ApiTags('announcements')
@Controller({ path: 'announcements', version: '1' })
export class AnnouncementsController {
  constructor(
    private readonly announcementsService: AnnouncementsService,
    private readonly mediaService: MediaService,
  ) {}

  private async streamImage(key: string, res: Response, cacheControl: string) {
    const img = await this.mediaService.getAnnouncementImage(key);
    res.setHeader('Cache-Control', cacheControl);
    // Helmet defaults CORP to same-origin, which would block the ops console
    // (a different origin) from rendering the image.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return new StreamableFile(img.stream, {
      type: img.contentType,
      ...(img.contentLength !== undefined && { length: img.contentLength }),
    });
  }

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

  @Get('archive')
  @Public()
  @ApiOperation({ summary: 'List previously released public announcements' })
  async findPublicArchive() {
    return this.announcementsService.findPublicArchive();
  }

  @Post('subscribe')
  @Public()
  @Throttle({ burst: { ttl: 1000, limit: 5 }, sustained: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Subscribe to SMS announcements' })
  async subscribe(@Body() dto: SmsSubscribeDto) {
    return this.announcementsService.subscribe(dto);
  }

  @Post('unsubscribe')
  @Public()
  @Throttle({ burst: { ttl: 1000, limit: 5 }, sustained: { ttl: 60000, limit: 30 } })
  @ApiOperation({ summary: 'Unsubscribe from SMS announcements' })
  async unsubscribe(@Body() body: UnsubscribeDto) {
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
    @Query('severity') severity?: string,
    @Query('returned') returned?: string,
  ) {
    return this.announcementsService.findAllForPublisher({
      ...(status && { status }),
      ...(category && { category }),
      ...(severity && { severity }),
      ...(returned === 'true' && { returned: true }),
      ...(page !== undefined && { page: +page }),
      ...(perPage !== undefined && { perPage: +perPage }),
    });
  }

  @Get('publisher/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get any announcement, including drafts (publisher view)' })
  async findForPublisher(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcementsService.findForPublisher(id);
  }

  @Get('policy')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Whether CRITICAL advisories need MDRRMO approval (Phase 7)' })
  policy() {
    return { criticalNeedsApproval: this.announcementsService.criticalNeedsApproval() };
  }

  // Declared before `:id`, whose ParseUUIDPipe would reject "approvals" with a 400.
  @Get('approvals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'CRITICAL advisories awaiting MDRRMO approval, oldest first' })
  async approvals() {
    return this.announcementsService.findPendingApproval();
  }

  @Get('approvals/:id/image')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Image of an advisory awaiting approval (Supervisor review)' })
  async approvalImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = await this.announcementsService.getImageKey(id, {
      publicOnly: false,
      statuses: ['PENDING_APPROVAL'],
    });
    return this.streamImage(key, res, 'private, no-store');
  }

  @Get('publisher/:id/image')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Image for any announcement, including drafts (publisher view)' })
  async publisherImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = await this.announcementsService.getImageKey(id, { publicOnly: false });
    return this.streamImage(key, res, 'private, no-store');
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get a released announcement (drafts are never public)' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.announcementsService.findPublicById(id);
  }

  @Get(':id/image')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Image of a released announcement, served through the API' })
  async publicImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = await this.announcementsService.getImageKey(id, { publicOnly: true });
    // Image is immutable once released (uploads are draft-only), so it can be cached.
    return this.streamImage(key, res, 'public, max-age=3600');
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
    @Body() dto: UpdateAnnouncementDto,
    @Request() req: any,
  ) {
    return this.announcementsService.update(id, dto, req.user.id);
  }

  @Post(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve and publish an announcement' })
  async publish(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.announcementsService.publish(id, req.user.id);
  }

  @Post(':id/schedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve and schedule an announcement' })
  async schedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ScheduleAnnouncementDto,
    @Request() req: any,
  ) {
    return this.announcementsService.schedule(id, body.scheduledAt, req.user.id);
  }

  @Post(':id/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit a CRITICAL draft for MDRRMO approval' })
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAnnouncementDto,
    @Request() req: any,
  ) {
    return this.announcementsService.submitForApproval(id, req.user.id, dto.scheduledAt);
  }

  @Post(':id/withdraw')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Withdraw a submission back to draft' })
  async withdraw(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.announcementsService.withdrawSubmission(id, req.user.id);
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Approve a CRITICAL advisory: publish now or at its requested time' })
  async approve(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.announcementsService.approve(id, req.user.id);
  }

  @Post(':id/return')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return a submission to draft with a note' })
  async returnToDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnAnnouncementDto,
    @Request() req: any,
  ) {
    return this.announcementsService.returnToDraft(id, dto.note, req.user.id);
  }

  @Post(':id/unschedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return a scheduled announcement to draft' })
  async unschedule(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.announcementsService.unschedule(id, req.user.id);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Officially cancel a published or scheduled announcement' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAnnouncementDto,
    @Request() req: any,
  ) {
    return this.announcementsService.cancel(id, dto.correctionNote, req.user.id);
  }

  @Post(':id/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an image for a draft announcement (jpeg/png/webp, max 5 MB)' })
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
    @Body() body: SupersedeAnnouncementDto,
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
