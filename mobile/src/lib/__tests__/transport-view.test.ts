/// <reference types="jest" />
import type { RouteSnapshot, TransportDestinationView, TransportLeg } from '@agap/shared';
import type { LatestUnitPosition } from '@/src/services/api/locations.api';
import { deriveTransportView } from '../transport-view';

const joni: TransportDestinationView = {
  kind: 'FACILITY', name: 'DOH — Joni Villanueva General Hospital', latitude: 14.79679, longitude: 120.94358, locationVerified: true,
};
const route: RouteSnapshot = {
  geometry: [[120.9266, 14.7993], [120.943519, 14.796745]], distanceMeters: 3160, durationSeconds: 426,
  isEstimate: true, calculatedAt: '2026-10-29T01:00:00.000Z', stale: false,
};
const position = { lat: 14.81, lng: 120.95, heading: 90, speedKmh: 40, updatedAt: '2026-10-29T01:00:00.000Z' };

function unit(
  dispatchId: string,
  leg: TransportLeg | undefined,
  visible: boolean,
): LatestUnitPosition {
  return {
    dispatchId,
    callSign: `AMB-${dispatchId}`,
    unitName: null,
    resourceType: 'AMBULANCE',
    ...(leg ? { leg } : {}),
    // What the server sends: a redacted unit has destination, route and position null (Prompt 09).
    destination: visible ? joni : null,
    route: visible && leg === 'TO_FACILITY' ? route : null,
    position: visible || leg === 'TO_SCENE' ? position : null,
    eta: { seconds: visible ? 426 : null, isEstimate: true, calculatedAt: null },
  };
}

describe('deriveTransportView (plan §17, C17)', () => {
  it('TO_SCENE: units on the scene leg, before transport', () => {
    expect(deriveTransportView('EN_ROUTE', [unit('A', 'TO_SCENE', false)])).toEqual({ view: 'TO_SCENE', unit: null });
    expect(deriveTransportView('ON_SCENE', [])).toEqual({ view: 'TO_SCENE', unit: null });
    expect(deriveTransportView(null, undefined)).toEqual({ view: 'TO_SCENE', unit: null });
  });

  it('TO_FACILITY_VISIBLE: the server sent this reporter the destination', () => {
    const a = unit('A', 'TO_FACILITY', true);
    expect(deriveTransportView('TRANSPORTING', [a])).toEqual({ view: 'TO_FACILITY_VISIBLE', unit: a });
  });

  it('TO_FACILITY_REDACTED: hospital leg with destination and position null', () => {
    const a = unit('A', 'TO_FACILITY', false);
    expect(deriveTransportView('TRANSPORTING', [a])).toEqual({ view: 'TO_FACILITY_REDACTED', unit: a });
  });

  it('AT_FACILITY_VISIBLE and AT_FACILITY_REDACTED', () => {
    const visible = unit('A', 'AT_FACILITY', true);
    const redacted = unit('B', 'AT_FACILITY', false);
    expect(deriveTransportView('TRANSPORTING', [visible])).toEqual({ view: 'AT_FACILITY_VISIBLE', unit: visible });
    expect(deriveTransportView('TRANSPORTING', [redacted])).toEqual({ view: 'AT_FACILITY_REDACTED', unit: redacted });
  });

  it('COMPLETE on RESOLVED or CLOSED, whatever the cached units say', () => {
    for (const status of ['RESOLVED', 'CLOSED']) {
      expect(deriveTransportView(status, [unit('A', 'AT_FACILITY', true)])).toEqual({ view: 'COMPLETE', unit: null });
    }
  });

  it('TRANSPORTING before any hospital-leg unit is known: status only, never the scene ETA', () => {
    expect(deriveTransportView('TRANSPORTING', [])).toEqual({ view: 'TO_FACILITY_REDACTED', unit: null });
    expect(deriveTransportView('TRANSPORTING', [unit('A', undefined, false)])).toEqual({
      view: 'TO_FACILITY_REDACTED',
      unit: null,
    });
  });

  it('a position alone never makes it visible (a fix cached from the scene leg)', () => {
    const cached = { ...unit('A', 'TO_FACILITY', false), position };
    expect(deriveTransportView('TRANSPORTING', [cached]).view).toBe('TO_FACILITY_REDACTED');
  });

  it('a withdrawal (route_updated with destination null) turns a visible view back to redacted', () => {
    const withdrawn = { ...unit('A', 'TO_FACILITY', true), destination: null, route: null };
    expect(deriveTransportView('TRANSPORTING', [withdrawn]).view).toBe('TO_FACILITY_REDACTED');
  });

  it('two units: the one this reporter was confirmed on wins over a redacted one', () => {
    const other = unit('A', 'TO_FACILITY', false);
    const mine = unit('B', 'TO_FACILITY', true);
    expect(deriveTransportView('TRANSPORTING', [other, mine])).toEqual({ view: 'TO_FACILITY_VISIBLE', unit: mine });
  });

  it('a unit still travelling wins over one that has arrived (same visibility)', () => {
    const arrived = unit('A', 'AT_FACILITY', false);
    const travelling = unit('B', 'TO_FACILITY', false);
    expect(deriveTransportView('TRANSPORTING', [arrived, travelling]).unit).toBe(travelling);
  });

  it('ignores scene-leg units when another unit is on the hospital leg', () => {
    const scene = unit('A', 'TO_SCENE', false);
    const hospital = unit('B', 'TO_FACILITY', false);
    expect(deriveTransportView('TRANSPORTING', [scene, hospital])).toEqual({ view: 'TO_FACILITY_REDACTED', unit: hospital });
  });
});
