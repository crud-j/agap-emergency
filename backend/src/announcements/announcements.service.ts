import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { SmsSubscribeDto } from './dto/sms-subscribe.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
