import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** A Redis call slower than this is treated as unavailable. */
const REDIS_TIMEOUT_MS = 250;

/**
 * Short-lived MFA state (mfaToken ids and their failure counters).
 *
 * Redis when reachable, an in-process map when not. State that lands in the map while
 * Redis is down is simply invisible once Redis returns — and an unseen mfaToken is
 * rejected, so the fallback fails CLOSED (the user signs in again; nothing is replayable).
 * AGAP is a single-instance monolith, so the map is also correct on its own.
 */
@Injectable()
export class MfaStateStore implements OnModuleDestroy {
  private readonly logger = new Logger(MfaStateStore.name);
  private readonly redis: Redis | null;
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    if (!url) {
      this.redis = null;
      return;
    }
    this.redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    this.redis.on('error', (err) => this.logger.warn(`Redis unavailable for MFA state: ${err.message}`));
    void this.redis.connect().catch(() => undefined);
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
  }

  /** Never touch Redis (tests, or a deployment that wants the in-process store). */
  static inMemory(): MfaStateStore {
    return new MfaStateStore({ get: () => undefined } as unknown as ConfigService);
  }

  private async viaRedis<T>(run: (redis: Redis) => Promise<T>): Promise<T | undefined> {
    if (!this.redis) return undefined;
    try {
      return await Promise.race([
        run(this.redis),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), REDIS_TIMEOUT_MS)),
      ]);
    } catch {
      return undefined;
    }
  }

  private memGet(key: string): string | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const stored = await this.viaRedis((r) => r.set(key, value, 'EX', ttlSeconds));
    if (stored === undefined) this.memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async get(key: string): Promise<string | null> {
    const value = await this.viaRedis((r) => r.get(key));
    return value === undefined ? this.memGet(key) : value;
  }

  async del(key: string): Promise<void> {
    this.memory.delete(key);
    await this.viaRedis((r) => r.del(key));
  }

  /** Atomic increment; the counter expires `ttlSeconds` after its first increment. */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.viaRedis(async (r) => {
      const n = await r.incr(key);
      if (n === 1) await r.expire(key, ttlSeconds);
      return n;
    });
    if (count !== undefined) return count;
    const next = Number(this.memGet(key) ?? 0) + 1;
    const existing = this.memory.get(key);
    this.memory.set(key, { value: String(next), expiresAt: existing?.expiresAt ?? Date.now() + ttlSeconds * 1000 });
    return next;
  }
}
