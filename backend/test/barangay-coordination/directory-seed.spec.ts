import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { seedBarangayDirectory } from '../../prisma/seed/barangay-directory';

/**
 * Behaviour of the directory seed against an in-memory stand-in for Prisma, so these
 * tests never touch a real database.
 */

type Row = {
  id: string;
  barangay_id: string;
  phone_e164: string;
  phone_raw: string | null;
  kind: string;
  can_sms: boolean;
  role: string;
  label: string | null;
  is_active: boolean;
  is_demo: boolean;
  verified_at: Date | null;
  source: string | null;
};

function fakePrisma(regionIds: string[], seedRows: Row[] = []) {
  const rows: Row[] = [...seedRows];
  let nextId = 1;
  const prisma: any = {
    geo_regions: { findMany: async () => regionIds.map((id) => ({ id })) },
    barangay_contacts: {
      updateMany: async ({ where, data }: any) => {
        const hit = rows.filter(
          (r) =>
            r.barangay_id === where.barangay_id &&
            where.source.in.includes(r.source) &&
            r.is_active === where.is_active &&
            !where.phone_e164.notIn.includes(r.phone_e164),
        );
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      findUnique: async ({ where }: any) => {
        const k = where.barangay_id_phone_e164;
        return rows.find((r) => r.barangay_id === k.barangay_id && r.phone_e164 === k.phone_e164) ?? null;
      },
      findFirst: async ({ where }: any) =>
        rows.find((r) => r.barangay_id === where.barangay_id && r.role === where.role && r.is_active === where.is_active) ??
        null,
      update: async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id)!, data),
      create: async ({ data }: any) => {
        const row: Row = { id: `row-${nextId++}`, is_active: true, ...data };
        rows.push(row);
        return row;
      },
    },
  };
  return { prisma, rows };
}

function writeDirectory(barangays: unknown[]): string {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agap-dir-')), 'dir.json');
  fs.writeFileSync(file, JSON.stringify({ barangays }));
  return file;
}

const contact = (e164: string | null, role: string, extra: Record<string, unknown> = {}) => ({
  raw: e164 ?? 'bad',
  e164,
  kind: e164 ? 'MOBILE' : 'INVALID',
  can_sms: !!e164,
  role,
  label: 'Hotline',
  verified_at: null,
  source: 'facebook-poster-2026-08-29',
  ...extra,
});

const quiet = { log: () => undefined };

