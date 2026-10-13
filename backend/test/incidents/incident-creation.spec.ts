import { Test, TestingModule } from '@nestjs/testing';
import { IncidentsService } from '../../src/incidents/incidents.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';
import { DuplicateDetectionService } from '../../src/incidents/duplicate-detection/duplicate-detection.service';
import { PriorityService } from '../../src/incidents/priority/priority.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { RealtimeService } from '../../src/realtime/realtime.service';
import { AuditService } from '../../src/audit/audit.service';
import { EmergencyContactNotificationService } from '../../src/emergency-contacts/emergency-contact-notification.service';
import { IncidentType, IncidentStatus, IncidentPriority, ReporterType } from '@agap/shared';
import { v4 as uuidv4 } from 'uuid';

// The real create() runs inside prisma.$transaction(tx => ...) and calls, in order:
//   tx.incident.create · tx.incidentReporter.create · tx.incident_patients.create
//   · tx.incident_locations.create · tx.incidentEvent.create
// Build a tx stub that captures those calls so each test can assert on the
// snake_case columns the service actually persists.
function makeTx(overrides: Record<string, any> = {}) {
  return {
    incident: { create: jest.fn().mockResolvedValue(mockIncident()) },
    incidentReporter: { create: jest.fn().mockResolvedValue({}) },
    incident_patients: { create: jest.fn().mockResolvedValue({}) },
    incident_locations: { create: jest.fn().mockResolvedValue({}) },
    incidentEvent: { create: jest.fn().mockResolvedValue({}) },
    ...overrides,
  };
}

const mockPrisma = {
  incident: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn((fn: (tx: any) => unknown) => fn(makeTx())),
};

function mockIncident(overrides: Record<string, unknown> = {}) {
  return {
    id: uuidv4(),
    public_reference: 'INC-2026-000001',
    category: IncidentType.MEDICAL,
    priority: IncidentPriority.HIGH,
    status: IncidentStatus.SUBMITTED,
    client_event_id: uuidv4(),
    submitted_at: new Date(),
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
        // WebSocket distribution is best-effort and out of scope here — stub it.
        { provide: RealtimeService, useValue: { notifyIncidentCreated: jest.fn() } },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: EmergencyContactNotificationService, useValue: { notifyContactsOfIncident: jest.fn() } },
      ],
    }).compile();

    service = module.get<IncidentsService>(IncidentsService);
    jest.clearAllMocks();
    // Default happy-path: no idempotent match, no duplicates, reference counter at 0.
    mockPrisma.$transaction.mockImplementation((fn: (tx: any) => unknown) => fn(makeTx()));
    mockPrisma.incident.findFirst.mockResolvedValue(null);
    mockPrisma.incident.findMany.mockResolvedValue([]);
    mockPrisma.incident.count.mockResolvedValue(0);
  });

  describe('create', () => {
    it('creates a new incident for a registered citizen', async () => {
      const idempotencyKey = uuidv4();

      const result = await service.create(
        { type: IncidentType.MEDICAL, idempotencyKey },
        'user-id-123',
      );

      expect(result).toBeDefined();
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('creates an incident for a guest/bystander without authentication', async () => {
      const idempotencyKey = uuidv4();

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

    it('returns the existing incident on a duplicate idempotency key', async () => {
      const idempotencyKey = uuidv4();
      const existing = mockIncident({ client_event_id: idempotencyKey });
      mockPrisma.incident.findFirst.mockResolvedValue(existing);

      const result = await service.create({ type: IncidentType.MEDICAL, idempotencyKey });

      expect(result).toEqual(existing);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates an incident without location (GPS is best-effort)', async () => {
      const idempotencyKey = uuidv4();

      const result = await service.create({
        type: IncidentType.FIRE,
        idempotencyKey,
        // No lat/lng — GPS is optional and must never block submission.
      });

      expect(result).toBeDefined();
    });

    it('rejects coordinates outside Bocaue without creating an incident', async () => {
      await expect(
        service.create({
          type: IncidentType.MEDICAL,
          idempotencyKey: uuidv4(),
          lat: 14.765,
          lng: 120.906,
        }),
      ).rejects.toThrow('Incident location must be within Bocaue Municipality, Bulacan.');

      expect(mockPrisma.incident.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('requires latitude and longitude to be provided together', async () => {
      await expect(
        service.create({
          type: IncidentType.MEDICAL,
          idempotencyKey: uuidv4(),
          lat: 14.7969,
        }),
      ).rejects.toThrow('Latitude and longitude must be provided together.');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('separates reporter and patient correctly', async () => {
      const idempotencyKey = uuidv4();
      let capturedReporter: any;
      let capturedPatient: any;

      const tx = makeTx({
        incidentReporter: {
          create: jest.fn().mockImplementation((args: any) => {
            capturedReporter = args.data;
            return Promise.resolve({});
          }),
        },
        incident_patients: {
          create: jest.fn().mockImplementation((args: any) => {
            capturedPatient = args.data;
            return Promise.resolve({});
          }),
        },
      });
      mockPrisma.$transaction.mockImplementation((fn: (t: any) => unknown) => fn(tx));

      await service.create(
        {
          type: IncidentType.ROAD_ACCIDENT,
          idempotencyKey,
          reporter: { type: ReporterType.BYSTANDER, name: 'Juan dela Cruz' },
          patient: { isReporter: false, isUnknown: false, name: 'Maria Santos', age: 35 },
        },
        undefined,
      );

      // Reporter and patient are persisted as distinct records with distinct data.
      expect(capturedReporter?.reporter_name).toBe('Juan dela Cruz');
      expect(capturedReporter?.is_guest).toBe(true);
      expect(capturedPatient?.is_reporter).toBe(false);
      expect(capturedPatient?.patient_name).toBe('Maria Santos');
      expect(capturedPatient?.approximate_age).toBe(35);
    });

    it('allows unknown patient information', async () => {
      const idempotencyKey = uuidv4();
      let capturedPatient: any;

      const tx = makeTx({
        incident_patients: {
          create: jest.fn().mockImplementation((args: any) => {
            capturedPatient = args.data;
            return Promise.resolve({});
          }),
        },
      });
      mockPrisma.$transaction.mockImplementation((fn: (t: any) => unknown) => fn(tx));

      await service.create({
        type: IncidentType.MEDICAL,
        idempotencyKey,
        patient: { isReporter: false, isUnknown: true },
      });

      expect(capturedPatient?.is_unknown).toBe(true);
    });
  });
});
