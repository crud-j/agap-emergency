import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Prisma } from '@prisma/client';
import { isAlarmLevelAtLeast, NOTIFICATION_EVENT_TYPES, UserRole } from '@agap/shared';
import { FireReportService, fireReportAlerts } from '../../src/incidents/fire-report/fire-report.service';
import { SubmitFireReportDto } from '../../src/incidents/fire-report/dto/submit-fire-report.dto';

/**
 * Unit field flow plan, Phase 3 (MOD-32/36): a fire crew's size-up report.
 * Append-only, every field optional, idempotent by client request ID, no notes in any
 * payload or notice, and dangerous findings notify people but never act.
 */

const INCIDENT = 'inc-1';
const FIRE_CREW = 'resp-bfp';
const NOTE = 'Owner says two kids inside, back room';
const CLIENT_ID = '7b1f4c1e-8d43-4a8e-9a55-0c1d2e3f4a5b';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rep-1',
    incident_id: INCIDENT,
    dispatch_id: 'disp-fire',
    reported_by_id: FIRE_CREW,
    alarm_level: null,
    fire_status: null,
    structures_involved: null,
    occupancy_type: null,
    hazards: [],
    spreading: null,
    evacuation_needed: null,
    casualties_seen: null,
    trapped_persons: null,
    notes: null,
    client_request_id: null,
    reported_at: new Date('2026-10-31T02:00:00Z'),
    ...overrides,
  };
}

function build(opts: {
  crewed?: Array<{ id: string; resource_type: string }>;
  ambulances?: number;
  recentNotice?: boolean;
  repeat?: Record<string, unknown> | null;
  noticeFails?: boolean;
  emitFails?: boolean;
} = {}) {
  const crewed = opts.crewed ?? [{ id: 'disp-fire', resource_type: 'FIRE_TRUCK' }];
  const prisma: any = {
    incident: {
      findUnique: jest.fn().mockResolvedValue({ id: INCIDENT, public_reference: 'INC-2026-000123' }),
      update: jest.fn(),
    },
    dispatches: {
      findMany: jest.fn().mockResolvedValue(crewed.map((d) => ({ id: d.id, resources: { resource_type: d.resource_type } }))),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(opts.ambulances ?? 0),
      create: jest.fn(),
    },
    fire_field_reports: {
      findUnique: jest.fn().mockResolvedValue(opts.repeat ?? null),
      create: jest.fn(async ({ data }: any) => row({ ...data, id: `rep-${prisma.fire_field_reports.create.mock.calls.length}` })),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    notification: { findFirst: jest.fn().mockResolvedValue(opts.recentNotice ? { id: 'n-old' } : null) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'disp-user', full_name: 'D' }, { id: 'sup-user', full_name: 'S' }]) },
    surge_incidents: { create: jest.fn(), update: jest.fn() },
  };
  const realtime: any = {
    fieldReport: opts.emitFails ? jest.fn(() => { throw new Error('ws down'); }) : jest.fn(),
  };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications: any = {
    create: opts.noticeFails ? jest.fn().mockRejectedValue(new Error('db busy')) : jest.fn().mockResolvedValue({}),
  };
  const service = new FireReportService(prisma, realtime, audit, notifications);
  const crew = { id: FIRE_CREW, role: UserRole.RESPONDER };
  return { service, prisma, realtime, audit, notifications, crew };
}

async function errorsFor(body: Record<string, unknown>) {
  return validate(plainToInstance(SubmitFireReportDto, body));
}