describe('seedBarangayDirectory', () => {
  const realFile = path.resolve(__dirname, '../../../docs/automation/bocaue-barangay-hotlines.json');
  const regionIds = JSON.parse(fs.readFileSync(realFile, 'utf8')).barangays.map((b: any) => b.barangay_id);
  const originalEnv = process.env['NODE_ENV'];
  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
  });

  it('loads the real directory: 48 usable contacts, 2 invalid skipped, one PRIMARY per barangay', async () => {
    process.env['NODE_ENV'] = 'development';
    const { prisma, rows } = fakePrisma(regionIds);
    const result = await seedBarangayDirectory(prisma, quiet);

    expect(result).toMatchObject({ created: 48, updated: 0, deactivated: 0, skippedInvalid: 2, demoContacts: 1 });
    expect(rows.every((r) => /^\+63\d{9,10}$/.test(r.phone_e164))).toBe(true);
    for (const id of regionIds) {
      expect(rows.filter((r) => r.barangay_id === id && r.role === 'PRIMARY' && r.is_active)).toHaveLength(1);
    }
    // Batia is the temporary demo number, and only that number.
    const batia = rows.filter((r) => r.barangay_id === 'BATIA');
    expect(batia).toHaveLength(1);
    expect(batia[0]).toMatchObject({ phone_e164: '+639694784013', is_demo: true, role: 'PRIMARY' });
  });

  it('is idempotent', async () => {
    process.env['NODE_ENV'] = 'development';
    const { prisma, rows } = fakePrisma(regionIds);
    await seedBarangayDirectory(prisma, quiet);
    const count = rows.length;
    const second = await seedBarangayDirectory(prisma, quiet);
    expect(rows).toHaveLength(count);
    expect(second).toMatchObject({ created: 0, updated: 48, deactivated: 0 });
  });

  it('refuses to seed demo contacts in production', async () => {
    process.env['NODE_ENV'] = 'production';
    const { prisma, rows } = fakePrisma(regionIds);
    await expect(seedBarangayDirectory(prisma, quiet)).rejects.toThrow(/demo contact/i);
    expect(rows).toHaveLength(0);
  });

  it('fails loudly when the boundaries migration has not run', async () => {
    process.env['NODE_ENV'] = 'development';
    const { prisma } = fakePrisma([]);
    await expect(seedBarangayDirectory(prisma, quiet)).rejects.toThrow(/Run `pnpm db:migrate:prod`/);
  });

  it('deactivates the demo number when the real numbers are restored, and never texts a stale one', async () => {
    process.env['NODE_ENV'] = 'production';
    const { prisma, rows } = fakePrisma(['BATIA']);
    // The DB currently holds the demo contact from an earlier seed.
    rows.push({
      id: 'demo-row',
      barangay_id: 'BATIA',
      phone_e164: '+639757072301',
      phone_raw: '0975-707-2301',
      kind: 'MOBILE',
      can_sms: true,
      role: 'PRIMARY',
      label: 'DEMO NUMBER',
      is_active: true,
      is_demo: true,
      verified_at: null,
      source: 'demo-override',
    });
    const file = writeDirectory([
      {
        barangay_id: 'BATIA',
        name: 'Batia',
        contacts: [contact('+639647579780', 'PRIMARY'), contact('+639226266091', 'BACKUP')],
      },
    ]);

    const result = await seedBarangayDirectory(prisma, { ...quiet, file });

    expect(result).toMatchObject({ created: 2, deactivated: 1, demoContacts: 0 });
    expect(rows.find((r) => r.id === 'demo-row')).toMatchObject({ is_active: false, role: 'OTHER' });
    const active = rows.filter((r) => r.is_active);
    expect(active.map((r) => [r.phone_e164, r.role]).sort()).toEqual([
      ['+639226266091', 'BACKUP'],
      ['+639647579780', 'PRIMARY'],
    ]);
  });

  it('does not overwrite roles, labels or verification an administrator already set', async () => {
    process.env['NODE_ENV'] = 'development';
    const verifiedAt = new Date('2026-10-30T00:00:00Z');
    const { prisma, rows } = fakePrisma(['BATIA']);
    rows.push({
      id: 'admin-row',
      barangay_id: 'BATIA',
      phone_e164: '+639226266091',
      phone_raw: '0922-626-6091',
      kind: 'MOBILE',
      can_sms: true,
      role: 'PRIMARY', // admin promoted the second number
      label: 'BDRRMC Captain',
      is_active: true,
      is_demo: false,
      verified_at: verifiedAt,
      source: 'facebook-poster-2026-08-29',
    });
    const file = writeDirectory([
      {
        barangay_id: 'BATIA',
        name: 'Batia',
        contacts: [contact('+639647579780', 'PRIMARY'), contact('+639226266091', 'BACKUP')],
      },
    ]);

    await seedBarangayDirectory(prisma, { ...quiet, file });

    expect(rows.find((r) => r.id === 'admin-row')).toMatchObject({
      role: 'PRIMARY',
      label: 'BDRRMC Captain',
      verified_at: verifiedAt,
    });
    // The seed's would-be PRIMARY is created as OTHER because the admin's PRIMARY is active.
    expect(rows.find((r) => r.phone_e164 === '+639647579780')).toMatchObject({ role: 'OTHER' });
    expect(rows.filter((r) => r.role === 'PRIMARY' && r.is_active)).toHaveLength(1);
  });
});
