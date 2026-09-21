import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentStatusService } from './incident-status/incident-status.service';
import { DuplicateDetectionService } from './duplicate-detection/duplicate-detection.service';
import { PriorityService } from './priority/priority.service';
import { IncidentStatus } from '@agap/shared';
import { Prisma, type Incident } from '@prisma/client';

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly statusService: IncidentStatusService,
    private readonly duplicateService: DuplicateDetectionService,
    private readonly priorityService: PriorityService,
  ) {}

  async create(dto: CreateIncidentDto, actorId?: string): Promise<Incident> {
    const existing = await this.prisma.incident.findFirst({
      where: { client_event_id: dto.idempotencyKey },
    });
    if (existing) {
      this.logger.log(`Idempotent incident for key ${dto.idempotencyKey}: ${existing.id}`);
      return existing;
    }

    if (dto.lat !== undefined && dto.lng !== undefined) {
      const possible = await this.duplicateService.findNearbyRecent(dto.lat, dto.lng, dto.type);
      if (possible) {
        this.logger.warn(`Possible duplicate of ${possible.id} detected`);
      }
    }

    const priority = dto.priority ?? this.priorityService.recommend(dto.type);
    const reference = await this.generateReference();

    const incident = await this.prisma.$transaction(async (tx) => {
      const inc = await tx.incident.create({
        data: {
          public_reference: reference,
          category: dto.type as any,
          priority: priority as any,
          status: IncidentStatus.SUBMITTED as any,
          description: dto.description ?? null,
          client_event_id: dto.idempotencyKey,
          trigger_method: 'MANUAL_REPORT' as any,
        },
      });

      await tx.incidentReporter.create({
        data: {
          incident_id: inc.id,
          user_id: actorId ?? null,
          is_guest: !actorId,
          reporter_name: dto.reporter?.name ?? null,
          reporter_phone: dto.reporter?.phone ?? null,
        },
      });

      if (dto.patient !== undefined) {
        await tx.incident_patients.create({
          data: {
            incident_id: inc.id,
            is_reporter: dto.patient.isReporter,
            is_unknown: dto.patient.isUnknown,
            patient_name: dto.patient.name ?? null,
            approximate_age: dto.patient.age ?? null,
            sex: dto.patient.sex ?? null,
          },
        });
      }

      await tx.incidentEvent.create({
        data: {
          incident_id: inc.id,
          to_status: IncidentStatus.SUBMITTED as any,
          triggered_by_id: actorId ?? null,
        },
      });

      return inc;
    });

    this.logger.log(`Incident created: ${incident.id} (${incident.public_reference})`);
    return incident;
  }

  async findById(id: string): Promise<Incident> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        incident_reporters: true,
        incident_patients: true,
        incident_attachments: true,
        incident_events: { orderBy: { occurred_at: 'asc' } },
        dispatches: true,
      },
    });
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);
    return incident;
  }

  async findAll(params: {
    page?: number | undefined;
    perPage?: number | undefined;
    status?: IncidentStatus | undefined;
  }) {
    const page = params.page ?? 1;
    const perPage = Math.min(params.perPage ?? 20, 100);
    const skip = (page - 1) * perPage;

    const where: Prisma.IncidentWhereInput = {};
    if (params.status) {
      where.status = params.status as any;
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.incident.findMany({
        where,
        orderBy: { submitted_at: 'desc' },
        skip,
        take: perPage,
      }),
      this.prisma.incident.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        hasNext: page * perPage < total,
        hasPrev: page > 1,
      },
    };
  }

  async updateStatus(
    id: string,
    newStatus: IncidentStatus,
    actorId: string,
    reason?: string,
  ): Promise<Incident> {
    const incident = await this.findById(id);
    const currentStatus = incident.status as unknown as IncidentStatus;
    this.statusService.validateTransition(currentStatus, newStatus);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.incident.update({
        where: { id },
        data: {
          status: newStatus as any,
          ...(newStatus === IncidentStatus.ACKNOWLEDGED && { acknowledged_at: new Date() }),
          ...(newStatus === IncidentStatus.ASSESSED && { assessed_at: new Date() }),
          ...(newStatus === IncidentStatus.DISPATCHED && { dispatched_at: new Date() }),
          ...(newStatus === IncidentStatus.EN_ROUTE && { en_route_at: new Date() }),
          ...(newStatus === IncidentStatus.ON_SCENE && { on_scene_at: new Date() }),
          ...(newStatus === IncidentStatus.RESOLVED && { resolved_at: new Date() }),
          ...(newStatus === IncidentStatus.CLOSED && { closed_at: new Date() }),
        },
      });

      await tx.incidentEvent.create({
        data: {
          incident_id: id,
          from_status: incident.status as any,
          to_status: newStatus as any,
          triggered_by_id: actorId,
          notes: reason ?? null,
        },
      });

      return updated;
    });
  }

  private async generateReference(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INC-${year}-`;
    const count = await this.prisma.incident.count({
      where: { public_reference: { startsWith: prefix } },
    });
    return `${prefix}${String(count + 1).padStart(6, '0')}`;
  }

  // ---- Attachments (MOD-10) ----

  async addAttachment(
    incidentId: string,
    dto: {
      fileName: string;
      fileType: string;
      storageBucket: string;
      storageKey: string;
      storageUrl?: string;
      fileSizeBytes?: number;
    },
    userId?: string,
  ) {
    await this.findById(incidentId);
    return this.prisma.incidentAttachment.create({
      data: {
        incident_id: incidentId,
        uploaded_by_id: userId ?? null,
        file_name: dto.fileName,
        file_type: dto.fileType,
        storage_bucket: dto.storageBucket,
        storage_key: dto.storageKey,
        storage_url: dto.storageUrl ?? null,
        file_size_bytes: dto.fileSizeBytes ?? null,
      },
    });
  }

  async listAttachments(incidentId: string) {
    return this.prisma.incidentAttachment.findMany({
      where: { incident_id: incidentId },
      orderBy: { uploaded_at: 'desc' },
    });
  }

  // ---- Events & timeline (MOD-15 / MOD-42) ----

  async listEvents(incidentId: string) {
    return this.prisma.incidentEvent.findMany({
      where: { incident_id: incidentId },
      orderBy: { occurred_at: 'asc' },
    });
  }

  async getTimeline(incidentId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: { incident_events: { orderBy: { occurred_at: 'asc' } } },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return {
      publicReference: incident.public_reference,
      status: incident.status,
      timeline: incident.incident_events.map((e) => ({
        status: e.to_status,
        at: e.occurred_at,
        notes: e.notes,
      })),
    };
  }

  async getCitizenStatus(incidentId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: { incident_locations: true },
    });
    if (!incident) throw new NotFoundException('Incident not found');
    return {
      publicReference: incident.public_reference,
      status: incident.status,
      category: incident.category,
      submittedAt: incident.submitted_at,
      dispatchedAt: incident.dispatched_at,
      etaNote: 'ETA is an estimate, never a guarantee',
    };
  }

  // ---- Lifecycle shortcuts (MOD-15) ----

  async acknowledge(id: string, actorId: string) {
    return this.updateStatus(id, IncidentStatus.ACKNOWLEDGED, actorId);
  }

  async assess(id: string, actorId: string) {
    return this.updateStatus(id, IncidentStatus.ASSESSED, actorId);
  }

  async markFalseAlert(id: string, actorId: string, notes?: string) {
    const incident = await this.findById(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.incident.update({
        where: { id },
        data: { status: IncidentStatus.FALSE_ALERT as any },
      });
      await tx.false_alerts.create({
        data: {
          incident_id: id,
          classified_by_id: actorId,
          false_alert_type: 'MISIDENTIFIED',
          notes: notes ?? null,
        },
      });
      await tx.incidentEvent.create({
        data: {
          incident_id: id,
          from_status: incident.status as any,
          to_status: IncidentStatus.FALSE_ALERT as any,
          triggered_by_id: actorId,
          notes: notes ?? null,
        },
      });
      return updated;
    });
  }

  async markDuplicate(id: string, actorId: string, masterIncidentId?: string) {
    const incident = await this.findById(id);
    const updated = await this.prisma.incident.update({
      where: { id },
      data: { status: IncidentStatus.DUPLICATE as any },
    });
    await this.prisma.incidentEvent.create({
      data: {
        incident_id: id,
        from_status: incident.status as any,
        to_status: IncidentStatus.DUPLICATE as any,
        triggered_by_id: actorId,
        notes: masterIncidentId ? `Duplicate of ${masterIncidentId}` : null,
      },
    });
    return updated;
  }

  async createResolution(
    id: string,
    dto: { outcome: string; patientDisposition?: string; resolutionNotes?: string },
    actorId: string,
  ) {
    await this.findById(id);
    return this.prisma.incident_resolutions.create({
      data: {
        incident_id: id,
        closed_by_id: actorId,
        outcome: dto.outcome,
        patient_disposition: (dto.patientDisposition ?? null) as any,
        resolution_notes: dto.resolutionNotes ?? null,
      },
    });
  }

  async getResolution(id: string) {
    const resolution = await this.prisma.incident_resolutions.findUnique({
      where: { incident_id: id },
    });
    if (!resolution) throw new NotFoundException('Resolution not found');
    return resolution;
  }

  async close(id: string, actorId: string) {
    return this.updateStatus(id, IncidentStatus.CLOSED, actorId);
  }

  async submitFeedback(
    id: string,
    dto: { overallRating?: number; comments?: string },
    userId: string,
  ) {
    await this.findById(id);
    return this.prisma.feedback_ratings.create({
      data: {
        incident_id: id,
        submitted_by_id: userId,
        overall_rating: dto.overallRating ?? null,
        comments: dto.comments ?? null,
      },
    });
  }

  // ---- Messages (MOD-33) ----

  async listMessages(id: string) {
    return this.prisma.incident_messages.findMany({
      where: { incident_id: id, is_deleted: false },
      orderBy: { sent_at: 'asc' },
    });
  }

  async postMessage(id: string, messageText: string, userId: string) {
    await this.findById(id);
    return this.prisma.incident_messages.create({
      data: { incident_id: id, sender_id: userId, message_text: messageText },
    });
  }

  // ---- Multi-agency (MOD-34) ----

  async listAgencies(id: string) {
    return this.prisma.incident_agency_participants.findMany({
      where: { incident_id: id },
    });
  }

  async addAgency(id: string, organizationId: string, userId: string) {
    await this.findById(id);
    return this.prisma.incident_agency_participants.create({
      data: {
        incident_id: id,
        organization_id: organizationId,
        invited_by_id: userId,
      },
    });
  }

  // ---- On-scene assessments (MOD-37) ----

  async listAssessments(id: string) {
    return this.prisma.on_scene_assessments.findMany({
      where: { incident_id: id },
      orderBy: { assessed_at: 'desc' },
    });
  }

  async createAssessment(
    id: string,
    dto: Record<string, unknown>,
    userId: string,
  ) {
    await this.findById(id);
    return this.prisma.on_scene_assessments.create({
      data: {
        incident_id: id,
        assessed_by_id: userId,
        assessment_notes: (dto['assessmentNotes'] as string) ?? null,
        triage_tag: (dto['triageTag'] as string) ?? null,
      },
    });
  }

  async updateAssessment(
    assessmentId: string,
    dto: Record<string, unknown>,
    _userId: string,
  ) {
    const assessment = await this.prisma.on_scene_assessments.findUnique({
      where: { id: assessmentId },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    return this.prisma.on_scene_assessments.update({
      where: { id: assessmentId },
      data: {
        ...(dto['assessmentNotes'] !== undefined && {
          assessment_notes: dto['assessmentNotes'] as string,
        }),
        ...(dto['triageTag'] !== undefined && {
          triage_tag: dto['triageTag'] as string,
        }),
      },
    });
  }

  // ---- ICS support (MOD-36) ----

  async activateIcs(id: string, objectives: string[], _userId: string) {
    await this.findById(id);
    return this.prisma.incident_command_structures.upsert({
      where: { incident_id: id },
      create: { incident_id: id, objectives: objectives ?? [] },
      update: { objectives: objectives ?? [] },
    });
  }

  async getIcs(id: string) {
    const ics = await this.prisma.incident_command_structures.findUnique({
      where: { incident_id: id },
      include: { ics_assignments: true },
    });
    if (!ics) throw new NotFoundException('No ICS activated for incident');
    return ics;
  }

  async addIcsPosition(
    id: string,
    dto: { userId: string; position: string; organizationId?: string },
  ) {
    const ics = await this.prisma.incident_command_structures.findUnique({
      where: { incident_id: id },
    });
    if (!ics) throw new NotFoundException('No ICS activated for incident');
    return this.prisma.ics_assignments.create({
      data: {
        ics_id: ics.id,
        user_id: dto.userId,
        position: dto.position as any,
        organization_id: dto.organizationId ?? null,
      },
    });
  }

  // ---- Handover (MOD-44) ----

  async createHandover(
    id: string,
    dto: { toUserId: string; situationSummary: string; pendingActions?: string[] },
    fromUserId: string,
  ) {
    await this.findById(id);
    return this.prisma.incident_handovers.create({
      data: {
        incident_id: id,
        from_user_id: fromUserId,
        to_user_id: dto.toUserId,
        situation_summary: dto.situationSummary,
        pending_actions: dto.pendingActions ?? [],
      },
    });
  }

  async listHandovers(id: string) {
    return this.prisma.incident_handovers.findMany({
      where: { incident_id: id },
      orderBy: { handed_over_at: 'desc' },
    });
  }
}
