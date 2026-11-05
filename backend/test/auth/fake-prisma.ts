/**
 * Small in-memory fake of the Prisma tables the auth flows touch, so auth tests
 * exercise the real query filters (type isolation, user binding, attempt limits,
 * conditional rotation) rather than asserting on mock calls.
 */
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AuthService } from '../../src/auth/auth.service';
import { LoginLockoutService } from '../../src/auth/lockout/login-lockout.service';
import { TrustedDeviceService } from '../../src/auth/mfa/trusted-device.service';
import { SessionRevocationService } from '../../src/auth/sessions/session-revocation.service';

export type Row = Record<string, any>;

export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
export const PASSWORD = 'Correct-Horse-1';
export const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

function compare(value: unknown, cond: unknown): boolean {
  const toNum = (v: unknown) => (v instanceof Date ? v.getTime() : (v as number));
  if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
    const c = cond as Row;
    if ('in' in c) return (c['in'] as unknown[]).includes(value);
    if ('not' in c) return !compare(value, c['not']);
    if ('lt' in c) return toNum(value) < toNum(c['lt']);
    if ('gt' in c) return toNum(value) > toNum(c['gt']);
    if ('gte' in c) return toNum(value) >= toNum(c['gte']);
  }
  return value === cond;
}

export function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((branch) => matches(row, branch));
    if (key === 'AND') return (cond as Row[]).every((branch) => matches(row, branch));
    return compare(row[key], cond);
  });
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) row[key] += value.increment;
    else row[key] = value;
  }
}

function table(rows: Row[], prefix: string, defaults: Row = {}) {
  let seq = 0;
  return {
    findUnique: jest.fn(async ({ where }: any) => {
      const row = rows.find((r) => matches(r, where));
      return row ? { ...row } : null;
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      const found = rows.filter((r) => matches(r, where));
      found.sort((a, b) => b.created_at - a.created_at);
      return found[0] ? { ...found[0] } : null;
    }),
    findMany: jest.fn(async ({ where }: any = {}) => rows.filter((r) => matches(r, where)).map((r) => ({ ...r }))),
    count: jest.fn(async ({ where }: any = {}) => rows.filter((r) => matches(r, where)).length),
    aggregate: jest.fn(async ({ where, _sum }: any) => {
      const found = rows.filter((r) => matches(r, where));
      const sums: Row = {};
      for (const key of Object.keys(_sum ?? {})) {
        sums[key] = found.length ? found.reduce((acc, r) => acc + (r[key] ?? 0), 0) : null;
      }
      return { _sum: sums };
    }),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: `${prefix}-${++seq}`, created_at: Date.now() + seq, ...defaults, ...data };
      rows.push(row);
      return { ...row };
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = rows.find((r) => matches(r, where))!;
      applyData(row, data);
      return { ...row };
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const found = rows.filter((r) => matches(r, where));
      found.forEach((r) => applyData(r, data));
      return { count: found.length };
    }),
    createMany: jest.fn(async ({ data }: any) => {
      for (const item of data) rows.push({ id: `${prefix}-${++seq}`, created_at: Date.now() + seq, ...defaults, ...item });
      return { count: data.length };
    }),
    deleteMany: jest.fn(async ({ where }: any = {}) => {
      const keep = rows.filter((r) => !matches(r, where));
      const count = rows.length - keep.length;
      rows.length = 0;
      rows.push(...keep);
      return { count };
    }),
  };
}

export function makeFakePrisma() {
  const db = {
    users: [] as Row[],
    verifications: [] as Row[],
    sessions: [] as Row[],
    totp: [] as Row[],
    backupCodes: [] as Row[],
    trusted: [] as Row[],
    passkeys: [] as Row[],
  };
  const users = table(db.users, 'u');
  const sessions = table(db.sessions, 's', { is_revoked: false });

  const prisma: any = {
    db,
    user: {
      ...users,
      findUnique: jest.fn(async ({ where, select }: any) => {
        const row = db.users.find((u) => matches(u, where));
        if (!row) return null;
        return select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row };
      }),
    },
    user_verifications: table(db.verifications, 'v', { attempt_count: 0 }),
    user_sessions: {
      ...sessions,
      findUnique: jest.fn(async ({ where, include }: any) => {
        const row = db.sessions.find((s) => matches(s, where));
        if (!row) return null;
        return include?.users ? { ...row, users: db.users.find((u) => u.id === row.user_id) } : { ...row };
      }),
    },
    user_mfa_totp: table(db.totp, 'totp', { confirmed_at: null, last_used_step: null }),
    user_backup_codes: table(db.backupCodes, 'bc', { used_at: null }),
    trusted_devices: table(db.trusted, 'td', { revoked_at: null, last_used_at: null }),
    webauthn_credentials: table(db.passkeys, 'pk', { is_active: true }),
    account_lifecycle_events: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  return prisma;
}

export function resetFakePrisma(prisma: any) {
  prisma.db.users.length = 0;
  prisma.db.verifications.length = 0;
  prisma.db.sessions.length = 0;
  prisma.db.totp.length = 0;
  prisma.db.backupCodes.length = 0;
  prisma.db.trusted.length = 0;
  prisma.db.passkeys.length = 0;
}

/**
 * AuthService with the real lockout and trusted-device services over the fake database.
 * `config` and `idVerification` matter only to register() (PhilHealth ID verification).
 */
export function makeAuthService(
  prisma: any,
  jwt: any,
  smsQueue: any,
  audit: any,
  sessions: any,
  config: any = { get: () => undefined },
  idVerification: any = undefined,
): AuthService {
  return new AuthService(
    prisma,
    jwt,
    smsQueue,
    audit,
    sessions,
    new LoginLockoutService(prisma, audit, smsQueue),
    new TrustedDeviceService(prisma),
    config,
    idVerification,
  );
}

export function seedUser(prisma: any, overrides: Row = {}): Row {
  const user = {
    id: `u-${prisma.db.users.length + 1}`,
    email: null,
    full_name: 'Juan dela Cruz',
    phone_number: '+639171234001',
    password_hash: PASSWORD_HASH,
    role: 'DISPATCHER',
    status: 'ACTIVE',
    is_guest: false,
    must_change_password: false,
    password_changed_at: null,
    failed_login_count: 0,
    lockout_level: 0,
    locked_until: null,
    organization_memberships: [],
    ...overrides,
  };
  prisma.db.users.push(user);
  return user;
}

export function seedCode(prisma: any, userId: string, code: string, overrides: Row = {}): Row {
  const row = {
    id: `v-seed-${prisma.db.verifications.length + 1}`,
    user_id: userId,
    verification_type: 'PASSWORD_RESET',
    token: sha256(code),
    status: 'PENDING',
    attempt_count: 0,
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    created_at: Date.now(),
    ...overrides,
  };
  prisma.db.verifications.push(row);
  return row;
}

/**
 * SessionRevocationService without Redis: the real DB-side revokeAllForUser, with
 * markRevoked / isRevoked as mocks.
 */
export function makeFakeSessions() {
  return {
    markRevoked: jest.fn().mockResolvedValue(undefined),
    isRevoked: jest.fn().mockResolvedValue(false),
    onRevoked: jest.fn(() => () => undefined),
    revokeAllForUser: SessionRevocationService.prototype.revokeAllForUser,
  };
}
