import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IncidentStatus } from '@agap/shared';
import {
  ARRIVAL_BACKDATE_LIMIT_MS,
  TransportService,
  arrivalTime,
} from '../../src/incidents/transport/transport.service';
import { TRANSPORT_REQUEST_TTL_SECONDS, requestKey } from '../../src/incidents/transport/transport-request-cache.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';
import { RespondersService } from '../../src/responders/responders.service';
import { StartTransportDto } from '../../src/incidents/transport/dto/start-transport.dto';
import { UpdateTransportDto } from '../../src/incidents/transport/dto/update-transport.dto';
import { RecordArrivalDto } from '../../src/incidents/transport/dto/record-arrival.dto';
import { UpdateAssignmentStatusDto } from '../../src/responders/dto/update-assignment-status.dto';

// Prompt 15 (plan §19, Rule 12): the phone's outbox resends start, destination change
// and arrival with the same clientRequestId; the server answers a retry like the
// first request and never writes twice, with Redis or (when it is down) from the
// clientRequestId kept in the audit row. The fakes below keep real state (records,
// audit rows, Redis keys) so a test can count what was written.

const INCIDENT = 'inc-1';
const DISPATCH = 'dispatch-1';
const CREW = 'crew-1';
const OUTSIDER = 'not-crew';
const HOSPITAL = 'fac-1';
const OTHER_HOSPITAL = 'fac-2';
const REQ_A = '6f1c2d4e-8a9b-4c3d-9e7f-1a2b3c4d5e6f';
const REQ_B = '0b7e6c5d-4f3a-4b2c-8d1e-9f8a7b6c5d4e';

function hospitalRow(id: string) {
  return {
    id, name: `Hospital ${id}`, is_active: true, facility_type: 'HOSPITAL',
    location_status: 'VERIFIED', receiving_status: 'OPEN', latitude: 14.79679, longitude: 120.94358,
  };
}