describe('SubmitFireReportDto', () => {
  it('accepts an empty report: every field is optional', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('accepts a full report with codes from @agap/shared', async () => {
    expect(await errorsFor({
      alarmLevel: 'THIRD_ALARM', fireStatus: 'UNDER_CONTROL', structuresInvolved: 4, occupancyType: 'INDUSTRIAL',
      hazards: ['FIREWORKS_EXPLOSIVES', 'LPG'], spreading: true, evacuationNeeded: false,
      casualtiesSeen: 2, trappedPersons: 0, notes: 'ok', clientRequestId: CLIENT_ID,
    })).toHaveLength(0);
  });

  it.each([
    ['an unknown alarm level', { alarmLevel: 'SIXTH_ALARM' }],
    ['an unknown fire status', { fireStatus: 'SMOULDERING' }],
    ['an unknown occupancy', { occupancyType: 'FARM' }],
    ['an unknown hazard', { hazards: ['ASBESTOS'] }],
    ['a repeated hazard', { hazards: ['LPG', 'LPG'] }],
    ['a negative count', { trappedPersons: -1 }],
    ['a fractional count', { casualtiesSeen: 1.5 }],
    ['a yes/no as text', { spreading: 'yes' }],
    ['notes over 1000 characters', { notes: 'x'.repeat(1001) }],
    ['a client request ID that is not a UUID', { clientRequestId: 'abc' }],
  ])('refuses %s', async (_label, body) => {
    expect((await errorsFor(body)).length).toBeGreaterThan(0);
  });
});

describe('isAlarmLevelAtLeast (D1 threshold THIRD_ALARM)', () => {
  it('compares in BFP order and never treats an unknown level as high', () => {
    expect(isAlarmLevelAtLeast('SECOND_ALARM')).toBe(false);
    expect(isAlarmLevelAtLeast('THIRD_ALARM')).toBe(true);
    expect(isAlarmLevelAtLeast('TASK_FORCE_ALPHA')).toBe(true);
    expect(isAlarmLevelAtLeast('GENERAL_ALARM')).toBe(true);
    expect(isAlarmLevelAtLeast(null)).toBe(false);
    expect(isAlarmLevelAtLeast('SIXTH_ALARM')).toBe(false);
  });
});

describe('FireReportService.submit — who may file', () => {
  it('refuses a responder who is not on an active crew of this incident (403), and saves nothing', async () => {
    const { service, prisma, crew } = build({ crewed: [] });
    await expect(service.submit(INCIDENT, {}, crew)).rejects.toMatchObject({ status: 403 });
    expect(prisma.fire_field_reports.create).not.toHaveBeenCalled();
    // The crew lookup is scoped to this incident, this user and active dispatches.
    expect(prisma.dispatches.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        incident_id: INCIDENT,
        dispatch_crew: { some: { user_id: FIRE_CREW } },
        status: { in: ['PENDING', 'SENT', 'ACCEPTED'] },
      },
    }));
  });

  it('refuses the crew of a non-fire unit with 409 FIRE_REPORT_NOT_FOR_UNIT, and saves nothing', async () => {
    const { service, prisma, crew } = build({ crewed: [{ id: 'disp-amb', resource_type: 'AMBULANCE' }] });
    await expect(service.submit(INCIDENT, { fireStatus: 'ACTIVE' }, crew))
      .rejects.toMatchObject({ response: { code: 'FIRE_REPORT_NOT_FOR_UNIT' } });
    expect(prisma.fire_field_reports.create).not.toHaveBeenCalled();
  });

  it("files it on the crew's fire unit dispatch, whatever dispatchId the phone sends", async () => {
    const { service, prisma, crew } = build({
      crewed: [{ id: 'disp-amb', resource_type: 'AMBULANCE' }, { id: 'disp-fire', resource_type: 'FIRE_TRUCK' }],
    });
    await service.submit(INCIDENT, { dispatchId: '00000000-0000-0000-0000-000000000000' }, crew);
    expect(prisma.fire_field_reports.create.mock.calls[0][0].data.dispatch_id).toBe('disp-fire');
  });

  it('lets a dispatcher relay a radio report without a crew check; a dispatch of another incident is refused', async () => {
    const { service, prisma } = build({ crewed: [] });
    const dispatcher = { id: 'disp-user', role: UserRole.DISPATCHER };

    await service.submit(INCIDENT, { fireStatus: 'ACTIVE' }, dispatcher);
    expect(prisma.dispatches.findMany).not.toHaveBeenCalled();
    expect(prisma.fire_field_reports.create.mock.calls[0][0].data).toMatchObject({ dispatch_id: null, reported_by_id: 'disp-user' });

    prisma.dispatches.findFirst.mockResolvedValue(null);
    await expect(service.submit(INCIDENT, { dispatchId: '11111111-1111-1111-1111-111111111111' }, dispatcher))
      .rejects.toMatchObject({ status: 400 });
  });

  it('404s an unknown incident', async () => {
    const { service, prisma, crew } = build();
    prisma.incident.findUnique.mockResolvedValue(null);
    await expect(service.submit(INCIDENT, {}, crew)).rejects.toMatchObject({ status: 404 });
  });
});

