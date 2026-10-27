import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { v4 as uuidv4 } from 'uuid';
import { IncidentStatus, UserRole } from '@agap/shared';
import { HospitalsService } from '../../src/hospitals/hospitals.service';
import { HospitalsController } from '../../src/hospitals/hospitals.controller';
import { CreateReferralDto } from '../../src/hospitals/dto/create-referral.dto';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AuditService } from '../../src/audit/audit.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

const HOSPITAL_ID = uuidv4();
const HOSPITAL_ORG = uuidv4();
const OTHER_ORG = uuidv4();
const INCIDENT_ID = uuidv4();
const REFERRAL_ID = uuidv4();
const DISPATCHER = { id: uuidv4(), role: UserRole.DISPATCHER };
const HOSPITAL_USER = { id: uuidv4(), role: UserRole.HOSPITAL_USER };

function referral(overrides: Record<string, unknown> = {}) {
  return {
    id: REFERRAL_ID,
    incident_id: INCIDENT_ID,
    facility_id: HOSPITAL_ID,
    acknowledgment_status: 'PENDING',
    acknowledged_at: null,
    patient_arrived_at: null,
    ...overrides,
  };
}

const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
const mockNotifications = { create: jest.fn().mockResolvedValue(undefined) };
const mockPrisma = {
  facility: { findFirst: jest.fn(), findUnique: jest.fn() },
  incident: { findUnique: jest.fn() },
  dispatches: { findUnique: jest.fn() },
  incident_patients: { findUnique: jest.fn() },
  organization_memberships: { findMany: jest.fn() },
  facility_referrals: {
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

describe('HospitalsService referrals — MOD-38', () => {
  let service: HospitalsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HospitalsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get(HospitalsService);
    jest.clearAllMocks();
    mockPrisma.facility.findFirst.mockResolvedValue({ id: HOSPITAL_ID, name: 'Bocaue District Hospital', organization_id: HOSPITAL_ORG });
    mockPrisma.facility.findUnique.mockResolvedValue({ organization_id: HOSPITAL_ORG });
    mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID, status: IncidentStatus.DISPATCHED });
    mockPrisma.facility_referrals.findFirst.mockResolvedValue(null);
    mockPrisma.facility_referrals.findUnique.mockResolvedValue(referral());
    mockPrisma.facility_referrals.create.mockResolvedValue(referral());
    mockPrisma.facility_referrals.update.mockImplementation(({ data }) => Promise.resolve(referral(data)));
    mockPrisma.organization_memberships.findMany.mockResolvedValue([]);
  });

  describe('CreateReferralDto', () => {
    it('rejects a missing or malformed incidentId', async () => {
      const errors = await validate(plainToInstance(CreateReferralDto, { incidentId: 'not-a-uuid' }));
      expect(errors.map((e) => e.property)).toContain('incidentId');
    });

    it('rejects an ETA over 600 minutes and notes over 1000 characters', async () => {
      const errors = await validate(plainToInstance(CreateReferralDto, {
        incidentId: INCIDENT_ID, etaMinutes: 601, preArrivalNotes: 'x'.repeat(1001),
      }));
      expect(errors.map((e) => e.property).sort()).toEqual(['etaMinutes', 'preArrivalNotes']);
    });
  });

  describe('createReferral', () => {
    it('creates the referral and writes a MOD-38 audit row', async () => {
      await service.createReferral(HOSPITAL_ID, { incidentId: INCIDENT_ID, etaMinutes: 12 }, DISPATCHER.id);
      expect(mockPrisma.facility_referrals.create).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({
        moduleId: 'MOD-38', entityType: 'facility_referral', incidentId: INCIDENT_ID,
      }));
    });

    it.each([IncidentStatus.CLOSED, IncidentStatus.CANCELLED, IncidentStatus.FALSE_ALERT, IncidentStatus.DUPLICATE])(
      'refuses a %s incident',
      async (status) => {
        mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID, status });
        await expect(service.createReferral(HOSPITAL_ID, { incidentId: INCIDENT_ID }, DISPATCHER.id))
          .rejects.toBeInstanceOf(BadRequestException);
      },
    );

    it('returns 409 for a second pending referral to the same hospital', async () => {
      mockPrisma.facility_referrals.findFirst.mockResolvedValue(referral());
      await expect(service.createReferral(HOSPITAL_ID, { incidentId: INCIDENT_ID }, DISPATCHER.id))
        .rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a dispatch from another incident', async () => {
      mockPrisma.dispatches.findUnique.mockResolvedValue({ id: uuidv4(), incident_id: uuidv4() });
      await expect(service.createReferral(HOSPITAL_ID, { incidentId: INCIDENT_ID, dispatchId: uuidv4() }, DISPATCHER.id))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 404 for an unknown or inactive hospital', async () => {
      mockPrisma.facility.findFirst.mockResolvedValue(null);
      await expect(service.createReferral(HOSPITAL_ID, { incidentId: INCIDENT_ID }, DISPATCHER.id))
        .rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('hospital user scope', () => {
    it('lets a hospital user read their own hospital referrals', async () => {
      mockPrisma.organization_memberships.findMany.mockResolvedValue([{ organization_id: HOSPITAL_ORG }]);
      await expect(service.findReferrals(HOSPITAL_ID, HOSPITAL_USER)).resolves.toEqual([]);
    });

    it("refuses another hospital's referrals", async () => {
      mockPrisma.organization_memberships.findMany.mockResolvedValue([{ organization_id: OTHER_ORG }]);
      await expect(service.findReferrals(HOSPITAL_ID, HOSPITAL_USER)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.findReferralFor(REFERRAL_ID, HOSPITAL_USER)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.markArrived(REFERRAL_ID, HOSPITAL_USER)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('limits incident referrals to the hospital user organizations', async () => {
      mockPrisma.organization_memberships.findMany.mockResolvedValue([{ organization_id: HOSPITAL_ORG }]);
      await service.findIncidentReferrals(INCIDENT_ID, HOSPITAL_USER);
      expect(mockPrisma.facility_referrals.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { incident_id: INCIDENT_ID, facilities: { organization_id: { in: [HOSPITAL_ORG] } } },
      }));
    });

    it('does not limit dispatchers', async () => {
      await service.findIncidentReferrals(INCIDENT_ID, DISPATCHER);
      expect(mockPrisma.facility_referrals.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { incident_id: INCIDENT_ID },
      }));
      expect(mockPrisma.organization_memberships.findMany).not.toHaveBeenCalled();
    });
  });

  describe('acknowledge and arrival', () => {
    beforeEach(() => {
      mockPrisma.organization_memberships.findMany.mockResolvedValue([{ organization_id: HOSPITAL_ORG }]);
    });

    it('acknowledges and audits', async () => {
      const updated = await service.acknowledgeReferral(REFERRAL_ID, HOSPITAL_USER);
      expect(updated.acknowledgment_status).toBe('ACKNOWLEDGED');
      expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({
        moduleId: 'MOD-38', entityId: REFERRAL_ID, actorId: HOSPITAL_USER.id,
      }));
    });

    it('records arrival and audits', async () => {
      const updated = await service.markArrived(REFERRAL_ID, DISPATCHER);
      expect(updated.patient_arrived_at).toBeInstanceOf(Date);
      expect(mockAudit.log).toHaveBeenCalledTimes(1);
    });

    it('refuses a second arrival', async () => {
      mockPrisma.facility_referrals.findUnique.mockResolvedValue(referral({ patient_arrived_at: new Date() }));
      await expect(service.markArrived(REFERRAL_ID, DISPATCHER)).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.facility_referrals.update).not.toHaveBeenCalled();
    });
  });

  describe('route roles', () => {
    const roles = (name: string) =>
      Reflect.getMetadata(ROLES_KEY, (HospitalsController.prototype as unknown as Record<string, object>)[name]) as string[];

    it.each(['findReferral', 'findReferrals', 'findIncidentReferrals'])(
      '%s is closed to citizens, bystanders and the System Administrator',
      (name) => {
        const allowed = roles(name);
        expect(allowed).toEqual([UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.RESPONDER, UserRole.HOSPITAL_USER]);
      },
    );

    it('lets only hospital users acknowledge, and hospital or MDRRMO staff record arrival', () => {
      expect(roles('acknowledgeReferral')).toEqual([UserRole.HOSPITAL_USER]);
      expect(roles('markArrived')).toEqual([UserRole.HOSPITAL_USER, UserRole.DISPATCHER, UserRole.SUPERVISOR]);
    });
  });
});
