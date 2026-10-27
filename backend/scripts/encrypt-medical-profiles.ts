/**
 * One-off — seal medical profiles saved before MOD-03 encryption (MEDICAL_ENCRYPTION_KEY).
 *
 *   pnpm medical:encrypt            seal every plaintext field
 *   pnpm medical:encrypt --dry-run  only count what would change
 *
 * Safe to run more than once: values already sealed are left alone. Run it once per
 * environment after the 20261023000200 migration, with the same key the server uses.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { isSealed, parseEncryptionKey, seal } from '../src/common/crypto/secret-box';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const key = parseEncryptionKey(process.env['MEDICAL_ENCRYPTION_KEY'], 'MEDICAL_ENCRYPTION_KEY');
  if (!key) throw new Error('MEDICAL_ENCRYPTION_KEY is not set.');

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] as string });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const profiles = await prisma.medicalProfile.findMany();
    let changed = 0;
    for (const profile of profiles) {
      // Same owner binding as MedicalCryptoService.
      const aad = `medical_profile:${profile.user_id}`;
      const sealOne = (value: string) => (isSealed(value) ? value : seal(value, key, aad));
      const data = {
        blood_type: profile.blood_type === null ? null : sealOne(profile.blood_type),
        allergies: profile.allergies.map(sealOne),
        current_medications: profile.current_medications.map(sealOne),
        medical_conditions: profile.medical_conditions.map(sealOne),
        disabilities: profile.disabilities.map(sealOne),
        responder_notes: profile.responder_notes === null ? null : sealOne(profile.responder_notes),
      };
      const plaintextLeft = JSON.stringify(data) !== JSON.stringify({
        blood_type: profile.blood_type,
        allergies: profile.allergies,
        current_medications: profile.current_medications,
        medical_conditions: profile.medical_conditions,
        disabilities: profile.disabilities,
        responder_notes: profile.responder_notes,
      });
      if (!plaintextLeft) continue;
      changed += 1;
      if (!dryRun) await prisma.medicalProfile.update({ where: { id: profile.id }, data });
    }
    console.log(`${profiles.length} medical profile(s); ${changed} ${dryRun ? 'would be' : 'were'} sealed.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
