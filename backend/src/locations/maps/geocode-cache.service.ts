import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { GeocodeCandidate, GeocodeSearchQuery } from './interfaces';

const KEY_PREFIX = 'geocode:search:';
/** A Redis call slower than this is treated as unavailable. */
const CALL_TIMEOUT_MS = 250;
/** Nominatim usage policy: cache results (plan §9.5). */
export const GEOCODE_CACHE_TTL_SECONDS = 24 * 60 * 60;

/** Same search, same key: the text is trimmed, lower-cased and space-collapsed. */
export function geocodeCacheKey(query: GeocodeSearchQuery): string {
  const text = query.text.trim().toLowerCase().replace(/\s+/g, ' ');
  return KEY_PREFIX + JSON.stringify([text, query.countryCodes ?? null, query.viewbox ?? null, !!query.bounded, query.limit ?? null]);
}

/**
 * Search results cached for 24 h (MOD-39), so repeated "Find location" clicks do
 * not hit Nominatim again. Fails open like RouteCacheService: a Redis outage only
 * means the provider is asked again.
 */
@Injectable()
export class GeocodeCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(GeocodeCacheService.name);
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

  async get(query: GeocodeSearchQuery): Promise<GeocodeCandidate[] | null> {
    try {
      const raw = await withTimeout(this.redis.get(geocodeCacheKey(query)));
      return raw ? (JSON.parse(raw) as GeocodeCandidate[]) : null;
    } catch (err) {
      this.warnOnce(err);
      return null;
    }
  }

  async set(query: GeocodeSearchQuery, candidates: GeocodeCandidate[]): Promise<void> {
    try {
      await withTimeout(
        this.redis.set(geocodeCacheKey(query), JSON.stringify(candidates), 'EX', GEOCODE_CACHE_TTL_SECONDS),
      );
    } catch (err) {
      this.warnOnce(err);
    }
  }

  private warnOnce(err: unknown) {
    if (this.redisWarningLogged) return;
    this.redisWarningLogged = true;
    this.logger.warn(
      `Redis unavailable for the geocode cache; searches go to the provider: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), CALL_TIMEOUT_MS)),
  ]);
}
