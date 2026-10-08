import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: Pool;

  constructor() {
    // Own the pg.Pool explicitly (instead of letting PrismaPg build a default,
    // untuned one) so we can enable TCP keepalives, bound idle/connection
    // lifetimes, and — critically — attach an 'error' handler. Without a
    // listener, a connection the Postgres server closes while idle (idle
    // timeout, container restart, dropped network) surfaces as an unhandled
    // pool error and the *next* query throws "Server has closed the
    // connection". keepAlive + idle eviction let the pool retire dead sockets
    // before they are handed to a query such as verifyPhoneOtp's findUnique.
    const pool = new Pool({
      connectionString: process.env['DATABASE_URL'] as string,
      max: Number(process.env['DATABASE_POOL_MAX'] ?? 10),
      keepAlive: true,
      // Recycle idle clients before common server/proxy idle timeouts (~30s+)
      idleTimeoutMillis: 10_000,
      // Fail fast instead of hanging if the DB is unreachable
      connectionTimeoutMillis: 10_000,
    });

    // A pooled client can emit 'error' asynchronously when the server drops it.
    // Logging (not rethrowing) lets the pool evict the dead client quietly; an
    // unhandled 'error' here would otherwise crash the Node process.
    pool.on('error', (err) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      new Logger(PrismaService.name).warn(
        `Idle Postgres client error (connection will be evicted): ${err.message}`,
      );
    });

    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.warn(
        `Database connection failed — run "pnpm prisma migrate dev" to set up the database. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end().catch(() => undefined);
    this.logger.log('Database connection closed');
  }
}
