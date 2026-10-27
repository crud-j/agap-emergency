import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@agap/shared';
import { AnnouncementsService } from '../../src/announcements/announcements.service';
import { AnnouncementsController } from '../../src/announcements/announcements.controller';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

// ─── In-memory fake (only what the service touches) ───────────────────────────

const OFFICER = 'user-officer';
const SUPERVISOR = 'user-supervisor';
const SUPERVISOR_2 = 'user-supervisor-2';

type Row = Record<string, any>;

function draft(over: Row = {}): Row {
  return {
    id: 'ann-1',
    publisher_id: OFFICER,
    title: 'Bocaue River at critical level',
    body: 'Lumikas na sa pinakamalapit na evacuation center.',
    summary: null,
    category: 'FLOOD_ALERT',
    severity: 'CRITICAL',
    scope: 'MUNICIPALITY_WIDE',
    target_barangays: [],
    status: 'DRAFT',
    issuing_office: 'MDRRMO Bocaue',
    source_reference: 'PAGASA Bulletin 12',
    scheduled_at: null,
    published_at: null,
    approved_by_id: null,
    approved_at: null,
    approval_requested_at: null,
    approval_requested_by_id: null,
    review_note: null,
    image_storage_key: null,
    created_at: new Date('2026-10-23T00:00:00Z'),
    updated_at: new Date('2026-10-23T00:00:00Z'),
    ...over,
  };
}

function statusMatches(row: Row, status: unknown): boolean {
  if (status === undefined) return true;
  if (typeof status === 'string') return row.status === status;
  return (status as { in: string[] }).in.includes(row.status);
}

function makeService(opts: { flag: boolean; rows?: Row[] }) {
  const rows = new Map<string, Row>((opts.rows ?? [draft()]).map((r) => [r.id, { ...r }]));
  const names = { users: { full_name: 'Officer' }, users_announcements_approved_by_idTousers: null, users_announcements_approval_requested_by_idTousers: null };

  const prisma = {
    announcement: {
      findUnique: jest.fn(async ({ where }: any) => (rows.has(where.id) ? { ...rows.get(where.id)! } : null)),
      findMany: jest.fn(async ({ where }: any) =>
        [...rows.values()]
          .filter((r) => statusMatches(r, where?.status) && (!where?.scheduled_at || r.scheduled_at <= where.scheduled_at.lte))
          .map((r) => ({ ...r, ...names })),
      ),
      count: jest.fn(async () => rows.size),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const r = rows.get(where.id);
        if (!r || !statusMatches(r, where.status)) return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: any) => Object.assign(rows.get(where.id)!, data)),
    },
    sms_subscribers: { findMany: jest.fn().mockResolvedValue([{ phone_number: '+639170000001' }]) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: SUPERVISOR }, { id: SUPERVISOR_2 }]) },
  };
  const realtime = { announcementPublished: jest.fn() };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn((k: string) => (k === 'ANNOUNCEMENT_APPROVAL_REQUIRED' ? String(opts.flag) : undefined)) };
  const smsQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const pushQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const notificationQueue = { add: jest.fn().mockResolvedValue(undefined) };

  const service = new AnnouncementsService(
    prisma as any, realtime as any, audit as any, config as any,
    smsQueue as any, pushQueue as any, notificationQueue as any,
  );
  return { service, rows, prisma, realtime, audit, smsQueue, notificationQueue };
}

const future = () => new Date(Date.now() + 60 * 60_000).toISOString();

// ─── Access ───────────────────────────────────────────────────────────────────

describe('AnnouncementsController approval access', () => {
  const roles = (name: keyof AnnouncementsController) =>
    Reflect.getMetadata(ROLES_KEY, AnnouncementsController.prototype[name]);

  it('lets only the Supervisor approve, return and list submissions', () => {
    expect(roles('approve')).toEqual([UserRole.SUPERVISOR]);
    expect(roles('returnToDraft')).toEqual([UserRole.SUPERVISOR]);
    expect(roles('approvals')).toEqual([UserRole.SUPERVISOR]);
    expect(roles('approvalImage')).toEqual([UserRole.SUPERVISOR]);
  });

  it('lets only publishing roles submit and withdraw', () => {
    const publishers = [UserRole.ANNOUNCEMENTS_PUBLISHER, UserRole.SYSTEM_ADMINISTRATOR];
    expect(roles('submit')).toEqual(publishers);
    expect(roles('withdraw')).toEqual(publishers);
    expect(roles('publish')).toEqual(publishers);
  });

  it('declares GET approvals and policy before GET :id (ParseUUIDPipe would 400)', () => {
    const order = Object.getOwnPropertyNames(AnnouncementsController.prototype);
    expect(order.indexOf('approvals')).toBeLessThan(order.indexOf('findById'));
    expect(order.indexOf('policy')).toBeLessThan(order.indexOf('findById'));
  });
});

