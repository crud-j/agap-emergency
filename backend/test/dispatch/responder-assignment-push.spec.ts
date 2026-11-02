import { DispatchService } from '../../src/dispatch/dispatch.service';
import {
  ASSIGNMENTS_CHANNEL,
  ASSIGNMENT_PUSH_JOB,
  assignmentPush,
  assignmentPushJobId,
} from '../../src/dispatch/assignment-push';

/**
 * AUTOMATION_NEEDS_PLAN Phase 1, C1 (MOD-18 / MOD-32): every crew phone gets a push for a new
 * assignment, an added crew member gets one, and a cancellation tells the crew to stand down.
 * The push shows on the lock screen, so it carries the category and reference only.
 */

const INCIDENT = {
  id: 'inc-1',
  status: 'ASSESSED',
  category: 'ROAD_ACCIDENT',
  public_reference: 'INC-2026-001234',
  incident_reporters: { user_id: 'reporter-1', full_name: 'Juan Dela Cruz' },
};
// What could leak onto a lock screen if the builder spread an incident row.
const PRIVATE = ['Juan', 'Dela Cruz', 'MacArthur', 'Lolomboy', '14.5995', 'inc-1', 'reporter-1'];

function build(opts: { crew?: string[]; queueFails?: boolean } = {}) {
  const crew = opts.crew ?? ['resp-a', 'resp-b'];
  const dispatchRow = {
    id: 'disp-1',
    incident_id: INCIDENT.id,
    resource_id: 'res-1',
    status: 'PENDING',
    created_at: new Date('2026-10-30T01:00:00Z'),
    dispatch_notes: null,
  };
  const tx = {
    dispatches: { create: jest.fn().mockResolvedValue(dispatchRow), update: jest.fn().mockResolvedValue({ ...dispatchRow, status: 'CANCELLED' }) },
    // The incident row lock taken by create() (Phase 5), then the crew availability rows.
    $queryRaw: jest.fn(async (sql: TemplateStringsArray | { sql?: string }) =>
      (Array.isArray(sql) ? sql.join('') : String((sql as { sql?: string }).sql ?? '')).includes('FROM incidents')
        ? [{ status: INCIDENT.status }]
        : crew.map((user_id) => ({ user_id, status: 'AVAILABLE' }))),
    dispatch_crew: {
      createMany: jest.fn().mockResolvedValue({ count: crew.length }),
      create: jest.fn().mockResolvedValue({ dispatch_id: 'disp-1', user_id: 'resp-c' }),
    },
    resources: { update: jest.fn() },
    incident: { update: jest.fn() },
    incidentEvent: { create: jest.fn() },
  };
  const prisma: any = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    incident: {
      findUnique: jest.fn().mockResolvedValue({
        ...INCIDENT,
        address: 'MacArthur Highway, Lolomboy',
        latitude: 14.5995,
      }),
    },
    resources: { findUnique: jest.fn().mockResolvedValue({ id: 'res-1', status: 'AVAILABLE', organization_id: 'org-1' }) },
    dispatch_crew: { findMany: jest.fn().mockResolvedValue(crew.map((user_id) => ({ user_id }))) },
    dispatches: {
      findUnique: jest.fn().mockResolvedValue({
        ...dispatchRow,
        dispatch_crew: crew.map((user_id) => ({ dispatch_id: 'disp-1', user_id })),
        incidents: { ...INCIDENT, address: 'MacArthur Highway, Lolomboy' },
        resources: { id: 'res-1' },
      }),
    },
  };
  const realtime: any = {
    incidentAssigned: jest.fn(),
    notifyIncidentStatusChanged: jest.fn(),
    notifyDispatchCreated: jest.fn(),
    notifyDispatchCancelled: jest.fn(),
    resourceStatusChanged: jest.fn(),
  };
  const queue: any = {
    add: opts.queueFails ? jest.fn().mockRejectedValue(new Error('redis down')) : jest.fn().mockResolvedValue({}),
  };
  const audit: any = { log: jest.fn() };
  const service = new DispatchService(prisma, audit, realtime, queue);
  const pushes = () => queue.add.mock.calls.filter((c: any[]) => c[0] === ASSIGNMENT_PUSH_JOB);
  return { service, prisma, queue, pushes, dispatchRow };
}

const dto = { incidentId: 'inc-1', resourceId: 'res-1', initialCrewIds: ['resp-a', 'resp-b'] };

