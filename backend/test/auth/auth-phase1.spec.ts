/**
 * Auth Phase 1 — session & token hardening (docs/plans/WEB_AUTH_SECURITY_PLAN.md §6.2)
 * plus the per-account password-reset caps.
 */
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { AgapGateway } from '../../src/realtime/agap.gateway';
import { REFRESH_COOKIE, refreshCookieOptions } from '../../src/auth/sessions/session-cookie';
import { makeAuthService, makeFakePrisma, makeFakeSessions, resetFakePrisma, seedCode, seedUser } from './fake-prisma';

const JWT_SECRET = 'test-secret';

function makeConfig(values: Record<string, string> = {}) {
  return { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) } as any;
}

function makeRes() {
  return { cookie: jest.fn(), clearCookie: jest.fn() } as any;
}

const webReq = (extra: Record<string, unknown> = {}) => ({ headers: { 'x-agap-client': 'web' }, ...extra });
const mobileReq = (extra: Record<string, unknown> = {}) => ({ headers: {}, ...extra });

// ── Controller: cookie vs body contract ──────────────────────────────────────────

describe('AuthController — web session cookie', () => {
  const sessionUser = {
    id: 'u-1',
    email: null,
    role: 'DISPATCHER',
    name: 'Juan',
    orgId: 'org-1',
    orgName: 'MDRRMO',
    mustChangePassword: false,
  };
  let authService: Record<string, jest.Mock>;
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      login: jest.fn(async () => ({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'u-1', role: 'DISPATCHER' } })),
      refreshToken: jest.fn(async () => ({ accessToken: 'access-2', refreshToken: 'refresh-2', userId: 'u-1' })),
      getSessionUser: jest.fn(async () => sessionUser),
      logout: jest.fn(async () => ({ message: 'Logged out' })),
    };
    const mfa = { evaluateLogin: jest.fn(async () => ({ kind: 'session', amr: ['pwd'] })) };
    controller = new AuthController(authService as any, {} as any, mfa as any, makeConfig({ NODE_ENV: 'production' }));
  });

  it('web login: refresh token only in an HttpOnly cookie, body has access token + user summary', async () => {
    const res = makeRes();
    const body = await controller.login(webReq({ user: { id: 'u-1' } }), res);

    expect(body).toEqual({ accessToken: 'access', user: sessionUser });
    expect(body).not.toHaveProperty('refreshToken');
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_COOKIE,
      'refresh',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 }),
    );
  });

  it('mobile login: response unchanged, no cookie', async () => {
    const res = makeRes();
    const body = await controller.login(mobileReq({ user: { id: 'u-1' } }), res);

    expect(body).toEqual({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'u-1', role: 'DISPATCHER' } });
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('web refresh: reads the cookie, rotates it, returns access token + user', async () => {
    const res = makeRes();
    const body = await controller.refresh({}, webReq({ cookies: { [REFRESH_COOKIE]: 'refresh' } }), res);

    expect(authService.refreshToken).toHaveBeenCalledWith('refresh');
    expect(body).toEqual({ accessToken: 'access-2', user: sessionUser });
    expect(res.cookie).toHaveBeenCalledWith(REFRESH_COOKIE, 'refresh-2', expect.objectContaining({ httpOnly: true }));
  });

  it('ignores the cookie without the X-AGAP-Client header (CSRF guard) — mobile body token only', async () => {
    const res = makeRes();
    await expect(
      controller.refresh({}, mobileReq({ cookies: { [REFRESH_COOKIE]: 'refresh' } }), res),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authService.refreshToken).not.toHaveBeenCalled();

    const body = await controller.refresh({ refreshToken: 'mobile-refresh' }, mobileReq(), res);
    expect(authService.refreshToken).toHaveBeenCalledWith('mobile-refresh');
    expect(body).toEqual({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('web refresh failure clears the dead cookie', async () => {
    authService['refreshToken']!.mockRejectedValueOnce(new UnauthorizedException());
    const res = makeRes();

    await expect(
      controller.refresh({}, webReq({ cookies: { [REFRESH_COOKIE]: 'stale' } }), res),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, expect.objectContaining({ path: '/' }));
  });

  it('web logout ends the session by sid + cookie and clears the cookie', async () => {
    const res = makeRes();
    await controller.logout(
      webReq({ user: { id: 'u-1', sid: 'sess-1' }, cookies: { [REFRESH_COOKIE]: 'refresh' } }),
      res,
      {},
      'Bearer access',
    );

    expect(authService.logout).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', sessionId: 'sess-1', refreshToken: 'refresh' }),
      expect.anything(),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, expect.anything());
  });

  it('cookie is Secure in production, not in dev, and COOKIE_SECURE overrides', () => {
    expect(refreshCookieOptions(makeConfig({ NODE_ENV: 'production' })).secure).toBe(true);
    expect(refreshCookieOptions(makeConfig({ NODE_ENV: 'development' })).secure).toBe(false);
    expect(refreshCookieOptions(makeConfig({ NODE_ENV: 'development', COOKIE_SECURE: 'true' })).secure).toBe(true);
    expect(refreshCookieOptions(makeConfig({ COOKIE_DOMAIN: 'agap.example' })).domain).toBe('agap.example');
  });
});

// ── Service: sid, in-place rotation, logout, reset caps ──────────────────────────

describe('AuthService — sessions', () => {
  const jwt = new JwtService({ secret: JWT_SECRET, signOptions: { expiresIn: '15m' } });
  let prisma: any;
  let sessions: ReturnType<typeof makeFakeSessions>;
  let audit: { log: jest.Mock; logInTransaction: jest.Mock };
  let smsQueue: { add: jest.Mock };
  let service: AuthService;

  beforeAll(() => {
    prisma = makeFakePrisma();
    sessions = makeFakeSessions();
    audit = { log: jest.fn(), logInTransaction: jest.fn().mockResolvedValue(undefined) };
    smsQueue = { add: jest.fn().mockResolvedValue(undefined) };
    service = makeAuthService(prisma, jwt, smsQueue as any, audit as any, sessions as any);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resetFakePrisma(prisma);
    jest.spyOn(service, 'hashPassword').mockResolvedValue('new-password-hash');
  });

  it('login: the access token carries the session row id as sid', async () => {
    const user = seedUser(prisma);
    const { accessToken } = await service.login(user as any);

    expect(jwt.decode(accessToken)).toEqual(expect.objectContaining({ sub: user.id, sid: prisma.db.sessions[0].id }));
  });

  it('refresh rotates in place: same session id, new refresh token, old token rejected', async () => {
    const user = seedUser(prisma);
    const first = await service.login(user as any);
    const sid = prisma.db.sessions[0].id;

    const second = await service.refreshToken(first.refreshToken);

    expect(prisma.db.sessions).toHaveLength(1);
    expect(prisma.db.sessions[0].id).toBe(sid);
    expect(jwt.decode(second.accessToken)).toEqual(expect.objectContaining({ sid }));
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(service.refreshToken(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.refreshToken(second.refreshToken)).resolves.toHaveProperty('accessToken');
  });

  it('two concurrent refreshes with the same token: exactly one wins', async () => {
    const user = seedUser(prisma);
    const { refreshToken } = await service.login(user as any);

    const results = await Promise.allSettled([service.refreshToken(refreshToken), service.refreshToken(refreshToken)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('logout by sid ends only that session and publishes the revocation', async () => {
    const user = seedUser(prisma);
    await service.login(user as any);
    await service.login(user as any);
    const [a, b] = prisma.db.sessions;

    await service.logout({ userId: user.id, sessionId: a.id });

    expect(a.is_revoked).toBe(true);
    expect(b.is_revoked).toBe(false);
    expect(sessions.markRevoked).toHaveBeenCalledWith([a.id]);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGOUT', actorId: user.id }));
  });

  it('logout with a refresh token alone (expired access token) still ends the session', async () => {
    const user = seedUser(prisma);
    const { refreshToken } = await service.login(user as any);

    await service.logout({ refreshToken });

    expect(prisma.db.sessions[0].is_revoked).toBe(true);
  });

  it('logout cannot end another user\'s session', async () => {
    const owner = seedUser(prisma);
    const other = seedUser(prisma, { phone_number: '+639171234099' });
    await service.login(owner as any);

    await service.logout({ userId: other.id, sessionId: prisma.db.sessions[0].id });

    expect(prisma.db.sessions[0].is_revoked).toBe(false);
  });

  it('getSessionUser returns the summary with the first active organization', async () => {
    seedUser(prisma, {
      email: 'd1@mdrrmo.bocaue.gov.ph',
      organization_memberships: [{ organizations: { id: 'org-1', name: 'Bocaue MDRRMO' } }],
    });

    await expect(service.getSessionUser('u-1')).resolves.toEqual({
      id: 'u-1',
      email: 'd1@mdrrmo.bocaue.gov.ph',
      role: 'DISPATCHER',
      name: 'Juan dela Cruz',
      orgId: 'org-1',
      orgName: 'Bocaue MDRRMO',
      mustChangePassword: false,
    });
  });

  describe('password reset — per-account caps', () => {
    it('issues at most 3 reset codes per account per hour', async () => {
      seedUser(prisma);

      for (let i = 0; i < 4; i++) await service.forgotPassword({ phoneNumber: '09171234001' });

      expect(smsQueue.add).toHaveBeenCalledTimes(3);
      expect(prisma.db.verifications).toHaveLength(3);
    });

    it('caps wrong guesses per account across codes — a fresh code does not buy fresh guesses', async () => {
      const user = seedUser(prisma);
      // Two earlier codes already burned 10 guesses this hour.
      seedCode(prisma, user.id, '111111', { status: 'EXPIRED', attempt_count: 5 });
      seedCode(prisma, user.id, '222222', { status: 'EXPIRED', attempt_count: 5 });
      const fresh = seedCode(prisma, user.id, '333333');

      await expect(
        service.resetPassword({ phoneNumber: '09171234001', token: '333333', newPassword: 'New-Password-123' }),
      ).rejects.toThrow('Invalid or expired reset code');
      expect(fresh.status).toBe('EXPIRED');
      expect(user.password_hash).not.toBe('new-password-hash');
    });

    it('guesses older than the window do not count', async () => {
      const user = seedUser(prisma);
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      seedCode(prisma, user.id, '111111', { status: 'EXPIRED', attempt_count: 5, created_at: twoHoursAgo });
      seedCode(prisma, user.id, '222222', { status: 'EXPIRED', attempt_count: 5, created_at: twoHoursAgo });
      seedCode(prisma, user.id, '333333');

      await expect(
        service.resetPassword({ phoneNumber: '09171234001', token: '333333', newPassword: 'New-Password-123' }),
      ).resolves.toEqual({ message: 'Password reset successful' });
    });
  });

  it('reset password publishes revocation of every session of the account', async () => {
    const user = seedUser(prisma);
    await service.login(user as any);
    await service.login(user as any);
    seedCode(prisma, user.id, '444444');

    await service.resetPassword({ phoneNumber: '09171234001', token: '444444', newPassword: 'New-Password-123' });

    expect(sessions.markRevoked).toHaveBeenCalledWith(prisma.db.sessions.map((s: any) => s.id));
    expect(prisma.db.sessions.every((s: any) => s.is_revoked)).toBe(true);
  });
});

// ── Access-token revocation: REST + WebSocket ────────────────────────────────────

describe('JwtStrategy', () => {
  it('rejects a token whose session was revoked and passes sid through otherwise', async () => {
    const sessions = makeFakeSessions();
    const config = { getOrThrow: jest.fn(() => JWT_SECRET) };
    const strategy = new JwtStrategy(config as any, sessions as any);
    const payload = { sub: 'u-1', role: 'DISPATCHER', sid: 'sess-1' };

    sessions.isRevoked.mockResolvedValueOnce(true);
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);

    sessions.isRevoked.mockResolvedValueOnce(false);
    await expect(strategy.validate(payload)).resolves.toEqual({
      id: 'u-1',
      email: undefined,
      role: 'DISPATCHER',
      sid: 'sess-1',
    });
  });
});

describe('AgapGateway — session revocation', () => {
  const jwt = new JwtService({ secret: JWT_SECRET });
  const token = jwt.sign({ sub: 'u-1', role: 'DISPATCHER', sid: 'sess-1' });

  beforeAll(() => {
    process.env['JWT_SECRET'] = JWT_SECRET;
  });

  function makeClient() {
    return { id: 'c-1', handshake: { auth: { token }, headers: {} }, data: {}, join: jest.fn(), disconnect: jest.fn() } as any;
  }

  it('refuses a connection for a revoked session', async () => {
    const sessions = makeFakeSessions();
    sessions.isRevoked.mockResolvedValueOnce(true);
    const gateway = new AgapGateway(jwt, {} as any, sessions as any);
    const client = makeClient();

    await gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('joins the session room, and drops it when the session is revoked', async () => {
    const sessions = makeFakeSessions();
    let listener: ((ids: string[]) => void) | undefined;
    sessions.onRevoked.mockImplementation(((fn: (ids: string[]) => void) => {
      listener = fn;
      return () => undefined;
    }) as any);
    const gateway = new AgapGateway(jwt, {} as any, sessions as any);
    const disconnectSockets = jest.fn();
    gateway.server = { in: jest.fn(() => ({ disconnectSockets })) } as any;
    gateway.afterInit();
    const client = makeClient();

    await gateway.handleConnection(client);
    expect(client.join).toHaveBeenCalledWith('session:sess-1');

    listener!(['sess-1']);
    expect(gateway.server.in).toHaveBeenCalledWith('session:sess-1');
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });
});
