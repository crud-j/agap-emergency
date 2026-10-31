import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { IncidentStatus, NOTIFICATION_EVENT_TYPES, UserRole } from '@agap/shared';
import {
  RescueTripService,
  notifyRescueStillWaiting,
  rescueTripProblems,
} from '../../src/incidents/rescue-trip/rescue-trip.service';
import { SubmitRescueTripDto } from '../../src/incidents/rescue-trip/dto/submit-rescue-trip.dto';
import { rescueTotalsByBarangay, summarizeRescueTrips } from '../../src/incidents/rescue-trip/rescue-summary';
import { DisasterModeService } from '../../src/disaster-mode/disaster-mode.service';
import { FacilitiesService } from '../../src/facilities/facilities.service';
import { RespondersService } from '../../src/responders/responders.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';

/**
 * Unit field flow plan, Phase 4 (MOD-32/52): a rescue crew's trip log. One row per
 * trip, append-only, every field optional, idempotent by client request ID, counts and
 * the destination's name only in any payload or notice, never a TransportRecord, and
 * the notices to dispatchers never act.
 */

const INCIDENT = 'inc-1';
const BOAT_CREW = 'resp-boat';
const EVAC = '3f0c2a1e-5b6d-4c7e-8f90-a1b2c3d4e5f6';
const NOTE = 'Lola Nena refused to leave, second floor';
const CLIENT_ID = '7b1f4c1e-8d43-4a8e-9a55-0c1d2e3f4a5b';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'trip-1',
    incident_id: INCIDENT,
    dispatch_id: 'disp-boat',
    reported_by_id: BOAT_CREW,
    rescued_count: null,
    families: null,
    children: null,
    elderly: null,
    pwd: null,
    pregnant: null,
    still_waiting: null,
    water_level: null,
    access: null,
    taken_to: null,
    taken_to_facility_id: null,
    taken_to_other: null,
    notes: null,
    client_request_id: null,
    reported_at: new Date('2026-10-31T02:00:00Z'),
    facilities: null,
    ...overrides,
  };
}

function build(opts: {
  crewed?: Array<{ id: string; resource_type: string }>;
  ambulances?: number;
  recentNotice?: boolean;
  repeat?: Record<string, unknown> | null;
  facility?: { id: string } | null;
  emitFails?: boolean;
  noticeFails?: boolean;
} = {}) {
  const crewed = opts.crewed ?? [{ id: 'disp-boat', resource_type: 'RESCUE_BOAT' }];
  const prisma: any = {
    incident: {
      findUnique: jest.fn().mockResolvedValue({ id: INCIDENT, public_reference: 'INC-2026-000777' }),
      update: jest.fn(),
    },
    dispatches: {
      findMany: jest.fn().mockResolvedValue(crewed.map((d) => ({ id: d.id, resources: { resource_type: d.resource_type } }))),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(opts.ambulances ?? 0),
      create: jest.fn(),
    },
    facility: {
      findFirst: jest.fn().mockResolvedValue(opts.facility === undefined ? { id: EVAC } : opts.facility),
    },
    rescue_trip_reports: {
      findUnique: jest.fn().mockResolvedValue(opts.repeat ?? null),
      create: jest.fn(async ({ data }: any) => row({
        ...data,
        id: `trip-${prisma.rescue_trip_reports.create.mock.calls.length}`,
        facilities: data.taken_to_facility_id ? { name: 'Lolomboy Barangay Hall Evacuation Center' } : null,
      })),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    transportRecord: { create: jest.fn() },
    notification: { findFirst: jest.fn().mockResolvedValue(opts.recentNotice ? { id: 'n-old' } : null) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'disp-user', full_name: 'D' }]) },
    surge_incidents: { create: jest.fn(), update: jest.fn() },
  };
  const realtime: any = {
    fieldReport: opts.emitFails ? jest.fn(() => { throw new Error('ws down'); }) : jest.fn(),
  };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications: any = {
    create: opts.noticeFails ? jest.fn().mockRejectedValue(new Error('db busy')) : jest.fn().mockResolvedValue({}),
  };
  const service = new RescueTripService(prisma, realtime, audit, notifications);
  const crew = { id: BOAT_CREW, role: UserRole.RESPONDER };
  return { service, prisma, realtime, audit, notifications, crew };
}

async function errorsFor(body: Record<string, unknown>) {
  return validate(plainToInstance(SubmitRescueTripDto, body));
}

