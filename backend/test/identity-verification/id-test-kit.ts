/**
 * Test kit for PhilHealth ID verification (MOD-01, plan §5): an in-memory database with the
 * tables registration and scans touch (transactions roll back, the one-ID-per-account partial
 * index is enforced), in-memory object storage, and stub OCR / config. Invented names and
 * fake PINs only.
 */
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { AuditService } from '../../src/audit/audit.service';
import { AuthService } from '../../src/auth/auth.service';
import { IdDocumentCryptoService } from '../../src/identity-verification/id-document-crypto.service';
import { IdentityVerificationService } from '../../src/identity-verification/identity-verification.service';
import type { OcrResult } from '../../src/identity-verification/philhealth-ocr.service';
import { makeAuthService, makeFakeSessions, matches, type Row } from '../auth/fake-prisma';

export const KEY = crypto.randomBytes(32).toString('base64');
export const PEPPER = crypto.randomBytes(32).toString('base64');
export const PIN = '000000000010';

/** Made-up OCR text in the Phase 0 card layout. */
export const PHILHEALTH_TEXT = [
  'REPUBLIC OF THE PHILIPPINES PhilHealth',
  'Philippine Health Insurance Corporation',
  'am | 00-000000001-0',
  ': F ~~ DELA CRUZ, JUAN SANTOS',
  'JANUARY 01.1990 -MALE',
  'BLK 1 LOT 2 SAMPLE STREET, POBLACION,',
  'BOCAUE, BULACAN - 3018',
].join('\n');

export const LICENCE_TEXT = [
  'REPUBLIC OF THE PHILIPPINES',
  'LAND TRANSPORTATION OFFICE',
  "NON-PROFESSIONAL DRIVER'S LICENSE",
  'DELA CRUZ, JUAN SANTOS',
].join('\n');

/** The smallest buffers that pass the JPEG / PNG signature check. */
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)]);
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export function makeConfig(env: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    ID_DOCUMENT_ENCRYPTION_KEY: KEY,
    ID_PIN_PEPPER: PEPPER,
    ...env,
  };
  return { get: jest.fn((name: string) => values[name]) } as any;
}

function fakeTable(rows: Row[], defaults: () => Row = () => ({})) {
  const pick = (row: Row, select?: Row) =>
    select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : { ...row };
  return {
    findUnique: jest.fn(async ({ where, select }: any) => {
      const row = rows.find((r) => matches(r, where));
      return row ? pick(row, select) : null;
    }),
    findFirst: jest.fn(async ({ where, select }: any) => {
      const row = rows.find((r) => matches(r, where));
      return row ? pick(row, select) : null;
    }),
    findMany: jest.fn(async ({ where, select, take }: any = {}) =>
      rows.filter((r) => matches(r, where)).slice(0, take ?? Infinity).map((r) => pick(r, select)),
    ),
    create: jest.fn(async ({ data, select }: any) => {
      const row = { id: crypto.randomUUID(), created_at: new Date(), ...defaults(), ...data };
      rows.push(row);
      return pick(row, select);
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const found = rows.filter((r) => matches(r, where));
      found.forEach((r) => Object.assign(r, data));
      return { count: found.length };
    }),
  };
}

const ACTIVE = ['AUTO_VERIFIED', 'PENDING_REVIEW', 'APPROVED'];

export function makeDb() {
  const db = {
    users: [] as Row[],
    verifications: [] as Row[],
    consents: [] as Row[],
    idv: [] as Row[],
    audit: [] as Row[],
  };
  const idv = fakeTable(db.idv, () => ({
    user_id: null,
    document_type: 'PHILHEALTH',
    client_read_ok: null,
    match_result: null,
    attempt_number: 1,
    reviewed_by_id: null,
    reviewed_at: null,
    rejection_reason: null,
    consent_record_id: null,
    image_storage_key: null,
  }));
  const updateMany = idv.updateMany.getMockImplementation()!;
  // uq_identity_verifications_pin_active: one PhilHealth ID per account.
  idv.updateMany.mockImplementation(async (args: any) => {
    const before = db.idv.map((row) => ({ ...row }));
    const result = await updateMany(args);
    const active = db.idv.filter((row) => row.user_id !== null && ACTIVE.includes(row.status));
    if (new Set(active.map((row) => row.pin_hmac)).size !== active.length) {
      db.idv.splice(0, db.idv.length, ...before);
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
    }
    return result;
  });

  const prisma: any = {
    db,
    user: fakeTable(db.users, () => ({ role: 'CITIZEN', is_guest: false })),
    user_verifications: fakeTable(db.verifications, () => ({ attempt_count: 0 })),
    consent_records: fakeTable(db.consents),
    identity_verifications: idv,
    auditLog: fakeTable(db.audit),
    // Rolls every table back when the callback throws, like a real transaction.
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
      const snapshot = Object.fromEntries(Object.entries(db).map(([name, rows]) => [name, structuredClone(rows)]));
      try {
        return await fn(prisma);
      } catch (err) {
        for (const [name, rows] of Object.entries(snapshot)) {
          (db as Record<string, Row[]>)[name]!.splice(0, Infinity, ...rows);
        }
        throw err;
      }
    }),
  };
  return prisma;
}

/** In-memory object storage with MediaService's private-object methods. */
export function makeStorage() {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    putPrivateObject: jest.fn(async (key: string, body: Buffer) => {
      objects.set(`local:${key}`, body);
      return `local:${key}`;
    }),
    getPrivateObject: jest.fn(async (location: string) => objects.get(location)!),
    deletePrivateObject: jest.fn(async (location: string) => {
      objects.delete(location);
    }),
  };
}

export function makeOcr(result: OcrResult | null = { text: PHILHEALTH_TEXT, confidence: 80 }) {
  return { read: jest.fn(async () => result) };
}

export function makeKit(env: Record<string, string | undefined> = {}) {
  const prisma = makeDb();
  const storage = makeStorage();
  const ocr = makeOcr();
  const config = makeConfig(env);
  const crypto = new IdDocumentCryptoService(config);
  const audit = new AuditService(prisma);
  const service = new IdentityVerificationService(prisma, crypto, ocr as any, storage as any, audit);
  return { prisma, storage, ocr, config, crypto, audit, service };
}

/** AuthService over the kit's database, with the real IdentityVerificationService. */
export function makeAuth(kit: ReturnType<typeof makeKit>) {
  const smsQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const auth: AuthService = makeAuthService(
    kit.prisma,
    { sign: jest.fn() },
    smsQueue,
    kit.audit,
    makeFakeSessions(),
    kit.config,
    kit.service,
  );
  return { auth, smsQueue };
}

/** A multer-like file. */
export function file(buffer: Buffer, mimetype = 'image/jpeg'): Express.Multer.File {
  return { buffer, mimetype, size: buffer.length, originalname: 'id.jpg' } as Express.Multer.File;
}
