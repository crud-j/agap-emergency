/**
 * MOD-52 (AUTOMATION_NEEDS_PLAN Phase 2, C2): what a tripped surge rule says. Pure, so the
 * wording is unit-tested. It carries counts and barangay names only: no incident, reporter
 * or patient data.
 */

/** In-app notice event type for a surge recommendation (NotificationBell routes it to the surge page). */
export const SURGE_RECOMMENDED = 'SURGE_RECOMMENDED';

/** The rule key used when the entered Bocaue River reading is at or above critical. */
export const RIVER_LEVEL_RULE_KEY = 'RIVER_LEVEL';

/** Bocaue River critical level: mandatory evacuation (CLAUDE.md, Bocaue context). */
export const BOCAUE_RIVER_CRITICAL_M = 11.5;

/** A river reading older than this no longer trips the RIVER_LEVEL rule. */
export const RIVER_READING_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** The same rule is not recommended twice within this window. */
export const RECOMMENDATION_DEDUP_MS = 60 * 60 * 1000;

/**
 * These say nothing about a real emergency, so they never count toward a rule. DRAFT was
 * never submitted (analytics' NOT_REPORTED leaves it out too).
 */
export const NON_COUNTING_STATUSES = ['DRAFT', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE'] as const;

export interface SurgeTrip {
  ruleKey: string;
  count: number;
  windowMinutes: number;
  category: string | null;
  barangays: string[];
  /** RIVER_LEVEL only. */
  riverLevelM?: number;
}

export function surgeRecommendationText(trip: SurgeTrip): { title: string; body: string } {
  const title = 'Surge mode recommended';
  if (trip.ruleKey === RIVER_LEVEL_RULE_KEY && trip.riverLevelM !== undefined) {
    return {
      title,
      body: `Bocaue River at ${trip.riverLevelM.toFixed(2)} m (critical ${BOCAUE_RIVER_CRITICAL_M.toFixed(2)} m). Review surge mode.`,
    };
  }
  const what = trip.category ? `${trip.category.replace(/_/g, ' ')} incidents` : 'incidents';
  const where = trip.barangays.length ? ` in ${trip.barangays.join(', ')}` : '';
  return { title, body: `${trip.count} ${what}${where} in ${trip.windowMinutes} min. Review surge mode.` };
}
