import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { dictionary } from '@zxcvbn-ts/language-common';
import { AuthService } from '../../src/auth/auth.service';
import { assertPasswordPolicy } from '../../src/auth/password-policy';
import {
  PASSWORD_CHANGE_ALLOWED_KEY,
  PasswordChangeGuard,
} from '../../src/auth/guards/password-change.guard';
import { IS_PUBLIC_KEY } from '../../src/common/decorators/public.decorator';
import { makeAuthService, makeFakePrisma, makeFakeSessions, PASSWORD, resetFakePrisma, seedUser } from './fake-prisma';

const JWT_SECRET = 'phase2-test-secret';

describe('Phase 2 password policy', () => {
  it('requires 12 to 128 characters without imposing composition rules', () => {
    expect(() => assertPasswordPolicy('short', {})).toThrow('at least 12');
    expect(() => assertPasswordPolicy('a'.repeat(129), {})).toThrow('no more than 128');
    expect(() => assertPasswordPolicy('mangroveriverland', {})).not.toThrow();
  });

  it('rejects passwords containing account details or AGAP/Bocaue', () => {
    expect(() => assertPasswordPolicy('JuanDelaCruzHarbor2026', { name: 'Juan dela Cruz' })).toThrow();
    expect(() => assertPasswordPolicy('dispatcher1Harbor2026', { email: 'dispatcher1@example.com' })).toThrow();
    expect(() => assertPasswordPolicy('AGAPHarbor20262026', {})).toThrow();
    expect(() => assertPasswordPolicy('BocaueHarbor20262026', {})).toThrow();
  });

  it('rejects entries from the first 10,000 ranked common passwords', () => {
    const commonPassword = dictionary['passwords-common']
      .slice(0, 10_000)
      .find((password) => Array.from(password).length >= 12);
    expect(commonPassword).toBeDefined();
    expect(() => assertPasswordPolicy(commonPassword!, {})).toThrow('commonly used');
  });
});

describe('Phase 2 password-change guard', () => {
  const jwt = new JwtService({ secret: JWT_SECRET });

  function makeGuard(publicRoute = false, allowedRoute = false) {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === IS_PUBLIC_KEY) return publicRoute;
        if (key === PASSWORD_CHANGE_ALLOWED_KEY) return allowedRoute;
        return false;
      }),
    };
    return new PasswordChangeGuard(jwt, reflector as any);
  }

  function context(authorization?: string, kind = 'http') {
    return {
      getType: () => kind,
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
    } as any;
  }

  it('blocks forced-change tokens on protected HTTP routes', async () => {
    const token = jwt.sign({ sub: 'user-1', pwc: true });
    await expect(makeGuard().canActivate(context(`Bearer ${token}`))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows public routes, the password-change/logout exceptions, and ordinary sessions', async () => {
    const forcedToken = jwt.sign({ sub: 'user-1', pwc: true });
    const ordinaryToken = jwt.sign({ sub: 'user-2' });

    await expect(makeGuard(true).canActivate(context(`Bearer ${forcedToken}`))).resolves.toBe(true);
    await expect(makeGuard(false, true).canActivate(context(`Bearer ${forcedToken}`))).resolves.toBe(true);
    await expect(makeGuard().canActivate(context(`Bearer ${ordinaryToken}`))).resolves.toBe(true);
    await expect(makeGuard().canActivate(context(undefined, 'ws'))).resolves.toBe(true);
  });

  it('leaves malformed and expired tokens for the existing JWT guard to reject', async () => {
    await expect(makeGuard().canActivate(context('Bearer invalid-token'))).resolves.toBe(true);
  });
});

describe('Phase 2 password sessions', () => {
  const jwt = new JwtService({ secret: JWT_SECRET, signOptions: { expiresIn: '15m' } });
  let prisma: any;
  let sessions: ReturnType<typeof makeFakeSessions>;
  let audit: { log: jest.Mock; logInTransaction: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = makeFakePrisma();
    resetFakePrisma(prisma);
    sessions = makeFakeSessions();
    audit = { log: jest.fn(), logInTransaction: jest.fn().mockResolvedValue(undefined) };
    service = makeAuthService(
      prisma,
      jwt,
      { add: jest.fn().mockResolvedValue(undefined) } as any,
      audit as any,
      sessions as any,
    );
    jest.spyOn(service, 'hashPassword').mockResolvedValue('new-password-hash');
  });

  it('adds the forced-change claim for flagged staff and preserves responder mobile user shape', async () => {
    const responder = seedUser(prisma, {
      role: 'RESPONDER',
      must_change_password: false,
    });
    const staff = seedUser(prisma, {
      email: 'dispatcher@example.com',
      must_change_password: true,
    });
    const mobileSafeUser = {
      id: responder.id,
      email: responder.email,
      role: responder.role,
      must_change_password: responder.must_change_password,
    };
    const webSafeUser = {
      id: staff.id,
      email: staff.email,
      role: staff.role,
      must_change_password: staff.must_change_password,
    };

    const mobile = await service.login(mobileSafeUser);
    const web = await service.login(webSafeUser);

    expect(jwt.decode(mobile.accessToken)).not.toHaveProperty('pwc');
    expect(mobile.user).not.toHaveProperty('must_change_password');
    expect(jwt.decode(web.accessToken)).toHaveProperty('pwc', true);
    expect(web.user).not.toHaveProperty('must_change_password');
  });

  it('distinguishes password suffixes beyond bcrypt’s 72-byte limit and accepts legacy hashes', async () => {
    jest.spyOn(service, 'hashPassword').mockRestore();
    const longPassword = `${'a'.repeat(72)}A`;
    const user = seedUser(prisma, {
      email: 'long-password@example.com',
      password_hash: await service.hashPassword(longPassword),
    });

    await expect(service.validateUser(user.email, longPassword)).resolves.not.toBeNull();
    await expect(service.validateUser(user.email, `${'a'.repeat(72)}B`)).resolves.toBeNull();

    const legacyUser = seedUser(prisma, { email: 'legacy-password@example.com' });
    await expect(service.validateUser(legacyUser.email, PASSWORD)).resolves.not.toBeNull();
  });

  it('clears the forced-change flag, preserves the current session, revokes others, and audits the change', async () => {
    const user = seedUser(prisma, {
      email: 'juan@example.com',
      must_change_password: true,
    });
    prisma.db.sessions.push(
      { id: 'current-session', user_id: user.id, is_revoked: false },
      { id: 'other-session', user_id: user.id, is_revoked: false },
    );

    await service.changePassword(
      user.id,
      { currentPassword: PASSWORD, newPassword: 'CedarRiverMoss731' },
      'current-session',
    );

    expect(user.must_change_password).toBe(false);
    expect(user.password_changed_at).toBeInstanceOf(Date);
    expect(prisma.db.sessions.map((session: any) => session.is_revoked)).toEqual([false, true]);
    expect(sessions.markRevoked).toHaveBeenCalledWith(['other-session']);
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ action: 'PASSWORD_CHANGE', entityId: user.id }),
    );
  });
});