describe('SubmitRescueTripDto', () => {
  it('accepts an empty trip: every field is optional', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('accepts a full trip with codes from @agap/shared', async () => {
    expect(await errorsFor({
      rescuedCount: 6, families: 2, children: 3, elderly: 1, pwd: 1, pregnant: 0, stillWaiting: 10,
      waterLevel: 'WAIST', access: 'BOAT_ONLY', takenTo: 'EVACUATION_CENTER', takenToFacilityId: EVAC,
      notes: 'ok', clientRequestId: CLIENT_ID,
    })).toHaveLength(0);
  });

  it.each([
    ['an unknown water level', { waterLevel: 'NECK' }],
    ['an unknown access', { access: 'HELICOPTER' }],
    ['an unknown destination', { takenTo: 'HOSPITAL' }],
    ['a negative count', { rescuedCount: -1 }],
    ['a fractional count', { children: 1.5 }],
    ['a count as text', { elderly: '2' }],
    ['a facility ID that is not a UUID', { takenToFacilityId: 'lolomboy' }],
    ['"other" text over 200 characters', { takenTo: 'OTHER', takenToOther: 'x'.repeat(201) }],
    ['notes over 1000 characters', { notes: 'x'.repeat(1001) }],
    ['a client request ID that is not a UUID', { clientRequestId: 'abc' }],
  ])('refuses %s', async (_label, body) => {
    expect((await errorsFor(body)).length).toBeGreaterThan(0);
  });
});

describe('rescueTripProblems (D2 rules across fields)', () => {
  it('each vulnerable count and families is at most the people rescued; they may overlap', () => {
    expect(rescueTripProblems({ rescuedCount: 4, children: 4, elderly: 4, pwd: 1, pregnant: 1, families: 2 })).toEqual([]);
    expect(rescueTripProblems({ rescuedCount: 3, children: 4, families: 5 })).toEqual([
      "Families (5) can't be more than people rescued (3).",
      "Children (under 18) (4) can't be more than people rescued (3).",
    ]);
    // No rescued count given: the parts can't be compared, so they stand.
    expect(rescueTripProblems({ children: 2 })).toEqual([]);
  });

  it('the destination fields match taken-to', () => {
    expect(rescueTripProblems({ takenTo: 'EVACUATION_CENTER' })).toEqual(['Choose the evacuation center.']);
    expect(rescueTripProblems({ takenTo: 'STAYED', takenToFacilityId: EVAC })).toHaveLength(1);
    expect(rescueTripProblems({ takenTo: 'STAYED', takenToOther: 'chapel' })).toHaveLength(1);
    expect(rescueTripProblems({ takenTo: 'OTHER', takenToOther: 'chapel' })).toEqual([]);
  });
});

describe('RescueTripService.submit — who may file', () => {
  it('refuses a responder who is not on an active crew of this incident (403), and saves nothing', async () => {
    const { service, prisma, crew } = build({ crewed: [] });
    await expect(service.submit(INCIDENT, {}, crew)).rejects.toMatchObject({ status: 403 });
    expect(prisma.rescue_trip_reports.create).not.toHaveBeenCalled();
  });

  it.each(['AMBULANCE', 'FIRE_TRUCK', 'MOTORCYCLE_RESPONDER'])(
    'refuses the crew of a %s with 409 RESCUE_TRIP_NOT_FOR_UNIT, and saves nothing',
    async (resourceType) => {
      const { service, prisma, crew } = build({ crewed: [{ id: 'disp-x', resource_type: resourceType }] });
      await expect(service.submit(INCIDENT, { rescuedCount: 2 }, crew))
        .rejects.toMatchObject({ response: { code: 'RESCUE_TRIP_NOT_FOR_UNIT' } });
      expect(prisma.rescue_trip_reports.create).not.toHaveBeenCalled();
    },
  );

  it('a rescue truck files too, on its own dispatch', async () => {
    const { service, prisma, crew } = build({
      crewed: [{ id: 'disp-amb', resource_type: 'AMBULANCE' }, { id: 'disp-truck', resource_type: 'RESCUE_TRUCK' }],
    });
    await service.submit(INCIDENT, { dispatchId: '00000000-0000-0000-0000-000000000000' }, crew);
    expect(prisma.rescue_trip_reports.create.mock.calls[0][0].data.dispatch_id).toBe('disp-truck');
  });

  it('a dispatcher relays a radio trip without a crew check', async () => {
    const { service, prisma } = build({ crewed: [] });
    await service.submit(INCIDENT, { rescuedCount: 3 }, { id: 'disp-user', role: UserRole.DISPATCHER });
    expect(prisma.dispatches.findMany).not.toHaveBeenCalled();
    expect(prisma.rescue_trip_reports.create.mock.calls[0][0].data).toMatchObject({ dispatch_id: null, rescued_count: 3 });
  });

  it('refuses vulnerable counts above the rescued count with 400, and saves nothing', async () => {
    const { service, prisma, crew } = build();
    await expect(service.submit(INCIDENT, { rescuedCount: 2, children: 3 }, crew)).rejects.toMatchObject({ status: 400 });
    expect(prisma.rescue_trip_reports.create).not.toHaveBeenCalled();
  });

  it('an evacuation center must be an ACTIVE facility of type EVACUATION_CENTER (otherwise 400)', async () => {
    const { service, prisma, crew } = build({ facility: null });
    await expect(service.submit(INCIDENT, { takenTo: 'EVACUATION_CENTER', takenToFacilityId: EVAC }, crew))
      .rejects.toMatchObject({ status: 400 });
    expect(prisma.facility.findFirst).toHaveBeenCalledWith({
      where: { id: EVAC, is_active: true, facility_type: 'EVACUATION_CENTER' },
      select: { id: true },
    });
    expect(prisma.rescue_trip_reports.create).not.toHaveBeenCalled();
  });
});

describe('RescueTripService.submit — the record', () => {
  it('stores an empty trip as a row of nulls, never a TransportRecord, never the incident status', async () => {
    const { service, prisma, crew } = build();
    await service.submit(INCIDENT, {}, crew);
    expect(prisma.rescue_trip_reports.create).toHaveBeenCalledWith({
      data: {
        incident_id: INCIDENT,
        dispatch_id: 'disp-boat',
        reported_by_id: BOAT_CREW,
        rescued_count: null,
        families: null,
        children: null,
        elderly: null,
        pwd: null,
        pregnant: null,
        still_waiting: null,
        water_level: null,
        access: null,
        taken_to: null,
        taken_to_facility_id: null,
        taken_to_other: null,
        notes: null,
        client_request_id: null,
      },
      include: { facilities: { select: { name: true } } },
    });
    expect(prisma.transportRecord.create).not.toHaveBeenCalled();
    expect(prisma.incident.update).not.toHaveBeenCalled();
  });

  it('is append-only: every trip is a new row and none is ever updated', async () => {
    const { service, prisma, crew } = build();
    const first = await service.submit(INCIDENT, { rescuedCount: 5 }, crew);
    const second = await service.submit(INCIDENT, { rescuedCount: 4 }, crew);
    expect(prisma.rescue_trip_reports.create).toHaveBeenCalledTimes(2);
    expect(first.id).not.toBe(second.id);
    expect(prisma.rescue_trip_reports.update).not.toHaveBeenCalled();
    expect(prisma.rescue_trip_reports.updateMany).not.toHaveBeenCalled();
  });

  it('a resend with the same clientRequestId returns the first trip: no second row, audit, event or notice', async () => {
    const first = row({ id: 'trip-first', client_request_id: CLIENT_ID, taken_to: 'HANDED_TO_AMBULANCE' });
    const { service, prisma, realtime, audit, notifications, crew } = build({ repeat: first });
    const result = await service.submit(INCIDENT, { clientRequestId: CLIENT_ID, takenTo: 'HANDED_TO_AMBULANCE' }, crew);
    expect(result).toBe(first);
    expect(prisma.rescue_trip_reports.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(realtime.fieldReport).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('two copies of one resend at once: the unique index stops the second, which returns the first', async () => {
    const first = row({ id: 'trip-first', client_request_id: CLIENT_ID });
    const { service, prisma, crew } = build();
    prisma.rescue_trip_reports.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(first);
    prisma.rescue_trip_reports.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(service.submit(INCIDENT, { clientRequestId: CLIENT_ID }, crew)).resolves.toBe(first);
  });

  it("refuses a clientRequestId already used on another incident", async () => {
    const { service, crew } = build({ repeat: row({ incident_id: 'inc-other', client_request_id: CLIENT_ID }) });
    await expect(service.submit(INCIDENT, { clientRequestId: CLIENT_ID }, crew))
      .rejects.toMatchObject({ response: { code: 'CLIENT_REQUEST_ID_REUSED' } });
  });

  it('keeps the "other" place only with taken-to OTHER', async () => {
    const { service, prisma, crew } = build();
    await service.submit(INCIDENT, { takenTo: 'OTHER', takenToOther: '  San Roque chapel  ' }, crew);
    expect(prisma.rescue_trip_reports.create.mock.calls[0][0].data.taken_to_other).toBe('San Roque chapel');
  });
});

describe('RescueTripService.submit — output carries counts and the destination name only', () => {
  it('the ops event and the audit row hold no notes and no free-text place', async () => {
    const { service, realtime, audit, crew } = build();
    await service.submit(INCIDENT, {
      rescuedCount: 6, families: 2, children: 3, elderly: 1, pwd: 0, pregnant: 1, stillWaiting: 12,
      waterLevel: 'CHEST', access: 'BOAT_ONLY', takenTo: 'EVACUATION_CENTER', takenToFacilityId: EVAC, notes: NOTE,
    }, crew);

    expect(realtime.fieldReport).toHaveBeenCalledWith({
      incidentId: INCIDENT,
      kind: 'RESCUE',
      reportId: 'trip-1',
      dispatchId: 'disp-boat',
      reportedAt: '2026-10-31T02:00:00.000Z',
      rescuedCount: 6,
      families: 2,
      children: 3,
      elderly: 1,
      pwd: 0,
      pregnant: 1,
      stillWaiting: 12,
      waterLevel: 'CHEST',
      access: 'BOAT_ONLY',
      takenTo: 'EVACUATION_CENTER',
      takenToFacilityName: 'Lolomboy Barangay Hall Evacuation Center',
    });
    expect(audit.log.mock.calls[0][0]).toMatchObject({
      entityType: 'rescue_trip_report', moduleId: 'MOD-32', newValues: { hasNote: true, rescuedCount: 6 },
    });
    const everything = JSON.stringify([realtime.fieldReport.mock.calls, audit.log.mock.calls]);
    expect(everything).not.toContain('Nena');
    expect(everything).not.toContain('second floor');
  });

  it('a failed emit, audit or notice never undoes the trip', async () => {
    const { service, audit, crew } = build({ emitFails: true, noticeFails: true });
    audit.log.mockRejectedValue(new Error('audit down'));
    await expect(service.submit(INCIDENT, { takenTo: 'HANDED_TO_AMBULANCE' }, crew)).resolves.toMatchObject({ id: 'trip-1' });
  });
});

describe('RescueTripService.submit — handed to an ambulance with none on the incident', () => {
  it('suggests one to Dispatchers (IN_APP, linked to the incident), and never dispatches', async () => {
    const { service, prisma, notifications, crew } = build({ ambulances: 0 });
    await service.submit(INCIDENT, { rescuedCount: 2, takenTo: 'HANDED_TO_AMBULANCE', notes: NOTE }, crew);

    expect(prisma.dispatches.count).toHaveBeenCalledWith({
      where: { incident_id: INCIDENT, status: { in: ['PENDING', 'SENT', 'ACCEPTED'] }, resources: { resource_type: 'AMBULANCE' } },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ role: { in: ['DISPATCHER'] } }),
    }));
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create.mock.calls[0][0]).toMatchObject({
      userId: 'disp-user',
      eventType: NOTIFICATION_EVENT_TYPES.RESCUE_AMBULANCE_SUGGESTED,
      channel: 'IN_APP',
      incidentId: INCIDENT,
      body: 'INC-2026-000777: 2 rescued were handed to an ambulance, but none is dispatched here. Consider sending one.',
    });
    expect(JSON.stringify(notifications.create.mock.calls)).not.toContain('Nena');
    expect(prisma.dispatches.create).not.toHaveBeenCalled();
    expect(prisma.surge_incidents.create).not.toHaveBeenCalled();
  });

  it('no notice when an ambulance is on the incident, or for another destination', async () => {
    const withAmbulance = build({ ambulances: 1 });
    await withAmbulance.service.submit(INCIDENT, { takenTo: 'HANDED_TO_AMBULANCE' }, withAmbulance.crew);
    expect(withAmbulance.notifications.create).not.toHaveBeenCalled();

    const stayed = build({ ambulances: 0 });
    await stayed.service.submit(INCIDENT, { takenTo: 'STAYED' }, stayed.crew);
    expect(stayed.prisma.dispatches.count).not.toHaveBeenCalled();
    expect(stayed.notifications.create).not.toHaveBeenCalled();
  });

  it('dedups per incident for 10 minutes', async () => {
    const { service, prisma, notifications, crew } = build({ recentNotice: true });
    await service.submit(INCIDENT, { takenTo: 'HANDED_TO_AMBULANCE' }, crew);
    expect(notifications.create).not.toHaveBeenCalled();
    const where = prisma.notification.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ event_type: 'RESCUE_AMBULANCE_SUGGESTED', incident_id: INCIDENT });
    const windowMs = Date.now() - where.created_at.gte.getTime();
    expect(windowMs).toBeGreaterThanOrEqual(10 * 60 * 1000 - 1000);
    expect(windowMs).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
  });
});