describe('FireReportService.submit — the record', () => {
  it('stores an empty report as a row of nulls (hazards []), and never sets the incident status', async () => {
    const { service, prisma, crew } = build();
    await service.submit(INCIDENT, {}, crew);
    expect(prisma.fire_field_reports.create).toHaveBeenCalledWith({
      data: {
        incident_id: INCIDENT,
        dispatch_id: 'disp-fire',
        reported_by_id: FIRE_CREW,
        alarm_level: null,
        fire_status: null,
        structures_involved: null,
        occupancy_type: null,
        hazards: [],
        spreading: null,
        evacuation_needed: null,
        casualties_seen: null,
        trapped_persons: null,
        notes: null,
        client_request_id: null,
      },
    });
    expect(prisma.incident.update).not.toHaveBeenCalled();
  });

  it('is append-only: every report is a new row and none is ever updated', async () => {
    const { service, prisma, crew } = build();
    const first = await service.submit(INCIDENT, { fireStatus: 'ACTIVE' }, crew);
    const second = await service.submit(INCIDENT, { fireStatus: 'FIRE_OUT' }, crew);
    expect(prisma.fire_field_reports.create).toHaveBeenCalledTimes(2);
    expect(first.id).not.toBe(second.id);
    expect(prisma.fire_field_reports.update).not.toHaveBeenCalled();
    expect(prisma.fire_field_reports.updateMany).not.toHaveBeenCalled();
  });

  it('a resend with the same clientRequestId returns the first report: no second row, audit, event or notice', async () => {
    const first = row({ id: 'rep-first', client_request_id: CLIENT_ID, hazards: ['FIREWORKS_EXPLOSIVES'] });
    const { service, prisma, realtime, audit, notifications, crew } = build({ repeat: first });
    const result = await service.submit(INCIDENT, { clientRequestId: CLIENT_ID, hazards: ['FIREWORKS_EXPLOSIVES'] }, crew);
    expect(result).toBe(first);
    expect(prisma.fire_field_reports.findUnique).toHaveBeenCalledWith({ where: { client_request_id: CLIENT_ID } });
    expect(prisma.fire_field_reports.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(realtime.fieldReport).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('two copies of one resend arriving at once: the unique index stops the second, which returns the first', async () => {
    const first = row({ id: 'rep-first', client_request_id: CLIENT_ID });
    const { service, prisma, crew } = build();
    prisma.fire_field_reports.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(first);
    prisma.fire_field_reports.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    await expect(service.submit(INCIDENT, { clientRequestId: CLIENT_ID }, crew)).resolves.toBe(first);
  });

  it("refuses a clientRequestId already used for another incident's report", async () => {
    const { service, crew } = build({ repeat: row({ incident_id: 'inc-other', client_request_id: CLIENT_ID }) });
    await expect(service.submit(INCIDENT, { clientRequestId: CLIENT_ID }, crew))
      .rejects.toMatchObject({ response: { code: 'CLIENT_REQUEST_ID_REUSED' } });
  });
});

describe('FireReportService.submit — output carries no notes', () => {
  it('the ops event, the audit row and every notice hold statuses, codes and counts only', async () => {
    const { service, realtime, audit, notifications, crew } = build();
    await service.submit(INCIDENT, {
      fireStatus: 'ACTIVE', alarmLevel: 'THIRD_ALARM', hazards: ['FIREWORKS_EXPLOSIVES'],
      casualtiesSeen: 2, trappedPersons: 2, notes: NOTE,
    }, crew);

    expect(realtime.fieldReport).toHaveBeenCalledWith({
      incidentId: INCIDENT,
      kind: 'FIRE',
      reportId: 'rep-1',
      dispatchId: 'disp-fire',
      reportedAt: '2026-10-31T02:00:00.000Z',
      fireStatus: 'ACTIVE',
      alarmLevel: 'THIRD_ALARM',
      hazards: ['FIREWORKS_EXPLOSIVES'],
      casualtiesSeen: 2,
      trappedPersons: 2,
    });
    expect(audit.log.mock.calls[0][0]).toMatchObject({ entityType: 'fire_field_report', moduleId: 'MOD-36', newValues: { hasNote: true } });
    expect(notifications.create).toHaveBeenCalled();
    const everything = JSON.stringify([realtime.fieldReport.mock.calls, audit.log.mock.calls, notifications.create.mock.calls]);
    expect(everything).not.toContain('kids');
    expect(everything).not.toContain('back room');
  });

  it('a failed emit, audit or notice never undoes the report', async () => {
    const { service, audit, crew } = build({ emitFails: true, noticeFails: true });
    audit.log.mockRejectedValue(new Error('audit down'));
    await expect(service.submit(INCIDENT, { trappedPersons: 1 }, crew)).resolves.toMatchObject({ id: 'rep-1' });
  });
});

describe('FireReportService.submit — dangerous findings notify people, never act', () => {
  it.each([
    ['FIREWORKS_EXPLOSIVES', { hazards: ['FIREWORKS_EXPLOSIVES'] }, 0],
    ['TRAPPED_PERSONS', { trappedPersons: 3 }, 1],
    ['HIGH_ALARM', { alarmLevel: 'THIRD_ALARM' }, 1],
    ['CASUALTIES_NO_AMBULANCE', { casualtiesSeen: 2 }, 0],
  ])('%s → one IN_APP notice per Dispatcher and Supervisor, linked to the incident', async (reason, body, ambulances) => {
    const { service, prisma, notifications, crew } = build({ ambulances });
    await service.submit(INCIDENT, body as any, crew);

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ role: { in: ['DISPATCHER', 'SUPERVISOR'] } }),
    }));
    expect(notifications.create).toHaveBeenCalledTimes(2);
    for (const [notice] of notifications.create.mock.calls) {
      expect(notice).toMatchObject({
        eventType: NOTIFICATION_EVENT_TYPES.FIRE_REPORT_ALERT,
        channel: 'IN_APP',
        incidentId: INCIDENT,
        dataPayload: expect.objectContaining({ incidentId: INCIDENT, reason }),
      });
      expect(notice.body).toContain('INC-2026-000123');
    }
    // A notice, never an action: no dispatch, no surge, no status change.
    expect(prisma.dispatches.create).not.toHaveBeenCalled();
    expect(prisma.surge_incidents.create).not.toHaveBeenCalled();
    expect(prisma.surge_incidents.update).not.toHaveBeenCalled();
    expect(prisma.incident.update).not.toHaveBeenCalled();
  });

  it('dedups per incident + reason for 10 minutes', async () => {
    const { service, prisma, notifications, crew } = build({ recentNotice: true });
    await service.submit(INCIDENT, { hazards: ['FIREWORKS_EXPLOSIVES'] }, crew);
    expect(notifications.create).not.toHaveBeenCalled();
    const where = prisma.notification.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      event_type: 'FIRE_REPORT_ALERT',
      incident_id: INCIDENT,
      data_payload: { path: ['reason'], equals: 'FIREWORKS_EXPLOSIVES' },
    });
    const windowMs = Date.now() - where.created_at.gte.getTime();
    expect(windowMs).toBeGreaterThanOrEqual(10 * 60 * 1000 - 1000);
    expect(windowMs).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
  });

  it('checks each reason on its own: a recent fireworks notice does not hold back a new trapped notice', async () => {
    const { service, prisma, notifications, crew } = build();
    prisma.notification.findFirst.mockImplementation(async ({ where }: any) =>
      where.data_payload.equals === 'FIREWORKS_EXPLOSIVES' ? { id: 'n-old' } : null);
    await service.submit(INCIDENT, { hazards: ['FIREWORKS_EXPLOSIVES'], trappedPersons: 1 }, crew);
    const reasons = notifications.create.mock.calls.map(([n]: any[]) => n.dataPayload.reason);
    expect(reasons).toEqual(['TRAPPED_PERSONS', 'TRAPPED_PERSONS']);
  });

  it('no notice for a quiet report, an alarm below the threshold, or casualties with an ambulance on the incident', async () => {
    const quiet = build({ ambulances: 1 });
    await quiet.service.submit(INCIDENT, { fireStatus: 'UNDER_CONTROL', alarmLevel: 'SECOND_ALARM', casualtiesSeen: 2 }, quiet.crew);
    expect(quiet.notifications.create).not.toHaveBeenCalled();
    expect(quiet.prisma.dispatches.count).toHaveBeenCalledWith({
      where: { incident_id: INCIDENT, status: { in: ['PENDING', 'SENT', 'ACCEPTED'] }, resources: { resource_type: 'AMBULANCE' } },
    });
  });

  it('fireReportAlerts builds the bodies from counts and codes only', () => {
    const alerts = fireReportAlerts(
      { hazards: ['FIREWORKS_EXPLOSIVES'], trapped_persons: 2, alarm_level: 'TASK_FORCE_ALPHA', casualties_seen: 3 },
      'INC-2026-000123',
      false,
    );
    expect(alerts.map((a) => a.reason)).toEqual(['FIREWORKS_EXPLOSIVES', 'TRAPPED_PERSONS', 'HIGH_ALARM', 'CASUALTIES_NO_AMBULANCE']);
    expect(alerts[1].body).toBe('INC-2026-000123: 2 trapped. Consider an ambulance and a rescue unit.');
    expect(alerts[2].title).toBe('Fire report: Task Force Alpha');
  });
});
