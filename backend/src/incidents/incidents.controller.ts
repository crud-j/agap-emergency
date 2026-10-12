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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { IncidentsService } from './incidents.service';
import { AssessmentService } from './assessment/assessment.service';
import { IncidentHandoverService } from './incident-handover/incident-handover.service';
import { TransportService } from './transport/transport.service';
import { StartTransportDto } from './transport/dto/start-transport.dto';
import { RecordArrivalDto } from './transport/dto/record-arrival.dto';
import { MediaService, MULTER_MEMORY_STORAGE } from '../media/media.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentStatusDto } from './dto/update-incident-status.dto';
import { SubmitAssessmentDto } from './assessment/dto/submit-assessment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole, IncidentStatus } from '@agap/shared';

@ApiTags('incidents')
@Controller({ path: 'incidents', version: '1' })
export class IncidentsController {
  constructor(
    private readonly incidentsService: IncidentsService,
    private readonly mediaService: MediaService,
    private readonly assessmentService: AssessmentService,
    private readonly handoverService: IncidentHandoverService,
    private readonly transportService: TransportService,
  ) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Report a new emergency incident (auth optional)' })
  @ApiResponse({ status: 201, description: 'Incident created' })
  @ApiResponse({ status: 409, description: 'Duplicate idempotency key (returns existing incident)' })
  async create(@Body() dto: CreateIncidentDto, @Request() req: any) {
    const actorId = req.user?.id ?? undefined;
    return this.incidentsService.create(dto, actorId);
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
  ) {
    return this.incidentsService.findAll({
      ...(page !== undefined && { page: +page }),
      ...(perPage !== undefined && { perPage: +perPage }),
      ...(status !== undefined && { status }),
    });
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List incidents reported by the authenticated citizen (MOD-42)' })
  async findMine(@Request() req: any) {
    return this.incidentsService.listMine(req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get incident by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.findById(id);
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
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
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
      limits: { fileSize: 10_485_760 },
    }),
  )
  @ApiOperation({ summary: 'Upload a photo or video attachment for an incident (MOD-10)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary', description: 'JPEG/PNG/WebP image or MP4 video (max 10 MB)' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Attachment record created; storage_url is the public download URL' })
  @HttpCode(HttpStatus.CREATED)
  async addAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: any,
  ) {
    return this.mediaService.uploadIncidentPhoto(file, id, req.user?.id);
  }

  @Get(':id/attachments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List incident attachments' })
  async listAttachments(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.listAttachments(id);
  }

  // ---- Events & timeline ----

  @Get(':id/events')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Incident event log' })
  async listEvents(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.listEvents(id);
  }

  @Get(':id/timeline')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Citizen-facing timeline' })
  async timeline(@Param('id', ParseUUIDPipe) id: string) {
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
    @Body() body: { notes?: string },
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
    @Body() body: { masterIncidentId?: string },
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
    @Body() body: { masterIncidentId: string },
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
    @Body()
    body: { outcome: string; patientDisposition?: string; resolutionNotes?: string },
    @Request() req: any,
  ) {
    return this.incidentsService.createResolution(id, body, req.user.id);
  }

  @Get(':id/resolution')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get incident resolution' })
  async getResolution(@Param('id', ParseUUIDPipe) id: string) {
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
    @Body() body: { overallRating?: number; comments?: string },
    @Request() req: any,
  ) {
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
    @Body() body: { organizationId: string; roleInIncident?: string },
    @Request() req: any,
  ) {
    return this.incidentsService.addAgency(id, body.organizationId, req.user.id);
  }

  // ---- Assessments ----

  @Get(':id/assessments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List on-scene assessments' })
  async listAssessments(@Param('id', ParseUUIDPipe) id: string) {
    return this.incidentsService.listAssessments(id);
  }

  @Post(':id/assessments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an on-scene assessment' })
  async createAssessment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
    @Request() req: any,
  ) {
    return this.incidentsService.createAssessment(id, body, req.user.id);
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

  @Patch(':id/assessments/:aId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an on-scene assessment' })
  async updateAssessment(
    @Param('aId', ParseUUIDPipe) aId: string,
    @Body() body: Record<string, unknown>,
    @Request() req: any,
  ) {
    return this.incidentsService.updateAssessment(aId, body, req.user.id);
  }

  // ---- ICS ----

  @Post(':id/ics/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate ICS for an incident' })
  async activateIcs(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { objectives?: string[] },
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
    @Body() body: { userId: string; position: string; organizationId?: string },
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
    @Body() body: { userId: string; organizationId?: string },
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
    @Body()
    body: { toUserId: string; situationSummary: string; pendingActions?: string[]; resourcesInField?: Record<string, unknown> },
    @Request() req: any,
  ) {
    return this.handoverService.create(id, body, req.user.id);
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
  @ApiOperation({ summary: 'List transport records for an incident (MOD-40)' })
  async listTransports(@Param('id', ParseUUIDPipe) id: string) {
    return this.transportService.listTransports(id);
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
    return this.transportService.startTransport(id, dto, req.user.id);
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
    return this.transportService.recordArrival(id, transportId, dto, req.user.id);
  }

  @Patch(':id/transport/:transportId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update transport record — destination change or ETA update (MOD-40)' })
  async updateTransport(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('transportId', ParseUUIDPipe) transportId: string,
    @Body() body: { destinationId?: string; estimatedArrivalAt?: string; changeReason?: string },
    @Request() req: any,
  ) {
    return this.transportService.updateTransport(id, transportId, body, req.user.id);
  }

  // ---- ICS extended ----

  @Patch(':id/ics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPERVISOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update ICS objectives/structure (MOD-36)' })
  async updateIcs(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { objectives?: string[] },
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
