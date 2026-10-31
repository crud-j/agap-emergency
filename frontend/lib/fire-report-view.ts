import {
  FIRE_ALARM_LEVEL_LABELS,
  FIRE_HAZARD_LABELS,
  FIRE_OCCUPANCY_TYPE_LABELS,
  FIRE_STATUS_LABELS,
  type FireAlarmLevel,
  type FireHazard,
  type FireOccupancyType,
  type FireStatus,
} from '@agap/shared';
import type { IncidentFireReport, IncidentListItem } from '@/features/incidents/api';
import type { BadgeVariant } from '@/components/ui';

export type FireTone = 'danger' | 'warn' | 'ok' | 'neutral';

/** Badge colour per tone, shared by the drawer card and the queue badge. */
export const FIRE_TONE_BADGE: Record<FireTone, BadgeVariant> = { danger: 'red', warn: 'amber', ok: 'green', neutral: 'default' };

const STATUS_TONE: Record<string, FireTone> = { ACTIVE: 'danger', UNDER_CONTROL: 'warn', FIRE_OUT: 'ok' };

function label<T extends string>(labels: Record<T, string>, code: string | null): string | null {
  if (!code) return null;
  return labels[code as T] ?? code;
}

export interface FireReportLine {
  id: string;
  status: string;
  tone: FireTone;
  alarm: string | null;
  hazards: string[];
  /** e.g. ["2 trapped", "3 casualties seen", "4 structures (Industrial)"]. */
  counts: string[];
  flags: string[];
  unit: string | null;
  notes: string | null;
  reportedAt: string;
}

function lineFor(r: IncidentFireReport): FireReportLine {
  const occupancy = label<FireOccupancyType>(FIRE_OCCUPANCY_TYPE_LABELS, r.occupancy_type);
  const structures = r.structures_involved != null
    ? `${r.structures_involved} structure${r.structures_involved === 1 ? '' : 's'}${occupancy ? ` (${occupancy})` : ''}`
    : occupancy;
  return {
    id: r.id,
    status: label<FireStatus>(FIRE_STATUS_LABELS, r.fire_status) ?? 'Status not given',
    tone: STATUS_TONE[r.fire_status ?? ''] ?? 'neutral',
    alarm: label<FireAlarmLevel>(FIRE_ALARM_LEVEL_LABELS, r.alarm_level),
    hazards: r.hazards.map((h) => label<FireHazard>(FIRE_HAZARD_LABELS, h) ?? h),
    counts: [
      r.trapped_persons != null ? `${r.trapped_persons} trapped` : null,
      r.casualties_seen != null ? `${r.casualties_seen} casualties seen` : null,
      structures,
    ].filter((c): c is string => !!c),
    flags: [
      r.spreading === true ? 'Spreading to neighbours' : r.spreading === false ? 'Not spreading' : null,
      r.evacuation_needed === true ? 'Evacuation needed' : null,
    ].filter((f): f is string => !!f),
    unit: r.dispatches?.resources?.call_sign ?? r.dispatches?.resources?.name ?? null,
    notes: r.notes,
    reportedAt: r.reported_at,
  };
}

/**
 * The drawer's Fire card (MOD-36, plan Phase 3): the latest report is the current
 * picture, the rest is its history (newest first, as the API returns them).
 */
export function fireCardView(reports: readonly IncidentFireReport[] | undefined): {
  latest: FireReportLine;
  history: FireReportLine[];
} | null {
  if (!reports || reports.length === 0) return null;
  const [latest, ...rest] = reports.map(lineFor);
  return { latest: latest!, history: rest };
}

/** The queue row's badge: the latest fire status (and alarm level), or nothing. */
export function fireQueueBadge(inc: Pick<IncidentListItem, 'fire_field_reports'>): { text: string; tone: FireTone } | null {
  const latest = inc.fire_field_reports?.[0];
  if (!latest) return null;
  const status = label<FireStatus>(FIRE_STATUS_LABELS, latest.fire_status) ?? 'Fire report';
  const alarm = label<FireAlarmLevel>(FIRE_ALARM_LEVEL_LABELS, latest.alarm_level);
  return { text: alarm ? `${status} · ${alarm}` : status, tone: STATUS_TONE[latest.fire_status ?? ''] ?? 'neutral' };
}