describe('summarizeRescueTrips', () => {
  it('sums the counts, keeps the newest still-waiting estimate and totals per destination', () => {
    const summary = summarizeRescueTrips([
      row({ id: 't1', rescued_count: 5, children: 2, elderly: 1, families: 2, still_waiting: 9,
        taken_to: 'EVACUATION_CENTER', taken_to_facility_id: EVAC, facilities: { name: 'Lolomboy EC' },
        reported_at: new Date('2026-10-31T01:00:00Z') }),
      row({ id: 't2', rescued_count: 4, children: 1, pregnant: 1, still_waiting: 5,
        taken_to: 'EVACUATION_CENTER', taken_to_facility_id: EVAC, facilities: { name: 'Lolomboy EC' },
        reported_at: new Date('2026-10-31T02:00:00Z') }),
      // The newest trip left the estimate blank: the earlier estimate (5) still stands.
      row({ id: 't3', rescued_count: 3, pwd: 1, taken_to: 'HANDED_TO_AMBULANCE',
        reported_at: new Date('2026-10-31T03:00:00Z') }),
      row({ id: 't4', reported_at: new Date('2026-10-31T00:30:00Z') }),
    ] as any);
    expect(summary).toEqual({
      tripCount: 4,
      rescued: 12,
      families: 2,
      children: 3,
      elderly: 1,
      pwd: 1,
      pregnant: 1,
      stillWaiting: 5,
      stillWaitingAt: '2026-10-31T02:00:00.000Z',
      lastTripAt: '2026-10-31T03:00:00.000Z',
      byDestination: [
        { takenTo: 'EVACUATION_CENTER', facilityId: EVAC, facilityName: 'Lolomboy EC', trips: 2, rescued: 9 },
        { takenTo: 'HANDED_TO_AMBULANCE', facilityId: null, facilityName: null, trips: 1, rescued: 3 },
      ],
    });
  });

  it('no trips: zeros and no estimate', () => {
    expect(summarizeRescueTrips([])).toMatchObject({ tripCount: 0, rescued: 0, stillWaiting: null, lastTripAt: null, byDestination: [] });
  });

  it('a 0 estimate is an answer, and newer than an older one', () => {
    expect(summarizeRescueTrips([
      row({ still_waiting: 7, reported_at: new Date('2026-10-31T01:00:00Z') }),
      row({ still_waiting: 0, reported_at: new Date('2026-10-31T02:00:00Z') }),
    ] as any).stillWaiting).toBe(0);
  });
});

