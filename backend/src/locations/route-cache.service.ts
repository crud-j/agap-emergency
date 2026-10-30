import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { RouteSnapshot, TransportDestinationView, TransportLeg } from '@agap/shared';

const KEY_PREFIX = 'route:dispatch:';
/** A Redis call slower than this is treated as unavailable. */
const CALL_TIMEOUT_MS = 250;
export const ROUTE_CACHE_TTL_SECONDS = 120;

/** The last good route of a dispatch (plan §13.2). */
export interface CachedRoute {
  leg: TransportLeg;
  destination: TransportDestinationView | null;
  route: RouteSnapshot;
  /** The crew fix the route was computed from. */
  fromFix: { lat: number; lng: number };
}

/** The cached route belongs to this leg and destination; after a destination change it is another hospital's route. */
export function isRouteFor(
  cached: CachedRoute,
  leg: TransportLeg,
  destination: TransportDestinationView | null,
): boolean {
  return cached.leg === leg && JSON.stringify(cached.destination) === JSON.stringify(destination);
}

/**
 * Per-dispatch route cache (MOD-43). Redis is an accelerator here, never the
 * source of truth: every call fails open (get → null, set/clear → no-op), so a
 * Redis outage only means the next ETA job routes again (Reliability Rules).
 */
@Injectable()
export class RouteCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RouteCacheService.name);
  private readonly redis: Redis;
  private redisWarningLogged = false;

  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
      lazyConnect: true,
      // Fail fast instead of queueing commands while disconnected.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    this.redis.on('error', (err) => this.warnOnce(err));
    void this.redis.connect().catch(() => undefined);
  }

  async onModuleDestroy() {
    this.redis.disconnect();
  }

  async get(dispatchId: string): Promise<CachedRoute | null> {
    try {
      const raw = await withTimeout(this.redis.get(KEY_PREFIX + dispatchId));
      return raw ? (JSON.parse(raw) as CachedRoute) : null;
    } catch (err) {
      this.warnOnce(err);
      return null;
    }
  }

  async set(dispatchId: string, value: CachedRoute, ttlSeconds = ROUTE_CACHE_TTL_SECONDS): Promise<void> {
    try {
      await withTimeout(this.redis.set(KEY_PREFIX + dispatchId, JSON.stringify(value), 'EX', ttlSeconds));
    } catch (err) {
      this.warnOnce(err);
    }
  }

  async clear(dispatchId: string): Promise<void> {
    try {
      await withTimeout(this.redis.del(KEY_PREFIX + dispatchId));
    } catch (err) {
      this.warnOnce(err);
    }
  }

  private warnOnce(err: unknown) {
    if (this.redisWarningLogged) return;
    this.redisWarningLogged = true;
    this.logger.warn(
      `Redis unavailable for the route cache; routes are recomputed instead: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), CALL_TIMEOUT_MS)),
  ]);
}
