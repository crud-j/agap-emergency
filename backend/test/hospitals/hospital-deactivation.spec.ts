import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { UserRole } from '@agap/shared';
import { HospitalsService } from '../../src/hospitals/hospitals.service';
import { HospitalsController } from '../../src/hospitals/hospitals.controller';
import { assertSelectableDestination } from '../../src/hospitals/destination-rules';
import { SetActiveDto } from '../../src/hospitals/dto/set-active.dto';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { TransportService } from '../../src/incidents/transport/transport.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AuditService } from '../../src/audit/audit.service';
import { NotificationsService } from '../../src/notifications/notifications.service';

// Hospital deactivation (Prompt 14, plan §9.4 / §12): PATCH /hospitals/:id/active.

const SYSTEM = { id: '00000000-0000-0000-0000-000000000001', role: UserRole.SYSTEM_ADMINISTRATOR };
const SUPERVISOR = { id: '00000000-0000-0000-0000-000000000002', role: UserRole.SUPERVISOR };
const ORG_ADMIN = { id: '00000000-0000-0000-0000-000000000003', role: UserRole.ORG_ADMINISTRATOR };
const DISPATCHER = { id: '00000000-0000-0000-0000-000000000004', role: UserRole.DISPATCHER };
const HOSPITAL_ID = '00000000-0000-0000-0002-000000000006';

function facility(overrides: Record<string, unknown> = {}) {
  return {
    id: HOSPITAL_ID,
    name: 'DOH — Joni Villanueva General Hospital',
    facility_type: 'HOSPITAL',
    is_active: true,
    organization_id: null,
    municipality: 'Bocaue',
    latitude: new Prisma.Decimal('14.79679'),
    longitude: new Prisma.Decimal('120.94358'),
    location_status: 'VERIFIED',
    receiving_status: 'OPEN',
    location: { type: 'Point' },
    ...overrides,
  };
}

/** What RolesGuard sees for PATCH /hospitals/:id/active; false is Nest's 403. */
function canCallSetActive(role: string): boolean {
  const context = {
    getHandler: () => HospitalsController.prototype.setActive,
    getClass: () => HospitalsController,
    switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u', role } }) }),
  } as unknown as ExecutionContext;
  return new RolesGuard(new Reflector()).canActivate(context);
}

