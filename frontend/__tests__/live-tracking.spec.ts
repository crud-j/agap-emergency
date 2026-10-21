import type { ResponderLocationUpdatedPayload } from '@agap/shared';
import {
  applyEtaUpdate,
  formatAge,
  formatEta,
  mergeResponderLocations,
  trackingPhase,
} from '@/features/map/live-tracking';
import { reporterLabel } from '@/components/map/CitizenMarker';
import type { LatestUnitPosition, LiveResponderPosition } from '@/features/map/api';

const seeded: LiveResponderPosition = {
  responderId: 'crew-1',
  responder_name: 'Ana Cruz',
  dispatchId: 'dispatch-A',
  incident_id: 'inc-1',
  incident_status: 'EN_ROUTE',
  resource_name: 'MDRRMO Ambulance 1',
  call_sign: 'ALPHA-1',
  resource_type: 'AMBULANCE',
  lat: 14.79,
  lng: 120.92,
  heading: 0,
  speed: 20,
  updated_at: '2026-10-18T00:00:00.000Z',
};

function loc(p: Partial<ResponderLocationUpdatedPayload>): ResponderLocationUpdatedPayload {
  return { responderId: 'crew-1', lat: 14.8, lng: 120.93, updatedAt: '2026-10-18T00:00:05.000Z', ...p };
}

describe('WP5 dispatch-dashboard live tracking', () => {
  describe('mergeResponderLocations (socket patch, G2)', () => {
    it('sets incident_id, dispatchId and call sign for a unit first seen over the socket, and asks for a re-seed', () => {
      const { next, sawUnknown } = mergeResponderLocations([], [
        loc({ incidentId: 'inc-9', dispatchId: 'dispatch-Z', callSign: 'BRAVO-1' }),
      ]);
      expect(sawUnknown).toBe(true);
      expect(next).toHaveLength(1);
      expect(next[0]).toMatchObject({
        incident_id: 'inc-9',
        dispatchId: 'dispatch-Z',
        call_sign: 'BRAVO-1',
        responder_name: null,
        lat: 14.8,
      });
    });

    it('updates the known unit in place and keeps the seeded name and unit details', () => {
      const { next, sawUnknown } = mergeResponderLocations([seeded], [
        loc({ incidentId: 'inc-1', dispatchId: 'dispatch-A', heading: 270 }),
      ]);
      expect(sawUnknown).toBe(false);
      expect(next).toHaveLength(1);
      expect(next[0]).toMatchObject({
        responder_name: 'Ana Cruz',
        resource_name: 'MDRRMO Ambulance 1',
        call_sign: 'ALPHA-1',
        heading: 270,
        lat: 14.8,
        updated_at: '2026-10-18T00:00:05.000Z',
      });
    });

    it('collapses a second crew phone onto the same unit marker', () => {
      const { next } = mergeResponderLocations([seeded], [
        loc({ responderId: 'crew-2', incidentId: 'inc-1', dispatchId: 'dispatch-A' }),
      ]);
      expect(next).toHaveLength(1);
      expect(next[0]!.responderId).toBe('crew-2');
    });

    it('stores a null heading/speed as null', () => {
      const { next } = mergeResponderLocations([seeded], [loc({ dispatchId: 'dispatch-A', heading: null, speed: null })]);
      expect(next[0]!.heading).toBeNull();
      expect(next[0]!.speed).toBeNull();
    });

    it('falls back to the responder id when an older backend omits dispatchId', () => {
      const { next, sawUnknown } = mergeResponderLocations([seeded], [loc({ responderId: 'crew-1' })]);
      expect(sawUnknown).toBe(false);
      expect(next).toHaveLength(1);
    });
  });

  describe('applyEtaUpdate', () => {
    const units: LatestUnitPosition[] = [
      {
        dispatchId: 'dispatch-A', callSign: 'ALPHA-1', unitName: null, resourceType: 'AMBULANCE',
        position: null, eta: { seconds: null, isEstimate: true, calculatedAt: null },
      },
      {
        dispatchId: 'dispatch-B', callSign: 'ALPHA-2', unitName: null, resourceType: 'AMBULANCE',
        position: null, eta: { seconds: 900, isEstimate: true, calculatedAt: 'x' },
      },
    ];

    it('updates only the matching unit (no cross-labelling between units)', () => {
      const next = applyEtaUpdate(units, {
        incidentId: 'inc-1', dispatchId: 'dispatch-A', etaSeconds: 240, isEstimate: true, calculatedAt: 'now',
      });
      expect(next![0]!.eta).toEqual({ seconds: 240, isEstimate: true, calculatedAt: 'now' });
      expect(next![1]!.eta.seconds).toBe(900);
    });

    it('leaves an unseeded cache alone', () => {
      expect(
        applyEtaUpdate(undefined, { incidentId: 'i', dispatchId: 'd', etaSeconds: 1, isEstimate: true, calculatedAt: 'n' }),
      ).toBeUndefined();
    });
  });

  describe('trackingPhase', () => {
    it.each([
      [[], 'none'],
      [[{ status: 'SENT' }], 'awaiting'],
      [[{ status: 'PENDING' }], 'awaiting'],
      [[{ status: 'SENT' }, { status: 'ACCEPTED' }], 'accepted'],
      [[{ status: 'REJECTED' }], 'closed'],
      [[{ status: 'COMPLETED' }, { status: 'CANCELLED' }], 'closed'],
    ] as const)('%j → %s', (dispatches, phase) => {
      expect(trackingPhase(dispatches)).toBe(phase);
    });

    it('treats missing dispatches as none', () => {
      expect(trackingPhase(undefined)).toBe('none');
    });
  });

  describe('wording', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');

    it('formats the last-update age', () => {
      expect(formatAge('2026-10-18T11:59:48Z', now)).toBe('12 s ago');
      expect(formatAge('2026-10-18T11:57:00Z', now)).toBe('3 min ago');
      expect(formatAge('2026-10-18T10:00:00Z', now)).toBe('2 h ago');
      expect(formatAge(null, now)).toBe('no update yet');
    });

    it('labels ETA as calculating when missing, never inventing a number', () => {
      expect(formatEta(null)).toBe('Calculating…');
      expect(formatEta(undefined)).toBe('Calculating…');
      expect(formatEta(30)).toBe('<1 min');
      expect(formatEta(300)).toBe('~5 min');
    });

    it('always says Reporter (never Patient) in the scene popup', () => {
      expect(reporterLabel('FEMALE', false)).toBe('Reporter: Female (registered)');
      expect(reporterLabel('MALE', false)).toBe('Reporter: Male (registered)');
      expect(reporterLabel(null, false)).toBe('Reporter (registered)');
      expect(reporterLabel(null, true)).toBe('Guest report');
      expect(reporterLabel(null, null)).toBe('Reporter');
      for (const label of [reporterLabel('FEMALE', false), reporterLabel(null, true)]) {
        expect(label).not.toMatch(/patient/i);
      }
    });
  });
});
