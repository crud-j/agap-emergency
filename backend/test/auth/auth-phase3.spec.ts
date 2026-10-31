import { HttpException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { authenticator } from 'otplib';
import { randomBytes } from 'crypto';
import { AuthService } from '../../src/auth/auth.service';
import { open, parseEncryptionKey, seal } from '../../src/common/crypto/secret-box';
import { LOCKOUT_MINUTES, LOCKOUT_THRESHOLD, LoginLockoutService } from '../../src/auth/lockout/login-lockout.service';
import { BackupCodesService, normalizeBackupCode } from '../../src/auth/mfa/backup-codes.service';
import { MfaService } from '../../src/auth/mfa/mfa.service';
import { MfaStateStore } from '../../src/auth/mfa/mfa-state.store';
import { MfaTokenService } from '../../src/auth/mfa/mfa-token.service';
import { TotpService } from '../../src/auth/mfa/totp.service';
import { TrustedDeviceService, describeUserAgent } from '../../src/auth/mfa/trusted-device.service';
import { authContextFromRequest } from '../../src/auth/request-context';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import {
  makeAuthService,
  makeFakePrisma,
  makeFakeSessions,
  PASSWORD,
  resetFakePrisma,
  seedUser,
} from './fake-prisma';

const JWT_SECRET = 'phase3-test-secret';
const KEY = randomBytes(32).toString('base64');
const IP = '10.0.0.5';
const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 Safari/537.36';

function makeConfig(env: Record<string, string | undefined> = {}) {
  const all: Record<string, string | undefined> = { JWT_SECRET, MFA_ENCRYPTION_KEY: KEY, ...env };
  return {
    get: (key: string, fallback?: string) => all[key] ?? fallback,
    getOrThrow: (key: string) => {
      const value = all[key];
      if (value === undefined) throw new Error(`missing ${key}`);
      return value;
    },
  } as any;
}

const currentCode = (secret: string) => authenticator.clone({ digits: 6, step: 30, window: 1 }).generate(secret);

/** The whole Phase 3 stack over the in-memory fake database. */
function buildStack(env: Record<string, string | undefined> = {}) {
  const prisma = makeFakePrisma();
  const jwt = new JwtService({ secret: JWT_SECRET, signOptions: { expiresIn: '15m' } });
  const smsQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const audit = { log: jest.fn(), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const sessions = makeFakeSessions();
  const config = makeConfig(env);
  const auth: AuthService = makeAuthService(prisma, jwt, smsQueue, audit, sessions);
  jest.spyOn(auth, 'hashPassword').mockResolvedValue('new-password-hash');
  const lockout = new LoginLockoutService(prisma, audit as any, smsQueue as any);
  const trusted = new TrustedDeviceService(prisma);
  const totp = new TotpService(prisma, config);
  const backup = new BackupCodesService(prisma);
  const store = MfaStateStore.inMemory();
  const tokens = new MfaTokenService(jwt, config, store);
  const webAuthn = {
    beginAuthenticationForUser: jest.fn(async () => ({ challengeId: 'c-1', options: {} })),
    completeAuthentication: jest.fn(),
  };
  const mfa = new MfaService(
    prisma,
    config,
    audit as any,
    auth,
    webAuthn as any,
    totp,
    backup,
    trusted,
    tokens,
    lockout,
    smsQueue as any,
  );
  return { prisma, jwt, smsQueue, audit, sessions, config, auth, lockout, trusted, totp, backup, tokens, webAuthn, mfa, store };
}

type Stack = ReturnType<typeof buildStack>;

/** Enroll TOTP the way a user would and return the plaintext seed. */
async function enrollTotp(s: Stack, userId: string): Promise<string> {
  const { secret } = await s.totp.startEnrollment(userId, 'dispatcher@example.com');
  expect(await s.totp.confirmEnrollment(userId, currentCode(secret))).toBe(true);
  return secret;
}

describe('secret-box', () => {
  const key = parseEncryptionKey(KEY)!;

  it('round-trips and never stores the plaintext', () => {
    const sealed = seal('JBSWY3DPEHPK3PXP', key, 'user-1');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(open(sealed, key, 'user-1')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('refuses another owner, another key, and tampered ciphertext', () => {
    const sealed = seal('secret', key, 'user-1');
    expect(() => open(sealed, key, 'user-2')).toThrow();
    expect(() => open(sealed, randomBytes(32), 'user-1')).toThrow();
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => open(parts.join('.'), key, 'user-1')).toThrow();
  });

  it('parses MFA_ENCRYPTION_KEY: blank → null, wrong length → error', () => {
    expect(parseEncryptionKey(undefined)).toBeNull();
    expect(parseEncryptionKey('  ')).toBeNull();
    expect(() => parseEncryptionKey(randomBytes(16).toString('base64'))).toThrow('32 bytes');
  });
});

describe('TotpService', () => {
  let s: Stack;
  let userId: string;

  beforeEach(() => {
    s = buildStack();
    userId = seedUser(s.prisma).id;
  });
  afterEach(() => jest.restoreAllMocks());

  it('stores the seed sealed, not in plaintext, and builds an otpauth URL + QR', async () => {
    const result = await s.totp.startEnrollment(userId, 'juan@example.com');
    expect(result.otpauthUrl).toMatch(/^otpauth:\/\/totp\/AGAP%20Bocaue:juan%40example\.com\?secret=/);
    expect(result.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    const stored = s.prisma.db.totp[0].secret_encrypted as string;
    expect(stored).not.toContain(result.secret);
    expect(open(stored, parseEncryptionKey(KEY)!, userId)).toBe(result.secret);
  });

  it('is not enrolled until the first code is confirmed', async () => {
    const { secret } = await s.totp.startEnrollment(userId, 'x');
    expect(await s.totp.isEnrolled(userId)).toBe(false);
    expect(await s.totp.verify(userId, currentCode(secret))).toBe(false); // unconfirmed seeds can't sign in
    expect(await s.totp.confirmEnrollment(userId, '000000')).toBe(false);
    expect(await s.totp.confirmEnrollment(userId, currentCode(secret))).toBe(true);
    expect(await s.totp.isEnrolled(userId)).toBe(true);
  });

  it('refuses to start a second enrollment over a confirmed authenticator', async () => {
    await enrollTotp(s, userId);
    await expect(s.totp.startEnrollment(userId, 'x')).rejects.toThrow('already set up');
  });

  it('accepts one code once: the same time step cannot be replayed', async () => {
    const secret = await enrollTotp(s, userId); // confirming consumed this step
    expect(await s.totp.verify(userId, currentCode(secret))).toBe(false);

    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 30_000);
    const next = currentCode(secret);
    expect(await s.totp.verify(userId, next)).toBe(true);
    expect(await s.totp.verify(userId, next)).toBe(false); // replay
  });

  it('allows one step of clock drift but rejects older codes and earlier steps', async () => {
    const secret = await enrollTotp(s, userId);
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now');

    spy.mockReturnValue(now + 60_000);
    const twoStepsAgo = currentCode(secret); // generated "now"
    spy.mockReturnValue(now + 120_000);
    expect(await s.totp.verify(userId, twoStepsAgo)).toBe(false); // 2 steps stale

    spy.mockReturnValue(now + 90_000);
    const oneStepAhead = currentCode(secret);
    spy.mockReturnValue(now + 60_000);
    expect(await s.totp.verify(userId, oneStepAhead)).toBe(true); // +1 step is inside the window
    // …but a code from an earlier step than the one just used is a replay.
    spy.mockReturnValue(now + 30_000);
    expect(await s.totp.verify(userId, currentCode(secret))).toBe(false);
  });

  it('rejects malformed codes and a seed copied onto another account', async () => {
    const secret = await enrollTotp(s, userId);
    expect(await s.totp.verify(userId, 'abcdef')).toBe(false);
    expect(await s.totp.verify(userId, '12345')).toBe(false);

    const other = seedUser(s.prisma, { phone_number: '+639171234002' });
    s.prisma.db.totp.push({ ...s.prisma.db.totp[0], id: 'copy', user_id: other.id });
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 30_000);
    expect(await s.totp.verify(other.id, currentCode(secret))).toBe(false);
  });

  it('reports itself unconfigured without MFA_ENCRYPTION_KEY and refuses enrollment', async () => {
    const bare = buildStack({ MFA_ENCRYPTION_KEY: '' });
    const id = seedUser(bare.prisma).id;
    expect(bare.totp.isConfigured()).toBe(false);
    await expect(bare.totp.startEnrollment(id, 'x')).rejects.toThrow('not configured');
  });
});

describe('BackupCodesService', () => {
  let s: Stack;
  let userId: string;

  beforeEach(() => {
    s = buildStack();
    userId = seedUser(s.prisma).id;
  });

  it('generates 10 xxxxx-xxxxx codes and stores only hashes', async () => {
    const codes = await s.backup.regenerate(userId);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    expect(s.prisma.db.backupCodes).toHaveLength(10);
    for (const row of s.prisma.db.backupCodes) {
      expect(row.code_hash).toMatch(/^\$2[aby]\$10\$/);
      expect(codes.join(' ')).not.toContain(row.code_hash);
    }
    expect(await s.backup.remaining(userId)).toBe(10);
  });

  it('is single use, tolerant of case/spacing, and counts down', async () => {
    const [first, second] = await s.backup.regenerate(userId);
    expect(await s.backup.verifyAndConsume(userId, first!.toUpperCase())).toBe(true);
    expect(await s.backup.verifyAndConsume(userId, first!)).toBe(false); // used
    expect(await s.backup.verifyAndConsume(userId, second!.replace('-', ' '))).toBe(true);
    expect(await s.backup.remaining(userId)).toBe(8);
  });

  it('rejects wrong, malformed and other users’ codes', async () => {
    const [code] = await s.backup.regenerate(userId);
    const other = seedUser(s.prisma, { phone_number: '+639171234002' }).id;
    expect(await s.backup.verifyAndConsume(userId, 'aaaaa-aaaaa')).toBe(false);
    expect(await s.backup.verifyAndConsume(userId, 'short')).toBe(false);
    expect(await s.backup.verifyAndConsume(other, code!)).toBe(false);
  });

  it('regenerating invalidates the previous set', async () => {
    const [oldCode] = await s.backup.regenerate(userId);
    await s.backup.regenerate(userId);
    expect(await s.backup.verifyAndConsume(userId, oldCode!)).toBe(false);
    expect(s.prisma.db.backupCodes).toHaveLength(10);
  });

  it('normalizes input the way users type it', () => {
    expect(normalizeBackupCode('ABCDE-fghjk')).toBe('abcdefghjk');
    expect(normalizeBackupCode('abcde fghjk')).toBe('abcdefghjk');
    expect(normalizeBackupCode('abcde-fghj0')).toBeNull(); // 0 and 1 aren't in the alphabet
  });
});

describe('Account lockout', () => {
  let s: Stack;

  beforeEach(() => {
    s = buildStack();
  });
  afterEach(() => jest.restoreAllMocks());

  const wrong = (identifier: string, times: number) =>
    Array.from({ length: times }).reduce<Promise<unknown>>(
      (chain) => chain.then(() => s.auth.validateUser(identifier, 'not-the-password', { ipAddress: IP })),
      Promise.resolve(),
    );

  it('locks for 15 minutes at the fifth failure, audits it, and texts the holder', async () => {
    const user = seedUser(s.prisma, { email: 'd@example.com' });
    await wrong('d@example.com', LOCKOUT_THRESHOLD - 1);
    expect(user.locked_until ?? null).toBeNull();
    expect(user.failed_login_count).toBe(LOCKOUT_THRESHOLD - 1);

    await wrong('d@example.com', 1);
    const minutes = (user.locked_until.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);
    expect(user.failed_login_count).toBe(0);
    expect(user.lockout_level).toBe(1);
    expect(s.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCOUNT_LOCKED', entityId: user.id, newValues: { durationMinutes: 15, level: 1 } }),
    );
    expect(s.smsQueue.add).toHaveBeenCalledWith(
      'otp-sms',
      expect.objectContaining({ phone: user.phone_number, message: expect.stringContaining('locked') }),
    );
  });

  it('escalates 15 → 30 → 60 minutes and caps at 60', async () => {
    const user = seedUser(s.prisma, { email: 'd@example.com' });
    const durations: number[] = [];
    for (let round = 0; round < 4; round++) {
      user.locked_until = null; // previous lock served
      await wrong('d@example.com', LOCKOUT_THRESHOLD);
      durations.push(Math.round((user.locked_until.getTime() - Date.now()) / 60_000));
    }
    expect(durations).toEqual([15, 30, 60, 60]);
    expect(LOCKOUT_MINUTES).toEqual([15, 30, 60]);
  });

  it('only discloses the lock once the password is right (423), and wrong guesses stay a plain 401', async () => {
    const user = seedUser(s.prisma, { email: 'd@example.com' });
    await wrong('d@example.com', LOCKOUT_THRESHOLD);

    expect(await s.auth.validateUser('d@example.com', 'still-wrong', { ipAddress: IP })).toBeNull();
    expect(user.failed_login_count).toBe(0); // no more counting while locked

    await expect(s.auth.validateUser('d@example.com', PASSWORD, { ipAddress: IP })).rejects.toMatchObject({
      status: 423,
      response: expect.objectContaining({ code: 'ACCOUNT_LOCKED', message: expect.stringMatching(/Try again in \d+ min/) }),
    });
    expect(s.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_FAILED', newValues: { reason: 'ACCOUNT_LOCKED', method: 'password' } }),
    );
  });

  it('lets the right password in again once the lock has run out', async () => {
    const user = seedUser(s.prisma, { email: 'd@example.com' });
    await wrong('d@example.com', LOCKOUT_THRESHOLD);
    user.locked_until = new Date(Date.now() - 1000);
    expect(await s.auth.validateUser('d@example.com', PASSWORD, { ipAddress: IP })).toMatchObject({ id: user.id });
  });

  it('exempts a trusted browser: outside guessing cannot lock a dispatcher out of their own console', async () => {
    const user = seedUser(s.prisma, { email: 'd@example.com' });
    const other = seedUser(s.prisma, { email: 'o@example.com', phone_number: '+639171234002' });
    const mine = await s.trusted.create(user.id, { ipAddress: IP, userAgent: UA });
    const theirs = await s.trusted.create(other.id, { ipAddress: IP, userAgent: UA });
    await wrong('d@example.com', LOCKOUT_THRESHOLD);

    expect(await s.auth.validateUser('d@example.com', PASSWORD, { trustedDeviceToken: mine.token })).toMatchObject({
      id: user.id,
    });
    // Someone else's trusted cookie, a garbage cookie, and no cookie all stay locked out.
    for (const trustedDeviceToken of [theirs.token, 'garbage', undefined]) {
      await expect(
        s.auth.validateUser('d@example.com', PASSWORD, { trustedDeviceToken }),
      ).rejects.toBeInstanceOf(HttpException);
    }
  });

  it('never locks citizens, bystanders or responders', async () => {
    for (const role of ['CITIZEN', 'BYSTANDER', 'RESPONDER']) {
      const user = seedUser(s.prisma, { role, email: `${role}@example.com`, phone_number: `+6391700${role.length}` });
      await wrong(user.email, LOCKOUT_THRESHOLD * 2);
      expect(user.locked_until ?? null).toBeNull();
      expect(user.failed_login_count ?? 0).toBe(0);
      expect(await s.auth.validateUser(user.email, PASSWORD)).toMatchObject({ id: user.id });
    }
  });

  it('clears the counter and lock level on a completed sign-in', async () => {
    const user = seedUser(s.prisma, { failed_login_count: 3, lockout_level: 2, locked_until: null });
    await s.auth.login(user as any, { ipAddress: IP });
    expect(user.failed_login_count).toBe(0);
    expect(user.lockout_level).toBe(0);
    expect(user.locked_until).toBeNull();
  });

  it('does not reveal unknown accounts and does not throw on bookkeeping errors', async () => {
    expect(await s.auth.validateUser('nobody@example.com', 'x')).toBeNull();
    const user = seedUser(s.prisma, { email: 'd@example.com' });
    s.prisma.user.update.mockRejectedValueOnce(new Error('db down'));
    expect(await s.auth.validateUser('d@example.com', 'wrong')).toBeNull();
    expect(user.id).toBeDefined();
  });
});

describe('MfaTokenService', () => {
  let s: Stack;

  beforeEach(() => {
    s = buildStack();
  });

  it('issues a short-lived token that verifies for its purpose only', async () => {
    const token = await s.tokens.issue('u-1', 'mfa');
    expect(await s.tokens.verify(token, 'mfa')).toMatchObject({ userId: 'u-1', purpose: 'mfa' });
    await expect(s.tokens.verify(token, 'mfa-enroll')).rejects.toBeInstanceOf(UnauthorizedException);
    const decoded = s.jwt.decode(token) as { exp: number; iat: number };
    expect(decoded.exp - decoded.iat).toBe(300);
  });

  it('is single use', async () => {
    const token = await s.tokens.issue('u-1', 'mfa');
    const claims = await s.tokens.verify(token, 'mfa');
    await s.tokens.consume(claims.jti);
    await expect(s.tokens.verify(token, 'mfa')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('dies after five wrong codes', async () => {
    const token = await s.tokens.issue('u-1', 'mfa');
    const { jti } = await s.tokens.verify(token, 'mfa');
    for (let i = 1; i < 5; i++) expect(await s.tokens.recordFailure(jti)).toBe(false);
    expect(await s.tokens.recordFailure(jti)).toBe(true);
    await expect(s.tokens.verify(token, 'mfa')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('is never interchangeable with an access token', async () => {
    const mfaToken = await s.tokens.issue('u-1', 'mfa');
    // It does not verify under the access-token key…
    expect(() => s.jwt.verify(mfaToken, { secret: JWT_SECRET })).toThrow();
    // …an access token does not verify as an MFA token…
    const access = s.jwt.sign({ sub: 'u-1', role: 'DISPATCHER' });
    await expect(s.tokens.verify(access, 'mfa')).rejects.toBeInstanceOf(UnauthorizedException);
    // …and the JWT strategy refuses anything carrying a purpose claim.
    const strategy = new JwtStrategy(makeConfig(), s.sessions as any);
    await expect(strategy.validate({ sub: 'u-1', role: 'DISPATCHER', purpose: 'mfa' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token whose id was never stored (forged, or lost with the store)', async () => {
    const forged = s.jwt.sign(
      { sub: 'u-1', purpose: 'mfa', jti: 'unknown' },
      { secret: (s.tokens as any).secret, expiresIn: 300 },
    );
    await expect(s.tokens.verify(forged, 'mfa')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('MfaService — login decision', () => {
  let s: Stack;

  beforeEach(() => {
    s = buildStack();
  });

  it('leaves citizens, bystanders and responders alone', async () => {
    for (const role of ['CITIZEN', 'BYSTANDER', 'RESPONDER']) {
      const user = seedUser(s.prisma, { role });
      expect(await s.mfa.evaluateLogin(user)).toEqual({ kind: 'session', amr: ['pwd'] });
    }
  });

  it('skips the second step while MFA is not enforced and the user has not enrolled', async () => {
    const user = seedUser(s.prisma);
    expect(await s.mfa.evaluateLogin(user)).toEqual({ kind: 'session', amr: ['pwd'] });
  });

  it('forces enrollment when enforced and nothing is enrolled', async () => {
    const e = buildStack({ AUTH_MFA_ENFORCED: 'true' });
    const user = seedUser(e.prisma);
    const decision = await e.mfa.evaluateLogin(user);
    expect(decision).toMatchObject({ kind: 'challenge', challenge: { mfaRequired: true, enrollmentRequired: true, methods: [] } });
    if (decision.kind === 'challenge') {
      expect(await e.tokens.verify(decision.challenge.mfaToken, 'mfa-enroll')).toMatchObject({ userId: user.id });
    }
  });

  it('asks enrolled users for a second step, listing only what they have', async () => {
    const user = seedUser(s.prisma);
    await enrollTotp(s, user.id);
    let decision = await s.mfa.evaluateLogin(user);
    expect(decision.kind === 'challenge' && decision.challenge.methods).toEqual(['totp']);

    await s.backup.regenerate(user.id);
    s.prisma.db.passkeys.push({ id: 'pk-1', user_id: user.id, is_active: true });
    decision = await s.mfa.evaluateLogin(user);
    expect(decision.kind === 'challenge' && decision.challenge.methods).toEqual(['passkey', 'totp', 'backup_code']);
    expect(decision.kind === 'challenge' && decision.challenge.enrollmentRequired).toBe(false);
    if (decision.kind === 'challenge') {
      expect(await s.tokens.verify(decision.challenge.mfaToken, 'mfa')).toMatchObject({ userId: user.id });
    }
  });

  it('offers SMS only when the flag is on and a phone is on file', async () => {
    const user = seedUser(s.prisma);
    await enrollTotp(s, user.id);
    const on = buildStack({ AUTH_SMS_MFA_ENABLED: 'true' });
    const smsUser = seedUser(on.prisma);
    await enrollTotp(on, smsUser.id);
    const withSms = await on.mfa.evaluateLogin(smsUser);
    expect(withSms.kind === 'challenge' && withSms.challenge.methods).toContain('sms');
    const withoutPhone = await on.mfa.evaluateLogin({ ...smsUser, phone_number: null });
    expect(withoutPhone.kind === 'challenge' && withoutPhone.challenge.methods).not.toContain('sms');
    const off = await s.mfa.evaluateLogin(user);
    expect(off.kind === 'challenge' && off.challenge.methods).not.toContain('sms');
  });

  it('skips the second step on a trusted browser — but only that user’s', async () => {
    const user = seedUser(s.prisma);
    const other = seedUser(s.prisma, { phone_number: '+639171234002' });
    await enrollTotp(s, user.id);
    const mine = await s.trusted.create(user.id, { userAgent: UA });
    const theirs = await s.trusted.create(other.id, { userAgent: UA });

    expect(await s.mfa.evaluateLogin(user, { trustedDeviceToken: mine.token })).toEqual({ kind: 'session', amr: ['pwd'] });
    for (const trustedDeviceToken of [theirs.token, 'garbage']) {
      expect((await s.mfa.evaluateLogin(user, { trustedDeviceToken })).kind).toBe('challenge');
    }
  });

  it('never trusts an expired or revoked browser', async () => {
    const user = seedUser(s.prisma);
    await enrollTotp(s, user.id);
    const { token } = await s.trusted.create(user.id, { userAgent: UA });
    s.prisma.db.trusted[0].expires_at = new Date(Date.now() - 1000);
    expect(await s.trusted.isTrusted(user.id, token)).toBe(false);
    s.prisma.db.trusted[0].expires_at = new Date(Date.now() + 60_000);
    expect(await s.trusted.isTrusted(user.id, token)).toBe(true);
    s.prisma.db.trusted[0].revoked_at = new Date();
    expect(await s.trusted.isTrusted(user.id, token)).toBe(false);
  });
});

describe('MfaService — second step', () => {
  let s: Stack;
  let user: any;
  let secret: string;
  let backupCodes: string[];
  const ctx = { ipAddress: IP, userAgent: UA };

  async function challenge(): Promise<string> {
    const decision = await s.mfa.evaluateLogin(user, ctx);
    if (decision.kind !== 'challenge') throw new Error('expected a challenge');
    return decision.challenge.mfaToken;
  }

  /** A code the TOTP window accepts that isn't the step enrollment already used. */
  function nextCode(): string {
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 30_000);
    return currentCode(secret);
  }

  beforeEach(async () => {
    s = buildStack();
    user = seedUser(s.prisma, { email: 'd@example.com' });
    secret = await enrollTotp(s, user.id);
    backupCodes = await s.backup.regenerate(user.id);
  });
  afterEach(() => jest.restoreAllMocks());

  it('a good authenticator code returns a session whose token records amr + auth_time', async () => {
    const mfaToken = await challenge();
    const { session, trusted } = await s.mfa.verify({ mfaToken, method: 'totp', code: nextCode() }, ctx);
    expect(trusted).toBeNull();
    const claims = s.jwt.decode(session.accessToken) as any;
    expect(claims).toMatchObject({ sub: user.id, role: 'DISPATCHER', amr: ['pwd', 'otp'] });
    expect(claims.auth_time).toBeGreaterThan(0);
    expect(s.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN', newValues: { method: 'password', amr: ['pwd', 'otp'] } }),
    );
    expect(JSON.stringify(session)).not.toContain('password_hash');
  });

  it('the mfaToken works once', async () => {
    const mfaToken = await challenge();
    await s.mfa.verify({ mfaToken, method: 'totp', code: nextCode() }, ctx);
    await expect(
      s.mfa.verify({ mfaToken, method: 'backup_code', code: backupCodes[0]! }, ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('trusting the browser issues a token that then skips the second step', async () => {
    const mfaToken = await challenge();
    const { trusted } = await s.mfa.verify({ mfaToken, method: 'totp', code: nextCode(), trustDevice: true }, ctx);
    expect(trusted?.token).toBeDefined();
    expect(s.prisma.db.trusted[0]).toMatchObject({ user_id: user.id, label: 'Chrome on Windows' });
    expect(s.prisma.db.trusted[0].token_hash).not.toBe(trusted!.token);
    const next = await s.mfa.evaluateLogin(user, { trustedDeviceToken: trusted!.token });
    expect(next).toEqual({ kind: 'session', amr: ['pwd'] });
  });

  it('a backup code signs in once and is then burned', async () => {
    const first = await s.mfa.verify({ mfaToken: await challenge(), method: 'backup_code', code: backupCodes[0]! }, ctx);
    expect((s.jwt.decode(first.session.accessToken) as any).amr).toEqual(['pwd', 'otp']);
    await expect(
      s.mfa.verify({ mfaToken: await challenge(), method: 'backup_code', code: backupCodes[0]! }, ctx),
    ).rejects.toThrow('not valid');
  });

  it('wrong codes are refused, audited, and count toward the account lock', async () => {
    const mfaToken = await challenge();
    await expect(s.mfa.verify({ mfaToken, method: 'totp', code: '000000' }, ctx)).rejects.toThrow('not valid');
    expect(user.failed_login_count).toBe(1);
    expect(s.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_FAILED', newValues: { reason: 'MFA_FAILED', method: 'totp' } }),
    );
  });

  it('five wrong codes kill the mfaToken — even the right code afterwards fails', async () => {
    const mfaToken = await challenge();
    for (let i = 0; i < 4; i++) {
      await expect(s.mfa.verify({ mfaToken, method: 'totp', code: '000000' }, ctx)).rejects.toThrow('not valid');
    }
    await expect(s.mfa.verify({ mfaToken, method: 'totp', code: '000000' }, ctx)).rejects.toThrow('Too many');
    await expect(s.mfa.verify({ mfaToken, method: 'totp', code: nextCode() }, ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('refuses the second step on a locked account, and for suspended accounts', async () => {
    const mfaToken = await challenge();
    user.locked_until = new Date(Date.now() + 10 * 60_000);
    await expect(s.mfa.verify({ mfaToken, method: 'totp', code: nextCode() }, ctx)).rejects.toMatchObject({ status: 423 });
    user.locked_until = null;
    user.status = 'SUSPENDED';
    await expect(s.mfa.verify({ mfaToken, method: 'totp', code: nextCode() }, ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('SMS: refused unless enabled; sends a hashed 5-minute code; five misses burn it', async () => {
    await expect(s.mfa.sendSmsCode(await challenge())).rejects.toThrow('not enabled');

    const on = buildStack({ AUTH_SMS_MFA_ENABLED: 'true' });
    const smsUser = seedUser(on.prisma, { email: 'sms@example.com' });
    await enrollTotp(on, smsUser.id);
    const decision = await on.mfa.evaluateLogin(smsUser, ctx);
    const mfaToken = decision.kind === 'challenge' ? decision.challenge.mfaToken : '';

    await on.mfa.sendSmsCode(mfaToken);
    const sent = on.smsQueue.add.mock.calls.at(-1)![1] as { phone: string; message: string };
    const code = /code is (\d{6})/.exec(sent.message)![1]!;
    expect(sent.phone).toBe(smsUser.phone_number);
    const row = on.prisma.db.verifications[0];
    expect(row).toMatchObject({ verification_type: 'MFA_SMS', status: 'PENDING' });
    expect(row.token).not.toBe(code); // stored hashed
    expect(row.expires_at.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);

    for (let i = 0; i < 5; i++) {
      await expect(on.mfa.verify({ mfaToken, method: 'sms', code: '000000' }, ctx)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    expect(row.status).toBe('EXPIRED');
  });

  it('SMS: the right code signs in once', async () => {
    const on = buildStack({ AUTH_SMS_MFA_ENABLED: 'true' });
    const smsUser = seedUser(on.prisma, { email: 'sms@example.com' });
    await enrollTotp(on, smsUser.id);
    const decision = await on.mfa.evaluateLogin(smsUser, ctx);
    const mfaToken = decision.kind === 'challenge' ? decision.challenge.mfaToken : '';
    await on.mfa.sendSmsCode(mfaToken);
    const code = /code is (\d{6})/.exec((on.smsQueue.add.mock.calls.at(-1)![1] as any).message)![1]!;

    const { session } = await on.mfa.verify({ mfaToken, method: 'sms', code }, ctx);
    expect((on.jwt.decode(session.accessToken) as any).amr).toEqual(['pwd', 'sms']);
    await expect(on.mfa.verify({ mfaToken, method: 'sms', code }, ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('passkey: only the signed-in-by-password user’s own passkey completes it, with amr pwd+hwk', async () => {
    s.webAuthn.completeAuthentication.mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: user.id },
    });
    const mfaToken = await challenge();
    const { session } = await s.mfa.passkeyComplete({ mfaToken, challengeId: 'c-1', response: { id: 'x' } }, ctx);
    expect(session.user.id).toBe(user.id);
    expect(s.webAuthn.completeAuthentication).toHaveBeenCalledWith('c-1', { id: 'x' }, IP, UA, {
      expectedUserId: user.id,
      amr: ['pwd', 'hwk'],
    });
    await expect(
      s.mfa.passkeyComplete({ mfaToken, challengeId: 'c-1', response: { id: 'x' } }, ctx),
    ).rejects.toBeInstanceOf(UnauthorizedException); // mfaToken was consumed
  });

  it('passkey: a failed ceremony counts against the lock and the mfaToken', async () => {
    s.webAuthn.completeAuthentication.mockRejectedValue(new UnauthorizedException('Passkey verification failed'));
    const mfaToken = await challenge();
    await expect(
      s.mfa.passkeyComplete({ mfaToken, challengeId: 'c-1', response: {} }, ctx),
    ).rejects.toThrow('Passkey verification failed');
    expect(user.failed_login_count).toBe(1);
    await s.mfa.passkeyBegin(mfaToken, ctx);
    expect(s.webAuthn.beginAuthenticationForUser).toHaveBeenCalledWith(user.id, IP, UA, undefined);
  });
});

describe('MfaService — forced enrollment and management', () => {
  let s: Stack;
  let user: any;
  const ctx = { ipAddress: IP, userAgent: UA };

  beforeEach(() => {
    s = buildStack({ AUTH_MFA_ENFORCED: 'true' });
    user = seedUser(s.prisma, { email: 'd@example.com' });
  });
  afterEach(() => jest.restoreAllMocks());

  async function enrollmentToken(): Promise<string> {
    const decision = await s.mfa.evaluateLogin(user, ctx);
    if (decision.kind !== 'challenge') throw new Error('expected enrollment');
    return decision.challenge.mfaToken;
  }

  it('first sign-in: enroll → confirm → backup codes + session, in one flow', async () => {
    const mfaToken = await enrollmentToken();
    const principal = await s.mfa.resolvePrincipal(undefined, mfaToken);
    const { secret } = await s.mfa.startTotpEnrollment(principal);

    const result = await s.mfa.confirmTotp(principal, currentCode(secret), ctx);
    expect(result.backupCodes).toHaveLength(10);
    expect(result.session).not.toBeNull();
    expect((s.jwt.decode(result.session!.accessToken) as any).amr).toEqual(['pwd', 'otp']);
    expect(s.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MFA_CHANGE', newValues: { change: 'TOTP_ENROLLED' } }),
    );
    await expect(s.mfa.resolvePrincipal(undefined, mfaToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('a wrong confirmation code is counted and does not enroll', async () => {
    const principal = await s.mfa.resolvePrincipal(undefined, await enrollmentToken());
    await s.mfa.startTotpEnrollment(principal);
    await expect(s.mfa.confirmTotp(principal, '000000', ctx)).rejects.toThrow('not valid');
    expect(await s.totp.isEnrolled(user.id)).toBe(false);
    expect(user.failed_login_count).toBe(1);
  });

  it('a normal second-step token cannot be used to enroll', async () => {
    const plain = buildStack();
    const enrolled = seedUser(plain.prisma);
    await enrollTotp(plain, enrolled.id);
    const decision = await plain.mfa.evaluateLogin(enrolled, ctx);
    const mfaToken = decision.kind === 'challenge' ? decision.challenge.mfaToken : '';
    await expect(plain.mfa.resolvePrincipal(undefined, mfaToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(plain.mfa.resolvePrincipal(undefined, undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('a signed-in user enrolls without a token and gets no new session', async () => {
    const principal = await s.mfa.resolvePrincipal({ id: user.id }, undefined);
    const { secret } = await s.mfa.startTotpEnrollment(principal);
    const result = await s.mfa.confirmTotp(principal, currentCode(secret), ctx);
    expect(result.session).toBeNull();
    expect(result.backupCodes).toHaveLength(10);
  });

  it('regenerating codes and removing the app re-ask for the password; wrong guesses count', async () => {
    await enrollTotp(s, user.id);
    await expect(s.mfa.regenerateBackupCodes(user.id, 'wrong', ctx)).rejects.toThrow('Password is incorrect');
    expect(user.failed_login_count).toBe(1);

    const { backupCodes } = await s.mfa.regenerateBackupCodes(user.id, PASSWORD, ctx);
    expect(backupCodes).toHaveLength(10);
    await expect(s.mfa.removeTotp(user.id, 'wrong', ctx)).rejects.toThrow('Password is incorrect');
  });

  it('refuses to remove the last factor when MFA is enforced, but allows it once a passkey exists', async () => {
    await enrollTotp(s, user.id);
    await expect(s.mfa.removeTotp(user.id, PASSWORD, ctx)).rejects.toThrow('only second factor');

    s.prisma.db.passkeys.push({ id: 'pk-1', user_id: user.id, is_active: true });
    await s.trusted.create(user.id, { userAgent: UA });
    await s.backup.regenerate(user.id);
    await s.mfa.removeTotp(user.id, PASSWORD, ctx);
    expect(await s.totp.isEnrolled(user.id)).toBe(false);
    expect(s.prisma.db.backupCodes).toHaveLength(0);
    expect(s.prisma.db.trusted[0].revoked_at).toBeInstanceOf(Date);
    expect(s.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MFA_CHANGE', newValues: { change: 'TOTP_REMOVED' } }),
    );
  });

  it('status reports factors, remaining codes, and which trusted browser is this one', async () => {
    await enrollTotp(s, user.id);
    await s.backup.regenerate(user.id);
    const here = await s.trusted.create(user.id, { userAgent: UA });
    await s.trusted.create(user.id, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Firefox/120.0' });

    const status = await s.mfa.status(user.id, here.token);
    expect(status).toMatchObject({ totp: true, passkeys: 0, backupCodesRemaining: 10, backupCodesLow: false, enforced: true });
    expect(status.trustedDevices).toHaveLength(2);
    expect(status.trustedDevices.filter((d) => d.current)).toHaveLength(1);
    expect(JSON.stringify(status)).not.toContain(here.token);

    // Three left is the point where the UI starts warning.
    s.prisma.db.backupCodes.slice(0, 7).forEach((row: any) => (row.used_at = new Date()));
    const low = await s.mfa.status(user.id);
    expect(low.backupCodesRemaining).toBe(3);
    expect(low.backupCodesLow).toBe(true);
  });

  it('lets a user stop trusting a browser — their own only', async () => {
    const other = seedUser(s.prisma, { phone_number: '+639171234002' });
    await s.trusted.create(user.id, { userAgent: UA });
    await s.trusted.create(other.id, { userAgent: UA });
    const [mine, theirs] = s.prisma.db.trusted;
    await expect(s.mfa.revokeTrustedDevice(user.id, theirs.id, ctx)).rejects.toThrow('not found');
    await s.mfa.revokeTrustedDevice(user.id, mine.id, ctx);
    expect(mine.revoked_at).toBeInstanceOf(Date);
    expect(theirs.revoked_at).toBeNull();
  });
});

describe('Phase 3 session and password integration', () => {
  let s: Stack;
  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    s = buildStack();
  });

  it('a refreshed access token keeps the original amr and auth_time', async () => {
    const user = seedUser(s.prisma, { email: 'd@example.com' });
    const { accessToken, refreshToken } = await s.auth.login(user as any, { ipAddress: IP }, 'password', ['pwd', 'otp']);
    const before = s.jwt.decode(accessToken) as any;

    // The auth service signs with its own JwtService; rotate the session and compare claims.
    const refreshed = await s.auth.refreshToken(refreshToken);
    const after = s.jwt.decode(refreshed.accessToken) as any;
    expect(after.amr).toEqual(['pwd', 'otp']);
    expect(after.auth_time).toBe(before.auth_time);
    expect(after.sid).toBe(before.sid);
  });

  it('a password change ends every trusted browser', async () => {
    const user = seedUser(s.prisma, { email: 'd@example.com' });
    await s.trusted.create(user.id, { userAgent: UA });
    await s.trusted.create(user.id, { userAgent: UA });
    await s.auth.changePassword(user.id, { currentPassword: PASSWORD, newPassword: 'harbor-lantern-sunrise-42' });
    expect(s.prisma.db.trusted.every((d: any) => d.revoked_at instanceof Date)).toBe(true);
  });

  it('login never returns a password hash, even when handed a whole user row', async () => {
    const user = seedUser(s.prisma);
    const result = await s.auth.login({ ...user, password_hash: 'secret-hash' } as any);
    expect(JSON.stringify(result)).not.toContain('secret-hash');
  });

  it('the trusted cookie reaches the auth context; other cookies and garbage do not', () => {
    expect(authContextFromRequest({ ip: IP, cookies: { agap_trusted: 'abc' } }).trustedDeviceToken).toBe('abc');
    expect(authContextFromRequest({ ip: IP, cookies: { other: 'abc' } }).trustedDeviceToken).toBeUndefined();
    expect(authContextFromRequest({ ip: IP, cookies: { agap_trusted: ['x'] } }).trustedDeviceToken).toBeUndefined();
    expect(authContextFromRequest({ ip: IP }).trustedDeviceToken).toBeUndefined();
  });

  it('labels trusted browsers readably', () => {
    expect(describeUserAgent(UA)).toBe('Chrome on Windows');
    expect(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Firefox/120.0')).toBe('Firefox on macOS');
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0) Edg/126.0 Chrome/126.0')).toBe('Edge on Windows');
    expect(describeUserAgent(undefined)).toBe('Unknown browser');
  });
});
