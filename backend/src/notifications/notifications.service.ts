import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

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
