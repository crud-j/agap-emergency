import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditAction } from '@agap/shared';
import { Prisma } from '@prisma/client';

export interface AuditLogEntry {
  action: AuditAction | string;
  actorId?: string;
  actorRole?: string;
  entityId?: string;
  entityType?: string;
  moduleId?: string;
  incidentId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * INSERT-ONLY. Audit logs are immutable — there is no update or delete path.
   * A write failure must never block the originating operation.
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action as any,
          actor_id: entry.actorId,
          actor_role: entry.actorRole as any,
          entity_id: entry.entityId,
          entity_type: entry.entityType,
          module_id: entry.moduleId,
          incident_id: entry.incidentId,
          old_values: entry.oldValues as any,
          new_values: entry.newValues as any,
          ip_address: entry.ipAddress,
        } as any,
      });
    } catch (err) {
      this.logger.error(`Audit log write failed: ${err}. Operation was not blocked.`);
    }
  }

  async findAll(filters: {
    page?: number;
    perPage?: number;
    action?: string;
    actorId?: string;
    entityType?: string;
  }) {
    const page = filters.page ?? 1;
    const perPage = Math.min(filters.perPage ?? 50, 200);
    const skip = (page - 1) * perPage;

    const where: Prisma.AuditLogWhereInput = {};
    if (filters.action) where.action = filters.action as any;
    if (filters.actorId) where.actor_id = filters.actorId;
    if (filters.entityType) where.entity_type = filters.entityType;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { occurred_at: 'desc' },
        skip,
        take: perPage,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, meta: { total, page, perPage } };
  }

  async findById(id: string) {
    const log = await this.prisma.auditLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException('Audit log not found');
    return log;
  }

  async findByIncident(incidentId: string) {
    return this.prisma.auditLog.findMany({
      where: { incident_id: incidentId },
      orderBy: { occurred_at: 'desc' },
    });
  }
}
