import { BadRequestException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { UserRole } from '@agap/shared';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { RiskIntelligenceController } from '../../src/risk-intelligence/risk-intelligence.controller';
import { RiskIntelligenceService } from '../../src/risk-intelligence/risk-intelligence.service';
import { AreaSuggestionQuery, CreateRiskAreaDto, UpdateRiskAreaDto } from '../../src/risk-intelligence/dto/risk-area.dto';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

// MOD-51 risk-area management (MODULE_GAPS_COMPLETION_PLAN.md Phase 5; pins 2026-11-15).

const SUPERVISOR_ID = 'user-supervisor';
const AREA_ID = '6f1d1c1e-2b7a-4a43-9a3c-1d2a3b4c5d6e';
/** Inside Bocaue (Antipona, by the real barangay polygons). */
const PIN = { latitude: 14.7963, longitude: 120.9272, radiusMeters: 300 };

// Same options as main.ts, so these are the rules a real request meets.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validate = (dto: object, metatype: new () => object, type: 'body' | 'query' = 'body') =>
  pipe.transform(dto, { type, metatype });

const validArea = {
  name: 'Lolomboy riverside',
  riskType: 'FLOOD',
  riskLevel: 'HIGH',
  floodThresholdMeters: 11.5,
  ...PIN,
};

function areaRow(over: Record<string, unknown> = {}) {
  return {
    id: AREA_ID,
    name: 'Lolomboy riverside',
    description: null,
    risk_type: 'FLOOD',
    risk_level: 'HIGH',
    barangay: 'Lolomboy',
    flood_threshold_meters: '11.50', // Prisma Decimal
    pin_latitude: null,
    pin_longitude: null,
    radius_meters: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...over,
  };
}

/** The tagged-template SQL and its bound values from a raw-query mock call. */
const sqlOf = (call: any[]) => ({ text: (call[0] as string[]).join('?'), values: call.slice(1) });

function makeService(opts: { area?: Record<string, unknown> | null; barangayAtPin?: string | null } = {}) {
  const prisma: any = {
    risk_areas: {
      create: jest.fn(async ({ data }: any) => areaRow({ ...data, flood_threshold_meters: data.flood_threshold_meters })),
      findUnique: jest.fn().mockResolvedValue(opts.area === undefined ? areaRow() : opts.area),
      update: jest.fn(async ({ data }: any) => areaRow(data)),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    geo_regions: {
      findFirst: jest.fn(async ({ where }: any) =>
        ['lolomboy', 'bunlo', 'tambubong'].includes(String(where.name.equals).toLowerCase())
          ? { name: String(where.name.equals).replace(/^\w/, (c) => c.toUpperCase()) }
          : null,
      ),
    },
    // barangayAt(): the polygon under the pin.
    $queryRaw: jest.fn().mockResolvedValue(
      opts.barangayAtPin === null ? [] : [{ name: opts.barangayAtPin ?? 'Lolomboy' }],
    ),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  prisma.$transaction = jest.fn(async (fn: (tx: any) => unknown) => fn(prisma));
  const audit = { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const service = new RiskIntelligenceService(prisma, audit as any);
  return { service, prisma, audit };
}

// ─── Validation ──────────────────────────────────────────────────────────────

describe('risk area DTOs', () => {
  it('accept a pinned FLOOD area at 11.50 m', async () => {
    await expect(validate(validArea, CreateRiskAreaDto)).resolves.toMatchObject(validArea);
  });

  it('reject an unknown risk level', async () => {
    await expect(validate({ ...validArea, riskLevel: 'EXTREME' }, CreateRiskAreaDto)).rejects.toThrow(BadRequestException);
  });

  it('reject a negative or out-of-range threshold', async () => {
    await expect(validate({ ...validArea, floodThresholdMeters: -1 }, CreateRiskAreaDto)).rejects.toThrow(BadRequestException);
    await expect(validate({ ...validArea, floodThresholdMeters: 31 }, CreateRiskAreaDto)).rejects.toThrow(BadRequestException);
  });

  it.each([49, 2001, 120.5])('reject a radius of %p m', async (radiusMeters) => {
    await expect(validate({ ...validArea, radiusMeters }, CreateRiskAreaDto)).rejects.toThrow(BadRequestException);
  });

  it('reject an unknown incident category and unknown fields', async () => {
    await expect(validate({ ...validArea, riskType: 'TSUNAMI' }, CreateRiskAreaDto)).rejects.toThrow(BadRequestException);
    await expect(validate({ ...validArea, area_boundary: 'POLYGON(...)' }, CreateRiskAreaDto)).rejects.toThrow(BadRequestException);
  });

  it('allow a partial update with isActive only', async () => {
    await expect(validate({ isActive: false }, UpdateRiskAreaDto)).resolves.toMatchObject({ isActive: false });
    await expect(validate({ riskLevel: 'LOW' }, UpdateRiskAreaDto)).resolves.toMatchObject({ riskLevel: 'LOW' });
  });

  it('turn the suggestion query strings into numbers', async () => {
    await expect(
      validate({ lat: '14.7963', lng: '120.9272', radius: '300', riskType: 'FIRE' }, AreaSuggestionQuery, 'query'),
    ).resolves.toMatchObject({ lat: 14.7963, lng: 120.9272, radius: 300, riskType: 'FIRE' });
    await expect(
      validate({ lat: '14.7963', lng: '120.9272', radius: '10', riskType: 'FIRE' }, AreaSuggestionQuery, 'query'),
    ).rejects.toThrow(BadRequestException);
  });
});

// ─── Access ──────────────────────────────────────────────────────────────────

describe('RiskIntelligenceController access', () => {
  const roles = (name: keyof RiskIntelligenceController) =>
    Reflect.getMetadata(ROLES_KEY, RiskIntelligenceController.prototype[name]);

  it('lets only the Supervisor create, update, delete, get suggestions and run or read the check', () => {
    for (const name of ['createArea', 'updateArea', 'deleteArea', 'suggest', 'checkNow', 'proposalStatus'] as const) {
      expect(roles(name)).toEqual([UserRole.SUPERVISOR]);
    }
  });

  it('lets Dispatchers, Supervisors and the System Administrator (support) read the area list', () => {
    expect(roles('areas')).toEqual([UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR]);
  });

  it('opens the Risk Map data to Dispatchers and Supervisors, not the System Administrator (Phase 5b)', () => {
    expect(roles('map')).toEqual([UserRole.DISPATCHER, UserRole.SUPERVISOR]);
  });

  it('limits how often "Check now" can run', () => {
    const limit = (name: string) => Reflect.getMetadata(`${THROTTLER_LIMIT}${name}`, RiskIntelligenceController.prototype.checkNow);
    expect(limit('burst')).toBe(2);
    expect(limit('sustained')).toBe(10);
  });
});

// ─── Service ─────────────────────────────────────────────────────────────────

describe('RiskIntelligenceService risk areas', () => {
  it('creates a pinned area: barangay from the pin, circle boundary and audit in one transaction', async () => {
    const { service, prisma, audit } = makeService({ barangayAtPin: 'Lolomboy' });
    await service.createArea(validArea as CreateRiskAreaDto, SUPERVISOR_ID);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.risk_areas.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        risk_type: 'FLOOD',
        risk_level: 'HIGH',
        barangay: 'Lolomboy',
        flood_threshold_meters: 11.5,
        pin_latitude: 14.7963,
        pin_longitude: 120.9272,
        radius_meters: 300,
      }),
    });
    const circle = sqlOf(prisma.$executeRaw.mock.calls[0]);
    expect(circle.text).toContain('SET area_boundary = ST_Buffer(ST_SetSRID(ST_MakePoint(');
    expect(circle.values).toEqual([120.9272, 14.7963, 300, AREA_ID]);
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: 'CREATE',
        actorId: SUPERVISOR_ID,
        entityType: 'risk_area',
        moduleId: 'MOD-51',
        newValues: expect.objectContaining({ pin: { lat: 14.7963, lng: 120.9272, radiusMeters: 300 } }),
      }),
    );
  });

  it('ignores a typed barangay when there is a pin, and stores null at the edge of every barangay', async () => {
    const { service, prisma } = makeService({ barangayAtPin: null });
    await service.createArea({ ...validArea, barangay: 'Bunlo' } as CreateRiskAreaDto, SUPERVISOR_ID);
    expect(prisma.risk_areas.create.mock.calls[0][0].data.barangay).toBeNull();
  });

  it('refuses a new area without a pin, a partial pin, and a pin outside Bocaue', async () => {
    const { service, prisma } = makeService();
    const { latitude: _lat, longitude: _lng, radiusMeters: _r, ...noPin } = validArea;
    await expect(service.createArea(noPin as CreateRiskAreaDto, SUPERVISOR_ID)).rejects.toThrow(/Drop a pin/);
    await expect(
      service.createArea({ ...noPin, latitude: 14.7963 } as CreateRiskAreaDto, SUPERVISOR_ID),
    ).rejects.toThrow(/latitude, a longitude and a radius/);
    await expect(
      service.createArea({ ...validArea, latitude: 14.5995, longitude: 120.9842 } as CreateRiskAreaDto, SUPERVISOR_ID),
    ).rejects.toThrow(/inside Bocaue/);
    expect(prisma.risk_areas.create).not.toHaveBeenCalled();
  });

  it('an approved proposal creates its area without a pin, by barangay (official spelling)', async () => {
    const { service, prisma } = makeService();
    const { latitude: _lat, longitude: _lng, radiusMeters: _r, ...noPin } = validArea;
    await expect(
      service.createArea({ ...noPin, barangay: 'Malolos' } as CreateRiskAreaDto, SUPERVISOR_ID, { requirePin: false }),
    ).rejects.toThrow(/not a Bocaue barangay/);
    await service.createArea({ ...noPin, barangay: 'tambubong' } as CreateRiskAreaDto, SUPERVISOR_ID, { requirePin: false });
    expect(prisma.risk_areas.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ barangay: 'Tambubong' }) });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('updates the level, deactivates, stamps updated_at and audits old and new values', async () => {
    const { service, prisma, audit } = makeService();
    await service.updateArea(AREA_ID, { riskLevel: 'CRITICAL', isActive: false }, SUPERVISOR_ID);
    expect(prisma.risk_areas.update).toHaveBeenCalledWith({
      where: { id: AREA_ID },
      data: expect.objectContaining({ risk_level: 'CRITICAL', is_active: false, updated_at: expect.any(Date) }),
    });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(audit.logInTransaction).toHaveBeenCalledWith(prisma, expect.objectContaining({
      action: 'UPDATE',
      oldValues: expect.objectContaining({ riskLevel: 'HIGH', isActive: true, floodThresholdMeters: 11.5 }),
      newValues: expect.objectContaining({ riskLevel: 'CRITICAL', isActive: false }),
    }));
  });

  it('moving the pin moves the barangay and redraws the circle', async () => {
    const { service, prisma } = makeService({ barangayAtPin: 'Bunlo' });
    await service.updateArea(AREA_ID, { latitude: 14.7963, longitude: 120.9272, radiusMeters: 500 }, SUPERVISOR_ID);
    expect(prisma.risk_areas.update.mock.calls[0][0].data).toMatchObject({ barangay: 'Bunlo', radius_meters: 500 });
    expect(sqlOf(prisma.$executeRaw.mock.calls[0]).values).toEqual([120.9272, 14.7963, 500, AREA_ID]);
  });

  it('clears the barangay of an area without a pin when sent empty; a pinned area keeps its own', async () => {
    const legacy = makeService();
    await legacy.service.updateArea(AREA_ID, { barangay: '' }, SUPERVISOR_ID);
    expect(legacy.prisma.risk_areas.update.mock.calls[0][0].data.barangay).toBeNull();

    const pinned = makeService({ area: areaRow({ pin_latitude: '14.7963000', pin_longitude: '120.9272000', radius_meters: 300 }) });
    await pinned.service.updateArea(AREA_ID, { barangay: 'Bunlo' }, SUPERVISOR_ID);
    expect(pinned.prisma.risk_areas.update.mock.calls[0][0].data).not.toHaveProperty('barangay');
  });

  it('deletes an area and keeps what was deleted in the audit row', async () => {
    const { service, prisma, audit } = makeService();
    await service.deleteArea(AREA_ID, SUPERVISOR_ID);
    expect(prisma.risk_areas.delete).toHaveBeenCalledWith({ where: { id: AREA_ID } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DELETE', entityId: AREA_ID, oldValues: expect.objectContaining({ name: 'Lolomboy riverside' }),
    }));
  });

  it('404s on a missing area without writing anything', async () => {
    const { service, prisma, audit } = makeService({ area: null });
    await expect(service.updateArea(AREA_ID, { riskLevel: 'LOW' }, SUPERVISOR_ID)).rejects.toThrow(NotFoundException);
    await expect(service.deleteArea(AREA_ID, SUPERVISOR_ID)).rejects.toThrow(NotFoundException);
    expect(prisma.risk_areas.update).not.toHaveBeenCalled();
    expect(prisma.risk_areas.delete).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });
});

