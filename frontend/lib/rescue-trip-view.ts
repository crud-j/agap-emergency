import {
  RESCUE_ACCESS_LABELS,
  RESCUE_COUNT_LABELS,
  RESCUE_PART_COUNTS,
  RESCUE_TAKEN_TO_LABELS,
  WATER_LEVEL_LABELS,
  type RescueAccess,
  type RescueTakenTo,
  type WaterLevel,
} from '@agap/shared';
import type { IncidentListItem, IncidentRescueSummary, IncidentRescueTrip } from '@/features/incidents/api';

function label<T extends string>(labels: Record<T, string>, code: string | null): string | null {
  if (!code) return null;
  return labels[code as T] ?? code;
}

/** Where a trip's people went: the evacuation center's name, the "other" place, or the label. */
function destination(takenTo: string | null, facilityName: string | null | undefined, other?: string | null): string | null {
  if (takenTo === 'EVACUATION_CENTER' && facilityName) return facilityName;
  if (takenTo === 'OTHER' && other) return other;
  return label<RescueTakenTo>(RESCUE_TAKEN_TO_LABELS, takenTo);
}

/** e.g. ["3 children (under 18)", "1 elderly (60+)"]: the parts that were given and aren't 0. */
function partLines(counts: Record<(typeof RESCUE_PART_COUNTS)[number], number | null>): string[] {
  return RESCUE_PART_COUNTS
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => `${counts[k]} ${RESCUE_COUNT_LABELS[k].toLowerCase()}`);
}

export interface RescueTripLine {
  id: string;
  rescued: number | null;
  parts: string[];
  stillWaiting: number | null;
  conditions: string[];
  destination: string | null;
  unit: string | null;
  notes: string | null;
  reportedAt: string;
}

function lineFor(t: IncidentRescueTrip): RescueTripLine {
  return {
    id: t.id,
    rescued: t.rescued_count,
    parts: partLines(t),
    stillWaiting: t.still_waiting,
    conditions: [
      label<WaterLevel>(WATER_LEVEL_LABELS, t.water_level) && `Water: ${label<WaterLevel>(WATER_LEVEL_LABELS, t.water_level)}`,
      label<RescueAccess>(RESCUE_ACCESS_LABELS, t.access),
    ].filter((c): c is string => !!c),
    destination: destination(t.taken_to, t.facilities?.name, t.taken_to_other),
    unit: t.dispatches?.resources?.call_sign ?? t.dispatches?.resources?.name ?? null,
    notes: t.notes,
    reportedAt: t.reported_at,
  };
}

/**
 * The drawer's Rescue card (MOD-32/52, plan Phase 4): running totals from the server,
 * per-destination totals and every trip (newest first).
 */
export function rescueCardView(summary: IncidentRescueSummary | undefined): {
  rescued: number;
  tripCount: number;
  parts: string[];
  stillWaiting: number | null;
  destinations: Array<{ key: string; name: string; rescued: number; trips: number }>;
  trips: RescueTripLine[];
} | null {
  if (!summary || summary.tripCount === 0) return null;
  return {
    rescued: summary.rescued,
    tripCount: summary.tripCount,
    parts: partLines(summary),
    stillWaiting: summary.stillWaiting,
    destinations: summary.byDestination.map((d) => ({
      key: `${d.takenTo}|${d.facilityId ?? ''}`,
      name: destination(d.takenTo, d.facilityName) ?? 'Not given',
      rescued: d.rescued,
      trips: d.trips,
    })),
    trips: summary.trips.map(lineFor),
  };
}

/** The queue row's badge: "12 rescued", or nothing before the first trip. */
export function rescueQueueBadge(inc: Pick<IncidentListItem, 'rescue_trip_reports'>): string | null {
  const trips = inc.rescue_trip_reports;
  if (!trips || trips.length === 0) return null;
  const rescued = trips.reduce((sum, t) => sum + (t.rescued_count ?? 0), 0);
  return `${rescued} rescued`;
}
