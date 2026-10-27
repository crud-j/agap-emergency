import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransportService } from '../../src/incidents/transport/transport.service';
import { openTransportWhere } from '../../src/incidents/transport/open-transport';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AuditService } from '../../src/audit/audit.service';
import { RealtimeService } from '../../src/realtime/realtime.service';
import { IncidentStatus, UserRole } from '@agap/shared';
import { IncidentsController } from '../../src/incidents/incidents.controller';
import { HospitalsController } from '../../src/hospitals/hospitals.controller';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { v4 as uuidv4 } from 'uuid';

const INCIDENT_ID   = uuidv4();
const DISPATCH_ID   = uuidv4();
const TRANSPORT_ID  = uuidv4();
const FACILITY_ID   = uuidv4();
const ACTOR_ID      = uuidv4();
const HOSPITAL_ORG  = uuidv4();

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

/** A facility row as assertSelectableDestination selects it. */
function hospital(overrides: Record<string, unknown> = {}) {
  return {
    id: FACILITY_ID,
    name: 'DOH — Joni Villanueva General Hospital',
    is_active: true,
    facility_type: 'HOSPITAL',
    location_status: 'VERIFIED',
    receiving_status: 'OPEN',
    ...overrides,
  };
}

const statusService = new IncidentStatusService();
const mockAudit     = { log: jest.fn(), logInTransaction: jest.fn() };
const mockRealtime  = { incidentTransporting: jest.fn(), facilityArrival: jest.fn(), incidentUpdated: jest.fn(), statusChanged: jest.fn() };

// Writes inside prisma.$transaction go to `tx`, so a test can tell them apart from writes outside it.
const tx = {
  transportRecord: { create: jest.fn() },
  incident: { update: jest.fn() },
  incidentEvent: { create: jest.fn() },
};

