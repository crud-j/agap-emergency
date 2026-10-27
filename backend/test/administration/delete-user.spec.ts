import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { AdministrationService } from '../../src/administration/administration.service';

const ADMIN_ID = uuidv4();
const USER_ID = uuidv4();

describe('AdministrationService.deleteUser — audit rows stay intact (MOD-46, MOD-49)', () => {
  const prisma = {
    user: { findUnique: jest.fn(), delete: jest.fn() },
    auditLog: { count: jest.fn() },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AdministrationService(prisma as any, audit as any, {} as any, {} as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    prisma.auditLog.count.mockResolvedValue(0);
    prisma.user.delete.mockResolvedValue({ id: USER_ID });
  });

  it('deletes an account with no history and audits the delete', async () => {
    await service.deleteUser(USER_ID, ADMIN_ID);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: USER_ID } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DELETE', actorId: ADMIN_ID, entityType: 'user', entityId: USER_ID, moduleId: 'MOD-49',
    }));
  });

  it('refuses an account with audit history (deactivate instead)', async () => {
    prisma.auditLog.count.mockResolvedValue(3);
    await expect(service.deleteUser(USER_ID, ADMIN_ID)).rejects.toThrow(/Deactivate it instead/);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('turns a foreign-key refusal into a clear 409', async () => {
    prisma.user.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }),
    );
    await expect(service.deleteUser(USER_ID, ADMIN_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('refuses to delete your own account', async () => {
    await expect(service.deleteUser(ADMIN_ID, ADMIN_ID)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AdministrationService.changeRole (MOD-49)', () => {
  function build() {
    const tx = {
      user: { update: jest.fn().mockResolvedValue({ id: USER_ID, role: 'SUPERVISOR' }) },
      account_lifecycle_events: { create: jest.fn() },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: USER_ID, role: 'DISPATCHER', status: 'ACTIVE' }) },
      $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    };
    const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined) };
    const sessions = { revokeAllForUser: jest.fn().mockResolvedValue(['s1', 's2']), markRevoked: jest.fn() };
    const service = new AdministrationService(prisma as any, audit as any, sessions as any, {} as any, {} as any);
    return { service, tx, audit, sessions };
  }

  it('changes the role, ends every session and audits old → new', async () => {
    const { service, tx, audit, sessions } = build();
    await service.changeRole(USER_ID, 'SUPERVISOR', ADMIN_ID);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: USER_ID }, data: { role: 'SUPERVISOR' } });
    expect(sessions.markRevoked).toHaveBeenCalledWith(['s1', 's2']);
    expect(audit.logInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      moduleId: 'MOD-49', oldValues: { role: 'DISPATCHER' }, newValues: { role: 'SUPERVISOR', sessionsRevoked: 2 },
    }));
  });

  it('refuses to change your own role', async () => {
    const { service, tx } = build();
    await expect(service.changeRole(ADMIN_ID, 'CITIZEN', ADMIN_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('does nothing when the role is unchanged', async () => {
    const { service, tx, sessions } = build();
    await service.changeRole(USER_ID, 'DISPATCHER', ADMIN_ID);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
  });
});
