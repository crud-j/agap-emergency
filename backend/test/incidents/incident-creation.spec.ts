import { Test, TestingModule } from '@nestjs/testing';
import { IncidentsService } from '../../src/incidents/incidents.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';
import { DuplicateDetectionService } from '../../src/incidents/duplicate-detection/duplicate-detection.service';
import { PriorityService } from '../../src/incidents/priority/priority.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { IncidentType, IncidentStatus, ReporterType } from '@agap/shared';
import { v4 as uuidv4 } from 'uuid';

const mockPrisma = {
  incident: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  incidentReporter: { create: jest.fn() },
  patient: { create: jest.fn() },
  incidentStatusHistory: { create: jest.fn() },
  $transaction: jest.fn((fn: (tx: any) => unknown) =>
    fn({
      incident: { create: jest.fn().mockResolvedValue(mockIncident()), update: jest.fn() },
      incidentReporter: { create: jest.fn() },
      patient: { create: jest.fn() },
      incidentStatusHistory: { create: jest.fn() },
    }),
  ),
};

function mockIncident(overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv4(),
    ticketNumber: 'INC-20260918-0001',
    type: IncidentType.MEDICAL,
    status: IncidentStatus.NEW,
    idempotencyKey: uuidv4(),
    reportedAt: new Date(),
    ...overrides,
  };
}

describe('IncidentsService', () => {
  let service: IncidentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IncidentsService,
        IncidentStatusService,
        DuplicateDetectionService,
        PriorityService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<IncidentsService>(IncidentsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a new incident for a registered citizen', async () => {
      const idempotencyKey = uuidv4();
      mockPrisma.incident.findUnique.mockResolvedValue(null);
      mockPrisma.incident.findMany.mockResolvedValue([]);
      mockPrisma.incident.count.mockResolvedValue(0);

      const result = await service.create(
        { type: IncidentType.MEDICAL, idempotencyKey },
        'user-id-123',
      );

      expect(result).toBeDefined();
    });

    it('creates an incident for a guest/bystander without authentication', async () => {
      const idempotencyKey = uuidv4();
      mockPrisma.incident.findUnique.mockResolvedValue(null);
      mockPrisma.incident.findMany.mockResolvedValue([]);
      mockPrisma.incident.count.mockResolvedValue(0);

      const result = await service.create(
        {
          type: IncidentType.MEDICAL,
          idempotencyKey,
          reporter: { type: ReporterType.GUEST_REPORTER },
        },
        undefined, // No actorId — guest reporter
      );

      expect(result).toBeDefined();
    });

    it('returns existing incident on duplicate idempotency key', async () => {
      const idempotencyKey = uuidv4();
      const existing = mockIncident({ idempotencyKey });
      mockPrisma.incident.findUnique.mockResolvedValue(existing);

      const result = await service.create({ type: IncidentType.MEDICAL, idempotencyKey });

      expect(result).toEqual(existing);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates incident without location (GPS is best-effort)', async () => {
      const idempotencyKey = uuidv4();
      mockPrisma.incident.findUnique.mockResolvedValue(null);
      mockPrisma.incident.count.mockResolvedValue(0);

      const result = await service.create({
        type: IncidentType.FIRE,
        idempotencyKey,
        // No lat/lng — GPS is optional
      });

      expect(result).toBeDefined();
    });

    it('separates reporter and patient correctly', async () => {
      const idempotencyKey = uuidv4();
      mockPrisma.incident.findUnique.mockResolvedValue(null);
      mockPrisma.incident.count.mockResolvedValue(0);

      let capturedReporter: any;
      let capturedPatient: any;

      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          incident: {
            create: jest.fn().mockResolvedValue(mockIncident({ idempotencyKey })),
          },
          incidentReporter: {
            create: jest.fn().mockImplementation((args: any) => {
              capturedReporter = args.data;
              return Promise.resolve({});
            }),
          },
          patient: {
            create: jest.fn().mockImplementation((args: any) => {
              capturedPatient = args.data;
              return Promise.resolve({});
            }),
          },
          incidentStatusHistory: { create: jest.fn() },
        };
        return fn(tx);
      });

      await service.create(
        {
          type: IncidentType.VEHICULAR_ACCIDENT,
          idempotencyKey,
          reporter: { type: ReporterType.BYSTANDER, name: 'Juan dela Cruz' },
          patient: { isReporter: false, isUnknown: false, name: 'Maria Santos', age: 35 },
        },
        undefined,
      );

      expect(capturedReporter?.type).toBe(ReporterType.BYSTANDER);
      expect(capturedPatient?.isReporter).toBe(false);
      expect(capturedPatient?.name).toBe('Maria Santos');
    });

    it('allows unknown patient information', async () => {
      const idempotencyKey = uuidv4();
      mockPrisma.incident.findUnique.mockResolvedValue(null);
      mockPrisma.incident.count.mockResolvedValue(0);

      let capturedPatient: any;
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          incident: { create: jest.fn().mockResolvedValue(mockIncident()) },
          incidentReporter: { create: jest.fn() },
          patient: {
            create: jest.fn().mockImplementation((args: any) => {
              capturedPatient = args.data;
              return Promise.resolve({});
            }),
          },
          incidentStatusHistory: { create: jest.fn() },
        };
        return fn(tx);
      });

      await service.create({
        type: IncidentType.MEDICAL,
        idempotencyKey,
        patient: { isReporter: false, isUnknown: true },
      });

      expect(capturedPatient?.isUnknown).toBe(true);
    });
  });
});
