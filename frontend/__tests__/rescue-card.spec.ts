import { rescueCardView, rescueQueueBadge } from '@/lib/rescue-trip-view';
import type { IncidentRescueSummary, IncidentRescueTrip } from '@/features/incidents/api';

// Unit field flow plan, Phase 4: the drawer's Rescue card and the queue badge.

function trip(overrides: Partial<IncidentRescueTrip> = {}): IncidentRescueTrip {
  return {
    id: 'trip-2',
    dispatch_id: 'disp-1',
    rescued_count: 6,
    families: 2,
    children: 3,
    elderly: 1,
    pwd: 0,
    pregnant: null,
    still_waiting: 5,
    water_level: 'CHEST',
    access: 'BOAT_ONLY',
    taken_to: 'EVACUATION_CENTER',
    taken_to_facility_id: 'fac-ec',
    taken_to_other: null,
    notes: 'Second floor still occupied',
    reported_at: '2026-10-31T02:10:00Z',
    dispatches: { resources: { name: 'MDRRMO Rescue Boat 1', call_sign: 'BOAT-1' } },
    facilities: { id: 'fac-ec', name: 'Lolomboy Barangay Hall Evacuation Center' },
    ...overrides,
  };
}

function summary(overrides: Partial<IncidentRescueSummary> = {}): IncidentRescueSummary {
  return {
    tripCount: 2,
    rescued: 10,
    families: 3,
    children: 4,
    elderly: 1,
    pwd: 0,
    pregnant: 1,
    stillWaiting: 5,
    stillWaitingAt: '2026-10-31T02:10:00Z',
    lastTripAt: '2026-10-31T02:10:00Z',
    byDestination: [
      { takenTo: 'EVACUATION_CENTER', facilityId: 'fac-ec', facilityName: 'Lolomboy Barangay Hall Evacuation Center', trips: 1, rescued: 6 },
      { takenTo: 'HANDED_TO_AMBULANCE', facilityId: null, facilityName: null, trips: 1, rescued: 4 },
    ],
    trips: [
      trip(),
      trip({
        id: 'trip-1', rescued_count: 4, families: 1, children: 1, elderly: 0, pregnant: 1, still_waiting: null,
        water_level: null, access: null, taken_to: 'HANDED_TO_AMBULANCE', taken_to_facility_id: null, facilities: null,
        notes: null, reported_at: '2026-10-31T01:40:00Z',
      }),
    ],
    ...overrides,
  };
}

describe('rescueCardView', () => {
  it('nothing to show before the first trip', () => {
    expect(rescueCardView(undefined)).toBeNull();
    expect(rescueCardView(summary({ tripCount: 0, rescued: 0, trips: [], byDestination: [] }))).toBeNull();
  });

  it('shows the server totals, the vulnerable counts given, per destination, and every trip newest first', () => {
    const view = rescueCardView(summary())!;
    expect(view.rescued).toBe(10);
    expect(view.tripCount).toBe(2);
    expect(view.stillWaiting).toBe(5);
    // 0 parts (pwd) are left out; D2 labels (age cutoffs) come from @agap/shared.
    expect(view.parts).toEqual(['3 families', '4 children (under 18)', '1 elderly (60+)', '1 pregnant']);
    expect(view.destinations.map((d) => [d.name, d.rescued, d.trips])).toEqual([
      ['Lolomboy Barangay Hall Evacuation Center', 6, 1],
      ['Handed to ambulance', 4, 1],
    ]);
    expect(view.trips.map((t) => t.id)).toEqual(['trip-2', 'trip-1']);
    expect(view.trips[0]).toMatchObject({
      rescued: 6,
      destination: 'Lolomboy Barangay Hall Evacuation Center',
      conditions: ['Water: Chest', 'Boat only'],
      unit: 'BOAT-1',
      stillWaiting: 5,
      notes: 'Second floor still occupied',
    });
    expect(view.trips[1]).toMatchObject({ destination: 'Handed to ambulance', conditions: [], notes: null });
  });

  it('an "other" place is shown as typed; a trip with no count says so', () => {
    const view = rescueCardView(summary({
      trips: [trip({ taken_to: 'OTHER', taken_to_other: 'San Roque chapel', facilities: null, rescued_count: null })],
    }))!;
    expect(view.trips[0]).toMatchObject({ destination: 'San Roque chapel', rescued: null });
  });
});

describe('rescueQueueBadge', () => {
  it('sums the trips (blank counts add nothing), or nothing before the first trip', () => {
    expect(rescueQueueBadge({ rescue_trip_reports: [{ rescued_count: 5 }, { rescued_count: null }, { rescued_count: 7 }] }))
      .toBe('12 rescued');
    expect(rescueQueueBadge({ rescue_trip_reports: [{ rescued_count: 0 }] })).toBe('0 rescued');
    expect(rescueQueueBadge({ rescue_trip_reports: [] })).toBeNull();
    expect(rescueQueueBadge({})).toBeNull();
  });
});