function setup() {
  const state = {
    incidentStatus: IncidentStatus.ON_SCENE as IncidentStatus,
    records: new Map<string, Record<string, any>>(),
    audits: [] as Array<Record<string, any>>,
    redis: new Map<string, string>(),
    redisDown: false,
  };
  let nextId = 1;

  const transportRecord = {
    findFirst: jest.fn(async ({ where }: any) =>
      [...state.records.values()].find((r) =>
        (!where.dispatch_id || r.dispatch_id === where.dispatch_id)
        && (!where.id || r.id === where.id)
        && r.arrived_at === null
        && state.incidentStatus === IncidentStatus.TRANSPORTING) ?? null),
    findUnique: jest.fn(async ({ where }: any) => {
      const r = state.records.get(where.id);
      return r ? { ...r } : null;
    }),
    findUniqueOrThrow: jest.fn(async ({ where }: any) => ({ ...state.records.get(where.id)! })),
    create: jest.fn(async ({ data }: any) => {
      const r = {
        id: `tr-${nextId++}`, arrived_at: null, destination_changed: false, change_reason: null,
        estimated_arrival_at: null, ...data,
      };
      state.records.set(r.id, r);
      return { ...r };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const r = { ...state.records.get(where.id)!, ...data };
      state.records.set(where.id, r);
      return { ...r };
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const r = state.records.get(where.id);
      if (!r || (where.arrived_at === null && r.arrived_at !== null)) return { count: 0 };
      state.records.set(where.id, { ...r, ...data });
      return { count: 1 };
    }),
  };
  const auditLog = {
    findFirst: jest.fn(async ({ where }: any) => {
      const row = state.audits.find((a) =>
        a.incident_id === where.incident_id
        && a.entity_type === where.entity_type
        && a.occurred_at >= where.occurred_at.gte
        && a.new_values?.[where.new_values.path[0]] === where.new_values.equals);
      return row ? { entity_id: row.entity_id } : null;
    }),
  };
  const client = {
    $queryRaw: jest.fn(async () => [{ status: state.incidentStatus }]),
    dispatches: {
      findUnique: jest.fn(async () => ({
        id: DISPATCH, incident_id: INCIDENT, resource_id: 'res-1', status: 'ACCEPTED', dispatch_crew: [{ user_id: CREW }],
      })),
    },
    dispatch_crew: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.dispatch_id_user_id.user_id === CREW ? { id: 'crew-row' } : null),
    },
    facility: { findUnique: jest.fn(async ({ where }: any) => hospitalRow(where.id)) },
    transportRecord,
    auditLog,
    incident: {
      findUnique: jest.fn(async () => ({ status: state.incidentStatus })),
      update: jest.fn(async ({ data }: any) => {
        state.incidentStatus = data.status;
        return { id: INCIDENT, status: data.status };
      }),
    },
    incidentEvent: { create: jest.fn(async () => ({})) },
    facility_referrals: { findMany: jest.fn(async () => []), update: jest.fn() },
  };
  const prisma = { ...client, $transaction: jest.fn(async (fn: (tx: typeof client) => unknown) => fn(client)) };

  const audit = {
    log: jest.fn(async () => undefined),
    logInTransaction: jest.fn(async (_tx: unknown, entry: any) => {
      state.audits.push({
        incident_id: entry.incidentId, entity_type: entry.entityType, entity_id: entry.entityId,
        new_values: entry.newValues, occurred_at: new Date(),
      });
    }),
  };
  // Redis: JSON in, JSON out (as the real client); "down" behaves like the fail-open service.
  const requests = {
    get: jest.fn(async (d: string, c: string) => {
      if (state.redisDown) return null;
      const raw = state.redis.get(requestKey(d, c));
      return raw ? JSON.parse(raw) : null;
    }),
    set: jest.fn(async (d: string, c: string, v: unknown) => {
      if (!state.redisDown) state.redis.set(requestKey(d, c), JSON.stringify(v));
    }),
  };
  const realtime = {
    statusChanged: jest.fn(), incidentTransporting: jest.fn(), transportUpdated: jest.fn(), facilityArrival: jest.fn(),
    incidentUpdated: jest.fn(), notifyIncidentStatusChanged: jest.fn(), responderStatus: jest.fn(),
  };
  const audience = {
    invalidate: jest.fn(),
    roomsForDispatch: jest.fn(async () => ({ incidentRoom: false, userIds: [CREW] })),
    confirmedReporter: jest.fn(async () => null),
  };
  const locations = { requestImmediateRefresh: jest.fn(async () => undefined) };
  const routeCache = { clear: jest.fn(async () => undefined) };
  const notifier = { notifyReporter: jest.fn(async () => undefined), notifyDispatcher: jest.fn(async () => undefined) };
  const statusService = new IncidentStatusService();

  const transport = new TransportService(
    prisma as any, audit as any, realtime as any, statusService, locations as any, routeCache as any,
    audience as any, requests as any,
  );
  const responders = new RespondersService(
    prisma as any, realtime as any, audit as any, statusService, transport, audience as any, notifier as any,
  );
  const transportAudits = () => state.audits.filter((a) => a.entity_type === 'transport_record');
  return { state, prisma, transport, responders, transportRecord, audit, realtime, notifier, requests, transportAudits };
}

/** What the client receives: the HTTP body after JSON serialisation. */
const wire = (value: unknown) => JSON.parse(JSON.stringify(value));

