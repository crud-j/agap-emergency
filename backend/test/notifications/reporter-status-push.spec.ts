const mockSend = jest.fn();
const mockGetApps = jest.fn(() => [{}]);
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: () => mockGetApps(),
  cert: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ send: mockSend }) }));

import { IncidentStatus } from '@agap/shared';
import { tokenFromConfig } from '../../src/notifications/push-token';
import { IncidentStatusNotifier } from '../../src/notifications/incident-status-notifier';
import { NotificationProcessor } from '../../src/jobs/processors/notification.processor';
import { IncidentsService } from '../../src/incidents/incidents.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';
import { RespondersService } from '../../src/responders/responders.service';

/**
 * Reporter push on RESOLVED / CLOSED (MOD-16/MOD-42/MOD-45), plus the token-shape
 * fix that every NOTIFICATIONS-queue push depends on.
 */
describe('tokenFromConfig', () => {
  it('accepts a raw string token', () => {
    expect(tokenFromConfig('abc')).toBe('abc');
  });

  it('accepts the { fcmToken } shape registerToken() stores', () => {
    expect(tokenFromConfig({ fcmToken: 'abc' })).toBe('abc');
  });

  it.each([undefined, null, '', 42, [], {}, { fcmToken: 7 }, { fcmToken: '' }])(
    'returns null for %p',
    (value) => {
      expect(tokenFromConfig(value)).toBeNull();
    },
  );
});