describe('notifyRescueStillWaiting (a rescue crew finishes)', () => {
  function deps(latest: number | null, recent = false) {
    const prisma: any = {
      rescue_trip_reports: {
        findMany: jest.fn().mockResolvedValue(latest == null ? [] : [{ still_waiting: latest, reported_at: new Date() }]),
      },
      incident: { findUnique: jest.fn().mockResolvedValue({ public_reference: 'INC-2026-000777' }) },
      notification: { findFirst: jest.fn().mockResolvedValue(recent ? { id: 'n-old' } : null) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'disp-user', full_name: 'D' }]) },
      dispatches: { create: jest.fn() },
    };
    const notifications: any = { create: jest.fn().mockResolvedValue({}) };
    const logger: any = { warn: jest.fn() };
    return { prisma, notifications, logger };
  }

  it('people still waiting → one IN_APP notice to Dispatchers, counts and call sign only', async () => {
    const d = deps(8);
    await notifyRescueStillWaiting(d, { incidentId: INCIDENT, dispatchId: 'disp-boat', callSign: 'BOAT-1' });
    expect(d.prisma.rescue_trip_reports.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { incident_id: INCIDENT, still_waiting: { not: null } },
      orderBy: { reported_at: 'desc' },
    }));
    expect(d.notifications.create).toHaveBeenCalledTimes(1);
    expect(d.notifications.create.mock.calls[0][0]).toMatchObject({
      eventType: NOTIFICATION_EVENT_TYPES.RESCUE_PEOPLE_WAITING,
      channel: 'IN_APP',
      incidentId: INCIDENT,
      body: 'INC-2026-000777: BOAT-1 finished with about 8 still waiting. Send another unit?',
      dataPayload: { incidentId: INCIDENT, dispatchId: 'disp-boat', stillWaiting: 8 },
    });
    expect(d.prisma.dispatches.create).not.toHaveBeenCalled();
  });

  it('nobody waiting (0) or no estimate → no notice; a recent one → deduplicated', async () => {
    for (const latest of [0, null]) {
      const d = deps(latest);
      await notifyRescueStillWaiting(d, { incidentId: INCIDENT, dispatchId: 'disp-boat', callSign: null });
      expect(d.notifications.create).not.toHaveBeenCalled();
    }
    const recent = deps(8, true);
    await notifyRescueStillWaiting(recent, { incidentId: INCIDENT, dispatchId: 'disp-boat', callSign: null });
    expect(recent.notifications.create).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    const d = deps(8);
    d.prisma.rescue_trip_reports.findMany.mockRejectedValue(new Error('db down'));
    await expect(notifyRescueStillWaiting(d, { incidentId: INCIDENT, dispatchId: 'disp-boat', callSign: null })).resolves.toBeUndefined();
    expect(d.logger.warn).toHaveBeenCalled();
  });
});

