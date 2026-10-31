import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Res,
  StreamableFile,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { IncidentsService } from './incidents.service';
import { AssessmentService } from './assessment/assessment.service';
import { FireReportService } from './fire-report/fire-report.service';
import { RescueTripService } from './rescue-trip/rescue-trip.service';
import { IncidentHandoverService } from './incident-handover/incident-handover.service';
import { TransportService } from './transport/transport.service';
import { StartTransportDto } from './transport/dto/start-transport.dto';
import { RecordArrivalDto } from './transport/dto/record-arrival.dto';
import { UpdateTransportDto } from './transport/dto/update-transport.dto';
import { ConfirmReporterPatientDto } from './transport/dto/confirm-reporter-patient.dto';
import { MediaService, MULTER_MEMORY_STORAGE, MAX_VIDEO_UPLOAD_BYTES } from '../media/media.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';
import { SubmitAssessmentDto } from './assessment/dto/submit-assessment.dto';
import { SubmitFireReportDto } from './fire-report/dto/submit-fire-report.dto';
import { SubmitRescueTripDto } from './rescue-trip/dto/submit-rescue-trip.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole, IncidentStatus } from '@agap/shared';
import { IncidentParticipantService, type IncidentParticipation } from '../realtime/incident-participant.service';
import {
  ActivateIcsDto, AddAgencyDto, AssignIcsPositionDto, AssignIncidentCommanderDto, FalseAlertDto,
  IncidentFeedbackDto, MarkDuplicateDto, MergeIncidentDto, UpdateIcsDto,
} from './dto/incident-actions.dto';
import { CreateHandoverDto } from './incident-handover/dto/create-handover.dto';
import { CreateResolutionDto } from './dto/create-resolution.dto';
import { RejectAttachmentDto } from './dto/reject-attachment.dto';

/** The authenticated caller, as JwtAuthGuard attaches it. */
type AuthedRequest = { user: { id: string; role: string } };

