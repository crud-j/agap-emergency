import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { EventEmitter } from 'events';

const KEY_PREFIX = 'auth:revoked:';
const REVOKED_EVENT = 'revoked';
/** A Redis lookup slower than this is treated as unavailable (see isRevoked). */
const CHECK_TIMEOUT_MS = 250;

/**
 * Makes session revocation take effect on access tokens immediately (plan §6.2 step 4).
 *
 * Access tokens carry a `sid` claim. Revoking a session marks the DB row AND writes
 * `auth:revoked:<sid>` to Redis with a TTL equal to the access-token lifetime, so
 * the JWT strategy and WebSocket gateway can reject the token with one EXISTS.
 *
 * Redis is an accelerator, not the source of truth: if it is unreachable the check
 * fails OPEN (logged). Dispatchers must never be locked out of the console because
 * Redis is down; the DB-level revocation still stops the session at its next
 * refresh, so the worst case is the access-token lifetime (default 15 min).
 */
@Injectable()
export class SessionRevocationService implements OnModuleDestroy {
  private readonly logger = new Logger(SessionRevocationService.name);
  private readonly redis: Redis;
  private readonly ttlSeconds: number;
  /**
   * In-process notification so the WebSocket gateway can drop open sockets of a
   * revoked session immediately. AGAP is a single-instance modular monolith; a
   * multi-instance deployment would need Redis pub/sub here instead.
   */
  private readonly events = new EventEmitter();

  constructor(config: ConfigService) {
    this.redis = new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
      lazyConnect: true,
      // Fail fast instead of queueing commands while disconnected.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    this.redis.on('error', (err) => this.logger.warn(`Redis unavailable for session revocation: ${err.message}`));
    void this.redis.connect().catch(() => undefined);
    this.ttlSeconds = parseDurationSeconds(config.get<string>('JWT_EXPIRES_IN', '15m'));
  }

  async onModuleDestroy() {
    this.redis.disconnect();
  }

  /** Mark sessions revoked for the remaining lifetime of any access token issued for them. */
  async markRevoked(sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) return;
    this.events.emit(REVOKED_EVENT, sessionIds);
    try {
      const pipeline = this.redis.pipeline();
      for (const sid of sessionIds) pipeline.set(KEY_PREFIX + sid, '1', 'EX', this.ttlSeconds);
      await pipeline.exec();
    } catch (err) {
      this.logger.error(
        `Could not publish ${sessionIds.length} revoked session(s) to Redis — ` +
          `they stay valid until access-token expiry: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Subscribe to revocations (session ids). Returns an unsubscribe function. */
  onRevoked(listener: (sessionIds: string[]) => void): () => void {
    this.events.on(REVOKED_EVENT, listener);
    return () => this.events.off(REVOKED_EVENT, listener);
  }

  /** True when the session was revoked. Fails open (false) when Redis is unavailable. */
  async isRevoked(sessionId: string | undefined): Promise<boolean> {
    if (!sessionId) return false; // tokens issued before `sid` existed
    try {
      const exists = await Promise.race([
        this.redis.exists(KEY_PREFIX + sessionId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS),
        ),
      ]);
      return exists === 1;
    } catch {
      return false;
    }
  }

  /**
   * Revoke every live session of a user inside the caller's transaction and return
   * their ids. Call markRevoked() with the result AFTER the transaction commits.
   */
  async revokeAllForUser(
    tx: Prisma.TransactionClient,
    userId: string,
    exceptSessionId?: string,
  ): Promise<string[]> {
    const live = await tx.user_sessions.findMany({
      where: {
        user_id: userId,
        is_revoked: false,
        ...(exceptSessionId && { id: { not: exceptSessionId } }),
      },
      select: { id: true },
    });
    if (live.length === 0) return [];
    const ids = live.map((s) => s.id);
    await tx.user_sessions.updateMany({
      where: { id: { in: ids } },
      data: { is_revoked: true },
    });
    return ids;
  }
}

/** '15m' | '1h' | '7d' | '900' (seconds) → seconds. Unparseable → 24 h (safe upper bound). */
export function parseDurationSeconds(value: string): number {
  const match = /^\s*(\d+)\s*([smhd]?)\s*$/i.exec(value ?? '');
  if (!match) return 24 * 60 * 60;
  const n = Number(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  const factor = unit === 'm' ? 60 : unit === 'h' ? 3600 : unit === 'd' ? 86400 : 1;
  return Math.max(1, n * factor);
}
