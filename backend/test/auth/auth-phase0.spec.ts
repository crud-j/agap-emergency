/**
 * Auth Phase 0 hardening — docs/plans/WEB_AUTH_SECURITY_PLAN.md §6.1.
 *
 * Uses a small in-memory fake of the Prisma tables involved so the tests
 * exercise the real query filters (type isolation, user binding, attempt limit)
 * rather than just asserting on mock calls.
 */
import { BadRequestException, UnauthorizedException } from '@nestjs/common';

// Real bcrypt, with compare wrapped so the timing-parity test can count calls.
jest.mock('bcryptjs', () => {
  const actual = jest.requireActual('bcryptjs');
  return { ...actual, compare: jest.fn(actual.compare) };
});

import * as bcrypt from 'bcryptjs';
import { AuthService } from '../../src/auth/auth.service';
import { AdministrationService } from '../../src/administration/administration.service';
import {
  PASSWORD,
  PASSWORD_HASH,
  Row,
  makeFakePrisma,
  makeFakeSessions,
  resetFakePrisma,
  makeAuthService,
  seedCode,
  seedUser,
  sha256,
} from './fake-prisma';


describe('AuthService — Phase 0 hardening', () => {
  let prisma: any;
  let smsQueue: { add: jest.Mock };
  let audit: { log: jest.Mock; logInTransaction: jest.Mock };
  let jwt: { sign: jest.Mock };
  let service: AuthService;
  let sessions: ReturnType<typeof makeFakeSessions>;

  beforeAll(() => {
    prisma = makeFakePrisma();
    smsQueue = { add: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn(), logInTransaction: jest.fn().mockResolvedValue(undefined) };
    jwt = { sign: jest.fn(() => `access-${Math.random()}`) };
    // Created once: the constructor computes a cost-12 dummy bcrypt hash.
    sessions = makeFakeSessions();
    service = makeAuthService(prisma, jwt as any, smsQueue as any, audit as any, sessions as any);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetFakePrisma(prisma);
    jest.spyOn(service, 'hashPassword').mockResolvedValue('new-password-hash');
  });

  // ── forgot / reset password (F1, F2, F6) ────────────────────────────────────

  describe('forgotPassword', () => {
    it('normalizes 09XX input, stores a hashed PASSWORD_RESET code and queues the SMS', async () => {
      const user = seedUser(prisma);
      const old = seedCode(prisma, user.id, '111111');

      await service.forgotPassword({ phoneNumber: '09171234001' });

      expect(old.status).toBe('EXPIRED');
      const created = prisma.db.verifications.find((v: Row) => v.id !== old.id);
      expect(created.verification_type).toBe('PASSWORD_RESET');
      expect(created.token).toMatch(/^[0-9a-f]{64}$/);

      const [, job] = smsQueue.add.mock.calls[0];
      expect(job.phone).toBe('+639171234001');
      const code = job.message.match(/\b(\d{6})\b/)[1];
      expect(created.token).toBe(sha256(code));
      expect(job.message.length).toBeLessThan(160);
    });

    it('returns the same generic message and sends nothing for unknown or deactivated accounts', async () => {
      seedUser(prisma, { phone_number: '+639171234002', status: 'DEACTIVATED' });

      const unknown = await service.forgotPassword({ phoneNumber: '09179999999' });
      const blocked = await service.forgotPassword({ phoneNumber: '09171234002' });

      expect(unknown).toEqual(blocked);
      expect(smsQueue.add).not.toHaveBeenCalled();
      expect(prisma.db.verifications).toHaveLength(0);
    });
  });

  describe('resetPassword', () => {
    const reset = (phoneNumber: string, token: string) =>
      service.resetPassword({ phoneNumber, token, newPassword: 'New-Password-123' });

    it('resets with the correct code, revokes sessions, audits, and the code cannot be reused', async () => {
      const user = seedUser(prisma);
      seedCode(prisma, user.id, '123456');
      prisma.db.sessions.push({ id: 's-1', user_id: user.id, is_revoked: false });

      await expect(reset('09171234001', '123456')).resolves.toEqual({ message: 'Password reset successful' });

      expect(user.password_hash).toBe('new-password-hash');
      expect(prisma.db.sessions[0].is_revoked).toBe(true);
      expect(sessions.markRevoked).toHaveBeenCalledWith(['s-1']);
      expect(audit.logInTransaction).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'PASSWORD_CHANGE', entityId: user.id }),
      );
      await expect(reset('09171234001', '123456')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a registration / login OTP (PHONE type) as a reset code', async () => {
      const user = seedUser(prisma);
      seedCode(prisma, user.id, '222222', { verification_type: 'PHONE', token: '222222' });
      seedCode(prisma, user.id, '222222', { verification_type: 'PHONE' });

      await expect(reset('09171234001', '222222')).rejects.toBeInstanceOf(BadRequestException);
      expect(user.password_hash).toBe(PASSWORD_HASH);
    });

    it("rejects user A's code when submitted for user B", async () => {
      const a = seedUser(prisma, { phone_number: '+639171234001' });
      const b = seedUser(prisma, { phone_number: '+639171234002' });
      seedCode(prisma, a.id, '333333');
      seedCode(prisma, b.id, '444444');

      await expect(reset('09171234002', '333333')).rejects.toBeInstanceOf(BadRequestException);
      expect(b.password_hash).toBe(PASSWORD_HASH);
    });

    it('expires the code after 5 wrong guesses — the correct code then fails too', async () => {
      const user = seedUser(prisma);
      const code = seedCode(prisma, user.id, '555555');

      for (let i = 0; i < 5; i++) {
        await expect(reset('09171234001', '000000')).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(code.status).toBe('EXPIRED');
      await expect(reset('09171234001', '555555')).rejects.toBeInstanceOf(BadRequestException);
      expect(user.password_hash).toBe(PASSWORD_HASH);
    });

    it('rejects an expired code', async () => {
      const user = seedUser(prisma);
      const code = seedCode(prisma, user.id, '666666', { expires_at: new Date(Date.now() - 1000) });

      await expect(reset('09171234001', '666666')).rejects.toBeInstanceOf(BadRequestException);
      expect(code.status).toBe('EXPIRED');
    });

    it('uses one error message for unknown account, wrong code and expired code', async () => {
      const user = seedUser(prisma);
      seedCode(prisma, user.id, '777777');

      const messages = await Promise.all([
        reset('09179999999', '777777').catch((e) => e.message),
        reset('09171234001', '000001').catch((e) => e.message),
      ]);
      expect(new Set(messages).size).toBe(1);
    });
  });

  // ── account status (F3) ─────────────────────────────────────────────────────

  describe('validateUser', () => {
    it.each(['SUSPENDED', 'DEACTIVATED'])('rejects a %s account even with the correct password', async (status) => {
      const user = seedUser(prisma, { email: 'd@mdrrmo.bocaue.gov.ph', status });

      await expect(service.validateUser('d@mdrrmo.bocaue.gov.ph', PASSWORD)).resolves.toBeNull();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LOGIN_FAILED',
          entityId: user.id,
          newValues: expect.objectContaining({ reason: 'ACCOUNT_BLOCKED' }),
        }),
      );
    });

    it('still lets PENDING_VERIFICATION accounts sign in (seeded staff have no explicit status)', async () => {
      seedUser(prisma, { email: 'staff@mdrrmo.bocaue.gov.ph', status: 'PENDING_VERIFICATION' });

      const result = await service.validateUser('staff@mdrrmo.bocaue.gov.ph', PASSWORD);
      expect(result).toEqual(expect.objectContaining({ email: 'staff@mdrrmo.bocaue.gov.ph' }));
      expect(result).not.toHaveProperty('password_hash');
    });

    it('runs bcrypt once for an unknown account (no timing shortcut) and does not record the identifier', async () => {
      await expect(service.validateUser('nobody@example.ph', 'whatever')).resolves.toBeNull();

      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
      const entry = audit.log.mock.calls[0][0];
      expect(entry.newValues.reason).toBe('UNKNOWN_ACCOUNT');
      expect(JSON.stringify(entry)).not.toContain('nobody@example.ph');
    });
  });

  describe('login', () => {
    it('records IP / user-agent on the session, updates last_login_at and audits LOGIN', async () => {
      const user = seedUser(prisma);

      await service.login(user as any, { ipAddress: '10.0.0.5', userAgent: 'Chrome' });

      expect(prisma.db.sessions[0]).toEqual(
        expect.objectContaining({
          ip_address: '10.0.0.5',
          device_info: { userAgent: 'Chrome', amr: ['pwd'], authTime: expect.any(Number) },
        }),
      );
      expect(user.last_login_at).toBeInstanceOf(Date);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LOGIN', actorId: user.id, newValues: { method: 'password', amr: ['pwd'] } }),
      );
    });

    it('does not fail the sign-in when last_login_at cannot be written', async () => {
      const user = seedUser(prisma);
      prisma.user.update.mockRejectedValueOnce(new Error('db hiccup'));

      await expect(service.login(user as any)).resolves.toHaveProperty('accessToken');
    });
  });

  describe('refreshToken', () => {
    it('rejects and revokes the session once the account is deactivated', async () => {
      const user = seedUser(prisma, { status: 'DEACTIVATED' });
      prisma.db.sessions.push({
        id: 's-1',
        user_id: user.id,
        refresh_token_hash: sha256('refresh-1'),
        is_revoked: false,
        expires_at: new Date(Date.now() + 60_000),
      });

      await expect(service.refreshToken('refresh-1')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.db.sessions[0].is_revoked).toBe(true);
      expect(sessions.markRevoked).toHaveBeenCalledWith(['s-1']);
    });
  });

  describe('phone OTP login', () => {
    it('cannot sign in — or re-activate — a deactivated account', async () => {
      const user = seedUser(prisma, { status: 'DEACTIVATED' });
      seedCode(prisma, user.id, '888888', { verification_type: 'PHONE', token: '888888' });

      await expect(service.verifyPhoneOtp('09171234001', '888888')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(user.status).toBe('DEACTIVATED');
    });

    it('does not send a login OTP to a deactivated account', async () => {
      seedUser(prisma, { status: 'DEACTIVATED' });

      await service.loginPhone('09171234001');
      expect(smsQueue.add).not.toHaveBeenCalled();
    });
  });
});

// ── session revocation on deactivation (F4) ───────────────────────────────────

describe('AdministrationService.deactivate', () => {
  it('revokes every active session and audits SESSION_REVOKED in the same transaction', async () => {
    const prisma = makeFakePrisma();
    const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined) };
    const user = seedUser(prisma);
    prisma.db.sessions.push(
      { id: 's-1', user_id: user.id, is_revoked: false },
      { id: 's-2', user_id: user.id, is_revoked: false },
      { id: 's-3', user_id: 'someone-else', is_revoked: false },
    );
    const sessions = makeFakeSessions();
    const service = new AdministrationService(prisma, audit as any, sessions as any);

    await service.deactivate(user.id, 'admin-1');

    expect(user.status).toBe('DEACTIVATED');
    expect(prisma.db.sessions.map((s: Row) => s.is_revoked)).toEqual([true, true, false]);
    expect(sessions.markRevoked).toHaveBeenCalledWith(['s-1', 's-2']);
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: 'SESSION_REVOKED',
        actorId: 'admin-1',
        entityId: user.id,
        newValues: { reason: 'ACCOUNT_DEACTIVATED', sessionsRevoked: 2 },
      }),
    );
  });
});
