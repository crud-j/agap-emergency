import { Logger } from '@nestjs/common';
import { runAssignmentReminder } from '../../src/jobs/assignment-reminder';
import {
  ASSIGNMENT_ALARM_CHANNEL,
  ASSIGNMENT_REMINDER_JOB,
  ASSIGNMENT_REMINDER_MAX,
  NO_ANSWER_REASON_PREFIX,
} from '../../src/dispatch/assignment-push';

/**
 * MOD-18 / MOD-41: an unanswered assignment buzzes the crew phone every 30 s, up to 6
 * times, then the Operations Center is told once. It stops the moment it is answered.
 */

const logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() } as unknown as Logger;

function build(over: { status?: string; incidentStatus?: string; onCrew?: boolean; escalated?: boolean } = {}) {
  const dispatchRow = () => ({
    status: over.status ?? 'SENT',
    incident_id: 'inc-1',
    created_at: new Date('2026-11-27T01:00:00Z'),
    incidents: { category: 'FIRE', public_reference: 'INC-2026-000700', status: over.incidentStatus ?? 'DISPATCHED' },
    resources: { name: 'Ambulance 2', call_sign: 'AMB-2' },
    dispatch_crew: over.onCrew === false ? [] : [{ users: { full_name: 'Juan Responder' } }],
  });
  const prisma = {
    dispatches: { findUnique: jest.fn().mockImplementation(async () => dispatchRow()) },
    escalation: {
      findFirst: jest.fn().mockResolvedValue(over.escalated ? { id: 'esc-0' } : null),
      create: jest.fn().mockResolvedValue({ id: 'esc-1' }),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'sup-1', full_name: 'Supervisor' }]) },
  };
  const queue = { add: jest.fn().mockResolvedValue({}) };
  const realtime = { notifyEscalation: jest.fn() };
  const push = jest.fn().mockResolvedValue(undefined);
  const deps = { prisma: prisma as any, queue: queue as any, realtime: realtime as any, push, logger };
  return { deps, prisma, queue, realtime, push };
}

const job = (attempt: number) => ({ userId: 'resp-a', dispatchId: 'disp-1', attempt, chain: 1700 });

describe('assignment reminder', () => {
  it('still unanswered: buzzes again on the alarm channel and schedules the next check in 30 s', async () => {
    const b = build();
    await expect(runAssignmentReminder(b.deps, job(1))).resolves.toBe('reminded');

    expect(b.push).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'resp-a',
        title: 'New assignment: still waiting',
        androidChannelId: ASSIGNMENT_ALARM_CHANNEL,
        androidTag: 'assignment-disp-1',
        data: { type: 'ASSIGNMENT', dispatchId: 'disp-1', reminder: 1 },
      }),
    );
    expect(b.queue.add).toHaveBeenCalledWith(
      ASSIGNMENT_REMINDER_JOB,
      expect.objectContaining({ channel: 'ASSIGNMENT_REMINDER', data: { dispatchId: 'disp-1', attempt: 2, chain: 1700 } }),
      expect.objectContaining({ delay: 30_000, jobId: 'assign-remind-disp-1-resp-a-1700-2' }),
    );
    expect(b.prisma.escalation.create).not.toHaveBeenCalled();
  });

  it('the lock-screen text carries no address, name or incident id', async () => {
    const b = build();
    await runAssignmentReminder(b.deps, job(1));
    const sent = JSON.stringify(b.push.mock.calls[0][0]);
    expect(sent).not.toContain('inc-1');
    expect(sent).not.toContain('Juan');
  });

  it.each(['ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED'])('stops once the dispatch is %s', async (status) => {
    const b = build({ status });
    await expect(runAssignmentReminder(b.deps, job(3))).resolves.toBe('answered');
    expect(b.push).not.toHaveBeenCalled();
    expect(b.queue.add).not.toHaveBeenCalled();
  });

  it('stops when the responder was taken off the crew, or the incident is over', async () => {
    for (const b of [build({ onCrew: false }), build({ incidentStatus: 'FALSE_ALERT' }), build({ incidentStatus: 'CLOSED' })]) {
      await expect(runAssignmentReminder(b.deps, job(2))).resolves.toBe('answered');
      expect(b.push).not.toHaveBeenCalled();
    }
  });

  it(`after the ${ASSIGNMENT_REMINDER_MAX}th buzz (3 min): escalates once, tells ops, no more checks`, async () => {
    const b = build();
    await expect(runAssignmentReminder(b.deps, job(ASSIGNMENT_REMINDER_MAX))).resolves.toBe('escalated');

    expect(b.push).toHaveBeenCalledTimes(1);
    expect(b.queue.add).not.toHaveBeenCalledWith(ASSIGNMENT_REMINDER_JOB, expect.anything(), expect.anything());
    const reason: string = b.prisma.escalation.create.mock.calls[0][0].data.triggered_reason;
    expect(reason.startsWith(NO_ANSWER_REASON_PREFIX)).toBe(true);
    expect(reason).toContain('INC-2026-000700');
    expect(reason).toContain('AMB-2');
    expect(reason).toContain('3 min');
    expect(b.realtime.notifyEscalation).toHaveBeenCalledWith('inc-1', expect.objectContaining({ escalationType: 'RESPONDER_NO_ANSWER' }));
    expect(b.queue.add).toHaveBeenCalledWith('no-answer-escalation', expect.objectContaining({ userId: 'sup-1', channel: 'PUSH' }));
  });

  it('a second silent crew member does not raise a second escalation', async () => {
    const b = build({ escalated: true });
    await expect(runAssignmentReminder(b.deps, job(ASSIGNMENT_REMINDER_MAX))).resolves.toBe('escalated');
    expect(b.prisma.escalation.create).not.toHaveBeenCalled();
  });

  it('a database error never throws (the dispatch stands)', async () => {
    const b = build();
    b.prisma.dispatches.findUnique.mockRejectedValue(new Error('db down'));
    await expect(runAssignmentReminder(b.deps, job(1))).resolves.toBe('skipped');
  });

  it('a malformed job is ignored', async () => {
    const b = build();
    await expect(runAssignmentReminder(b.deps, { userId: 'resp-a', dispatchId: 'disp-1', attempt: 0 })).resolves.toBe('skipped');
    await expect(runAssignmentReminder(b.deps, { dispatchId: 'disp-1', attempt: 1 })).resolves.toBe('skipped');
    expect(b.prisma.dispatches.findUnique).not.toHaveBeenCalled();
  });
});
