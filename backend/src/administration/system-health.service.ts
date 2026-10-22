import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { MapProvider, QUEUE_NAMES } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';

/** Every queue in QUEUE_NAMES, injected as one array (see administration.module.ts). */
export const HEALTH_QUEUES = Symbol('HEALTH_QUEUES');
export const HEALTH_QUEUE_NAMES = Object.values(QUEUE_NAMES);

/** BullMQ types its client as an adapter interface without PING; the runtime client is ioredis. */
interface RedisPing {
  ping(): Promise<string>;
}

/** One slow dependency must not hang the endpoint. */
export const HEALTH_CHECK_TIMEOUT_MS = 2000;

export type CheckState = 'ok' | 'error';

export interface QueueHealth {
  name: string;
  status: CheckState;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
}

export interface SystemHealth {
  database: CheckState;
  redis: CheckState;
  queues: QueueHealth[];
  integrations: {
    sms: { configured: boolean; lastFailure?: { at: string; reason: string } };
    push: { configured: boolean };
    maps: { configured: boolean; tiles: string; routing: string };
  };
  timestamp: string;
}

/**
 * Platform health for the System Administrator (MOD-49, role dashboards Phase 5a).
 * Booleans, counts and provider names only: never a key, token, device ID or phone
 * number. Every check has its own timeout and turns into `error`, never a hang.
 */
@Injectable()
export class SystemHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(HEALTH_QUEUES) private readonly queues: Queue[],
  ) {}

  async getHealth(): Promise<SystemHealth> {
    const smsQueue = this.queues.find((q) => q.name === QUEUE_NAMES.SMS);
    const [database, redis, queues, lastSmsFailure] = await Promise.all([
      this.check(() => this.prisma.$queryRaw`SELECT 1`),
      // All queues share the one BullMQ connection (app.module.ts), so one PING covers Redis.
      this.queues[0]
        ? this.check(async () => ((await this.queues[0]!.client) as unknown as RedisPing).ping())
        : Promise.resolve<CheckState>('error'),
      Promise.all(this.queues.map((q) => this.queueHealth(q))),
      smsQueue ? this.lastFailure(smsQueue) : Promise.resolve(undefined),
    ]);

    return {
      database,
      redis,
      queues,
      integrations: {
        sms: {
          configured: this.isSet('TEXTBEE_API_KEY', 'TEXTBEE_DEVICE_ID'),
          ...(lastSmsFailure && { lastFailure: lastSmsFailure }),
        },
        push: { configured: this.isSet('FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY') },
        maps: this.mapsHealth(),
      },
      timestamp: new Date().toISOString(),
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
   * sends swallow their errors in SmsProcessor, so they never show up here.
   */
  private async lastFailure(queue: Queue): Promise<{ at: string; reason: string } | undefined> {
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

  private async check(fn: () => Promise<unknown>): Promise<CheckState> {
    try {
      await withTimeout(fn());
      return 'ok';
    } catch {
      return 'error';
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
