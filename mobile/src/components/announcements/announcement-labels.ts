import type { Announcement } from '@/src/services/api/announcements.api';

/** Citizen-facing names for the backend announcement categories. */
export const CATEGORY_LABELS: Record<string, string> = {
  FLOOD_ALERT: 'Flood',
  WEATHER_ADVISORY: 'Weather',
  EVACUATION_ORDER: 'Evacuation',
  CLASS_SUSPENSION: 'Class suspension',
  ROAD_CLOSURE: 'Traffic',
  PUBLIC_ADVISORY: 'Public advisory',
  MUNICIPAL_SERVICE: 'Municipal service',
  FIRE_ADVISORY: 'Fire',
  INDUSTRIAL_HAZARD: 'Industrial hazard',
  POST_DISASTER_UPDATE: 'Post-disaster',
  RESCUE_UPDATE: 'Rescue',
  GENERAL_INFORMATION: 'General',
};

export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c.replace(/_/g, ' ');

/**
 * Why a past notice is no longer in force, in words a resident understands.
 * Publishers archive, cancel or supersede; residents only need to know the
 * notice is withdrawn, replaced, or simply over. Archiving keeps `cancelled_at`,
 * so a notice cancelled first and archived later still reads as withdrawn.
 */
export type PastNoticeState = 'withdrawn' | 'replaced' | 'ended';

export function pastNoticeState(a: Pick<Announcement, 'status' | 'cancelled_at'>): PastNoticeState | null {
  if (a.status === 'CANCELLED' || (a.status === 'ARCHIVED' && a.cancelled_at)) return 'withdrawn';
  if (a.status === 'SUPERSEDED') return 'replaced';
  if (a.status === 'ARCHIVED') return 'ended';
  return null;
}

export const PAST_NOTICE_LABELS: Record<PastNoticeState, string> = {
  withdrawn: 'Withdrawn',
  replaced: 'Replaced',
  ended: 'No longer active',
};
