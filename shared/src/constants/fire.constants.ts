/**
 * A fire crew's size-up report (unit field flow plan, Phase 3, decision D1).
 * D1 is provisional until BFP Bocaue confirms its alarm terms; the database keeps
 * these as text, so a change here needs no enum migration.
 */

/** BFP alarm levels, lowest to highest: the order is what "at or above" compares. */
export const FIRE_ALARM_LEVELS = [
  'FIRST_ALARM',
  'SECOND_ALARM',
  'THIRD_ALARM',
  'FOURTH_ALARM',
  'FIFTH_ALARM',
  'TASK_FORCE_ALPHA',
  'TASK_FORCE_BRAVO',
  'TASK_FORCE_CHARLIE',
  'TASK_FORCE_DELTA',
  'TASK_FORCE_ECHO',
  'GENERAL_ALARM',
] as const;

export type FireAlarmLevel = (typeof FIRE_ALARM_LEVELS)[number];

export const FIRE_ALARM_LEVEL_LABELS: Record<FireAlarmLevel, string> = {
  FIRST_ALARM: '1st alarm',
  SECOND_ALARM: '2nd alarm',
  THIRD_ALARM: '3rd alarm',
  FOURTH_ALARM: '4th alarm',
  FIFTH_ALARM: '5th alarm',
  TASK_FORCE_ALPHA: 'Task Force Alpha',
  TASK_FORCE_BRAVO: 'Task Force Bravo',
  TASK_FORCE_CHARLIE: 'Task Force Charlie',
  TASK_FORCE_DELTA: 'Task Force Delta',
  TASK_FORCE_ECHO: 'Task Force Echo',
  GENERAL_ALARM: 'General alarm',
};

/** At or above this level, dispatchers and supervisors get a notice (D1). */
export const FIRE_ALERT_ALARM_LEVEL: FireAlarmLevel = 'THIRD_ALARM';

/** True when `level` is at or above `threshold`; an unknown level is never "above". */
export function isAlarmLevelAtLeast(
  level: string | null | undefined,
  threshold: FireAlarmLevel = FIRE_ALERT_ALARM_LEVEL,
): boolean {
  const index = FIRE_ALARM_LEVELS.indexOf(level as FireAlarmLevel);
  return index >= 0 && index >= FIRE_ALARM_LEVELS.indexOf(threshold);
}

export const FIRE_STATUSES = ['ACTIVE', 'UNDER_CONTROL', 'FIRE_OUT'] as const;

export type FireStatus = (typeof FIRE_STATUSES)[number];

export const FIRE_STATUS_LABELS: Record<FireStatus, string> = {
  ACTIVE: 'Active',
  UNDER_CONTROL: 'Under control',
  FIRE_OUT: 'Fire out',
};

export const FIRE_OCCUPANCY_TYPES = ['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL', 'GRASS_OR_VEHICLE', 'OTHER'] as const;

export type FireOccupancyType = (typeof FIRE_OCCUPANCY_TYPES)[number];

export const FIRE_OCCUPANCY_TYPE_LABELS: Record<FireOccupancyType, string> = {
  RESIDENTIAL: 'Residential',
  COMMERCIAL: 'Commercial',
  INDUSTRIAL: 'Industrial',
  GRASS_OR_VEHICLE: 'Grass or vehicle',
  OTHER: 'Other',
};

export const FIRE_HAZARDS = ['FIREWORKS_EXPLOSIVES', 'LPG', 'CHEMICALS', 'LIVE_WIRES', 'STRUCTURAL_COLLAPSE'] as const;

export type FireHazard = (typeof FIRE_HAZARDS)[number];

export const FIRE_HAZARD_LABELS: Record<FireHazard, string> = {
  FIREWORKS_EXPLOSIVES: 'Fireworks / explosives',
  LPG: 'LPG',
  CHEMICALS: 'Chemicals',
  LIVE_WIRES: 'Live wires',
  STRUCTURAL_COLLAPSE: 'Structural collapse',
};

/** Why a fire report notified dispatchers; each is deduplicated per incident on its own. */
export const FIRE_REPORT_ALERT_REASONS = [
  'FIREWORKS_EXPLOSIVES',
  'TRAPPED_PERSONS',
  'HIGH_ALARM',
  'CASUALTIES_NO_AMBULANCE',
] as const;

export type FireReportAlertReason = (typeof FIRE_REPORT_ALERT_REASONS)[number];
