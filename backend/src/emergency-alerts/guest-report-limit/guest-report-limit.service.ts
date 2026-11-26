import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { GUEST_REPORT_ENDED_STATUSES, IncidentStatus, guestNewReportGate } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Where a guest report came from. Either part may be missing. */
export interface GuestSource {
  /** Client IP as Express resolved it (trust proxy applied). */
  ip?: string | undefined;
  /** Random per-install id the mobile app sends in X-Device-Id. Not hardware-derived. */
  deviceId?: string | undefined;
  /** E.164 sender of a citizen SOS by SMS (MOD-17/19). A real SIM, so the limits are per number. */
  phone?: string | undefined;
  /**
   * Network + place: the IP and a ~200 m grid cell of the report's GPS (see spotKey).
   * Catches one person sending the same emergency from several phones.
   */
  spot?: string | undefined;
}

export type GuestLimitScope = 'device' | 'ip' | 'phone' | 'spot';
/**
 * Why a guest report was refused: a counter, `open` (this phone's last report is still
 * open), or `wait` (its last report was marked a false alert a few minutes ago).
 */
export type GuestBlockReason = GuestLimitScope | 'open' | 'wait';

interface LimitRule {
  scope: GuestLimitScope;
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
  // On top of these, a phone whose last guest report is still open can't send another
  // (see openReportOf), so these only matter once reports get closed.
  { scope: 'device', windowSeconds: 10 * 60, max: 2 },
  { scope: 'device', windowSeconds: 24 * 60 * 60, max: 3 },
  { scope: 'ip', windowSeconds: 10 * 60, max: 20 },
  { scope: 'ip', windowSeconds: 24 * 60 * 60, max: 100 },
  // SMS reports: only an SOS text carries a phone. A SIM is harder to replace than an
  // install id, but a neighbour may text for several households in a flood.
  { scope: 'phone', windowSeconds: 10 * 60, max: 3 },
  { scope: 'phone', windowSeconds: 24 * 60 * 60, max: 10 },
  // Same network, same place: several phones on one connection reporting one spot.
  // MDRRMO already has that emergency by the third; a fourth adds nothing but noise.
  // Other networks (other neighbours) are not affected.
  { scope: 'spot', windowSeconds: 10 * 60, max: 3 },
];

/** Grid size for `spot`: 0.002° ≈ 220 m north–south, ≈ 215 m east–west in Bocaue. */
const SPOT_CELL_DEGREES = 0.002;

/** The `spot` value for a report: its IP and GPS grid cell. Undefined without both. */
export function spotKey(ip: string | undefined, lat: unknown, lng: unknown): string | undefined {
  if (!ip || typeof lat !== 'number' || typeof lng !== 'number') return undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return `${ip}|${Math.round(lat / SPOT_CELL_DEGREES)}|${Math.round(lng / SPOT_CELL_DEGREES)}`;
}

/** Reports counted in the current 10-minute window, per scope (after this one). */
export type GuestReportCounts = Partial<Record<GuestLimitScope, number>>;

/** A retry of an already-admitted report (same idempotency key) is free for this long. */
const ADMITTED_TTL_SECONDS = 24 * 60 * 60;
/**
 * How long a phone is tied to its last guest report. A report still open after this
 * (forgotten in the queue) no longer blocks that phone; the daily device cap still applies.
 */
export const OPEN_REPORT_TTL_SECONDS = 24 * 60 * 60;
/** Shared with the guest status screen, so the app and this refusal always agree. */
export { GUEST_REPORT_ENDED_STATUSES };

/** This phone's last guest report, when it still holds back a new one. */
type PhoneBlock =
  | { reason: 'open'; reference: string }
  | { reason: 'wait'; reference: string; retryAfterSeconds: number };
/** Merge chains followed upward when checking a DUPLICATE report. */
const MAX_MERGE_DEPTH = 3;
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
  /** A retry of an already-counted report (same idempotency key), or limits are off. */
  readonly repeat: boolean;
  /** Reports in the shortest window per scope, this one included. */
  readonly counts: GuestReportCounts;
}

const NO_LEASE: GuestReportLease = { release: async () => undefined, repeat: true, counts: {} };