describe('Transport retries with clientRequestId (Prompt 15)', () => {
  describe('POST /incidents/:id/transport', () => {
    it('same clientRequestId twice: one record, one transition, the same answer; the retry writes nothing', async () => {
      const t = setup();
      const dto = { dispatchId: DISPATCH, destinationId: HOSPITAL, clientRequestId: REQ_A };

      const first = await t.transport.startTransport(INCIDENT, dto, CREW, 'RESPONDER');
      const second = await t.transport.startTransport(INCIDENT, dto, CREW, 'RESPONDER');

      expect(t.state.records.size).toBe(1);
      expect(t.transportRecord.create).toHaveBeenCalledTimes(1);
      expect(t.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(t.realtime.statusChanged).toHaveBeenCalledTimes(1);
      expect(t.realtime.incidentTransporting).toHaveBeenCalledTimes(1);
      expect(wire(second)).toEqual(wire(first));
      expect(t.transportAudits()).toHaveLength(1);
      expect(t.transportAudits()[0]!.new_values).toMatchObject({ clientRequestId: REQ_A, destination_id: HOSPITAL });
    });

    it('keeps the answer 24 h under transport:req:{dispatchId}:{clientRequestId}', async () => {
      const t = setup();
      await t.transport.startTransport(INCIDENT, { dispatchId: DISPATCH, clientRequestId: REQ_A }, CREW, 'RESPONDER');

      expect(requestKey(DISPATCH, REQ_A)).toBe(`transport:req:${DISPATCH}:${REQ_A}`);
      expect(TRANSPORT_REQUEST_TTL_SECONDS).toBe(86_400);
      expect(t.requests.set).toHaveBeenCalledWith(DISPATCH, REQ_A, expect.objectContaining({ incidentId: INCIDENT }));
    });

    it('Redis down: a retry after the arrival still creates no second record (audit row fallback)', async () => {
      const t = setup();
      t.state.redisDown = true;
      const start = { dispatchId: DISPATCH, destinationId: HOSPITAL, clientRequestId: REQ_A };
      const first = await t.transport.startTransport(INCIDENT, start, CREW, 'RESPONDER');
      await t.transport.recordArrival(INCIDENT, first.id, {}, CREW, 'RESPONDER');

      // The incident is still TRANSPORTING, so without the id this would open a new transport.
      const retry = await t.transport.startTransport(INCIDENT, start, CREW, 'RESPONDER');

      expect(t.state.records.size).toBe(1);
      expect(retry.id).toBe(first.id);
      expect(retry.arrived_at).not.toBeNull();
      expect(t.realtime.incidentTransporting).toHaveBeenCalledTimes(1);
    });

    it('different clientRequestIds follow the normal rules: a repeat start is unchanged, a start after arrival opens a new transport', async () => {
      const t = setup();
      const first = await t.transport.startTransport(INCIDENT, { dispatchId: DISPATCH, clientRequestId: REQ_A }, CREW, 'RESPONDER');
      const repeat = await t.transport.startTransport(INCIDENT, { dispatchId: DISPATCH, clientRequestId: REQ_B }, CREW, 'RESPONDER');
      expect(repeat.id).toBe(first.id);
      expect(t.state.records.size).toBe(1);

      await t.transport.recordArrival(INCIDENT, first.id, {}, CREW, 'RESPONDER');
      const next = await t.transport.startTransport(
        INCIDENT, { dispatchId: DISPATCH, clientRequestId: '1d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c5d' }, CREW, 'RESPONDER',
      );
      expect(next.id).not.toBe(first.id);
      expect(t.state.records.size).toBe(2);
    });

    it('a stored answer goes back only to the crew: someone else with the same id gets 403', async () => {
      const t = setup();
      await t.transport.startTransport(INCIDENT, { dispatchId: DISPATCH, clientRequestId: REQ_A }, CREW, 'RESPONDER');

      await expect(
        t.transport.startTransport(INCIDENT, { dispatchId: DISPATCH, clientRequestId: REQ_A }, OUTSIDER, 'RESPONDER'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a stored answer for another incident is not returned', async () => {
      const t = setup();
      t.state.redis.set(requestKey(DISPATCH, REQ_A), JSON.stringify({ incidentId: 'inc-other', response: { id: 'tr-x' } }));

      const result = await t.transport.startTransport(INCIDENT, { dispatchId: DISPATCH, clientRequestId: REQ_A }, CREW, 'RESPONDER');

      expect(result.id).not.toBe('tr-x');
      expect(t.transportRecord.create).toHaveBeenCalledTimes(1);
    });

    it('without a clientRequestId nothing changes: no Redis call', async () => {
      const t = setup();
      await t.transport.startTransport(INCIDENT, { dispatchId: DISPATCH }, CREW, 'RESPONDER');

      expect(t.requests.get).not.toHaveBeenCalled();
      expect(t.requests.set).not.toHaveBeenCalled();
      expect(t.transportAudits()[0]!.new_values).not.toHaveProperty('clientRequestId');
    });
  });

  describe('PATCH /responders/assignments/:id/status TRANSPORTING (the crew button)', () => {
    it('same clientRequestId twice: one record, one push to the reporter and dispatcher, the same answer', async () => {
      const t = setup();
      const dto = { status: 'TRANSPORTING', clientRequestId: REQ_A };

      const first = await t.responders.updateStatus(DISPATCH, CREW, dto);
      const second = await t.responders.updateStatus(DISPATCH, CREW, dto);

      expect(t.state.records.size).toBe(1);
      expect(t.notifier.notifyReporter).toHaveBeenCalledTimes(1);
      expect(t.notifier.notifyDispatcher).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
      expect(t.transportAudits()[0]!.new_values).toMatchObject({ clientRequestId: REQ_A });
    });

    it('Redis down: the retry finds the audit row and starts nothing new', async () => {
      const t = setup();
      t.state.redisDown = true;
      const dto = { status: 'TRANSPORTING', clientRequestId: REQ_A };

      await t.responders.updateStatus(DISPATCH, CREW, dto);
      await t.responders.updateStatus(DISPATCH, CREW, dto);

      expect(t.state.records.size).toBe(1);
      expect(t.notifier.notifyReporter).toHaveBeenCalledTimes(1);
      expect(t.realtime.incidentTransporting).toHaveBeenCalledTimes(1);
    });

    it('other statuses ignore clientRequestId', async () => {
      const t = setup();
      await t.responders.updateStatus(DISPATCH, CREW, { status: 'RESOLVED', clientRequestId: REQ_A }).catch(() => undefined);

      expect(t.requests.get).not.toHaveBeenCalled();
    });
  });

  describe('PATCH …/transport/:id/arrive', () => {
    async function transporting(t: ReturnType<typeof setup>) {
      return t.transport.startTransport(INCIDENT, { dispatchId: DISPATCH, destinationId: HOSPITAL }, CREW, 'RESPONDER');
    }

    it('same clientRequestId twice: one arrival, one audit row, one facility_arrival, the same answer', async () => {
      const t = setup();
      const open = await transporting(t);

      const first = await t.transport.recordArrival(INCIDENT, open.id, { clientRequestId: REQ_A }, CREW, 'RESPONDER');
      const second = await t.transport.recordArrival(INCIDENT, open.id, { clientRequestId: REQ_A }, CREW, 'RESPONDER');

      expect(wire(second)).toEqual(wire(first));
      expect(t.realtime.facilityArrival).toHaveBeenCalledTimes(1);
      expect(t.transportAudits().filter((a) => a.new_values.arrived_at)).toHaveLength(1);
    });

    it('Redis down: the retry gets the record back instead of 400, and nothing is written or announced again', async () => {
      const t = setup();
      t.state.redisDown = true;
      const open = await transporting(t);
      const first = await t.transport.recordArrival(INCIDENT, open.id, { clientRequestId: REQ_A }, CREW, 'RESPONDER');

      const second = await t.transport.recordArrival(INCIDENT, open.id, { clientRequestId: REQ_A }, CREW, 'RESPONDER');

      expect(second.arrived_at).toEqual(first.arrived_at);
      expect(t.transportRecord.updateMany).toHaveBeenCalledTimes(1);
      expect(t.realtime.facilityArrival).toHaveBeenCalledTimes(1);
    });

    it('two copies at once (both read it unarrived): the loser returns the winner\'s record, no second audit or event', async () => {
      const t = setup();
      t.state.redisDown = true;
      const open = await transporting(t);
      const stale = { ...t.state.records.get(open.id)! };
      await t.transport.recordArrival(INCIDENT, open.id, { clientRequestId: REQ_A }, CREW, 'RESPONDER');
      t.transportRecord.findUnique.mockResolvedValueOnce(stale);

      const loser = await t.transport.recordArrival(INCIDENT, open.id, { clientRequestId: REQ_A }, CREW, 'RESPONDER');

      expect(loser.arrived_at).not.toBeNull();
      expect(t.transportAudits().filter((a) => a.new_values.arrived_at)).toHaveLength(1);
      expect(t.realtime.facilityArrival).toHaveBeenCalledTimes(1);
    });

    it('a different clientRequestId after arrival follows the normal rule: 400', async () => {
      const t = setup();
      const open = await transporting(t);
      await t.transport.recordArrival(INCIDENT, open.id, { clientRequestId: REQ_A }, CREW, 'RESPONDER');

      await expect(
        t.transport.recordArrival(INCIDENT, open.id, { clientRequestId: REQ_B }, CREW, 'RESPONDER'),
      ).rejects.toThrow('Arrival already recorded for this transport');
    });

    it('occurredAt 10 min ago: arrived_at is the tap time; the audit keeps occurredAt and the server receipt time', async () => {
      const t = setup();
      const open = await transporting(t);
      t.state.records.get(open.id)!.transport_started_at = new Date(Date.now() - 20 * 60_000);
      const occurredAt = new Date(Date.now() - 10 * 60_000).toISOString();

      const before = Date.now();
      const arrived = await t.transport.recordArrival(
        INCIDENT, open.id, { occurredAt, clientRequestId: REQ_A }, CREW, 'RESPONDER',
      );

      expect(new Date(arrived.arrived_at).toISOString()).toBe(occurredAt);
      const row = t.transportAudits().find((a) => a.new_values.arrived_at)!;
      expect(row.new_values).toMatchObject({ arrived_at: occurredAt, occurredAt, clientRequestId: REQ_A });
      expect(new Date(row.new_values.receivedAt).getTime()).toBeGreaterThanOrEqual(before);
      expect(t.realtime.facilityArrival).toHaveBeenCalledWith(expect.objectContaining({ arrivedAt: occurredAt }), null);
    });

    it('occurredAt older than 30 min or in the future → 400 and nothing is written', async () => {
      const t = setup();
      const open = await transporting(t);

      for (const occurredAt of [
        new Date(Date.now() - 31 * 60_000).toISOString(),
        new Date(Date.now() + 5 * 60_000).toISOString(),
      ]) {
        await expect(
          t.transport.recordArrival(INCIDENT, open.id, { occurredAt }, CREW, 'RESPONDER'),
        ).rejects.toThrow(BadRequestException);
      }
      expect(t.transportRecord.updateMany).not.toHaveBeenCalled();
      expect(t.state.records.get(open.id)!.arrived_at).toBeNull();
    });
  });

  describe('arrivalTime (pure)', () => {
    const now = new Date('2026-10-29T10:00:00.000Z');
    const started = new Date('2026-10-29T09:20:00.000Z');

    it('no occurredAt → now', () => {
      expect(arrivalTime(undefined, now, started)).toEqual(now);
    });

    it('within 30 min → occurredAt; exactly 30 min is still accepted', () => {
      expect(arrivalTime('2026-10-29T09:45:00.000Z', now, started)).toEqual(new Date('2026-10-29T09:45:00.000Z'));
      expect(arrivalTime(new Date(now.getTime() - ARRIVAL_BACKDATE_LIMIT_MS).toISOString(), now, null))
        .toEqual(new Date('2026-10-29T09:30:00.000Z'));
    });

    it('30 min and 1 s ago → 400', () => {
      expect(() => arrivalTime('2026-10-29T09:29:59.000Z', now, null)).toThrow(BadRequestException);
    });

    it('up to 1 min ahead (phone clock) → now; more → 400', () => {
      expect(arrivalTime('2026-10-29T10:00:45.000Z', now, null)).toEqual(now);
      expect(() => arrivalTime('2026-10-29T10:01:01.000Z', now, null)).toThrow(BadRequestException);
    });

    it('never before the transport started', () => {
      expect(arrivalTime('2026-10-29T09:35:00.000Z', now, new Date('2026-10-29T09:40:00.000Z')))
        .toEqual(new Date('2026-10-29T09:40:00.000Z'));
    });
  });

  describe('PATCH …/transport/:id (destination change)', () => {
    it('Redis down: a late retry of change A does not undo the later change B', async () => {
      const t = setup();
      t.state.redisDown = true;
      const open = await t.transport.startTransport(INCIDENT, { dispatchId: DISPATCH, destinationId: HOSPITAL }, CREW, 'RESPONDER');

      await t.transport.updateTransport(INCIDENT, open.id, { destinationId: OTHER_HOSPITAL, clientRequestId: REQ_A }, CREW, 'RESPONDER');
      await t.transport.updateTransport(INCIDENT, open.id, { destinationId: HOSPITAL, clientRequestId: REQ_B }, CREW, 'RESPONDER');
      const retryA = await t.transport.updateTransport(
        INCIDENT, open.id, { destinationId: OTHER_HOSPITAL, clientRequestId: REQ_A }, CREW, 'RESPONDER',
      );

      expect(t.state.records.get(open.id)!.destination_id).toBe(HOSPITAL);
      expect(retryA.destination_id).toBe(HOSPITAL);
      expect(retryA.warnings).toEqual([]);
      expect(t.transportRecord.update).toHaveBeenCalledTimes(2);
      expect(t.transportAudits().filter((a) => a.new_values.clientRequestId)).toHaveLength(2);
    });

    it('same clientRequestId twice (Redis up): the same answer, one write', async () => {
      const t = setup();
      const open = await t.transport.startTransport(INCIDENT, { dispatchId: DISPATCH, destinationId: HOSPITAL }, CREW, 'RESPONDER');
      const dto = { destinationId: OTHER_HOSPITAL, clientRequestId: REQ_A };

      const first = await t.transport.updateTransport(INCIDENT, open.id, dto, CREW, 'RESPONDER');
      const second = await t.transport.updateTransport(INCIDENT, open.id, dto, CREW, 'RESPONDER');

      expect(wire(second)).toEqual(wire(first));
      expect(t.transportRecord.update).toHaveBeenCalledTimes(1);
      expect(t.realtime.transportUpdated).toHaveBeenCalledTimes(1);
    });
  });

  describe('DTOs', () => {
    const errorsOf = async (cls: any, body: object) =>
      (await validate(plainToInstance(cls, body))).map((e) => e.property);

    it('clientRequestId must be a UUID on all four bodies; it is optional', async () => {
      for (const [cls, base] of [
        [StartTransportDto, { dispatchId: '00000000-0000-0000-0002-000000000006' }],
        [UpdateTransportDto, {}],
        [RecordArrivalDto, {}],
        [UpdateAssignmentStatusDto, { status: 'TRANSPORTING' }],
      ] as const) {
        expect(await errorsOf(cls, base)).toEqual([]);
        expect(await errorsOf(cls, { ...base, clientRequestId: REQ_A })).toEqual([]);
        expect(await errorsOf(cls, { ...base, clientRequestId: 'tap-1' })).toEqual(['clientRequestId']);
      }
    });

    it('occurredAt must be an ISO 8601 time', async () => {
      expect(await errorsOf(RecordArrivalDto, { occurredAt: '2026-10-29T09:45:00.000Z' })).toEqual([]);
      expect(await errorsOf(RecordArrivalDto, { occurredAt: 'yesterday' })).toEqual(['occurredAt']);
    });
  });
});
