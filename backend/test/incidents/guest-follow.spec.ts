const mockSend = jest.fn();
const mockGetApps = jest.fn(() => [{}]);
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: () => mockGetApps(),
  cert: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ send: mockSend }) }));

import { UnauthorizedException } from '@nestjs/common';
import { GUEST_REPORT_PUSH_TYPE, IncidentStatus } from '@agap/shared';
import { GuestFollowService, hashGuestToken } from '../../src/incidents/guest-follow/guest-follow.service';
import {
  GUEST_FOLLOW_AFTER_END_MS,
  GUEST_FOLLOW_TTL_MS,
  MAX_GUEST_FOLLOWERS_PER_INCIDENT,
} from '../../src/incidents/guest-follow/guest-follow.constants';
import { IncidentStatusNotifier } from '../../src/notifications/incident-status-notifier';
import { NotificationProcessor } from '../../src/jobs/processors/notification.processor';
import { IncidentsController } from '../../src/incidents/incidents.controller';

/** A guest (no account) following their own report: token, status, push (MOD-42, Rule 14). */

const NOW = new Date('2026-11-25T08:00:00Z');
const TOKEN = 'A'.repeat(43);

function guestIncident(overrides: Record<string, unknown> = {}) {
  return {
    report_channel: 'APP',
    incident_reporters: { user_id: null, is_guest: true },
    _count: { guest_followers: 0 },
    ...overrides,
  };
}

