import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createHash } from 'crypto';

/** Where a guest report came from. Either part may be missing. */
export interface GuestSource {
  /** Client IP as Express resolved it (trust proxy applied). */
  ip?: string | undefined;
  /** Random per-install id the mobile app sends in X-Device-Id. Not hardware-derived. */
  deviceId?: string | undefined;
}

interface LimitRule {
  scope: 'device' | 'ip';
  windowSeconds: number;
  max: number;
}

/**
 * Guest (no-account) emergency reports allowed per window.
 *
 * Device limits stop one phone from flooding the queue. IP limits stop a script that
 * fakes a new device id on every request. The IP limits are generous on purpose:
 * Philippine mobile carriers put many subscribers behind one public IP (CGNAT), and
 * during a typhoon many real neighbours may report at once (Architectural Rule 14).
 */
export const GUEST_REPORT_RULES: readonly LimitRule[] = [
  { scope: 'device', windowSeconds: 10 * 60, max: 2 },
  { scope: 'device', windowSeconds: 24 * 60 * 60, max: 6 },
  { scope: 'ip', windowSeconds: 10 * 60, max: 20 },
  { scope: 'ip', windowSeconds: 24 * 60 * 60, max: 100 },
];

/** A retry of an already-admitted report (same idempotency key) is free for this long. */
const ADMITTED_TTL_SECONDS = 24 * 60 * 60;
const KEY_PREFIX = 'guestlim:';
/** A Redis call slower than this is treated as unavailable. */
const CALL_TIMEOUT_MS = 250;

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Accept only well-formed device ids; anything else is treated as "no device id". */
export function normalizeDeviceId(raw: unknown): string | undefined {
  return typeof raw === 'string' && DEVICE_ID_PATTERN.test(raw) ? raw : undefined;
}

/** Hold on the counters taken for one report. Released if the report is not created. */
export interface GuestReportLease {
  release(): Promise<void>;
}

const NO_LEASE: GuestReportLease = { release: async () => undefined };

