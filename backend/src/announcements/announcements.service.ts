import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { SmsSubscribeDto } from './dto/sms-subscribe.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PUSH_NOTIFICATIONS) private readonly pushQueue: Queue,
  ) {}

  async findPublished(filters: { category?: string; barangay?: string }) {
    const where: Prisma.AnnouncementWhereInput = { status: 'PUBLISHED' };
    if (filters.category) where.category = filters.category as any;
    if (filters.barangay) where.target_barangays = { has: filters.barangay };
    return this.prisma.announcement.findMany({
      where,
      orderBy: { published_at: 'desc' },
    });
  }

  async findById(id: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) throw new NotFoundException('Announcement not found');
    return announcement;
  }

  async create(dto: CreateAnnouncementDto, publisherId: string, orgId?: string) {
    return this.prisma.announcement.create({
      data: {
        publisher_id: publisherId,
        organization_id: orgId ?? null,
        title: dto.title,
        body: dto.body,
        category: dto.category as any,
        severity: dto.severity as any,
        scope: dto.scope as any,
        target_barangays: dto.targetBarangays ?? [],
        publish_now: dto.publishNow ?? true,
        scheduled_at: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        status: 'DRAFT',
      },
    });
  }

  async update(id: string, dto: Partial<CreateAnnouncementDto>) {
    const existing = await this.findById(id);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only draft announcements can be edited');
    }
    return this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.category !== undefined && { category: dto.category as any }),
        ...(dto.severity !== undefined && { severity: dto.severity as any }),
        ...(dto.scope !== undefined && { scope: dto.scope as any }),
        ...(dto.targetBarangays !== undefined && {
          target_barangays: dto.targetBarangays,
        }),
      },
    });
  }

  async publish(id: string, userId: string) {
    await this.findById(id);
    const published = await this.prisma.announcement.update({
      where: { id },
      data: { status: 'PUBLISHED', published_at: new Date() },
    });
    await this.audit.log({
      action: 'PUBLISH',
      actorId: userId,
      entityType: 'Announcement',
      entityId: id,
      moduleId: 'MOD-53',
    });

    try {
      const subscribers = await this.prisma.sms_subscribers.findMany({
        where: { is_active: true },
        select: { phone_number: true },
      });

      const title = published.title.slice(0, 50);
      const body = (published.body ?? '').slice(0, 130);
      const smsText = `AGAP: ${title}. ${body}. Reply STOP to opt out.`.slice(0, 160);

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
        body: (published.body ?? '').slice(0, 200),
        targetBarangays: (published.target_barangays as string[]) ?? [],
      });
    } catch (err) {
      this.logger.error(`Announcement push enqueue failed: ${String(err)}`);
    }

    return published;
  }

  async schedule(id: string, scheduledAt: string, _userId: string) {
    await this.findById(id);
    return this.prisma.announcement.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduled_at: new Date(scheduledAt) },
    });
  }

  async archive(id: string, _userId: string) {
    await this.findById(id);
    return this.prisma.announcement.update({
      where: { id },
      data: { status: 'ARCHIVED', archived_at: new Date() },
    });
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
