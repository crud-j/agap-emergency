import { AuditService } from '../../src/audit/audit.service';

const mockPrisma = {
  auditLog: { findMany: jest.fn(), count: jest.fn() },
  user: { findMany: jest.fn() },
};

function whereOf(): Record<string, unknown> {
  return mockPrisma.auditLog.findMany.mock.calls[0][0].where;
}

describe('AuditService.findAll filters (Phase 5a)', () => {
  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.auditLog.count.mockResolvedValue(0);
    mockPrisma.user.findMany.mockResolvedValue([]);
    service = new AuditService(mockPrisma as any);
  });

  it('a single action filters exactly as before', async () => {
    await service.findAll({ action: 'LOGIN_FAILED' });
    expect(whereOf()).toEqual({ action: 'LOGIN_FAILED' });
  });

  it('a comma-separated list becomes an IN filter', async () => {
    await service.findAll({ action: 'LOGIN_FAILED, ACCOUNT_LOCKED,,ACCOUNT_UNLOCKED' });
    expect(whereOf()).toEqual({ action: { in: ['LOGIN_FAILED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED'] } });
  });

  it('no action means no action filter', async () => {
    await service.findAll({});
    expect(whereOf()).toEqual({});
  });

  it('matches the entity type regardless of case (writers differ)', async () => {
    await service.findAll({ entityType: 'incident' });
    expect(whereOf()).toEqual({ entity_type: { equals: 'incident', mode: 'insensitive' } });
  });

  it('filters by the affected account', async () => {
    await service.findAll({ entityId: 'user-9' });
    expect(whereOf()).toEqual({ entity_id: 'user-9' });
  });

  it('attaches the affected account name and role, without contact details', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: 'a1', action: 'LOGIN_FAILED', entity_type: 'user', entity_id: 'user-9', users: null },
      { id: 'a2', action: 'LOGIN_FAILED', entity_type: null, entity_id: null, users: null },
      { id: 'a3', action: 'UPDATE', entity_type: 'incident', entity_id: 'inc-1', users: null },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'user-9', full_name: 'Test Dispatcher', role: 'DISPATCHER' }]);

    const { data } = await service.findAll({});

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-9'] } },
      select: { id: true, full_name: true, role: true },
    });
    expect(data.map((r: any) => r.entity_user)).toEqual([
      { id: 'user-9', full_name: 'Test Dispatcher', role: 'DISPATCHER' },
      null,
      null,
    ]);
  });
});
