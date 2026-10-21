/// <reference types="jest" />
import type { ResponderLocationUpdatedPayload } from '@agap/shared';
import type { LatestUnitPosition } from '@/src/services/api/locations.api';
import { mergeTrackingLocation } from '../incident-tracking';

const seededUnit: LatestUnitPosition = {
  dispatchId: 'dispatch-1',
  callSign: 'AMB-1',
  unitName: 'Ambulance 1',
  resourceType: 'AMBULANCE',
  position: {
    lat: 14.5,
    lng: 120.9,
    heading: 90,
    speedKmh: 12,
    updatedAt: '2026-10-18T01:00:00.000Z',
  },
  eta: { seconds: 300, isEstimate: true, calculatedAt: '2026-10-18T01:00:00.000Z' },
};

const update: ResponderLocationUpdatedPayload = {
  responderId: 'crew-1',
  incidentId: 'incident-1',
  dispatchId: 'dispatch-1',
  callSign: 'AMB-1',
  lat: 14.6,
  lng: 120.8,
  heading: null,
  speed: null,
  updatedAt: '2026-10-18T01:00:05.000Z',
};

describe('mergeTrackingLocation', () => {
  it('patches the matching dispatch while preserving seeded unit and ETA details', () => {
    expect(mergeTrackingLocation([seededUnit], update)).toEqual([
      {
        ...seededUnit,
        position: {
          lat: 14.6,
          lng: 120.8,
          heading: null,
          speedKmh: null,
          updatedAt: update.updatedAt,
        },
      },
    ]);
  });

  it('adds a unit first seen through the socket without exposing responder identity', () => {
    expect(mergeTrackingLocation([], update)).toEqual([
      {
        dispatchId: 'dispatch-1',
        callSign: 'AMB-1',
        unitName: null,
        resourceType: null,
        position: {
          lat: 14.6,
          lng: 120.8,
          heading: null,
          speedKmh: null,
          updatedAt: update.updatedAt,
        },
        eta: { seconds: null, isEstimate: true, calculatedAt: null },
      },
    ]);
  });

  it('ignores a stale socket position', () => {
    const stale = { ...update, updatedAt: '2026-10-18T00:59:00.000Z' };
    expect(mergeTrackingLocation([seededUnit], stale)).toEqual([seededUnit]);
  });

  it('matches an older location event without dispatch metadata when there is one seeded unit', () => {
    const legacyUpdate = { ...update, dispatchId: undefined, callSign: undefined };
    const result = mergeTrackingLocation([seededUnit], legacyUpdate);
    expect(result).toHaveLength(1);
    expect(result[0].dispatchId).toBe(seededUnit.dispatchId);
    expect(result[0].callSign).toBe(seededUnit.callSign);
    expect(result[0].position?.lat).toBe(update.lat);
  });
});
