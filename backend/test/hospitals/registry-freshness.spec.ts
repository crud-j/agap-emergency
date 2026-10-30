import 'reflect-metadata';
import { UserRole } from '@agap/shared';
import {
  HOSPITAL_STATUS_STALE,
  REGISTRY_REVIEW_DUE,
  RegistryFreshnessService,
} from '../../src/hospitals/registry-freshness.service';

/**
 * AUTOMATION_NEEDS_PLAN Phase 4, C8 (MOD-39): stale registry data is chased with in-app
 * notices only. The jobs never write a facility or a resource.
 */

const NOW = new Date('2026-10-30T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => hoursAgo(d * 24);

const STALE = { id: 'fac-1', name: 'Bocaue General Hospital', organization_id: 'org-1', receiving_status_updated_at: hoursAgo(7) };

function build(opts: {
  facilities?: unknown[];
  recent?: boolean;
  hospitalUsers?: { id: string }[];
  admins?: { id: string }[];
  memberships?: Record<string, string[]>;
  digestFacilities?: { id: string; name: string }[];
  digestResources?: { id: string; name: string }[];
} = {}) {
  const prisma: any = {
    facility: {
      findMany: jest.fn(async ({ where }: any) =>
        // The hourly query filters on receiving_status_updated_at; the digest on last_verified_at.
        JSON.stringify(where).includes('last_verified_at') ? (opts.digestFacilities ?? []) : (opts.facilities ?? [STALE])),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    resources: { findMany: jest.fn().mockResolvedValue(opts.digestResources ?? []), update: jest.fn(), updateMany: jest.fn() },
    notification: { findFirst: jest.fn().mockResolvedValue(opts.recent ? { id: 'n' } : null) },
    user: {
      findMany: jest.fn(async ({ where }: any) =>
        where.role === UserRole.HOSPITAL_USER ? (opts.hospitalUsers ?? [{ id: 'hu-1' }, { id: 'hu-2' }]) : (opts.admins ?? [])),
    },
    organization_memberships: {
      findMany: jest.fn(async ({ where }: any) =>
        (opts.memberships?.[where.user_id] ?? []).map((organization_id) => ({ organization_id }))),
    },
  };
  const notifications: any = { create: jest.fn().mockResolvedValue({}) };
  return { service: new RegistryFreshnessService(prisma, notifications), prisma, notifications };
}

function neverWritesRegistry(prisma: any) {
  expect(prisma.facility.update).not.toHaveBeenCalled();
  expect(prisma.facility.updateMany).not.toHaveBeenCalled();
  expect(prisma.resources.update).not.toHaveBeenCalled();
  expect(prisma.resources.updateMany).not.toHaveBeenCalled();
}

describe('RegistryFreshnessService: hourly receiving status reminder', () => {
  it('asks only for active facilities of an organization whose status is over 6 h old or never reported', async () => {
    const b = build();
    await b.service.remindStaleStatuses(NOW);
    expect(b.prisma.facility.findMany.mock.calls[0][0].where).toEqual({
      is_active: true,
      organization_id: { not: null },
      OR: [{ receiving_status_updated_at: null }, { receiving_status_updated_at: { lt: hoursAgo(6) } }],
    });
  });

  it("notices each hospital user of the facility's organization once, with the facility and the age", async () => {
    const b = build();
    await expect(b.service.remindStaleStatuses(NOW)).resolves.toBe(2);

    // Recipients: Hospital Users who can sign in and are active members of the facility's org.
    const who = b.prisma.user.findMany.mock.calls[0][0].where;
    expect(who).toMatchObject({
      role: UserRole.HOSPITAL_USER,
      status: { notIn: ['SUSPENDED', 'DEACTIVATED'] },
      organization_memberships: { some: { organization_id: 'org-1', is_active: true } },
    });

    expect(b.notifications.create).toHaveBeenCalledTimes(2);
    expect(b.notifications.create.mock.calls.map((c: any[]) => c[0].userId)).toEqual(['hu-1', 'hu-2']);
    expect(b.notifications.create.mock.calls[0][0]).toMatchObject({
      eventType: HOSPITAL_STATUS_STALE,
      channel: 'IN_APP',
      body: expect.stringContaining('Bocaue General Hospital: the receiving status was last updated 7 h ago'),
      dataPayload: { facilityId: 'fac-1', statusUpdatedAt: hoursAgo(7).toISOString() },
    });
    neverWritesRegistry(b.prisma);
  });

  it('a status never reported says so', async () => {
    const b = build({ facilities: [{ ...STALE, receiving_status_updated_at: null }] });
    await b.service.remindStaleStatuses(NOW);
    expect(b.notifications.create.mock.calls[0][0].body).toContain('has never been reported');
  });

  it('at most once per facility per 6 h (JSON path dedup on the facility)', async () => {
    const b = build({ recent: true });
    await expect(b.service.remindStaleStatuses(NOW)).resolves.toBe(0);
    expect(b.prisma.notification.findFirst.mock.calls[0][0].where).toEqual({
      event_type: HOSPITAL_STATUS_STALE,
      // 5 min short of 6 h, so the notice of the run 6 h ago (written just after it started)
      // doesn't hold the reminder back to 7 h.
      created_at: { gte: new Date(hoursAgo(6).getTime() + 5 * 60 * 1000) },
      data_payload: { path: ['facilityId'], equals: 'fac-1' },
    });
    expect(b.notifications.create).not.toHaveBeenCalled();
  });

  it('no hospital users in the organization: nobody else is told', async () => {
    const b = build({ hospitalUsers: [] });
    await expect(b.service.remindStaleStatuses(NOW)).resolves.toBe(0);
    expect(b.notifications.create).not.toHaveBeenCalled();
  });

  it('one facility failing does not stop the others, and a failed run never throws', async () => {
    const b = build({ facilities: [STALE, { ...STALE, id: 'fac-2', name: 'Second' }] });
    b.prisma.notification.findFirst.mockRejectedValueOnce(new Error('db hiccup'));
    await expect(b.service.remindStaleStatuses(NOW)).resolves.toBe(2);
    expect(b.notifications.create.mock.calls.every((c: any[]) => c[0].dataPayload.facilityId === 'fac-2')).toBe(true);

    b.prisma.facility.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(b.service.remindStaleStatuses(NOW)).resolves.toBe(0);
  });
});

describe('RegistryFreshnessService: monthly registry digest', () => {
  it("one notice per Org Administrator, scoped to their organizations' facilities and units", async () => {
    const b = build({
      admins: [{ id: 'oa-1' }],
      memberships: { 'oa-1': ['org-1'] },
      digestFacilities: [{ id: 'fac-1', name: 'Bocaue General Hospital' }],
      digestResources: [{ id: 'res-1', name: 'Rescue 1' }, { id: 'res-2', name: 'Rescue 2' }],
    });
    await expect(b.service.sendRegistryDigests(NOW)).resolves.toBe(1);

    const cutoff = daysAgo(90);
    expect(b.prisma.facility.findMany.mock.calls[0][0].where).toEqual({
      organization_id: { in: ['org-1'] },
      is_active: true,
      OR: [{ last_verified_at: null }, { last_verified_at: { lt: cutoff } }],
    });
    // K4: resources have no last_verified_at, so their updated_at is used.
    expect(b.prisma.resources.findMany.mock.calls[0][0].where).toEqual({
      organization_id: { in: ['org-1'] }, is_active: true, updated_at: { lt: cutoff },
    });
    expect(b.notifications.create).toHaveBeenCalledWith({
      userId: 'oa-1',
      eventType: REGISTRY_REVIEW_DUE,
      title: 'Monthly registry check',
      body: '1 facility not verified in 90 days (Bocaue General Hospital); 2 units not updated in 90 days (Rescue 1, Rescue 2). Please review them.',
      channel: 'IN_APP',
      dataPayload: { facilityIds: ['fac-1'], resourceIds: ['res-1', 'res-2'] },
    });
    neverWritesRegistry(b.prisma);
  });

  it('lists at most 5 names of each kind and counts the rest', async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `f${i}`, name: `F${i}` }));
    const b = build({ admins: [{ id: 'oa-1' }], memberships: { 'oa-1': ['org-1'] }, digestFacilities: many });
    await b.service.sendRegistryDigests(NOW);
    expect(b.notifications.create.mock.calls[0][0].body).toBe(
      '7 facilities not verified in 90 days (F0, F1, F2, F3, F4 and 2 more). Please review them.',
    );
  });

  it('nothing due, or no organization: no notice', async () => {
    const b = build({ admins: [{ id: 'oa-1' }, { id: 'oa-2' }], memberships: { 'oa-1': ['org-1'] } });
    await expect(b.service.sendRegistryDigests(NOW)).resolves.toBe(0);
    expect(b.notifications.create).not.toHaveBeenCalled();
    // oa-2 has no organization: its registry is never queried.
    expect(b.prisma.facility.findMany).toHaveBeenCalledTimes(1);
  });

  it('runs at 08:00 Philippine time on the 1st, and hourly for the reminder', () => {
    const cron = (method: string) => Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', (RegistryFreshnessService.prototype as any)[method]);
    expect(cron('monthly')).toMatchObject({ cronTime: '0 8 1 * *', timeZone: 'Asia/Manila' });
    expect(cron('hourly')).toMatchObject({ cronTime: '0 * * * *' });
  });
});
