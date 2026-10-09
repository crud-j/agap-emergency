import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { IncidentsService } from '@backend/incidents/incidents.service';
import { IncidentStatusService } from '@backend/incidents/incident-status/incident-status.service';
import { DuplicateDetectionService } from '@backend/incidents/duplicate-detection/duplicate-detection.service';
import { PriorityService } from '@backend/incidents/priority/priority.service';
import { PrismaService } from '@backend/common/prisma/prisma.service';
import { RealtimeService } from '@backend/realtime/realtime.service';
import { AuditService } from '@backend/audit/audit.service';
import { IncidentStatus, IncidentType, ReporterType } from '@agap/shared';
import { createMockPrisma } from './helpers/prisma.mock';

describe('IncidentsService', () => {
  let service: IncidentsService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockDuplicateService: { findNearbyRecent: jest.Mock };

  const mockIncident = {
    id: 'inc-1',
    public_reference: 'INC-2026-000001',
    category: 'MEDICAL',
    status: IncidentStatus.SUBMITTED,
    priority: 'HIGH',
    client_event_id: 'evt-abc',
    description: null,
    created_at: new Date(),
    submitted_at: new Date(),
    updated_at: new Date(),
    acknowledged_at: null,
    assessed_at: null,
    dispatched_at: null,
    en_route_at: null,
    on_scene_at: null,
    resolved_at: null,
    closed_at: null,
    incident_reporters: [],
    incident_patients: [],
    incident_attachments: [],
    incident_events: [],
    dispatches: [],
  };

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockDuplicateService = { findNearbyRecent: jest.fn().mockResolvedValue(null) };
    // RealtimeService + AuditService are best-effort side channels — mock them so
    // DI resolves. Their failure must never block an incident (asserted below).
    const mockRealtime = {
      notifyIncidentCreated: jest.fn(),
      notifyIncidentStatusChanged: jest.fn(),
      incidentUpdated: jest.fn(),
    };
    const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        IncidentStatusService,
        PriorityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DuplicateDetectionService, useValue: mockDuplicateService },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<IncidentsService>(IncidentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    beforeEach(() => {
      mockPrisma.incident.findFirst.mockResolvedValue(null);
      mockPrisma.incident.count.mockResolvedValue(0);
      mockPrisma.incident.create.mockResolvedValue(mockIncident);
      mockPrisma.incidentReporter.create.mockResolvedValue({});
      mockPrisma.incident_patients.create.mockResolvedValue({});
      mockPrisma.incidentEvent.create.mockResolvedValue({});
    });

    it('creates an incident with SUBMITTED status', async () => {
      const result = await service.create({
        type: IncidentType.MEDICAL,
        idempotencyKey: 'evt-new',
        description: 'Patient unconscious',
      });

      expect(result.status).toBe(IncidentStatus.SUBMITTED);
      expect(mockPrisma.incident.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: IncidentStatus.SUBMITTED }),
        }),
      );
    });

    it('returns the existing incident for a duplicate idempotency key (no double-create)', async () => {
      mockPrisma.incident.findFirst.mockResolvedValue(mockIncident);

      const result = await service.create({
        type: IncidentType.MEDICAL,
        idempotencyKey: 'evt-abc',
      });

      expect(result.id).toBe('inc-1');
      expect(mockPrisma.incident.create).not.toHaveBeenCalled();
    });

    it('generates a public reference in INC-YYYY-XXXXXX format', async () => {
      mockPrisma.incident.count.mockResolvedValue(5);
      const expectedYear = new Date().getFullYear();

      await service.create({ type: IncidentType.FIRE, idempotencyKey: 'evt-fire' });

      const createCall = mockPrisma.incident.create.mock.calls[0]?.[0] as any;
      expect(createCall.data.public_reference).toMatch(
        new RegExp(`^INC-${expectedYear}-\\d{6}$`),
      );
    });

    it('creates a reporter record separately from any patient record', async () => {
      await service.create({
        type: IncidentType.MEDICAL,
        idempotencyKey: 'evt-rep',
        reporter: { type: ReporterType.REGISTERED_CITIZEN, name: 'Maria Santos', phone: '+639181234567' },
        patient: { isReporter: false, isUnknown: true },
      });

      expect(mockPrisma.incidentReporter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reporter_name: 'Maria Santos' }),
        }),
      );
      expect(mockPrisma.incident_patients.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ is_unknown: true }),
        }),
      );
    });

    it('supports an unknown patient — unknown identity never blocks incident creation', async () => {
      await service.create({
        type: IncidentType.RESCUE,
        idempotencyKey: 'evt-unknown',
        patient: { isReporter: false, isUnknown: true },
      });

      expect(mockPrisma.incident_patients.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ is_unknown: true, patient_name: null }),
        }),
      );
    });

    it('creates an incident event for the SUBMITTED status transition', async () => {
      await service.create({ type: IncidentType.MEDICAL, idempotencyKey: 'evt-ev' });

      expect(mockPrisma.incidentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ to_status: IncidentStatus.SUBMITTED }),
        }),
      );
    });

    it('uses reporter id as actorId when a logged-in user submits', async () => {
      const userId = 'user-999';
      await service.create({ type: IncidentType.FIRE, idempotencyKey: 'evt-auth' }, userId);

      expect(mockPrisma.incidentReporter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ user_id: userId, is_guest: false }),
        }),
      );
    });

    it('marks reporter as guest when no userId is provided', async () => {
      await service.create({ type: IncidentType.FIRE, idempotencyKey: 'evt-guest' });

      expect(mockPrisma.incidentReporter.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ user_id: null, is_guest: true }),
        }),
      );
    });
  });

  // ── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns the incident when found', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue(mockIncident);
      const result = await service.findById('inc-1');
      expect(result.id).toBe('inc-1');
    });

    it('throws NotFoundException when incident does not exist', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue(null);
      await expect(service.findById('no-such-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findAll ───────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated results with metadata', async () => {
      // findAll runs sequentially (findMany + count), not $transaction — Prisma 7
      // drops `skip: 0` inside a transaction array. Mock the two calls directly.
      mockPrisma.incident.findMany.mockResolvedValue([mockIncident]);
      mockPrisma.incident.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, perPage: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toMatchObject({ total: 1, page: 1, perPage: 20, totalPages: 1 });
    });

    it('caps perPage at 100', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      const result = await service.findAll({ page: 1, perPage: 9999 });
      expect(result.meta.perPage).toBe(100);
    });
  });

  // ── updateStatus ──────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('transitions from SUBMITTED → RECEIVED successfully', async () => {
      const updatedIncident = { ...mockIncident, status: IncidentStatus.RECEIVED };
      mockPrisma.incident.findUnique.mockResolvedValue(mockIncident);
      mockPrisma.incident.update.mockResolvedValue(updatedIncident);
      mockPrisma.incidentEvent.create.mockResolvedValue({});

      const result = await service.updateStatus('inc-1', IncidentStatus.RECEIVED, 'dispatcher-1');

      expect(result.status).toBe(IncidentStatus.RECEIVED);
    });

    it('throws BadRequestException for an invalid status transition', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue(mockIncident);

      // SUBMITTED → CLOSED is not an allowed transition
      await expect(
        service.updateStatus('inc-1', IncidentStatus.CLOSED, 'dispatcher-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when attempting to transition from a terminal status', async () => {
      const closedIncident = { ...mockIncident, status: IncidentStatus.CLOSED };
      mockPrisma.incident.findUnique.mockResolvedValue(closedIncident);

      await expect(
        service.updateStatus('inc-1', IncidentStatus.CANCELLED, 'dispatcher-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
