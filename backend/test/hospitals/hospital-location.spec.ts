import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { UserRole } from '@agap/shared';
import { HospitalsService } from '../../src/hospitals/hospitals.service';
import { TransportService } from '../../src/incidents/transport/transport.service';
import { HospitalsController } from '../../src/hospitals/hospitals.controller';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { NearbyQueryDto } from '../../src/hospitals/dto/nearby-query.dto';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AuditService } from '../../src/audit/audit.service';
import { NotificationsService } from '../../src/notifications/notifications.service';

const SYSTEM = { id: '00000000-0000-0000-0000-000000000001', role: UserRole.SYSTEM_ADMINISTRATOR };
const SUPERVISOR = { id: '00000000-0000-0000-0000-000000000002', role: UserRole.SUPERVISOR };
const ORG_ADMIN = { id: '00000000-0000-0000-0000-000000000003', role: UserRole.ORG_ADMINISTRATOR };
const HOSPITAL_ORG = '00000000-0000-0000-0000-000000000010';
const OTHER_ORG = '00000000-0000-0000-0000-000000000011';

function facility(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000020',
    name: 'Reference Hospital',
    facility_type: 'HOSPITAL',
    is_active: true,
    organization_id: HOSPITAL_ORG,
    municipality: 'Bocaue',
    latitude: new Prisma.Decimal('14.79679'),
    longitude: new Prisma.Decimal('120.94358'),
    location_status: 'VERIFIED',
    location_confidence: new Prisma.Decimal('0.95'),
    location: { type: 'Point' },
    ...overrides,
  };
}

const mockTransport = { notifyFacilityChanged: jest.fn().mockResolvedValue(undefined) };

