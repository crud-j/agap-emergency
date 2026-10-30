import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { AuditAction, QUEUE_NAMES, normalizePhPhone } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { BLOCKED_ACCOUNT_STATUSES } from '../auth/account-status';
import type { NotificationJobData } from '../jobs/processors/notification.processor';
import type { SmsJobData } from '../jobs/processors/sms.processor';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { SmsSubscribeDto } from './dto/sms-subscribe.dto';
import { phoneVariants } from './sms-opt-out';
import {
  Announcement,
  Prisma,
  announcement_category,
  announcement_severity,
  announcement_status,
} from '@prisma/client';

/** Statuses a resident may open by direct link (feed shows PUBLISHED only). */
const PUBLIC_STATUSES: announcement_status[] = ['PUBLISHED', 'CANCELLED', 'ARCHIVED', 'SUPERSEDED'];

/** Parse "A,B" into the values that belong to `values`, dropping unknown ones. */
function enumList<T extends string>(raw: string | undefined, values: Record<string, T>): T[] {
  if (!raw) return [];
  const allowed = new Set<string>(Object.values(values));
  return raw.split(',').map((v) => v.trim()).filter((v): v is T => allowed.has(v));
}

/**
 * Factual advisories need a verified source before they go out
 * (docs/automation/bocaue_mayor_announcement_format.md §3, §10).
 */
const SOURCE_REQUIRED_CATEGORIES = new Set<announcement_category>([
  'FLOOD_ALERT',
  'WEATHER_ADVISORY',
  'EVACUATION_ORDER',
  'CLASS_SUSPENSION',
  'ROAD_CLOSURE',
  'FIRE_ADVISORY',
  'INDUSTRIAL_HAZARD',
  'RESCUE_UPDATE',
  'POST_DISASTER_UPDATE',
]);

/** Shape returned to the public / citizen app — no internal IDs or storage keys. */
export type PublicAnnouncement = ReturnType<AnnouncementsService['toPublic']>;

/** Relations flattened to display names in publisher and approver lists. */
const PUBLISHER_NAMES = {
  users: { select: { full_name: true } },
  users_announcements_approved_by_idTousers: { select: { full_name: true } },
  users_announcements_approval_requested_by_idTousers: { select: { full_name: true } },
} satisfies Prisma.AnnouncementInclude;

type AnnouncementWithNames = Prisma.AnnouncementGetPayload<{ include: typeof PUBLISHER_NAMES }>;