export class GuestReportLimitExceeded extends HttpException {
  constructor(
    /** Seconds until a counter frees up; 0 when it depends on the open report ending. */
    readonly retryAfterSeconds: number,
    /** Which limit was reached (recorded in Security Events). */
    readonly scope: GuestBlockReason = 'device',
    /** That limit, for the security event. */
    readonly rule?: { windowSeconds: number; max: number },
    /** For `open` / `wait`: the reference of this phone's last report. */
    readonly openReference?: string,
  ) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        code: scope === 'open' ? 'GUEST_REPORT_OPEN' : scope === 'wait' ? 'GUEST_REPORT_WAIT' : 'GUEST_REPORT_LIMIT',
        retryAfterSeconds,
        ...(openReference && { publicReference: openReference }),
        message: limitMessage(scope, retryAfterSeconds, openReference),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** What the guest reads on the "Report Not Sent" screen. Always names the hotlines. */
function limitMessage(scope: GuestBlockReason, retryAfterSeconds: number, openReference?: string): string {
  if (scope === 'open') {
    return (
      `You already sent report ${openReference ?? 'from this phone'}, and MDRRMO is still handling it. ` +
      'You can send a new report once it is closed. ' +
      'If this is a different emergency, call 911 or the Bocaue MDRRMO hotline now, or sign in to report right away.'
    );
  }
  if (scope === 'spot') {
    return (
      'This emergency was already reported several times from your connection at this place, and MDRRMO has it. ' +
      'If this is a different emergency, call 911 or the Bocaue MDRRMO hotline now, or sign in to report right away.'
    );
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const wait = minutes >= 120 ? `${Math.ceil(minutes / 60)} hours` : `${minutes} minute${minutes === 1 ? '' : 's'}`;
  if (scope === 'wait') {
    return (
      `Your last report ${openReference ?? 'from this phone'} was marked a false alert by MDRRMO. ` +
      `You can send a new report in about ${wait}. ` +
      'If this is an emergency, call 911 or the Bocaue MDRRMO hotline now, or sign in to report right away.'
    );
  }
  return (
    'Too many reports were sent from this phone without an account. ' +
    'If this is an emergency, call 911 or the Bocaue MDRRMO hotline now. ' +
    `You can send another report in about ${wait}, or sign in to report right away.`
  );
}

/** Minimal counter store so Redis and the in-memory fallback share one code path. */
interface CounterStore {
  incr(key: string, ttlSeconds: number): Promise<number>;
  decr(key: string): Promise<void>;
  setFlag(key: string, ttlSeconds: number): Promise<void>;
  hasFlag(key: string): Promise<boolean>;
  setText(key: string, text: string, ttlSeconds: number): Promise<void>;
  getText(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
}

class MemoryStore implements CounterStore {
  private readonly entries = new Map<string, { value: number; text?: string; expiresAt: number }>();

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

  async setText(key: string, text: string, ttlSeconds: number) {
    this.prune();
    this.entries.set(key, { value: 1, text, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async getText(key: string) {
    return this.live(key)?.text ?? null;
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

  constructor(
    config: ConfigService,
    /** Reads the status of a phone's last report. Without it, the one-open-report rule is off. */
    @Optional() private readonly prisma?: PrismaService,
  ) {
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
   * this phone's last guest report is still open, or when any limit is already used up
   * (nothing stays counted in that case). A retry with an idempotency key that was
   * already admitted is not counted again, and is never refused.
   */
  async reserve(source: GuestSource, idempotencyKey?: string): Promise<GuestReportLease> {
    // Off: nothing is counted, but the report is still a new one (and still recorded).
    if (!this.enabled) return { ...NO_LEASE, repeat: false };

    const admittedKey = idempotencyKey ? `${KEY_PREFIX}admitted:${hash(idempotencyKey)}` : null;
    if (admittedKey && (await this.call((s) => s.hasFlag(admittedKey)))) return NO_LEASE;

    // One open report per phone (the same emergency is already with MDRRMO), and a short
    // wait after one was marked a false alert.
    if (source.deviceId) {
      const block = await this.blockOf(source.deviceId);
      if (block?.reason === 'open') {
        this.logger.warn('Guest report refused: this phone has a report that is still open');
        throw new GuestReportLimitExceeded(0, 'open', undefined, block.reference);
      }
      if (block?.reason === 'wait') {
        this.logger.warn('Guest report refused: this phone\'s last report was a false alert a few minutes ago');
        throw new GuestReportLimitExceeded(block.retryAfterSeconds, 'wait', undefined, block.reference);
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const taken: string[] = [];
    const counts: GuestReportCounts = {};
    let retryAfter = 0;
    let hitRule: LimitRule | null = null;

    for (const rule of GUEST_REPORT_RULES) {
      const value = source[rule.scope === 'device' ? 'deviceId' : rule.scope];
      if (!value) continue;
      const bucket = Math.floor(now / rule.windowSeconds);
      const key = `${KEY_PREFIX}${rule.scope}:${hash(`${rule.scope}:${value}`)}:${rule.windowSeconds}:${bucket}`;
      const count = await this.call((s) => s.incr(key, rule.windowSeconds));
      taken.push(key);
      // Rules are listed shortest window first, so the first count per scope is the 10-minute one.
      if (counts[rule.scope] === undefined) counts[rule.scope] = count;
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
      throw new GuestReportLimitExceeded(retryAfter, hitRule.scope, {
        windowSeconds: hitRule.windowSeconds,
        max: hitRule.max,
      });
    }

    if (admittedKey) await this.call((s) => s.setFlag(admittedKey, ADMITTED_TTL_SECONDS));

    let released = false;
    return {
      repeat: false,
      counts,
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

  /**
   * Tie this phone to the report it just created, so the next guest report from it is
   * refused while this one is open. Never throws: the report is already saved.
   */
  async rememberOpen(deviceId: string | undefined, incidentId: string | undefined): Promise<void> {
    if (!this.enabled || !this.prisma || !deviceId || !incidentId) return;
    try {
      await this.call((s) => s.setText(openKey(deviceId), incidentId, OPEN_REPORT_TTL_SECONDS));
    } catch (err) {
      this.logger.warn(`Could not remember a guest's open report: ${(err as Error)?.message ?? err}`);
    }
  }

  /**
   * This phone's last guest report, if it still holds back a new one: open (a report
   * merged into another counts as open while that one is), or marked a false alert
   * less than GUEST_FALSE_ALERT_WAIT_SECONDS ago. The guest's own reference is named,
   * never the other reporter's. Any lookup failure lets the report through: an outage
   * must never block help.
   */
  private async blockOf(deviceId: string, now = new Date()): Promise<PhoneBlock | null> {
    if (!this.prisma) return null;
    const key = openKey(deviceId);
    try {
      let id: string | null = await this.call((s) => s.getText(key));
      if (!id) return null;
      let reference: string | null = null;
      for (let depth = 0; id && depth < MAX_MERGE_DEPTH; depth++) {
        const row: {
          status: unknown;
          public_reference: string;
          duplicate_of_id: string | null;
          submitted_at: Date;
          incident_events: { occurred_at: Date }[];
        } | null = await this.prisma.incident.findUnique({
          where: { id },
          select: {
            status: true,
            public_reference: true,
            duplicate_of_id: true,
            submitted_at: true,
            // When the current status was reached: same source as the guest status screen.
            incident_events: { select: { occurred_at: true }, orderBy: { occurred_at: 'desc' }, take: 1 },
          },
        });
        if (!row) break;
        reference ??= row.public_reference;
        const status = String(row.status);
        if (status === IncidentStatus.DUPLICATE) {
          id = row.duplicate_of_id;
          continue;
        }
        const gate = guestNewReportGate(status, row.incident_events?.[0]?.occurred_at ?? row.submitted_at, now);
        if (gate?.reason === 'open') return { reason: 'open', reference };
        if (gate?.reason === 'wait') {
          const retryAfterSeconds = Math.max(1, Math.ceil((gate.until.getTime() - now.getTime()) / 1000));
          return { reason: 'wait', reference, retryAfterSeconds };
        }
        break;
      }
      // Ended (and any wait is over), merged into a report that ended, or gone: free the phone.
      await this.call((s) => s.del(key));
      return null;
    } catch (err) {
      this.logger.warn(`Open guest report check skipped: ${(err as Error)?.message ?? err}`);
      return null;
    }
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
    setText: async (key, text, ttlSeconds) => {
      await this.redis.set(key, text, 'EX', ttlSeconds);
    },
    getText: async (key) => this.redis.get(key),
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

/** Redis key holding the incident id of a phone's last guest report. */
function openKey(deviceId: string): string {
  return `${KEY_PREFIX}open:${hash(`open:${deviceId}`)}`;
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Redis call timed out')), CALL_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
