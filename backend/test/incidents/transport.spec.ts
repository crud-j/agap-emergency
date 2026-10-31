import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransportService } from '../../src/incidents/transport/transport.service';
import { openTransportWhere } from '../../src/incidents/transport/open-transport';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AuditService } from '../../src/audit/audit.service';
import { RealtimeService } from '../../src/realtime/realtime.service';
import { LocationsService } from '../../src/locations/locations.service';
import { RouteCacheService } from '../../src/locations/route-cache.service';
import { TransportAudienceService } from '../../src/incidents/transport/transport-audience.service';
import { TransportRequestCacheService } from '../../src/incidents/transport/transport-request-cache.service';
import { DESTINATION_VIEW_SELECT } from '../../src/hospitals/facility-view';
import { IncidentStatus, UserRole } from '@agap/shared';
import { IncidentsController } from '../../src/incidents/incidents.controller';
import { HospitalsController } from '../../src/hospitals/hospitals.controller';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { ConfirmReporterPatientDto } from '../../src/incidents/transport/dto/confirm-reporter-patient.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { v4 as uuidv4 } from 'uuid';

const INCIDENT_ID   = uuidv4();
const DISPATCH_ID   = uuidv4();
const TRANSPORT_ID  = uuidv4();
const FACILITY_ID   = uuidv4();
const OTHER_FACILITY = uuidv4();
const ACTOR_ID      = uuidv4();
const HOSPITAL_ORG  = uuidv4();
const REPORTER_USER = uuidv4();
const CREW_USER = uuidv4();

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
    reporter_patient_confirmed_at: null,
    reporter_patient_confirmed_by_id: null,
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
    latitude: new Prisma.Decimal('14.7967900'),
    longitude: new Prisma.Decimal('120.9435800'),
    ...overrides,
  };
}

const destinationView = {
  kind: 'FACILITY',
  name: 'DOH — Joni Villanueva General Hospital',
  latitude: 14.79679,
  longitude: 120.94358,
  locationVerified: true,
};

const statusService = new IncidentStatusService();
const mockAudit     = { log: jest.fn(), logInTransaction: jest.fn() };
const mockRealtime  = {
  incidentTransporting: jest.fn(),
  facilityArrival: jest.fn(),
  incidentUpdated: jest.fn(),
  statusChanged: jest.fn(),
  transportUpdated: jest.fn(),
  routeWithdrawn: jest.fn(),
};
const mockLocations  = { requestImmediateRefresh: jest.fn() };
const mockRouteCache = { clear: jest.fn() };
const mockAudience   = {
  invalidate: jest.fn(), roomsForDispatch: jest.fn(), confirmedReporter: jest.fn(), reporterSharingEnabled: jest.fn(),
};
const mockRequests   = { get: jest.fn(), set: jest.fn() };

// Reads shared by the service and the transaction client.
const facility     = { findUnique: jest.fn() };
const dispatchCrew = { findUnique: jest.fn() };

// Writes inside prisma.$transaction go to `tx`, so a test can tell them apart from writes outside it.
const tx = {
  $queryRaw: jest.fn(),
  dispatches: { findUnique: jest.fn() },
  dispatch_crew: dispatchCrew,
  facility,
  transportRecord: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  incident: { update: jest.fn() },
  incidentEvent: { create: jest.fn() },
  facility_referrals: { findMany: jest.fn(), update: jest.fn() },
};

