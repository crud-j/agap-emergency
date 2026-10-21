/**
 * DEV ONLY — put DISPATCHER accounts back to the seeded default password so the first-login
 * flow (forced password change → passkey → authenticator → dashboard) can be tested again.
 *
 *   pnpm dev:reset-dispatcher                       all dispatchers, password only
 *   pnpm dev:reset-dispatcher --mfa                 also remove their passkeys / authenticator / backup codes / trusted browsers
 *   pnpm dev:reset-dispatcher dispatcher1@mdrrmo.bocaue.gov.ph --mfa     one dispatcher
 *
 * Only users whose role is DISPATCHER are touched. Refuses to run when NODE_ENV=production.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, user_role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const DEV_PASSWORD = 'AgapDev2026!';

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to reset passwords when NODE_ENV=production.');
  }

  const args = process.argv.slice(2);
  const clearMfa = args.includes('--mfa');
  const email = args.find((a) => !a.startsWith('--'));

  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] as string, options: '-c timezone=UTC' });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const dispatchers = await prisma.user.findMany({
      where: { role: user_role.DISPATCHER, ...(email ? { email } : {}) },
      select: { id: true, email: true },
    });
    if (dispatchers.length === 0) {
      console.log(email ? `No DISPATCHER account with email ${email}.` : 'No DISPATCHER accounts found.');
      return;
    }
    const ids = dispatchers.map((d) => d.id);
    const hash = await bcrypt.hash(DEV_PASSWORD, 12);

    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { id: { in: ids } },
        data: {
          password_hash: hash,
          must_change_password: true,
          password_changed_at: null,
          failed_login_count: 0,
          locked_until: null,
          lockout_level: 0,
        },
      });
      // Sign them out everywhere; the old session rows are no longer valid for this account state.
      await tx.user_sessions.updateMany({ where: { user_id: { in: ids } }, data: { is_revoked: true } });
      await tx.trusted_devices.updateMany({
        where: { user_id: { in: ids }, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      if (clearMfa) {
        await tx.user_mfa_totp.deleteMany({ where: { user_id: { in: ids } } });
        await tx.user_backup_codes.deleteMany({ where: { user_id: { in: ids } } });
        await tx.webauthn_credentials.deleteMany({ where: { user_id: { in: ids } } });
      }
    });

    console.log(`Reset ${dispatchers.length} dispatcher account(s)${clearMfa ? ' and removed their MFA factors' : ''}:`);
    for (const d of dispatchers) console.log(`  - ${d.email}`);
    console.log(`Password is now the seeded default (${DEV_PASSWORD}); a password change is required at next sign-in.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
