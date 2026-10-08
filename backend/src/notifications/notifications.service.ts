import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Persist an in-app notification, then push it to the recipient's private
   * `user:{id}` room so their bell/badge updates live (MOD-16/MOD-42). The emit
   * is best-effort: a WS failure must never lose the persisted notification, and
   * the per-user room guarantees no other user can receive it.
   */
  async create(input: {
    userId: string;
    eventType: string;
    body: string;
    title?: string;
    channel?: 'IN_APP' | 'PUSH' | 'SMS' | 'EMAIL';
    incidentId?: string;
    dataPayload?: Record<string, unknown>;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        recipient_user_id: input.userId,
        incident_id: input.incidentId ?? null,
        channel: (input.channel ?? 'IN_APP') as any,
        event_type: input.eventType,
        title: input.title ?? null,
        body: input.body,
        data_payload: (input.dataPayload ?? undefined) as any,
      },
    });

    try {
      this.realtime.notificationCreated({
        notificationId: notification.id,
        userId: input.userId,
        type: input.eventType,
        title: input.title ?? input.eventType,
        ...(input.body ? { body: input.body } : {}),
        ...(input.incidentId ? { incidentId: input.incidentId } : {}),
        createdAt: notification.created_at.toISOString(),
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for notification.created: ${String(err)}`);
    }

    return notification;
  }

  async findAll(userId: string, page = 1, perPage = 20) {
    const take = Math.min(perPage, 100);
    const skip = (page - 1) * take;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { recipient_user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      this.prisma.notification.count({ where: { recipient_user_id: userId } }),
    ]);

    return { data, meta: { total, page, perPage: take } };
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.recipient_user_id !== userId) {
      throw new ForbiddenException('Not your notification');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { status: 'DELIVERED', delivered_at: new Date() },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { recipient_user_id: userId, status: 'PENDING' },
      data: { status: 'DELIVERED', delivered_at: new Date() },
    });
    return { updated: result.count };
  }

  async registerToken(userId: string, token: string) {
    // Store device push token in system_configurations keyed per user.
    const key = `fcm_token:${userId}`;
    await this.prisma.system_configurations.upsert({
      where: { config_key: key },
      create: {
        config_key: key,
        config_value: { fcmToken: token } as any,
        updated_by_id: userId,
      },
      update: { config_value: { fcmToken: token } as any, updated_by_id: userId },
    });
    return { message: 'Token registered' };
  }

  async removeToken(userId: string) {
    const key = `fcm_token:${userId}`;
    await this.prisma.system_configurations.deleteMany({ where: { config_key: key } });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { recipient_user_id: userId, status: 'PENDING' },
    });
    return { unread: count };
  }
}