describe('hospital deactivation (MOD-39)', () => {
  let service: HospitalsService;
  const tx = {
    facility: { update: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const mockPrisma = {
    facility: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    transportRecord: { update: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
    organization_memberships: { findMany: jest.fn() },
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const mockTransport = { notifyFacilityChanged: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HospitalsService,
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: { create: jest.fn() } },
        { provide: TransportService, useValue: mockTransport },
      ],
    }).compile();
    service = module.get(HospitalsService);
    jest.clearAllMocks();
    mockPrisma.facility.findUnique.mockResolvedValue(facility());
    mockPrisma.facility.findFirst.mockResolvedValue(null);
    mockPrisma.facility.findMany.mockResolvedValue([]);
    mockPrisma.organization_memberships.findMany.mockResolvedValue([]);
    tx.facility.update.mockImplementation(({ data }: { data: { is_active: boolean } }) =>
      Promise.resolve(facility({ is_active: data.is_active })));
  });

  describe('roles (same as location verify)', () => {
    it.each([UserRole.SYSTEM_ADMINISTRATOR, UserRole.SUPERVISOR])('%s may call it', (role) => {
      expect(canCallSetActive(role)).toBe(true);
    });

    it.each([UserRole.ORG_ADMINISTRATOR, UserRole.DISPATCHER, UserRole.RESPONDER, UserRole.HOSPITAL_USER, UserRole.CITIZEN])(
      '%s gets 403', (role) => {
        expect(canCallSetActive(role)).toBe(false);
      },
    );
  });

  it('validates the body', async () => {
    const missing = await validate(plainToInstance(SetActiveDto, {}));
    expect(missing.map((e) => e.property)).toEqual(['isActive']);
    const tooLong = await validate(plainToInstance(SetActiveDto, { isActive: false, reason: 'x'.repeat(501) }));
    expect(tooLong.map((e) => e.property)).toEqual(['reason']);
    expect(await validate(plainToInstance(SetActiveDto, { isActive: false, reason: 'Fire in the ER wing' }))).toEqual([]);
  });

  it('deactivates in one transaction with an audit row, then warns open transports', async () => {
    const result = await service.setActive(HOSPITAL_ID, { isActive: false, reason: 'Fire in the ER wing' }, SUPERVISOR);

    expect(result.is_active).toBe(false);
    expect(result.latitude).toBe(14.79679);
    expect(tx.facility.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: HOSPITAL_ID },
      data: expect.objectContaining({ is_active: false }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE',
        actor_id: SUPERVISOR.id,
        entity_type: 'facility',
        entity_id: HOSPITAL_ID,
        module_id: 'MOD-39',
        old_values: { is_active: true },
        new_values: { is_active: false, reason: 'Fire in the ER wing' },
      }),
    });
    expect(mockTransport.notifyFacilityChanged).toHaveBeenCalledWith(HOSPITAL_ID, 'deactivated');
    // The notice goes out after the write commits.
    expect(mockPrisma.$transaction.mock.invocationCallOrder[0])
      .toBeLessThan(mockTransport.notifyFacilityChanged.mock.invocationCallOrder[0]!);
  });

  it('never cancels or edits an open transport (Reliability Rules)', async () => {
    await service.setActive(HOSPITAL_ID, { isActive: false }, SYSTEM);
    expect(mockPrisma.transportRecord.update).not.toHaveBeenCalled();
    expect(mockPrisma.transportRecord.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.transportRecord.delete).not.toHaveBeenCalled();
    expect(Object.keys(tx)).toEqual(['facility', 'auditLog']);
  });

  it('does not notify on reactivation', async () => {
    mockPrisma.facility.findUnique.mockResolvedValue(facility({ is_active: false }));
    const result = await service.setActive(HOSPITAL_ID, { isActive: true }, SUPERVISOR);
    expect(result.is_active).toBe(true);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ old_values: { is_active: false }, new_values: { is_active: true, reason: null } }),
    });
    expect(mockTransport.notifyFacilityChanged).not.toHaveBeenCalled();
  });

  it('is a no-op (no write, no audit, no notice) when nothing changes', async () => {
    mockPrisma.facility.findUnique.mockResolvedValue(facility({ is_active: false }));
    const result = await service.setActive(HOSPITAL_ID, { isActive: false }, SUPERVISOR);
    expect(result.is_active).toBe(false);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTransport.notifyFacilityChanged).not.toHaveBeenCalled();
  });

  it('refuses a reactivation that would duplicate an active hospital of the same name', async () => {
    mockPrisma.facility.findUnique.mockResolvedValue(facility({ is_active: false }));
    mockPrisma.facility.findFirst.mockResolvedValue({ id: 'other', name: 'DOH — Joni Villanueva General Hospital' });
    await expect(service.setActive(HOSPITAL_ID, { isActive: true }, SUPERVISOR)).rejects.toMatchObject({
      response: { code: 'DUPLICATE_FACILITY', existingFacilityId: 'other' },
    });
    await expect(service.setActive(HOSPITAL_ID, { isActive: true }, SUPERVISOR)).rejects.toBeInstanceOf(ConflictException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses an inactive hospital as a new destination (the one destination rule)', async () => {
    const reader = { facility: { findUnique: jest.fn().mockResolvedValue(facility({ is_active: false })) } };
    await expect(assertSelectableDestination(reader, HOSPITAL_ID)).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('listing', () => {
    const whereOfLastCall = () => mockPrisma.facility.findMany.mock.calls.at(-1)![0].where;

    it('excludes inactive hospitals by default, for every role', async () => {
      for (const actor of [SYSTEM, SUPERVISOR, ORG_ADMIN, DISPATCHER]) {
        await service.findAll(actor, true);
        expect(whereOfLastCall()).toEqual(expect.objectContaining({ is_active: true }));
      }
    });

    it('includes them with the flag for reviewers only', async () => {
      for (const actor of [SYSTEM, SUPERVISOR]) {
        await service.findAll(actor, true, true);
        expect(whereOfLastCall()).not.toHaveProperty('is_active');
      }
      for (const actor of [ORG_ADMIN, DISPATCHER]) {
        await service.findAll(actor, true, true);
        expect(whereOfLastCall()).toEqual(expect.objectContaining({ is_active: true }));
      }
      await service.findAll(undefined, false, true);
      expect(whereOfLastCall()).toEqual(expect.objectContaining({ is_active: true }));
    });

    it('reads the flag from the query string', async () => {
      const controller = new HospitalsController(service, {} as never);
      const findAll = jest.spyOn(service, 'findAll');
      await controller.findAll(undefined, 'true', { user: SUPERVISOR });
      expect(findAll).toHaveBeenLastCalledWith(SUPERVISOR, false, true);
      await controller.findAll('true', undefined, { user: SUPERVISOR });
      expect(findAll).toHaveBeenLastCalledWith(SUPERVISOR, true, false);
    });
  });
});