describe('NotificationProcessor PUSH', () => {
  function build(configValue: unknown) {
    const prisma = {
      system_configurations: { findFirst: jest.fn().mockResolvedValue({ config_value: configValue }) },
    };
    const config = { get: jest.fn() };
    return new NotificationProcessor(config as any, prisma as any, { add: jest.fn() } as any);
  }

  beforeEach(() => {
    mockSend.mockReset().mockResolvedValue('msg-id');
    mockGetApps.mockReturnValue([{}]);
  });

  it('sends with the string token when the stored value is { fcmToken }', async () => {
    const processor = build({ fcmToken: 'device-token' });

    await processor.process({
      id: 'j1',
      data: { userId: 'u1', channel: 'PUSH', title: 'T', body: 'B', data: { incidentId: 'i1' } },
    } as any);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'device-token', data: { incidentId: 'i1' } }),
    );
  });

  it('sets the Android channel when the job names one', async () => {
    const processor = build({ fcmToken: 'device-token' });

    await processor.process({
      id: 'j2',
      data: { userId: 'u1', channel: 'PUSH', body: 'B', androidChannelId: 'incident-updates' },
    } as any);

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        android: { priority: 'high', notification: { channelId: 'incident-updates' } },
      }),
    );
  });

  it('skips without throwing when Firebase is not configured', async () => {
    mockGetApps.mockReturnValue([]);
    const processor = build({ fcmToken: 'device-token' });

    await expect(
      processor.process({ id: 'j3', data: { userId: 'u1', channel: 'PUSH', body: 'B' } } as any),
    ).resolves.toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('IncidentStatusNotifier.notifyReporter', () => {
  function build(reporterUserId: string | null = 'reporter-1') {
    const prisma = {
      incident: {
        findUnique: jest.fn().mockResolvedValue({
          public_reference: 'INC-2026-000123',
          incident_reporters: reporterUserId === null ? null : { user_id: reporterUserId },
        }),
      },
    };
    const notifications = { create: jest.fn().mockResolvedValue({ id: 'n1' }) };
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const notifier = new IncidentStatusNotifier(prisma as any, notifications as any, queue as any);
    return { notifier, prisma, notifications, queue };
  }

  it('creates one feed row and queues one push with a stable jobId', async () => {
    const { notifier, notifications, queue } = build();

    await notifier.notifyReporter('inc-1', IncidentStatus.RESOLVED);

    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'reporter-1',
        eventType: 'INCIDENT_RESOLVED',
        channel: 'PUSH',
        incidentId: 'inc-1',
        title: 'Incident resolved',
        body: 'Responders have finished at the scene for INC-2026-000123.',
      }),
    );
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'incident-status-push',
      expect.objectContaining({
        userId: 'reporter-1',
        channel: 'PUSH',
        androidChannelId: 'incident-updates',
        data: {
          incidentId: 'inc-1',
          publicReference: 'INC-2026-000123',
          status: 'RESOLVED',
          type: 'INCIDENT_RESOLVED',
        },
      }),
      { jobId: 'reporter-status:inc-1:RESOLVED' },
    );
  });

  it('TRANSPORTING is status only: no hospital name or id in the feed row or the push, and no transport is read (C17)', async () => {
    const { notifier, prisma, notifications, queue } = build();

    await notifier.notifyReporter('inc-1', IncidentStatus.TRANSPORTING);

    expect(prisma.incident.findUnique).toHaveBeenCalledWith({
      where: { id: 'inc-1' },
      select: { public_reference: true, incident_reporters: { select: { user_id: true } } },
    });
    const row = notifications.create.mock.calls[0][0];
    expect(row.body).toBe('Responders are taking the patient to a receiving facility for INC-2026-000123.');
    const sent = JSON.stringify([row, queue.add.mock.calls[0]]);
    expect(sent).not.toMatch(/hospital|Joni|Villanueva|destination|facilityId|patientId/i);
  });

  it('uses the closed message and jobId for CLOSED', async () => {
    const { notifier, notifications, queue } = build();

    await notifier.notifyReporter('inc-1', IncidentStatus.CLOSED);

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'INCIDENT_CLOSED',
        body: 'INC-2026-000123 is now closed. Thank you for reporting through AGAP. You are a Verified Reporter.',
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(expect.any(String), expect.anything(), {
      jobId: 'reporter-status:inc-1:CLOSED',
    });
  });

  it('saves the feed row before queueing the push', async () => {
    const order: string[] = [];
    const { notifier, notifications, queue } = build();
    notifications.create.mockImplementation(async () => order.push('row'));
    queue.add.mockImplementation(async () => order.push('push'));

    await notifier.notifyReporter('inc-1', IncidentStatus.RESOLVED);

    expect(order).toEqual(['row', 'push']);
  });

  it.each([
    ['no reporter row', () => build(null)],
    ['a reporter with no user account', () => {
      const built = build();
      built.prisma.incident.findUnique.mockResolvedValue({
        public_reference: 'INC-2026-000123',
        incident_reporters: { user_id: null },
      });
      return built;
    }],
  ])('does nothing for %s', async (_label, setup) => {
    const { notifier, notifications, queue } = setup();

    await notifier.notifyReporter('inc-1', IncidentStatus.RESOLVED);

    expect(notifications.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it.each([
    [IncidentStatus.ACKNOWLEDGED, 'INCIDENT_ACKNOWLEDGED'],
    [IncidentStatus.DISPATCHED, 'INCIDENT_DISPATCHED'],
    [IncidentStatus.EN_ROUTE, 'INCIDENT_EN_ROUTE'],
    [IncidentStatus.ON_SCENE, 'INCIDENT_ON_SCENE'],
    [IncidentStatus.TRANSPORTING, 'INCIDENT_TRANSPORTING'],
    [IncidentStatus.ASSISTING, 'INCIDENT_ASSISTING'],
    [IncidentStatus.REFERRED, 'INCIDENT_REFERRED'],
    [IncidentStatus.UNABLE_TO_RESPOND, 'INCIDENT_UNABLE_TO_RESPOND'],
    [IncidentStatus.FALSE_ALERT, 'INCIDENT_FALSE_ALERT'],
    [IncidentStatus.DUPLICATE, 'INCIDENT_DUPLICATE'],
  ])('covers the %s timeline step', async (status, type) => {
    const { notifier, notifications, queue } = build();

    await notifier.notifyReporter('inc-1', status);

    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ eventType: type }));
    const [, job] = queue.add.mock.calls[0];
    expect(job.body).toContain('INC-2026-000123');
    expect(queue.add.mock.calls[0][2]).toEqual({ jobId: `reporter-status:inc-1:${status}` });
  });

  it.each([IncidentStatus.CANCELLED, IncidentStatus.ASSESSED, IncidentStatus.SUBMITTED])(
    'skips %s (no reporter message)',
    async (status) => {
      const { notifier, prisma, queue } = build();

      await notifier.notifyReporter('inc-1', status);

      expect(prisma.incident.findUnique).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it('does not throw when the queue fails', async () => {
    const { notifier, queue } = build();
    queue.add.mockRejectedValue(new Error('redis down'));

    await expect(notifier.notifyReporter('inc-1', IncidentStatus.RESOLVED)).resolves.toBeUndefined();
  });
});