@ApiTags('incidents')
@Controller({ path: 'incidents', version: '1' })
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly mediaService: MediaService,
    private readonly assessmentService: AssessmentService,
    private readonly handoverService: IncidentHandoverService,
    private readonly transportService: TransportService,
    private readonly participants: IncidentParticipantService,
    private readonly fireReportService: FireReportService,
    private readonly rescueTripService: RescueTripService,
  ) {}

  /**
   * Object-level access for incident reads (MOD-47/48): the caller must be staff, crew
   * on a dispatch of this incident, or its registered reporter, and their kind must be
   * in `allowed`. Anyone else gets 403, whatever the id, so a leaked or guessed id
   * reveals nothing (e.g. a guest report's id left on a shared phone).
   */
  private async requireParticipation(
    req: AuthedRequest,
    incidentId: string,
    allowed: readonly IncidentParticipation[],
  ): Promise<IncidentParticipation> {
    const participation = await this.participants.getParticipation(
      { id: req.user.id, role: req.user.role },
      incidentId,
    );
    if (!participation || !allowed.includes(participation)) {
      throw new ForbiddenException('You do not have access to this incident');
    }
    return participation;
  }

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Report a new emergency incident (auth optional)' })
  @ApiResponse({ status: 201, description: 'Incident created' })
  @ApiResponse({ status: 409, description: 'Duplicate idempotency key (returns existing incident)' })
  async create(@Body() dto: CreateIncidentDto, @Request() req: any) {
    const actorId = req.user?.id ?? undefined;
    return this.incidentsService.create(dto, actorId, req.user?.role);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List incidents (ops center)' })
  async findAll(
    @Query('page') page?: number,
    @Query('perPage') perPage?: number,
    @Query('status') status?: IncidentStatus,
    @Query('statuses') statuses?: string,
  ) {
    return this.incidentsService.findAll({
      ...(page !== undefined && { page: +page }),
      ...(perPage !== undefined && { perPage: +perPage }),
      ...(status !== undefined && { status }),
      ...(statuses && { statuses: statuses.split(',') as IncidentStatus[] }),
    });
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List incidents reported by the authenticated citizen (MOD-42)' })
  async findMine(@Request() req: any) {
    return this.incidentsService.listMine(req.user.id);
  }

  @Get('mine/standing')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "The citizen's Verified Reporter standing (counts only)" })
  async myStanding(@Request() req: any) {
    return this.incidentsService.getReporterStanding(req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get incident by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    const participation = await this.requireParticipation(req, id, ['staff', 'crew', 'reporter']);
    // The reporter (citizen app) gets status, reference and scene only: never patients,
    // assessments, attachments, contact numbers or dispatch internals (plan §17).
    if (participation === 'reporter') return this.incidentsService.findReporterView(id);

    const { barangay_notices, ...incident } = (await this.incidentsService.findById(id)) as any;
    // reporter_sex (reporter map icon) is for staff and assigned crew only.
    // The barangay notice (short code, report status) is ops-only.
    if (participation === 'staff') {
      return {
        ...incident,
        barangay_notices,
        reporter_sex: await this.incidentsService.getReporterSex(id),
      };
    }
    return { ...incident, reporter_sex: await this.incidentsService.getReporterSex(id) };
  }

  @Get(':id/detail')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Citizen-facing incident detail, ownership-scoped (MOD-42)' })
  async citizenDetail(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.incidentsService.getCitizenDetail(id, req.user.id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update incident status (MOD-15)' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentStatusDto,
    @Request() req: any,
  ) {
    return this.incidentsService.updateStatus(id, dto.status, req.user.id, dto.reason);
  }

  // ---- Attachments ----

  @Post(':id/attachments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: MULTER_MEMORY_STORAGE,
      // The video ceiling; MediaService enforces the smaller 10 MB photo limit.
      limits: { fileSize: MAX_VIDEO_UPLOAD_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Upload a photo or video attachment for an incident (MOD-10)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'JPEG/PNG/WebP image (max 10 MB) or MP4 video (max 25 MB)' },
        capturedAt: { type: 'string', description: 'Device clock (ms epoch) at capture — Tier 1 provenance' },
        captureLat: { type: 'string', description: 'GPS latitude at capture' },
        captureLng: { type: 'string', description: 'GPS longitude at capture' },
        captureAccuracy: { type: 'string', description: 'GPS accuracy (m) at capture' },
        captureSource: { type: 'string', description: "Provenance, e.g. 'live-camera'" },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Attachment record created; storage_url is the public download URL' })
  @HttpCode(HttpStatus.CREATED)
  async addAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, string>,
    @Request() req: any,
  ) {
    // Trusted capture provenance sent as multipart fields (Tier 1 photo validation).
    // Parsed defensively — any missing/invalid field simply lowers check confidence.
    const num = (v?: string) => {
      const n = v != null ? Number(v) : NaN;
      return Number.isFinite(n) ? n : undefined;
    };
    const capture = {
      capturedAt: num(body?.capturedAt),
      lat: num(body?.captureLat),
      lng: num(body?.captureLng),
      accuracy: num(body?.captureAccuracy),
      source: body?.captureSource || undefined,
    };
    // Only the incident's own reporter attaches evidence (the app uploads right after submitting).
    await this.incidentsService.assertReporter(id, req.user.id);
    const attachment = await this.mediaService.uploadIncidentPhoto(file, id, req.user?.id, capture);
    // Photos arrive after the incident is created, so tell the dashboard to refetch.
    this.incidentsService.notifyAttachmentAdded(id, attachment.id);
    return attachment;
  }

  @Get(':id/attachments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List incident attachments' })
  async listAttachments(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.listAttachments(id);
  }

  @Get(':id/attachments/:attachmentId/file')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Download an incident attachment (MOD-10), streamed through the API' })
  async attachmentFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.mediaService.getIncidentAttachmentFile(id, attachmentId);
    // Incident evidence is sensitive — never cache it in shared caches.
    res.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(file.stream, {
      type: file.contentType,
      ...(file.contentLength !== undefined && { length: file.contentLength }),
    });
  }

  @Patch(':id/attachments/:attachmentId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Reject a piece of submitted evidence as not credible (MOD-10). Attachment-level only — ' +
      'never changes the incident status or blocks dispatch. Warns the reporter.',
  })
  async rejectAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Body() dto: RejectAttachmentDto,
    @Request() req: any,
  ) {
    return this.incidentsService.rejectAttachment(id, attachmentId, req.user.id, dto.notes);
  }

  // ---- Events & timeline ----

  @Get(':id/events')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Incident event log' })
  async listEvents(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthedRequest) {
    await this.requireParticipation(req, id, ['staff', 'crew']);
    return this.incidentsService.listEvents(id);
  }

  @Get(':id/timeline')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Citizen-facing timeline' })
  async timeline(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthedRequest) {
    await this.requireParticipation(req, id, ['staff', 'crew', 'reporter']);
    return this.incidentsService.getTimeline(id);
  }

  @Get(':id/status')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Citizen-facing status screen' })
  async citizenStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.getCitizenStatus(id);
  }

  // ---- Lifecycle ----

  @Patch(':id/acknowledge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Acknowledge an incident' })
  async acknowledge(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.incidentsService.acknowledge(id, req.user.id);
  }

  @Patch(':id/assess')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assess an incident' })
  async assess(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.incidentsService.assess(id, req.user.id);
  }

  @Post(':id/false-alert')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Classify an incident as a false alert' })
  async falseAlert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: FalseAlertDto,
    @Request() req: any,
  ) {
    return this.incidentsService.markFalseAlert(id, req.user.id, body?.notes);
  }

  @Post(':id/duplicate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Classify an incident as a duplicate' })
  async duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MarkDuplicateDto,
    @Request() req: any,
  ) {
    return this.incidentsService.markDuplicate(id, req.user.id, body?.masterIncidentId);
  }

  @Post(':id/merge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Merge an incident as a confirmed duplicate of a master (MOD-26). Advisory — a dispatcher confirms; never auto-merged.',
  })
  async merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MergeIncidentDto,
    @Request() req: any,
  ) {
    return this.incidentsService.mergeDuplicate(id, body.masterIncidentId, req.user.id);
  }

  @Post(':id/resolution')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record incident resolution' })
  async createResolution(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateResolutionDto,
    @Request() req: any,
  ) {
    return this.incidentsService.createResolution(id, body, req.user.id);
  }

  @Get(':id/reporter-standing')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: "The reporter's Verified Reporter standing, for dispatchers (counts only)" })
  async reporterStanding(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.getReporterStandingForIncident(id);
  }

  @Get(':id/resolution')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get incident resolution' })
  async getResolution(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthedRequest) {
    // Patient disposition: staff and crew only. The reporter's outcome is in GET :id/detail.
    await this.requireParticipation(req, id, ['staff', 'crew']);
    return this.incidentsService.getResolution(id);
  }

  @Post(':id/close')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Close an incident' })
  async close(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.incidentsService.close(id, req.user.id);
  }

  @Post(':id/feedback')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit incident feedback' })
  async feedback(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: IncidentFeedbackDto,
    @Request() req: any,
  ) {
    // Only the person who reported the incident rates it.
    await this.incidentsService.assertReporter(id, req.user.id);
    return this.incidentsService.submitFeedback(id, body, req.user.id);
  }

  // ---- Messages: retired. Incident chat now lives in the communications module
  // (/v1/communications/:incidentId), which enforces participants-only access and
  // strips sender identity (MOD-33 / CLAUDE.md rule 15). ----

  // ---- Multi-agency ----

  @Get(':id/agencies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List participating agencies' })
  async listAgencies(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.listAgencies(id);
  }

  @Get(':id/agencies/available')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List organizations not yet participating (optionally filtered by type, e.g. BFP) (MOD-34)' })
  async listAvailableAgencies(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('orgType') orgType?: string,
  ) {
    return this.incidentsService.listAvailableAgencies(id, orgType);
  }

  @Post(':id/agencies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a participating agency (MOD-34)' })
  async addAgency(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddAgencyDto,
    @Request() req: any,
  ) {
    return this.incidentsService.addAgency(id, body.organizationId, req.user.id);
  }

  // ---- Assessments ----

  @Get(':id/assessments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List on-scene assessments' })
  async listAssessments(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthedRequest) {
    // Medical data (vitals, triage): staff and crew only, never the reporter (plan §17).
    await this.requireParticipation(req, id, ['staff', 'crew']);
    return this.incidentsService.listAssessments(id);
  }

  @Post(':id/assessment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit an on-scene patient assessment (MOD-37). All fields optional; emits incident.assessment_updated.',
  })
  async submitAssessment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAssessmentDto,
    @Request() req: any,
  ) {
    return this.assessmentService.submit(id, dto, req.user.id);
  }

  // ---- Fire reports (MOD-32/36, unit field flow plan Phase 3) ----

  @Get(':id/fire-reports')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List fire reports, newest first (the first is the current picture)' })
  async listFireReports(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthedRequest) {
    // Hazards, casualties and crew notes: staff and crew only, never the reporter.
    await this.requireParticipation(req, id, ['staff', 'crew']);
    return this.fireReportService.list(id);
  }

  @Post(':id/fire-report')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER, UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'File a fire report (a FIRE unit\'s crew, or staff relaying a radio report). All fields optional; append-only.',
  })
  async submitFireReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitFireReportDto,
    @Request() req: any,
  ) {
    return this.fireReportService.submit(id, dto, { id: req.user.id, role: req.user.role });
  }

  // ---- Rescue trips (MOD-32/52, unit field flow plan Phase 4) ----

  @Get(':id/rescue-summary')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rescue totals (rescued, vulnerable counts, latest still waiting, per destination) and every trip, newest first' })
  async rescueSummary(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthedRequest) {
    // Counts and crew notes: staff and crew only, never the reporter.
    await this.requireParticipation(req, id, ['staff', 'crew']);
    return this.rescueTripService.summary(id);
  }

  @Post(':id/rescue-trip')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER, UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Log a rescue trip (a RESCUE unit\'s crew, or staff relaying a radio report). All fields optional; append-only.',
  })
  async submitRescueTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitRescueTripDto,
    @Request() req: any,
  ) {
    return this.rescueTripService.submit(id, dto, { id: req.user.id, role: req.user.role });
  }

  // ---- ICS ----

  @Post(':id/ics/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate ICS for an incident' })
  async activateIcs(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ActivateIcsDto,
    @Request() req: any,
  ) {
    return this.incidentsService.activateIcs(id, body?.objectives ?? [], req.user.id);
  }

  @Get(':id/ics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get ICS structure' })
  async getIcs(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.getIcs(id);
  }

  @Post(':id/ics/positions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign an ICS position (MOD-36)' })
  async addIcsPosition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignIcsPositionDto,
    @Request() req: any,
  ) {
    return this.incidentsService.addIcsPosition(id, body, req.user.id);
  }

  @Post(':id/ics/assign-ic')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign the Incident Commander (shortcut for INCIDENT_COMMANDER position) (MOD-36)' })
  async assignIncidentCommander(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignIncidentCommanderDto,
    @Request() req: any,
  ) {
    return this.incidentsService.addIcsPosition(
      id,
      { ...body, position: 'INCIDENT_COMMANDER' },
      req.user.id,
    );
  }

  // ---- Handover (MOD-44) ----

  @Post(':id/handover')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an incident handover record — transfers situational awareness to incoming operator (MOD-44)' })
  async createHandover(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateHandoverDto,
    @Request() req: any,
  ) {
    return this.handoverService.create(id, body, req.user.id);
  }

  @Get('handover/recipients')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Active dispatchers and supervisors who can receive a handover (MOD-44)' })
  async handoverRecipients(@Request() req: any) {
    return this.handoverService.recipients(req.user.id);
  }

  @Get(':id/handover')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List handover records for incident, newest first (MOD-44)' })
  async listHandovers(@Param('id', ParseUUIDPipe) id: string) {
    return this.handoverService.list(id);
  }

  @Patch(':id/handover/acknowledge')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Acknowledge the pending incoming handover (MOD-44)' })
  async acknowledgeHandover(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.handoverService.acknowledge(id, req.user.id);
  }

  // ---- Transport (MOD-40) ----

  @Get(':id/transport')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.RESPONDER, UserRole.HOSPITAL_USER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List transport records for an incident (MOD-40). Hospital users see only their own facilities\' transports.' })
  async listTransports(@Param('id', ParseUUIDPipe) id: string, @Request() req: AuthedRequest) {
    // Patient names and the destination: staff, or crew on this incident. Hospital users
    // are scoped to their own facilities' transports by the service instead.
    if (req.user.role !== UserRole.HOSPITAL_USER) await this.requireParticipation(req, id, ['staff', 'crew']);
    return this.transportService.listTransports(id, { id: req.user.id, role: req.user.role });
  }

  @Post(':id/transport')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.RESPONDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start transport — transitions incident to TRANSPORTING and emits incident.transporting (MOD-40)' })
  async startTransport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartTransportDto,
    @Request() req: any,
  ) {
    return this.transportService.startTransport(id, dto, req.user.id, req.user.role);
  }

  @Patch(':id/transport/:transportId/arrive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.RESPONDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record facility arrival — emits incident.facility_arrival (MOD-40)' })
  async recordArrival(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('transportId', ParseUUIDPipe) transportId: string,
    @Body() dto: RecordArrivalDto,
    @Request() req: any,
  ) {
    return this.transportService.recordArrival(id, transportId, dto, req.user.id, req.user.role);
  }

  @Patch(':id/transport/:transportId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  // Responders only for a dispatch they crew, and only before arrival (service checks).
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.RESPONDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update transport record — destination change or ETA update (MOD-40)' })
  async updateTransport(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('transportId', ParseUUIDPipe) transportId: string,
    @Body() body: UpdateTransportDto,
    @Request() req: any,
  ) {
    return this.transportService.updateTransport(id, transportId, body, req.user.id, req.user.role);
  }

  @Patch(':id/transport/:transportId/reporter-patient')
  @UseGuards(JwtAuthGuard, RolesGuard)
  // Responders only for a dispatch they crew (service checks).
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.RESPONDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Confirm (or withdraw) that the person being carried is the registered reporter (MOD-40, C17)' })
  async confirmReporterIsPatient(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('transportId', ParseUUIDPipe) transportId: string,
    @Body() dto: ConfirmReporterPatientDto,
    @Request() req: any,
  ) {
    return this.transportService.confirmReporterIsPatient(
      id, transportId, { id: req.user.id, role: req.user.role }, dto.confirmed,
    );
  }

  // ---- ICS extended ----

  @Patch(':id/ics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update ICS objectives and situation notes (MOD-36)' })
  async updateIcs(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateIcsDto,
    @Request() req: any,
  ) {
    return this.incidentsService.updateIcs(id, body, req.user.id);
  }

  @Post(':id/ics/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate ICS for incident (MOD-36)' })
  async deactivateIcs(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.incidentsService.deactivateIcs(id, req.user.id);
  }

  @Delete(':id/ics/positions/:posId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove an ICS position assignment (MOD-36)' })
  async removeIcsPosition(
    @Param('posId', ParseUUIDPipe) posId: string,
    @Request() req: any,
  ) {
    return this.incidentsService.removeIcsPosition(posId, req.user.id);
  }

  // ---- Assessment single read ----

  @Get(':id/assessments/:aId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single on-scene assessment (MOD-37)' })
  async getAssessment(@Param('aId', ParseUUIDPipe) aId: string) {
    return this.incidentsService.getAssessment(aId);
  }

  // ---- Message read-marking: retired → PATCH /v1/communications/:incidentId/messages/:messageId/read ----

  // ---- Agency removal ----

  @Delete(':id/agencies/:orgId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a participating agency from incident (MOD-34)' })
  async removeAgency(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Request() req: any,
  ) {
    return this.incidentsService.removeAgency(id, orgId, req.user.id);
  }
}
