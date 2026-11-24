import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { SMS_LOG_KINDS, SMS_LOG_STATUSES } from '../notifications/sms/sms-log';

export const SMS_LOG_MAX_PER_PAGE = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SmsLogQuery {
  page?: number;
  perPage?: number;
  status?: string;
  kind?: string;
  from?: string;
  to?: string;
}

export interface SmsLogRow {
  id: string;
  kind: string;
  status: string;
  recipientLast4: string | null;
  gatewayStatus: number | null;
  error: string | null;
  attempt: number;
  chars: number;
  durationMs: number | null;
  hasIncident: boolean;
  createdAt: string;
}

export interface SmsWindowCounts {
  accepted: number;
  failed: number;
  notConfigured: number;
  total: number;
}

export interface SmsSummary {
  last24h: SmsWindowCounts;
  last7d: SmsWindowCounts;
  /** Last 7 days by kind, all statuses. */
  byKind7d: Array<{ kind: string; total: number; failed: number }>;
  /** One entry per day for the last 7 days (oldest first, server's UTC days). */
  daily: Array<{ day: string; accepted: number; failed: number }>;
  inbound24h: number;
  lastAcceptedAt: string | null;
  lastAttemptAt: string | null;
}

/** Outbound SMS activity for the System Administrator (MOD-17 tracking, MOD-49). */
@Injectable()
export class SmsActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: SmsLogQuery) {
    const page = Math.max(1, Math.floor(query.page ?? 1) || 1);
    const perPage = Math.min(SMS_LOG_MAX_PER_PAGE, Math.max(1, Math.floor(query.perPage ?? 25) || 25));
    const where = this.where(query);

    const [rows, total] = await Promise.all([
      this.prisma.sms_log.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.sms_log.count({ where }),
    ]);

    return {
      data: rows.map(
        (r): SmsLogRow => ({
          id: r.id,
          kind: r.kind,
          status: r.status,
          recipientLast4: r.recipient_last4,
          gatewayStatus: r.gateway_status,
          error: r.error,
          attempt: r.attempt,
          chars: r.chars,
          durationMs: r.duration_ms,
          // The incident's internal ID stays server-side (public API rule).
          hasIncident: r.incident_id !== null,
          createdAt: r.created_at.toISOString(),
        }),
      ),
      meta: { total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) },
    };
  }

  async summary(now = new Date()): Promise<SmsSummary> {
    const since24h = new Date(now.getTime() - DAY_MS);
    const since7d = new Date(now.getTime() - 7 * DAY_MS);
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * DAY_MS);

    const [g24, g7, kinds, daily, inbound24h, lastAccepted, lastAttempt] = await Promise.all([
      this.prisma.sms_log.groupBy({ by: ['status'], where: { created_at: { gte: since24h } }, _count: { _all: true } }),
      this.prisma.sms_log.groupBy({ by: ['status'], where: { created_at: { gte: since7d } }, _count: { _all: true } }),
      this.prisma.sms_log.groupBy({ by: ['kind', 'status'], where: { created_at: { gte: since7d } }, _count: { _all: true } }),
      this.prisma.$queryRaw<Array<{ day: Date; status: string; n: bigint }>>`
        SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') AS day, status, count(*) AS n
        FROM sms_log
        WHERE created_at >= ${dayStart}
        GROUP BY 1, 2`,
      this.prisma.barangay_sms_inbound.count({ where: { received_at: { gte: since24h } } }),
      this.prisma.sms_log.findFirst({ where: { status: 'ACCEPTED' }, orderBy: { created_at: 'desc' }, select: { created_at: true } }),
      this.prisma.sms_log.findFirst({ orderBy: { created_at: 'desc' }, select: { created_at: true } }),
    ]);

    const byKind = new Map<string, { kind: string; total: number; failed: number }>();
    for (const k of kinds) {
      const entry = byKind.get(k.kind) ?? { kind: k.kind, total: 0, failed: 0 };
      entry.total += k._count._all;
      if (k.status !== 'ACCEPTED') entry.failed += k._count._all;
      byKind.set(k.kind, entry);
    }

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(dayStart.getTime() + i * DAY_MS);
      return { day: d.toISOString().slice(0, 10), accepted: 0, failed: 0 };
    });
    for (const row of daily) {
      const key = new Date(row.day).toISOString().slice(0, 10);
      const slot = days.find((d) => d.day === key);
      if (!slot) continue;
      if (row.status === 'ACCEPTED') slot.accepted += Number(row.n);
      else slot.failed += Number(row.n);
    }

    return {
      last24h: windowCounts(g24),
      last7d: windowCounts(g7),
      byKind7d: [...byKind.values()].sort((a, b) => b.total - a.total),
      daily: days,
      inbound24h,
      lastAcceptedAt: lastAccepted?.created_at.toISOString() ?? null,
      lastAttemptAt: lastAttempt?.created_at.toISOString() ?? null,
    };
  }

  private where(query: SmsLogQuery): Prisma.sms_logWhereInput {
    const where: Prisma.sms_logWhereInput = {};
    if (query.status) {
      if (!(SMS_LOG_STATUSES as readonly string[]).includes(query.status)) throw new BadRequestException('Unknown status');
      where.status = query.status;
    }
    if (query.kind) {
      if (!(SMS_LOG_KINDS as readonly string[]).includes(query.kind)) throw new BadRequestException('Unknown kind');
      where.kind = query.kind;
    }
    const created: Prisma.DateTimeFilter = {};
    if (query.from) created.gte = parseDate(query.from, 'from');
    if (query.to) created.lte = endOfDay(parseDate(query.to, 'to'), query.to);
    if (created.gte || created.lte) where.created_at = created;
    return where;
  }
}

function windowCounts(groups: Array<{ status: string; _count: { _all: number } }>): SmsWindowCounts {
  const count = (status: string) => groups.find((g) => g.status === status)?._count._all ?? 0;
  const accepted = count('ACCEPTED');
  const failed = count('FAILED');
  const notConfigured = count('NOT_CONFIGURED');
  return { accepted, failed, notConfigured, total: accepted + failed + notConfigured };
}

function parseDate(value: string, name: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid ${name} date`);
  return d;
}

/** A bare YYYY-MM-DD `to` includes that whole day. */
function endOfDay(d: Date, raw: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(d.getTime() + DAY_MS - 1) : d;
}
