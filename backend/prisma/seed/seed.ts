import { PrismaClient, user_role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient({ datasourceUrl: process.env['DATABASE_URL'] });

async function main() {
  console.warn('Running database seed...');

  const adminPasswordHash = await bcrypt.hash(
    process.env['INITIAL_ADMIN_PASSWORD'] ?? 'ChangeThisPasswordImmediately!',
    12,
  );

  const admin = await prisma.user.upsert({
    where: { email: process.env['INITIAL_ADMIN_EMAIL'] ?? 'admin@agap.local' },
    update: {},
    create: {
      full_name: 'System Administrator',
      email: process.env['INITIAL_ADMIN_EMAIL'] ?? 'admin@agap.local',
      password_hash: adminPasswordHash,
      role: user_role.SYSTEM_ADMINISTRATOR,
      is_email_verified: true,
    },
  });

  console.warn(`Admin user: ${admin.email}`);
  console.warn('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
