import { Test, TestingModule } from '@nestjs/testing';
import { IncidentsService } from '../../src/incidents/incidents.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';
import { DuplicateDetectionService } from '../../src/incidents/duplicate-detection/duplicate-detection.service';
import { PriorityService } from '../../src/incidents/priority/priority.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { RealtimeService } from '../../src/realtime/realtime.service';
import { AuditService } from '../../src/audit/audit.service';
import { EmergencyContactNotificationService } from '../../src/emergency-contacts/emergency-contact-notification.service';
import {
  IncidentType,
  IncidentStatus,
  IncidentPriority,
  ReporterStatus,
  ReporterType,
  UserRole,
} from '@agap/shared';
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
    incident_details: { create: jest.fn().mockResolvedValue({}) },
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
  $queryRaw: jest.fn().mockResolvedValue([]),
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
        { type: IncidentType.FIRE, idempotencyKey },
        'user-id-123',
        UserRole.CITIZEN,
      );

      expect(result).toBeDefined();
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('creates an incident for a guest/bystander without authentication', async () => {
      const idempotencyKey = uuidv4();

      const result = await service.create(
        {
          type: IncidentType.FIRE,
          idempotencyKey,
          reporter: { type: ReporterType.GUEST_REPORTER },
          lat: 14.7963,
          lng: 120.9272,
        },
        undefined, // No actorId — guest reporter
      );

      expect(result).toBeDefined();
    });

    it('returns the existing incident on a duplicate idempotency key', async () => {
      const idempotencyKey = uuidv4();
      const existing = mockIncident({ client_event_id: idempotencyKey });
      mockPrisma.incident.findFirst.mockResolvedValue(existing);

      const result = await service.create(
        {
          type: IncidentType.FIRE,
          idempotencyKey,
          lat: 14.7963,
          lng: 120.9272,
        },
      );

      expect(result).toEqual(existing);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates a registered incident without location (GPS is best-effort)', async () => {
      const idempotencyKey = uuidv4();

      const result = await service.create({
        type: IncidentType.FIRE,
        idempotencyKey,
        // No lat/lng — GPS is optional and must never block submission.
      }, 'registered-user-id');

      expect(result).toBeDefined();
    });

    it('requires Bocaue GPS coordinates for a guest report', async () => {
      await expect(
        service.create({
          type: IncidentType.FIRE,
          idempotencyKey: uuidv4(),
          reporter: { type: ReporterType.GUEST_REPORTER },
        }),
      ).rejects.toThrow(
        'Guest emergency reports require GPS coordinates within Bocaue Municipality, Bulacan.',
      );

      expect(mockPrisma.incident.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows a guest report for a medical emergency with valid Bocaue GPS', async () => {
      await expect(service.create({
        type: IncidentType.MEDICAL,
        idempotencyKey: uuidv4(),
        lat: 14.7963,
        lng: 120.9272,
      })).resolves.toMatchObject({ status: IncidentStatus.SUBMITTED });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('rejects coordinates outside Bocaue without creating an incident', async () => {
      await expect(
        service.create({
          type: IncidentType.FIRE,
          idempotencyKey: uuidv4(),
          lat: 14.765,
          lng: 120.906,
        }),
      ).rejects.toThrow('Incident location must be within Bocaue Municipality, Bulacan.');

      expect(mockPrisma.incident.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows authenticated citizens to report every supported incident category', async () => {
      for (const type of [
        IncidentType.MEDICAL,
        IncidentType.ROAD_ACCIDENT,
        IncidentType.FLOOD,
        IncidentType.RESCUE,
        IncidentType.FIRE,
        IncidentType.INDUSTRIAL,
        IncidentType.DEBRIS,
        IncidentType.OTHER,
      ]) {
        await expect(service.create(
          { type, idempotencyKey: uuidv4() },
          'citizen-id',
          UserRole.CITIZEN,
        )).resolves.toBeDefined();
      }
    });

    it('requires latitude and longitude to be provided together', async () => {
      await expect(
        service.create({
          type: IncidentType.FIRE,
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
          lat: 14.7963,
          lng: 120.9272,
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
        lat: 14.7963,
        lng: 120.9272,
      }, 'registered-user-id', UserRole.SYSTEM_ADMINISTRATOR);

      expect(capturedPatient?.is_unknown).toBe(true);
    });

    it('preserves affected-count ranges without fabricating a numeric patient count', async () => {
      const cases = [
        { bucket: '1', numericCount: 1 },
        { bucket: '2-5', numericCount: null },
        { bucket: '5+', numericCount: null },
        { bucket: 'unknown', numericCount: null },
      ];

      for (const { bucket, numericCount } of cases) {
        let capturedIncident: Record<string, unknown> | undefined;
        const tx = makeTx({
          incident: {
            create: jest.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
              capturedIncident = args.data;
              return Promise.resolve(mockIncident());
            }),
          },
        });
        mockPrisma.$transaction.mockImplementation((fn: (t: any) => unknown) => fn(tx));

        await service.create({
          type: IncidentType.FIRE,
          idempotencyKey: uuidv4(),
          reporter: { type: ReporterType.GUEST_REPORTER },
          lat: 14.7963,
          lng: 120.9272,
          affectedCount: bucket,
        });

        expect(capturedIncident?.number_of_patients).toBe(numericCount);
        expect(capturedIncident?.hazard_flags).toContain(`AFFECTED_COUNT:${bucket}`);
      }
    });
  });

  describe('create — caller intake (MOD-09)', () => {
    function captureTx() {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementationOnce((fn: (t: any) => unknown) => fn(tx));
      return tx;
    }

    const base = () => ({
      idempotencyKey: uuidv4(),
      reporter: { type: ReporterType.GUEST_REPORTER },
      lat: 14.7963,
      lng: 120.9272,
    });

    it('stores only answers the shared catalog defines', async () => {
      const tx = captureTx();
      await service.create({
        ...base(),
        type: IncidentType.ROAD_ACCIDENT,
        intake: {
          answers: {
            injured: ['yes', 'made-up'],
            traffic: ['full', 'lane'], // single-select: first valid value only
            invented_question: ['yes'],
          },
        },
      });

      const details = tx.incident_details.create.mock.calls[0][0].data;
      expect(details.caller_answers).toEqual({ injured: ['yes'], traffic: ['full'] });
      expect(details.road_blocked).toBe(true);
      const flags = tx.incident.create.mock.calls[0][0].data.hazard_flags;
      expect(flags).toEqual(expect.arrayContaining(['Injured people: Yes', 'Traffic: Fully blocked']));
      expect(flags.join(' ')).not.toContain('invented');
    });

    it('files a natural disaster with flooding as FLOOD, and without flooding as NATURAL_DISASTER', async () => {
      let tx = captureTx();
      await service.create({
        ...base(),
        type: IncidentType.NATURAL_DISASTER,
        intake: { answers: { event: ['flood', 'wind'], water_level: ['knee'] } },
      });
      expect(tx.incident.create.mock.calls[0][0].data.category).toBe(IncidentType.FLOOD);

      tx = captureTx();
      await service.create({
        ...base(),
        type: IncidentType.NATURAL_DISASTER,
        // water_level is only asked for flooding, so it is dropped here.
        intake: { answers: { event: ['tree'], water_level: ['knee'] } },
      });
      const data = tx.incident.create.mock.calls[0][0].data;
      expect(data.category).toBe(IncidentType.NATURAL_DISASTER);
      expect(tx.incident_details.create.mock.calls[0][0].data.caller_answers).toEqual({ event: ['tree'] });
    });

    it('raises the recommended priority to CRITICAL and records the reason', async () => {
      const tx = captureTx();
      await service.create({
        ...base(),
        type: IncidentType.ROAD_ACCIDENT,
        intake: { answers: { pinned: ['yes'] } },
      });

      expect(tx.incident.create.mock.calls[0][0].data.priority).toBe(IncidentPriority.CRITICAL);
      expect(tx.incident_details.create.mock.calls[0][0].data.priority_reasons).toEqual([
        'Person pinned in a vehicle',
      ]);
    });

    it('keeps the category default when answers carry no escalation signal', async () => {
      const tx = captureTx();
      await service.create({
        ...base(),
        type: IncidentType.FIRE,
        intake: { answers: { trapped: ['unknown'] } },
      });
      expect(tx.incident.create.mock.calls[0][0].data.priority).toBe(IncidentPriority.HIGH);
    });

    it('stores the landmark and reporter status, and creates no patient for a safe reporter', async () => {
      const tx = captureTx();
      await service.create({
        ...base(),
        type: IncidentType.FIRE,
        intake: { reporterStatus: ReporterStatus.SAFE, landmark: '  Beside the barangay hall  ' },
      });

      expect(tx.incidentReporter.create.mock.calls[0][0].data.reporter_status).toBe(ReporterStatus.SAFE);
      expect(tx.incident_locations.create.mock.calls[0][0].data.landmark).toBe('Beside the barangay hall');
      expect(tx.incident_patients.create).not.toHaveBeenCalled();
      expect(tx.incident_details.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns guest reporter flags for the operations queue without reporter contact details', async () => {
      await service.findAll({});

      // Only the guest flag, the reporter's safety status, and the account's sex
      // (for reporter_sex) are loaded — no reporter name, phone or callback number.
      expect(mockPrisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            incident_locations: true,
            incident_reporters: {
              select: { is_guest: true, reporter_status: true, users: { select: { sex: true } } },
            },
            incident_details: { select: { priority_reasons: true } },
            barangay_notices: expect.any(Object),
          },
        }),
      );
    });

    it('exposes the derived reporter_sex and strips the raw account value', async () => {
      mockPrisma.incident.findMany.mockResolvedValueOnce([
        { id: 'a', incident_reporters: { is_guest: false, users: { sex: 'FEMALE' } } },
        { id: 'b', incident_reporters: { is_guest: false, users: { sex: 'PREFER_NOT_TO_SAY' } } },
        { id: 'c', incident_reporters: { is_guest: true, users: null } },
      ]);

      const { data } = await service.findAll({});

      expect(data.map((i: any) => i.reporter_sex)).toEqual(['FEMALE', null, null]);
      expect(data[1]!.incident_reporters).toEqual({ is_guest: false });
      expect(JSON.stringify(data)).not.toContain('PREFER_NOT_TO_SAY');
    });

    it('filters the operations archive to the requested terminal incident statuses', async () => {
      const statuses = [IncidentStatus.CLOSED, IncidentStatus.FALSE_ALERT];

      await service.findAll({ statuses });

      expect(mockPrisma.incident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: { in: statuses } } }),
      );
      expect(mockPrisma.incident.count).toHaveBeenCalledWith({
        where: { status: { in: statuses } },
      });
    });
  });
});
