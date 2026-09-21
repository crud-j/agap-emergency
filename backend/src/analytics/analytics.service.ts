import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

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
