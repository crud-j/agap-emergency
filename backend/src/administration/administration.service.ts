import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdministrationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllUsers(filters: {
    page?: number;
    perPage?: number;
    role?: string;
    status?: string;
    search?: string;
    organizationId?: string;
  }) {
    const page = filters.page ?? 1;
    const perPage = Math.min(filters.perPage ?? 20, 100);
    const skip = (page - 1) * perPage;

    const where: Prisma.UserWhereInput = {};
    if (filters.role) where.role = filters.role as any;
    if (filters.status) where.status = filters.status as any;
    if (filters.organizationId) {
      where.organization_memberships = { some: { organization_id: filters.organizationId, is_active: true } };
    }
    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { full_name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone_number: { contains: term, mode: 'insensitive' } },
      ];
    }

    // Sequential (not `$transaction([...])`): the batch form in Prisma 7 drops
    // `skip: 0` and then rejects the query. A read list needs no transaction.
    const data = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        full_name: true,
        email: true,
        phone_number: true,
        role: true,
        status: true,
        created_at: true,
        last_login_at: true,
      },
      orderBy: { created_at: 'desc' },
      skip,
      take: perPage,
    });
    const total = await this.prisma.user.count({ where });

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

  async changeRole(userId: string, newRole: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { role: newRole as any },
      }),
      this.prisma.account_lifecycle_events.create({
        data: {
          user_id: userId,
          event_type: 'ROLE_CHANGE',
          performed_by_id: actorId,
          reason: `Role changed from ${user.role} to ${newRole}`,
        },
      }),
    ]);
    return updated;
  }

  async activate(userId: string, actorId: string) {
    await this.ensureUser(userId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' },
      });
      await tx.account_lifecycle_events.create({
        data: { user_id: userId, event_type: 'ACTIVATED', performed_by_id: actorId },
      });
      return updated;
    });
  }

  async deactivate(userId: string, actorId: string) {
    await this.ensureUser(userId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { status: 'DEACTIVATED' },
      });
      await tx.account_lifecycle_events.create({
        data: { user_id: userId, event_type: 'DEACTIVATED', performed_by_id: actorId },
      });
      return updated;
    });
  }

  async deleteUser(userId: string, _actorId: string) {
    await this.ensureUser(userId);
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async getConfig() {
    return this.prisma.system_configurations.findMany({
      where: { is_sensitive: false },
    });
  }

  async upsertConfig(key: string, value: unknown, userId: string) {
    return this.prisma.system_configurations.upsert({
      where: { config_key: key },
      create: {
        config_key: key,
        config_value: value as any,
        updated_by_id: userId,
      },
      update: { config_value: value as any, updated_by_id: userId },
    });
  }

  async getHealth() {
    let database = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }
    return { database, redis: 'unknown', timestamp: new Date() };
  }

  private async ensureUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
