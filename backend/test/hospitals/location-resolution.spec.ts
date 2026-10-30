import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HttpStatus } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '@agap/shared';
import { toGeocodeCandidate } from '../../src/locations/maps/providers/nominatim-geocoding.provider';
import type { GeocodeCandidate } from '../../src/locations/maps/interfaces';
import {
  decide,
  nameSimilarity,
  normalizeName,
  scoreHospitalCandidate,
} from '../../src/hospitals/location-resolution/candidate-scoring';
import {
  HospitalNameAssistService,
  deterministicNormalization,
  looksLikeCoordinate,
} from '../../src/hospitals/location-resolution/hospital-name-assist.service';
import { HospitalLocationResolverService } from '../../src/hospitals/location-resolution/hospital-location-resolver.service';
import { HospitalsController } from '../../src/hospitals/hospitals.controller';
import { ResolveLocationDto } from '../../src/hospitals/dto/resolve-location.dto';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

/** Recorded 2026-10-29: one real Nominatim /search for "Joni Villanueva General Hospital". */
const JONI_SEARCH = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'nominatim-search-joni-villanueva.json'), 'utf8'));
const JONI = toGeocodeCandidate(JONI_SEARCH[0]) as GeocodeCandidate;
/** The seeded reference hospital (prisma/seed/seed.ts) carries this OSM ref. */
const SEEDED_JONI_ID = '00000000-0000-0000-0002-000000000006';
const INPUT = { name: 'Joni Villanueva General Hospital', municipality: 'Bocaue', province: 'Bulacan' };

/** Same hospital name as another OSM object `metres` north of it. */
function sameNameAt(metresNorth: number, osmId: number): GeocodeCandidate {
  return { ...JONI, sourceRef: `osm:node:${osmId}`, latitude: JONI.latitude + metresNorth / 111_320 };
}

function configWith(values: Record<string, string>) {
  return { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) };
}

/** The assist service with a key, its OpenAI call replaced by canned replies. */
function aiAssist(...replies: Array<string | Error>) {
  const service = new HospitalNameAssistService(configWith({ OPENAI_API_KEY: 'test-key' }) as any);
  const create = jest.fn();
  for (const reply of replies) {
    if (reply instanceof Error) create.mockRejectedValueOnce(reply);
    else create.mockResolvedValueOnce({ output_text: reply });
  }
  (service as any).client = { responses: { create } };
  return { service, create };
}

function makeResolver(assist: HospitalNameAssistService, search: jest.Mock) {
  const prisma = { facility: { findMany: jest.fn().mockResolvedValue([]) } };
  const resolver = new HospitalLocationResolverService(prisma as any, { search } as any, assist);
  return { resolver, prisma };
}

const noAi = () => new HospitalNameAssistService(configWith({}) as any);

