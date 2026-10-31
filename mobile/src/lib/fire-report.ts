import {
  FIRE_ALARM_LEVEL_LABELS,
  FIRE_STATUS_LABELS,
  type FireAlarmLevel,
  type FireHazard,
  type FireOccupancyType,
  type FireStatus,
} from '@agap/shared';
import type { FireReport, FireReportBody } from '@/src/services/api/fire-reports.api';

/** The fire report form (plan Phase 3). null = not answered; every field is optional. */
export interface FireReportForm {
  fireStatus: FireStatus | null;
  alarmLevel: FireAlarmLevel | null;
  occupancyType: FireOccupancyType | null;
  hazards: FireHazard[];
  structuresInvolved: number | null;
  casualtiesSeen: number | null;
  trappedPersons: number | null;
  spreading: boolean | null;
  evacuationNeeded: boolean | null;
  notes: string;
}

export const EMPTY_FIRE_REPORT_FORM: FireReportForm = {
  fireStatus: null,
  alarmLevel: null,
  occupancyType: null,
  hazards: [],
  structuresInvolved: null,
  casualtiesSeen: null,
  trappedPersons: null,
  spreading: null,
  evacuationNeeded: null,
  notes: '',
};

/**
 * An update usually changes one or two things, so the form starts from the latest
 * report. Notes start empty: each report's note is its own.
 */
export function formFromLatest(latest: FireReport | null | undefined): FireReportForm {
  if (!latest) return EMPTY_FIRE_REPORT_FORM;
  return {
    fireStatus: latest.fire_status,
    alarmLevel: latest.alarm_level,
    occupancyType: latest.occupancy_type,
    hazards: [...latest.hazards],
    structuresInvolved: latest.structures_involved,
    casualtiesSeen: latest.casualties_seen,
    trappedPersons: latest.trapped_persons,
    spreading: latest.spreading,
    evacuationNeeded: latest.evacuation_needed,
    notes: '',
  };
}

/** The request body: only what was answered, so an empty form sends `{}`. */
export function buildFireReportBody(form: FireReportForm): FireReportBody {
  const body: FireReportBody = {};
  if (form.fireStatus) body.fireStatus = form.fireStatus;
  if (form.alarmLevel) body.alarmLevel = form.alarmLevel;
  if (form.occupancyType) body.occupancyType = form.occupancyType;
  if (form.hazards.length > 0) body.hazards = [...form.hazards];
  if (form.structuresInvolved != null) body.structuresInvolved = form.structuresInvolved;
  if (form.casualtiesSeen != null) body.casualtiesSeen = form.casualtiesSeen;
  if (form.trappedPersons != null) body.trappedPersons = form.trappedPersons;
  if (form.spreading != null) body.spreading = form.spreading;
  if (form.evacuationNeeded != null) body.evacuationNeeded = form.evacuationNeeded;
  const notes = form.notes.trim();
  if (notes) body.notes = notes;
  return body;
}

export { stepCount } from './field-counts';

export function toggleHazard(hazards: readonly FireHazard[], hazard: FireHazard): FireHazard[] {
  return hazards.includes(hazard) ? hazards.filter((h) => h !== hazard) : [...hazards, hazard];
}

/** One line for the assignment screen, e.g. "Under control · 3rd alarm · 2 trapped". */
export function fireSummaryLine(latest: FireReport): string {
  const parts = [
    latest.fire_status ? FIRE_STATUS_LABELS[latest.fire_status] : 'Status not given',
    latest.alarm_level ? FIRE_ALARM_LEVEL_LABELS[latest.alarm_level] : null,
    latest.trapped_persons ? `${latest.trapped_persons} trapped` : null,
    latest.casualties_seen ? `${latest.casualties_seen} casualties` : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

/**
 * Finish on a fire unit (plan Phase 3): ask first when the latest report isn't
 * "Fire out", or there is none. Only a warning: Finish is never blocked.
 */
export function withFireFinishWarning(
  confirm: { title: string; message: string } | undefined,
  latestFireStatus: FireStatus | null | undefined,
): { title: string; message: string } | undefined {
  if (latestFireStatus === 'FIRE_OUT') return confirm;
  const warning = latestFireStatus
    ? `The last fire report says "${FIRE_STATUS_LABELS[latestFireStatus]}", not "Fire out".`
    : 'No fire report was filed for this incident.';
  return {
    title: confirm?.title ?? 'Finish?',
    message: confirm ? `${warning} ${confirm.message}` : warning,
  };
}