const mockPrisma = {
  $transaction: jest.fn(),
  incident: { findUnique: jest.fn(), update: jest.fn() },
  dispatches: { findUnique: jest.fn() },
  dispatch_crew: { findUnique: jest.fn() },
  facility: { findUnique: jest.fn() },
  organization_memberships: { findMany: jest.fn() },
  transportRecord: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

/** Records, for each emit, whether the transaction had already committed. */
let committed = false;
let emittedAfterCommit: boolean[] = [];

describe('TransportService — MOD-40', () => {
  let service: TransportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransportService,
        { provide: PrismaService,          useValue: mockPrisma },
        { provide: AuditService,           useValue: mockAudit },
        { provide: RealtimeService,        useValue: mockRealtime },
        { provide: IncidentStatusService,  useValue: statusService },
      ],
    }).compile();

    service = module.get<TransportService>(TransportService);
    jest.clearAllMocks();

    committed = false;
    emittedAfterCommit = [];
    mockPrisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => {
      const result = await fn(tx);
      committed = true;
      return result;
    });
    mockPrisma.transportRecord.findFirst.mockResolvedValue(null);
    mockPrisma.facility.findUnique.mockResolvedValue(hospital());
    mockPrisma.organization_memberships.findMany.mockResolvedValue([]);
    tx.transportRecord.create.mockResolvedValue(mockTransportRecord());
    tx.incident.update.mockResolvedValue({ id: INCIDENT_ID, status: IncidentStatus.TRANSPORTING });
    tx.incidentEvent.create.mockResolvedValue({});
    mockAudit.log.mockResolvedValue(undefined);
    mockAudit.logInTransaction.mockResolvedValue(undefined);
    mockRealtime.statusChanged.mockImplementation(() => emittedAfterCommit.push(committed));
    mockRealtime.incidentTransporting.mockImplementation(() => emittedAfterCommit.push(committed));
  });

  function givenIncident(status: IncidentStatus) {
    mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID, status });
    mockPrisma.dispatches.findUnique.mockResolvedValue({ id: DISPATCH_ID, incident_id: INCIDENT_ID });
  }

  // ── startTransport ──────────────────────────────────────────────────────────

  describe('startTransport', () => {
    it('ON_SCENE: creates the record, transitions to TRANSPORTING with an IncidentEvent and audit in one transaction; emits after commit', async () => {
      givenIncident(IncidentStatus.ON_SCENE);

      const result = await service.startTransport(
        INCIDENT_ID,
        { dispatchId: DISPATCH_ID, destinationId: FACILITY_ID },
        ACTOR_ID,
        'DISPATCHER',
      );

      expect(result).toMatchObject({ id: TRANSPORT_ID, warnings: [] });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.transportRecord.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ incident_id: INCIDENT_ID, dispatch_id: DISPATCH_ID, destination_id: FACILITY_ID }),
      });
      expect(tx.incident.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID, status: IncidentStatus.ON_SCENE },
        data: { status: IncidentStatus.TRANSPORTING },
      });
      expect(tx.incidentEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          incident_id: INCIDENT_ID,
          from_status: IncidentStatus.ON_SCENE,
          to_status: IncidentStatus.TRANSPORTING,
          triggered_by_id: ACTOR_ID,
          triggered_by_role: 'DISPATCHER',
        }),
      });
      expect(mockAudit.logInTransaction).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ moduleId: 'MOD-40', incidentId: INCIDENT_ID, entityId: TRANSPORT_ID }),
      );
      // Nothing is written outside the transaction, and the fire-and-forget audit is not used.
      expect(mockPrisma.transportRecord.create).not.toHaveBeenCalled();
      expect(mockPrisma.incident.update).not.toHaveBeenCalled();
      expect(mockAudit.log).not.toHaveBeenCalled();

      expect(mockRealtime.statusChanged).toHaveBeenCalledWith(expect.objectContaining({
        incidentId: INCIDENT_ID,
        previousStatus: IncidentStatus.ON_SCENE,
        newStatus: IncidentStatus.TRANSPORTING,
      }));
      expect(mockRealtime.incidentTransporting).toHaveBeenCalledWith(expect.objectContaining({
        incidentId: INCIDENT_ID,
        transportId: TRANSPORT_ID,
        dispatchId: DISPATCH_ID,
        destinationId: FACILITY_ID,
        destinationName: 'DOH — Joni Villanueva General Hospital',
      }));
      expect(emittedAfterCommit).toEqual([true, true]);
    });

    it('TRANSPORTING (another unit): creates the record without a transition or statusChanged', async () => {
      givenIncident(IncidentStatus.TRANSPORTING);

      await service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID, 'DISPATCHER');

      expect(tx.transportRecord.create).toHaveBeenCalledTimes(1);
      expect(tx.incident.update).not.toHaveBeenCalled();
      expect(tx.incidentEvent.create).not.toHaveBeenCalled();
      expect(mockRealtime.statusChanged).not.toHaveBeenCalled();
      expect(mockRealtime.incidentTransporting).toHaveBeenCalledTimes(1);
      expect(mockAudit.logInTransaction).toHaveBeenCalledTimes(1);
    });

    it.each([
      IncidentStatus.EN_ROUTE,
      IncidentStatus.DISPATCHED,
      IncidentStatus.ASSISTING,
      IncidentStatus.RESOLVED,
    ])('%s → 409 TRANSPORT_NOT_ALLOWED_IN_STATUS and no record is created', async (status) => {
      givenIncident(status);

      const error = await service
        .startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID, 'DISPATCHER')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'TRANSPORT_NOT_ALLOWED_IN_STATUS',
        status,
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(tx.transportRecord.create).not.toHaveBeenCalled();
      expect(mockPrisma.transportRecord.create).not.toHaveBeenCalled();
      expect(mockRealtime.incidentTransporting).not.toHaveBeenCalled();
    });

    it('rolls back: a failed transition inside the transaction propagates and nothing is emitted', async () => {
      givenIncident(IncidentStatus.ON_SCENE);
      const failure = new Error('transition failed');
      tx.incident.update.mockRejectedValue(failure);

      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID, 'DISPATCHER'),
      ).rejects.toBe(failure);
      expect(mockRealtime.statusChanged).not.toHaveBeenCalled();
      expect(mockRealtime.incidentTransporting).not.toHaveBeenCalled();
    });

    it('rolls back when the in-transaction audit write fails (fail-closed)', async () => {
      givenIncident(IncidentStatus.ON_SCENE);
      mockAudit.logInTransaction.mockRejectedValue(new Error('audit down'));

      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID, 'DISPATCHER'),
      ).rejects.toThrow('audit down');
      expect(mockRealtime.statusChanged).not.toHaveBeenCalled();
      expect(mockRealtime.incidentTransporting).not.toHaveBeenCalled();
    });

    it('a concurrent status change → 409 INCIDENT_STATUS_CHANGED and nothing is emitted', async () => {
      givenIncident(IncidentStatus.ON_SCENE);
      tx.incident.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('No record was found for an update.', { code: 'P2025', clientVersion: 'test' }),
      );

      const error = await service
        .startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID, 'DISPATCHER')
        .catch((e: unknown) => e);

      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'INCIDENT_STATUS_CHANGED' });
      expect(mockRealtime.incidentTransporting).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when dispatch does not belong to incident', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID, status: IncidentStatus.ON_SCENE });
      mockPrisma.dispatches.findUnique.mockResolvedValue({ id: DISPATCH_ID, incident_id: uuidv4() });

      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a second open transport for the same dispatch, using the shared open-transport rule', async () => {
      givenIncident(IncidentStatus.TRANSPORTING);
      mockPrisma.transportRecord.findFirst.mockResolvedValue(mockTransportRecord());

      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.transportRecord.findFirst).toHaveBeenCalledWith({
        where: openTransportWhere({ dispatch_id: DISPATCH_ID }),
      });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['missing', null],
      ['inactive', hospital({ is_active: false })],
      ['not a hospital', hospital({ facility_type: 'EVACUATION_CENTER' })],
      ['pending review', hospital({ location_status: 'PENDING_REVIEW' })],
      ['rejected', hospital({ location_status: 'REJECTED' })],
    ])('rejects a %s destination with 400 before any write', async (_label, facility) => {
      givenIncident(IncidentStatus.ON_SCENE);
      mockPrisma.facility.findUnique.mockResolvedValue(facility);

      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID, destinationId: FACILITY_ID }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it.each(['AT_CAPACITY', 'CLOSED'])('allows a %s hospital but returns the FACILITY_AT_CAPACITY warning', async (receiving) => {
      givenIncident(IncidentStatus.ON_SCENE);
      mockPrisma.facility.findUnique.mockResolvedValue(hospital({ receiving_status: receiving }));

      const result = await service.startTransport(
        INCIDENT_ID, { dispatchId: DISPATCH_ID, destinationId: FACILITY_ID }, ACTOR_ID,
      );

      expect(result.warnings).toEqual(['FACILITY_AT_CAPACITY']);
      expect(tx.transportRecord.create).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when incident does not exist', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue(null);
      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('openTransportWhere', () => {
    it('counts a transport as open only while not arrived AND the incident is still TRANSPORTING', () => {
      // A transport left without arrival on an incident a dispatcher resolved is not open.
      expect(openTransportWhere({ dispatch_id: DISPATCH_ID })).toEqual({
        dispatch_id: DISPATCH_ID,
        arrived_at: null,
        incidents: { status: IncidentStatus.TRANSPORTING },
      });
    });

    it('cannot be widened by the extra filter', () => {
      expect(openTransportWhere({ arrived_at: { not: null } } as Prisma.TransportRecordWhereInput)).toMatchObject({
        arrived_at: null,
        incidents: { status: IncidentStatus.TRANSPORTING },
      });
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

    it.each([
      ['not a hospital', hospital({ facility_type: 'EVACUATION_CENTER' })],
      ['pending review', hospital({ location_status: 'PENDING_REVIEW' })],
    ])('refuses an override destination that is %s', async (_label, facility) => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord());
      mockPrisma.facility.findUnique.mockResolvedValue(facility);

      await expect(
        service.recordArrival(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.transportRecord.update).not.toHaveBeenCalled();
    });

    it('accepts an at-capacity override destination', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord());
      mockPrisma.facility.findUnique.mockResolvedValue(hospital({ receiving_status: 'AT_CAPACITY' }));
      mockPrisma.transportRecord.update.mockResolvedValue(mockTransportRecord({ arrived_at: new Date() }));

      await service.recordArrival(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID);
      expect(mockPrisma.transportRecord.update).toHaveBeenCalledTimes(1);
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

  // ── updateTransport (set / change destination) ──────────────────────────────

  describe('updateTransport', () => {
    const RESPONDER = 'RESPONDER';

    it('lets a crew member set the destination after "Decide later"', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord({ destination_id: null }));
      mockPrisma.dispatch_crew.findUnique.mockResolvedValue({ id: 'crew-1' });
      mockPrisma.transportRecord.update.mockResolvedValue(mockTransportRecord());

      await service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, RESPONDER);

      expect(mockPrisma.dispatch_crew.findUnique).toHaveBeenCalledWith({
        where: { dispatch_id_user_id: { dispatch_id: DISPATCH_ID, user_id: ACTOR_ID } },
      });
      expect(mockPrisma.transportRecord.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ destination_id: FACILITY_ID }),
      }));
    });

    it.each([
      ['inactive', hospital({ is_active: false })],
      ['not a hospital', hospital({ facility_type: 'EVACUATION_CENTER' })],
      ['pending review', hospital({ location_status: 'PENDING_REVIEW' })],
    ])('refuses a %s destination', async (_label, facility) => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord());
      mockPrisma.facility.findUnique.mockResolvedValue(facility);

      await expect(
        service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, 'DISPATCHER'),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.transportRecord.update).not.toHaveBeenCalled();
    });

    it('refuses a responder who is not on the crew', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord());
      mockPrisma.dispatch_crew.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, RESPONDER),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.transportRecord.update).not.toHaveBeenCalled();
    });

    it('refuses a responder once arrival is recorded', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord({ arrived_at: new Date() }));
      mockPrisma.dispatch_crew.findUnique.mockResolvedValue({ id: 'crew-1' });

      await expect(
        service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, RESPONDER),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.transportRecord.update).not.toHaveBeenCalled();
    });

    it('does not apply the crew check to a dispatcher', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord());
      mockPrisma.transportRecord.update.mockResolvedValue(mockTransportRecord());

      await service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, 'DISPATCHER');
      expect(mockPrisma.dispatch_crew.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── Crew check on start and arrival ─────────────────────────────────────────

  describe('responder crew check', () => {
    it('refuses startTransport by a responder not on the crew', async () => {
      givenIncident(IncidentStatus.ON_SCENE);
      mockPrisma.dispatch_crew.findUnique.mockResolvedValue(null);

      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID, 'RESPONDER'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('lets a crew member start transport', async () => {
      givenIncident(IncidentStatus.ON_SCENE);
      mockPrisma.dispatch_crew.findUnique.mockResolvedValue({ id: 'crew-1' });

      await service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID, 'RESPONDER');
      expect(tx.transportRecord.create).toHaveBeenCalledTimes(1);
    });

    it('refuses recordArrival by a responder not on the crew', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord());
      mockPrisma.dispatch_crew.findUnique.mockResolvedValue(null);

      await expect(
        service.recordArrival(INCIDENT_ID, TRANSPORT_ID, {}, ACTOR_ID, 'RESPONDER'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.transportRecord.update).not.toHaveBeenCalled();
    });
  });

  // ── Route roles ─────────────────────────────────────────────────────────────

  describe('route roles', () => {
    const roles = (proto: object, name: string) =>
      Reflect.getMetadata(ROLES_KEY, (proto as Record<string, unknown>)[name] as object);

    it('lets responders reach the destination update (the service checks the crew)', () => {
      expect(roles(IncidentsController.prototype, 'updateTransport')).toEqual(
        [UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.RESPONDER],
      );
    });

    it('keeps incident referrals away from citizens and bystanders', () => {
      const allowed = roles(HospitalsController.prototype, 'findIncidentReferrals') as string[];
      expect(allowed).toEqual(
        [UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.RESPONDER, UserRole.HOSPITAL_USER],
      );
      expect(allowed).not.toContain(UserRole.CITIZEN);
      expect(allowed).not.toContain(UserRole.BYSTANDER);
    });
  });

  // ── listTransports ───────────────────────────────────────────────────────────

  describe('listTransports', () => {
    const row = () => mockTransportRecord({
      facilities: {
        id: FACILITY_ID,
        name: 'DOH — Joni Villanueva General Hospital',
        facility_type: 'HOSPITAL',
        address: 'North Luzon Expressway, Igulot, Bocaue',
        latitude: new Prisma.Decimal('14.7967900'),
        longitude: new Prisma.Decimal('120.9435800'),
        location_status: 'VERIFIED',
        receiving_status: 'OPEN',
      },
      incident_patients: null,
    });

    it('returns every transport to a dispatcher, with numeric coordinates and no location', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID });
      mockPrisma.transportRecord.findMany.mockResolvedValue([row()]);

      const result = await service.listTransports(INCIDENT_ID, { id: ACTOR_ID, role: UserRole.DISPATCHER });

      expect(result).toHaveLength(1);
      expect(result[0].facilities).toMatchObject({ latitude: 14.79679, longitude: 120.94358, location_status: 'VERIFIED', receiving_status: 'OPEN' });
      expect(typeof result[0].facilities!.latitude).toBe('number');
      const query = mockPrisma.transportRecord.findMany.mock.calls[0][0];
      expect(query.where).toEqual({ incident_id: INCIDENT_ID });
      expect(query.include.facilities.select).toMatchObject({ latitude: true, longitude: true, location_status: true, receiving_status: true });
      expect(query.include.facilities.select).not.toHaveProperty('location');
      expect(mockPrisma.organization_memberships.findMany).not.toHaveBeenCalled();
    });

    it("limits a hospital user to transports bound for their own organization's facilities", async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID });
      mockPrisma.organization_memberships.findMany.mockResolvedValue([{ organization_id: HOSPITAL_ORG }]);
      mockPrisma.transportRecord.findMany.mockResolvedValue([row()]);

      const result = await service.listTransports(INCIDENT_ID, { id: ACTOR_ID, role: UserRole.HOSPITAL_USER });

      expect(result[0].facilities).toMatchObject({ latitude: 14.79679, longitude: 120.94358 });
      expect(mockPrisma.organization_memberships.findMany).toHaveBeenCalledWith({
        where: { user_id: ACTOR_ID, is_active: true },
        select: { organization_id: true },
      });
      expect(mockPrisma.transportRecord.findMany.mock.calls[0][0].where).toEqual({
        incident_id: INCIDENT_ID,
        facilities: { organization_id: { in: [HOSPITAL_ORG] } },
      });
    });

    it('refuses a hospital user when none of the transports go to their hospital', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID });
      mockPrisma.organization_memberships.findMany.mockResolvedValue([{ organization_id: uuidv4() }]);
      mockPrisma.transportRecord.findMany.mockResolvedValue([]);

      await expect(
        service.listTransports(INCIDENT_ID, { id: ACTOR_ID, role: UserRole.HOSPITAL_USER }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when incident does not exist', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue(null);
      await expect(
        service.listTransports(INCIDENT_ID, { id: ACTOR_ID, role: UserRole.DISPATCHER }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