describe('IncidentStatusNotifier.notifyDispatcher', () => {
  function build() {
    const prisma = {
      dispatches: {
        findUnique: jest.fn().mockResolvedValue({
          dispatcher_id: 'dispatcher-1',
          resources: { call_sign: 'AMB-01' },
          incidents: { public_reference: 'INC-2026-000123' },
        }),
      },
    };
    const notifications = { create: jest.fn().mockResolvedValue({ id: 'n1' }) };
    const queue = { add: jest.fn() };
    const notifier = new IncidentStatusNotifier(prisma as any, notifications as any, queue as any);
    return { notifier, prisma, notifications, queue };
  }

  it('tells the assigning dispatcher the incident awaits closure on RESOLVED', async () => {
    const { notifier, notifications, queue } = build();

    await notifier.notifyDispatcher('inc-1', IncidentStatus.RESOLVED, 'dispatch-1');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'dispatcher-1',
        eventType: 'INCIDENT_AWAITING_CLOSURE',
        channel: 'IN_APP',
        incidentId: 'inc-1',
        body: 'AMB-01 marked INC-2026-000123 resolved. Record the outcome and close it.',
      }),
    );
    expect(queue.add).not.toHaveBeenCalled(); // the web console has no device push
  });

  it.each([
    [IncidentStatus.EN_ROUTE, 'RESPONDER_EN_ROUTE'],
    [IncidentStatus.ON_SCENE, 'RESPONDER_ON_SCENE'],
    [IncidentStatus.TRANSPORTING, 'RESPONDER_TRANSPORTING'],
    [IncidentStatus.ASSISTING, 'RESPONDER_ASSISTING'],
  ])('reports %s', async (status, type) => {
    const { notifier, notifications } = build();

    await notifier.notifyDispatcher('inc-1', status, 'dispatch-1');

    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ eventType: type }));
  });

  it('skips statuses responders do not set', async () => {
    const { notifier, prisma } = build();

    await notifier.notifyDispatcher('inc-1', IncidentStatus.CLOSED, 'dispatch-1');

    expect(prisma.dispatches.findUnique).not.toHaveBeenCalled();
  });

  it('does not throw when the feed write fails', async () => {
    const { notifier, notifications } = build();
    notifications.create.mockRejectedValue(new Error('db down'));

    await expect(
      notifier.notifyDispatcher('inc-1', IncidentStatus.ON_SCENE, 'dispatch-1'),
    ).resolves.toBeUndefined();
  });
});

describe('IncidentsService.updateStatus → reporter notifier', () => {
  function build(from: IncidentStatus, to: IncidentStatus) {
    const prisma = {
      incident: { findUnique: jest.fn().mockResolvedValue({ id: 'inc-1', status: from }) },
      $transaction: jest.fn(async (fn: (tx: any) => unknown) =>
        fn({
          incident: { update: jest.fn().mockResolvedValue({ id: 'inc-1', status: to }) },
          incidentEvent: { create: jest.fn().mockResolvedValue({}) },
        }),
      ),
    };
    const notifier = { notifyReporter: jest.fn().mockResolvedValue(undefined) };
    const service = new IncidentsService(
      prisma as any,
      new IncidentStatusService(),
      {} as any,
      {} as any,
      { notifyIncidentStatusChanged: jest.fn() } as any,
      { log: jest.fn() } as any,
      {} as any,
      undefined,
      notifier as any,
    );
    return { service, notifier };
  }

  it.each([
    [IncidentStatus.ON_SCENE, IncidentStatus.RESOLVED],
    [IncidentStatus.RESOLVED, IncidentStatus.CLOSED],
  ])('%s → %s notifies the reporter', async (from, to) => {
    const { service, notifier } = build(from, to);

    await service.updateStatus('inc-1', to, 'dispatcher-1');

    expect(notifier.notifyReporter).toHaveBeenCalledWith('inc-1', to);
  });

  it('hands every committed status to the notifier, which decides what to send', async () => {
    const { service, notifier } = build(IncidentStatus.RECEIVED, IncidentStatus.ACKNOWLEDGED);

    await service.updateStatus('inc-1', IncidentStatus.ACKNOWLEDGED, 'dispatcher-1');

    expect(notifier.notifyReporter).toHaveBeenCalledWith('inc-1', IncidentStatus.ACKNOWLEDGED);
  });

  it('still returns the updated incident when the notifier fails', async () => {
    const { service, notifier } = build(IncidentStatus.RESOLVED, IncidentStatus.CLOSED);
    notifier.notifyReporter.mockImplementation(() => {
      throw new Error('boom');
    });

    await expect(service.updateStatus('inc-1', IncidentStatus.CLOSED, 'dispatcher-1')).resolves.toEqual(
      expect.objectContaining({ status: IncidentStatus.CLOSED }),
    );
  });
});

