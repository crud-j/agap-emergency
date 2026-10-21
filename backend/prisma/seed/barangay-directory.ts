import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Seeds `barangay_contacts` from docs/automation/bocaue-barangay-hotlines.json
 * (BARANGAY_ALERT_AUTOMATION_PLAN.md, Phase 1). Safe to run repeatedly.
 *
 *   pnpm --filter @agap/backend exec ts-node prisma/seed/barangay-directory.ts
 *
 * Rules:
 *  - The barangay boundaries (geo_regions) come from the migration, not from here.
 *  - INVALID numbers stay in the file for the record and are skipped here.
 *  - Re-seeding never overwrites what an administrator changed: role, label,
 *    is_active and verified_at are only written when a row is first created.
 *  - Rows this seed created earlier that are no longer in the file (for example the
 *    Batia demo number after the real numbers are restored) are deactivated, so a
 *    stale number is never texted.
 *  - A demo contact in the file blocks the seed when NODE_ENV=production.
 */

const DIRECTORY_FILE = path.resolve(__dirname, '../../../docs/automation/bocaue-barangay-hotlines.json');

/** Contacts written by this seed carry one of these sources; admin-added ones do not. */
const SEEDED_SOURCES = ['facebook-poster-2026-08-29', 'demo-override'];

interface DirectoryContact {
  raw: string;
  e164: string | null;
  kind: 'MOBILE' | 'LANDLINE' | 'INVALID';
  can_sms: boolean;
  role: 'PRIMARY' | 'BACKUP' | 'OTHER';
  label?: string;
  is_demo?: boolean;
  verified_at: string | null;
  source: string;
  issue?: string;
}

interface DirectoryFile {
  barangays: Array<{
    barangay_id: string;
    name: string;
    demo_override?: boolean;
    contacts: DirectoryContact[];
  }>;
}

export interface BarangayDirectorySeedResult {
  created: number;
  updated: number;
  deactivated: number;
  skippedInvalid: number;
  demoContacts: number;
}

export async function seedBarangayDirectory(
  prisma: PrismaClient,
  options: { file?: string; log?: (message: string) => void } = {},
): Promise<BarangayDirectorySeedResult> {
  const log = options.log ?? ((m: string) => console.log(m));
  const directory = JSON.parse(fs.readFileSync(options.file ?? DIRECTORY_FILE, 'utf8')) as DirectoryFile;

  const demoContacts = directory.barangays.flatMap((b) => b.contacts.filter((c) => c.is_demo));
  if (demoContacts.length > 0 && process.env['NODE_ENV'] === 'production') {
    throw new Error(
      `Refusing to seed: ${demoContacts.length} demo contact(s) (is_demo) are in the barangay ` +
        'directory and NODE_ENV=production. Restore the real numbers from original_contacts first.',
    );
  }

  const regions = await prisma.geo_regions.findMany({
    where: { region_type: 'barangay' },
    select: { id: true },
  });
  const regionIds = new Set(regions.map((r) => r.id));
  const missing = directory.barangays.filter((b) => !regionIds.has(b.barangay_id)).map((b) => b.barangay_id);
  if (missing.length > 0) {
    throw new Error(
      `geo_regions has no barangay boundary for: ${missing.join(', ')}. ` +
        'Run `pnpm db:migrate:prod` (migration 20261021000000_barangay_coordination) first.',
    );
  }

  const result: BarangayDirectorySeedResult = {
    created: 0,
    updated: 0,
    deactivated: 0,
    skippedInvalid: 0,
    demoContacts: demoContacts.length,
  };

  for (const barangay of directory.barangays) {
    const usable: Array<
      Omit<DirectoryContact, 'kind' | 'e164'> & { kind: 'MOBILE' | 'LANDLINE'; e164: string }
    > = [];
    for (const contact of barangay.contacts) {
      if (contact.kind === 'INVALID' || !contact.e164) {
        result.skippedInvalid += 1;
        log(`  [skip] ${barangay.name}: "${contact.raw}" is not a usable number (${contact.issue ?? 'INVALID'})`);
        continue;
      }
      usable.push({ ...contact, kind: contact.kind, e164: contact.e164 });
    }
    const keep = usable.map((c) => c.e164);

    // 1. Deactivate numbers this seed created before that are no longer in the file.
    const stale = await prisma.barangay_contacts.updateMany({
      where: {
        barangay_id: barangay.barangay_id,
        source: { in: SEEDED_SOURCES },
        is_active: true,
        phone_e164: { notIn: keep },
      },
      data: { is_active: false, role: 'OTHER' },
    });
    if (stale.count > 0) {
      result.deactivated += stale.count;
      log(`  [deactivate] ${barangay.name}: ${stale.count} number(s) no longer in the directory`);
    }

    // 2. Create new contacts; refresh only the provenance facts of existing ones.
    for (const contact of usable) {
      const existing = await prisma.barangay_contacts.findUnique({
        where: {
          barangay_id_phone_e164: { barangay_id: barangay.barangay_id, phone_e164: contact.e164 },
        },
      });

      if (existing) {
        await prisma.barangay_contacts.update({
          where: { id: existing.id },
          data: {
            phone_raw: contact.raw,
            kind: contact.kind,
            can_sms: contact.can_sms,
            is_demo: contact.is_demo ?? false,
            source: contact.source,
          },
        });
        result.updated += 1;
        continue;
      }

      // Never create a second active PRIMARY / BACKUP: an admin may already have chosen one.
      let role = contact.role;
      if (role !== 'OTHER') {
        const holder = await prisma.barangay_contacts.findFirst({
          where: { barangay_id: barangay.barangay_id, role, is_active: true },
          select: { id: true },
        });
        if (holder) {
          log(`  [role] ${barangay.name}: ${contact.e164} created as OTHER (an active ${role} already exists)`);
          role = 'OTHER';
        }
      }

      await prisma.barangay_contacts.create({
        data: {
          barangay_id: barangay.barangay_id,
          phone_e164: contact.e164,
          phone_raw: contact.raw,
          kind: contact.kind,
          can_sms: contact.can_sms,
          role,
          label: contact.label ?? null,
          is_demo: contact.is_demo ?? false,
          verified_at: contact.verified_at ? new Date(contact.verified_at) : null,
          source: contact.source,
        },
      });
      result.created += 1;
    }
  }

  log(
    `Barangay directory: ${result.created} created, ${result.updated} refreshed, ` +
      `${result.deactivated} deactivated, ${result.skippedInvalid} invalid skipped` +
      (result.demoContacts > 0 ? `, ${result.demoContacts} DEMO contact(s) present` : ''),
  );
  return result;
}

// Standalone runner: `ts-node prisma/seed/barangay-directory.ts`
if (require.main === module) {
  const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] as string });
  const prisma = new PrismaClient({ adapter });
  seedBarangayDirectory(prisma)
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
