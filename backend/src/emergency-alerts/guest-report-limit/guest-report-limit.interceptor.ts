import { CallHandler, ExecutionContext, Injectable, NestInterceptor, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { isIP } from 'net';
import { Observable, catchError, from, mergeMap, tap, throwError } from 'rxjs';
import { AuditAction, UserRole } from '@agap/shared';
import { AuditService, type AuditLogEntry } from '../../audit/audit.service';
import {
  GuestReportLimitExceeded,
  GuestReportLimitService,
  normalizeDeviceId,
  spotKey,
  type GuestReportLease,
} from './guest-report-limit.service';

/** Header the mobile app uses to send its random per-install id. */
export const DEVICE_ID_HEADER = 'x-device-id';

/** No account, or the short-lived bystander account from POST /auth/register/guest. */
export function isGuestRequest(req: { user?: { id?: string; role?: string } | null }): boolean {
  return !req.user?.id || req.user.role === UserRole.BYSTANDER;
}

/**
 * Short code for a device id in Security Events: enough to tell two phones apart, not
 * the id itself (which the phone sends as its guest-limit key).
 */
export function deviceCode(deviceId: string | undefined): string | null {
  return deviceId ? createHash('sha256').update(`device:${deviceId}`).digest('hex').slice(0, 8) : null;
}

/** GPS from either report shape: POST /incidents (lat/lng) or the SOS/shake alerts. */
function reportCoordinates(body: Record<string, unknown>): { lat: unknown; lng: unknown } {
  return { lat: body['lat'] ?? body['latitude'], lng: body['lng'] ?? body['longitude'] };
}

/** The created incident's id and reference from either endpoint's response. */
function createdIncident(result: unknown): { id: string | undefined; ref: string | undefined } {
  const r = (result ?? {}) as Record<string, any>;
  const inc = r['incident'] && typeof r['incident'] === 'object' ? r['incident'] : r;
  return {
    id: typeof inc['id'] === 'string' ? inc['id'] : undefined,
    ref: typeof inc['public_reference'] === 'string' ? inc['public_reference'] : undefined,
  };
}

/**
 * Applies GuestReportLimitService to an emergency-report endpoint. Runs after the
 * auth guards (so req.user is known) and before the handler. If the handler fails
 * — validation, geofence, database — the counters are given back, so only reports
 * that were actually created count against the limit.
 *
 * Every guest report, and every refusal, is written to Security Events with the
 * client IP and a short device code (MOD-46/49). A report from a network that already
 * reported the same place in the last 10 minutes is marked as a repeat.
 */
@Injectable()
export class GuestReportLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly limiter: GuestReportLimitService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    if (!isGuestRequest(req)) return next.handle();

    const body = (req.body ?? {}) as Record<string, unknown>;
    const key = body['idempotencyKey'] ?? body['clientEventId'];
    const deviceId = normalizeDeviceId(req.headers?.[DEVICE_ID_HEADER]);
    const { lat, lng } = reportCoordinates(body);
    const ip: string | undefined = typeof req.ip === 'string' && isIP(req.ip) ? req.ip : undefined;
    const userAgent = typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 512) : undefined;
    const device = deviceCode(deviceId);

    let lease: GuestReportLease;
    try {
      lease = await this.limiter.reserve(
        { ip: req.ip, deviceId, ...(spotKey(ip, lat, lng) ? { spot: spotKey(ip, lat, lng) } : {}) },
        typeof key === 'string' && key ? key : undefined,
      );
    } catch (err) {
      if (err instanceof GuestReportLimitExceeded) {
        // `open` has no fixed wait: it ends when the open report does.
        if (err.retryAfterSeconds > 0) http.getResponse().setHeader?.('Retry-After', String(err.retryAfterSeconds));
        this.record({
          action: AuditAction.GUEST_REPORT_BLOCKED,
          moduleId: 'MOD-06',
          entityType: 'guest_report',
          ipAddress: ip,
          userAgent,
          newValues: {
            reason: `LIMIT_${err.scope.toUpperCase()}`,
            device,
            ...(err.rule && { limit: err.rule.max, windowMinutes: Math.round(err.rule.windowSeconds / 60) }),
            ...(err.openReference && { openReport: err.openReference }),
            retryAfterSeconds: err.retryAfterSeconds,
          },
        });
      }
      throw err;
    }

    return next.handle().pipe(
      tap((result) => {
        const created = createdIncident(result);
        // This phone can't send another guest report while this one is open.
        void this.limiter.rememberOpen(deviceId, created.id);
        // A retry of a report already counted (same idempotency key) is not a new report.
        if (lease.repeat) return;
        const sameSpot = lease.counts.spot ?? 0;
        this.record({
          action: sameSpot > 1 ? AuditAction.GUEST_REPORT_REPEAT : AuditAction.GUEST_REPORT,
          moduleId: 'MOD-06',
          entityType: 'incident',
          entityId: created.id,
          ...(created.id && { incidentId: created.id }),
          ipAddress: ip,
          userAgent,
          newValues: {
            ...(created.ref && { publicReference: created.ref }),
            device,
            ...(lease.counts.ip !== undefined && { networkReports10m: lease.counts.ip }),
            ...(lease.counts.spot !== undefined && { samePlaceReports10m: sameSpot }),
          },
        });
      }),
      catchError((err) => from(lease.release()).pipe(mergeMap(() => throwError(() => err)))),
    );
  }

  /** Fire and forget: a failed security-event write never touches the report. */
  private record(entry: AuditLogEntry): void {
    try {
      void Promise.resolve(this.audit?.log(entry)).catch(() => undefined);
    } catch {
      // A synchronous throw is swallowed the same way.
    }
  }
}
