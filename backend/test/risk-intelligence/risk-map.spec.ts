import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RiskIntelligenceController } from '../../src/risk-intelligence/risk-intelligence.controller';
import {
  RISK_MAP_MAX_POINTS,
  RiskIntelligenceService,
} from '../../src/risk-intelligence/risk-intelligence.service';
import { RiskMapQuery } from '../../src/risk-intelligence/dto/risk-map.dto';

// MOD-51 Risk Map: floods per barangay, every other incident at its own spot.

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validateQuery = (q: object) => pipe.transform(q, { type: 'query', metatype: RiskMapQuery });

/** The tagged-template SQL and its bound values from a $queryRaw mock call. */
const sqlOf = (call: any[]) => ({ text: (call[0] as string[]).join('?'), values: call.slice(1) });

const LOLOMBOY = {
  name: 'Lolomboy',
  boundary: { type: 'Polygon', coordinates: [[[120.93, 14.77], [120.94, 14.77], [120.94, 14.78], [120.93, 14.77]]] },
  flood_incidents: 3,
};

function point(over: Record<string, unknown> = {}) {
  return {
    category: 'FIRE',
    lat: 14.7865,
    lng: 120.9454,
    incident_count: 2,
    last_reported_at: new Date('2026-11-10T08:00:00Z'),
    barangay: 'Bundukan',
    ...over,
  };
}

function makeService(opts: { barangays?: unknown[]; points?: unknown[]; areas?: unknown[]; outlines?: unknown[] } = {}) {
  const prisma = {
    // getRiskMap: barangays first, points second. findAreas: outlines.
    $queryRaw: jest.fn(),
    risk_areas: { findMany: jest.fn().mockResolvedValue(opts.areas ?? []) },
  };
  const audit = { log: jest.fn() };
  const service = new RiskIntelligenceService(prisma as any, audit as any);
  return { service, prisma };
}

describe('RiskMapQuery', () => {
  it('accepts 30, 90 and 365 days from the query string', async () => {
    for (const days of ['30', '90', '365']) {
      await expect(validateQuery({ periodDays: days })).resolves.toMatchObject({ periodDays: Number(days) });
    }
  });

  it('leaves the period out when not sent (the controller uses 90)', async () => {
    await expect(validateQuery({})).resolves.toEqual({});
  });

  it('rejects any other period', async () => {
    await expect(validateQuery({ periodDays: '7' })).rejects.toThrow(BadRequestException);
    await expect(validateQuery({ periodDays: 'all' })).rejects.toThrow(BadRequestException);
  });
});

describe('RiskIntelligenceController.map', () => {
  it('defaults to 90 days', async () => {
    const service = { getRiskMap: jest.fn().mockResolvedValue({}) };
    const controller = new RiskIntelligenceController(service as any, {} as any);
    await controller.map({});
    expect(service.getRiskMap).toHaveBeenCalledWith(90);
  });
});