describe('RespondersService.updateStatus → reporter notifier', () => {
  function build() {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ status: IncidentStatus.ON_SCENE }]),
      incident: { update: jest.fn().mockResolvedValue({}) },
      incidentEvent: { create: jest.fn().mockResolvedValue({}) },
      dispatches: {
        findMany: jest.fn().mockResolvedValue([{ id: 'dispatch-1', resource_id: 'res-1', status: 'ACCEPTED' }]),
        update: jest.fn(),
      },
      resources: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      transportRecord: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      dispatches: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'dispatch-1',
          incident_id: 'inc-1',
          resource_id: 'res-1',
          status: 'ACCEPTED',
          dispatch_crew: [{ user_id: 'resp-1' }],
        }),
      },
      incident: { findUnique: jest.fn().mockResolvedValue({ status: IncidentStatus.ON_SCENE }) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const realtime = { notifyIncidentStatusChanged: jest.fn(), responderStatus: jest.fn() };
    const notifier = {
      notifyReporter: jest.fn().mockResolvedValue(undefined),
      notifyDispatcher: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RespondersService(
      prisma as any,
      realtime as any,
      { log: jest.fn() } as any,
      new IncidentStatusService(),
      // No clientRequestId in these requests, so the retry wrapper just runs the update.
      { once: (_d: string, _i: string, _c: unknown, run: () => unknown) => run() } as any,
      {} as any,
      notifier as any,
    );
    return { service, notifier };
  }

  it('RESOLVED notifies the reporter and the assigning dispatcher', async () => {
    const { service, notifier } = build();

    await service.updateStatus('dispatch-1', 'resp-1', { status: 'RESOLVED' } as any);

    expect(notifier.notifyReporter).toHaveBeenCalledWith('inc-1', IncidentStatus.RESOLVED);
    expect(notifier.notifyDispatcher).toHaveBeenCalledWith('inc-1', IncidentStatus.RESOLVED, 'dispatch-1');
  });

  it('still returns when the notifier throws', async () => {
    const { service, notifier } = build();
    notifier.notifyReporter.mockImplementation(() => {
      throw new Error('boom');
    });

    await expect(
      service.updateStatus('dispatch-1', 'resp-1', { status: 'RESOLVED' } as any),
    ).resolves.toMatchObject({ incidentStatus: IncidentStatus.RESOLVED });
  });
});

describe('IncidentsService resolution and Verified Reporter standing', () => {
  function build(status: IncidentStatus) {
    const prisma = {
      incident: {
        findUnique: jest.fn().mockResolvedValue({ id: 'inc-1', status }),
        count: jest.fn(),
      },
      incident_resolutions: { upsert: jest.fn().mockResolvedValue({ id: 'r1' }) },
      incidentReporter: { findUnique: jest.fn() },
    };
    const service = new IncidentsService(
      prisma as any,
      new IncidentStatusService(),
      {} as any,
      {} as any,
      {} as any,
      { log: jest.fn() } as any,
      {} as any,
    );
    return { service, prisma };
  }

  it('upserts the resolution, so a retry after a failed close does not conflict', async () => {
    const { service, prisma } = build(IncidentStatus.RESOLVED);

    await service.createResolution('inc-1', { outcome: 'RESOLVED_SUCCESSFULLY' }, 'dispatcher-1');

    expect(prisma.incident_resolutions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { incident_id: 'inc-1' },
        create: expect.objectContaining({ incident_id: 'inc-1', outcome: 'RESOLVED_SUCCESSFULLY' }),
        update: expect.objectContaining({ outcome: 'RESOLVED_SUCCESSFULLY' }),
      }),
    );
  });

  it('refuses to change the resolution of a closed incident', async () => {
    const { service, prisma } = build(IncidentStatus.CLOSED);

    await expect(
      service.createResolution('inc-1', { outcome: 'OTHER' }, 'dispatcher-1'),
    ).rejects.toThrow('already closed');
    expect(prisma.incident_resolutions.upsert).not.toHaveBeenCalled();
  });

  it('counts closed reports as verified and false alerts separately', async () => {
    const { service, prisma } = build(IncidentStatus.CLOSED);
    prisma.incident.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);

    await expect(service.getReporterStanding('citizen-1')).resolves.toEqual({
      verifiedReports: 3,
      falseAlerts: 1,
      isVerifiedReporter: true,
    });
    expect(prisma.incident.count).toHaveBeenCalledWith({
      where: { incident_reporters: { is: { user_id: 'citizen-1' } }, status: 'CLOSED' },
    });
  });

  it('a citizen with no closed reports is not yet verified', async () => {
    const { service, prisma } = build(IncidentStatus.CLOSED);
    prisma.incident.count.mockResolvedValue(0);

    await expect(service.getReporterStanding('citizen-1')).resolves.toMatchObject({
      isVerifiedReporter: false,
    });
  });

  it('guest reporters have no standing', async () => {
    const { service, prisma } = build(IncidentStatus.CLOSED);
    prisma.incidentReporter.findUnique.mockResolvedValue({ user_id: 'guest-1', is_guest: true });

    await expect(service.getReporterStandingForIncident('inc-1')).resolves.toEqual({
      guest: true,
      standing: null,
    });
    expect(prisma.incident.count).not.toHaveBeenCalled();
  });
});
