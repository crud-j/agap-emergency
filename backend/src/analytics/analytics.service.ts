import { Injectable } from '@nestjs/common';
import { Prisma, incident_priority, incident_status, resource_status } from '@prisma/client';
import { ACTIVE_INCIDENT_STATUSES } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Bocaue is UTC+8 all year (no daylight saving), so a fixed offset is exact. */
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const TREND_DAYS = 7;

// Trend, performance and "reported" counts skip DRAFT (never sent) and DUPLICATE
// (merged into another incident): neither is a reported incident.
const ACTIVE = [...ACTIVE_INCIDENT_STATUSES] as incident_status[];
const NOT_REPORTED: incident_status[] = ['DRAFT', 'DUPLICATE'];
const PRIORITIES: incident_priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const DEPLOYED_UNITS: resource_status[] = ['DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'RETURNING', 'RESERVED'];
const UNAVAILABLE_UNITS: resource_status[] = ['OUT_OF_SERVICE', 'OFFLINE'];

/** Start of the Asia/Manila calendar day containing `at`, independent of the server's time zone. */
export function manilaMidnight(at: Date): Date {
  const local = at.getTime() + MANILA_OFFSET_MS;
  return new Date(local - (local % DAY_MS) - MANILA_OFFSET_MS);
}

/** `YYYY-MM-DD` of `at` in Asia/Manila. */
export function manilaDateKey(at: Date): string {
  return new Date(at.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

export interface UnitCounts {
  available: number;
  deployed: number;
  unavailable: number;
}

/** Reported / critical / resolved counts for one rolling 24-hour window. */
export interface DayWindow {
  reported: number;
  critical: number;
  resolved: number;
}

/**
 * GET /analytics/dispatch-summary: the Dispatcher dashboard's cards, counted in the
 * database with the same active-status list as the Incident Queue (counts only).
 */
export interface DispatchSummary {
  generatedAt: string;
  active: number;
  unreviewed: number;
  awaitingDispatch: number;
  critical: number;
  enRoute: number;
  onScene: number;
  last24h: DayWindow;
  previous24h: DayWindow;
  units: UnitCounts;
}

export interface IncidentPerformance {
  acknowledgeSec: number | null;
  dispatchSec: number | null;
  arrivalSec: number | null;
  resolvedShare: number | null;
}

/**
 * GET /analytics/municipal-overview. Counts only: the LGU account reads this, and it
 * must never carry names, phone numbers, addresses, coordinates or medical data.
 */
export interface MunicipalOverview {
  generatedAt: string;
  active: number;
  activeByCategory: { category: string; count: number }[];
  activeByPriority: { priority: incident_priority; count: number }[];
  activeByBarangay: { barangay: string; count: number }[];
  today: { total: number; critical: number; resolved: number };
  yesterday: { total: number; critical: number };
  units: UnitCounts;
  trend7d: { date: string; total: number; critical: number }[];
  performance7d: IncidentPerformance;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMunicipalOverview(now: Date = new Date()): Promise<MunicipalOverview> {
    const todayStart = manilaMidnight(now);
    const trendStart = new Date(todayStart.getTime() - (TREND_DAYS - 1) * DAY_MS);
    const activeWhere: Prisma.IncidentWhereInput = { status: { in: ACTIVE } };

    const [byCategory, byPriority, byBarangay, resolvedToday, units, trendRows, performance7d] = await Promise.all([
      this.prisma.incident.groupBy({
        by: ['category'],
        where: activeWhere,
        orderBy: { category: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.incident.groupBy({
        by: ['priority'],
        where: activeWhere,
        orderBy: { priority: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.incident_locations.groupBy({
        by: ['barangay'],
        where: { incidents: activeWhere, barangay: { not: null } },
        orderBy: { barangay: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.incident.count({ where: { resolved_at: { gte: todayStart } } }),
      this.getUnitCounts(),
      this.prisma.$queryRaw<{ day: string; total: number; critical: number }[]>`
        SELECT to_char((submitted_at AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS total,
               (COUNT(*) FILTER (WHERE priority = 'CRITICAL'))::int AS critical
          FROM incidents
         WHERE submitted_at >= ${trendStart}
           AND status::text NOT IN ('DRAFT', 'DUPLICATE')
         GROUP BY 1`,
      this.getPerformanceFromIncidents(new Date(now.getTime() - TREND_DAYS * DAY_MS)),
    ]);

    const active = byCategory.reduce((sum, row) => sum + row._count._all, 0);

    // Incidents with no location row or no tagged barangay are "Unassigned".
    const activeByBarangay = byBarangay
      .map((row) => ({ barangay: row.barangay as string, count: row._count._all }))
      .sort((a, b) => b.count - a.count || a.barangay.localeCompare(b.barangay));
    const unassigned = active - activeByBarangay.reduce((sum, row) => sum + row.count, 0);
    if (unassigned > 0) activeByBarangay.push({ barangay: 'Unassigned', count: unassigned });

    const byDay = new Map(trendRows.map((row) => [row.day, row]));
    const trend7d = Array.from({ length: TREND_DAYS }, (_, i) => {
      const date = manilaDateKey(new Date(trendStart.getTime() + i * DAY_MS));
      const row = byDay.get(date);
      return { date, total: Number(row?.total ?? 0), critical: Number(row?.critical ?? 0) };
    });
    const todayRow = trend7d[TREND_DAYS - 1]!;
    const yesterdayRow = trend7d[TREND_DAYS - 2]!;

    return {
      generatedAt: now.toISOString(),
      active,
      activeByCategory: byCategory
        .map((row) => ({ category: row.category as string, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
      activeByPriority: PRIORITIES.map((priority) => ({
        priority,
        count: byPriority.find((row) => row.priority === priority)?._count._all ?? 0,
      })),
      activeByBarangay,
      today: { total: todayRow.total, critical: todayRow.critical, resolved: resolvedToday },
      yesterday: { total: yesterdayRow.total, critical: yesterdayRow.critical },
      units,
      trend7d,
      performance7d,
    };
  }

  async getDispatchSummary(now: Date = new Date()): Promise<DispatchSummary> {
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const twoDaysAgo = new Date(now.getTime() - 2 * DAY_MS);
    const window = (from: Date, to: Date) => {
      const reportedWhere: Prisma.IncidentWhereInput = {
        submitted_at: { gte: from, lt: to },
        status: { notIn: NOT_REPORTED },
      };
      return Promise.all([
        this.prisma.incident.count({ where: reportedWhere }),
        this.prisma.incident.count({ where: { ...reportedWhere, priority: 'CRITICAL' } }),
        this.prisma.incident.count({ where: { resolved_at: { gte: from, lt: to } } }),
      ]).then(([reported, critical, resolved]) => ({ reported, critical, resolved }));
    };

    const [byStatus, critical, last24h, previous24h, units] = await Promise.all([
      this.prisma.incident.groupBy({
        by: ['status'],
        where: { status: { in: ACTIVE } },
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.incident.count({ where: { status: { in: ACTIVE }, priority: 'CRITICAL' } }),
      window(dayAgo, now),
      window(twoDaysAgo, dayAgo),
      this.getUnitCounts(),
    ]);

    const inStatus = (statuses: incident_status[]) =>
      byStatus.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + r._count._all, 0);

    return {
      generatedAt: now.toISOString(),
      active: inStatus(ACTIVE),
      unreviewed: inStatus(['SUBMITTED', 'RECEIVED']),
      awaitingDispatch: inStatus(['ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING']),
      critical,
      enRoute: inStatus(['EN_ROUTE']),
      onScene: inStatus(['ON_SCENE']),
      last24h,
      previous24h,
      units,
    };
  }

  /** Active units by readiness (shared with the Supervisor oversight summary). */
  async getUnitCounts(): Promise<UnitCounts> {
    const rows = await this.prisma.resources.groupBy({
      by: ['status'],
      where: { is_active: true },
      orderBy: { status: 'asc' },
      _count: { _all: true },
    });
    const count = (statuses: resource_status[]) =>
      rows.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
    return {
      available: count(['AVAILABLE']),
      deployed: count(DEPLOYED_UNITS),
      unavailable: count(UNAVAILABLE_UNITS),
    };
  }

  /**
   * Average response intervals for incidents submitted since `since`, computed from
   * the timestamps on `incidents` (incident_metrics is never filled). Each average
   * skips rows missing either timestamp; with no rows it is null, never 0.
   */
  async getPerformanceFromIncidents(since: Date): Promise<IncidentPerformance> {
    const [row] = await this.prisma.$queryRaw<
      { ack: unknown; dispatch: unknown; arrival: unknown; total: number; resolved: number }[]
    >`
      SELECT AVG(EXTRACT(EPOCH FROM (acknowledged_at - submitted_at))) AS ack,
             AVG(EXTRACT(EPOCH FROM (dispatched_at - submitted_at)))   AS dispatch,
             AVG(EXTRACT(EPOCH FROM (on_scene_at - dispatched_at)))    AS arrival,
             COUNT(*)::int AS total,
             (COUNT(*) FILTER (WHERE status::text IN ('RESOLVED', 'CLOSED')))::int AS resolved
        FROM incidents
       WHERE submitted_at >= ${since}
         AND status::text NOT IN ('DRAFT', 'DUPLICATE')`;

    const seconds = (value: unknown) => (value === null || value === undefined ? null : Math.round(Number(value)));
    const total = Number(row?.total ?? 0);
    return {
      acknowledgeSec: seconds(row?.ack),
      dispatchSec: seconds(row?.dispatch),
      arrivalSec: seconds(row?.arrival),
      resolvedShare: total > 0 ? Number(row?.resolved ?? 0) / total : null,
    };
  }

  async getResponseTimes(_filters: Record<string, unknown>) {
    const grouped = await this.prisma.incident_metrics.groupBy({
      by: ['category'],
      orderBy: { category: 'asc' },
      _avg: {
        acknowledge_duration_secs: true,
        dispatch_duration_secs: true,
        response_duration_secs: true,
        total_duration_secs: true,
      },
      _count: { _all: true },
    });
    return grouped;
  }

  async getVolume(_filters: Record<string, unknown>) {
    const byCategory = await this.prisma.incident.groupBy({
      by: ['category'],
      orderBy: { category: 'asc' },
      _count: { _all: true },
    });
    const byStatus = await this.prisma.incident.groupBy({
      by: ['status'],
      orderBy: { status: 'asc' },
      _count: { _all: true },
    });
    return { byCategory, byStatus };
  }

  async getSlaCompliance(_filters: Record<string, unknown>) {
    const [total, ackMet, dispatchMet] = await this.prisma.$transaction([
      this.prisma.incident_metrics.count(),
      this.prisma.incident_metrics.count({ where: { acknowledge_sla_met: true } }),
      this.prisma.incident_metrics.count({ where: { dispatch_sla_met: true } }),
    ]);
    return {
      total,
      acknowledgeSlaMet: ackMet,
      dispatchSlaMet: dispatchMet,
      acknowledgeCompliancePct: total ? Math.round((ackMet / total) * 100) : 0,
      dispatchCompliancePct: total ? Math.round((dispatchMet / total) * 100) : 0,
    };
  }

  async getFalseAlertRate(_filters: Record<string, unknown>) {
    const [totalIncidents, falseAlerts] = await this.prisma.$transaction([
      this.prisma.incident.count(),
      this.prisma.false_alerts.count(),
    ]);
    return {
      totalIncidents,
      falseAlerts,
      ratePct: totalIncidents ? Math.round((falseAlerts / totalIncidents) * 100) : 0,
    };
  }

  async getResourceUtilization(_filters: Record<string, unknown>) {
    return this.prisma.dispatches.groupBy({
      by: ['resource_id'],
      orderBy: { resource_id: 'asc' },
      _count: { _all: true },
    });
  }

  async getIncidentTimeline(incidentId: string) {
    return this.prisma.incidentEvent.findMany({
      where: { incident_id: incidentId },
      orderBy: { occurred_at: 'asc' },
    });
  }

  async getDailySummary(date?: string) {
    const day = date ? new Date(date) : new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const where = { submitted_at: { gte: start, lt: end } };
    const [total, byCategory, byStatus] = await this.prisma.$transaction([
      this.prisma.incident.count({ where }),
      this.prisma.incident.groupBy({
        by: ['category'],
        where,
        orderBy: { category: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.incident.groupBy({
        by: ['status'],
        where,
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
    ]);
    return { date: start.toISOString().slice(0, 10), total, byCategory, byStatus };
  }
}