describe('RiskIntelligenceService.getRiskMap', () => {
  it('counts floods per barangay boundary and returns the boundary as GeoJSON', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([LOLOMBOY]).mockResolvedValueOnce([]);

    const map = await service.getRiskMap(90);

    const { text, values } = sqlOf(prisma.$queryRaw.mock.calls[0]);
    expect(text).toContain("i.category = 'FLOOD'");
    expect(text).toContain('ST_Covers(r.boundary, f.g)');
    expect(text).toContain("r.region_type = 'barangay'");
    expect(text).toContain('ST_AsGeoJSON(r.boundary, 6)');
    expect(values).toContain(90);
    expect(map.barangays).toEqual([LOLOMBOY]);
  });

  it('places non-flood incidents at their spot, and keeps floods outside every barangay as points', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([point()]);

    const map = await service.getRiskMap(30);

    const { text, values } = sqlOf(prisma.$queryRaw.mock.calls[1]);
    expect(text).toContain("category <> 'FLOOD'");
    expect(text).toContain('OR NOT EXISTS');
    // ~11 m spots, per type
    expect(text).toContain('GROUP BY category, round(lat::numeric, 4), round(lng::numeric, 4)');
    expect(values).toContain(30);
    expect(map.points).toEqual([point()]);
    expect(map.period_days).toBe(30);
  });

  it('leaves out draft, false, duplicate and cancelled reports in both queries', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValue([]);

    await service.getRiskMap(90);

    for (const call of prisma.$queryRaw.mock.calls) {
      expect(sqlOf(call).text).toContain("i.status NOT IN ('DRAFT', 'FALSE_ALERT', 'DUPLICATE', 'CANCELLED')");
    }
  });

  it('never selects a reporter, patient or incident id', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValue([]);

    await service.getRiskMap(90);

    for (const call of prisma.$queryRaw.mock.calls) {
      const { text } = sqlOf(call);
      expect(text).not.toMatch(/reporter|patient|public_reference|i\.id\s*(,|AS)/i);
    }
  });

  it('says when the points were cut at the limit', async () => {
    const { service, prisma } = makeService();
    const many = Array.from({ length: RISK_MAP_MAX_POINTS + 1 }, () => point());
    prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce(many);

    const map = await service.getRiskMap(365);

    expect(sqlOf(prisma.$queryRaw.mock.calls[1]).values).toContain(RISK_MAP_MAX_POINTS + 1);
    expect(map.points).toHaveLength(RISK_MAP_MAX_POINTS);
    expect(map.points_truncated).toBe(true);
  });

  it('does not flag a full list that fits', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([point()]);

    expect((await service.getRiskMap(90)).points_truncated).toBe(false);
  });
});

describe('RiskIntelligenceService.findAreas', () => {
  const NOW = new Date('2026-11-15T04:00:00.000Z');
  const hull = { type: 'Polygon', coordinates: [[[120.94, 14.78], [120.95, 14.78], [120.95, 14.79], [120.94, 14.78]]] };
  const area = (over: Record<string, unknown>) => ({
    risk_type: 'FIRE',
    risk_level: 'LOW',
    is_active: true,
    pin_latitude: null,
    pin_longitude: null,
    radius_meters: null,
    created_at: new Date('2026-10-01T00:00:00.000Z'),
    ...over,
  });

  it('adds the shape, the drawn boundary, the pin, live counts and a review hint', async () => {
    const { service, prisma } = makeService({
      areas: [
        area({ id: 'a-1', name: 'Bundukan fireworks cluster', barangay: 'Bundukan', pin_latitude: '14.7963000', pin_longitude: '120.9272000', radius_meters: 300 }),
        area({ id: 'a-2', name: 'Lolomboy riverside', barangay: 'Lolomboy', risk_type: 'FLOOD', risk_level: 'HIGH' }),
        area({ id: 'a-3', name: 'Somewhere', barangay: null }),
      ],
    });
    prisma.$queryRaw.mockResolvedValueOnce([
      { id: 'a-1', shape: 'PIN', boundary: hull, incidents_90d: 7, incidents_prev_90d: 2, last_incident_at: new Date('2026-11-10T00:00:00Z') },
      { id: 'a-2', shape: 'BARANGAY', boundary: hull, incidents_90d: 1, incidents_prev_90d: 0, last_incident_at: null },
      { id: 'a-3', shape: 'NONE', boundary: null, incidents_90d: 0, incidents_prev_90d: 0, last_incident_at: null },
    ]);

    const [pinned, barangay, none] = await service.findAreas(NOW);

    const { text } = sqlOf(prisma.$queryRaw.mock.calls[0]);
    expect(text).toContain('COALESCE(ra.area_boundary::geometry, r.boundary)');
    expect(text).toContain('ST_Covers(a.geom, il.point::geometry)');
    expect(text).toContain('i.category = a.risk_type');
    expect(text).toContain("i.status NOT IN ('DRAFT', 'FALSE_ALERT', 'DUPLICATE', 'CANCELLED')");

    expect(pinned).toMatchObject({
      shape: 'PIN',
      boundary: hull,
      pin: { lat: 14.7963, lng: 120.9272, radius_m: 300 },
      stats: { incidents_90d: 7, incidents_prev_90d: 2 },
      hint: { kind: 'RAISE', suggestedLevel: 'HIGH', incidents: 7, windowDays: 90 },
    });
    expect(barangay).toMatchObject({ shape: 'BARANGAY', pin: null, hint: null });
    expect(none).toMatchObject({ shape: 'NONE', boundary: null, hint: null });
  });
});
