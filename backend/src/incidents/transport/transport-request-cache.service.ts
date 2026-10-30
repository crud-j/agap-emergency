import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const KEY_PREFIX = 'transport:req:';
/** A Redis call slower than this is treated as unavailable. */
const CALL_TIMEOUT_MS = 250;
/** Plan §19: a retried transport mutation is recognised for 24 h. */
export const TRANSPORT_REQUEST_TTL_SECONDS = 24 * 60 * 60;

/** The answer a transport mutation gave, kept so a retry gets the same one. */
export interface StoredTransportResponse {
  incidentId: string;
  response: unknown;
}

/**
 * Responses of transport mutations by (dispatch, clientRequestId) (plan §19, Rule 12).
 * Redis only speeds up a retry; it never decides whether one is a duplicate on its own.
 * Every call fails open (get → null, set → no-op): TransportService then falls back to
 * the clientRequestId stored in the audit row, so a Redis outage never creates a
 * second record.
 */
@Injectable()
export class TransportRequestCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(TransportRequestCacheService.name);
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

  async get(dispatchId: string, clientRequestId: string): Promise<StoredTransportResponse | null> {
    try {
      const raw = await withTimeout(this.redis.get(requestKey(dispatchId, clientRequestId)));
      return raw ? (JSON.parse(raw) as StoredTransportResponse) : null;
    } catch (err) {
      this.warnOnce(err);
      return null;
    }
  }

  async set(dispatchId: string, clientRequestId: string, value: StoredTransportResponse): Promise<void> {
    try {
      await withTimeout(
        this.redis.set(
          requestKey(dispatchId, clientRequestId),
          JSON.stringify(value),
          'EX',
          TRANSPORT_REQUEST_TTL_SECONDS,
        ),
      );
    } catch (err) {
      this.warnOnce(err);
    }
  }

  private warnOnce(err: unknown) {
    if (this.redisWarningLogged) return;
    this.redisWarningLogged = true;
    this.logger.warn(
      `Redis unavailable for transport retries; the audit log is checked instead: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function requestKey(dispatchId: string, clientRequestId: string): string {
  return `${KEY_PREFIX}${dispatchId}:${clientRequestId}`;
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), CALL_TIMEOUT_MS)),
  ]);
}
