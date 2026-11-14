import { RISK_LEVELS, type RiskLevel } from './dto/risk-area.dto';

/**
 * MOD-51 risk-area rules (2026-11-15). Pure, so the list, the add form and the tests use
 * the same numbers. AGAP only suggests: a Supervisor applies every change.
 */

/** Incidents counted toward an area or a suggestion: the last 90 days. */
export const AREA_STATS_WINDOW_DAYS = 90;
/** An area with no incident for this long (and at least this old) is suggested for review. */
export const QUIET_AFTER_DAYS = 365;
/** A pinned area's radius, in metres. */
export const MIN_RADIUS_M = 50;
export const MAX_RADIUS_M = 2000;

const DAY_MS = 24 * 60 * 60 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
/** The nightly hotspot check, Manila time. */
export const NIGHTLY_CHECK_HOUR = 2;
export const NIGHTLY_CHECK_MINUTE = 30;

/** Suggested level for how many incidents of the area's type happened in it in 90 days. */
export function levelFromCount(incidents90d: number): RiskLevel {
  if (incidents90d >= 10) return 'CRITICAL';
  if (incidents90d >= 6) return 'HIGH';
  if (incidents90d >= 3) return 'MODERATE';
  return 'LOW';
}

const rank = (level: string): number => (RISK_LEVELS as readonly string[]).indexOf(level);

export interface AreaStats {
  incidents_90d: number;
  incidents_prev_90d: number;
  last_incident_at: Date | null;
}

export type ReviewHint =
  | { kind: 'RAISE'; suggestedLevel: RiskLevel; incidents: number; windowDays: number }
  | { kind: 'QUIET'; quietDays: number };

/**
 * What a Supervisor may want to change, or null:
 * - RAISE: the incidents in 90 days call for a higher level than the area has;
 * - QUIET: an active area older than a year with no incident for a year ("deactivate?").
 * Never a lower level: an area is often kept high for reasons the counts don't show.
 */
export function reviewHint(
  area: { risk_level: string; is_active: boolean; created_at: Date },
  stats: AreaStats,
  now: Date = new Date(),
): ReviewHint | null {
  if (!area.is_active) return null;
  const suggested = levelFromCount(stats.incidents_90d);
  const current = rank(area.risk_level);
  if (current >= 0 && rank(suggested) > current) {
    return { kind: 'RAISE', suggestedLevel: suggested, incidents: stats.incidents_90d, windowDays: AREA_STATS_WINDOW_DAYS };
  }
  const ageDays = (now.getTime() - area.created_at.getTime()) / DAY_MS;
  const quietSince = stats.last_incident_at ?? area.created_at;
  const quietDays = Math.floor((now.getTime() - quietSince.getTime()) / DAY_MS);
  if (ageDays >= QUIET_AFTER_DAYS && quietDays >= QUIET_AFTER_DAYS) return { kind: 'QUIET', quietDays };
  return null;
}

/** "ROAD_ACCIDENT" → "road accident". */
export function typeWords(riskType: string): string {
  return riskType.toLowerCase().replace(/_/g, ' ');
}

/** "Lolomboy flood area"; "Bocaue fire area" when the pin is outside every barangay. */
export function suggestAreaName(barangay: string | null, riskType: string): string {
  return `${barangay ?? 'Bocaue'} ${typeWords(riskType)} area`;
}

/** The next nightly hotspot check (02:30 Asia/Manila) after `now`. */
export function nextNightlyRun(now: Date = new Date()): Date {
  const manila = new Date(now.getTime() + MANILA_OFFSET_MS);
  const runLocal = Date.UTC(
    manila.getUTCFullYear(),
    manila.getUTCMonth(),
    manila.getUTCDate(),
    NIGHTLY_CHECK_HOUR,
    NIGHTLY_CHECK_MINUTE,
  );
  let run = runLocal - MANILA_OFFSET_MS;
  if (run <= now.getTime()) run += DAY_MS;
  return new Date(run);
}
