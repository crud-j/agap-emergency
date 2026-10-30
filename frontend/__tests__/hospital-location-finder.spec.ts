import type { ResolvedCandidate, ResolveLocationResponse } from '@/features/hospitals/api';
import {
  CANDIDATE_PIN_TOLERANCE_M,
  candidateRegistration,
  finderView,
  isPinOnCandidate,
  locationForSave,
  scorePercent,
} from '@/features/hospitals/location';

// "Find location" (Prompt 14, plan §9.2 step 6). The reference result is the real
// Nominatim answer for Joni Villanueva General Hospital (backend fixture).
const SEEDED_ID = '00000000-0000-0000-0002-000000000006';
const METERS_PER_DEGREE_LAT = 111_195;

function candidate(overrides: Partial<ResolvedCandidate> = {}): ResolvedCandidate {
  return {
    candidateId: 'c1',
    name: 'Joni Villanueva General Hospital',
    address: 'North Luzon Expressway, Igulot, Bocaue, Bulacan, 3018, Philippines',
    municipality: 'Bocaue',
    province: 'Bulacan',
    latitude: 14.7968505,
    longitude: 120.9435893,
    source: 'nominatim',
    sourceRef: 'osm:way:1290448946',
    category: 'amenity=hospital',
    score: 0.93,
    reasons: ['name 1.00', 'category hospital', 'municipality match', 'province match'],
    alreadyRegistered: null,
    ...overrides,
  };
}

function response(overrides: Partial<ResolveLocationResponse> = {}): ResolveLocationResponse {
  return {
    normalizedName: 'Joni Villanueva General Hospital',
    aiAssisted: false,
    result: 'AUTO_SELECTABLE',
    candidates: [candidate()],
    selectedCandidateId: 'c1',
    ...overrides,
  };
}

/** The candidate's point moved north by `meters`. */
function movedNorth(c: ResolvedCandidate, meters: number) {
  return { latitude: c.latitude + meters / METERS_PER_DEGREE_LAT, longitude: c.longitude };
}

describe('hospital "Find location" (MOD-39)', () => {
  describe('save rule: picked candidate vs manual pin', () => {
    const picked = candidate();

    it('saves a picked candidate as nominatim with its OSM ref and score', () => {
      expect(locationForSave({ latitude: picked.latitude, longitude: picked.longitude }, picked)).toEqual({
        latitude: 14.7968505,
        longitude: 120.9435893,
        source: 'nominatim',
        sourceRef: 'osm:way:1290448946',
        confidence: 0.93,
      });
    });

    it('keeps nominatim when the pin was nudged within 25 m (e.g. to the ER entrance)', () => {
      const point = movedNorth(picked, 20);
      expect(locationForSave(point, picked)).toEqual(expect.objectContaining({ ...point, source: 'nominatim' }));
      expect(isPinOnCandidate(movedNorth(picked, CANDIDATE_PIN_TOLERANCE_M - 0.5), picked)).toBe(true);
    });

    it('becomes manual once the pin is moved more than 25 m away', () => {
      const point = movedNorth(picked, 30);
      expect(isPinOnCandidate(movedNorth(picked, CANDIDATE_PIN_TOLERANCE_M + 0.5), picked)).toBe(false);
      expect(locationForSave(point, picked)).toEqual({ ...point, source: 'manual' });
    });

    it('is manual when nothing was picked (a dropped or typed pin)', () => {
      expect(locationForSave({ latitude: 14.79679, longitude: 120.94358 }, null)).toEqual({
        latitude: 14.79679, longitude: 120.94358, source: 'manual',
      });
    });
  });

  describe('result → UI state', () => {
    it('AUTO_SELECTABLE → BEST_MATCH with the top candidate to preselect', () => {
      const view = finderView(response());
      expect(view).toEqual(expect.objectContaining({ kind: 'BEST_MATCH' }));
      expect(view.kind === 'BEST_MATCH' && view.best.candidateId).toBe('c1');
    });

    it('NEEDS_CONFIRMATION → CHOOSE, nothing preselected', () => {
      const view = finderView(response({
        result: 'NEEDS_CONFIRMATION',
        selectedCandidateId: null,
        candidates: [candidate(), candidate({ candidateId: 'c2', latitude: 14.8058, score: 0.9 })],
      }));
      expect(view.kind).toBe('CHOOSE');
      expect(view).not.toHaveProperty('best');
      expect(view.kind === 'CHOOSE' && view.candidates.map((c) => c.candidateId)).toEqual(['c1', 'c2']);
    });

    it.each([
      ['NO_RESULTS', /No matching hospital/],
      ['PROVIDER_UNAVAILABLE', /unavailable/],
    ] as const)('%s → MANUAL with a message', (result, message) => {
      const view = finderView(response({ result, candidates: [], selectedCandidateId: null }));
      expect(view.kind).toBe('MANUAL');
      expect(view.kind === 'MANUAL' && view.message).toMatch(message);
      expect(view.kind === 'MANUAL' && view.message).toMatch(/Click the map/);
    });

    it('never preselects a best match already registered as another hospital', () => {
      const view = finderView(response({ candidates: [candidate({ alreadyRegistered: SEEDED_ID })] }), null);
      expect(view.kind).toBe('CHOOSE');
      expect(view.kind === 'CHOOSE' && view.note).toMatch(/already registered/);
    });

    it('still preselects it in "Set location" for that same hospital', () => {
      const view = finderView(response({ candidates: [candidate({ alreadyRegistered: SEEDED_ID })] }), SEEDED_ID);
      expect(view.kind).toBe('BEST_MATCH');
    });
  });

  describe('already registered', () => {
    const visible = [{ id: SEEDED_ID, name: 'DOH — Joni Villanueva General Hospital' }];

    it('NEW when no facility has the ref', () => {
      expect(candidateRegistration(candidate(), null, visible)).toEqual({ kind: 'NEW' });
    });

    it('THIS when the ref is the hospital being edited', () => {
      expect(candidateRegistration(candidate({ alreadyRegistered: SEEDED_ID }), SEEDED_ID, visible)).toEqual({ kind: 'THIS' });
    });

    it('OTHER with a name when this user can see that hospital', () => {
      expect(candidateRegistration(candidate({ alreadyRegistered: SEEDED_ID }), null, visible)).toEqual({
        kind: 'OTHER', id: SEEDED_ID, name: 'DOH — Joni Villanueva General Hospital',
      });
    });

    it('HIDDEN (no link, no 404) when it is not visible to this user', () => {
      expect(candidateRegistration(candidate({ alreadyRegistered: 'another-orgs-pending' }), null, visible))
        .toEqual({ kind: 'HIDDEN' });
    });
  });

  it('shows the score as a percentage', () => {
    expect(scorePercent(0.93)).toBe('93% match');
    expect(scorePercent(0.605)).toBe('61% match');
  });
});