describe("RespondersService: a rescue crew's Finish", () => {
  function harness(resourceType: string, opts: { stillWaiting?: number; noticeFails?: boolean } = {}) {
    const dispatch = {
      id: 'disp-unit',
      incident_id: INCIDENT,
      resource_id: 'res-unit',
      status: 'ACCEPTED',
      dispatch_crew: [{ user_id: BOAT_CREW }],
      resources: { call_sign: 'BOAT-1', resource_type: resourceType },
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ status: IncidentStatus.ON_SCENE }]),
      dispatches: {
        // Another unit is still active, so the incident stays open.
        findMany: jest.fn().mockResolvedValue([{ id: 'disp-unit' }, { id: 'disp-other' }]),
        update: jest.fn().mockResolvedValue({}),
      },
      resources: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      incidentEvent: { create: jest.fn().mockResolvedValue({}) },
      incident: { update: jest.fn() },
      transportRecord: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma: any = {
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      incident: { findUnique: jest.fn().mockResolvedValue({ status: IncidentStatus.ON_SCENE, public_reference: 'INC-2026-000777' }) },
      dispatches: { findUnique: jest.fn().mockResolvedValue(dispatch), create: jest.fn() },
      rescue_trip_reports: {
        findMany: jest.fn().mockResolvedValue([{ still_waiting: opts.stillWaiting ?? 8, reported_at: new Date() }]),
      },
      notification: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'disp-user', full_name: 'D' }]) },
    };
    const realtime = { resourceStatusChanged: jest.fn(), dispatchUpdated: jest.fn(), responderStatus: jest.fn(), notifyIncidentStatusChanged: jest.fn() };
    const notifications = {
      create: opts.noticeFails ? jest.fn().mockRejectedValue(new Error('db busy')) : jest.fn().mockResolvedValue({}),
    };
    const responders = new RespondersService(
      prisma,
      realtime as any,
      { log: jest.fn().mockResolvedValue(undefined) } as any,
      new IncidentStatusService(),
      { once: jest.fn((_d: string, _i: string, _r: string | undefined, cb: () => unknown) => cb()) } as any,
      { roomsForDispatch: jest.fn() } as any,
      { notifyReporter: jest.fn(), notifyDispatcher: jest.fn() } as any,
      notifications as any,
    );
    return { responders, prisma, tx, notifications };
  }

  it('finishing with people still waiting tells the dispatchers; the Finish itself stands', async () => {
    const { responders, tx, notifications } = harness('RESCUE_BOAT');
    await expect(responders.updateStatus('disp-unit', BOAT_CREW, { status: 'RESOLVED' } as any))
      .resolves.toMatchObject({ dispatchId: 'disp-unit', status: 'RESOLVED' });
    expect(tx.dispatches.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'disp-unit' },
      data: expect.objectContaining({ status: 'COMPLETED' }),
    }));
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create.mock.calls[0][0]).toMatchObject({ eventType: 'RESCUE_PEOPLE_WAITING', incidentId: INCIDENT });
  });

  it('a failed notice never fails the Finish', async () => {
    const { responders } = harness('RESCUE_TRUCK', { noticeFails: true });
    await expect(responders.updateStatus('disp-unit', BOAT_CREW, { status: 'RESOLVED' } as any))
      .resolves.toMatchObject({ status: 'RESOLVED' });
  });

  it('other units finishing never look at rescue trips', async () => {
    const { responders, prisma, notifications } = harness('FIRE_TRUCK');
    await responders.updateStatus('disp-unit', BOAT_CREW, { status: 'RESOLVED' } as any);
    expect(prisma.rescue_trip_reports.findMany).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });
});

