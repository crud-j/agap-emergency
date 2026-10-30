/// <reference types="jest" />
import type { RouteSnapshot } from '@agap/shared';
import type {
  NearbyHospital,
  TransportHospital,
  TransportRecord,
} from '@/src/services/api/transport.api';
import {
  SERVICE_AREA_BOUNDS,
  buildDestinationList,
  formatDistance,
  formatDuration,
  isDestinationDeactivated,
  isRouteLastKnown,
  needsServiceAreaBounds,
  selectRouteTarget,
  shouldShowReporterPatientSwitch,
} from '../transport-target';

const SCENE = { lat: 14.7993, lng: 120.9266 };
const JONI = { lat: 14.79679, lng: 120.94358 };
const MALOLOS = { lat: 14.8433, lng: 120.8114 };

function transport(overrides: Partial<TransportRecord> = {}): TransportRecord {
  return {
    id: 'tr-1',
    incident_id: 'incident-1',
    dispatch_id: 'dispatch-1',
    destination_id: 'fac-1',
    transport_started_at: '2026-10-29T01:00:00Z',
    estimated_arrival_at: null,
    arrived_at: null,
    facilities: {
      id: 'fac-1',
      name: 'DOH — Joni Villanueva General Hospital',
      latitude: JONI.lat,
      longitude: JONI.lng,
      location_status: 'VERIFIED',
      receiving_status: 'OPEN',
    },
    ...overrides,
  };
}

describe('selectRouteTarget (plan §15)', () => {
  it('open transport to a hospital with coordinates → FACILITY at the hospital', () => {
    expect(selectRouteTarget({ status: 'TRANSPORTING', myTransport: transport(), scene: SCENE })).toEqual({
      kind: 'FACILITY',
      point: JONI,
      label: 'DOH — Joni Villanueva General Hospital',
      verified: true,
    });
  });

  it('open transport to a hospital without coordinates → NONE with its name (for a name search)', () => {
    const noCoords = transport({
      facilities: {
        id: 'fac-2', name: 'Bocaue General Hospital', latitude: null, longitude: null,
        location_status: 'UNVERIFIED', receiving_status: 'UNKNOWN',
      },
    });
    expect(selectRouteTarget({ status: 'TRANSPORTING', myTransport: noCoords, scene: SCENE })).toEqual({
      kind: 'NONE', point: null, label: 'Bocaue General Hospital', verified: false,
    });
  });

  it('no transport → SCENE at the scene', () => {
    expect(selectRouteTarget({ status: 'ON_SCENE', myTransport: null, scene: SCENE })).toEqual({
      kind: 'SCENE', point: SCENE, label: null, verified: true,
    });
    expect(selectRouteTarget({ status: 'TRANSPORTING', myTransport: null, scene: SCENE }).kind).toBe('SCENE');
  });

  it('a transport row while the incident is no longer TRANSPORTING → SCENE (not an open transport)', () => {
    expect(selectRouteTarget({ status: 'RESOLVED', myTransport: transport(), scene: SCENE }).kind).toBe('SCENE');
  });

  it('"Decide later" (no hospital yet) → NONE without a label', () => {
    expect(
      selectRouteTarget({ status: 'TRANSPORTING', myTransport: transport({ facilities: null, destination_id: null }), scene: SCENE }),
    ).toEqual({ kind: 'NONE', point: null, label: null, verified: false });
  });

  it('after arrival → NONE (nothing left to route to)', () => {
    expect(
      selectRouteTarget({ status: 'TRANSPORTING', myTransport: transport({ arrived_at: '2026-10-29T01:20:00Z' }), scene: SCENE }).kind,
    ).toBe('NONE');
  });

  it('an unverified hospital with coordinates is still a FACILITY, flagged unverified', () => {
    const unverified = transport({
      facilities: { ...transport().facilities!, location_status: 'UNVERIFIED' },
    });
    expect(selectRouteTarget({ status: 'TRANSPORTING', myTransport: unverified, scene: SCENE })).toMatchObject({
      kind: 'FACILITY', verified: false,
    });
  });
});

describe('shouldShowReporterPatientSwitch (C17)', () => {
  it('shows only on an open transport while the server has reporter sharing on', () => {
    expect(shouldShowReporterPatientSwitch(transport({ reporterSharingEnabled: true }))).toBe(true);
  });

  it.each([
    ['sharing off (launch switch)', transport({ reporterSharingEnabled: false })],
    ['flag missing (hospital user / older server)', transport()],
    ['arrived', transport({ reporterSharingEnabled: true, arrived_at: '2026-10-29T01:20:00Z' })],
    ['no transport', null],
  ])('hidden when %s', (_label, record) => {
    expect(shouldShowReporterPatientSwitch(record)).toBe(false);
  });

  it("the reporter's own claim never shows or enables it", () => {
    expect(shouldShowReporterPatientSwitch(transport({ reporterClaimsPatient: true, reporterSharingEnabled: false }))).toBe(false);
  });
});

