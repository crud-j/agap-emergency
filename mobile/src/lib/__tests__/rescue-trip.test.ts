/// <reference types="jest" />
import {
  EMPTY_RESCUE_TRIP_FORM,
  buildRescueTripBody,
  formFromLatestTrip,
  nearestCenters,
  needsCenter,
  partMax,
  rescueSummaryLine,
  withRescueFinishWarning,
  withRescuedCount,
} from '../rescue-trip';
import type { RescueTrip } from '@/src/services/api/rescue-trips.api';

// Unit field flow plan, Phase 4 (D2): the rescue trip form.

const trip = (overrides: Partial<RescueTrip> = {}): RescueTrip => ({
  id: 'trip-1',
  incident_id: 'inc-1',
  dispatch_id: 'disp-1',
  rescued_count: 5,
  families: 2,
  children: 2,
  elderly: 1,
  pwd: null,
  pregnant: null,
  still_waiting: 8,
  water_level: 'WAIST',
  access: 'BOAT_ONLY',
  taken_to: 'EVACUATION_CENTER',
  taken_to_facility_id: 'fac-ec',
  reported_at: '2026-10-31T02:00:00.000Z',
  ...overrides,
});

describe('buildRescueTripBody', () => {
  it('an untouched form sends an empty trip: every field is optional', () => {
    expect(buildRescueTripBody(EMPTY_RESCUE_TRIP_FORM)).toEqual({});
  });

  it('sends only what was answered, keeps 0, trims text, and drops destination fields that do not match', () => {
    expect(buildRescueTripBody({
      ...EMPTY_RESCUE_TRIP_FORM,
      rescuedCount: 4, children: 0, families: 1, stillWaiting: 0, waterLevel: 'CHEST', access: 'BOAT_ONLY',
      takenTo: 'OTHER', takenToFacilityId: 'fac-stale', takenToOther: '  chapel  ', notes: '  ok  ',
    })).toEqual({
      rescuedCount: 4, children: 0, families: 1, stillWaiting: 0, waterLevel: 'CHEST', access: 'BOAT_ONLY',
      takenTo: 'OTHER', takenToOther: 'chapel', notes: 'ok',
    });
    expect(buildRescueTripBody({
      ...EMPTY_RESCUE_TRIP_FORM, takenTo: 'EVACUATION_CENTER', takenToFacilityId: 'fac-ec', takenToOther: 'x',
    })).toEqual({ takenTo: 'EVACUATION_CENTER', takenToFacilityId: 'fac-ec' });
  });
});

describe('form rules', () => {
  it('each trip starts with empty counts; water, access and the last center carry over', () => {
    expect(formFromLatestTrip(trip())).toEqual({
      ...EMPTY_RESCUE_TRIP_FORM,
      waterLevel: 'WAIST', access: 'BOAT_ONLY', takenTo: 'EVACUATION_CENTER', takenToFacilityId: 'fac-ec',
    });
    expect(formFromLatestTrip(trip({ taken_to: 'HANDED_TO_AMBULANCE', taken_to_facility_id: null })).takenTo).toBeNull();
    expect(formFromLatestTrip(null)).toBe(EMPTY_RESCUE_TRIP_FORM);
  });

  it('lowering people rescued lowers any part above it; parts can never step past it', () => {
    const form = { ...EMPTY_RESCUE_TRIP_FORM, rescuedCount: 5, children: 4, elderly: 2, families: 5 };
    expect(withRescuedCount(form, 3)).toMatchObject({ rescuedCount: 3, children: 3, elderly: 2, families: 3 });
    expect(partMax({ ...form, rescuedCount: 3 })).toBe(3);
    expect(partMax(EMPTY_RESCUE_TRIP_FORM)).toBe(500);
  });

  it('an evacuation center must be chosen before sending', () => {
    expect(needsCenter({ ...EMPTY_RESCUE_TRIP_FORM, takenTo: 'EVACUATION_CENTER' })).toBe(true);
    expect(needsCenter({ ...EMPTY_RESCUE_TRIP_FORM, takenTo: 'EVACUATION_CENTER', takenToFacilityId: 'fac' })).toBe(false);
    expect(needsCenter(EMPTY_RESCUE_TRIP_FORM)).toBe(false);
  });
});

describe('nearestCenters', () => {
  it('sorts by distance from the scene; centers without coordinates last, by name', () => {
    const scene = { lat: 14.8, lng: 120.93 };
    const sorted = nearestCenters([
      { id: 'far', name: 'Far', barangay: null, latitude: '14.90', longitude: '120.93' },
      { id: 'none-b', name: 'B no coords', barangay: null, latitude: null, longitude: null },
      { id: 'near', name: 'Near', barangay: 'Lolomboy', latitude: 14.801, longitude: 120.93 },
      { id: 'none-a', name: 'A no coords', barangay: null, latitude: null, longitude: null },
    ], scene);
    expect(sorted.map((c) => c.id)).toEqual(['near', 'far', 'none-a', 'none-b']);
    expect(sorted[0]!.distanceMeters).toBeGreaterThan(100);
    expect(sorted[0]!.distanceMeters).toBeLessThan(120);
  });

  it('no scene location: by name', () => {
    expect(nearestCenters([
      { id: 'b', name: 'Bambang EC', barangay: null, latitude: 1, longitude: 1 },
      { id: 'a', name: 'Igulot EC', barangay: null, latitude: 2, longitude: 2 },
    ], null).map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('assignment screen line and Finish', () => {
  it('rescueSummaryLine shows totals and the estimate', () => {
    expect(rescueSummaryLine({ tripCount: 3, rescued: 12, stillWaiting: 5 })).toBe('12 rescued · 3 trips · ~5 waiting');
    expect(rescueSummaryLine({ tripCount: 1, rescued: 4, stillWaiting: 0 })).toBe('4 rescued · 1 trip · none waiting');
    expect(rescueSummaryLine({ tripCount: 1, rescued: 4, stillWaiting: null })).toBe('4 rescued · 1 trip');
    expect(rescueSummaryLine({ tripCount: 0, rescued: 0, stillWaiting: null })).toBe('No trips logged yet');
  });

  it('Finish with people still waiting asks first (never blocks); otherwise the usual confirm', () => {
    const confirm = { title: 'Finish your unit?', message: 'The incident stays open.' };
    expect(withRescueFinishWarning(confirm, 6)).toEqual({
      title: 'Finish your unit?',
      message: 'About 6 people are still waiting here. Dispatch will be told when you finish. The incident stays open.',
    });
    expect(withRescueFinishWarning(undefined, 2)?.title).toBe('Finish?');
    expect(withRescueFinishWarning(confirm, 0)).toBe(confirm);
    expect(withRescueFinishWarning(undefined, null)).toBeUndefined();
  });
});
