import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { MapProvider, QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageProbe } from './storage-probe';

/** Every queue in QUEUE_NAMES, injected as one array (see administration.module.ts). */
export const HEALTH_QUEUES = Symbol('HEALTH_QUEUES');
export const HEALTH_QUEUE_NAMES = Object.values(QUEUE_NAMES);

/** The parts of the ioredis client used here; BullMQ types its client as an adapter interface. */
interface RedisClient {
  ping(): Promise<string>;
  info?(section?: string): Promise<string>;
  dbsize?(): Promise<number>;
}

/** One slow dependency must not hang the endpoint. */
export const HEALTH_CHECK_TIMEOUT_MS = 2000;
/** HeadBucket goes over the internet to R2, so it gets a little longer. */
export const STORAGE_CHECK_TIMEOUT_MS = 4000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CheckState = 'ok' | 'error';

export interface QueueHealth {
  name: string;
  status: CheckState;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

export interface DatabaseDetails {
  latencyMs: number | null;
  version: string | null;
  postgisVersion: string | null;
  sizeBytes: number | null;
  connections: number | null;
  maxConnections: number | null;
}

export interface RedisDetails {
  latencyMs: number | null;
  version: string | null;
  uptimeSeconds: number | null;
  usedMemoryBytes: number | null;
  /** 0 or null means no limit is set. */
  maxMemoryBytes: number | null;
  memoryPolicy: string | null;
  connectedClients: number | null;
  keys: number | null;
}

export interface StorageDetails {
  configured: boolean;
  provider: string;
  localFallback: boolean;
  latencyMs: number | null;
  /** Incident photos and videos recorded in the database (not a bucket listing). */
  incidentFiles: number | null;
  incidentFileBytes: number | null;
}

export interface SmsCounts {
  accepted: number;
  failed: number;
  notConfigured: number;
}

export interface SystemHealth {
  database: CheckState;
  redis: CheckState;
  storage: CheckState;
  details: {
    database: DatabaseDetails;
    redis: RedisDetails;
    storage: StorageDetails;
  };
  queues: QueueHealth[];
  integrations: {
    sms: {
      configured: boolean;
      lastFailure?: { at: string; reason: string };
      /** From sms_log; null when the log could not be read. */
      last24h?: SmsCounts | null;
      lastAcceptedAt?: string | null;
      inbound24h?: number | null;
    };
    push: { configured: boolean; registeredDevices?: number | null };
    maps: { configured: boolean; tiles: string; routing: string };
  };
  timestamp: string;
  checkDurationMs: number;
}

/**
 * Platform health for the System Administrator (MOD-49). Measured, not assumed: response
 * times, versions, sizes and counts read live from Postgres, Redis, the bucket and the SMS
 * log. Booleans, counts and provider names only: never a key, token, device ID, endpoint
 * or phone number. Every check has its own timeout and turns into `error` or null, never a hang.
 */
@Injectable()
export class SystemHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(HEALTH_QUEUES) private readonly queues: Queue[],
    @Optional() private readonly storageProbe?: StorageProbe,
  ) {}

  async getHealth(): Promise<SystemHealth> {
    const started = Date.now();
    const smsQueue = this.queues.find((q) => q.name === QUEUE_NAMES.SMS);
    const [db, redis, storage, queues, queueSmsFailure, sms, registeredDevices] = await Promise.all([
      this.databaseHealth(),
      this.redisHealth(),
      this.storageHealth(),
      Promise.all(this.queues.map((q) => this.queueHealth(q))),
      smsQueue ? this.lastQueueFailure(smsQueue) : Promise.resolve(undefined),
      this.smsActivity(),
      this.optional(() => this.prisma.system_configurations.count({ where: { config_key: { startsWith: 'fcm_token:' } } })),
    ]);

    // The SMS log covers every kind of SMS; the queue only keeps failed barangay alerts.
    const lastFailure = newest(sms.lastFailure, queueSmsFailure);

    return {
      database: db.state,
      redis: redis.state,
      storage: storage.state,
      details: { database: db.details, redis: redis.details, storage: storage.details },
      queues,
      integrations: {
        sms: {
          configured: this.isSet('TEXTBEE_API_KEY', 'TEXTBEE_DEVICE_ID'),
          ...(lastFailure && { lastFailure }),
          last24h: sms.last24h,
          lastAcceptedAt: sms.lastAcceptedAt,
          inbound24h: sms.inbound24h,
        },
        push: {
          configured: this.isSet('FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'),
          registeredDevices,
        },
        maps: this.mapsHealth(),
      },
      timestamp: new Date().toISOString(),
      checkDurationMs: Date.now() - started,
    };
  }

  private async databaseHealth(): Promise<{ state: CheckState; details: DatabaseDetails }> {
    const details: DatabaseDetails = {
      latencyMs: null, version: null, postgisVersion: null, sizeBytes: null, connections: null, maxConnections: null,
    };
    const latency = await this.timed(() => this.prisma.$queryRaw`SELECT 1`);
    if (latency === null) return { state: 'error', details };
    details.latencyMs = latency;

    const [stats, postgis] = await Promise.all([
      this.optional(() => this.prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT current_setting('server_version') AS version,
               pg_database_size(current_database()) AS size_bytes,
               (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS connections,
               current_setting('max_connections') AS max_connections`),
      this.optional(() => this.prisma.$queryRaw<Array<Record<string, unknown>>>`SELECT postgis_lib_version() AS version`),
    ]);
    const row = Array.isArray(stats) ? stats[0] : undefined;
    if (row) {
      details.version = typeof row['version'] === 'string' ? row['version'].split(' ')[0]! : null;
      details.sizeBytes = toNumber(row['size_bytes']);
      details.connections = toNumber(row['connections']);
      details.maxConnections = toNumber(row['max_connections']);
    }
    const gis = Array.isArray(postgis) ? postgis[0]?.['version'] : undefined;
    details.postgisVersion = typeof gis === 'string' ? gis : null;
    return { state: 'ok', details };
  }

  private async redisHealth(): Promise<{ state: CheckState; details: RedisDetails }> {
    const details: RedisDetails = {
      latencyMs: null, version: null, uptimeSeconds: null, usedMemoryBytes: null,
      maxMemoryBytes: null, memoryPolicy: null, connectedClients: null, keys: null,
    };
    const first = this.queues[0];
    if (!first) return { state: 'error', details };

    // All queues share the one BullMQ connection (app.module.ts), so one client covers Redis.
    let client: RedisClient;
    try {
      client = (await withTimeout(first.client)) as unknown as RedisClient;
    } catch {
      return { state: 'error', details };
    }
    const latency = await this.timed(() => client.ping());
    if (latency === null) return { state: 'error', details };
    details.latencyMs = latency;

    const [info, keys] = await Promise.all([
      client.info ? this.optional(() => client.info!()) : Promise.resolve(null),
      client.dbsize ? this.optional(() => client.dbsize!()) : Promise.resolve(null),
    ]);
    if (typeof info === 'string') {
      const fields = parseRedisInfo(info);
      details.version = fields['redis_version'] ?? null;
      details.uptimeSeconds = toNumber(fields['uptime_in_seconds']);
      details.usedMemoryBytes = toNumber(fields['used_memory']);
      details.maxMemoryBytes = toNumber(fields['maxmemory']);
      details.memoryPolicy = fields['maxmemory_policy'] ?? null;
      details.connectedClients = toNumber(fields['connected_clients']);
    }
    details.keys = typeof keys === 'number' ? keys : null;
    return { state: 'ok', details };
  }

  private async storageHealth(): Promise<{ state: CheckState; details: StorageDetails }> {
    const described = this.storageProbe?.describe() ?? { configured: false, provider: 'Not set', localFallback: true };
    const files = await this.optional(() =>
      this.prisma.incidentAttachment.aggregate({ _count: { _all: true }, _sum: { file_size_bytes: true } }),
    );
    const details: StorageDetails = {
      ...described,
      latencyMs: null,
      incidentFiles: files?._count?._all ?? null,
      incidentFileBytes: files ? toNumber(files._sum?.file_size_bytes ?? 0) : null,
    };
    if (!this.storageProbe || !described.configured) return { state: 'error', details };
    const probe = this.storageProbe;
    details.latencyMs = await this.timed(() => probe.headBucket(), STORAGE_CHECK_TIMEOUT_MS);
    return { state: details.latencyMs === null ? 'error' : 'ok', details };
  }

  /** Last 24 h from sms_log; each part is null when it can't be read. */
  private async smsActivity(): Promise<{
    last24h: SmsCounts | null;
    lastAcceptedAt: string | null;
    lastFailure: { at: string; reason: string } | undefined;
    inbound24h: number | null;
  }> {
    const since = new Date(Date.now() - DAY_MS);
    const [groups, accepted, failed, inbound] = await Promise.all([
      this.optional(() => this.prisma.sms_log.groupBy({ by: ['status'], where: { created_at: { gte: since } }, _count: { _all: true } })),
      this.optional(() => this.prisma.sms_log.findFirst({ where: { status: 'ACCEPTED' }, orderBy: { created_at: 'desc' }, select: { created_at: true } })),
      this.optional(() =>
        this.prisma.sms_log.findFirst({
          where: { status: { in: ['FAILED', 'NOT_CONFIGURED'] } },
          orderBy: { created_at: 'desc' },
          select: { created_at: true, error: true, gateway_status: true },
        }),
      ),
      this.optional(() => this.prisma.barangay_sms_inbound.count({ where: { received_at: { gte: since } } })),
    ]);

    let last24h: SmsCounts | null = null;
    if (Array.isArray(groups)) {
      const count = (status: string) => groups.find((g) => g.status === status)?._count?._all ?? 0;
      last24h = { accepted: count('ACCEPTED'), failed: count('FAILED'), notConfigured: count('NOT_CONFIGURED') };
    }
    return {
      last24h,
      lastAcceptedAt: accepted ? accepted.created_at.toISOString() : null,
      lastFailure: failed
        ? { at: failed.created_at.toISOString(), reason: scrubReason(failed.error ?? (failed.gateway_status ? `HTTP ${failed.gateway_status}` : undefined)) }
        : undefined,
      inbound24h: typeof inbound === 'number' ? inbound : null,
    };
  }

  private async queueHealth(queue: Queue): Promise<QueueHealth> {
    try {
      const counts = await withTimeout(queue.getJobCounts('waiting', 'active', 'failed', 'delayed'));
      return {
        name: queue.name,
        status: 'ok',
        waiting: counts['waiting'] ?? 0,
        active: counts['active'] ?? 0,
        failed: counts['failed'] ?? 0,
        delayed: counts['delayed'] ?? 0,
      };
    } catch {
      return { name: queue.name, status: 'error', waiting: 0, active: 0, failed: 0, delayed: 0 };
    }
  }

  /**
   * Newest failed SMS job. Only critical jobs (barangay alerts) fail in BullMQ; ordinary
   * sends swallow their errors in SmsProcessor (they are in sms_log instead).
   */
  private async lastQueueFailure(queue: Queue): Promise<{ at: string; reason: string } | undefined> {
    try {
      const [job] = await withTimeout(queue.getFailed(0, 0));
      if (!job) return undefined;
      const at = job.finishedOn ?? job.processedOn ?? job.timestamp;
      return { at: new Date(at).toISOString(), reason: scrubReason(job.failedReason) };
    } catch {
      return undefined;
    }
  }

  private mapsHealth(): SystemHealth['integrations']['maps'] {
    const hasKey = this.isSet('MAP_API_KEY');
    const provider = (this.config.get<string>('MAP_PROVIDER') ?? MapProvider.MAPBOX).toLowerCase();
    const tiles = provider === MapProvider.MAPLIBRE || provider === 'osm' ? 'maplibre' : 'mapbox';
    // Same fallback as maps.module.ts: Mapbox routing only when selected and a key exists.
    const routing = (this.config.get<string>('MAP_ROUTER') ?? 'osrm').toLowerCase() === 'mapbox' && hasKey ? 'mapbox' : 'osrm';
    // OSM tiles, OSRM and Nominatim need no key; Mapbox tiles do.
    return { configured: tiles === 'maplibre' || hasKey, tiles, routing };
  }

  private isSet(...keys: string[]): boolean {
    return keys.every((key) => Boolean(this.config.get<string>(key)?.trim()));
  }

  /** Milliseconds the call took, or null when it failed or timed out. */
  private async timed(fn: () => Promise<unknown>, ms = HEALTH_CHECK_TIMEOUT_MS): Promise<number | null> {
    const start = performance.now();
    try {
      await withTimeout(fn(), ms);
      return Math.max(1, Math.round(performance.now() - start));
    } catch {
      return null;
    }
  }

  /** The value, or null when the call failed or timed out (a missing metric, not an outage). */
  private async optional<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await withTimeout(Promise.resolve().then(fn));
    } catch {
      return null;
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms = HEALTH_CHECK_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** `INFO` output → key/value pairs (sections and comments dropped). */
export function parseRedisInfo(info: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of info.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf(':');
    if (at > 0) fields[line.slice(0, at)] = line.slice(at + 1).trim();
  }
  return fields;
}

/** bigint / numeric string / number → number; anything else → null. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    const n = Number(String(value)); // Prisma Decimal
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function newest<T extends { at: string }>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a.at) >= Date.parse(b.at) ? a : b;
}

/**
 * A job's failure text is shown to the admin, so strip anything that could be a
 * phone number or a credential and keep it short.
 */
export function scrubReason(reason: string | undefined): string {
  if (!reason) return 'Unknown error';
  return reason
    .replace(/\+?\d[\d\s-]{8,}\d/g, '[number]')
    .replace(/[A-Za-z0-9_\-+/=]{24,}/g, '[redacted]')
    .slice(0, 200);
}