const mockPrisma = {
  $transaction: jest.fn(),
  incident: { findUnique: jest.fn(), update: jest.fn() },
  dispatch_crew: dispatchCrew,
  facility,
  organization_memberships: { findMany: jest.fn() },
  incident_patients: { count: jest.fn() },
  incidentReporter: { findUnique: jest.fn() },
  transportRecord: {
    count: jest.fn(),
    create: jest.fn(),
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
        { provide: LocationsService,       useValue: mockLocations },
        { provide: RouteCacheService,      useValue: mockRouteCache },
        { provide: TransportAudienceService, useValue: mockAudience },
        { provide: TransportRequestCacheService, useValue: mockRequests },
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
    tx.transportRecord.findFirst.mockResolvedValue(null);
    facility.findUnique.mockResolvedValue(hospital());
    dispatchCrew.findUnique.mockResolvedValue({ id: 'crew-1' });
    mockPrisma.organization_memberships.findMany.mockResolvedValue([]);
    // A registered reporter who said they are safe and named no patient as themselves.
    mockPrisma.incident_patients.count.mockResolvedValue(0);
    mockPrisma.incidentReporter.findUnique.mockResolvedValue({ user_id: REPORTER_USER, reporter_status: 'SAFE' });
    mockPrisma.transportRecord.count.mockResolvedValue(1);
    tx.transportRecord.create.mockResolvedValue(mockTransportRecord());
    tx.incident.update.mockResolvedValue({ id: INCIDENT_ID, status: IncidentStatus.TRANSPORTING });
    tx.incidentEvent.create.mockResolvedValue({});
    tx.facility_referrals.findMany.mockResolvedValue([]);
    mockAudit.log.mockResolvedValue(undefined);
    mockAudit.logInTransaction.mockResolvedValue(undefined);
    mockLocations.requestImmediateRefresh.mockResolvedValue(undefined);
    mockRouteCache.clear.mockResolvedValue(undefined);
    // Hospital-leg audience: the crew; the reporter is not confirmed as the patient.
    mockAudience.roomsForDispatch.mockResolvedValue({ incidentRoom: false, userIds: [CREW_USER] });
    mockAudience.confirmedReporter.mockResolvedValue(null);
    // REPORTER_DESTINATION_SHARING_ENABLED on; the launch-switch tests turn it off.
    mockAudience.reporterSharingEnabled.mockReturnValue(true);
    for (const emit of [mockRealtime.statusChanged, mockRealtime.incidentTransporting, mockRealtime.transportUpdated, mockRealtime.facilityArrival]) {
      emit.mockImplementation(() => emittedAfterCommit.push(committed));
    }
  });

  function givenIncident(status: IncidentStatus) {
    tx.$queryRaw.mockResolvedValue([{ status }]);
    tx.dispatches.findUnique.mockResolvedValue({ incident_id: INCIDENT_ID });
  }

  // ── startTransport / beginTransport ─────────────────────────────────────────

  describe('startTransport', () => {
    it('ON_SCENE: locks the incident, creates the record, transitions with an IncidentEvent and audit in one transaction; emits and refreshes after commit', async () => {
      givenIncident(IncidentStatus.ON_SCENE);

      const result = await service.startTransport(
        INCIDENT_ID,
        { dispatchId: DISPATCH_ID, destinationId: FACILITY_ID },
        ACTOR_ID,
        'DISPATCHER',
      );

      expect(result).toMatchObject({ id: TRANSPORT_ID, warnings: [] });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      const [sql, id] = tx.$queryRaw.mock.calls[0];
      expect((sql as string[]).join('?')).toMatch(/SELECT status FROM incidents WHERE id = \?::uuid FOR UPDATE/);
      expect(id).toBe(INCIDENT_ID);
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
          notes: 'Transport started',
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
      // Ops copy: destination view with numeric coordinates, and no destinationName any more.
      const transporting = mockRealtime.incidentTransporting.mock.calls[0][0];
      expect(transporting).toMatchObject({
        incidentId: INCIDENT_ID,
        transportId: TRANSPORT_ID,
        dispatchId: DISPATCH_ID,
        destinationId: FACILITY_ID,
        destination: destinationView,
      });
      expect(transporting).not.toHaveProperty('destinationName');
      // The unit is on the hospital leg now; the audience is re-read before the event.
      expect(mockAudience.invalidate).toHaveBeenCalledWith(INCIDENT_ID);
      expect(mockAudience.confirmedReporter).toHaveBeenCalledWith(INCIDENT_ID, DISPATCH_ID);
      expect(mockRealtime.incidentTransporting.mock.calls[0][1]).toBeNull();
      expect(emittedAfterCommit).toEqual([true, true]);
      expect(mockLocations.requestImmediateRefresh).toHaveBeenCalledWith(DISPATCH_ID, INCIDENT_ID, 'transport_started');
    });

    it('TRANSPORTING (another unit): creates the record without a transition or statusChanged', async () => {
      givenIncident(IncidentStatus.TRANSPORTING);

      await service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID, 'DISPATCHER');

      expect(tx.transportRecord.create).toHaveBeenCalledTimes(1);
      expect(tx.incident.update).not.toHaveBeenCalled();
      expect(tx.incidentEvent.create).not.toHaveBeenCalled();
      expect(mockRealtime.statusChanged).not.toHaveBeenCalled();
      expect(mockRealtime.incidentTransporting).toHaveBeenCalledWith(expect.objectContaining({ destination: null }), null);
      expect(mockAudit.logInTransaction).toHaveBeenCalledTimes(1);
    });

    it.each([
      IncidentStatus.EN_ROUTE,
      IncidentStatus.DISPATCHED,
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
      expect(tx.transportRecord.create).not.toHaveBeenCalled();
      expect(tx.incident.update).not.toHaveBeenCalled();
      expect(mockRealtime.incidentTransporting).not.toHaveBeenCalled();
      expect(mockLocations.requestImmediateRefresh).not.toHaveBeenCalled();
    });

    it('ASSISTING → TRANSPORTING is allowed for a crew that needs transport after treatment', async () => {
      givenIncident(IncidentStatus.ASSISTING);

      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID, 'DISPATCHER'),
      ).resolves.toEqual(expect.objectContaining({ incident_id: INCIDENT_ID }));
      expect(tx.transportRecord.create).toHaveBeenCalledTimes(1);
    });

    it('refuses a fire-truck crew with 409 TRANSPORT_NOT_FOR_UNIT: no record, no transition, nothing emitted', async () => {
      givenIncident(IncidentStatus.ON_SCENE);
      tx.dispatches.findUnique.mockResolvedValue({ incident_id: INCIDENT_ID, resources: { resource_type: 'FIRE_TRUCK' } });

      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, CREW_USER, UserRole.RESPONDER),
      ).rejects.toMatchObject({ response: { code: 'TRANSPORT_NOT_FOR_UNIT' } });
      expect(tx.transportRecord.create).not.toHaveBeenCalled();
      expect(tx.incident.update).not.toHaveBeenCalled();
      expect(mockRealtime.incidentTransporting).not.toHaveBeenCalled();
    });

    it('a dispatcher can still start a transport on a fire-truck dispatch (dispatcher routes unchanged)', async () => {
      givenIncident(IncidentStatus.ON_SCENE);
      tx.dispatches.findUnique.mockResolvedValue({ incident_id: INCIDENT_ID, resources: { resource_type: 'FIRE_TRUCK' } });

      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID, UserRole.DISPATCHER),
      ).resolves.toEqual(expect.objectContaining({ incident_id: INCIDENT_ID }));
      expect(tx.transportRecord.create).toHaveBeenCalledTimes(1);
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
      expect(mockLocations.requestImmediateRefresh).not.toHaveBeenCalled();
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
      givenIncident(IncidentStatus.ON_SCENE);
      tx.dispatches.findUnique.mockResolvedValue({ incident_id: uuidv4() });

      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
      expect(tx.transportRecord.create).not.toHaveBeenCalled();
    });

    it('looks up the open record with the shared open-transport rule', async () => {
      givenIncident(IncidentStatus.TRANSPORTING);
      await service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID);
      expect(tx.transportRecord.findFirst).toHaveBeenCalledWith({
        where: openTransportWhere({ dispatch_id: DISPATCH_ID }),
      });
    });

    describe('when the dispatch already has an open record (the crew tapped Transporting first)', () => {
      it('sets the first destination on it: no 409, no second record, transport_updated + new route', async () => {
        givenIncident(IncidentStatus.TRANSPORTING);
        tx.transportRecord.findFirst.mockResolvedValue(mockTransportRecord({ destination_id: null }));
        tx.transportRecord.update.mockResolvedValue(mockTransportRecord());

        const result = await service.startTransport(
          INCIDENT_ID, { dispatchId: DISPATCH_ID, destinationId: FACILITY_ID }, ACTOR_ID, 'RESPONDER',
        );

        expect(result).toMatchObject({ id: TRANSPORT_ID, destination_id: FACILITY_ID });
        expect(tx.transportRecord.create).not.toHaveBeenCalled();
        expect(tx.transportRecord.update).toHaveBeenCalledWith({
          where: { id: TRANSPORT_ID },
          data: { destination_id: FACILITY_ID, updated_at: expect.any(Date) },
        });
        expect(mockAudit.logInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
          action: 'UPDATE', entityId: TRANSPORT_ID, oldValues: { destination_id: null },
        }));
        expect(mockRealtime.incidentTransporting).not.toHaveBeenCalled();
        expect(mockRealtime.transportUpdated).toHaveBeenCalledWith(
          expect.objectContaining({ transportId: TRANSPORT_ID, destination: { ...destinationView, id: FACILITY_ID } }),
          [CREW_USER],
        );
        expect(mockRouteCache.clear).toHaveBeenCalledWith(DISPATCH_ID);
        expect(mockLocations.requestImmediateRefresh).toHaveBeenCalledWith(DISPATCH_ID, INCIDENT_ID, 'destination_changed');
      });

      it.each([
        ['no destination', {}],
        ['the same destination', { destinationId: FACILITY_ID }],
      ])('returns it unchanged for %s (a repeated start)', async (_label, extra) => {
        givenIncident(IncidentStatus.TRANSPORTING);
        tx.transportRecord.findFirst.mockResolvedValue(mockTransportRecord());
        // The chosen hospital went to review meanwhile: a repeat must still not fail.
        facility.findUnique.mockResolvedValue(hospital({ location_status: 'PENDING_REVIEW' }));

        const result = await service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID, ...extra }, ACTOR_ID);

        expect(result).toMatchObject({ id: TRANSPORT_ID });
        expect(facility.findUnique).not.toHaveBeenCalled();
        expect(tx.transportRecord.create).not.toHaveBeenCalled();
        expect(tx.transportRecord.update).not.toHaveBeenCalled();
        expect(mockAudit.logInTransaction).not.toHaveBeenCalled();
        expect(mockRealtime.incidentTransporting).not.toHaveBeenCalled();
        expect(mockRealtime.transportUpdated).not.toHaveBeenCalled();
      });

      it('refuses a different hospital with 409 TRANSPORT_ALREADY_OPEN (the change goes through PATCH)', async () => {
        givenIncident(IncidentStatus.TRANSPORTING);
        tx.transportRecord.findFirst.mockResolvedValue(mockTransportRecord({ destination_id: OTHER_FACILITY }));

        const error = await service
          .startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID, destinationId: FACILITY_ID }, ACTOR_ID)
          .catch((e: unknown) => e);

        expect((error as ConflictException).getResponse()).toMatchObject({ code: 'TRANSPORT_ALREADY_OPEN', transportId: TRANSPORT_ID });
        expect(facility.findUnique).not.toHaveBeenCalled();
        expect(tx.transportRecord.update).not.toHaveBeenCalled();
        expect(tx.transportRecord.create).not.toHaveBeenCalled();
      });
    });

    it.each([
      ['missing', null],
      ['inactive', hospital({ is_active: false })],
      ['not a hospital', hospital({ facility_type: 'EVACUATION_CENTER' })],
      ['pending review', hospital({ location_status: 'PENDING_REVIEW' })],
      ['rejected', hospital({ location_status: 'REJECTED' })],
    ])('rejects a %s destination with 400 before any write', async (_label, row) => {
      givenIncident(IncidentStatus.ON_SCENE);
      facility.findUnique.mockResolvedValue(row);

      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID, destinationId: FACILITY_ID }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
      expect(tx.transportRecord.create).not.toHaveBeenCalled();
      expect(tx.incident.update).not.toHaveBeenCalled();
    });

    it.each(['AT_CAPACITY', 'CLOSED'])('allows a %s hospital but returns the FACILITY_AT_CAPACITY warning', async (receiving) => {
      givenIncident(IncidentStatus.ON_SCENE);
      facility.findUnique.mockResolvedValue(hospital({ receiving_status: receiving }));

      const result = await service.startTransport(
        INCIDENT_ID, { dispatchId: DISPATCH_ID, destinationId: FACILITY_ID }, ACTOR_ID,
      );

      expect(result.warnings).toEqual(['FACILITY_AT_CAPACITY']);
      expect(tx.transportRecord.create).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when incident does not exist', async () => {
      tx.$queryRaw.mockResolvedValue([]);
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
    function givenOpenTransport(overrides: Record<string, unknown> = {}) {
      const record = mockTransportRecord(overrides);
      mockPrisma.transportRecord.findUnique.mockResolvedValue(record);
      tx.transportRecord.updateMany.mockResolvedValue({ count: 1 });
      tx.transportRecord.findUniqueOrThrow.mockResolvedValue({ ...record, arrived_at: new Date() });
      return record;
    }

    it('stamps arrived_at once and audits in one transaction; emits, clears the route and refreshes after commit', async () => {
      givenOpenTransport();

      const result = await service.recordArrival(INCIDENT_ID, TRANSPORT_ID, {}, ACTOR_ID, 'RESPONDER');

      expect(result.arrived_at).toBeDefined();
      expect(tx.transportRecord.updateMany).toHaveBeenCalledWith({
        where: { id: TRANSPORT_ID, arrived_at: null },
        data: { arrived_at: expect.any(Date), updated_at: expect.any(Date) },
      });
      expect(mockAudit.logInTransaction).toHaveBeenCalledWith(
        tx, expect.objectContaining({ moduleId: 'MOD-40', incidentId: INCIDENT_ID, entityId: TRANSPORT_ID }),
      );
      expect(mockAudit.log).not.toHaveBeenCalled();
      expect(mockRealtime.facilityArrival).toHaveBeenCalledWith(expect.objectContaining({
        incidentId: INCIDENT_ID, transportId: TRANSPORT_ID, dispatchId: DISPATCH_ID, destinationId: FACILITY_ID,
        destination: destinationView,
      }), null);
      expect(mockAudience.invalidate).toHaveBeenCalledWith(INCIDENT_ID);
      expect(emittedAfterCommit).toEqual([true]);
      expect(mockRouteCache.clear).toHaveBeenCalledWith(DISPATCH_ID);
      expect(mockLocations.requestImmediateRefresh).toHaveBeenCalledWith(DISPATCH_ID, INCIDENT_ID, 'arrived');
    });

    it('passes the crew-confirmed reporter to facilityArrival, after the audience was invalidated (C17)', async () => {
      givenOpenTransport();
      const order: string[] = [];
      mockAudience.invalidate.mockImplementation(() => order.push('invalidate'));
      mockAudience.confirmedReporter.mockImplementation(async () => {
        order.push('lookup');
        return REPORTER_USER;
      });

      await service.recordArrival(INCIDENT_ID, TRANSPORT_ID, {}, ACTOR_ID, 'RESPONDER');

      expect(mockAudience.confirmedReporter).toHaveBeenCalledWith(INCIDENT_ID, DISPATCH_ID);
      expect(mockRealtime.facilityArrival.mock.calls[0][1]).toBe(REPORTER_USER);
      expect(order).toEqual(['invalidate', 'lookup']);
    });

    it("stamps the open referral to that hospital, preferring the one bound to this dispatch", async () => {
      givenOpenTransport();
      tx.facility_referrals.findMany.mockResolvedValue([
        { id: 'ref-no-dispatch', dispatch_id: null, acknowledgment_status: 'ACKNOWLEDGED' },
        { id: 'ref-this-dispatch', dispatch_id: DISPATCH_ID, acknowledgment_status: 'PENDING' },
      ]);

      await service.recordArrival(INCIDENT_ID, TRANSPORT_ID, {}, ACTOR_ID, 'RESPONDER');

      expect(tx.facility_referrals.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          incident_id: INCIDENT_ID,
          facility_id: FACILITY_ID,
          patient_arrived_at: null,
          OR: [{ dispatch_id: DISPATCH_ID }, { dispatch_id: null }],
        },
      }));
      expect(tx.facility_referrals.update).toHaveBeenCalledTimes(1);
      expect(tx.facility_referrals.update).toHaveBeenCalledWith({
        where: { id: 'ref-this-dispatch' },
        data: { patient_arrived_at: expect.any(Date), updated_at: expect.any(Date) },
      });
      expect(mockAudit.logInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
        entityType: 'facility_referral', entityId: 'ref-this-dispatch', moduleId: 'MOD-38',
      }));
    });

    it('leaves referrals alone when none matches (other hospital, already arrived, other dispatch)', async () => {
      givenOpenTransport();
      tx.facility_referrals.findMany.mockResolvedValue([]);

      await service.recordArrival(INCIDENT_ID, TRANSPORT_ID, {}, ACTOR_ID, 'RESPONDER');

      expect(tx.facility_referrals.update).not.toHaveBeenCalled();
      expect(mockAudit.logInTransaction).toHaveBeenCalledTimes(1);
    });

    it('does not look for a referral when the transport has no destination', async () => {
      const record = givenOpenTransport({ destination_id: null });
      tx.transportRecord.findUniqueOrThrow.mockResolvedValue({ ...record, arrived_at: new Date() });

      await service.recordArrival(INCIDENT_ID, TRANSPORT_ID, {}, ACTOR_ID, 'RESPONDER');

      expect(tx.facility_referrals.findMany).not.toHaveBeenCalled();
    });

    it('a second, concurrent arrival → 400 and nothing is emitted', async () => {
      givenOpenTransport();
      tx.transportRecord.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.recordArrival(INCIDENT_ID, TRANSPORT_ID, {}, ACTOR_ID)).rejects.toThrow(BadRequestException);
      expect(mockRealtime.facilityArrival).not.toHaveBeenCalled();
      expect(mockLocations.requestImmediateRefresh).not.toHaveBeenCalled();
    });

    it.each([
      ['not a hospital', hospital({ facility_type: 'EVACUATION_CENTER' })],
      ['pending review', hospital({ location_status: 'PENDING_REVIEW' })],
    ])('refuses an override destination that is %s', async (_label, row) => {
      givenOpenTransport({ destination_id: OTHER_FACILITY });
      facility.findUnique.mockResolvedValue(row);

      await expect(
        service.recordArrival(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('accepts an at-capacity override destination and marks a replaced hospital as changed', async () => {
      givenOpenTransport({ destination_id: OTHER_FACILITY });
      facility.findUnique.mockResolvedValue(hospital({ receiving_status: 'AT_CAPACITY' }));

      await service.recordArrival(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID);

      expect(tx.transportRecord.updateMany.mock.calls[0][0].data).toMatchObject({
        destination_id: FACILITY_ID, destination_changed: true,
      });
    });

    it('records arrival with the current hospital re-sent, without checking it again (it may be in review now)', async () => {
      givenOpenTransport();
      facility.findUnique.mockResolvedValue(hospital({ location_status: 'PENDING_REVIEW' }));

      await service.recordArrival(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID);

      // The destination rule never ran (it reads is_active); the only read is the
      // hospital's view for the arrival event.
      expect(facility.findUnique).toHaveBeenCalledTimes(1);
      expect(facility.findUnique.mock.calls[0][0].select).toEqual(DESTINATION_VIEW_SELECT);
      const { data } = tx.transportRecord.updateMany.mock.calls[0][0];
      expect(data).toMatchObject({ arrived_at: expect.any(Date) });
      expect(data).not.toHaveProperty('destination_id');
      expect(data).not.toHaveProperty('destination_changed');
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

    it('lets a crew member set the destination after "Decide later" (a first choice, not a change)', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord({ destination_id: null }));
      dispatchCrew.findUnique.mockResolvedValue({ id: 'crew-1' });
      tx.transportRecord.update.mockResolvedValue(mockTransportRecord());

      await service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, RESPONDER);

      expect(dispatchCrew.findUnique).toHaveBeenCalledWith({
        where: { dispatch_id_user_id: { dispatch_id: DISPATCH_ID, user_id: ACTOR_ID } },
      });
      const { data } = tx.transportRecord.update.mock.calls[0][0];
      expect(data).toMatchObject({ destination_id: FACILITY_ID, updated_at: expect.any(Date) });
      expect(data).not.toHaveProperty('destination_changed');
      expect(mockAudit.logInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'UPDATE', entityId: TRANSPORT_ID }));
    });

    it('a hospital change emits transport_updated (ops only), clears the route and refreshes it', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord({ destination_id: OTHER_FACILITY }));
      tx.transportRecord.update.mockResolvedValue(mockTransportRecord());

      await service.updateTransport(
        INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID, changeReason: 'ER full' }, ACTOR_ID, 'DISPATCHER',
      );

      expect(tx.transportRecord.update.mock.calls[0][0].data).toMatchObject({
        destination_id: FACILITY_ID, destination_changed: true, change_reason: 'ER full',
      });
      expect(mockRealtime.transportUpdated).toHaveBeenCalledWith(
        {
          incidentId: INCIDENT_ID,
          dispatchId: DISPATCH_ID,
          transportId: TRANSPORT_ID,
          destination: { ...destinationView, id: FACILITY_ID },
          changedAt: expect.any(String),
        },
        [CREW_USER],
      );
      expect(mockAudience.roomsForDispatch).toHaveBeenCalledWith(INCIDENT_ID, DISPATCH_ID, 'TO_FACILITY');
      expect(mockAudience.invalidate).toHaveBeenCalledWith(INCIDENT_ID);
      expect(emittedAfterCommit).toEqual([true]);
      expect(mockRouteCache.clear).toHaveBeenCalledWith(DISPATCH_ID);
      expect(mockLocations.requestImmediateRefresh).toHaveBeenCalledWith(DISPATCH_ID, INCIDENT_ID, 'destination_changed');
      // Kept until the web console listens to incident.transport_updated.
      expect(mockRealtime.incidentUpdated).toHaveBeenCalledWith(INCIDENT_ID, { transportUpdated: TRANSPORT_ID });
    });

    it('warns FACILITY_AT_CAPACITY when the new hospital is full', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord({ destination_id: OTHER_FACILITY }));
      facility.findUnique.mockResolvedValue(hospital({ receiving_status: 'AT_CAPACITY' }));
      tx.transportRecord.update.mockResolvedValue(mockTransportRecord());

      const result = await service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, 'DISPATCHER');

      expect(mockRealtime.transportUpdated.mock.calls[0][0]).toMatchObject({ destinationWarning: 'FACILITY_AT_CAPACITY' });
      // The response carries it too (same shape as POST /transport), for the crew's picker.
      expect(result.warnings).toEqual(['FACILITY_AT_CAPACITY']);
    });

    it('returns no warnings for an open hospital or an ETA-only update', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord({ destination_id: OTHER_FACILITY }));
      tx.transportRecord.update.mockResolvedValue(mockTransportRecord());

      const changed = await service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, 'DISPATCHER');
      const etaOnly = await service.updateTransport(
        INCIDENT_ID, TRANSPORT_ID, { estimatedArrivalAt: '2026-10-29T01:00:00Z' }, ACTOR_ID, 'DISPATCHER',
      );

      expect(changed.warnings).toEqual([]);
      expect(etaOnly.warnings).toEqual([]);
    });

    it('an ETA-only update or the same hospital sends no transport_updated', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord());
      tx.transportRecord.update.mockResolvedValue(mockTransportRecord());

      await service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { estimatedArrivalAt: '2026-10-28T02:00:00Z' }, ACTOR_ID, 'DISPATCHER');
      await service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, 'DISPATCHER');

      expect(mockRealtime.transportUpdated).not.toHaveBeenCalled();
      expect(mockLocations.requestImmediateRefresh).not.toHaveBeenCalled();
      expect(tx.transportRecord.update.mock.calls[1][0].data).not.toHaveProperty('destination_changed');
      // Re-picking the current hospital (the mobile picker does) keeps the recorded reason.
      expect(tx.transportRecord.update.mock.calls[1][0].data).not.toHaveProperty('change_reason');
    });

    it.each([
      ['inactive', hospital({ is_active: false })],
      ['not a hospital', hospital({ facility_type: 'EVACUATION_CENTER' })],
      ['pending review', hospital({ location_status: 'PENDING_REVIEW' })],
    ])('refuses a %s destination', async (_label, row) => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord({ destination_id: OTHER_FACILITY }));
      facility.findUnique.mockResolvedValue(row);

      await expect(
        service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, 'DISPATCHER'),
      ).rejects.toThrow(BadRequestException);
      expect(tx.transportRecord.update).not.toHaveBeenCalled();
    });

    it('refuses a responder who is not on the crew', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord());
      dispatchCrew.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, RESPONDER),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.transportRecord.update).not.toHaveBeenCalled();
    });

    it('refuses a responder once arrival is recorded', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord({ arrived_at: new Date() }));
      dispatchCrew.findUnique.mockResolvedValue({ id: 'crew-1' });

      await expect(
        service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, RESPONDER),
      ).rejects.toThrow(BadRequestException);
      expect(tx.transportRecord.update).not.toHaveBeenCalled();
    });

    it('re-sending the current hospital succeeds without checking it again (it may be in review now)', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord());
      dispatchCrew.findUnique.mockResolvedValue({ id: 'crew-1' });
      facility.findUnique.mockResolvedValue(hospital({ location_status: 'PENDING_REVIEW' }));
      tx.transportRecord.update.mockResolvedValue(mockTransportRecord());

      await service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, RESPONDER);

      expect(facility.findUnique).not.toHaveBeenCalled();
      expect(tx.transportRecord.update.mock.calls[0][0].data).not.toHaveProperty('destination_id');
      expect(mockRealtime.transportUpdated).not.toHaveBeenCalled();
    });

    it('refuses a dispatcher hospital change after arrival with 409 TRANSPORT_ARRIVED (the referral is already closed)', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(
        mockTransportRecord({ destination_id: OTHER_FACILITY, arrived_at: new Date() }),
      );

      const error = await service
        .updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, 'DISPATCHER')
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'TRANSPORT_ARRIVED', transportId: TRANSPORT_ID });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockRealtime.transportUpdated).not.toHaveBeenCalled();
      expect(mockRealtime.incidentUpdated).not.toHaveBeenCalled();
    });

    it('still lets a dispatcher edit the ETA, or re-send the same hospital, after arrival', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord({ arrived_at: new Date() }));
      tx.transportRecord.update.mockResolvedValue(mockTransportRecord());

      await service.updateTransport(
        INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID, estimatedArrivalAt: '2026-10-28T02:00:00Z' }, ACTOR_ID, 'DISPATCHER',
      );

      const { data } = tx.transportRecord.update.mock.calls[0][0];
      expect(data).toMatchObject({ estimated_arrival_at: expect.any(Date) });
      expect(data).not.toHaveProperty('destination_id');
      expect(mockRealtime.transportUpdated).not.toHaveBeenCalled();
    });

    it('does not apply the crew check to a dispatcher', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord());
      tx.transportRecord.update.mockResolvedValue(mockTransportRecord());

      await service.updateTransport(INCIDENT_ID, TRANSPORT_ID, { destinationId: FACILITY_ID }, ACTOR_ID, 'DISPATCHER');
      expect(dispatchCrew.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── Facility side effects (plan §12) ─────────────────────────────────────────

  describe('notifyFacilityChanged', () => {
    const open = [
      { id: 'tr-a', incident_id: 'inc-a', dispatch_id: 'disp-a', destination_id: FACILITY_ID },
      { id: 'tr-b', incident_id: 'inc-b', dispatch_id: 'disp-b', destination_id: FACILITY_ID },
    ];

    beforeEach(() => {
      mockPrisma.transportRecord.findMany.mockResolvedValue(open);
    });

    it('finds open transports with the shared open-transport rule', async () => {
      await service.findOpenTransportsForFacility(FACILITY_ID);
      expect(mockPrisma.transportRecord.findMany).toHaveBeenCalledWith({
        where: openTransportWhere({ destination_id: FACILITY_ID }),
        select: { id: true, incident_id: true, dispatch_id: true, destination_id: true },
      });
    });

    it('moved: transport_updated and a new route for each open transport; transports untouched', async () => {
      await service.notifyFacilityChanged(FACILITY_ID, 'moved');

      expect(mockRealtime.transportUpdated).toHaveBeenCalledTimes(2);
      expect(mockRealtime.transportUpdated.mock.calls.map((c) => c[0].transportId)).toEqual(['tr-a', 'tr-b']);
      expect(mockRealtime.transportUpdated.mock.calls[0][0]).toMatchObject({
        destination: { ...destinationView, id: FACILITY_ID },
      });
      expect(mockRealtime.transportUpdated.mock.calls[0][0]).not.toHaveProperty('destinationWarning');
      expect(mockLocations.requestImmediateRefresh.mock.calls).toEqual([
        ['disp-a', 'inc-a', 'facility_moved'],
        ['disp-b', 'inc-b', 'facility_moved'],
      ]);
      expect(mockPrisma.transportRecord.update).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('deactivated: transport_updated with FACILITY_DEACTIVATED; the transports are never cancelled or changed', async () => {
      await service.notifyFacilityChanged(FACILITY_ID, 'deactivated');

      expect(mockRealtime.transportUpdated).toHaveBeenCalledTimes(2);
      for (const [payload, users] of mockRealtime.transportUpdated.mock.calls) {
        expect(payload).toMatchObject({ destinationWarning: 'FACILITY_DEACTIVATED' });
        expect(users).toEqual([CREW_USER]);
      }
      expect(mockLocations.requestImmediateRefresh).not.toHaveBeenCalled();
      expect(mockPrisma.transportRecord.update).not.toHaveBeenCalled();
    });

    it('does nothing when no transport is open', async () => {
      mockPrisma.transportRecord.findMany.mockResolvedValue([]);
      await service.notifyFacilityChanged(FACILITY_ID, 'moved');
      expect(facility.findUnique).not.toHaveBeenCalled();
      expect(mockRealtime.transportUpdated).not.toHaveBeenCalled();
    });

    it('never throws into the facility update', async () => {
      mockPrisma.transportRecord.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.notifyFacilityChanged(FACILITY_ID, 'moved')).resolves.toBeUndefined();
    });
  });

  // ── Crew check on start and arrival ─────────────────────────────────────────

  describe('responder crew check', () => {
    it('refuses startTransport by a responder not on the crew', async () => {
      givenIncident(IncidentStatus.ON_SCENE);
      dispatchCrew.findUnique.mockResolvedValue(null);

      await expect(
        service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID, 'RESPONDER'),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.transportRecord.create).not.toHaveBeenCalled();
    });

    it('lets a crew member start transport', async () => {
      givenIncident(IncidentStatus.ON_SCENE);
      dispatchCrew.findUnique.mockResolvedValue({ id: 'crew-1' });

      await service.startTransport(INCIDENT_ID, { dispatchId: DISPATCH_ID }, ACTOR_ID, 'RESPONDER');
      expect(tx.transportRecord.create).toHaveBeenCalledTimes(1);
    });

    it('refuses recordArrival by a responder not on the crew', async () => {
      mockPrisma.transportRecord.findUnique.mockResolvedValue(mockTransportRecord());
      dispatchCrew.findUnique.mockResolvedValue(null);

      await expect(
        service.recordArrival(INCIDENT_ID, TRANSPORT_ID, {}, ACTOR_ID, 'RESPONDER'),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.transportRecord.updateMany).not.toHaveBeenCalled();
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

    it('lets only crew-side staff confirm the reporter is the patient (never a citizen)', () => {
      const allowed = roles(IncidentsController.prototype, 'confirmReporterIsPatient') as string[];
      expect(allowed).toEqual([UserRole.DISPATCHER, UserRole.SUPERVISOR, UserRole.RESPONDER]);
      expect(allowed).not.toContain(UserRole.CITIZEN);
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

  // ── Crew-confirmed reporter-patient (C17) ───────────────────────────────────

  describe('confirmReporterIsPatient', () => {
    const RESPONDER = 'RESPONDER';

    function givenTransport(overrides: Record<string, unknown> = {}) {
      const record = mockTransportRecord(overrides);
      mockPrisma.transportRecord.findUnique.mockResolvedValue(record);
      tx.transportRecord.updateMany.mockResolvedValue({ count: 1 });
      tx.transportRecord.findUniqueOrThrow.mockResolvedValue({ ...record, reporter_patient_confirmed_at: new Date() });
      return record;
    }

    it('launch switch off: refused with 403 before any read, write, audit or event', async () => {
      givenTransport();
      mockAudience.reporterSharingEnabled.mockReturnValue(false);

      for (const confirmed of [true, false]) {
        await expect(
          service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: RESPONDER }, confirmed),
        ).rejects.toThrow(new ForbiddenException('Sharing the hospital with the reporter is not enabled yet.'));
      }
      expect(mockPrisma.transportRecord.findUnique).not.toHaveBeenCalled();
      expect(tx.transportRecord.updateMany).not.toHaveBeenCalled();
      expect(mockAudit.logInTransaction).not.toHaveBeenCalled();
      expect(mockAudience.invalidate).not.toHaveBeenCalled();
      expect(mockRealtime.routeWithdrawn).not.toHaveBeenCalled();
    });

    it('crew confirm sets both columns and audits in one transaction, only while the transport is open', async () => {
      givenTransport();

      const result = await service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: RESPONDER }, true);

      expect(dispatchCrew.findUnique).toHaveBeenCalledWith({
        where: { dispatch_id_user_id: { dispatch_id: DISPATCH_ID, user_id: ACTOR_ID } },
      });
      expect(mockPrisma.transportRecord.count).toHaveBeenCalledWith({ where: openTransportWhere({ id: TRANSPORT_ID }) });
      expect(tx.transportRecord.updateMany).toHaveBeenCalledWith({
        where: openTransportWhere({ id: TRANSPORT_ID, reporter_patient_confirmed_at: null }),
        data: {
          reporter_patient_confirmed_at: expect.any(Date),
          reporter_patient_confirmed_by_id: ACTOR_ID,
          updated_at: expect.any(Date),
        },
      });
      expect(mockAudit.logInTransaction).toHaveBeenCalledWith(tx, {
        action: 'UPDATE',
        actorId: ACTOR_ID,
        actorRole: RESPONDER,
        entityType: 'transport_record',
        entityId: TRANSPORT_ID,
        moduleId: 'MOD-40',
        incidentId: INCIDENT_ID,
        oldValues: { reporter_patient_confirmed: false },
        newValues: { reporter_patient_confirmed: true },
      });
      expect(mockPrisma.transportRecord.update).not.toHaveBeenCalled();
      expect(result.reporter_patient_confirmed_at).toEqual(expect.any(Date));
    });

    it('withdrawing clears both columns', async () => {
      givenTransport({ reporter_patient_confirmed_at: new Date(), reporter_patient_confirmed_by_id: uuidv4() });

      await service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: 'DISPATCHER' }, false);

      expect(tx.transportRecord.updateMany.mock.calls[0][0].where).toEqual(
        openTransportWhere({ id: TRANSPORT_ID, reporter_patient_confirmed_at: { not: null } }),
      );
      expect(tx.transportRecord.updateMany.mock.calls[0][0].data).toEqual({
        reporter_patient_confirmed_at: null,
        reporter_patient_confirmed_by_id: null,
        updated_at: expect.any(Date),
      });
      expect(mockAudit.logInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
        oldValues: { reporter_patient_confirmed: true },
        newValues: { reporter_patient_confirmed: false },
      }));
    });

    it('asking for the state already recorded writes nothing (the first confirmer is kept)', async () => {
      const confirmer = uuidv4();
      const record = givenTransport({ reporter_patient_confirmed_at: new Date(), reporter_patient_confirmed_by_id: confirmer });

      const result = await service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: RESPONDER }, true);

      expect(result).toBe(record);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockAudit.logInTransaction).not.toHaveBeenCalled();
    });

    it.each(['DISPATCHER', 'SUPERVISOR'])('lets a %s confirm without a crew check', async (role) => {
      givenTransport();

      await service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role }, true);

      expect(dispatchCrew.findUnique).not.toHaveBeenCalled();
      expect(tx.transportRecord.updateMany).toHaveBeenCalledTimes(1);
    });

    it('refuses a responder who is not on the crew (403) before any write', async () => {
      givenTransport();
      dispatchCrew.findUnique.mockResolvedValue(null);

      await expect(
        service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: RESPONDER }, true),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['a guest report (no reporter account)', { user_id: null, reporter_status: 'NEEDS_HELP' }],
      ['an incident with no reporter row', null],
    ])('refuses %s with 400', async (_label, reporter) => {
      givenTransport();
      mockPrisma.incidentReporter.findUnique.mockResolvedValue(reporter);

      await expect(
        service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: RESPONDER }, true),
      ).rejects.toThrow(new BadRequestException('This report was sent without an account, so there is no reporter to share with.'));
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a transport that is no longer open (arrived, or the incident moved on) with 409 TRANSPORT_NOT_OPEN', async () => {
      givenTransport({ arrived_at: new Date() });
      mockPrisma.transportRecord.count.mockResolvedValue(0);

      const error = await service
        .confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: RESPONDER }, true)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'TRANSPORT_NOT_OPEN', transportId: TRANSPORT_ID });
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses with 409 and no audit when the transport closes between the check and the write', async () => {
      givenTransport();
      tx.transportRecord.updateMany.mockResolvedValue({ count: 0 });
      tx.transportRecord.findFirst.mockResolvedValue(null);

      await expect(
        service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: RESPONDER }, true),
      ).rejects.toThrow(ConflictException);
      expect(tx.transportRecord.findFirst).toHaveBeenCalledWith({ where: openTransportWhere({ id: TRANSPORT_ID }) });
      expect(mockAudit.logInTransaction).not.toHaveBeenCalled();
    });

    it('when another request confirms first, returns its record and writes no second audit row', async () => {
      givenTransport();
      const firstConfirmer = uuidv4();
      const confirmedByOther = mockTransportRecord({
        reporter_patient_confirmed_at: new Date(),
        reporter_patient_confirmed_by_id: firstConfirmer,
      });
      tx.transportRecord.updateMany.mockResolvedValue({ count: 0 });
      tx.transportRecord.findFirst.mockResolvedValue(confirmedByOther);

      const result = await service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: RESPONDER }, true);

      expect(result).toBe(confirmedByOther);
      expect(result.reporter_patient_confirmed_by_id).toBe(firstConfirmer);
      expect(mockAudit.logInTransaction).not.toHaveBeenCalled();
    });

    it('after a confirmation: drops the cached audience and resends the route at once; tells nobody to withdraw', async () => {
      givenTransport();

      await service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: RESPONDER }, true);

      expect(mockAudience.invalidate).toHaveBeenCalledWith(INCIDENT_ID);
      expect(mockLocations.requestImmediateRefresh).toHaveBeenCalledWith(DISPATCH_ID, INCIDENT_ID, 'audience_changed');
      expect(mockRealtime.routeWithdrawn).not.toHaveBeenCalled();
      expect(mockAudience.invalidate.mock.invocationCallOrder[0]).toBeLessThan(
        mockLocations.requestImmediateRefresh.mock.invocationCallOrder[0]!,
      );
    });

    it("after a withdrawal: tells only the reporter to drop the destination and route, then resends", async () => {
      givenTransport({ reporter_patient_confirmed_at: new Date(), reporter_patient_confirmed_by_id: uuidv4() });

      await service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: RESPONDER }, false);

      expect(mockAudience.invalidate).toHaveBeenCalledWith(INCIDENT_ID);
      expect(mockRealtime.routeWithdrawn).toHaveBeenCalledWith(INCIDENT_ID, DISPATCH_ID, 'TO_FACILITY', REPORTER_USER);
      expect(mockLocations.requestImmediateRefresh).toHaveBeenCalledWith(DISPATCH_ID, INCIDENT_ID, 'audience_changed');
    });

    it('a no-op request (same state, or another request won the race) changes no audience and emits nothing', async () => {
      givenTransport({ reporter_patient_confirmed_at: new Date(), reporter_patient_confirmed_by_id: uuidv4() });
      await service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: RESPONDER }, true);

      givenTransport();
      tx.transportRecord.updateMany.mockResolvedValue({ count: 0 });
      tx.transportRecord.findFirst.mockResolvedValue(mockTransportRecord({ reporter_patient_confirmed_at: new Date() }));
      await service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: RESPONDER }, true);

      expect(mockAudience.invalidate).not.toHaveBeenCalled();
      expect(mockLocations.requestImmediateRefresh).not.toHaveBeenCalled();
      expect(mockRealtime.routeWithdrawn).not.toHaveBeenCalled();
    });

    it('returns 404 for a transport of another incident', async () => {
      givenTransport({ incident_id: uuidv4() });

      await expect(
        service.confirmReporterIsPatient(INCIDENT_ID, TRANSPORT_ID, { id: ACTOR_ID, role: 'DISPATCHER' }, true),
      ).rejects.toThrow(NotFoundException);
    });

    it('the request body must carry a boolean `confirmed`', async () => {
      const errors = async (body: object) => validate(plainToInstance(ConfirmReporterPatientDto, body));
      expect(await errors({ confirmed: true })).toHaveLength(0);
      expect(await errors({ confirmed: false })).toHaveLength(0);
      expect(await errors({})).not.toHaveLength(0);
      expect(await errors({ confirmed: 'yes' })).not.toHaveLength(0);
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
      expect(query.include.facilities.select).toMatchObject({
        latitude: true, longitude: true, location_status: true, receiving_status: true, municipality: true, is_active: true,
      });
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

    it('gives staff the crew confirmation and the reporter-claim hint, read from counts and a status only', async () => {
      const confirmedAt = new Date();
      mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID });
      mockPrisma.transportRecord.findMany.mockResolvedValue([
        { ...row(), reporter_patient_confirmed_at: confirmedAt, reporter_patient_confirmed_by_id: ACTOR_ID },
      ]);
      mockPrisma.incident_patients.count.mockResolvedValue(1);

      const [result] = await service.listTransports(INCIDENT_ID, { id: ACTOR_ID, role: UserRole.RESPONDER });

      expect(result).toMatchObject({
        reporter_patient_confirmed_at: confirmedAt, reporterClaimsPatient: true, reporterSharingEnabled: true,
      });
      // Never a patient name for this hint: a count and the reporter's status only.
      expect(mockPrisma.incident_patients.count).toHaveBeenCalledWith({ where: { incident_id: INCIDENT_ID, is_reporter: true } });
      expect(mockPrisma.incidentReporter.findUnique).toHaveBeenCalledWith({
        where: { incident_id: INCIDENT_ID }, select: { reporter_status: true },
      });
    });

    it.each([
      ['NEEDS_HELP', 0, true],
      ['SAFE', 0, false],
      [null, 0, false],
    ])('reporterClaimsPatient with reporter status %s and %d self-patients → %s', async (status, selfPatients, expected) => {
      mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID });
      mockPrisma.transportRecord.findMany.mockResolvedValue([row()]);
      mockPrisma.incident_patients.count.mockResolvedValue(selfPatients);
      mockPrisma.incidentReporter.findUnique.mockResolvedValue(status ? { reporter_status: status } : null);

      const [result] = await service.listTransports(INCIDENT_ID, { id: ACTOR_ID, role: UserRole.DISPATCHER });

      expect(result).toMatchObject({ reporter_patient_confirmed_at: null, reporterClaimsPatient: expected });
    });

    it('tells staff and crew when the launch switch is off, so the app hides the switch', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID });
      mockPrisma.transportRecord.findMany.mockResolvedValue([row()]);
      mockAudience.reporterSharingEnabled.mockReturnValue(false);

      const [result] = await service.listTransports(INCIDENT_ID, { id: ACTOR_ID, role: UserRole.RESPONDER });

      expect(result).toMatchObject({ reporterSharingEnabled: false });
    });

    it('does not give hospital users the reporter-claim hint', async () => {
      mockPrisma.incident.findUnique.mockResolvedValue({ id: INCIDENT_ID });
      mockPrisma.organization_memberships.findMany.mockResolvedValue([{ organization_id: HOSPITAL_ORG }]);
      mockPrisma.transportRecord.findMany.mockResolvedValue([row()]);

      const [result] = await service.listTransports(INCIDENT_ID, { id: ACTOR_ID, role: UserRole.HOSPITAL_USER });

      expect(result).not.toHaveProperty('reporterClaimsPatient');
      expect(result).not.toHaveProperty('reporterSharingEnabled');
      expect(mockPrisma.incident_patients.count).not.toHaveBeenCalled();
      expect(mockPrisma.incidentReporter.findUnique).not.toHaveBeenCalled();
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
