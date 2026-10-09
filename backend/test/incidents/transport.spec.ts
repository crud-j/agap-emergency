import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransportService } from '../../src/incidents/transport/transport.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AuditService } from '../../src/audit/audit.service';
import { RealtimeService } from '../../src/realtime/realtime.service';
import { IncidentStatus } from '@agap/shared';
import { v4 as uuidv4 } from 'uuid';

const INCIDENT_ID   = uuidv4();
const DISPATCH_ID   = uuidv4();
const TRANSPORT_ID  = uuidv4();
const FACILITY_ID   = uuidv4();
const ACTOR_ID      = uuidv4();

function mockTransportRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSPORT_ID,
    incident_id: INCIDENT_ID,
    dispatch_id: DISPATCH_ID,
    patient_id: null,
    destination_id: FACILITY_ID,
    transport_started_at: new Date(),
    estimated_arrival_at: null,
    arrived_at: null,
    handover_completed_at: null,
    destination_changed: false,
    change_reason: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

const mockStatusService = { validateTransition: jest.fn() }; // synchronous, throws on invalid
const mockAudit         = { log: jest.fn().mockResolvedValue(undefined) };
const mockRealtime      = { incidentTransporting: jest.fn(), facilityArrival: jest.fn(), incidentUpdated: jest.fn(), statusChanged: jest.fn() };

const mockPrisma = {
  incident: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
  dispatches: { findUnique: jest.fn() },
  facility: { findUnique: jest.fn() },
  transportRecord: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

describe('TransportService — MOD-40', () => {
  let service: TransportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransportService,
        { provide: PrismaService,          useValue: mockPrisma },
        { provide: AuditService,           useValue: mockAudit },
        { provide: RealtimeService,        useValue: mockRealtime },
        { provide: IncidentStatusService,  useValue: mockStatusService },
      ],
    }).compile();

    service = module.get<TransportService>(TransportService);
    jest.clearAllMocks();
  });

  // ── startTransport ──────────────────────────────────────────────────────────

  describe('startTransport', () => {
    it('creates transport record, transitions status to TRANSPORTING, audits, emits', async () => {
      const incident = { id: INCIDENT_ID, status: IncidentStatus.ON_SCENE };
      const dispatch  = { id: DISPATCH_ID, incident_id: INCIDENT_ID, status: 'ACTIVE' };
      const facility  = { name: 'Bocaue General Hospital' };
      const record    = mockTransportRecord();

      mockPrisma.incident.findUnique.mockResolvedValue(incident);
      mockPrisma.dispatches.findUnique.mockResolvedValue(dispatch);
      mockPrisma.facility.findUnique.mockResolvedValue(facility);
      mockPrisma.transportRecord.create.mockResolvedValue(record);

      const result = await service.startTransport(
        INCIDENT_ID,
        { dispatchId: DISPATCH_ID, destinationId: FACILITY_ID },
        ACTOR_ID,
      );

      expect(result.id).toBe(TRANSPORT_ID);

      // Status validation + incident update must fire
      expect(mockStatusService.validateTransition).toHaveBeenCalledWith(
        IncidentStatus.ON_SCENE,
        IncidentStatus.TRANSPORTING,
      );

      // Audit must fire
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ moduleId: 'MOD-40', incidentId: INCIDENT_ID }),
      );

      // incident.transporting event must be emitted
      expect(mockRealtime.incidentTransporting).toHaveBeenCalledWith(
        expect.objectContaining({
          incidentId: INCIDENT_ID,
          transportId: TRANSPORT_ID,
          dispatchId: DISPATCH_ID,
          destinationId: FACILITY_ID,
          destinationName: 'Bocaue General Hospital',
        }),
      );
    });

    it('does NOT transition to TRANSPORTING when incident is already in a later status', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID, status: IncidentStatus.RESOLVED });
      mockPrisma.dispatches.findUnique.mockResolvedValue({ id: DISPATCH_ID, incident_id: INCIDENT_ID });
      mockPrisma.facility.findUnique.mockResolvedValue(null);
      mockPrisma.transportRecord.create.mockResolvedValue(mockTransportRecord());

      await service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID);

      expect(mockStatusService.validateTransition).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when dispatch does not belong to incident', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID, status: 'ON_SCENE' });
      mockPrisma.dispatches.findUnique.mockResolvedValue({ id: DISPATCH_ID, incident_id: uuidv4() });

      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when incident does not exist', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue(null);
      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── recordArrival ────────────────────────────────────────────────────────────

  describe('recordArrival', () => {
    it('stamps arrived_at, audits, emits facility_arrival', async () => {
      const record  = mockTransportRecord();
      const updated = { ...record, arrived_at: new Date() };

      mockPrisma.transportRecord.findUnique.mockResolvedValue(record);
      mockPrisma.transportRecord.update.mockResolvedValue(updated);

      const result = await service.recordArrival(INCIDENT_ID, TRANSPORT_ID, {}, ACTOR_ID);

      expect(result.arrived_at).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ moduleId: 'MOD-40', incidentId: INCIDENT_ID }),
      );
      expect(mockRealtime.facilityArrival).toHaveBeenCalledWith(
        expect.objectContaining({ incidentId: INCIDENT_ID, transportId: TRANSPORT_ID }),
      );
    });

    it('throws BadRequestException when arrival already recorded', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(
        mockTransportRecord({ arrived_at: new Date() }),
      );
      await expect(
        service.recordArrival(INCIDENT_ID, TRANSPORT_ID, {}, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when transport record belongs to different incident', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(
        mockTransportRecord({ incident_id: uuidv4() }),
      );
      await expect(
        service.recordArrival(INCIDENT_ID, TRANSPORT_ID, {}, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── listTransports ───────────────────────────────────────────────────────────

  describe('listTransports', () => {
    it('returns transport records for incident', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID });
      mockPrisma.transportRecord.findMany.mockResolvedValue([mockTransportRecord()]);

      const result = await service.listTransports(INCIDENT_ID);

      expect(result).toHaveLength(1);
      expect(mockPrisma.transportRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { incident_id: INCIDENT_ID } }),
      );
    });

    it('throws NotFoundException when incident does not exist', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue(null);
      await expect(service.listTransports(INCIDENT_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
