/**
 * The scratch database for `pnpm test:e2e` (E2E_DATABASE_URL in backend/.env). E2E
 * specs write real rows, so they never run against the dev database: the name must
 * contain "e2e" or "test" and differ from DATABASE_URL's. null when it is not set.
 */
export function e2eDatabaseUrl(): string | null {
  const url = process.env['E2E_DATABASE_URL'];
  if (!url) return null;
  const name = databaseName(url);
  const dev = process.env['DATABASE_URL'] ? databaseName(process.env['DATABASE_URL']) : null;
  if (!/^[A-Za-z0-9_]+$/.test(name) || !/e2e|test/i.test(name) || name === dev) {
    throw new Error(
      'E2E_DATABASE_URL must name a separate scratch database (letters, digits, _; containing "e2e" or "test").',
    );
  }
  return url;
}

export function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

/** Redis database used by E2E runs, so their queues and caches never mix with a running dev backend (db 0). */
export const E2E_REDIS_DB = 15;

export function e2eRedisUrl(): string {
  const url = new URL(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  url.pathname = `/${E2E_REDIS_DB}`;
  return url.toString();
}