describe('GuestFollowService.issue', () => {
  function build(incident: unknown) {
    const prisma = {
      incident: { findUnique: jest.fn().mockResolvedValue(incident) },
      guest_report_followers: { create: jest.fn().mockResolvedValue({ id: 'f1' }) },
    };
    return { service: new GuestFollowService(prisma as any), prisma };
  }

  it('gives a guest app report a random token and stores only its hash, for 7 days', async () => {
    const { service, prisma } = build(guestIncident());

    const token = await service.issue('inc-1', NOW);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = prisma.guest_report_followers.create.mock.calls[0][0].data;
    expect(row).toEqual({
      incident_id: 'inc-1',
      token_hash: hashGuestToken(token!),
      expires_at: new Date(NOW.getTime() + GUEST_FOLLOW_TTL_MS),
    });
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('gives every call a different token', async () => {
    const { service } = build(guestIncident());
    expect(await service.issue('inc-1', NOW)).not.toEqual(await service.issue('inc-1', NOW));
  });

  it.each([
    ['a signed-in reporter', guestIncident({ incident_reporters: { user_id: 'citizen-1', is_guest: false } })],
    ['an SMS report (its event id is printed in the text)', guestIncident({ report_channel: 'SMS' })],
    ['no reporter row', guestIncident({ incident_reporters: null })],
    ['a report that already has the most links', guestIncident({ _count: { guest_followers: MAX_GUEST_FOLLOWERS_PER_INCIDENT } })],
    ['a missing incident', null],
  ])('gives no token for %s', async (_label, incident) => {
    const { service, prisma } = build(incident);

    await expect(service.issue('inc-1', NOW)).resolves.toBeNull();
    expect(prisma.guest_report_followers.create).not.toHaveBeenCalled();
  });

  it('returns null instead of throwing when the database fails (the report stands)', async () => {
    const { service, prisma } = build(guestIncident());
    prisma.guest_report_followers.create.mockRejectedValue(new Error('db down'));

    await expect(service.issue('inc-1', NOW)).resolves.toBeNull();
  });
});

describe('GuestFollowService.status', () => {
  const follower = { id: 'f1', incident_id: 'inc-guest', push_token: null, expires_at: new Date('2026-12-01T00:00:00Z') };

  function build(incidents: Record<string, unknown>, row: unknown = follower) {
    const prisma = {
      guest_report_followers: { findUnique: jest.fn().mockResolvedValue(row), update: jest.fn() },
      incident: { findUnique: jest.fn(({ where }: { where: { id: string } }) => Promise.resolve(incidents[where.id] ?? null)) },
    };
    return { service: new GuestFollowService(prisma as any), prisma };
  }

  const own = (status: string, extra: Record<string, unknown> = {}) => ({
    public_reference: 'INC-2026-000200',
    category: 'FIRE',
    status,
    submitted_at: new Date('2026-11-25T07:50:00Z'),
    duplicate_of_id: null,
    incident_events: [{ occurred_at: new Date('2026-11-25T07:55:00Z') }],
    ...extra,
  });

  it('looks the token up by its hash and shows the guest their own report', async () => {
    const { service, prisma } = build({ 'inc-guest': own(IncidentStatus.ACKNOWLEDGED) });

    const status = await service.status(TOKEN, NOW);

    expect(prisma.guest_report_followers.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token_hash: hashGuestToken(TOKEN) } }),
    );
    expect(status).toEqual({
      publicReference: 'INC-2026-000200',
      category: 'FIRE',
      status: 'ACKNOWLEDGED',
      submittedAt: '2026-11-25T07:50:00.000Z',
      updatedAt: '2026-11-25T07:55:00.000Z',
      merged: false,
      current: null,
      effectiveStatus: 'ACKNOWLEDGED',
      finished: false,
      pushEnabled: false,
      followUntil: '2026-12-01T00:00:00.000Z',
      newReportBlock: { reason: 'open' },
    });
  });

  it('tells the phone when it can report again: at once after a close, 10 min after a false alert', async () => {
    // own() reached its status at 07:55; NOW is 08:00.
    const closed = build({ 'inc-guest': own(IncidentStatus.CLOSED) });
    await expect(closed.service.status(TOKEN, NOW)).resolves.toMatchObject({ newReportBlock: null });

    const falseAlert = build({ 'inc-guest': own(IncidentStatus.FALSE_ALERT) });
    await expect(falseAlert.service.status(TOKEN, NOW)).resolves.toMatchObject({
      newReportBlock: { reason: 'wait', until: '2026-11-25T08:05:00.000Z' },
    });

    const later = new Date('2026-11-25T08:06:00Z');
    await expect(falseAlert.service.status(TOKEN, later)).resolves.toMatchObject({ newReportBlock: null });
  });

  it('after a merge, follows the main report with status words only (never its reference)', async () => {
    const { service } = build({
      'inc-guest': own(IncidentStatus.DUPLICATE, { duplicate_of_id: 'inc-main' }),
      'inc-main': {
        public_reference: 'INC-2026-000150',
        status: IncidentStatus.EN_ROUTE,
        submitted_at: new Date('2026-11-25T07:40:00Z'),
        duplicate_of_id: null,
        incident_events: [{ occurred_at: new Date('2026-11-25T07:58:00Z') }],
      },
    });

    const status = await service.status(TOKEN, NOW);

    expect(status).toMatchObject({
      publicReference: 'INC-2026-000200',
      status: 'DUPLICATE',
      merged: true,
      current: { status: 'EN_ROUTE', updatedAt: '2026-11-25T07:58:00.000Z' },
      effectiveStatus: 'EN_ROUTE',
      updatedAt: '2026-11-25T07:58:00.000Z',
      finished: false,
      newReportBlock: { reason: 'open' },
    });
    expect(JSON.stringify(status)).not.toContain('INC-2026-000150');
  });

  it('follows a merge of a merge to where the emergency stands now', async () => {
    const { service } = build({
      'inc-guest': own(IncidentStatus.DUPLICATE, { duplicate_of_id: 'inc-b' }),
      'inc-b': { status: IncidentStatus.DUPLICATE, submitted_at: NOW, duplicate_of_id: 'inc-c', incident_events: [] },
      'inc-c': { status: IncidentStatus.CLOSED, submitted_at: NOW, duplicate_of_id: null, incident_events: [] },
    });

    await expect(service.status(TOKEN, NOW)).resolves.toMatchObject({ effectiveStatus: 'CLOSED', finished: true });
  });

  it.each([IncidentStatus.CLOSED, IncidentStatus.CANCELLED, IncidentStatus.FALSE_ALERT])('%s is finished', async (s) => {
    const { service } = build({ 'inc-guest': own(s) });
    await expect(service.status(TOKEN, NOW)).resolves.toMatchObject({ finished: true });
  });

  it('a malformed token is refused without a database read', async () => {
    const { service, prisma } = build({});

    await expect(service.status('short', NOW)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.status(undefined, NOW)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.guest_report_followers.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', null],
    ['expired', { ...follower, expires_at: new Date(NOW.getTime() - 1) }],
  ])('an %s token is refused', async (_label, row) => {
    const { service } = build({ 'inc-guest': own(IncidentStatus.ACKNOWLEDGED) }, row);
    await expect(service.status(TOKEN, NOW)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('stores and removes the device token', async () => {
    const { service, prisma } = build({});

    await expect(service.setPushToken(TOKEN, 'fcm:abc', NOW)).resolves.toEqual({ pushEnabled: true });
    expect(prisma.guest_report_followers.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { push_token: 'fcm:abc' } });

    await expect(service.setPushToken(TOKEN, null, NOW)).resolves.toEqual({ pushEnabled: false });
    expect(prisma.guest_report_followers.update).toHaveBeenLastCalledWith({ where: { id: 'f1' }, data: { push_token: null } });
  });

  it('prune deletes expired links (and their device tokens)', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const service = new GuestFollowService({ guest_report_followers: { deleteMany } } as any);

    await expect(service.prune(NOW)).resolves.toBe(3);
    expect(deleteMany).toHaveBeenCalledWith({ where: { expires_at: { lt: NOW } } });
  });
});

describe('POST /v1/incidents hands a guest the follow token', () => {
  function build(issued: string | null) {
    const incidents = { create: jest.fn().mockResolvedValue({ id: 'inc-1', public_reference: 'INC-2026-000200' }) };
    const guestFollow = { issue: jest.fn().mockResolvedValue(issued) };
    const controller = new IncidentsController(
      incidents as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, guestFollow as any,
    );
    return { controller, guestFollow };
  }

  it('a guest gets guest_status_token', async () => {
    const { controller, guestFollow } = build(TOKEN);

    const result: any = await controller.create({} as any, {});

    expect(guestFollow.issue).toHaveBeenCalledWith('inc-1');
    expect(result.guest_status_token).toBe(TOKEN);
  });

  it('a signed-in reporter gets none (they follow from their account)', async () => {
    const { controller, guestFollow } = build(TOKEN);

    const result: any = await controller.create({} as any, { user: { id: 'citizen-1', role: 'CITIZEN' } });

    expect(guestFollow.issue).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('guest_status_token');
  });

  it('no token issued → the report is still returned', async () => {
    const { controller } = build(null);
    await expect(controller.create({} as any, {})).resolves.toEqual({ id: 'inc-1', public_reference: 'INC-2026-000200' });
  });
});

describe('IncidentStatusNotifier → guests following a report', () => {
  function build(followers: Array<{ id: string; ref: string }>) {
    const prisma = {
      // No account reporter: only the guest path runs.
      incident: { findUnique: jest.fn().mockResolvedValue({ public_reference: 'INC-2026-000200', incident_reporters: { user_id: null } }) },
      guest_report_followers: {
        findMany: jest.fn().mockResolvedValue(followers.map((f) => ({ id: f.id, incident: { public_reference: f.ref } }))),
        updateMany: jest.fn().mockResolvedValue({ count: followers.length }),
      },
    };
    const notifications = { create: jest.fn() };
    const queue = { add: jest.fn().mockResolvedValue({}) };
    return { notifier: new IncidentStatusNotifier(prisma as any, notifications as any, queue as any), prisma, notifications, queue };
  }

  it('pushes each follower their own reference, with no incident id, once per status', async () => {
    const { notifier, queue, notifications } = build([
      { id: 'f1', ref: 'INC-2026-000200' },
      { id: 'f2', ref: 'INC-2026-000201' }, // a guest whose report was merged into this one
    ]);

    await notifier.notifyReporter('inc-1', IncidentStatus.DISPATCHED);

    expect(notifications.create).not.toHaveBeenCalled(); // no account, no feed row
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      'guest-status-push',
      {
        guestFollowerId: 'f2',
        channel: 'PUSH',
        title: 'Help is on the way',
        body: 'Responders have been dispatched for INC-2026-000201.',
        data: { type: GUEST_REPORT_PUSH_TYPE, status: 'DISPATCHED', publicReference: 'INC-2026-000201' },
        androidChannelId: 'incident-updates',
      },
      { jobId: 'guest-status:f2:DISPATCHED' },
    );
    expect(JSON.stringify(queue.add.mock.calls)).not.toMatch(/inc-1|incidentId|token/);
  });

  it('finds followers of this report and of reports merged into it, with a live device token', async () => {
    const { notifier, prisma } = build([]);

    await notifier.notifyReporter('inc-1', IncidentStatus.ON_SCENE);

    const where = prisma.guest_report_followers.findMany.mock.calls[0][0].where;
    expect(where.push_token).toEqual({ not: null });
    expect(where.expires_at.gt).toBeInstanceOf(Date);
    expect(where.OR).toEqual([
      { incident_id: 'inc-1' },
      { incident: { duplicate_of_id: 'inc-1' } },
      { incident: { duplicate_of: { duplicate_of_id: 'inc-1' } } },
    ]);
  });

  it.each([
    [IncidentStatus.CANCELLED, 'Report cancelled', 'INC-2026-000200 was cancelled. If you still need help, call 911 or the MDRRMO hotline.'],
    [IncidentStatus.CLOSED, 'Incident closed', 'INC-2026-000200 is now closed. Thank you for reporting through AGAP.'],
    [IncidentStatus.DUPLICATE, 'Report merged', 'INC-2026-000200 matched another report of the same emergency. Responders are handling it there, and you will keep getting updates here.'],
    [IncidentStatus.EN_ROUTE, 'Responders on the way', 'Responders are travelling to the scene for INC-2026-000200.'],
    [IncidentStatus.FALSE_ALERT, 'Report closed', 'INC-2026-000200 was reviewed and closed as a false alert. If you still need help, call 911 or report again.'],
  ])('%s uses guest wording', async (status, title, body) => {
    const { notifier, queue } = build([{ id: 'f1', ref: 'INC-2026-000200' }]);

    await notifier.notifyReporter('inc-1', status);

    expect(queue.add.mock.calls[0][1]).toMatchObject({ title, body });
    expect(body).not.toMatch(/Verified Reporter|Open AGAP/);
  });

  it('once the report is over, keeps the link one more day only', async () => {
    const { notifier, prisma } = build([{ id: 'f1', ref: 'INC-2026-000200' }]);
    const before = Date.now();

    await notifier.notifyReporter('inc-1', IncidentStatus.CLOSED);

    const call = prisma.guest_report_followers.updateMany.mock.calls[0][0];
    expect(call.where.id).toEqual({ in: ['f1'] });
    const until: Date = call.data.expires_at;
    expect(until.getTime()).toBeGreaterThanOrEqual(before + GUEST_FOLLOW_AFTER_END_MS);
    expect(until.getTime()).toBeLessThanOrEqual(Date.now() + GUEST_FOLLOW_AFTER_END_MS);
  });

  it('does not shorten the link on a merge (the guest keeps following)', async () => {
    const { notifier, prisma } = build([{ id: 'f1', ref: 'INC-2026-000200' }]);

    await notifier.notifyReporter('inc-1', IncidentStatus.DUPLICATE);

    expect(prisma.guest_report_followers.updateMany).not.toHaveBeenCalled();
  });

  it('skips statuses with no guest message', async () => {
    const { notifier, prisma } = build([{ id: 'f1', ref: 'INC-2026-000200' }]);

    await notifier.notifyReporter('inc-1', IncidentStatus.ASSESSED);

    expect(prisma.guest_report_followers.findMany).not.toHaveBeenCalled();
  });

  it('still tells the account reporter when the guest lookup fails, and never throws', async () => {
    const { notifier, prisma, notifications } = build([]);
    prisma.incident.findUnique.mockResolvedValue({ public_reference: 'INC-2026-000200', incident_reporters: { user_id: 'citizen-1' } });
    notifications.create.mockResolvedValue({ id: 'n1' });
    prisma.guest_report_followers.findMany.mockRejectedValue(new Error('db down'));

    await expect(notifier.notifyReporter('inc-1', IncidentStatus.RESOLVED)).resolves.toBeUndefined();
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'citizen-1' }));
  });
});

