import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditAction } from '@agap/shared';
import { Prisma } from '@prisma/client';

export interface AuditLogEntry {
  action: AuditAction | string;
  actorId?: string;
  actorRole?: string;
  entityId?: string | undefined;
  entityType?: string | undefined;
  moduleId?: string;
  incidentId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/** Read endpoints show who acted; only the display name, never contact details. */
const ACTOR_NAME = { users: { select: { full_name: true } } } satisfies Prisma.AuditLogInclude;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fail-closed audit write for use inside an interactive Prisma transaction.
   * Any write failure propagates, rolling back the caller's transaction.
   * Use for security-critical state changes (e.g. duty availability).
   */
  async logInTransaction(
    tx: Prisma.TransactionClient,
    entry: AuditLogEntry,
  ): Promise<void> {
    await tx.auditLog.create({
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
        user_agent: entry.userAgent,
      } as any,
    });
  }

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
          user_agent: entry.userAgent,
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
    entityId?: string;
    from?: string;
    to?: string;
  }) {
    const page = filters.page ?? 1;
    const perPage = Math.min(filters.perPage ?? 50, 200);
    const skip = (page - 1) * perPage;

    const where: Prisma.AuditLogWhereInput = {};
    // `action` is one value or a comma-separated list (Security Events asks for several).
    const actions = (filters.action ?? '').split(',').map((a) => a.trim()).filter(Boolean);
    if (actions.length === 1) where.action = actions[0] as any;
    else if (actions.length > 1) where.action = { in: actions as any };
    if (filters.actorId) where.actor_id = filters.actorId;
    // Writers differ in case ('Incident' / 'incident'); one filter matches both.
    if (filters.entityType) where.entity_type = { equals: filters.entityType, mode: 'insensitive' };
    if (filters.entityId) where.entity_id = filters.entityId;
    if (filters.from || filters.to) {
      where.occurred_at = {
        ...(filters.from && { gte: new Date(filters.from) }),
        ...(filters.to && { lte: new Date(filters.to) }),
      };
    }

    // Sequential (not `$transaction([...])`): the batch form in Prisma 7 drops
    // `skip: 0` and then rejects the query. A read list needs no transaction.
    const data = await this.prisma.auditLog.findMany({
      where,
      orderBy: { occurred_at: 'desc' },
      skip,
      take: perPage,
      include: ACTOR_NAME,
    });
    const total = await this.prisma.auditLog.count({ where });

    return {
      data: await this.withEntityUsers(data),
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

  /**
   * Account events (failed logins, lockouts) have no actor: the account is the entity.
   * Attach that user's display name and role so the row is readable. No contact details.
   */
  private async withEntityUsers<T extends { entity_type: string | null; entity_id: string | null }>(rows: T[]) {
    const ids = [...new Set(rows.filter((r) => r.entity_type === 'user' && r.entity_id).map((r) => r.entity_id!))];
    if (ids.length === 0) return rows.map((r) => ({ ...r, entity_user: null }));
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, full_name: true, role: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      ...r,
      entity_user: r.entity_type === 'user' && r.entity_id ? (byId.get(r.entity_id) ?? null) : null,
    }));
  }

  async findById(id: string) {
    const log = await this.prisma.auditLog.findUnique({ where: { id }, include: ACTOR_NAME });
    if (!log) throw new NotFoundException('Audit log not found');
    return log;
  }

  async findByIncident(incidentId: string) {
    return this.prisma.auditLog.findMany({
      where: { incident_id: incidentId },
      orderBy: { occurred_at: 'desc' },
      include: ACTOR_NAME,
    });
  }
}