// ─── Flag off: unchanged behaviour ────────────────────────────────────────────

describe('approval flag off', () => {
  it('publishes a CRITICAL advisory directly, with the publisher as approver', async () => {
    const { service, rows, smsQueue } = makeService({ flag: false });
    await service.publish('ann-1', OFFICER);
    expect(rows.get('ann-1')).toMatchObject({ status: 'PUBLISHED', approved_by_id: OFFICER });
    expect(smsQueue.add).toHaveBeenCalledTimes(1);
  });

  it('schedules a CRITICAL advisory directly', async () => {
    const { service, rows } = makeService({ flag: false });
    await service.schedule('ann-1', future(), OFFICER);
    expect(rows.get('ann-1')!.status).toBe('SCHEDULED');
  });

  it('refuses a submission (nothing needs approval)', async () => {
    const { service } = makeService({ flag: false });
    await expect(service.submitForApproval('ann-1', OFFICER)).rejects.toThrow(BadRequestException);
  });

  it('reports requiresApproval = false', async () => {
    const { service } = makeService({ flag: false });
    expect((await service.findForPublisher('ann-1')).requiresApproval).toBe(false);
  });
});

// ─── Flag on ──────────────────────────────────────────────────────────────────

describe('approval flag on', () => {
  it('refuses publish() and schedule() on CRITICAL', async () => {
    const { service, rows, smsQueue } = makeService({ flag: true });
    await expect(service.publish('ann-1', OFFICER)).rejects.toThrow(/need MDRRMO approval/);
    await expect(service.schedule('ann-1', future(), OFFICER)).rejects.toThrow(/need MDRRMO approval/);
    expect(rows.get('ann-1')!.status).toBe('DRAFT');
    expect(smsQueue.add).not.toHaveBeenCalled();
  });

  it('publishes non-CRITICAL directly', async () => {
    const { service, rows } = makeService({ flag: true, rows: [draft({ severity: 'WARNING' })] });
    await service.publish('ann-1', OFFICER);
    expect(rows.get('ann-1')!.status).toBe('PUBLISHED');
  });

  it('reports requiresApproval = true for CRITICAL only', async () => {
    const { service } = makeService({ flag: true, rows: [draft(), draft({ id: 'ann-2', severity: 'ADVISORY' })] });
    expect((await service.findForPublisher('ann-1')).requiresApproval).toBe(true);
    expect((await service.findForPublisher('ann-2')).requiresApproval).toBe(false);
  });

  it('submit → approve publishes once, with the Supervisor as approver', async () => {
    const { service, rows, smsQueue, realtime, notificationQueue } = makeService({ flag: true });
    await service.submitForApproval('ann-1', OFFICER);
    expect(rows.get('ann-1')).toMatchObject({ status: 'PENDING_APPROVAL', approval_requested_by_id: OFFICER });
    expect(notificationQueue.add).toHaveBeenCalledTimes(2);

    await service.approve('ann-1', SUPERVISOR);
    expect(rows.get('ann-1')).toMatchObject({ status: 'PUBLISHED', approved_by_id: SUPERVISOR });
    expect(realtime.announcementPublished).toHaveBeenCalledTimes(1);
    expect(smsQueue.add).toHaveBeenCalledTimes(1);
  });

  it('a submission without a time ignores a time saved earlier in the draft', async () => {
    const { service, rows } = makeService({ flag: true, rows: [draft({ scheduled_at: new Date(future()) })] });
    await service.submitForApproval('ann-1', OFFICER);
    expect(rows.get('ann-1')!.scheduled_at).toBeNull();
  });

  it('submit with a future time → approve schedules; the scheduler later publishes it', async () => {
    const { service, rows, realtime } = makeService({ flag: true });
    await service.submitForApproval('ann-1', OFFICER, future());
    await service.approve('ann-1', SUPERVISOR);
    expect(rows.get('ann-1')).toMatchObject({ status: 'SCHEDULED', approved_by_id: SUPERVISOR });
    expect(realtime.announcementPublished).not.toHaveBeenCalled();

    rows.get('ann-1')!.scheduled_at = new Date(Date.now() - 1000);
    await service.releaseDueScheduled();
    expect(rows.get('ann-1')!.status).toBe('PUBLISHED');
    expect(realtime.announcementPublished).toHaveBeenCalledTimes(1);
  });

  it('an approved scheduled advisory may be released early, keeping the Supervisor as approver', async () => {
    const { service, rows } = makeService({ flag: true });
    await service.submitForApproval('ann-1', OFFICER, future());
    await service.approve('ann-1', SUPERVISOR);
    await service.publish('ann-1', OFFICER);
    expect(rows.get('ann-1')).toMatchObject({ status: 'PUBLISHED', approved_by_id: SUPERVISOR });
  });

  it('unscheduling an approved advisory voids the approval', async () => {
    const { service, rows } = makeService({ flag: true });
    await service.submitForApproval('ann-1', OFFICER, future());
    await service.approve('ann-1', SUPERVISOR);
    await service.unschedule('ann-1', OFFICER);
    expect(rows.get('ann-1')).toMatchObject({ status: 'DRAFT', approved_by_id: null, approval_requested_at: null });
    await expect(service.publish('ann-1', OFFICER)).rejects.toThrow(/need MDRRMO approval/);
  });

  it('return needs a note, goes back to DRAFT and update() works again', async () => {
    const { service, rows } = makeService({ flag: true });
    await service.submitForApproval('ann-1', OFFICER);
    await expect(service.update('ann-1', { title: 'Edited' }, OFFICER)).rejects.toThrow(/Only draft/);
    await expect(service.returnToDraft('ann-1', '  short  ', SUPERVISOR)).rejects.toThrow(BadRequestException);

    await service.returnToDraft('ann-1', 'Add the evacuation centres per barangay.', SUPERVISOR);
    expect(rows.get('ann-1')).toMatchObject({ status: 'DRAFT', review_note: 'Add the evacuation centres per barangay.' });
    await service.update('ann-1', { title: 'Edited' }, OFFICER);
    expect(rows.get('ann-1')!.title).toBe('Edited');

    await service.submitForApproval('ann-1', OFFICER);
    expect(rows.get('ann-1')!.review_note).toBeNull();
  });

  it('withdraw returns a submission to draft', async () => {
    const { service, rows } = makeService({ flag: true });
    await service.submitForApproval('ann-1', OFFICER);
    await service.withdrawSubmission('ann-1', OFFICER);
    expect(rows.get('ann-1')).toMatchObject({ status: 'DRAFT', approval_requested_by_id: null });
  });

  it('refuses when the approver is the requester', async () => {
    const { service, rows } = makeService({ flag: true });
    await service.submitForApproval('ann-1', SUPERVISOR);
    await expect(service.approve('ann-1', SUPERVISOR)).rejects.toThrow(ForbiddenException);
    expect(rows.get('ann-1')!.status).toBe('PENDING_APPROVAL');
  });

  it('concurrent approves: only one publishes', async () => {
    const { service, realtime, smsQueue } = makeService({ flag: true });
    await service.submitForApproval('ann-1', OFFICER);
    const results = await Promise.allSettled([
      service.approve('ann-1', SUPERVISOR),
      service.approve('ann-1', SUPERVISOR_2),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(realtime.announcementPublished).toHaveBeenCalledTimes(1);
    expect(smsQueue.add).toHaveBeenCalledTimes(1);
  });

  it('a Supervisor push failure never blocks the submission', async () => {
    const { service, rows, notificationQueue } = makeService({ flag: true });
    notificationQueue.add.mockRejectedValue(new Error('redis down'));
    await service.submitForApproval('ann-1', OFFICER);
    expect(rows.get('ann-1')!.status).toBe('PENDING_APPROVAL');
  });

  it('lists submissions for the Supervisor', async () => {
    const { service } = makeService({ flag: true });
    await service.submitForApproval('ann-1', OFFICER);
    const list = await service.findPendingApproval();
    expect(list.map((a) => a.id)).toEqual(['ann-1']);
    expect(list[0]!.requiresApproval).toBe(true);
  });
});

// ─── Public endpoints never expose a submission ───────────────────────────────

describe('public reads', () => {
  it('findPublished and findPublicById never return PENDING_APPROVAL', async () => {
    const { service } = makeService({ flag: true, rows: [draft({ status: 'PENDING_APPROVAL' })] });
    expect(await service.findPublished({})).toEqual([]);
    await expect(service.findPublicById('ann-1')).rejects.toThrow(/not found/);
  });

  it('the image of a submission is not public, and the Supervisor route serves submissions only', async () => {
    const { service } = makeService({
      flag: true,
      rows: [draft({ status: 'PENDING_APPROVAL', image_storage_key: 'k1' }), draft({ id: 'ann-2', image_storage_key: 'k2' })],
    });
    await expect(service.getImageKey('ann-1', { publicOnly: true })).rejects.toThrow(/not found/);
    expect(await service.getImageKey('ann-1', { publicOnly: false, statuses: ['PENDING_APPROVAL'] })).toBe('k1');
    await expect(service.getImageKey('ann-2', { publicOnly: false, statuses: ['PENDING_APPROVAL'] })).rejects.toThrow(/not found/);
  });
});
