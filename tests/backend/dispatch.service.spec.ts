import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { DispatchService } from '@backend/dispatch/dispatch.service';
import { PrismaService } from '@backend/common/prisma/prisma.service';
import { RealtimeService } from '@backend/realtime/realtime.service';
import { AuditService } from '@backend/audit/audit.service';
import { QUEUE_NAMES, IncidentStatus } from '@agap/shared';
import { createMockPrisma } from './helpers/prisma.mock';

describe('DispatchService', () => {
  let service: DispatchService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockNotificationQueue: { add: jest.Mock };
  let mockRealtimeService: { emitToRoom: jest.Mock; broadcastIncidentUpdate: jest.Mock };
  let mockAudit: { log: jest.Mock };

  const acknowledgedIncident = {
    id: 'inc-1',
    public_reference: 'INC-2026-000001',
    status: IncidentStatus.ACKNOWLEDGED,
    category: 'MEDICAL',
    priority: 'HIGH',
    incident_reporters: [{ reporter_phone: '+639171234567' }],
  };

  const availableResource = {
    id: 'res-1',
    name: 'Ambulance Alpha',
    status: 'AVAILABLE',
    organization_id: 'org-1',
    type: 'AMBULANCE',
  };

  const mockDispatch = {
    id: 'dispatch-1',
    incident_id: 'inc-1',
    resource_id: 'res-1',
    dispatcher_id: 'dispatcher-1',
    organization_id: 'org-1',
    status: 'PENDING',
    created_at: new Date(),
    dispatch_crew: [],
    incidents: acknowledgedIncident,
    resources: availableResource,
  };

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockNotificationQueue = { add: jest.fn().mockResolvedValue({}) };
    mockRealtimeService = { emitToRoom: jest.fn(), broadcastIncidentUpdate: jest.fn() };
    // AuditService is a best-effort side channel (fire-and-forget). Mock it so DI
    // resolves; its failure must never block a dispatch.
    mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatchService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeService, useValue: mockRealtimeService },
        { provide: AuditService, useValue: mockAudit },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATIONS), useValue: mockNotificationQueue },
      ],
    }).compile();

    service = module.get<DispatchService>(DispatchService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    beforeEach(() => {
      mockPrisma.incident.findUnique.mockResolvedValue(acknowledgedIncident);
      mockPrisma.resources.findUnique.mockResolvedValue(availableResource);
      mockPrisma.dispatches.create.mockResolvedValue(mockDispatch);
      mockPrisma.resources.update.mockResolvedValue({});
      mockPrisma.incident.update.mockResolvedValue({});
      mockPrisma.incidentEvent.create.mockResolvedValue({});
    });

    it('creates a dispatch when incident is ACKNOWLEDGED and resource is AVAILABLE', async () => {
      const result = await service.create(
        { incidentId: 'inc-1', resourceId: 'res-1' },
        'dispatcher-1',
      );

      expect(result).toBeDefined();
      expect(mockPrisma.dispatches.create).toHaveBeenCalled();
    });

    it('attaches the dispatcher id to the dispatch record — dispatch is never autonomous', async () => {
      await service.create({ incidentId: 'inc-1', resourceId: 'res-1' }, 'dispatcher-1');

      const createCall = mockPrisma.dispatches.create.mock.calls[0]?.[0] as any;
      expect(createCall.data.dispatcher_id).toBe('dispatcher-1');
    });

    it('throws NotFoundException when incident does not exist', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ incidentId: 'no-such', resourceId: 'res-1' }, 'dispatcher-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when resource does not exist', async () => {
      mockPrisma.resources.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ incidentId: 'inc-1', resourceId: 'no-such' }, 'dispatcher-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the resource is not AVAILABLE', async () => {
      mockPrisma.resources.findUnique.mockResolvedValue({
        ...availableResource,
        status: 'ON_DUTY',
      });

      await expect(
        service.create({ incidentId: 'inc-1', resourceId: 'res-1' }, 'dispatcher-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when incident is in SUBMITTED status (not yet acknowledged)', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({
        ...acknowledgedIncident,
        status: IncidentStatus.SUBMITTED,
      });

      await expect(
        service.create({ incidentId: 'inc-1', resourceId: 'res-1' }, 'dispatcher-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when incident is in CLOSED terminal status', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({
        ...acknowledgedIncident,
        status: IncidentStatus.CLOSED,
      });

      await expect(
        service.create({ incidentId: 'inc-1', resourceId: 'res-1' }, 'dispatcher-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts dispatch when incident is in DISPATCH_PENDING status', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({
        ...acknowledgedIncident,
        status: IncidentStatus.DISPATCH_PENDING,
      });

      const result = await service.create(
        { incidentId: 'inc-1', resourceId: 'res-1' },
        'dispatcher-1',
      );

      expect(result).toBeDefined();
    });

    it('accepts dispatch when incident is in ASSESSED status', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({
        ...acknowledgedIncident,
        status: IncidentStatus.ASSESSED,
      });

      const result = await service.create(
        { incidentId: 'inc-1', resourceId: 'res-1' },
        'dispatcher-1',
      );

      expect(result).toBeDefined();
    });
  });

  // ── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns the dispatch record when found', async () => {
      mockPrisma.dispatches.findUnique.mockResolvedValue(mockDispatch);
      const result = await service.findById('dispatch-1');
      expect(result.id).toBe('dispatch-1');
    });

    it('throws NotFoundException when dispatch does not exist', async () => {
      mockPrisma.dispatches.findUnique.mockResolvedValue(null);
      await expect(service.findById('no-such')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns dispatches filtered by incidentId', async () => {
      mockPrisma.dispatches.findMany.mockResolvedValue([mockDispatch]);

      const result = await service.findAll({ incidentId: 'inc-1' });

      expect(result).toHaveLength(1);
      expect(mockPrisma.dispatches.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ incident_id: 'inc-1' }),
        }),
      );
    });

    it('returns all dispatches when no filters are given', async () => {
      mockPrisma.dispatches.findMany.mockResolvedValue([mockDispatch]);
      const result = await service.findAll({});
      expect(result).toHaveLength(1);
    });
  });
});
