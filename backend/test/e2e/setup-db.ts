/**
 * Creates (if missing), migrates and seeds the E2E scratch database:
 *
 *   cd backend && pnpm test:e2e:db
 *
 * Reads E2E_DATABASE_URL from backend/.env (or the environment). Safe to re-run: the
 * migrations are applied with `migrate deploy` and the seed is idempotent. Never touches
 * DATABASE_URL's database.
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import { Client } from 'pg';
import { databaseName, e2eDatabaseUrl } from './e2e-database';

async function main() {
  const url = e2eDatabaseUrl();
  if (!url) throw new Error('Set E2E_DATABASE_URL in backend/.env first (see .env.example).');
  const name = databaseName(url);

  // Same server and credentials, maintenance database, no Prisma-only query parameters.
  const admin = new URL(url);
  admin.pathname = '/postgres';
  admin.search = '';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) {
      // The name is checked against [A-Za-z0-9_]+ by e2eDatabaseUrl, so quoting it is safe.
      await client.query(`CREATE DATABASE "${name}"`);
      console.log(`Created database ${name}`);
    }
  } finally {
    await client.end();
  }

  const env = { ...process.env, DATABASE_URL: url };
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env });
  execSync('npx prisma db seed', { stdio: 'inherit', env });
  console.log(`E2E database ${name} is ready.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
