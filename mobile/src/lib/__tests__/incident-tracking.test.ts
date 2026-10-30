/// <reference types="jest" />
import type {
  IncidentTransportUpdatedPayload,
  ResponderLocationUpdatedPayload,
  ResponderRouteUpdatedPayload,
  RouteSnapshot,
  TransportDestinationView,
} from '@agap/shared';
import type { LatestUnitPosition } from '@/src/services/api/locations.api';
import { mergeRouteUpdate, mergeTrackingLocation, mergeTransportUpdate } from '../incident-tracking';

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

const joni: TransportDestinationView = {
  kind: 'FACILITY', name: 'DOH — Joni Villanueva General Hospital', latitude: 14.79679, longitude: 120.94358, locationVerified: true,
};
const malolos: TransportDestinationView = {
  kind: 'FACILITY', name: 'Bulacan Medical Center', latitude: 14.8433, longitude: 120.8114, locationVerified: true,
};
const route: RouteSnapshot = {
  geometry: [[120.9266, 14.7993], [120.943519, 14.796745]],
  distanceMeters: 3160,
  durationSeconds: 426,
  isEstimate: true,
  calculatedAt: '2026-10-18T01:00:00.000Z',
  stale: false,
};
const onHospitalLeg: LatestUnitPosition = { ...seededUnit, leg: 'TO_FACILITY', destination: joni, route };

describe('mergeTrackingLocation keeps the leg (Prompt 10)', () => {
  it("a location patch keeps the seed's leg, destination and route", () => {
    const [unit] = mergeTrackingLocation([onHospitalLeg], update);
    expect(unit).toMatchObject({ leg: 'TO_FACILITY', destination: joni, route });
    expect(unit.position?.lat).toBe(update.lat);
  });
});

describe('mergeRouteUpdate (responder.route_updated)', () => {
  const routeUpdate: ResponderRouteUpdatedPayload = {
    incidentId: 'incident-1', dispatchId: 'dispatch-1', leg: 'TO_FACILITY', destination: joni, route,
  };

  it("replaces the unit's leg, destination and route, keeping its position and ETA", () => {
    const [unit] = mergeRouteUpdate([seededUnit], routeUpdate);
    expect(unit).toEqual({ ...seededUnit, leg: 'TO_FACILITY', destination: joni, route });
  });

  it('adds a unit first seen through a route event, without a position', () => {
    expect(mergeRouteUpdate([], routeUpdate)).toEqual([
      {
        dispatchId: 'dispatch-1', callSign: null, unitName: null, resourceType: null, position: null,
        eta: { seconds: null, isEstimate: true, calculatedAt: null },
        leg: 'TO_FACILITY', destination: joni, route,
      },
    ]);
  });

  it('a withdrawal (destination and route null) clears what this viewer was shown', () => {
    const [unit] = mergeRouteUpdate([onHospitalLeg], { ...routeUpdate, destination: null, route: null });
    expect(unit).toMatchObject({ destination: null, route: null });
  });

  it('leaves other units untouched', () => {
    const other = { ...seededUnit, dispatchId: 'dispatch-2' };
    expect(mergeRouteUpdate([other, seededUnit], routeUpdate)[0]).toBe(other);
  });
});

describe('mergeTransportUpdate (incident.transport_updated)', () => {
  const changed = (destination: IncidentTransportUpdatedPayload['destination']): IncidentTransportUpdatedPayload => ({
    incidentId: 'incident-1', dispatchId: 'dispatch-1', transportId: 'tr-1', destination, changedAt: 'now',
  });

  it('a new hospital replaces the destination and drops the route to the old one', () => {
    const [unit] = mergeTransportUpdate([onHospitalLeg], changed(malolos))!;
    expect(unit).toMatchObject({ destination: malolos, route: null });
  });

  it('the same hospital (e.g. a capacity warning) keeps the route', () => {
    const [unit] = mergeTransportUpdate([onHospitalLeg], { ...changed(joni), destinationWarning: 'FACILITY_AT_CAPACITY' })!;
    expect(unit).toMatchObject({ destination: joni, route });
  });

  it('never keeps a facility id from the ops copy', () => {
    const [unit] = mergeTransportUpdate([onHospitalLeg], changed({ ...malolos, id: 'fac-9' }))!;
    expect(unit.destination).not.toHaveProperty('id');
  });

  it('does nothing before the seed has loaded', () => {
    expect(mergeTransportUpdate(undefined, changed(malolos))).toBeUndefined();
  });
});