describe('RiskIntelligenceService.suggest (smart add form)', () => {
  it('returns the barangay under the pin, counts by type within the radius, and a suggested level and name', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ name: 'Lolomboy' }])
      .mockResolvedValueOnce([
        { category: 'ROAD_ACCIDENT', count: 7 },
        { category: 'FIRE', count: 1 },
      ]);
    const res = await service.suggest({ lat: 14.7963, lng: 120.9272, radius: 300, riskType: 'ROAD_ACCIDENT' });

    expect(res).toEqual({
      insideBocaue: true,
      barangay: 'Lolomboy',
      windowDays: 90,
      incidentsByType: [
        { category: 'ROAD_ACCIDENT', count: 7 },
        { category: 'FIRE', count: 1 },
      ],
      sameTypeIncidents: 7,
      suggestedLevel: 'HIGH',
      suggestedName: 'Lolomboy road accident area',
    });
    const { text, values } = sqlOf(prisma.$queryRaw.mock.calls[1]);
    expect(text).toContain('ST_DWithin(il.point');
    expect(values).toEqual(expect.arrayContaining([120.9272, 14.7963, 300]));
    // Counts only: the query selects a type and a count, never an incident, reporter or patient.
    expect(text).toMatch(/SELECT i\.category::text AS category, count\(\*\)::int AS count\s+FROM incidents i/);
    expect(text).not.toMatch(/reporter|patient/);
  });

  it('says when the pin is outside Bocaue and suggests LOW with no incidents', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(service.suggest({ lat: 14.5995, lng: 120.9842, radius: 300, riskType: 'FIRE' })).resolves.toMatchObject({
      insideBocaue: false,
      barangay: null,
      sameTypeIncidents: 0,
      suggestedLevel: 'LOW',
      suggestedName: 'Bocaue fire area',
    });
  });
});
