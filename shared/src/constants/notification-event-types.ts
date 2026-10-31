export const NOTIFICATION_EVENT_TYPES = {
  CREW_HELP_REQUESTED: 'CREW_HELP_REQUESTED',
  /** A fire report found something dangerous (unit field flow plan, Phase 3). A notice, never an action. */
  FIRE_REPORT_ALERT: 'FIRE_REPORT_ALERT',
  /** A rescue crew finished while its last trip said people are still waiting (Phase 4). */
  RESCUE_PEOPLE_WAITING: 'RESCUE_PEOPLE_WAITING',
  /** A rescue trip handed people to an ambulance, but none is on the incident (Phase 4). */
  RESCUE_AMBULANCE_SUGGESTED: 'RESCUE_AMBULANCE_SUGGESTED',
} as const;