describe('buildDestinationList', () => {
  const hospital = (id: string, name: string, extra: Partial<TransportHospital> = {}): TransportHospital => ({
    id, name, facility_type: 'HOSPITAL', address: null, is_active: true,
    latitude: null, longitude: null, location_status: 'UNVERIFIED', receiving_status: 'UNKNOWN', ...extra,
  });
  const near = (id: string, name: string, distanceMeters: number): NearbyHospital => ({
    ...hospital(id, name, { location_status: 'VERIFIED', latitude: 14.8, longitude: 120.9 }),
    distanceMeters,
    distanceKind: 'STRAIGHT_LINE',
  });

  it('nearest verified first (server order, with distance), then the rest alphabetically, each once', () => {
    const list = buildDestinationList(
      [near('b', 'Joni Villanueva', 900), near('a', 'Bulacan Medical Center', 14_000)],
      [hospital('c', 'Zeta Clinic Hospital'), hospital('b', 'Joni Villanueva'), hospital('d', 'Bocaue General')],
    );
    expect(list.map((h) => [h.id, h.distanceMeters])).toEqual([
      ['b', 900], ['a', 14_000], ['d', null], ['c', null],
    ]);
  });

  it('without a fix (or nearby failed) → every selectable hospital alphabetically', () => {
    expect(buildDestinationList(null, [hospital('2', 'B'), hospital('1', 'A')]).map((h) => h.id)).toEqual(['1', '2']);
  });

  it('defensively drops PENDING_REVIEW and REJECTED', () => {
    const list = buildDestinationList([], [
      hospital('1', 'A', { location_status: 'PENDING_REVIEW' }),
      hospital('2', 'B', { location_status: 'REJECTED' }),
      hospital('3', 'C'),
    ]);
    expect(list.map((h) => h.id)).toEqual(['3']);
  });
});

describe('isRouteLastKnown (120 s rule)', () => {
  const route = (calculatedAt: string, stale = false): RouteSnapshot => ({
    geometry: [[120.92, 14.79], [120.94, 14.8]], distanceMeters: 3000, durationSeconds: 400,
    isEstimate: true, calculatedAt, stale,
  });
  const now = Date.parse('2026-10-29T01:05:00Z');

  it('fresh route → false; stale flag → true; older than 120 s → true', () => {
    expect(isRouteLastKnown(route('2026-10-29T01:04:30Z'), now)).toBe(false);
    expect(isRouteLastKnown(route('2026-10-29T01:04:30Z', true), now)).toBe(true);
    expect(isRouteLastKnown(route('2026-10-29T01:02:59Z'), now)).toBe(true);
    expect(isRouteLastKnown(null, now)).toBe(false);
  });
});

describe('map bounds', () => {
  it('stays on the Bocaue clamp inside Bocaue, widens for a hospital outside it', () => {
    expect(needsServiceAreaBounds([SCENE, JONI])).toBe(false);
    expect(needsServiceAreaBounds([SCENE, MALOLOS])).toBe(true);
  });

  it('the service-area bounds contain Bocaue and Malolos', () => {
    const [west, south, east, north] = SERVICE_AREA_BOUNDS;
    for (const p of [SCENE, MALOLOS]) {
      expect(p.lng).toBeGreaterThan(west);
      expect(p.lng).toBeLessThan(east);
      expect(p.lat).toBeGreaterThan(south);
      expect(p.lat).toBeLessThan(north);
    }
  });
});

describe('formatters', () => {
  it('formats distance and duration for the ETA chip', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(3160)).toBe('3.2 km');
    expect(formatDuration(426)).toBe('7 min');
    expect(formatDuration(3900)).toBe('1 hr 5 min');
    expect(formatDistance(null)).toBe('—');
  });
});

describe('isDestinationDeactivated (plan §12, Prompt 14)', () => {
  const FETCHED_AT = 1_000_000;
  const active = { is_active: true };
  const inactive = { is_active: false };
  const deactivatedNotice = (receivedAt: number) => ({ warning: 'FACILITY_DEACTIVATED' as const, receivedAt });

  it('shows from the transport list after a reload (facilities.is_active === false)', () => {
    expect(isDestinationDeactivated({ transporting: true, facility: inactive, notice: null, transportsFetchedAt: FETCHED_AT })).toBe(true);
  });

  it('shows from a transport_updated FACILITY_DEACTIVATED newer than the last fetch (refetch failed)', () => {
    expect(isDestinationDeactivated({
      transporting: true, facility: active, notice: deactivatedNotice(FETCHED_AT + 500), transportsFetchedAt: FETCHED_AT,
    })).toBe(true);
  });

  it('a newer fetch wins over an older event (the hospital was reactivated)', () => {
    expect(isDestinationDeactivated({
      transporting: true, facility: active, notice: deactivatedNotice(FETCHED_AT - 500), transportsFetchedAt: FETCHED_AT,
    })).toBe(false);
  });

  it('clears when a later update carries no warning (the crew changed the destination)', () => {
    expect(isDestinationDeactivated({
      transporting: true, facility: active, notice: { warning: null, receivedAt: FETCHED_AT + 500 }, transportsFetchedAt: FETCHED_AT,
    })).toBe(false);
  });

  it('ignores other warnings and a missing is_active (older backend)', () => {
    expect(isDestinationDeactivated({
      transporting: true, facility: {}, notice: { warning: 'FACILITY_AT_CAPACITY', receivedAt: FETCHED_AT + 500 }, transportsFetchedAt: FETCHED_AT,
    })).toBe(false);
  });

  it('never shows without an open transport or a hospital', () => {
    expect(isDestinationDeactivated({ transporting: false, facility: inactive, notice: null, transportsFetchedAt: FETCHED_AT })).toBe(false);
    expect(isDestinationDeactivated({
      transporting: true, facility: null, notice: deactivatedNotice(FETCHED_AT + 500), transportsFetchedAt: FETCHED_AT,
    })).toBe(false);
  });
});
