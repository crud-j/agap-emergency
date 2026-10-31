/**
 * A rescue crew's trip log (unit field flow plan, Phase 4, decision D2). The database
 * keeps these codes as text, so a change after MDRRMO Bocaue confirms the terms needs
 * no enum migration.
 */

/** Depth where the crew is standing, by body reference. Not the Bocaue River gauge. */
export const WATER_LEVELS = ['ANKLE', 'KNEE', 'WAIST', 'CHEST', 'ABOVE_HEAD'] as const;

export type WaterLevel = (typeof WATER_LEVELS)[number];

export const WATER_LEVEL_LABELS: Record<WaterLevel, string> = {
  ANKLE: 'Ankle',
  KNEE: 'Knee',
  WAIST: 'Waist',
  CHEST: 'Chest',
  ABOVE_HEAD: 'Above head',
};

export const RESCUE_ACCESS = ['BOAT_ONLY', 'HIGH_VEHICLE', 'PASSABLE'] as const;

export type RescueAccess = (typeof RESCUE_ACCESS)[number];

export const RESCUE_ACCESS_LABELS: Record<RescueAccess, string> = {
  BOAT_ONLY: 'Boat only',
  HIGH_VEHICLE: 'High vehicle',
  PASSABLE: 'Passable',
};

/** Where this trip's people went. EVACUATION_CENTER names an active evacuation-center facility. */
export const RESCUE_TAKEN_TO = ['EVACUATION_CENTER', 'HANDED_TO_AMBULANCE', 'STAYED', 'OTHER'] as const;

export type RescueTakenTo = (typeof RESCUE_TAKEN_TO)[number];

export const RESCUE_TAKEN_TO_LABELS: Record<RescueTakenTo, string> = {
  EVACUATION_CENTER: 'Evacuation center',
  HANDED_TO_AMBULANCE: 'Handed to ambulance',
  STAYED: 'Stayed (refused or safe)',
  OTHER: 'Other',
};

/**
 * The counts of a trip, with the D2 definitions: children are under 18, elderly are
 * 60 and over. Vulnerable groups may overlap; each (and families) is at most the
 * people rescued on that trip.
 */
export const RESCUE_COUNT_LABELS = {
  rescuedCount: 'People rescued',
  families: 'Families',
  children: 'Children (under 18)',
  elderly: 'Elderly (60+)',
  pwd: 'PWD',
  pregnant: 'Pregnant',
  stillWaiting: 'Still waiting here',
} as const;

/** The parts of `rescuedCount` that can't exceed it (D2). */
export const RESCUE_PART_COUNTS = ['families', 'children', 'elderly', 'pwd', 'pregnant'] as const;

export type RescuePartCount = (typeof RESCUE_PART_COUNTS)[number];
