import { Injectable } from '@nestjs/common';
import { AnalyticsService, type AnalyticsDateRange } from '../analytics.service';
import { buildFacts, previousRange, type AnalyticsFacts, type PeriodTotals } from './analytics-facts';

/**
 * Collects the totals for a period and the period before it (same length) from the same
 * queries the Analytics page uses, and turns them into facts for the AI summary (MOD-50).
 */
@Injectable()
export class AnalyticsFactsService {
  constructor(private readonly analytics: AnalyticsService) {}

  async collect(range: AnalyticsDateRange, now: Date = new Date()): Promise<AnalyticsFacts> {
    const [current, previous] = await Promise.all([
      this.totals(range, now),
      this.totals(previousRange(range), now),
    ]);
    return buildFacts(current, previous);
  }

  private async totals(range: AnalyticsDateRange, now: Date): Promise<PeriodTotals> {
    const [volume, sla, falseRate, byPriority, byBarangay, intervals] = await Promise.all([
      this.analytics.getVolume(range),
      this.analytics.getSlaCompliance(range, now),
      this.analytics.getFalseAlertRate(range),
      this.analytics.getPriorityCounts(range),
      this.analytics.getBarangayCounts(range),
      this.analytics.getResponseIntervals(range),
    ]);
    return {
      range,
      incidents: falseRate.totalIncidents,
      byCategory: volume.byCategory.map((g) => ({ category: String(g.category), count: g._count._all })),
      byPriority,
      byBarangay,
      targets: {
        acknowledge: {
          met: sla.acknowledgeSlaMet,
          counted: sla.acknowledgeMeasured,
          overdue: sla.acknowledgeOverdue,
          pct: sla.acknowledgeCompliancePct,
        },
        dispatch: {
          met: sla.dispatchSlaMet,
          counted: sla.dispatchMeasured,
          overdue: sla.dispatchOverdue,
          pct: sla.dispatchCompliancePct,
        },
        onScene: {
          met: sla.onSceneSlaMet,
          counted: sla.onSceneMeasured,
          overdue: sla.onSceneOverdue,
          pct: sla.onSceneCompliancePct,
        },
      },
      intervals,
      falseAlerts: { count: falseRate.falseAlerts, ratePct: falseRate.ratePct },
    };
  }
}