export class GuestReportLimitExceeded extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    const wait = minutes >= 120 ? `${Math.ceil(minutes / 60)} hours` : `${minutes} minute${minutes === 1 ? '' : 's'}`;
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        code: 'GUEST_REPORT_LIMIT',
        retryAfterSeconds,
        message:
          'Too many reports were sent from this phone without an account. ' +
          'If this is an emergency, call 911 or the Bocaue MDRRMO hotline now. ' +
          `You can send another report in about ${wait}, or sign in to report right away.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** Minimal counter store so Redis and the in-memory fallback share one code path. */
interface CounterStore {
  incr(key: string, ttlSeconds: number): Promise<number>;
  decr(key: string): Promise<void>;
  setFlag(key: string, ttlSeconds: number): Promise<void>;
  hasFlag(key: string): Promise<boolean>;
  del(key: string): Promise<void>;
}

class MemoryStore implements CounterStore {
  private readonly entries = new Map<string, { value: number; expiresAt: number }>();

  private live(key: string, now = Date.now()) {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  private prune(now = Date.now()) {
    if (this.entries.size < 5000) return;
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
  }

  async incr(key: string, ttlSeconds: number) {
    this.prune();
    const entry = this.live(key);
    if (entry) return ++entry.value;
    this.entries.set(key, { value: 1, expiresAt: Date.now() + ttlSeconds * 1000 });
    return 1;
  }

  async decr(key: string) {
    const entry = this.live(key);
    if (entry) entry.value = Math.max(0, entry.value - 1);
  }

  async setFlag(key: string, ttlSeconds: number) {
    this.prune();
    this.entries.set(key, { value: 1, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async hasFlag(key: string) {
    return this.live(key) !== undefined;
  }

  async del(key: string) {
    this.entries.delete(key);
  }
}

/**
 * Rate limit for guest emergency reports (MOD-06 / MOD-09 abuse protection).
 *
 * Only guest reports are limited; signed-in citizens are accountable and keep the
 * global throttle. Redis holds the counters so they survive a restart; if Redis is
 * down the counters move to memory rather than failing the report — an infra
 * outage must never block someone from getting help (Reliability Rules).
 */
@Injectable()
export class GuestReportLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(GuestReportLimitService.name);
  private readonly redis: Redis;
  private readonly memory = new MemoryStore();
  private readonly enabled: boolean;
  private redisWarningLogged = false;

  constructor(config: ConfigService) {
    this.enabled = config.get<string>('GUEST_REPORT_LIMIT_DISABLED', 'false') !== 'true';
    this.redis = new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 1000, 30_000),
    });
    this.redis.on('error', (err) => this.warnOnce(err));
    void this.redis.connect().catch(() => undefined);
  }

  async onModuleDestroy() {
    this.redis.disconnect();
  }

  /**
   * Count one guest report against every limit. Throws GuestReportLimitExceeded when
   * any limit is already used up (nothing stays counted in that case). A retry with
   * an idempotency key that was already admitted is not counted again.
   */
  async reserve(source: GuestSource, idempotencyKey?: string): Promise<GuestReportLease> {
    if (!this.enabled) return NO_LEASE;

    const admittedKey = idempotencyKey ? `${KEY_PREFIX}admitted:${hash(idempotencyKey)}` : null;
    if (admittedKey && (await this.call((s) => s.hasFlag(admittedKey)))) return NO_LEASE;

    const now = Math.floor(Date.now() / 1000);
    const taken: string[] = [];
    let retryAfter = 0;
    let hitRule: LimitRule | null = null;

    for (const rule of GUEST_REPORT_RULES) {
      const value = rule.scope === 'device' ? source.deviceId : source.ip;
      if (!value) continue;
      const bucket = Math.floor(now / rule.windowSeconds);
      const key = `${KEY_PREFIX}${rule.scope}:${hash(`${rule.scope}:${value}`)}:${rule.windowSeconds}:${bucket}`;
      const count = await this.call((s) => s.incr(key, rule.windowSeconds));
      taken.push(key);
      if (count > rule.max) {
        const wait = (bucket + 1) * rule.windowSeconds - now;
        if (wait > retryAfter) {
          retryAfter = wait;
          hitRule = rule;
        }
      }
    }

    if (hitRule) {
      await Promise.all(taken.map((key) => this.call((s) => s.decr(key))));
      this.logger.warn(
        `Guest report blocked by ${hitRule.scope} limit (${hitRule.max} per ${hitRule.windowSeconds}s)`,
      );
      throw new GuestReportLimitExceeded(retryAfter);
    }

    if (admittedKey) await this.call((s) => s.setFlag(admittedKey, ADMITTED_TTL_SECONDS));

    let released = false;
    return {
      release: async () => {
        if (released) return;
        released = true;
        await Promise.all([
          ...taken.map((key) => this.call((s) => s.decr(key))),
          ...(admittedKey ? [this.call((s) => s.del(admittedKey))] : []),
        ]);
      },
    };
  }

  /** Run on Redis; on any Redis failure run the same operation in memory. */
  private async call<T>(op: (store: CounterStore) => Promise<T>): Promise<T> {
    if (this.redis.status === 'ready') {
      try {
        return await withTimeout(op(this.redisStore));
      } catch (err) {
        this.warnOnce(err);
      }
    }
    return op(this.memory);
  }

  private readonly redisStore: CounterStore = {
    incr: async (key, ttlSeconds) => {
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, ttlSeconds);
      return count;
    },
    decr: async (key) => {
      const count = await this.redis.decr(key);
      if (count < 0) await this.redis.del(key);
    },
    setFlag: async (key, ttlSeconds) => {
      await this.redis.set(key, '1', 'EX', ttlSeconds);
    },
    hasFlag: async (key) => (await this.redis.exists(key)) === 1,
    del: async (key) => {
      await this.redis.del(key);
    },
  };

  private warnOnce(err: unknown) {
    if (this.redisWarningLogged) return;
    this.redisWarningLogged = true;
    this.logger.warn(
      `Redis unavailable for guest report limits; counting in memory instead: ${(err as Error)?.message ?? err}`,
    );
  }
}

/** Raw IPs and device ids never reach Redis or the logs. */
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Redis call timed out')), CALL_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
