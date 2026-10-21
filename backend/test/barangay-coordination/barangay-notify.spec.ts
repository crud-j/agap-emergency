import { BarangayNotifyService, BarangayNotFoundError } from '../../src/barangay-coordination/barangay-notify.service';
import { IncidentsService } from '../../src/incidents/incidents.service';

/** Phase 2: tagging an incident with its barangay never blocks, and never throws. */

const INCIDENT = 'inc-1';
const BATIA = { barangayId: 'BATIA', name: 'Batia', matchMethod: 'POLYGON' as const, isApproximate: false };

function notice(over: Record<string, unknown> = {}) {
  return {
    id: 'n-1',
    incident_id: INCIDENT,
    barangay_id: 'BATIA',
    match_method: 'POLYGON',
    is_approximate: false,
    short_code: '0420',
    sms_status: 'DISABLED',
    last_report: null,
    last_report_at: null,
    followup_due_at: null,
    followup_sent_at: null,
    barangay: { id: 'BATIA', name: 'Batia' },
    ...over,
  };
}

function build(opts: { existing?: unknown; location?: unknown; match?: unknown } = {}) {
  const prisma: any = {
    incident_barangay_notices: {
      findFirst: jest.fn().mockResolvedValue(opts.existing ?? null),
      create: jest.fn().mockImplementation(async ({ data }: any) => notice(data)),
      update: jest.fn().mockImplementation(async ({ data }: any) => notice(data)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    incident_locations: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          opts.location === undefined ? { latitude: 14.79, longitude: 120.97, source: 'GPS' } : opts.location,
        ),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const directory: any = {
    resolve: jest.fn().mockResolvedValue(opts.match === undefined ? BATIA : opts.match),
    barangayExists: jest.fn().mockResolvedValue({ id: 'BATIA', name: 'Batia' }),
    listContacts: jest.fn().mockResolvedValue([]),
  };
  const realtime: any = { barangayNoticeUpdated: jest.fn() };
  const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
  // Alerts off (the default): Phase 2 behaviour, no SMS is queued.
  const config: any = { get: jest.fn().mockReturnValue(undefined) };
  const smsQueue: any = { addBulk: jest.fn() };
  return {
    service: new BarangayNotifyService(prisma, directory, realtime, audit, config, smsQueue),
    prisma,
    directory,
    realtime,
    audit,
    smsQueue,
  };
}

describe('BarangayNotifyService.notifyForIncident', () => {
  it('tags the incident, stores the name, creates a DISABLED notice and emits ops-only', async () => {
    const { service, prisma, realtime } = build();
    await service.notifyForIncident(INCIDENT);

    expect(prisma.incident_locations.update).toHaveBeenCalledWith({
      where: { incident_id: INCIDENT },
      data: { barangay: 'Batia' },
    });
    const data = prisma.incident_barangay_notices.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ barangay_id: 'BATIA', match_method: 'POLYGON', sms_status: 'DISABLED' });
    expect(data.short_code).toMatch(/^\d{4}$/);
    expect(realtime.barangayNoticeUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ incidentId: INCIDENT, barangayName: 'Batia', isApproximate: false, followupDue: false }),
    );
  });

  it('carries the approximate flag for a border point', async () => {
    const { service, realtime } = build({ match: { ...BATIA, isApproximate: true } });
    await service.notifyForIncident(INCIDENT);
    expect(realtime.barangayNoticeUpdated).toHaveBeenCalledWith(expect.objectContaining({ isApproximate: true }));
  });

  it('does nothing for a manual-address incident (no usable coordinates)', async () => {
    const { service, prisma, directory } = build({ location: { latitude: 0, longitude: 0, source: 'MANUAL' } });
    await service.notifyForIncident(INCIDENT);
    expect(directory.resolve).not.toHaveBeenCalled();
    expect(prisma.incident_barangay_notices.create).not.toHaveBeenCalled();
  });

  it('does nothing when the point is outside every barangay', async () => {
    const { service, prisma } = build({ match: null });
    await service.notifyForIncident(INCIDENT);
    expect(prisma.incident_barangay_notices.create).not.toHaveBeenCalled();
  });

  it('is idempotent and never overrides an existing (manual) notice', async () => {
    const { service, prisma, directory } = build({ existing: { id: 'n-1' } });
    await service.notifyForIncident(INCIDENT);
    expect(directory.resolve).not.toHaveBeenCalled();
    expect(prisma.incident_barangay_notices.create).not.toHaveBeenCalled();
  });

  it('never throws when the database or directory fails', async () => {
    const { service, directory } = build();
    directory.resolve.mockRejectedValue(new Error('postgis down'));
    await expect(service.notifyForIncident(INCIDENT)).resolves.toBeUndefined();
  });
});

