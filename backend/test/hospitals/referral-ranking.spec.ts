import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { NotFoundException, ValidationPipe, VersioningType, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserRole } from '@agap/shared';
import { needFor, scoreFacility, type RankableFacility } from '../../src/hospitals/referral-ranking';
import { HospitalsService } from '../../src/hospitals/hospitals.service';
import { HospitalsController } from '../../src/hospitals/hospitals.controller';
import { HospitalLocationResolverService } from '../../src/hospitals/location-resolution/hospital-location-resolver.service';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

/**
 * AUTOMATION_NEEDS_PLAN Phase 4, C6 (MOD-38): hospitals ranked for a referral with
 * reasons. A ranking only: the dispatcher picks. Facility data only.
 */

const NOW = new Date('2026-10-30T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);
const ER = { er: true, icu: false };
const ROUTINE = { er: false, icu: false };

function f(overrides: Partial<RankableFacility> = {}): RankableFacility {
  return {
    receiving_status: 'OPEN',
    receiving_status_updated_at: hoursAgo(1),
    has_emergency_room: true,
    has_icu: false,
    capacity_available: 5,
    ...overrides,
  };
}

describe('needFor', () => {
  it.each([
    [{ category: 'MEDICAL', priority: 'LOW' }, { er: true, icu: false }],
    [{ category: 'ROAD_ACCIDENT', priority: 'MEDIUM' }, { er: true, icu: false }],
    [{ category: 'FIRE', priority: 'LOW' }, { er: true, icu: false }],
    [{ category: 'INDUSTRIAL', priority: 'LOW' }, { er: true, icu: false }],
    [{ category: 'FLOOD', priority: 'HIGH' }, { er: true, icu: false }],
    [{ category: 'FLOOD', priority: 'CRITICAL' }, { er: true, icu: true }],
    [{ category: 'FLOOD', priority: 'MEDIUM' }, { er: false, icu: false }],
    [{ category: 'DEBRIS', priority: 'LOW' }, { er: false, icu: false }],
  ])('%o → %o', (incident, need) => {
    expect(needFor(incident)).toEqual(need);
  });
});

describe('scoreFacility', () => {
  it('an open, fresh hospital with an ER: distance is the only deduction, no reasons', () => {
    const r = scoreFacility(f(), ER, 2.5, NOW);
    expect(r).toEqual({
      score: 95, reasons: [], distanceLabel: '2.5 km (straight line)', effectiveStatus: 'OPEN', statusAgeHours: 1,
    });
  });

  it.each([
    ['CLOSED', 80, 'Closed to receiving'],
    ['AT_CAPACITY', 50, 'At capacity'],
    ['UNKNOWN', 10, 'Receiving status unknown'],
  ])('%s costs %i points with the reason "%s"', (status, penalty, reason) => {
    const r = scoreFacility(f({ receiving_status: status }), ER, 0, NOW);
    expect(r.score).toBe(100 - penalty);
    expect(r.reasons).toEqual([reason]);
  });

  it('EMERGENCY_ONLY: no penalty for an emergency referral, a penalty otherwise', () => {
    expect(scoreFacility(f({ receiving_status: 'EMERGENCY_ONLY' }), ER, 0, NOW)).toMatchObject({ score: 100, reasons: [] });
    expect(scoreFacility(f({ receiving_status: 'EMERGENCY_ONLY' }), ROUTINE, 0, NOW))
      .toMatchObject({ score: 80, reasons: ['Emergency patients only'] });
  });

  it('no ER counts only when the incident needs one', () => {
    expect(scoreFacility(f({ has_emergency_room: false }), ER, 0, NOW)).toMatchObject({ score: 60, reasons: ['No ER'] });
    expect(scoreFacility(f({ has_emergency_room: false }), ROUTINE, 0, NOW)).toMatchObject({ score: 100, reasons: [] });
  });

  it('an ICU is a bonus only when the incident needs one', () => {
    expect(scoreFacility(f({ has_icu: true }), { er: true, icu: true }, 0, NOW))
      .toMatchObject({ score: 115, reasons: ['Has ICU'] });
    expect(scoreFacility(f({ has_icu: true }), ER, 0, NOW)).toMatchObject({ score: 100, reasons: [] });
  });

  it('zero available beds costs 30; unreported beds cost nothing', () => {
    expect(scoreFacility(f({ capacity_available: 0 }), ER, 0, NOW)).toMatchObject({ score: 70, reasons: ['No beds available'] });
    expect(scoreFacility(f({ capacity_available: null }), ER, 0, NOW).score).toBe(100);
  });

  it('a status older than 12 h is scored as Unknown with its age; the stored value is not the effective one', () => {
    const r = scoreFacility(f({ receiving_status: 'OPEN', receiving_status_updated_at: hoursAgo(13) }), ER, 0, NOW);
    expect(r).toMatchObject({ score: 90, effectiveStatus: 'UNKNOWN', statusAgeHours: 13, reasons: ['Status last updated 13 h ago'] });
    // A stale CLOSED is no longer trusted either way: it reads as Unknown, not Closed.
    expect(scoreFacility(f({ receiving_status: 'CLOSED', receiving_status_updated_at: hoursAgo(20) }), ER, 0, NOW))
      .toMatchObject({ score: 90, effectiveStatus: 'UNKNOWN' });
  });

  it('a status 11 h old is still trusted', () => {
    expect(scoreFacility(f({ receiving_status_updated_at: hoursAgo(11) }), ER, 0, NOW))
      .toMatchObject({ effectiveStatus: 'OPEN', statusAgeHours: 11, reasons: [] });
  });

  it('a status never reported is Unknown', () => {
    expect(scoreFacility(f({ receiving_status_updated_at: null }), ER, 0, NOW))
      .toMatchObject({ effectiveStatus: 'UNKNOWN', statusAgeHours: null, reasons: ['Receiving status never reported'] });
  });

  it('an unknown distance scores as 15 km; distances past 30 km all score the same', () => {
    expect(scoreFacility(f(), ER, null, NOW)).toMatchObject({ score: 70, distanceLabel: 'Distance unknown' });
    expect(scoreFacility(f(), ER, 30, NOW).score).toBe(scoreFacility(f(), ER, 80, NOW).score);
  });
});

// ─── HospitalsService.recommendations ──────────────────────────────────────

// A v4 UUID, as incidents get (the query DTO uses @IsUUID like the transport DTOs).
const INCIDENT_ID = '3f2b8c1e-5d4a-4b7e-9c2f-1a6d8e0b4c55';
const DISPATCHER = { id: '00000000-0000-0000-0000-000000000004', role: UserRole.DISPATCHER };

function row(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id, name,
    receiving_status: 'OPEN',
    receiving_status_updated_at: hoursAgo(1),
    has_emergency_room: true,
    has_icu: false,
    capacity_available: 4,
    capacity_total: 20,
    latitude: new Prisma.Decimal('14.7990'),
    longitude: new Prisma.Decimal('120.9260'),
    location_status: 'VERIFIED',
    ...overrides,
  };
}