describe('Surge page totals per barangay (MOD-52)', () => {
  it('groups trips by the incident barangay; still waiting is each incident\'s newest estimate', () => {
    const t = (incident: string, barangay: string | null, rescued: number | null, waiting: number | null, hour: number) => ({
      incident_id: incident, barangay, rescued_count: rescued, still_waiting: waiting,
      reported_at: new Date(`2026-10-31T0${hour}:00:00Z`),
    });
    expect(rescueTotalsByBarangay([
      t('inc-a', 'Lolomboy', 5, 10, 1),
      t('inc-a', 'Lolomboy', 6, 4, 2),
      t('inc-b', 'Lolomboy', 2, 3, 1),
      t('inc-c', 'Bunlo', 7, null, 3),
      t('inc-d', null, 1, 0, 1),
    ])).toEqual([
      { barangay: 'Lolomboy', incidents: 2, trips: 3, rescued: 13, stillWaiting: 7 },
      { barangay: 'Bunlo', incidents: 1, trips: 1, rescued: 7, stillWaiting: 0 },
      { barangay: null, incidents: 1, trips: 1, rescued: 1, stillWaiting: 0 },
    ]);
  });

  it('only while a surge is active, from trips since it was declared', async () => {
    const activatedAt = new Date('2026-10-31T00:00:00Z');
    const prisma: any = {
      surge_incidents: { findFirst: jest.fn().mockResolvedValue(null) },
      rescue_trip_reports: {
        findMany: jest.fn().mockResolvedValue([
          { incident_id: 'inc-a', rescued_count: 4, still_waiting: 6, reported_at: new Date('2026-10-31T01:00:00Z'),
            incidents: { incident_locations: { barangay: 'Igulot' } } },
        ]),
      },
    };
    const service = new DisasterModeService(prisma);

    await expect(service.getStatus()).resolves.toEqual({ active: false, surge: null, rescueByBarangay: [] });
    expect(prisma.rescue_trip_reports.findMany).not.toHaveBeenCalled();

    prisma.surge_incidents.findFirst.mockResolvedValue({ id: 'surge-1', activated_at: activatedAt });
    const status = await service.getStatus();
    expect(prisma.rescue_trip_reports.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { reported_at: { gte: activatedAt } },
    }));
    expect(status.rescueByBarangay).toEqual([{ barangay: 'Igulot', incidents: 1, trips: 1, rescued: 4, stillWaiting: 6 }]);

    // The surge status still loads if the totals fail.
    prisma.rescue_trip_reports.findMany.mockRejectedValue(new Error('db busy'));
    await expect(service.getStatus()).resolves.toMatchObject({ active: true, rescueByBarangay: [] });
  });
});

describe('Evacuation centers for the crew picker', () => {
  it('only active EVACUATION_CENTER facilities, without contacts or capacity data', async () => {
    const prisma: any = { facility: { findMany: jest.fn().mockResolvedValue([]) } };
    await new FacilitiesService(prisma, { log: jest.fn() } as any).listEvacuationCenters();
    expect(prisma.facility.findMany).toHaveBeenCalledWith({
      where: { is_active: true, facility_type: 'EVACUATION_CENTER' },
      select: { id: true, name: true, barangay: true, latitude: true, longitude: true },
      orderBy: { name: 'asc' },
    });
  });
});
