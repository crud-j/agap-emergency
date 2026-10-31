import { RESCUE_PART_COUNTS, type RescuePartCount } from '@agap/shared';

/** The columns the totals read. Rows may come in any order. */
export interface RescueTripCounts {
  incident_id: string;
  rescued_count: number | null;
  families: number | null;
  children: number | null;
  elderly: number | null;
  pwd: number | null;
  pregnant: number | null;
  still_waiting: number | null;
  taken_to: string | null;
  taken_to_facility_id: string | null;
  reported_at: Date;
  facilities?: { name: string } | null;
}

export interface RescueDestinationTotal {
  takenTo: string | null;
  facilityId: string | null;
  facilityName: string | null;
  trips: number;
  rescued: number;
}

export interface RescueSummary {
  tripCount: number;
  rescued: number;
  families: number;
  children: number;
  elderly: number;
  pwd: number;
  pregnant: number;
  /** The latest trip that gave an estimate (a blank later trip doesn't erase it). */
  stillWaiting: number | null;
  stillWaitingAt: string | null;
  lastTripAt: string | null;
  byDestination: RescueDestinationTotal[];
}

const newestFirst = <T extends { reported_at: Date }>(rows: readonly T[]) =>
  [...rows].sort((a, b) => b.reported_at.getTime() - a.reported_at.getTime());

/** The newest still-waiting estimate in `rows`, if any trip gave one. */
export function latestStillWaiting<T extends Pick<RescueTripCounts, 'still_waiting' | 'reported_at'>>(rows: readonly T[]) {
  return newestFirst(rows).find((r) => r.still_waiting != null) ?? null;
}

/** Running totals for one incident's trips (MOD-32/52, plan Phase 4). Blank counts add nothing. */
export function summarizeRescueTrips(rows: readonly RescueTripCounts[]): RescueSummary {
  const parts = Object.fromEntries(RESCUE_PART_COUNTS.map((k) => [k, 0])) as Record<RescuePartCount, number>;
  let rescued = 0;
  const destinations = new Map<string, RescueDestinationTotal>();
  for (const r of rows) {
    rescued += r.rescued_count ?? 0;
    for (const k of RESCUE_PART_COUNTS) parts[k] += r[k] ?? 0;
    if (!r.taken_to) continue;
    const key = `${r.taken_to}|${r.taken_to_facility_id ?? ''}`;
    const total = destinations.get(key) ?? {
      takenTo: r.taken_to,
      facilityId: r.taken_to_facility_id,
      facilityName: r.facilities?.name ?? null,
      trips: 0,
      rescued: 0,
    };
    total.trips += 1;
    total.rescued += r.rescued_count ?? 0;
    destinations.set(key, total);
  }
  const waiting = latestStillWaiting(rows);
  const [last] = newestFirst(rows);
  return {
    tripCount: rows.length,
    rescued,
    ...parts,
    stillWaiting: waiting?.still_waiting ?? null,
    stillWaitingAt: waiting?.reported_at.toISOString() ?? null,
    lastTripAt: last?.reported_at.toISOString() ?? null,
    byDestination: [...destinations.values()].sort((a, b) => b.rescued - a.rescued),
  };
}

export interface BarangayRescueTotal {
  barangay: string | null;
  incidents: number;
  trips: number;
  rescued: number;
  /** Sum over this barangay's incidents of each one's latest estimate. */
  stillWaiting: number;
}

/**
 * The surge page's per-barangay totals (MOD-52): trips grouped by the incident's
 * barangay (`incident_locations.barangay`; null when the location has none).
 */
export function rescueTotalsByBarangay(
  rows: ReadonlyArray<Pick<RescueTripCounts, 'incident_id' | 'rescued_count' | 'still_waiting' | 'reported_at'> & {
    barangay: string | null;
  }>,
): BarangayRescueTotal[] {
  const byIncident = new Map<string, typeof rows[number][]>();
  for (const r of rows) byIncident.set(r.incident_id, [...(byIncident.get(r.incident_id) ?? []), r]);

  const byBarangay = new Map<string | null, BarangayRescueTotal>();
  for (const trips of byIncident.values()) {
    const barangay = trips[0]!.barangay;
    const total = byBarangay.get(barangay) ?? { barangay, incidents: 0, trips: 0, rescued: 0, stillWaiting: 0 };
    total.incidents += 1;
    total.trips += trips.length;
    total.rescued += trips.reduce((sum, t) => sum + (t.rescued_count ?? 0), 0);
    total.stillWaiting += latestStillWaiting(trips)?.still_waiting ?? 0;
    byBarangay.set(barangay, total);
  }
  return [...byBarangay.values()].sort((a, b) => b.stillWaiting - a.stillWaiting || b.rescued - a.rescued);
}
