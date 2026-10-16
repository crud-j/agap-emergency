import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { SmsSubscribeDto } from './dto/sms-subscribe.dto';
import { Announcement, Prisma, announcement_category, announcement_status } from '@prisma/client';

/** Statuses a resident may open by direct link (feed shows PUBLISHED only). */
const PUBLIC_STATUSES: announcement_status[] = ['PUBLISHED', 'CANCELLED', 'ARCHIVED', 'SUPERSEDED'];

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

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PUSH_NOTIFICATIONS) private readonly pushQueue: Queue,
  ) {}

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

  async findAllForPublisher(filters: {
    status?: string;
    category?: string;
    page?: number;
    perPage?: number;
  }) {
    const page = filters.page ?? 1;
    const perPage = Math.min(filters.perPage ?? 20, 100);
    const skip = (page - 1) * perPage;

    const where: Prisma.AnnouncementWhereInput = {};
    if (filters.status && Object.values(announcement_status).includes(filters.status as announcement_status)) {
      where.status = filters.status as announcement_status;
    }
    if (filters.category && Object.values(announcement_category).includes(filters.category as announcement_category)) {
      where.category = filters.category as announcement_category;
    }

    const [data, total] = await Promise.all([
      this.prisma.announcement.findMany({ where, orderBy: { created_at: 'desc' }, skip, take: perPage }),
      this.prisma.announcement.count({ where }),
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

  /** Storage key for the image, enforcing the same visibility rule as the record. */
  async getImageKey(id: string, opts: { publicOnly: boolean }): Promise<string> {
    const a = await this.prisma.announcement.findUnique({
      where: { id },
      select: { status: true, image_storage_key: true },
    });
    if (!a || !a.image_storage_key || (opts.publicOnly && !PUBLIC_STATUSES.includes(a.status))) {
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
    return created;
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
    return updated;
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
    this.assertPublishable(existing);
    const now = new Date();
    const { count } = await this.prisma.announcement.updateMany({
      where: { id, status: { in: ['DRAFT', 'SCHEDULED'] } },
      data: {
        status: 'PUBLISHED',
        published_at: now,
        approved_by_id: userId,
        approved_at: now,
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

  /** Return a scheduled announcement to draft so it can be edited. */
  async unschedule(id: string, userId: string) {
    const { count } = await this.prisma.announcement.updateMany({
      where: { id, status: 'SCHEDULED' },
      data: { status: 'DRAFT', scheduled_at: null, approved_by_id: null, approved_at: null },
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
    await this.prisma.sms_subscribers.updateMany({
      where: { phone_number: phoneNumber },
      data: { is_active: false, opted_out_at: new Date() },
    });
    return { message: 'Unsubscribed' };
  }
}