describe('assignmentPush (message builder)', () => {
  it('carries the category and public reference, and the dispatch ID for the tap', () => {
    const job = assignmentPush('ASSIGNMENT', INCIDENT, 'disp-1', 'resp-a');
    expect(job).toEqual({
      channel: 'PUSH',
      userId: 'resp-a',
      title: 'New assignment',
      body: 'ROAD ACCIDENT · INC-2026-001234. Open AGAP to accept.',
      data: { type: 'ASSIGNMENT', dispatchId: 'disp-1' },
      androidChannelId: ASSIGNMENTS_CHANNEL,
    });
  });

  it('never puts the incident ID, name or address in the body or data', () => {
    const row = { ...INCIDENT, address: 'MacArthur Highway, Lolomboy', latitude: 14.5995 } as any;
    for (const kind of ['ASSIGNMENT', 'ASSIGNMENT_CANCELLED'] as const) {
      const job = assignmentPush(kind, row, 'disp-1', 'resp-a');
      const visible = JSON.stringify({ title: job.title, body: job.body, data: job.data });
      for (const p of PRIVATE) expect(visible).not.toContain(p);
      expect(job.data).not.toHaveProperty('incidentId');
    }
  });

  it('uses dash-separated job IDs (BullMQ rejects most IDs with ":")', () => {
    expect(assignmentPushJobId('ASSIGNMENT', 'disp-1', 'resp-a')).toBe('assign-disp-1-resp-a');
    expect(assignmentPushJobId('ASSIGNMENT_CANCELLED', 'disp-1', 'resp-a')).toBe('assign-cancel-disp-1-resp-a');
  });
});

describe('DispatchService responder pushes', () => {
  it('create: queues one push per crew member with a deterministic jobId', async () => {
    const b = build();
    await b.service.create(dto as any, 'dispatcher-1');

    const pushes = b.pushes();
    expect(pushes).toHaveLength(2);
    expect(pushes.map((c: any[]) => c[1].userId).sort()).toEqual(['resp-a', 'resp-b']);
    for (const [, data, opts] of pushes) {
      expect(opts).toMatchObject({ jobId: `assign-disp-1-${data.userId}`, attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
      expect(data).toMatchObject({ title: 'New assignment', data: { type: 'ASSIGNMENT', dispatchId: 'disp-1' }, androidChannelId: 'assignments' });
      expect(data.body).toContain('INC-2026-001234');
      for (const p of PRIVATE) expect(JSON.stringify(data)).not.toContain(p);
    }
    // The crew comes from the stored dispatch_crew rows, not the request.
    expect(b.prisma.dispatch_crew.findMany).toHaveBeenCalledWith({ where: { dispatch_id: 'disp-1' }, select: { user_id: true } });
  });

  it('create: no crew → no push', async () => {
    const b = build({ crew: [] });
    await b.service.create({ incidentId: 'inc-1', resourceId: 'res-1' } as any, 'dispatcher-1');
    expect(b.pushes()).toHaveLength(0);
  });

  it('create: a queue failure does not throw and the dispatch is still returned', async () => {
    const b = build({ queueFails: true });
    await expect(b.service.create(dto as any, 'dispatcher-1')).resolves.toEqual(b.dispatchRow);
    expect(b.queue.add).toHaveBeenCalled();
  });

  it('create: a crew lookup failure does not throw either', async () => {
    const b = build();
    b.prisma.dispatch_crew.findMany.mockRejectedValue(new Error('db blip'));
    await expect(b.service.create(dto as any, 'dispatcher-1')).resolves.toEqual(b.dispatchRow);
  });

  it('addCrew: pushes the added responder only, with a unique jobId', async () => {
    const b = build();
    await b.service.addCrew('disp-1', 'resp-c', 'dispatcher-1');
    const pushes = b.pushes();
    expect(pushes).toHaveLength(1);
    expect(pushes[0][1]).toMatchObject({ userId: 'resp-c', title: 'New assignment', data: { type: 'ASSIGNMENT', dispatchId: 'disp-1' } });
    expect(pushes[0][2].jobId).toMatch(/^assign-disp-1-resp-c-\d+$/);
  });

  it('addCrew: a queue failure still returns the crew row', async () => {
    const b = build({ queueFails: true });
    await expect(b.service.addCrew('disp-1', 'resp-c', 'dispatcher-1')).resolves.toEqual({ dispatch_id: 'disp-1', user_id: 'resp-c' });
  });

  it('cancel: pushes "Assignment cancelled" to every crew member', async () => {
    const b = build();
    await b.service.cancel('disp-1', 'dispatcher-1');
    const pushes = b.pushes();
    expect(pushes).toHaveLength(2);
    for (const [, data, opts] of pushes) {
      expect(data).toMatchObject({ title: 'Assignment cancelled', data: { type: 'ASSIGNMENT_CANCELLED', dispatchId: 'disp-1' } });
      expect(opts.jobId).toBe(`assign-cancel-disp-1-${data.userId}`);
      for (const p of PRIVATE) expect(JSON.stringify(data)).not.toContain(p);
    }
  });

  it('cancel: a queue failure still returns the cancelled dispatch', async () => {
    const b = build({ queueFails: true });
    await expect(b.service.cancel('disp-1', 'dispatcher-1')).resolves.toMatchObject({ id: 'disp-1', status: 'CANCELLED' });
  });
});
