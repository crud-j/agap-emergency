import { findEscalationRecipients } from '../../src/jobs/escalation-recipients';

/** Fake `user.findMany` over a small staff list, honouring the role and status filters. */
function makePrisma(staff: { id: string; role: string; status: string }[]) {
  const findMany = jest.fn(({ where }: any) =>
    Promise.resolve(
      staff
        .filter((u) => where.role.in.includes(u.role) && !where.status.notIn.includes(u.status))
        .map((u) => ({ id: u.id, full_name: null })),
    ),
  );
  return { prisma: { user: { findMany } } as any, findMany };
}

describe('findEscalationRecipients (Phase 5b, decision D5)', () => {
  it('notifies Supervisors who can sign in, including PENDING_VERIFICATION staff', async () => {
    const { prisma } = makePrisma([
      { id: 'sup-active', role: 'SUPERVISOR', status: 'ACTIVE' },
      { id: 'sup-seeded', role: 'SUPERVISOR', status: 'PENDING_VERIFICATION' },
      { id: 'sup-suspended', role: 'SUPERVISOR', status: 'SUSPENDED' },
      { id: 'sup-gone', role: 'SUPERVISOR', status: 'DEACTIVATED' },
      { id: 'disp', role: 'DISPATCHER', status: 'ACTIVE' },
      { id: 'admin', role: 'SYSTEM_ADMINISTRATOR', status: 'ACTIVE' },
    ]);
    const ids = (await findEscalationRecipients(prisma, ['SUPERVISOR'])).map((r) => r.id);
    expect(ids).toEqual(['sup-active', 'sup-seeded']);
  });

  it('falls back to Dispatchers when no Supervisor can be reached', async () => {
    const { prisma } = makePrisma([
      { id: 'sup-suspended', role: 'SUPERVISOR', status: 'SUSPENDED' },
      { id: 'disp', role: 'DISPATCHER', status: 'PENDING_VERIFICATION' },
      { id: 'admin', role: 'SYSTEM_ADMINISTRATOR', status: 'ACTIVE' },
    ]);
    const ids = (await findEscalationRecipients(prisma, ['SUPERVISOR'])).map((r) => r.id);
    expect(ids).toEqual(['disp']);
  });

  it('does not query twice when the roles already are the fallback', async () => {
    const { prisma, findMany } = makePrisma([]);
    await expect(findEscalationRecipients(prisma, ['DISPATCHER'])).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('never notifies the System Administrator', async () => {
    const { prisma } = makePrisma([{ id: 'admin', role: 'SYSTEM_ADMINISTRATOR', status: 'ACTIVE' }]);
    await expect(findEscalationRecipients(prisma, ['SUPERVISOR'])).resolves.toEqual([]);
  });
});