describe('NotificationProcessor guest PUSH', () => {
  function build(row: unknown) {
    const prisma = {
      guest_report_followers: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const processor = new NotificationProcessor({ get: jest.fn() } as any, prisma as any, { add: jest.fn() } as any);
    return { processor, prisma };
  }
  const job = (data: Record<string, unknown> = {}) =>
    ({ id: 'j1', data: { guestFollowerId: 'f1', channel: 'PUSH', title: 'T', body: 'B', ...data } }) as any;
  const live = { push_token: 'guest-device', expires_at: new Date(Date.now() + 60_000) };

  beforeEach(() => {
    mockSend.mockReset().mockResolvedValue('msg-id');
    mockGetApps.mockReturnValue([{}]);
  });

  it('sends to the device token stored for the follower', async () => {
    const { processor } = build(live);

    await processor.process(job({ androidChannelId: 'incident-updates', data: { type: GUEST_REPORT_PUSH_TYPE } }));

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'guest-device',
        data: { type: GUEST_REPORT_PUSH_TYPE },
        android: { priority: 'high', notification: { channelId: 'incident-updates' } },
      }),
    );
  });

  it.each([
    ['push turned off', { ...live, push_token: null }],
    ['an expired link', { ...live, expires_at: new Date(Date.now() - 1) }],
    ['a deleted link', null],
  ])('skips %s', async (_label, row) => {
    const { processor } = build(row);
    await processor.process(job());
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('forgets a device token Firebase no longer accepts, without throwing', async () => {
    const { processor, prisma } = build(live);
    mockSend.mockRejectedValue(Object.assign(new Error('gone'), { code: 'messaging/registration-token-not-registered' }));

    await expect(processor.process(job())).resolves.toBeUndefined();
    expect(prisma.guest_report_followers.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { push_token: null } });
  });

  it('keeps the token on a temporary failure', async () => {
    const { processor, prisma } = build(live);
    mockSend.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'messaging/internal-error' }));

    await processor.process(job());
    expect(prisma.guest_report_followers.update).not.toHaveBeenCalled();
  });
});