describe('candidate scoring (plan §9.3)', () => {
  it('normalizes typed names without inventing anything', () => {
    expect(normalizeName("Dr. Yanga's Hospital, Inc.")).toBe("Dr. Yanga's Hospital");
    expect(normalizeName('DOH — Joni Villanueva General Hospital')).toBe('Joni Villanueva General Hospital');
    expect(normalizeName('Bulacan Med.  Ctr.')).toBe('Bulacan Medical Center');
    expect(normalizeName('St. Paul Hosp. Corp.')).toBe('St. Paul Hospital');
  });

  it('name similarity is 1 for the same name after normalization and low for another hospital', () => {
    expect(nameSimilarity('DOH — Joni Villanueva Gen. Hosp.', 'Joni Villanueva General Hospital')).toBe(1);
    expect(nameSimilarity('Bocaue General Hospital', 'Joni Villanueva General Hospital')).toBeLessThan(0.5);
    expect(nameSimilarity('', 'Joni')).toBe(0);
  });

  it('scores the recorded reference hospital 0.55·1 + 0.20·1 + 0.15·1 + 0.10·importance', () => {
    const scored = scoreHospitalCandidate(INPUT, JONI, true);
    expect(scored.parts).toEqual({ name: 1, category: 1, adminArea: 1, importance: JONI.importance });
    expect(scored.score).toBeCloseTo(0.55 + 0.2 + 0.15 + 0.1 * JONI.importance, 4);
    expect(scored.reasons).toEqual(['name 1.00', 'category hospital', 'municipality match', 'province match']);
  });

  it('defaults the province to Bulacan, counts a clinic as 0.5 and flags a wrong municipality', () => {
    const scored = scoreHospitalCandidate(
      { name: 'Joni Villanueva General Hospital', municipality: 'Malolos' },
      { ...JONI, category: 'amenity=clinic' },
      true,
    );
    expect(scored.parts.category).toBe(0.5);
    expect(scored.parts.adminArea).toBe(0.5);
    expect(scored.reasons).toEqual(['name 1.00', 'category clinic', 'municipality differs', 'province match']);
  });

  it('decide: AUTO_SELECTABLE only when every criterion holds', () => {
    const top = scoreHospitalCandidate(INPUT, JONI, true);
    expect(decide([top])).toBe('AUTO_SELECTABLE');
    expect(decide([])).toBe('NO_RESULTS');
    // The same hospital mapped twice (way + node 50 m apart) is not a rival.
    expect(decide([top, scoreHospitalCandidate(INPUT, sameNameAt(50, 1), true)])).toBe('AUTO_SELECTABLE');
    // A same-name place more than 150 m away is.
    expect(decide([top, scoreHospitalCandidate(INPUT, sameNameAt(1000, 2), true)])).toBe('NEEDS_CONFIRMATION');
    expect(decide([scoreHospitalCandidate(INPUT, { ...JONI, category: 'amenity=clinic' }, true)])).toBe('NEEDS_CONFIRMATION');
    expect(decide([scoreHospitalCandidate(INPUT, JONI, false)])).toBe('NEEDS_CONFIRMATION');
    expect(decide([scoreHospitalCandidate({ ...INPUT, name: 'Bocaue General Hospital' }, JONI, true)])).toBe(
      'NEEDS_CONFIRMATION',
    );
  });
});