const NEEDS_APPROVAL_MESSAGE ='CRITICAL advisories need MDRRMO approval. Submit for approval instead.';

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PUSH_NOTIFICATIONS) private readonly pushQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationQueue: Queue,
  ) {}

  // ─── Approval policy (ROLE_DASHBOARDS_PLAN.md Phase 7) ───────────────────────

  /** ANNOUNCEMENT_APPROVAL_REQUIRED: CRITICAL advisories wait for an MDRRMO Supervisor. */
  criticalNeedsApproval(): boolean {
    return this.config.get<string>('ANNOUNCEMENT_APPROVAL_REQUIRED') === 'true';
  }

  needsApproval(a: Pick<Announcement, 'severity'>): boolean {
    return this.criticalNeedsApproval() && a.severity === 'CRITICAL';
  }

  /** Publisher responses carry the decision, so the console never reads the flag itself. */
  private withPolicy<T extends Pick<Announcement, 'severity'>>(a: T): T & { requiresApproval: boolean } {
    return { ...a, requiresApproval: this.needsApproval(a) };
  }

  /** Flatten the relations to display names; the row's own fields are unchanged. */
  private withNames({
    users,
    users_announcements_approved_by_idTousers: approver,
    users_announcements_approval_requested_by_idTousers: requester,
    ...a
  }: AnnouncementWithNames) {
    return this.withPolicy({
      ...a,
      publisherName: users.full_name,
      approverName: approver?.full_name ?? null,
      requestedByName: requester?.full_name ?? null,
    });
  }

  toPublic(a: Announcement) {
    return {
      id: a.id,
      title: a.title,
      body: a.body,
      summary: a.summary,
      action_required: a.action_required,
      category: a.category,
      severity: a.severity,
      scope: a.scope,
      language: a.language,
      target_barangays: a.target_barangays,
      status: a.status,
      effective_start_at: a.effective_start_at,
      effective_end_at: a.effective_end_at,
      issuing_office: a.issuing_office,
      source_reference: a.source_reference,
      contact_info: a.contact_info,
      published_at: a.published_at,
      cancelled_at: a.cancelled_at,
      correction_note: a.correction_note,
      updated_at: a.updated_at,
      created_at: a.created_at,
      // Clients build the image URL from the API base they already reach
      // (`/v1/announcements/:id/image`), never from the internal storage host.
      has_image: !!a.image_storage_key,
      image_alt_text: a.image_alt_text,
    };
  }

  // ─── Reads ──────────────────────────────────────────────────────────────────

  /**
   * `status` and `severity` accept one value or a comma-separated list
   * (Publication History asks for PUBLISHED,ARCHIVED,SUPERSEDED; the Advisories
   * filter for WARNING,CRITICAL). Unknown values are ignored.
   */
  async findAllForPublisher(filters: {
    status?: string;
    category?: string;
    severity?: string;
    /** Drafts a Supervisor sent back with a note (Phase 7). */
    returned?: boolean;
    page?: number;
    perPage?: number;
  }) {
    const page = filters.page ?? 1;
    const perPage = Math.min(filters.perPage ?? 20, 100);
    const skip = (page - 1) * perPage;

    const where: Prisma.AnnouncementWhereInput = {};
    const statuses = enumList(filters.status, announcement_status);
    if (statuses.length) where.status = { in: statuses };
    if (filters.returned) {
      where.status = 'DRAFT';
      where.review_note = { not: null };
    }
    const severities = enumList(filters.severity, announcement_severity);
    if (severities.length) where.severity = { in: severities };
    if (filters.category && Object.values(announcement_category).includes(filters.category as announcement_category)) {
      where.category = filters.category as announcement_category;
    }

    const [rows, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: perPage,
        include: PUBLISHER_NAMES,
      }),
      this.prisma.announcement.count({ where }),
    ]);

    const data = rows.map((r) => this.withNames(r));

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

  async findPublished(filters: { category?: string; barangay?: string }) {
    const where: Prisma.AnnouncementWhereInput = { status: announcement_status.PUBLISHED };
    if (filters.category && Object.values(announcement_category).includes(filters.category as announcement_category)) {
      where.category = filters.category as announcement_category;
    }
    if (filters.barangay) {
      // A barangay-targeted resident should still see municipality-wide notices.
      where.OR = [{ scope: 'MUNICIPALITY_WIDE' }, { target_barangays: { has: filters.barangay } }];
    }
    const rows = await this.prisma.announcement.findMany({ where, orderBy: { published_at: 'desc' } });
    return rows.map((r) => this.toPublic(r));
  }

  async findPublicArchive() {
    const rows = await this.prisma.announcement.findMany({
      where: {
        status: { in: ['ARCHIVED', 'CANCELLED', 'SUPERSEDED'] },
        published_at: { not: null },
      },
      orderBy: { published_at: 'desc' },
    });
    return rows.map((r) => this.toPublic(r));
  }

  /** Public detail — drafts and scheduled items are never exposed. */
  async findPublicById(id: string) {
    const a = await this.prisma.announcement.findUnique({ where: { id } });
    if (!a || !PUBLIC_STATUSES.includes(a.status)) {
      throw new NotFoundException('Announcement not found');
    }
    return this.toPublic(a);
  }

  async findById(id: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) throw new NotFoundException('Announcement not found');
    return announcement;
  }

  async findForPublisher(id: string) {
    return this.withPolicy(await this.findById(id));
  }

  /** Supervisor queue: submissions awaiting a decision, oldest first. */
  async findPendingApproval() {
    const rows = await this.prisma.announcement.findMany({
      where: { status: 'PENDING_APPROVAL' },
      orderBy: { approval_requested_at: 'asc' },
      take: 100,
      include: PUBLISHER_NAMES,
    });
    return rows.map((r) => this.withNames(r));
  }

  /**
   * Storage key for the image, enforcing the same visibility rule as the record.
   * `statuses` narrows it further (a Supervisor sees images of submissions only).
   */
  async getImageKey(
    id: string,
    opts: { publicOnly: boolean; statuses?: announcement_status[] },
  ): Promise<string> {
    const a = await this.prisma.announcement.findUnique({
      where: { id },
      select: { status: true, image_storage_key: true },
    });
    if (
      !a ||
      !a.image_storage_key ||
      (opts.publicOnly && !PUBLIC_STATUSES.includes(a.status)) ||
      (opts.statuses && !opts.statuses.includes(a.status))
    ) {
      throw new NotFoundException('Image not found');
    }
    return a.image_storage_key;
  }

  // ─── Writes ─────────────────────────────────────────────────────────────────

  private structuredData(dto: Partial<CreateAnnouncementDto>) {
    return {
      ...(dto.templateKey !== undefined && { template_key: dto.templateKey || null }),
      ...(dto.templateData !== undefined && { template_data: dto.templateData as Prisma.InputJsonValue }),
      ...(dto.language !== undefined && { language: dto.language }),
      ...(dto.summary !== undefined && { summary: dto.summary.trim() || null }),
      ...(dto.actionRequired !== undefined && { action_required: dto.actionRequired.trim() || null }),
      ...(dto.effectiveStartAt !== undefined && {
        effective_start_at: dto.effectiveStartAt ? new Date(dto.effectiveStartAt) : null,
      }),
      ...(dto.effectiveEndAt !== undefined && {
        effective_end_at: dto.effectiveEndAt ? new Date(dto.effectiveEndAt) : null,
      }),
      ...(dto.issuingOffice !== undefined && { issuing_office: dto.issuingOffice.trim() || null }),
      ...(dto.sourceReference !== undefined && { source_reference: dto.sourceReference.trim() || null }),
      ...(dto.contactInfo !== undefined && { contact_info: dto.contactInfo.trim() || null }),
      ...(dto.imageAltText !== undefined && { image_alt_text: dto.imageAltText.trim() || null }),
    };
  }

  private assertDates(dto: Partial<CreateAnnouncementDto>) {
    if (dto.effectiveStartAt && dto.effectiveEndAt && new Date(dto.effectiveEndAt) < new Date(dto.effectiveStartAt)) {
      throw new BadRequestException('Effective end must be after the effective start.');
    }
  }

  async create(dto: CreateAnnouncementDto, publisherId: string, orgId?: string) {
    this.assertDates(dto);
    const created = await this.prisma.announcement.create({
      data: {
        publisher_id: publisherId,
        organization_id: orgId ?? null,
        title: dto.title.trim(),
        body: dto.body,
        category: dto.category,
        severity: dto.severity,
        scope: dto.scope,
        target_barangays: dto.targetBarangays ?? [],
        publish_now: dto.publishNow ?? true,
        scheduled_at: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: 'DRAFT',
        ...this.structuredData(dto),
      },
    });
    await this.audit.log({
      action: 'CREATE',
      actorId: publisherId,
      entityType: 'Announcement',
      entityId: created.id,
      moduleId: 'MOD-53',
      newValues: { title: created.title, category: created.category, templateKey: created.template_key },
    });
    return this.withPolicy(created);
  }

  async update(id: string, dto: UpdateAnnouncementDto, userId: string) {
    const existing = await this.findById(id);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only draft announcements can be edited');
    }
    this.assertDates(dto);
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.severity !== undefined && { severity: dto.severity }),
        ...(dto.scope !== undefined && { scope: dto.scope }),
        ...(dto.targetBarangays !== undefined && { target_barangays: dto.targetBarangays }),
        ...this.structuredData(dto),
      },
    });
    await this.audit.log({
      action: 'UPDATE',
      actorId: userId,
      entityType: 'Announcement',
      entityId: id,
      moduleId: 'MOD-53',
    });
    return this.withPolicy(updated);
  }

  /** Server-side gate before anything is approved for release. */
  private assertPublishable(a: Announcement) {
    const missing: string[] = [];
    if (!a.title.trim()) missing.push('title');
    if (!a.body.trim()) missing.push('body');
    if (!a.issuing_office?.trim()) missing.push('issuing office');
    if ((SOURCE_REQUIRED_CATEGORIES.has(a.category) || a.severity !== 'INFORMATIONAL') && !a.source_reference?.trim()) {
      missing.push('source / reference');
    }
    if (a.scope === 'BARANGAY_SPECIFIC' && a.target_barangays.length === 0) {
      missing.push('affected barangays');
    }
    if (missing.length > 0) {
      throw new BadRequestException(`Cannot approve for release — missing: ${missing.join(', ')}.`);
    }
  }

  /**
   * Publish now. Approval is recorded here: the authorized publisher clicking
   * Publish is the approver. The status transition is a guarded updateMany so a
   * manual publish and the scheduler can never both fan out the same notice.
   */
  async publish(id: string, userId: string) {
    const existing = await this.findById(id);
    if (existing.status !== 'DRAFT' && existing.status !== 'SCHEDULED') {
      throw new BadRequestException(`A ${existing.status.toLowerCase()} announcement cannot be published.`);
    }
    // A Supervisor-approved scheduled advisory may go out early: its text is locked
    // while scheduled, so the approval still covers it, and the approver is kept.
    const supervisorApproved = existing.status === 'SCHEDULED' && !!existing.approval_requested_at;
    if (this.needsApproval(existing) && !supervisorApproved) {
      throw new BadRequestException(NEEDS_APPROVAL_MESSAGE);
    }
    this.assertPublishable(existing);
    const now = new Date();
    const { count } = await this.prisma.announcement.updateMany({
      where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } },
      data: {
        status: 'PUBLISHED',
        published_at: now,
        ...(!supervisorApproved && { approved_by_id: userId, approved_at: now }),
      },
    });
    if (count === 0) throw new BadRequestException('Announcement was already published.');
    return this.afterPublish(id, userId);
  }

  private async afterPublish(id: string, actorId: string) {
    const published = await this.findById(id);
    await this.audit.log({
      action: 'PUBLISH',
      actorId,
      entityType: 'Announcement',
      entityId: id,
      moduleId: 'MOD-53',
      newValues: {
        title: published.title,
        severity: published.severity,
        approvedBy: published.approved_by_id,
        approvedAt: published.approved_at?.toISOString(),
      },
    });

    // One-way public broadcast (MOD-53) to every connected client. Emitted after
    // the status commit; best-effort and NEVER a dispatch channel. A WS failure
    // must not affect the published record or the SMS/push fan-out below.
    try {
      this.realtime.announcementPublished({
        announcementId: published.id,
        title: published.title,
        category: String(published.category),
        severity: String(published.severity),
        scope: String(published.scope),
        publishedAt: (published.published_at ?? new Date()).toISOString(),
      });
    } catch (err) {
      this.logger.error(`Realtime emit failed for announcement.published: ${String(err)}`);
    }

    // The summary is written for short channels; fall back to the body.
    const shortText = (published.summary ?? published.body ?? '').replace(/\s+/g, ' ').trim();

    try {
      const subscribers = await this.prisma.sms_subscribers.findMany({
        where: { is_active: true },
        select: { phone_number: true },
      });

      const title = published.title.slice(0, 50);
      const smsText = `AGAP: ${title}. ${shortText.slice(0, 130)} Reply STOP to opt out.`.slice(0, 160);

      const BATCH_SIZE = 100;
      for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
        const batch = subscribers.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map((sub) =>
            this.smsQueue.add('announcement-sms', {
              phone: sub.phone_number,
              message: smsText,
            }),
          ),
        );
      }

      await this.prisma.announcement.update({
        where: { id: published.id },
        data: { sms_sent_count: subscribers.length },
      });
    } catch (err) {
      this.logger.error(`Announcement SMS broadcast failed: ${String(err)}`);
    }

    // Enqueue push broadcast — failure must not affect published status
    try {
      await this.pushQueue.add('announcement-push-broadcast', {
        announcementId: published.id,
        title: published.title.slice(0, 100),
        body: shortText.slice(0, 200),
        targetBarangays: published.target_barangays ?? [],
      });
    } catch (err) {
      this.logger.error(`Announcement push enqueue failed: ${String(err)}`);
    }

    return published;
  }

  /** Scheduling is the approval step for a later release. */
  async schedule(id: string, scheduledAt: string, userId: string) {
    const existing = await this.findById(id);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only draft announcements can be scheduled.');
    }
    if (this.needsApproval(existing)) throw new BadRequestException(NEEDS_APPROVAL_MESSAGE);
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      throw new BadRequestException('Scheduled time must be in the future.');
    }
    this.assertPublishable(existing);
    const now = new Date();
    const scheduled = await this.prisma.announcement.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduled_at: when, approved_by_id: userId, approved_at: now },
    });
    await this.audit.log({
      action: 'STATUS_CHANGE',
      actorId: userId,
      entityType: 'Announcement',
      entityId: id,
      moduleId: 'MOD-53',
      newValues: { status: 'SCHEDULED', scheduledAt: when.toISOString() },
    });
    return scheduled;
  }

  /**
   * Return a scheduled announcement to draft so it can be edited. Any approval,
   * including a Supervisor's, is void: an edited CRITICAL advisory is resubmitted.
   */
  async unschedule(id: string, userId: string) {
    const { count } = await this.prisma.announcement.updateMany({
      where: { id, status: 'SCHEDULED' },
      data: {
        status: 'DRAFT',
        scheduled_at: null,
        approved_by_id: null,
        approved_at: null,
        approval_requested_at: null,
        approval_requested_by_id: null,
      },
    });
    if (count === 0) throw new BadRequestException('Only scheduled announcements can be returned to draft.');
    await this.audit.log({
      action: 'STATUS_CHANGE',
      actorId: userId,
      entityType: 'Announcement',
      entityId: id,
      moduleId: 'MOD-53',
      newValues: { status: 'DRAFT' },
    });
    return this.findById(id);
  }

  // ─── Approval workflow (Phase 7) ────────────────────────────────────────────

  /** DRAFT → PENDING_APPROVAL. `scheduledAt` is the release time once approved. */
  async submitForApproval(id: string, userId: string, scheduledAt?: string) {
    const existing = await this.findById(id);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only draft announcements can be submitted for approval.');
    }
    if (!this.needsApproval(existing)) {
      throw new BadRequestException('This announcement does not need MDRRMO approval. Publish it directly.');
    }
    let when: Date | null = null;
    if (scheduledAt) {
      when = new Date(scheduledAt);
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        throw new BadRequestException('Scheduled time must be in the future.');
      }
    }
    this.assertPublishable(existing);
    const { count } = await this.prisma.announcement.updateMany({
      where: { id, status: 'DRAFT' },
      data: {
        status: 'PENDING_APPROVAL',
        // A time saved earlier in the draft is not a request; only this call's is.
        scheduled_at: when,
        approval_requested_at: new Date(),
        approval_requested_by_id: userId,
        review_note: null,
      },
    });
    if (count === 0) throw new BadRequestException('Announcement was already submitted.');
    await this.audit.log({
      action: 'STATUS_CHANGE',
      actorId: userId,
      entityType: 'Announcement',
      entityId: id,
      moduleId: 'MOD-53',
      oldValues: { status: 'DRAFT' },
      newValues: { status: 'PENDING_APPROVAL', scheduledAt: when?.toISOString() ?? null },
    });
    await this.notifySupervisors(existing);
    return this.findForPublisher(id);
  }

  /** PENDING_APPROVAL → DRAFT, by the officer, so the text can be edited again. */
  async withdrawSubmission(id: string, userId: string) {
    const { count } = await this.prisma.announcement.updateMany({
      where: { id, status: 'PENDING_APPROVAL' },
      data: { status: 'DRAFT', approval_requested_at: null, approval_requested_by_id: null },
    });
    if (count === 0) throw new BadRequestException('Only advisories awaiting approval can be withdrawn.');
    await this.audit.log({
      action: 'STATUS_CHANGE',
      actorId: userId,
      entityType: 'Announcement',
      entityId: id,
      moduleId: 'MOD-53',
      oldValues: { status: 'PENDING_APPROVAL' },
      newValues: { status: 'DRAFT', reason: 'withdrawn' },
    });
    return this.findForPublisher(id);
  }

  /**
   * PENDING_APPROVAL → PUBLISHED, or → SCHEDULED when the requested time is still
   * ahead. Guarded like publish(): two Supervisors approving at once fan out once.
   */
  async approve(id: string, supervisorId: string) {
    const existing = await this.findById(id);
    if (existing.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Only advisories awaiting approval can be approved.');
    }
    if (existing.approval_requested_by_id === supervisorId) {
      throw new ForbiddenException('You submitted this advisory. Another Supervisor must approve it.');
    }
    this.assertPublishable(existing);
    const now = new Date();
    const later = !!existing.scheduled_at && existing.scheduled_at.getTime() > now.getTime();
    const { count } = await this.prisma.announcement.updateMany({
      where: { id, status: 'PENDING_APPROVAL' },
      data: later
        ? { status: 'SCHEDULED', approved_by_id: supervisorId, approved_at: now }
        : { status: 'PUBLISHED', published_at: now, approved_by_id: supervisorId, approved_at: now },
    });
    if (count === 0) throw new BadRequestException('This advisory was already approved or returned.');

    if (!later) return this.afterPublish(id, supervisorId);
    await this.audit.log({
      action: 'STATUS_CHANGE',
      actorId: supervisorId,
      entityType: 'Announcement',
      entityId: id,
      moduleId: 'MOD-53',
      oldValues: { status: 'PENDING_APPROVAL' },
      newValues: { status: 'SCHEDULED', scheduledAt: existing.scheduled_at!.toISOString(), approvedBy: supervisorId },
    });
    return this.findById(id);
  }

  /** PENDING_APPROVAL → DRAFT with the Supervisor's reason, shown to the officer. */
  async returnToDraft(id: string, note: string, supervisorId: string) {
    const trimmed = note.trim();
    if (trimmed.length < 10) {
      throw new BadRequestException('Say what must change (at least 10 characters).');
    }
    const { count } = await this.prisma.announcement.updateMany({
      where: { id, status: 'PENDING_APPROVAL' },
      data: { status: 'DRAFT', review_note: trimmed },
    });
    if (count === 0) throw new BadRequestException('This advisory was already approved or returned.');
    await this.audit.log({
      action: 'STATUS_CHANGE',
      actorId: supervisorId,
      entityType: 'Announcement',
      entityId: id,
      moduleId: 'MOD-53',
      oldValues: { status: 'PENDING_APPROVAL' },
      newValues: { status: 'DRAFT', reviewNote: trimmed },
    });
    return this.findById(id);
  }

  /**
   * Best-effort push to Supervisors who can sign in (not `status = ACTIVE`: staff
   * stay PENDING_VERIFICATION). No Dispatcher fallback — they cannot approve. The
   * console's Approvals page is the reliable signal; a failure here never blocks.
   */
  private async notifySupervisors(a: Announcement) {
    try {
      const supervisors = await this.prisma.user.findMany({
        where: { role: 'SUPERVISOR', status: { notIn: [...BLOCKED_ACCOUNT_STATUSES] as any[] } },
        select: { id: true },
      });
      await Promise.allSettled(
        supervisors.map((s) =>
          this.notificationQueue.add('announcement-approval', {
            userId: s.id,
            channel: 'PUSH',
            title: 'Advisory awaiting approval',
            body: `CRITICAL: ${a.title.slice(0, 100)}`,
            data: { announcementId: a.id, type: 'ANNOUNCEMENT_APPROVAL' },
          } satisfies NotificationJobData),
        ),
      );
    } catch (err) {
      this.logger.error(`Approval notification failed for announcement ${a.id}: ${String(err)}`);
    }
  }

  /**
   * Releases scheduled announcements whose time has come. Previously nothing
   * moved SCHEDULED → PUBLISHED, so scheduled notices never went out.
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'announcements-scheduled-release' })
  async releaseDueScheduled(): Promise<void> {
    let due: { id: string; approved_by_id: string | null; publisher_id: string }[];
    try {
      due = await this.prisma.announcement.findMany({
        where: { status: 'SCHEDULED', scheduled_at: { lte: new Date() } },
        select: { id: true, approved_by_id: true, publisher_id: true },
        take: 50,
      });
    } catch (err) {
      this.logger.error(`Scheduled announcement scan failed: ${String(err)}`);
      return;
    }

    for (const item of due) {
      try {
        const { count } = await this.prisma.announcement.updateMany({
          where: { id: item.id, status: 'SCHEDULED' },
          data: { status: 'PUBLISHED', published_at: new Date() },
        });
        if (count === 0) continue; // published manually in the meantime
        await this.afterPublish(item.id, item.approved_by_id ?? item.publisher_id);
        this.logger.log(`Released scheduled announcement ${item.id}`);
      } catch (err) {
        this.logger.error(`Failed to release scheduled announcement ${item.id}: ${String(err)}`);
      }
    }
  }

  /**
   * Officially withdraw a published (or scheduled) notice. The record stays
   * visible by link with the reason, so residents who saw it learn it changed.
   */
  async cancel(id: string, correctionNote: string, userId: string) {
    const existing = await this.findById(id);
    if (existing.status !== 'PUBLISHED' && existing.status !== 'SCHEDULED') {
      throw new BadRequestException('Only published or scheduled announcements can be cancelled.');
    }
    const cancelled = await this.prisma.announcement.update({
      where: { id },
      data: { status: 'CANCELLED', cancelled_at: new Date(), correction_note: correctionNote.trim() },
    });
    await this.audit.log({
      action: 'STATUS_CHANGE',
      actorId: userId,
      entityType: 'Announcement',
      entityId: id,
      moduleId: 'MOD-53',
      oldValues: { status: existing.status },
      newValues: { status: 'CANCELLED', correctionNote: cancelled.correction_note },
    });
    return cancelled;
  }

  async archive(id: string, userId: string) {
    const existing = await this.findById(id);
    if (!['PUBLISHED', 'CANCELLED', 'SUPERSEDED'].includes(existing.status)) {
      throw new BadRequestException('Only released announcements can be archived.');
    }
    const archived = await this.prisma.announcement.update({
      where: { id },
      data: { status: 'ARCHIVED', archived_at: new Date() },
    });
    await this.audit.log({
      action: 'STATUS_CHANGE',
      actorId: userId,
      entityType: 'Announcement',
      entityId: id,
      moduleId: 'MOD-53',
      newValues: { status: 'ARCHIVED' },
    });
    return archived;
  }

  async supersede(id: string, newAnnouncementId: string, _userId: string) {
    await this.findById(id);
    return this.prisma.announcement.update({
      where: { id },
      data: { status: 'SUPERSEDED', superseded_by_id: newAnnouncementId },
    });
  }

  async getDeliveryStats(id: string) {
    await this.findById(id);
    const grouped = await this.prisma.announcement_deliveries.groupBy({
      by: ['status'],
      where: { announcement_id: id },
      orderBy: { status: 'asc' },
      _count: { _all: true },
    });
    return grouped.map((g) => ({ status: g.status, count: g._count._all }));
  }

  async subscribe(dto: SmsSubscribeDto) {
    return this.prisma.sms_subscribers.upsert({
      where: { phone_number: dto.phoneNumber },
      create: {
        phone_number: dto.phoneNumber,
        barangay_preference: dto.barangayPreference ?? null,
        is_active: true,
      },
      update: {
        barangay_preference: dto.barangayPreference ?? null,
        is_active: true,
        opted_out_at: null,
      },
    });
  }

  async unsubscribe(phoneNumber: string) {
    const phone = normalizePhPhone(phoneNumber);
    const numbers = phone.kind === 'MOBILE' && phone.e164 ? phoneVariants(phone.e164) : [phoneNumber.trim()];
    await this.prisma.sms_subscribers.updateMany({
      where: { phone_number: { in: numbers }, is_active: true },
      data: { is_active: false, opted_out_at: new Date(), opt_out_source: 'APP' },
    });
    return { message: 'Unsubscribed' };
  }

  /**
   * MOD-53 / RA 10173: a subscriber replied STOP to the Textbee phone. Deactivates every
   * active row for the number (stored as typed, so all three forms), audits it and sends one
   * confirmation. Returns false when the sender is not an active subscriber.
   */
  async optOutBySms(fromE164: string): Promise<boolean> {
    const rows = await this.prisma.sms_subscribers.findMany({
      where: { phone_number: { in: phoneVariants(fromE164) }, is_active: true },
      select: { id: true },
    });
    if (rows.length === 0) return false;

    await this.prisma.sms_subscribers.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { is_active: false, opted_out_at: new Date(), opt_out_source: 'SMS_STOP' },
    });

    for (const row of rows) {
      void this.audit.log({
        action: AuditAction.UNSUBSCRIBE,
        entityType: 'sms_subscriber',
        entityId: row.id,
        moduleId: 'MOD-53',
        newValues: { is_active: false, opt_out_source: 'SMS_STOP' },
      });
    }

    // Best-effort: the opt-out is already stored.
    try {
      await this.smsQueue.add(
        'sms-opt-out-confirm',
        { phone: fromE164, message: SMS_OPT_OUT_CONFIRMATION } satisfies SmsJobData,
        { removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (err) {
      this.logger.error(`Queueing the SMS opt-out confirmation failed: ${String(err)}`);
    }
    return true;
  }
}

/** Sent once after a STOP reply. Single SMS segment (< 160 characters), no web address. */
export const SMS_OPT_OUT_CONFIRMATION =
  'AGAP: You are unsubscribed from Bocaue MDRRMO announcements. For emergencies call 911.';
