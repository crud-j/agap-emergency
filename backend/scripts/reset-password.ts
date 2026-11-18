/**
 * DEV ONLY — put one account of any role back to the seeded default password (AgapDev2026!).
 *
 *   pnpm dev:reset-password <email>                 password only
 *   pnpm dev:reset-password <email> --mfa           also remove passkeys / authenticator / backup codes
 *   pnpm dev:reset-password <email> --no-change     do not force a password change at next sign-in
 *
 * Like the seed, web-console accounts (dispatcher, supervisor, hospital, org admin, publisher,
 * system admin) must change the password at next sign-in; responders and citizens do not.
 * The account is unlocked and signed out everywhere. Refuses to run when NODE_ENV=production.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, user_role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const DEV_PASSWORD = 'AgapDev2026!';

/** Roles the seed creates with must_change_password = true. */
const CONSOLE_ROLES: ReadonlySet<user_role> = new Set([
  user_role.DISPATCHER,
  user_role.SUPERVISOR,
  user_role.HOSPITAL_USER,
  user_role.ORG_ADMINISTRATOR,
  user_role.ANNOUNCEMENTS_PUBLISHER,
  user_role.SYSTEM_ADMINISTRATOR,
]);

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to reset passwords when NODE_ENV=production.');
  }

  const args = process.argv.slice(2);
  const clearMfa = args.includes('--mfa');
  const noChange = args.includes('--no-change');
  const email = args.find((a) => !a.startsWith('--'))?.trim();
  if (!email) {
    throw new Error('Usage: pnpm dev:reset-password <email> [--mfa] [--no-change]');
  }

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] as string, options: '-c timezone=UTC' });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      console.log(`No account with email ${email}.`);
      process.exitCode = 1;
      return;
    }

    const mustChange = !noChange && CONSOLE_ROLES.has(user.role);
    const hash = await bcrypt.hash(DEV_PASSWORD, 12);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          password_hash: hash,
          must_change_password: mustChange,
          password_changed_at: mustChange ? null : new Date(),
          failed_login_count: 0,
          locked_until: null,
          lockout_level: 0,
        },
      });
      // Sign them out everywhere; old sessions belong to the previous password.
      await tx.user_sessions.updateMany({ where: { user_id: user.id }, data: { is_revoked: true } });
      await tx.trusted_devices.updateMany({
        where: { user_id: user.id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      if (clearMfa) {
        await tx.user_mfa_totp.deleteMany({ where: { user_id: user.id } });
        await tx.user_backup_codes.deleteMany({ where: { user_id: user.id } });
        await tx.webauthn_credentials.deleteMany({ where: { user_id: user.id } });
      }
    });

    console.log(`Reset ${user.email} (${user.role})${clearMfa ? ' and removed its MFA factors' : ''}.`);
    console.log(`Password is now ${DEV_PASSWORD}.`);
    console.log(
      mustChange
        ? 'A password change is required at next sign-in (use --no-change to skip).'
        : 'No password change is required at next sign-in.',
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
