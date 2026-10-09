import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { IncidentHandoverService } from '../../src/incidents/incident-handover/incident-handover.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AuditService } from '../../src/audit/audit.service';
import { RealtimeService } from '../../src/realtime/realtime.service';
import { v4 as uuidv4 } from 'uuid';

const INCIDENT_ID = uuidv4();
const FROM_USER   = uuidv4();
const TO_USER     = uuidv4();
const HANDOVER_ID = uuidv4();

function mockHandover(overrides: Record<string, unknown> = {}) {
  return {
    id: HANDOVER_ID,
    incident_id: INCIDENT_ID,
    from_user_id: FROM_USER,
    to_user_id: TO_USER,
    situation_summary: 'Victim extracted, en route to hospital',
    pending_actions: ['Confirm ETA', 'Notify hospital'],
    resources_in_field: null,
    handed_over_at: new Date(),
    acknowledged_at: null,
    ...overrides,
  };
}

const mockPrisma = {
  incident: { findUnique: jest.fn() },
  incident_handovers: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

const mockAudit   = { log: jest.fn().mockResolvedValue(undefined) };
const mockRealtime = { incidentHandover: jest.fn() };

describe('IncidentHandoverService — MOD-44', () => {
  let service: IncidentHandoverService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentHandoverService,
        { provide: PrismaService,  useValue: mockPrisma },
        { provide: AuditService,   useValue: mockAudit },
        { provide: RealtimeService, useValue: mockRealtime },
      ],
    }).compile();

    service = module.get<IncidentHandoverService>(IncidentHandoverService);
    jest.clearAllMocks();
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a handover record with audit + realtime emit', async () => {
      const incident = { id: INCIDENT_ID, status: 'ON_SCENE' };
      mockPrisma.incident.findUnique.mockResolvedValue(incident);
      const handover = mockHandover();
      mockPrisma.incident_handovers.create.mockResolvedValue(handover);

      const result = await service.create(
        INCIDENT_ID,
        { toUserId: TO_USER, situationSummary: 'Victim extracted', pendingActions: ['Notify hospital'] },
        FROM_USER,
      );

      expect(result.id).toBe(HANDOVER_ID);
      expect(mockPrisma.incident_handovers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            incident_id: INCIDENT_ID,
            from_user_id: FROM_USER,
            to_user_id: TO_USER,
          }),
        }),
      );
      // audit is fire-and-forget (void), but should eventually be called
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ moduleId: 'MOD-44', incidentId: INCIDENT_ID }),
      );
      expect(mockRealtime.incidentHandover).toHaveBeenCalledWith(
        INCIDENT_ID,
        expect.objectContaining({ handoverId: HANDOVER_ID, fromUserId: FROM_USER, toUserId: TO_USER }),
      );
    });

    it('throws NotFoundException when incident does not exist', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue(null);
      await expect(
        service.create(INCIDENT_ID, { toUserId: TO_USER, situationSummary: 'x' }, FROM_USER),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── list ────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns handovers in descending order', async () => {
      const handovers = [mockHandover(), mockHandover({ id: uuidv4() })];
      mockPrisma.incident_handovers.findMany.mockResolvedValue(handovers);

      const result = await service.list(INCIDENT_ID);

      expect(result).toHaveLength(2);
      expect(mockPrisma.incident_handovers.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { incident_id: INCIDENT_ID },
          orderBy: { handed_over_at: 'desc' },
        }),
      );
    });
  });

  // ── acknowledge ─────────────────────────────────────────────────────────────

  describe('acknowledge', () => {
    it('stamps acknowledged_at and emits realtime event', async () => {
      const pending = mockHandover();
      mockPrisma.incident_handovers.findFirst.mockResolvedValue(pending);
      const acknowledgedAt = new Date();
      const acked = { ...pending, acknowledged_at: acknowledgedAt };
      mockPrisma.incident_handovers.update.mockResolvedValue(acked);

      const result = await service.acknowledge(INCIDENT_ID, TO_USER);

      expect(result.acknowledged_at).toBeDefined();
      expect(mockPrisma.incident_handovers.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: HANDOVER_ID },
          data: expect.objectContaining({ acknowledged_at: expect.any(Date) }),
        }),
      );
      expect(mockRealtime.incidentHandover).toHaveBeenCalledWith(
        INCIDENT_ID,
        expect.objectContaining({ handoverId: HANDOVER_ID, acknowledgedBy: TO_USER }),
      );
    });

    it('throws NotFoundException when no pending handover exists for user', async () => {
      mockPrisma.incident_handovers.findFirst.mockResolvedValue(null);
      await expect(service.acknowledge(INCIDENT_ID, TO_USER)).rejects.toThrow(NotFoundException);
    });
  });
});