describe('HospitalLocationResolverService (POST /hospitals/resolve-location)', () => {
  it('reference hospital → AUTO_SELECTABLE, preselected, flagged as already registered', async () => {
    const search = jest.fn().mockResolvedValue([JONI]);
    const { resolver, prisma } = makeResolver(noAi(), search);
    prisma.facility.findMany.mockResolvedValue([{ id: SEEDED_JONI_ID, location_source_ref: 'osm:way:1290448946' }]);

    const res = await resolver.resolve({ ...INPUT, name: 'DOH — Joni Villanueva General Hospital' });

    expect(res).toEqual({
      normalizedName: 'Joni Villanueva General Hospital',
      aiAssisted: false,
      result: 'AUTO_SELECTABLE',
      selectedCandidateId: 'c1',
      candidates: [
        {
          candidateId: 'c1',
          name: 'Joni Villanueva General Hospital',
          address: JONI.displayName,
          municipality: 'Bocaue',
          province: 'Bulacan',
          latitude: 14.7968505,
          longitude: 120.9435893,
          source: 'nominatim',
          sourceRef: 'osm:way:1290448946',
          category: 'amenity=hospital',
          score: 0.93,
          reasons: ['name 1.00', 'category hospital', 'municipality match', 'province match'],
          alreadyRegistered: SEEDED_JONI_ID,
        },
      ],
    });
    expect(prisma.facility.findMany).toHaveBeenCalledWith({
      where: { location_source_ref: { in: ['osm:way:1290448946'] } },
      select: { id: true, location_source_ref: true },
    });
  });

  it('searches each deterministic query inside the service area and merges results by sourceRef', async () => {
    const search = jest.fn().mockResolvedValue([JONI]);
    const { resolver } = makeResolver(noAi(), search);
    const res = await resolver.resolve(INPUT);

    expect(search.mock.calls.map(([q]) => q.text)).toEqual([
      'Joni Villanueva General Hospital, Bocaue',
      'Joni Villanueva General Hospital',
    ]);
    expect(search.mock.calls[0]![0]).toMatchObject({ countryCodes: 'ph', bounded: true, limit: 5 });
    expect(res.candidates).toHaveLength(1);
  });

  it('two same-name candidates more than 150 m apart → NEEDS_CONFIRMATION, nothing preselected', async () => {
    const search = jest.fn().mockResolvedValue([JONI, sameNameAt(1000, 2)]);
    const { resolver } = makeResolver(noAi(), search);
    const res = await resolver.resolve(INPUT);

    expect(res.result).toBe('NEEDS_CONFIRMATION');
    expect(res.selectedCandidateId).toBeNull();
    expect(res.candidates.map((c) => c.alreadyRegistered)).toEqual([null, null]);
  });

  it('drops candidates outside the service area (Manila) → NO_RESULTS', async () => {
    const search = jest.fn().mockResolvedValue([{ ...JONI, latitude: 14.5995, longitude: 120.9842 }]);
    const { resolver } = makeResolver(noAi(), search);
    await expect(resolver.resolve(INPUT)).resolves.toMatchObject({ result: 'NO_RESULTS', candidates: [] });
  });

  it('empty provider answer → NO_RESULTS', async () => {
    const { resolver, prisma } = makeResolver(noAi(), jest.fn().mockResolvedValue([]));
    await expect(resolver.resolve(INPUT)).resolves.toEqual({
      normalizedName: 'Joni Villanueva General Hospital',
      aiAssisted: false,
      result: 'NO_RESULTS',
      candidates: [],
      selectedCandidateId: null,
    });
    expect(prisma.facility.findMany).not.toHaveBeenCalled();
  });

  it('provider down on every query → PROVIDER_UNAVAILABLE (a 200, never a 503)', async () => {
    const { resolver } = makeResolver(noAi(), jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(resolver.resolve(INPUT)).resolves.toEqual({
      normalizedName: 'Joni Villanueva General Hospital',
      aiAssisted: false,
      result: 'PROVIDER_UNAVAILABLE',
      candidates: [],
      selectedCandidateId: null,
    });
  });

  it('one query failing is not an outage: the others still count', async () => {
    const search = jest.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce([JONI]);
    const { resolver } = makeResolver(noAi(), search);
    await expect(resolver.resolve(INPUT)).resolves.toMatchObject({ result: 'AUTO_SELECTABLE' });
  });

  it('key unset → deterministic path, no AI call, aiAssisted false', async () => {
    const assist = noAi();
    expect(assist.enabled).toBe(false);
    await expect(assist.normalize(INPUT)).resolves.toEqual(deterministicNormalization(INPUT));
    await expect(assist.tieBreak(INPUT, [
      { candidateId: 'c1', name: 'A', displayName: 'A', category: 'amenity=hospital' },
      { candidateId: 'c2', name: 'B', displayName: 'B', category: 'amenity=hospital' },
    ])).resolves.toEqual({ candidateId: null, rationale: null, aiAssisted: false });
  });
});

describe('AI name assist never supplies coordinates', () => {
  it('detects coordinate-like text', () => {
    expect(looksLikeCoordinate('14.79685, 120.94358')).toBe(true);
    expect(looksLikeCoordinate('near lat 14')).toBe(true);
    expect(looksLikeCoordinate('Joni Villanueva General Hospital')).toBe(false);
    expect(looksLikeCoordinate('Hospital 2, Km. 25')).toBe(false);
  });

  it('drops coordinate-looking queries and extra keys; keeps the deterministic query', async () => {
    const { service } = aiAssist(
      JSON.stringify({
        normalizedName: 'Joni Villanueva General Hospital',
        queries: ['Joni Villanueva Hospital lat 14.7968', '14.79685, 120.94358', 'Joni Villanueva Hospital Bocaue'],
        latitude: 14.79685,
        longitude: 120.94358,
      }),
    );
    const out = await service.normalize(INPUT);
    expect(out).toEqual({
      normalizedName: 'Joni Villanueva General Hospital',
      queries: ['Joni Villanueva Hospital Bocaue', 'Joni Villanueva General Hospital, Bocaue', 'Joni Villanueva General Hospital'],
      aiAssisted: true,
    });
  });

  it('a coordinate as the name, invalid JSON, or an error → deterministic fallback', async () => {
    const fallback = deterministicNormalization(INPUT);
    for (const reply of [
      JSON.stringify({ normalizedName: '14.79685, 120.94358', queries: [] }),
      'not json',
      JSON.stringify({ queries: 'x' }),
      new Error('429'),
    ]) {
      const { service } = aiAssist(reply);
      await expect(service.normalize(INPUT)).resolves.toEqual(fallback);
    }
  });

  it('sends only typed data and never candidate coordinates', async () => {
    const { service, create } = aiAssist('{}', '{"candidateId": null}');
    await service.normalize({ ...INPUT, address: 'NLEX, Igulot' });
    await service.tieBreak(INPUT, [
      { candidateId: 'c1', name: 'A', displayName: 'A, Bocaue', category: 'amenity=hospital' },
      { candidateId: 'c2', name: 'B', displayName: 'B, Bocaue', category: 'amenity=hospital' },
    ]);
    const prompts = create.mock.calls.map(([req]) => req.input as string).join('\n');
    expect(prompts).toContain('NLEX, Igulot');
    expect(prompts).not.toMatch(/latitude|longitude|14\.79|120\.94/);
  });

  it('tie-break: an unknown id is ignored; a coordinate rationale is dropped but the pick stays', async () => {
    const options = [
      { candidateId: 'c1', name: 'A', displayName: 'A', category: 'amenity=hospital' },
      { candidateId: 'c2', name: 'B', displayName: 'B', category: 'amenity=hospital' },
    ];
    const unknown = aiAssist('{"candidateId": "c9", "rationale": "x"}').service;
    await expect(unknown.tieBreak(INPUT, options)).resolves.toEqual({ candidateId: null, rationale: null, aiAssisted: false });

    const coords = aiAssist('{"candidateId": "c2", "rationale": "It is at 14.79685, 120.94358"}').service;
    await expect(coords.tieBreak(INPUT, options)).resolves.toEqual({ candidateId: 'c2', rationale: null, aiAssisted: true });
  });

  it('the resolver lets the AI reorder near-ties only: scores, coordinates and the result are unchanged', async () => {
    const far = sameNameAt(1000, 2);
    const search = jest.fn().mockResolvedValue([JONI, far]);
    const { service, create } = aiAssist(
      JSON.stringify({ normalizedName: 'Joni Villanueva General Hospital', queries: [] }),
      JSON.stringify({ candidateId: 'c2', rationale: 'The second result is on NLEX.', latitude: 1 }),
    );
    const { resolver } = makeResolver(service, search);
    const res = await resolver.resolve(INPUT);

    expect(create).toHaveBeenCalledTimes(2);
    expect(res.result).toBe('NEEDS_CONFIRMATION');
    expect(res.selectedCandidateId).toBeNull();
    expect(res.aiAssisted).toBe(true);
    expect(res.candidates.map((c) => c.candidateId)).toEqual(['c2', 'c1']);
    expect(res.candidates[0]).toMatchObject({ sourceRef: far.sourceRef, latitude: far.latitude, longitude: far.longitude, score: 0.93 });
    expect(res.candidates[0]!.reasons).toContain('AI suggested: The second result is on NLEX.');
  });

  it('no tie-break call for an AUTO_SELECTABLE result', async () => {
    const { service, create } = aiAssist(JSON.stringify({ normalizedName: 'Joni Villanueva General Hospital', queries: [] }));
    const { resolver } = makeResolver(service, jest.fn().mockResolvedValue([JONI]));
    await expect(resolver.resolve(INPUT)).resolves.toMatchObject({ result: 'AUTO_SELECTABLE', aiAssisted: true });
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('resolve-location endpoint', () => {
  const handler = HospitalsController.prototype.resolveLocation;

  it('is for System Administrator, Org Administrator and Supervisor, answers 200, throttled 10/min', () => {
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      UserRole.SYSTEM_ADMINISTRATOR,
      UserRole.ORG_ADMINISTRATOR,
      UserRole.SUPERVISOR,
    ]);
    expect(Reflect.getMetadata('__httpCode__', handler)).toBe(HttpStatus.OK);
    expect(Reflect.getMetadata('THROTTLER:LIMITsustained', handler)).toBe(10);
    expect(Reflect.getMetadata('THROTTLER:TTLsustained', handler)).toBe(60_000);
  });

  it('validates the body: name 2–255, optional address/municipality/province', async () => {
    const errors = async (body: object) =>
      (await validate(plainToInstance(ResolveLocationDto, body))).map((e) => e.property);
    expect(await errors({ name: 'Joni Villanueva General Hospital', municipality: 'Bocaue' })).toEqual([]);
    expect(await errors({ name: 'J' })).toEqual(['name']);
    expect(await errors({ name: 'x'.repeat(256) })).toEqual(['name']);
    expect(await errors({ name: 'Joni', province: 'x'.repeat(101) })).toEqual(['province']);
  });
});
