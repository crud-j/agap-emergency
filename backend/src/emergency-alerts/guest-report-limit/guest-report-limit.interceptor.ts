import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import { UserRole } from '@agap/shared';
import {
  GuestReportLimitExceeded,
  GuestReportLimitService,
  normalizeDeviceId,
  type GuestReportLease,
} from './guest-report-limit.service';

/** Header the mobile app uses to send its random per-install id. */
export const DEVICE_ID_HEADER = 'x-device-id';

/** No account, or the short-lived bystander account from POST /auth/register/guest. */
export function isGuestRequest(req: { user?: { id?: string; role?: string } | null }): boolean {
  return !req.user?.id || req.user.role === UserRole.BYSTANDER;
}

/**
 * Applies GuestReportLimitService to an emergency-report endpoint. Runs after the
 * auth guards (so req.user is known) and before the handler. If the handler fails
 * — validation, geofence, database — the counters are given back, so only reports
 * that were actually created count against the limit.
 */
@Injectable()
export class GuestReportLimitInterceptor implements NestInterceptor {
  constructor(private readonly limiter: GuestReportLimitService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    if (!isGuestRequest(req)) return next.handle();

    const body = req.body ?? {};
    const key = body.idempotencyKey ?? body.clientEventId;

    let lease: GuestReportLease;
    try {
      lease = await this.limiter.reserve(
        { ip: req.ip, deviceId: normalizeDeviceId(req.headers?.[DEVICE_ID_HEADER]) },
        typeof key === 'string' && key ? key : undefined,
      );
    } catch (err) {
      if (err instanceof GuestReportLimitExceeded) {
        http.getResponse().setHeader?.('Retry-After', String(err.retryAfterSeconds));
      }
      throw err;
    }

    return next.handle().pipe(
      catchError((err) => from(lease.release()).pipe(mergeMap(() => throwError(() => err)))),
    );
  }
}