function buildService(incident: unknown, facilities: unknown[]) {
  const prisma: any = {
    incident: { findUnique: jest.fn().mockResolvedValue(incident) },
    facility: { findMany: jest.fn().mockResolvedValue(facilities) },
    organization_memberships: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { service: new HospitalsService(prisma, {} as any, {} as any, {} as any), prisma };
}

const MEDICAL_AT_BOCAUE = {
  category: 'MEDICAL',
  priority: 'HIGH',
  incident_locations: { latitude: new Prisma.Decimal('14.7990'), longitude: new Prisma.Decimal('120.9260') },
};

describe('HospitalsService.recommendations', () => {
  it('ranks the open hospital with an ER above a closed one and a full one, with reasons and a distance', async () => {
    const { service, prisma } = buildService(MEDICAL_AT_BOCAUE, [
      row('closed', 'A Closed', { receiving_status: 'CLOSED' }),
      row('open', 'B Open'),
      row('full', 'C Full', { receiving_status: 'AT_CAPACITY' }),
    ]);
    const ranked = await service.recommendations(INCIDENT_ID, DISPATCHER, NOW);

    expect(ranked.map((r) => r.id)).toEqual(['open', 'full', 'closed']);
    expect(ranked.map((r) => r.score)).toEqual([100, 50, 20]);
    expect(ranked[0]).toMatchObject({ reasons: [], distanceMeters: 0, distanceLabel: '0.0 km (straight line)', effectiveStatus: 'OPEN' });
    expect(ranked[2]!.reasons).toEqual(['Closed to receiving']);
    // Active hospitals that the dispatcher's own referral list shows; facility columns only.
    const query = prisma.facility.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({ facility_type: 'HOSPITAL', is_active: true, location_status: { notIn: ['PENDING_REVIEW', 'REJECTED'] } });
    expect(Object.keys(query.select)).not.toEqual(expect.arrayContaining(['facility_referrals']));
    // Only the incident's category, priority and location are read.
    expect(prisma.incident.findUnique.mock.calls[0][0].select).toEqual({
      category: true, priority: true, incident_locations: { select: { latitude: true, longitude: true } },
    });
  });

  it('no incident location: ranks without distance and says so', async () => {
    const { service } = buildService({ ...MEDICAL_AT_BOCAUE, incident_locations: null }, [row('h1', 'Hospital')]);
    const [only] = await service.recommendations(INCIDENT_ID, DISPATCHER, NOW);
    expect(only).toMatchObject({ distanceMeters: null, distanceLabel: 'Distance unknown', reasons: ['Incident location unknown'] });
  });

  it('a hospital whose location is not verified gets no distance', async () => {
    const { service } = buildService(MEDICAL_AT_BOCAUE, [row('h1', 'Hospital', { location_status: 'UNVERIFIED' })]);
    const [only] = await service.recommendations(INCIDENT_ID, DISPATCHER, NOW);
    expect(only).toMatchObject({ distanceMeters: null, reasons: ['Hospital location not verified'] });
  });

  it('closer wins a tie, and at most 10 come back', async () => {
    const far = { latitude: new Prisma.Decimal('14.8090'), longitude: new Prisma.Decimal('120.9260') };
    const rows = Array.from({ length: 12 }, (_, i) => row(`h${i}`, `H${i}`));
    rows[0] = row('far', 'Far', far);
    const { service } = buildService({ ...MEDICAL_AT_BOCAUE, priority: 'LOW' }, rows);
    const ranked = await service.recommendations(INCIDENT_ID, DISPATCHER, NOW);
    expect(ranked).toHaveLength(10);
    expect(ranked.map((r) => r.id)).not.toContain('far');
  });

  it('404 for an unknown incident', async () => {
    const { service } = buildService(null, []);
    await expect(service.recommendations(INCIDENT_ID, DISPATCHER, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── The route ──────────────────────────────────────────────────────────────

describe('GET /v1/hospitals/recommendations', () => {
  let app: INestApplication;
  let base: string;
  const hospitals = {
    recommendations: jest.fn().mockResolvedValue([{ id: 'ranked' }]),
    findVisibleById: jest.fn().mockResolvedValue({ id: 'by-id' }),
  };
  const signedIn = { canActivate: (ctx: ExecutionContext) => { ctx.switchToHttp().getRequest().user = DISPATCHER; return true; } };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HospitalsController],
      providers: [
        { provide: HospitalsService, useValue: hospitals },
        { provide: HospitalLocationResolverService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard).useValue(signedIn)
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/v1/hospitals`;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('reaches the ranking, not GET /hospitals/:id', async () => {
    const res = await fetch(`${base}/recommendations?incidentId=${INCIDENT_ID}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'ranked' }]);
    expect(hospitals.recommendations).toHaveBeenCalledWith(INCIDENT_ID, DISPATCHER);
    expect(hospitals.findVisibleById).not.toHaveBeenCalled();
  });

  it('rejects a missing or malformed incidentId (its own validation, not the :id pipe)', async () => {
    expect((await fetch(`${base}/recommendations`)).status).toBe(400);
    expect((await fetch(`${base}/recommendations?incidentId=nope`)).status).toBe(400);
    expect(hospitals.recommendations).not.toHaveBeenCalled();
    expect(hospitals.findVisibleById).not.toHaveBeenCalled();
  });

  it('GET /hospitals/:id still works', async () => {
    const res = await fetch(`${base}/${INCIDENT_ID}`);
    expect(res.status).toBe(200);
    expect(hospitals.findVisibleById).toHaveBeenCalled();
  });

  it('is Dispatcher and Supervisor only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, HospitalsController.prototype.recommendations)).toEqual([
      UserRole.DISPATCHER, UserRole.SUPERVISOR,
    ]);
  });
});
