/**
 * Gives every seeded account that still uses a password published in this repository a new
 * password. Run it right after seeding a database that is reachable from the internet.
 *
 *   DATABASE_URL=<url> NEW_DEMO_PASSWORD=<password> pnpm db:rotate-seeded-passwords
 *
 * Only accounts whose current password IS one of the public seed passwords are changed, so a
 * password someone already chose is never overwritten and running it twice is harmless.
 * "Must change password at next sign-in" stays as the seed set it. Changed accounts are signed
 * out everywhere, and each change is written to the audit log (MOD-46/MOD-49).
 * The new password is never printed.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, audit_action } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/** Passwords that appear in plain text in this repository (seed defaults). */
const PUBLIC_PASSWORDS = ['AgapDev2026!', '@L03e1t3!@', 'ChangeThisPasswordImmediately!'];
const MIN_LENGTH = 12;

async function main(): Promise<void> {
  const newPassword = process.env['NEW_DEMO_PASSWORD'] ?? '';
  if (newPassword.length < MIN_LENGTH) {
    throw new Error(`NEW_DEMO_PASSWORD must be at least ${MIN_LENGTH} characters.`);
  }
  if (PUBLIC_PASSWORDS.includes(newPassword)) {
    throw new Error('NEW_DEMO_PASSWORD must not be one of the public seed passwords.');
  }

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] as string, options: '-c timezone=UTC' });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const users = await prisma.user.findMany({
      where: { password_hash: { not: null } },
      select: { id: true, email: true, phone_number: true, role: true, password_hash: true },
      orderBy: { email: 'asc' },
    });

    const exposed: typeof users = [];
    for (const user of users) {
      for (const candidate of PUBLIC_PASSWORDS) {
        if (await bcrypt.compare(candidate, user.password_hash as string)) {
          exposed.push(user);
          break;
        }
      }
    }

    if (exposed.length === 0) {
      console.log(`Checked ${users.length} accounts: none still uses a public seed password.`);
      return;
    }

    const hash = await bcrypt.hash(newPassword, 12);
    for (const user of exposed) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { password_hash: hash, failed_login_count: 0, locked_until: null, lockout_level: 0 },
        });
        await tx.user_sessions.updateMany({ where: { user_id: user.id }, data: { is_revoked: true } });
        await tx.trusted_devices.updateMany({
          where: { user_id: user.id, revoked_at: null },
          data: { revoked_at: new Date() },
        });
        await tx.auditLog.create({
          data: {
            action: audit_action.PASSWORD_CHANGE,
            entity_type: 'users',
            entity_id: user.id,
            module_id: 'MOD-49',
            new_values: { reason: 'Replaced a public seed password (scripts/rotate-seeded-passwords.ts)' },
          },
        });
      });
      console.log(`  changed  ${user.email ?? user.phone_number ?? user.id}  (${user.role})`);
    }
    console.log(`Done: ${exposed.length} of ${users.length} accounts now use NEW_DEMO_PASSWORD.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
