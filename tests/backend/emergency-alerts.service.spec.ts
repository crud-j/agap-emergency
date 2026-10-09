import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { EmergencyAlertsService } from '@backend/emergency-alerts/emergency-alerts.service';
import { PrismaService } from '@backend/common/prisma/prisma.service';
import { RealtimeService } from '@backend/realtime/realtime.service';
import { QUEUE_NAMES, IncidentStatus, IncidentType } from '@agap/shared';
import { createMockPrisma } from './helpers/prisma.mock';

describe('EmergencyAlertsService', () => {
  let service: EmergencyAlertsService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockSmsQueue: { add: jest.Mock };
  let mockNotificationQueue: { add: jest.Mock };
  let mockSlaQueue: { add: jest.Mock };
  let mockRealtimeService: { notifyIncidentCreated: jest.Mock };

  const mockIncident = {
    id: 'inc-sos-1',
    public_reference: 'INC-2026-000001',
    category: 'MEDICAL',
    status: IncidentStatus.SUBMITTED,
    priority: 'HIGH',
    client_event_id: 'client-evt-1',
    description: null,
    created_at: new Date(),
    incident_locations: [],
    incident_reporters: [],
  };

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockSmsQueue = { add: jest.fn().mockResolvedValue({}) };
    mockNotificationQueue = { add: jest.fn().mockResolvedValue({}) };
    mockSlaQueue = { add: jest.fn().mockResolvedValue({}) };
    mockRealtimeService = { notifyIncidentCreated: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmergencyAlertsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeService, useValue: mockRealtimeService },
        { provide: getQueueToken(QUEUE_NAMES.SMS), useValue: mockSmsQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATIONS), useValue: mockNotificationQueue },
        { provide: getQueueToken(QUEUE_NAMES.SLA_MONITOR), useValue: mockSlaQueue },
      ],
    })
      .setLogger({ log: () => {}, error: () => {}, warn: () => {}, debug: () => {}, verbose: () => {} })
      .compile();

    service = module.get<EmergencyAlertsService>(EmergencyAlertsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── createFromSos ─────────────────────────────────────────────────────────

  describe('createFromSos', () => {
    beforeEach(() => {
      mockPrisma.incident.findFirst.mockResolvedValue(null);
      mockPrisma.incident.count.mockResolvedValue(0);
      mockPrisma.incident.create.mockResolvedValue(mockIncident);
      mockPrisma.incidentReporter.create.mockResolvedValue({});
      mockPrisma.incident_patients.create.mockResolvedValue({});
      mockPrisma.incident_locations.create.mockResolvedValue({});
      mockPrisma.alert_triggers.create.mockResolvedValue({});
      mockPrisma.incidentEvent.create.mockResolvedValue({});
    });

    it('creates an incident with SUBMITTED status', async () => {
      const result = await service.createFromSos(
        { incidentType: IncidentType.MEDICAL, clientEventId: 'new-evt' },
        'SOS_BUTTON',
        'user-1',
      );

      expect(result.incident.status).toBe(IncidentStatus.SUBMITTED);
      expect(result.duplicate).toBe(false);
    });

    it('returns the existing incident (duplicate:true) when the same clientEventId is resubmitted', async () => {
      mockPrisma.incident.findFirst.mockResolvedValue(mockIncident);

      const result = await service.createFromSos(
        { incidentType: IncidentType.MEDICAL, clientEventId: 'client-evt-1' },
        'SOS_BUTTON',
        'user-1',
      );

      expect(result.duplicate).toBe(true);
      expect(result.incident.id).toBe('inc-sos-1');
      expect(mockPrisma.incident.create).not.toHaveBeenCalled();
    });

    it('generates a client event id when none is provided (supports no-connectivity trigger)', async () => {
      await service.createFromSos(
        { incidentType: IncidentType.MEDICAL },
        'SOS_BUTTON',
      );

      // Without a clientEventId the service generates one — idempotency key is set
      const createCall = mockPrisma.incident.create.mock.calls[0]?.[0] as any;
      expect(createCall?.data?.client_event_id).toBeDefined();
    });

    it('creates a patient record — reporter and patient are always separate', async () => {
      await service.createFromSos(
        {
          incidentType: IncidentType.MEDICAL,
          clientEventId: 'evt-patient',
          patientIsReporter: false,
          patientIsUnknown: true,
        },
        'SOS_BUTTON',
        'user-1',
      );

      expect(mockPrisma.incident_patients.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ is_unknown: true }),
        }),
      );
    });

    it('creates a location record when GPS coordinates are provided', async () => {
      await service.createFromSos(
        {
          incidentType: IncidentType.MEDICAL,
          clientEventId: 'evt-loc',
          latitude: 14.7997,
          longitude: 120.8847,
          accuracyMeters: 5,
        },
        'SOS_BUTTON',
        'user-1',
      );

      expect(mockPrisma.incident_locations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            latitude: 14.7997,
            longitude: 120.8847,
          }),
        }),
      );
    });

    it('skips location record when GPS is not available — GPS must never block submission', async () => {
      await service.createFromSos(
        { incidentType: IncidentType.FLOOD, clientEventId: 'evt-no-gps' },
        'SOS_BUTTON',
        'user-1',
      );

      expect(mockPrisma.incident_locations.create).not.toHaveBeenCalled();
    });

    it('queues an SMS alert to the operations center', async () => {
      await service.createFromSos(
        { incidentType: IncidentType.FIRE, clientEventId: 'evt-sms' },
        'SOS_BUTTON',
        'user-1',
      );

      expect(mockSmsQueue.add).toHaveBeenCalledWith(
        'emergency-sms',
        expect.objectContaining({ incidentId: mockIncident.id }),
      );
    });

    it('queues an ops-center push notification', async () => {
      await service.createFromSos(
        { incidentType: IncidentType.FIRE, clientEventId: 'evt-push' },
        'SOS_BUTTON',
        'user-1',
      );

      expect(mockNotificationQueue.add).toHaveBeenCalledWith(
        'ops-center-alert',
        expect.objectContaining({ data: expect.objectContaining({ incidentId: mockIncident.id }) }),
      );
    });

    it('queues an SLA monitor job', async () => {
      await service.createFromSos(
        { incidentType: IncidentType.MEDICAL, clientEventId: 'evt-sla' },
        'SOS_BUTTON',
        'user-1',
      );

      expect(mockSlaQueue.add).toHaveBeenCalledWith(
        'sla-monitor',
        expect.objectContaining({ incidentId: mockIncident.id }),
        expect.objectContaining({ delay: expect.any(Number) }),
      );
    });

    it('incident persists even if realtime notification throws', async () => {
      mockRealtimeService.notifyIncidentCreated.mockImplementation(() => {
        throw new Error('WebSocket unavailable');
      });

      const result = await service.createFromSos(
        { incidentType: IncidentType.MEDICAL, clientEventId: 'evt-ws-fail' },
        'SOS_BUTTON',
        'user-1',
      );

      // Incident must still be returned — realtime failure must never cancel it
      expect(result.incident.id).toBe('inc-sos-1');
    });

    it('works with SHAKE_GESTURE trigger method', async () => {
      await service.createFromSos(
        { incidentType: IncidentType.MEDICAL, clientEventId: 'evt-shake' },
        'SHAKE_GESTURE',
        'user-1',
      );

      const createCall = mockPrisma.incident.create.mock.calls[0]?.[0] as any;
      expect(createCall.data.trigger_method).toBe('SHAKE_GESTURE');
    });

    it('SMS payload is at most 160 characters (single-segment delivery)', async () => {
      await service.createFromSos(
        {
          incidentType: IncidentType.ROAD_ACCIDENT,
          clientEventId: 'evt-sms-len',
          latitude: 14.7997,
          longitude: 120.8847,
        },
        'SOS_BUTTON',
      );

      const smsCall = mockSmsQueue.add.mock.calls[0]?.[1] as any;
      expect(smsCall?.message?.length).toBeLessThanOrEqual(160);
    });

    it('SMS payload follows the dual-path format AGAP|REF|lat,lng|ts|TYPE|C:Y', async () => {
      await service.createFromSos(
        {
          incidentType: IncidentType.ROAD_ACCIDENT,
          clientEventId: 'evt-sms-fmt',
          latitude: 14.7997,
          longitude: 120.8847,
        },
        'SOS_BUTTON',
      );

      const smsCall = mockSmsQueue.add.mock.calls[0]?.[1] as any;
      const message: string = smsCall.message;

      // AGAP | INC-YYYY-NNNNNN | lat,lng (4dp) | unix-ts | CATEGORY | C:Y|C:N
      expect(message).toMatch(
        /^AGAP\|INC-\d{4}-[A-Z0-9]+\|-?\d+\.\d{4},-?\d+\.\d{4}\|\d+\|[A-Z_]+\|C:[YN]$/,
      );

      const parts = message.split('|');
      expect(parts).toHaveLength(6);
      expect(parts[0]).toBe('AGAP');
      expect(parts[5]).toBe('C:Y'); // coordinates were supplied
      expect(message.length).toBeLessThanOrEqual(160);
    });

    it('SMS payload marks C:N when no coordinates are supplied', async () => {
      await service.createFromSos(
        { incidentType: IncidentType.FLOOD, clientEventId: 'evt-sms-nocoords' },
        'SOS_BUTTON',
      );

      const smsCall = mockSmsQueue.add.mock.calls[0]?.[1] as any;
      const message: string = smsCall.message;
      expect(message.endsWith('|C:N')).toBe(true);
      expect(message.length).toBeLessThanOrEqual(160);
    });

    it('still returns the incident when the SMS enqueue throws — SMS never blocks an incident', async () => {
      mockSmsQueue.add.mockRejectedValueOnce(new Error('queue down'));

      const result = await service.createFromSos(
        { incidentType: IncidentType.MEDICAL, clientEventId: 'evt-sms-throw' },
        'SOS_BUTTON',
        'user-1',
      );

      expect(result.incident.id).toBe('inc-sos-1');
    });
  });
});
