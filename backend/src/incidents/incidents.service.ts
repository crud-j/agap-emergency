import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentStatusService } from './incident-status/incident-status.service';
import { DuplicateDetectionService } from './duplicate-detection/duplicate-detection.service';
import { PriorityService } from './priority/priority.service';
import { IncidentStatus, IncidentType, IncidentPriority } from '@agap/shared';
import { Prisma, type Incident } from '@prisma/client';

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly statusService: IncidentStatusService,
    private readonly duplicateService: DuplicateDetectionService,
    private readonly priorityService: PriorityService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
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

    // Merge citizen-supplied hazard observations + response need requests into one flags array.
    const hazardFlags: string[] = [
      ...(dto.hazards ?? []),
      ...(dto.responseNeeds ?? []).map((n) => `DISPATCH:${n}`),
    ];

    // Map the affected-count bucket to a numeric estimate for priority scoring.
    const numberOfPatients = dto.affectedCount
      ? ({ '1': 1, '2-5': 3, '5+': 10 } as Record<string, number>)[dto.affectedCount] ?? null
      : null;

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
          hazard_flags: hazardFlags,
          ...(numberOfPatients !== null ? { number_of_patients: numberOfPatients } : {}),
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

      if (dto.patient != null) {
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

      // Persist location record (MOD-11). Source reflects how the coordinates arrived.
      if (dto.lat !== undefined && dto.lng !== undefined) {
        const locationSource = dto.address ? 'GPS_WITH_ADDRESS' : 'GPS';
        await tx.incident_locations.create({
          data: {
            incident_id: inc.id,
            latitude: dto.lat,
            longitude: dto.lng,
            formatted_address: dto.address ?? null,
            source: locationSource,
          },
        });
      } else if (dto.address) {
        // Reporter provided a manual landmark / street with no GPS coordinates.
        // Store with sentinel coords that signal manual entry to the dispatcher.
        // The dispatcher UI should flag these for manual map placement.
        await tx.incident_locations.create({
          data: {
            incident_id: inc.id,
            latitude: 0,
            longitude: 0,
            formatted_address: dto.address,
            source: 'MANUAL',
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

    // Push the new emergency to the Operations Center dashboard in real time
    // (MOD-20/MOD-21). Best-effort — persistence already succeeded, so a realtime
    // failure must never affect the incident (Reliability Rule).
    try {
      this.realtime.notifyIncidentCreated({
        incidentId: incident.id,
        type: incident.category as unknown as IncidentType,
        priority: incident.priority as unknown as IncidentPriority,
        status: incident.status as unknown as IncidentStatus,
        location:
          dto.lat !== undefined && dto.lng !== undefined ? { lat: dto.lat, lng: dto.lng } : null,
        reportedAt: incident.submitted_at.toISOString(),
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for incident.created: ${String(err)}`);
    }

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
        incident_locations: true,
        dispatches: true,
        on_scene_assessments: { orderBy: { assessed_at: 'desc' } },
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

    // NOTE: run sequentially (not via `$transaction([...])`). Prisma 7 drops
    // `skip: 0` during serialization and rejects the query with "Argument `skip`
    // is missing". Omit `skip` entirely on the first page to avoid this.
    const data = await this.prisma.incident.findMany({
      where,
      // Include location so the dispatch dashboard + map can place incidents
      // without an N+1 fetch (MOD-21/MOD-22).
      include: { incident_locations: true },
      orderBy: { submitted_at: 'desc' },
      ...(skip > 0 ? { skip } : {}),
      take: perPage,
    });
    const total = await this.prisma.incident.count({ where });

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

  // ---- Citizen-facing history (MOD-42) ----

  /**
   * Incidents reported by the authenticated citizen, newest first. DRAFTs are
   * excluded — they were never submitted. Ownership is enforced through the
   * reporter relation so a citizen only ever sees their own reports.
   */
  async listMine(userId: string) {
    const incidents = await this.prisma.incident.findMany({
      where: {
        status: { not: IncidentStatus.DRAFT as any },
        incident_reporters: { is: { user_id: userId } },
      },
      orderBy: { submitted_at: 'desc' },
      include: { incident_locations: true },
    });
    return incidents.map((i) => this.toCitizenSummary(i));
  }

  private toCitizenSummary(i: any) {
    const loc = i.incident_locations;
    const address =
      loc?.formatted_address ??
      [loc?.barangay, loc?.municipality].filter(Boolean).join(', ') ??
      null;
    return {
      id: i.id,
      reference: i.public_reference,
      type: i.category,
      priority: i.priority,
      status: i.status,
      address: address || null,
      description: i.description ?? null,
      reportedAt: i.submitted_at,
      updatedAt: i.updated_at,
    };
  }

  /**
   * Full citizen-facing detail for one incident. Ownership-scoped: only the
   * reporting citizen may read it. Sensitive recipient data (phone numbers) is
   * never returned — notifications expose only title, channel, and status.
   */
  async getCitizenDetail(incidentId: string, userId: string) {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        incident_reporters: true,
        incident_locations: true,
        incident_events: { orderBy: { occurred_at: 'asc' } },
        incident_resolutions: true,
        notifications: { orderBy: { created_at: 'asc' } },
      },
    });
    if (!incident) throw new NotFoundException(`Incident ${incidentId} not found`);

    const reporter = incident.incident_reporters;
    if (!reporter || reporter.user_id !== userId) {
      throw new ForbiddenException('You do not have access to this incident');
    }

    const loc = incident.incident_locations;
    return {
      id: incident.id,
      reference: incident.public_reference,
      type: incident.category,
      priority: incident.priority,
      status: incident.status,
      description: incident.description ?? null,
      numberOfPatients: incident.number_of_patients ?? null,
      reportedAt: incident.submitted_at,
      updatedAt: incident.updated_at,
      reporter: {
        name: reporter.reporter_name ?? null,
        isGuest: reporter.is_guest,
      },
      location: loc
        ? {
            address: loc.formatted_address ?? null,
            street: loc.street ?? null,
            barangay: loc.barangay ?? null,
            municipality: loc.municipality ?? null,
            province: loc.province ?? null,
            lat: loc.latitude != null ? Number(loc.latitude) : null,
            lng: loc.longitude != null ? Number(loc.longitude) : null,
          }
        : null,
      timeline: incident.incident_events.map((e) => ({
        status: e.to_status,
        at: e.occurred_at,
        notes: e.notes ?? null,
      })),
      notifications: incident.notifications.map((n) => ({
        title: n.title ?? n.event_type,
        channel: n.channel,
        status: n.status,
        sentAt: n.sent_at ?? n.created_at,
      })),
      resolution: incident.incident_resolutions
        ? {
            outcome: incident.incident_resolutions.outcome,
            disposition: incident.incident_resolutions.patient_disposition ?? null,
            notes: incident.incident_resolutions.resolution_notes ?? null,
            followUpRequired: incident.incident_resolutions.follow_up_required,
            closedAt: incident.incident_resolutions.closed_at,
          }
        : null,
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.incident.update({
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

      return result;
    });

    // Fan the status change out to the ops dashboard + the citizen's incident room
    // (MOD-20/MOD-42). This also emits the dedicated lifecycle event for milestone
    // statuses (incident.dispatched/en_route/arrived/resolved/closed/cancelled).
    // Best-effort — never undo the persisted transition.
    try {
      this.realtime.notifyIncidentStatusChanged({
        incidentId: id,
        previousStatus: currentStatus,
        newStatus,
        changedAt: new Date().toISOString(),
        changedBy: actorId,
        ...(reason ? { reason } : {}),
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for incident.status_changed: ${String(err)}`);
    }

    return updated;
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
    const attachment = await this.prisma.incidentAttachment.create({
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

    // New evidence is an incident-record change — refresh the ops queue/drawer
    // live (MOD-10/MOD-20). Best-effort; a WS failure never loses the upload.
    try {
      this.realtime.incidentUpdated(incidentId, {
        change: 'attachment_added',
        attachmentId: attachment.id,
        fileType: attachment.file_type,
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for incident.updated (attachment): ${String(err)}`);
    }

    return attachment;
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
    const previousStatus = incident.status as unknown as IncidentStatus;
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.incident.update({
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
      return result;
    });

    // Tell the ops dashboard + citizen screen the incident was classified as a
    // false alert. Best-effort — the persisted transition stands regardless.
    try {
      this.realtime.notifyIncidentStatusChanged({
        incidentId: id,
        previousStatus,
        newStatus: IncidentStatus.FALSE_ALERT,
        changedAt: new Date().toISOString(),
        changedBy: actorId,
        ...(notes ? { reason: notes } : {}),
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for false-alert status change: ${String(err)}`);
    }

    return updated;
  }

  async markDuplicate(id: string, actorId: string, masterIncidentId?: string) {
    // When a master is named, use the full advisory-merge path (sets the
    // duplicate_of_id link + audits). Otherwise just flag the status.
    if (masterIncidentId) {
      return this.mergeDuplicate(id, masterIncidentId, actorId);
    }

    const incident = await this.findById(id);
    const previousStatus = incident.status as unknown as IncidentStatus;
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
      },
    });

    try {
      this.realtime.notifyIncidentStatusChanged({
        incidentId: id,
        previousStatus,
        newStatus: IncidentStatus.DUPLICATE,
        changedAt: new Date().toISOString(),
        changedBy: actorId,
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for duplicate status change: ${String(err)}`);
    }

    return updated;
  }

  /**
   * MOD-26 — merge an incident as a confirmed DUPLICATE of a master incident.
   * ADVISORY action: this is only ever invoked by an explicit dispatcher
   * decision (POST /incidents/:id/merge), never automatically. Sets
   * status=DUPLICATE + duplicate_of_id, writes an immutable audit entry, and
   * emits incident.status_changed (best-effort).
   */
  async mergeDuplicate(id: string, masterIncidentId: string, actorId: string): Promise<Incident> {
    if (!masterIncidentId) {
      throw new BadRequestException('masterIncidentId is required to merge a duplicate');
    }
    if (id === masterIncidentId) {
      throw new BadRequestException('An incident cannot be merged into itself');
    }

    const incident = await this.findById(id);
    const master = await this.prisma.incident.findUnique({ where: { id: masterIncidentId } });
    if (!master) {
      throw new NotFoundException(`Master incident ${masterIncidentId} not found`);
    }

    const previousStatus = incident.status as unknown as IncidentStatus;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.incident.update({
        where: { id },
        data: {
          status: IncidentStatus.DUPLICATE as any,
          duplicate_of_id: masterIncidentId,
        },
      });
      await tx.incidentEvent.create({
        data: {
          incident_id: id,
          from_status: incident.status as any,
          to_status: IncidentStatus.DUPLICATE as any,
          triggered_by_id: actorId,
          notes: `Merged as duplicate of ${master.public_reference}`,
        },
      });
      return result;
    });

    // Immutable audit trail (MOD-46). Best-effort — never blocks the merge.
    await this.audit.log({
      action: 'UPDATE',
      actorId,
      entityType: 'incident',
      entityId: id,
      moduleId: 'MOD-26',
      incidentId: id,
      oldValues: { status: previousStatus },
      newValues: { status: IncidentStatus.DUPLICATE, duplicate_of_id: masterIncidentId },
    });

    // Distribute the change to the ops dashboard + citizen screen (best-effort).
    try {
      this.realtime.notifyIncidentStatusChanged({
        incidentId: id,
        previousStatus,
        newStatus: IncidentStatus.DUPLICATE,
        changedAt: new Date().toISOString(),
        changedBy: actorId,
        reason: `Duplicate of ${master.public_reference}`,
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for duplicate merge: ${String(err)}`);
    }

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

  // Incident chat (MOD-33) is served by CommunicationsService, which enforces
  // participants-only access and strips sender identity. The former unguarded
  // listMessages/postMessage here were retired to remove the bypass.

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

  async acknowledgeHandover(incidentId: string, userId: string) {
    const handover = await this.prisma.incident_handovers.findFirst({
      where: { incident_id: incidentId, to_user_id: userId, acknowledged_at: null },
      orderBy: { handed_over_at: 'desc' },
    });
    if (!handover) throw new NotFoundException('Pending handover not found for this user');
    return this.prisma.incident_handovers.update({
      where: { id: handover.id },
      data: { acknowledged_at: new Date() },
    });
  }

  // ---- ICS extended (MOD-36) ----

  async updateIcs(incidentId: string, dto: { objectives?: string[] }, _userId: string) {
    const ics = await this.prisma.incident_command_structures.findUnique({
      where: { incident_id: incidentId },
    });
    if (!ics) throw new NotFoundException('No ICS activated for incident');
    return this.prisma.incident_command_structures.update({
      where: { incident_id: incidentId },
      data: { ...(dto.objectives !== undefined && { objectives: dto.objectives }) },
    });
  }

  async deactivateIcs(incidentId: string, _userId: string) {
    const ics = await this.prisma.incident_command_structures.findUnique({
      where: { incident_id: incidentId },
    });
    if (!ics) throw new NotFoundException('No ICS activated for incident');
    await this.prisma.ics_assignments.deleteMany({ where: { ics_id: ics.id } });
    await this.prisma.incident_command_structures.delete({ where: { incident_id: incidentId } });
    return { message: 'ICS deactivated' };
  }

  async removeIcsPosition(positionId: string, _userId: string) {
    const assignment = await this.prisma.ics_assignments.findUnique({
      where: { id: positionId },
    });
    if (!assignment) throw new NotFoundException('ICS position not found');
    await this.prisma.ics_assignments.delete({ where: { id: positionId } });
    return { message: 'ICS position removed' };
  }

  // ---- Assessment single read (MOD-37) ----

  async getAssessment(assessmentId: string) {
    const assessment = await this.prisma.on_scene_assessments.findUnique({
      where: { id: assessmentId },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    return assessment;
  }

  // ---- Agency removal (MOD-34) ----

  async removeAgency(incidentId: string, organizationId: string) {
    await this.prisma.incident_agency_participants.deleteMany({
      where: { incident_id: incidentId, organization_id: organizationId },
    });
    return { message: 'Agency removed from incident' };
  }
}
