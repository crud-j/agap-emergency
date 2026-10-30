import { RECEIVING_STATUS_STALE_HOURS } from '@agap/shared';

/**
 * MOD-38 (AUTOMATION_NEEDS_PLAN Phase 4, C6): a transparent score for each receiving
 * hospital, with the reasons shown to the dispatcher. It ranks only; the dispatcher still
 * picks the hospital (CLAUDE.md rule 8). Facility data only, never patient data.
 */

/** Categories that need an emergency room whatever the priority. */
const ER_CATEGORIES = new Set(['MEDICAL', 'ROAD_ACCIDENT', 'FIRE', 'INDUSTRIAL']);

/** Straight-line distances beyond this all score the same (the far end of Bocaue's area). */
const MAX_SCORED_KM = 30;

/** An unknown distance scores as the middle of the scale, neither near nor far. */
const UNKNOWN_DISTANCE_KM = MAX_SCORED_KM / 2;

const HOUR_MS = 60 * 60 * 1000;

export interface ReferralNeed {
  er: boolean;
  icu: boolean;
}

/** What the incident needs from a hospital: from its priority and category only. */
export function needFor(incident: { category: string; priority: string }): ReferralNeed {
  return {
    er: incident.priority === 'CRITICAL' || incident.priority === 'HIGH' || ER_CATEGORIES.has(incident.category),
    icu: incident.priority === 'CRITICAL',
  };
}

export interface RankableFacility {
  /** facility_receiving_status: OPEN | AT_CAPACITY | CLOSED | EMERGENCY_ONLY | UNKNOWN */
  receiving_status: string;
  receiving_status_updated_at: Date | null;
  has_emergency_room: boolean | null;
  has_icu: boolean | null;
  capacity_available: number | null;
}

export interface FacilityScore {
  score: number;
  reasons: string[];
  distanceLabel: string;
  /** The status the score used: a stale one counts as UNKNOWN (the stored value is kept). */
  effectiveStatus: string;
  /** Whole hours since the status was last reported; null when it never was. */
  statusAgeHours: number | null;
}

/**
 * Roadmap §4.6, plus C8's freshness rule: a status reported more than
 * RECEIVING_STATUS_STALE_HOURS ago is scored as UNKNOWN, with its age as the reason.
 * `km` is null when the distance can't be measured.
 */
export function scoreFacility(f: RankableFacility, need: ReferralNeed, km: number | null, now: Date): FacilityScore {
  const reasons: string[] = [];
  const ageMs = f.receiving_status_updated_at ? now.getTime() - f.receiving_status_updated_at.getTime() : null;
  const statusAgeHours = ageMs === null ? null : Math.max(0, Math.floor(ageMs / HOUR_MS));
  const stale = f.receiving_status !== 'UNKNOWN' && (ageMs === null || ageMs > RECEIVING_STATUS_STALE_HOURS * HOUR_MS);
  const status = stale ? 'UNKNOWN' : f.receiving_status;

  let score = 100 - Math.min(km ?? UNKNOWN_DISTANCE_KM, MAX_SCORED_KM) * 2;
  if (status === 'CLOSED') { score -= 80; reasons.push('Closed to receiving'); }
  if (status === 'AT_CAPACITY') { score -= 50; reasons.push('At capacity'); }
  if (status === 'UNKNOWN') {
    score -= 10;
    reasons.push(
      !stale ? 'Receiving status unknown'
        : statusAgeHours === null ? 'Receiving status never reported'
          : `Status last updated ${statusAgeHours} h ago`,
    );
  }
  // EMERGENCY_ONLY is no penalty for an emergency referral.
  if (status === 'EMERGENCY_ONLY' && !need.er) { score -= 20; reasons.push('Emergency patients only'); }
  if (need.er && !f.has_emergency_room) { score -= 40; reasons.push('No ER'); }
  if (need.icu && f.has_icu) { score += 15; reasons.push('Has ICU'); }
  if (f.capacity_available === 0) { score -= 30; reasons.push('No beds available'); }

  return {
    score: Math.round(score),
    reasons,
    distanceLabel: km === null ? 'Distance unknown' : `${km.toFixed(1)} km (straight line)`,
    effectiveStatus: status,
    statusAgeHours,
  };
}