describe('hospital location registry', () => {
  let service: HospitalsService;
  const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
  const mockPrisma = {
    facility: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organization: { findUnique: jest.fn() },
    organization_memberships: { findMany: jest.fn(), findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HospitalsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: TransportService, useValue: mockTransport },
      ],
    }).compile();
    service = module.get(HospitalsService);
    jest.clearAllMocks();
    mockPrisma.organization_memberships.findMany.mockResolvedValue([{ organization_id: HOSPITAL_ORG }]);
    mockPrisma.organization_memberships.findFirst.mockResolvedValue({ id: 'membership' });
    mockPrisma.facility.findUnique.mockResolvedValue(facility());
    mockPrisma.facility.findFirst.mockResolvedValue(null);
  });

  it('serializes Decimal coordinates and hides unreviewed facilities by default', async () => {
    mockPrisma.facility.findMany.mockResolvedValue([
      facility(),
      facility({ id: 'rejected', location_status: 'REJECTED' }),
    ]);
    const result = await service.findAll(SYSTEM);
    expect(result[0]).toEqual(expect.objectContaining({ latitude: 14.79679, longitude: 120.94358 }));
    expect(result[0]).not.toHaveProperty('location');
    expect(mockPrisma.facility.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ location_status: { notIn: ['PENDING_REVIEW', 'REJECTED'] } }),
    }));
  });

  it('honours unreviewed inclusion for system administrators and ignores it for dispatchers', async () => {
    mockPrisma.facility.findMany.mockResolvedValue([]);
    await service.findAll(SYSTEM, true);
    expect(mockPrisma.facility.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ location_status: expect.anything() }),
    }));
    await service.findAll({ id: 'dispatcher', role: UserRole.DISPATCHER }, true);
    expect(mockPrisma.facility.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ location_status: { notIn: ['PENDING_REVIEW', 'REJECTED'] } }),
    }));
  });

  it('rejects invalid nearby query values', async () => {
    const errors = await validate(plainToInstance(NearbyQueryDto, { lat: 95, lng: 'missing' }));
    expect(errors.map((error) => error.property).sort()).toEqual(['lat', 'lng']);
  });

  it('rejects out-of-area and swapped coordinates with coded errors', async () => {
    await expect(service.setLocation(facility().id, {
      latitude: 10.3157, longitude: 123.8854, source: 'manual',
    }, SYSTEM)).rejects.toMatchObject({
      response: { code: 'COORDINATES_OUT_OF_SERVICE_AREA' },
    });
    await expect(service.setLocation(facility().id, {
      latitude: 120.94358, longitude: 14.79679, source: 'manual',
    }, SYSTEM)).rejects.toMatchObject({
      response: {
        code: 'COORDINATES_LIKELY_SWAPPED',
        suggested: { latitude: 14.79679, longitude: 120.94358 },
      },
    });
  });

  it('rejects duplicate source references', async () => {
    mockPrisma.facility.findUnique.mockResolvedValue(facility());
    mockPrisma.facility.findFirst.mockResolvedValue({ id: 'existing', name: 'Existing Hospital' });
    await expect(service.setLocation(facility().id, {
      latitude: 14.79679, longitude: 120.94358, source: 'manual', sourceRef: 'same',
    }, SYSTEM)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a source reference already stored under another source (one OSM object = one hospital)', async () => {
    // The seeded hospital is 'manual+osm-crosscheck'; a "Find location" pick of the same
    // OSM way arrives as 'nominatim', under a differently spelled name.
    mockPrisma.facility.findFirst.mockResolvedValue({ id: 'seeded', name: 'DOH — Joni Villanueva General Hospital' });
    await expect(service.create({
      name: 'Joni Villanueva Gen. Hosp.',
      location: { latitude: 14.7968505, longitude: 120.9435893, source: 'nominatim', sourceRef: 'osm:way:1290448946' },
    }, SYSTEM)).rejects.toMatchObject({
      response: { code: 'DUPLICATE_FACILITY', existingFacilityId: 'seeded' },
    });
    const where = mockPrisma.facility.findFirst.mock.calls[0]![0].where;
    expect(where.OR).toContainEqual({ location_source_ref: 'osm:way:1290448946' });
    expect(JSON.stringify(where)).not.toContain('location_source"');
    expect(mockPrisma.facility.create).not.toHaveBeenCalled();
  });

  it('creates pending locations for hospital org administrators', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ organization_type: 'HOSPITAL' });
    mockPrisma.facility.create.mockResolvedValue(facility({ location_status: 'PENDING_REVIEW' }));
    const result = await service.create({
      name: 'New Hospital',
      organizationId: HOSPITAL_ORG,
      location: { latitude: 14.79679, longitude: 120.94358, source: 'manual' },
    }, ORG_ADMIN);
    expect(result.location_status).toBe('PENDING_REVIEW');
    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({
      newValues: expect.objectContaining({ location_status: 'PENDING_REVIEW' }),
    }));
  });

  it('rejects organization administrators for non-hospital organizations', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ organization_type: 'MDRRMO' });
    await expect(service.create({ name: 'New Hospital', organizationId: OTHER_ORG }, ORG_ADMIN))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates verified locations for system administrators', async () => {
    mockPrisma.facility.create.mockResolvedValue(facility());
    const result = await service.create({
      name: 'New Hospital',
      location: { latitude: 14.79679, longitude: 120.94358, source: 'manual' },
    }, SYSTEM);
    expect(result.location_status).toBe('VERIFIED');
    expect(mockPrisma.facility.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ location_verified_by_id: SYSTEM.id }),
    }));
  });

  it('verifies a location and audits the decision', async () => {
    mockPrisma.facility.findUnique.mockResolvedValue(facility({ location_status: 'PENDING_REVIEW' }));
    mockPrisma.facility.update.mockResolvedValue(facility({ location_status: 'VERIFIED' }));
    const result = await service.verifyLocation(facility().id, { decision: 'VERIFIED', note: 'checked' }, SUPERVISOR);
    expect(result.location_status).toBe('VERIFIED');
    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({
      actorId: SUPERVISOR.id,
      newValues: { location_status: 'VERIFIED', note: 'checked' },
    }));
  });

  it('rejects verification without coordinates', async () => {
    mockPrisma.facility.findUnique.mockResolvedValue(facility({ latitude: null, longitude: null }));
    await expect(service.verifyLocation(facility().id, { decision: 'VERIFIED' }, SUPERVISOR))
      .rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('allows the same hospital name in a different municipality', async () => {
    mockPrisma.facility.findUnique.mockResolvedValue(facility({ municipality: 'Malolos' }));
    mockPrisma.facility.findFirst.mockResolvedValue(null);
    mockPrisma.facility.update.mockResolvedValue(facility({ municipality: 'Malolos' }));
    await expect(service.setLocation(facility().id, {
      latitude: 14.79679, longitude: 120.94358, source: 'manual',
    }, SYSTEM)).resolves.toBeDefined();
    // The name match is scoped to the facility's own municipality, so another town's
    // same-named hospital is not a duplicate.
    expect(mockPrisma.facility.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([expect.objectContaining({
          municipality: { equals: 'Malolos', mode: 'insensitive' },
        })]),
      }),
    }));
  });

  it('tells open transports to this hospital about a new location after it is saved (Prompt 08)', async () => {
    mockPrisma.facility.findFirst.mockResolvedValue(null);
    mockPrisma.facility.update.mockResolvedValue(facility());

    await service.setLocation(facility().id, { latitude: 14.79679, longitude: 120.94358, source: 'manual' }, SYSTEM);

    expect(mockTransport.notifyFacilityChanged).toHaveBeenCalledWith(facility().id, 'moved');
    expect(mockPrisma.facility.update.mock.invocationCallOrder[0])
      .toBeLessThan(mockTransport.notifyFacilityChanged.mock.invocationCallOrder[0]!);
  });

  it('does not notify transports when the location is refused', async () => {
    await expect(service.setLocation(facility().id, {
      latitude: 10.3157, longitude: 123.8854, source: 'manual',
    }, SYSTEM)).rejects.toBeDefined();
    expect(mockTransport.notifyFacilityChanged).not.toHaveBeenCalled();
  });

  it('treats a missing municipality like the DB index does (NULL or empty)', async () => {
    mockPrisma.facility.findFirst.mockResolvedValue({ id: 'existing', name: 'New Hospital' });
    await expect(service.create({ name: 'New Hospital' }, SYSTEM)).rejects.toMatchObject({
      response: { code: 'DUPLICATE_FACILITY', existingFacilityId: 'existing' },
    });
    expect(mockPrisma.facility.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [expect.objectContaining({ OR: [{ municipality: null }, { municipality: '' }] })],
      }),
    }));
  });

  it('lets an org administrator see their own unreviewed hospitals without losing the shared directory', async () => {
    mockPrisma.facility.findMany.mockResolvedValue([]);
    await service.findAll(ORG_ADMIN, true);
    expect(mockPrisma.facility.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { location_status: { notIn: ['PENDING_REVIEW', 'REJECTED'] } },
          { organization_id: { in: [HOSPITAL_ORG] } },
        ],
      }),
    }));
  });

  it('skips the membership lookup when unreviewed hospitals are not requested', async () => {
    mockPrisma.facility.findMany.mockResolvedValue([]);
    await service.findAll(ORG_ADMIN);
    expect(mockPrisma.organization_memberships.findMany).not.toHaveBeenCalled();
  });

  it('hides an unreviewed hospital from GET /hospitals/:id for non-reviewers', async () => {
    mockPrisma.facility.findFirst.mockResolvedValue(null);
    await expect(service.findVisibleById(facility().id, { id: 'dispatcher', role: UserRole.DISPATCHER }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(mockPrisma.facility.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ location_status: { notIn: ['PENDING_REVIEW', 'REJECTED'] } }),
    }));
  });

  it('requires an organization for org administrators (400) and rejects other organizations (403)', async () => {
    await expect(service.create({ name: 'New Hospital' }, ORG_ADMIN))
      .rejects.toBeInstanceOf(BadRequestException);
    mockPrisma.organization.findUnique.mockResolvedValue({ organization_type: 'HOSPITAL' });
    mockPrisma.organization_memberships.findFirst.mockResolvedValue(null);
    await expect(service.create({ name: 'New Hospital', organizationId: OTHER_ORG }, ORG_ADMIN))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.facility.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown organization with 400 instead of a foreign-key error', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null);
    await expect(service.create({ name: 'New Hospital', organizationId: OTHER_ORG }, SYSTEM))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('audits created coordinates as numbers, not Decimal strings', async () => {
    mockPrisma.facility.create.mockResolvedValue(facility());
    await service.create({
      name: 'New Hospital',
      location: { latitude: 14.79679, longitude: 120.94358, source: 'manual' },
    }, SYSTEM);
    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({
      newValues: expect.objectContaining({ latitude: 14.79679, longitude: 120.94358 }),
    }));
  });

  it('lets org administrators reach POST /hospitals (the service enforces their own HOSPITAL org)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, HospitalsController.prototype.create) as UserRole[];
    expect(roles).toEqual(expect.arrayContaining([UserRole.SYSTEM_ADMINISTRATOR, UserRole.ORG_ADMINISTRATOR]));
  });
});
