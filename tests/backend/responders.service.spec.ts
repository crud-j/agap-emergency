import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { RespondersService } from '@backend/responders/responders.service';
import { PrismaService } from '@backend/common/prisma/prisma.service';
import { RealtimeService } from '@backend/realtime/realtime.service';
import { AuditService } from '@backend/audit/audit.service';
import { ResponderAvailability } from '@agap/shared';
import { createMockPrisma } from './helpers/prisma.mock';

describe('RespondersService', () => {
  let service: RespondersService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockRealtime: {
    notifyIncidentStatusChanged: jest.Mock;
    responderStatus: jest.Mock;
    notifyResponderLocationUpdated: jest.Mock;
  };
  let mockAudit: { log: jest.Mock; logInTransaction: jest.Mock };

  const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const DISPATCH_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const NOW = new Date('2026-10-11T00:00:00.000Z');

  const availabilityAvailable = {
    user_id: USER_ID,
    status: 'AVAILABLE',
    changed_at: NOW,
    source: 'SELF_SERVICE',
  };

  const mockDispatch = {
    id: DISPATCH_ID,
    status: 'PENDING',
    incident_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    dispatch_crew: [{ user_id: USER_ID, dispatch_id: DISPATCH_ID }],
    incidents: { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', incident_locations: null },
    resources: { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd' },
  };

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockRealtime = {
      notifyIncidentStatusChanged: jest.fn(),
      responderStatus: jest.fn(),
      notifyResponderLocationUpdated: jest.fn(),
    };
    mockAudit = {
      log: jest.fn().mockResolvedValue(undefined),
      logInTransaction: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RespondersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<RespondersService>(RespondersService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getMySummary ──────────────────────────────────────────────────────────

  describe('getMySummary', () => {
    const mockUser = {
      id: USER_ID,
      full_name: 'Test Responder',
      role: 'RESPONDER',
      organization_memberships: [
        {
          id: 'mem-1',
          position: 'Medic',
          is_active: true,
          organizations: { id: 'org-1', name: 'Bocaue MDRRMO' },
        },
      ],
    };

    it('returns user, availability, and active assignment count', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.responderAvailability.findUnique.mockResolvedValue(availabilityAvailable);
      mockPrisma.dispatches.count.mockResolvedValue(2);

      const result = await service.getMySummary(USER_ID);

      expect(result.user.id).toBe(USER_ID);
      expect(result.user.organizations).toHaveLength(1);
      expect(result.user.organizations[0].position).toBe('Medic');
      expect(result.availability.status).toBe('AVAILABLE');
      expect(result.activeAssignmentCount).toBe(2);
    });

    it('organizations is empty array when no active memberships', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, organization_memberships: [] });
      mockPrisma.responderAvailability.findUnique.mockResolvedValue(availabilityAvailable);
      mockPrisma.dispatches.count.mockResolvedValue(0);

      const result = await service.getMySummary(USER_ID);
      expect(result.user.organizations).toEqual([]);
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getMySummary(USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws 500 AVAILABILITY_RECORD_MISSING when no availability row', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.responderAvailability.findUnique.mockResolvedValue(null);

      const err = await service.getMySummary(USER_ID).catch((e) => e);
      expect(err).toBeInstanceOf(InternalServerErrorException);
      expect(err.message).toContain('AVAILABILITY_RECORD_MISSING');
    });
  });

  // ── updateMyAvailability ─────────────────────────────────────────────────

  describe('updateMyAvailability', () => {
    it('transitions OFF_DUTY → AVAILABLE; writes an audit row', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ user_id: USER_ID, status: 'OFF_DUTY' }]);
      mockPrisma.responderAvailability.update.mockResolvedValue({
        ...availabilityAvailable,
        status: 'AVAILABLE',
      });

      const result = await service.updateMyAvailability(USER_ID, {
        status: ResponderAvailability.AVAILABLE,
      });

      expect(result.status).toBe('AVAILABLE');
      expect(mockAudit.logInTransaction).toHaveBeenCalledTimes(1);
      expect(mockAudit.logInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ oldValues: { status: 'OFF_DUTY' }, newValues: { status: 'AVAILABLE' } }),
      );
    });

    it('transitions AVAILABLE → OFF_DUTY when no active dispatches', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ user_id: USER_ID, status: 'AVAILABLE' }]);
      mockPrisma.dispatches.count.mockResolvedValue(0);
      mockPrisma.responderAvailability.update.mockResolvedValue({
        ...availabilityAvailable,
        status: 'OFF_DUTY',
      });

      const result = await service.updateMyAvailability(USER_ID, {
        status: ResponderAvailability.OFF_DUTY,
      });

      expect(result.status).toBe('OFF_DUTY');
      expect(mockAudit.logInTransaction).toHaveBeenCalledTimes(1);
    });

    it('transitions UNAVAILABLE → AVAILABLE without an active-assignment check', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ user_id: USER_ID, status: 'UNAVAILABLE' }]);
      mockPrisma.responderAvailability.update.mockResolvedValue({
        ...availabilityAvailable,
        status: 'AVAILABLE',
      });

      await service.updateMyAvailability(USER_ID, { status: ResponderAvailability.AVAILABLE });

      // count must NOT be called — going AVAILABLE never requires an assignment check
      expect(mockPrisma.dispatches.count).not.toHaveBeenCalled();
    });

    it('throws 409 ACTIVE_ASSIGNMENT when going OFF_DUTY with an active PENDING dispatch', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ user_id: USER_ID, status: 'AVAILABLE' }]);
      mockPrisma.dispatches.count.mockResolvedValue(1);

      const err = await service
        .updateMyAvailability(USER_ID, { status: ResponderAvailability.OFF_DUTY })
        .catch((e) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect(err.message).toContain('ACTIVE_ASSIGNMENT');
    });

    it('throws 409 ACTIVE_ASSIGNMENT when going UNAVAILABLE with an active dispatch', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ user_id: USER_ID, status: 'AVAILABLE' }]);
      mockPrisma.dispatches.count.mockResolvedValue(3);

      await expect(
        service.updateMyAvailability(USER_ID, { status: ResponderAvailability.UNAVAILABLE }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws 409 when OFF_DUTY → UNAVAILABLE with an active dispatch', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ user_id: USER_ID, status: 'OFF_DUTY' }]);
      mockPrisma.dispatches.count.mockResolvedValue(1);

      await expect(
        service.updateMyAvailability(USER_ID, { status: ResponderAvailability.UNAVAILABLE }),
      ).rejects.toThrow(ConflictException);
    });

    it('same-state request is idempotent — no update, no audit row', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ user_id: USER_ID, status: 'AVAILABLE' }]);
      mockPrisma.responderAvailability.findUnique.mockResolvedValue(availabilityAvailable);

      await service.updateMyAvailability(USER_ID, { status: ResponderAvailability.AVAILABLE });

      expect(mockPrisma.responderAvailability.update).not.toHaveBeenCalled();
      expect(mockAudit.logInTransaction).not.toHaveBeenCalled();
    });

    it('throws 500 AVAILABILITY_RECORD_MISSING when no row exists', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const err = await service
        .updateMyAvailability(USER_ID, { status: ResponderAvailability.AVAILABLE })
        .catch((e) => e);

      expect(err).toBeInstanceOf(InternalServerErrorException);
      expect(err.message).toContain('AVAILABILITY_RECORD_MISSING');
    });

    it('propagates audit failure — availability update is rolled back', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ user_id: USER_ID, status: 'OFF_DUTY' }]);
      mockPrisma.responderAvailability.update.mockResolvedValue({
        ...availabilityAvailable,
        status: 'AVAILABLE',
      });
      mockAudit.logInTransaction.mockRejectedValueOnce(new Error('audit DB write failed'));

      await expect(
        service.updateMyAvailability(USER_ID, { status: ResponderAvailability.AVAILABLE }),
      ).rejects.toThrow('audit DB write failed');
    });

    it('AVAILABLE → OFF_DUTY succeeds when only COMPLETED dispatches exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ user_id: USER_ID, status: 'AVAILABLE' }]);
      mockPrisma.dispatches.count.mockResolvedValue(0); // COMPLETED/CANCELLED excluded by query filter
      mockPrisma.responderAvailability.update.mockResolvedValue({
        ...availabilityAvailable,
        status: 'OFF_DUTY',
      });

      const result = await service.updateMyAvailability(USER_ID, {
        status: ResponderAvailability.OFF_DUTY,
      });
      expect(result.status).toBe('OFF_DUTY');
    });
  });

  // ── acceptAssignment ─────────────────────────────────────────────────────

  describe('acceptAssignment', () => {
    it('accepts the assignment when the responder is AVAILABLE', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ user_id: USER_ID, status: 'AVAILABLE' }]) // availability lock
        .mockResolvedValueOnce([]); // dispatch lock (no-op return)
      mockPrisma.dispatches.findUnique.mockResolvedValue(mockDispatch);
      mockPrisma.dispatches.update.mockResolvedValue({ ...mockDispatch, status: 'ACCEPTED' });

      const result = await service.acceptAssignment(DISPATCH_ID, USER_ID);
      expect(result.status).toBe('ACCEPTED');
    });

    it('throws 409 RESPONDER_NOT_AVAILABLE when OFF_DUTY', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ user_id: USER_ID, status: 'OFF_DUTY' }]);

      const err = await service.acceptAssignment(DISPATCH_ID, USER_ID).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.message).toContain('RESPONDER_NOT_AVAILABLE');
    });

    it('throws 409 RESPONDER_NOT_AVAILABLE when UNAVAILABLE', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ user_id: USER_ID, status: 'UNAVAILABLE' }]);

      await expect(service.acceptAssignment(DISPATCH_ID, USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws 500 AVAILABILITY_RECORD_MISSING when no availability row', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const err = await service.acceptAssignment(DISPATCH_ID, USER_ID).catch((e) => e);
      expect(err).toBeInstanceOf(InternalServerErrorException);
    });

    it('throws ForbiddenException when user is not in dispatch crew', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ user_id: USER_ID, status: 'AVAILABLE' }])
        .mockResolvedValueOnce([]);
      mockPrisma.dispatches.findUnique.mockResolvedValue({
        ...mockDispatch,
        dispatch_crew: [{ user_id: 'different-user-id', dispatch_id: DISPATCH_ID }],
      });

      await expect(service.acceptAssignment(DISPATCH_ID, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when dispatch does not exist', async () => {
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ user_id: USER_ID, status: 'AVAILABLE' }])
        .mockResolvedValueOnce([]);
      mockPrisma.dispatches.findUnique.mockResolvedValue(null);

      await expect(service.acceptAssignment(DISPATCH_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getAssignment ─────────────────────────────────────────────────────────

  describe('getAssignment', () => {
    it('returns the assignment when the caller is in dispatch crew', async () => {
      mockPrisma.dispatches.findUnique.mockResolvedValue(mockDispatch);

      const result = await service.getAssignment(DISPATCH_ID, USER_ID);
      expect(result.id).toBe(DISPATCH_ID);
    });

    it('throws NotFoundException when dispatch does not exist', async () => {
      mockPrisma.dispatches.findUnique.mockResolvedValue(null);
      await expect(service.getAssignment(DISPATCH_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when caller is not crew — cross-responder read blocked', async () => {
      mockPrisma.dispatches.findUnique.mockResolvedValue({
        ...mockDispatch,
        dispatch_crew: [{ user_id: 'another-responder' }],
      });

      await expect(service.getAssignment(DISPATCH_ID, USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
