import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, surge_rules } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';
import { findEscalationRecipients } from '../jobs/escalation-recipients';
import {
  BOCAUE_RIVER_CRITICAL_M,
  NON_COUNTING_STATUSES,
  RECOMMENDATION_DEDUP_MS,
  RIVER_LEVEL_RULE_KEY,
  RIVER_READING_MAX_AGE_MS,
  SURGE_RECOMMENDED,
  surgeRecommendationText,
  type SurgeTrip,
} from './surge-recommendation';

/**
 * MOD-52 (AUTOMATION_NEEDS_PLAN Phase 2, C2): every 5 minutes, checks recent incidents
 * against the surge rules and tells every Supervisor when one trips. It only recommends:
 * activating surge mode stays a Supervisor's decision. A failed run logs and waits for
 * the next tick; it never touches an incident.
 */
@Injectable()
export class SurgeDetectorService {
  private readonly logger = new Logger(SurgeDetectorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Returns how many notices were created (for tests and logs). */
  @Cron('*/5 * * * *')
  async evaluate(now = new Date()): Promise<number> {
    try {
      const active = await this.prisma.surge_incidents.findFirst({ where: { status: 'ACTIVE' }, select: { id: true } });
      if (active) return 0;

      const trips: SurgeTrip[] = [];
      const rules = await this.prisma.surge_rules.findMany({ where: { is_active: true }, orderBy: { rule_key: 'asc' } });
      for (const rule of rules) {
        const count = await this.prisma.incident.count({ where: this.ruleWhere(rule, now) });
        if (count >= rule.min_incidents) {
          trips.push({
            ruleKey: rule.rule_key,
            count,
            windowMinutes: rule.window_minutes,
            category: rule.category,
            barangays: rule.barangays,
          });
        }
      }

      const river = await this.riverTrip(now);
      if (river) trips.push(river);

      let sent = 0;
      for (const trip of trips) sent += await this.recommend(trip, now);
      return sent;
    } catch (err) {
      this.logger.error(`Surge detection run failed: ${String(err)}`);
      return 0;
    }
  }

  /**
   * Incidents created in the rule's window that could be real emergencies. A barangay
   * matches either the geocoded location text or the polygon-matched barangay notice
   * (geo_regions names), so a geocoder spelling never hides a cluster.
   */
  private ruleWhere(rule: surge_rules, now: Date): Prisma.IncidentWhereInput {
    return {
      created_at: { gte: new Date(now.getTime() - rule.window_minutes * 60_000) },
      status: { notIn: [...NON_COUNTING_STATUSES] },
      ...(rule.category && { category: rule.category }),
      ...(rule.barangays.length > 0 && {
        OR: [
          { incident_locations: { is: { barangay: { in: rule.barangays } } } },
          { barangay_notices: { some: { barangay: { name: { in: rule.barangays } } } } },
        ],
      }),
    };
  }

  /** The entered river reading, when it is critical and recent enough to act on. */
  private async riverTrip(now: Date): Promise<SurgeTrip | null> {
    const s = await this.prisma.surge_settings.findUnique({ where: { singleton: true } });
    if (!s?.river_level_m || !s.river_level_at) return null;
    const meters = Number(s.river_level_m);
    if (meters < BOCAUE_RIVER_CRITICAL_M) return null;
    if (now.getTime() - s.river_level_at.getTime() > RIVER_READING_MAX_AGE_MS) return null;
    return { ruleKey: RIVER_LEVEL_RULE_KEY, count: 0, windowMinutes: 0, category: 'FLOOD', barangays: [], riverLevelM: meters };
  }

  /** One notice per Supervisor and one ops event, unless this rule was recommended in the last hour. */
  private async recommend(trip: SurgeTrip, now: Date): Promise<number> {
    try {
      const recent = await this.prisma.notification.findFirst({
        where: {
          event_type: SURGE_RECOMMENDED,
          created_at: { gte: new Date(now.getTime() - RECOMMENDATION_DEDUP_MS) },
          data_payload: { path: ['ruleKey'], equals: trip.ruleKey },
        },
        select: { id: true },
      });
      if (recent) return 0;

      const { title, body } = surgeRecommendationText(trip);
      const dataPayload = {
        ruleKey: trip.ruleKey,
        count: trip.count,
        windowMinutes: trip.windowMinutes,
        category: trip.category,
        barangays: trip.barangays,
        ...(trip.riverLevelM !== undefined && { riverLevelM: trip.riverLevelM }),
      };
      const recipients = await findEscalationRecipients(this.prisma, ['SUPERVISOR']);
      const results = await Promise.allSettled(
        recipients.map((r) =>
          this.notifications.create({ userId: r.id, eventType: SURGE_RECOMMENDED, title, body, channel: 'IN_APP', dataPayload }),
        ),
      );
      const sent = results.filter((r) => r.status === 'fulfilled').length;
      if (sent < recipients.length) this.logger.warn(`Surge recommendation ${trip.ruleKey} reached ${sent}/${recipients.length}`);

      this.realtime.surgeRecommended({
        ruleKey: trip.ruleKey,
        count: trip.count,
        windowMinutes: trip.windowMinutes,
        category: trip.category,
        barangays: trip.barangays,
        title,
        body,
        recommendedAt: now.toISOString(),
      });
      this.logger.log(`Surge recommended (${trip.ruleKey}): ${body}`);
      return sent;
    } catch (err) {
      this.logger.error(`Surge recommendation ${trip.ruleKey} failed: ${String(err)}`);
      return 0;
    }
  }
}