describe('BarangayNotifyService.setManual / closeNoticesForIncident', () => {
  it('rejects an unknown barangay', async () => {
    const { service, directory } = build();
    directory.barangayExists.mockResolvedValue(null);
    await expect(service.setManual(INCIDENT, 'NOPE', 'u-1')).rejects.toBeInstanceOf(BarangayNotFoundError);
  });

  it('re-points an existing notice as MANUAL, audits it and emits', async () => {
    const { service, prisma, audit, realtime } = build({
      existing: notice({ barangay_id: 'BUNLO', is_approximate: true }),
    });
    await service.setManual(INCIDENT, 'BATIA', 'u-1');

    expect(prisma.incident_barangay_notices.update.mock.calls[0][0].data).toMatchObject({
      barangay_id: 'BATIA',
      match_method: 'MANUAL',
      is_approximate: false,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'u-1',
        incidentId: INCIDENT,
        oldValues: { barangay_id: 'BUNLO' },
        newValues: { barangay_id: 'BATIA', match_method: 'MANUAL' },
      }),
    );
    expect(realtime.barangayNoticeUpdated).toHaveBeenCalled();
  });

  it('creates a MANUAL notice when the incident had none', async () => {
    const { service, prisma } = build();
    await service.setManual(INCIDENT, 'BATIA', 'u-1');
    expect(prisma.incident_barangay_notices.create.mock.calls[0][0].data).toMatchObject({ match_method: 'MANUAL' });
  });

  it('closes only open notices and swallows errors', async () => {
    const { service, prisma } = build();
    await service.closeNoticesForIncident(INCIDENT);
    expect(prisma.incident_barangay_notices.updateMany.mock.calls[0][0].where).toEqual({
      incident_id: INCIDENT,
      closed_at: null,
    });
    prisma.incident_barangay_notices.updateMany.mockRejectedValue(new Error('x'));
    await expect(service.closeNoticesForIncident(INCIDENT)).resolves.toBeUndefined();
  });
});

describe('incident status closes the barangay notice', () => {
  function svc(newStatusRow: string) {
    const closeNotices = jest.fn().mockResolvedValue(undefined);
    const prisma: any = {
      incident: { findUnique: jest.fn().mockResolvedValue({ id: INCIDENT, status: 'ON_SCENE' }) },
      $transaction: jest.fn(async (fn: any) =>
        fn({
          incident: { update: jest.fn().mockResolvedValue({ id: INCIDENT, status: newStatusRow }) },
          incidentEvent: { create: jest.fn() },
        }),
      ),
    };
    const service = new IncidentsService(
      prisma,
      { validateTransition: jest.fn() } as any,
      {} as any,
      {} as any,
      { notifyIncidentStatusChanged: jest.fn() } as any,
      { log: jest.fn() } as any,
      {} as any,
      { closeNoticesForIncident: closeNotices } as any,
    );
    return { service, closeNotices };
  }

  it.each(['RESOLVED', 'CLOSED', 'FALSE_ALERT'])('closes notices on %s', async (status) => {
    const { service, closeNotices } = svc(status);
    await service.updateStatus(INCIDENT, status as any, 'u-1');
    expect(closeNotices).toHaveBeenCalledWith(INCIDENT);
  });

  it('keeps notices open while the incident is still active', async () => {
    const { service, closeNotices } = svc('TRANSPORTING');
    await service.updateStatus(INCIDENT, 'TRANSPORTING' as any, 'u-1');
    expect(closeNotices).not.toHaveBeenCalled();
  });
});
