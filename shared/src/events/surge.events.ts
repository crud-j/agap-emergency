export const SURGE_EVENTS = {
  /** MOD-52: recent incidents tripped a surge rule. A Supervisor decides; nothing is activated. */
  RECOMMENDED: 'surge.recommended',
  /** MOD-52: a START triage tag was filed or changed during the active surge. */
  TRIAGE_TAG_UPDATED: 'surge.triage_tag_updated',
} as const;

export type SurgeEventName = (typeof SURGE_EVENTS)[keyof typeof SURGE_EVENTS];

/** Ops-only. Counts and barangay names only: no incident, reporter or patient data. */
export interface SurgeRecommendedPayload {
  ruleKey: string;
  count: number;
  windowMinutes: number;
  category: string | null;
  barangays: string[];
  title: string;
  body: string;
  recommendedAt: string;
}

/** Ops-only. IDs only: the board refetches the tags. */
export interface SurgeTriageTagUpdatedPayload {
  surgeId: string;
  tagId: string;
}
