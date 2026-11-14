import { IcsNotifier } from '../../src/notifications/ics-notifier';

/** MOD-36: people are told when they get or lose a command job; failures never surface. */
describe('IcsNotifier', () => {
  function setup(crew: { dispatch_id: string } | null = null) {
    const prisma: any = {
      incident: { findUnique: jest.fn().mockResolvedValue({ public_reference: 'INC-2026-001234' }) },
      dispatch_crew: { findFirst: jest.fn().mockResolvedValue(crew) },
    };
    const notifications = { create: jest.fn().mockResolvedValue({ id: 'n-1' }) };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const notifier = new IcsNotifier(prisma, notifications as any, queue as any);
    return { notifier, prisma, notifications, queue };
  }

  it('stores the feed row, then queues one push keyed by assignment and kind', async () => {
    const { notifier, notifications, queue } = setup();
    await notifier.notify({ kind: 'ASSIGNED', userId: 'resp-1', incidentId: 'inc-1', assignmentId: 'asg-1', position: 'SAFETY_OFFICER' });

    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'resp-1',
      eventType: 'ICS_POSITION_ASSIGNED',
      title: 'You are the Safety Officer',
      incidentId: 'inc-1',
    }));
    const body: string = notifications.create.mock.calls[0][0].body;
    expect(body).toContain('INC-2026-001234');
    expect(queue.add).toHaveBeenCalledWith('ics-push', expect.objectContaining({ userId: 'resp-1', channel: 'PUSH' }), { jobId: 'ics:asg-1:ASSIGNED' });
  });

  it('points a crew member at their assignment on tap', async () => {
    const { notifier, notifications } = setup({ dispatch_id: 'disp-9' });
    await notifier.notify({ kind: 'RELIEVED', userId: 'resp-1', incidentId: 'inc-1', assignmentId: 'asg-1', position: 'INCIDENT_COMMANDER' });
    expect(notifications.create.mock.calls[0][0].dataPayload).toMatchObject({
      type: 'ICS_POSITION_RELIEVED', dispatchId: 'disp-9', position: 'INCIDENT_COMMANDER',
    });
  });

  it('never throws when the feed or queue fails', async () => {
    const { notifier, notifications } = setup();
    notifications.create.mockRejectedValueOnce(new Error('db down'));
    await expect(
      notifier.notify({ kind: 'COMMAND_ENDED', userId: 'resp-1', incidentId: 'inc-1', assignmentId: 'asg-1', position: 'LIAISON_OFFICER' }),
    ).resolves.toBeUndefined();
  });
});
