import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { dispatch_status } from '@prisma/client';
import type { TransportLeg } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RealtimeAudience } from '../../realtime/realtime.service';
import { TransportLegService, type TransportLegResolution } from './transport-leg.service';

/** A cached audience is reused for this long, so a GPS stream does not query per fix. */
export const AUDIENCE_CACHE_TTL_MS = 10_000;
const ACTIVE_DISPATCH_STATUSES: dispatch_status[] = ['PENDING', 'SENT', 'ACCEPTED'];

/** Who may receive one dispatch's leg-sensitive events (plan §17, C6/C17/C18). */
export interface DispatchAudience {
  leg: TransportLegResolution;
  crewUserIds: string[];
  /**
   * The crew confirmed the registered reporter is the person carried on this
   * dispatch's latest transport, open or arrived (Prompt 08B). The reporter's own
   * claim (`is_reporter`, `reporter_status`) is never an input. Always false while
   * REPORTER_DESTINATION_SHARING_ENABLED is off, even when a confirmation is stored.
   */
  reporterConfirmedPatient: boolean;
}

export interface IncidentAudience {
  /** incident_reporters.user_id; null for a guest report. */
  reporterUserId: string | null;
  /** Active dispatches (PENDING/SENT/ACCEPTED) by id. */
  dispatches: Map<string, DispatchAudience>;
}

/**
 * The one place that decides where a dispatch's position, route, ETA and
 * destination may go:
 * - leg TO_SCENE → ops + the incident room;
 * - leg TO_FACILITY / AT_FACILITY → ops + the crew's `user:` rooms + the reporter's
 *   `user:` room only when the crew confirmed the reporter is the patient. Never the
 *   incident room.
 *
 * Launch switch: while REPORTER_DESTINATION_SHARING_ENABLED is not 'true' (default),
 * no reporter is ever in the audience. This is the one place that enforces it; socket
 * emits, `confirmedReporter` and the REST seed all read `load`.
 *
 * Lookups are cached per incident for {@link AUDIENCE_CACHE_TTL_MS} in this process.
 * TransportService invalidates the entry whenever a leg or the confirmation changes,
 * so the cache only saves queries between those changes. A second backend instance
 * would see a change at most one TTL late.
 */
@Injectable()
export class TransportAudienceService {
  private readonly logger = new Logger(TransportAudienceService.name);
  private readonly cache = new Map<string, { expiresAt: number; value: IncidentAudience }>();
  /** Bumped by every invalidation; a load that overlapped one is not cached (it may predate the change). */
  private epoch = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly legs: TransportLegService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Whether a crew confirmation may show the reporter the destination (C17). Off until
   * the LGU Data Protection Officer signs off the rule; only the exact string 'true' turns it on.
   */
  reporterSharingEnabled(): boolean {
    return this.config.get<string>('REPORTER_DESTINATION_SHARING_ENABLED') === 'true';
  }

  /** Cached; for the event path (every GPS fix, every ETA job). */
  async forIncident(incidentId: string): Promise<IncidentAudience> {
    const hit = this.cache.get(incidentId);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    const epoch = this.epoch;
    const value = await this.load(incidentId);
    if (epoch === this.epoch) this.store(incidentId, value);
    return value;
  }

  /** Uncached; for REST responses, which must reflect the database exactly. */
  async load(incidentId: string): Promise<IncidentAudience> {
    const [reporter, dispatches] = await Promise.all([
      this.prisma.incidentReporter.findUnique({ where: { incident_id: incidentId }, select: { user_id: true } }),
      this.prisma.dispatches.findMany({
        where: { incident_id: incidentId, status: { in: ACTIVE_DISPATCH_STATUSES } },
        select: {
          id: true,
          dispatch_crew: { select: { user_id: true } },
          transport_records: {
            orderBy: { created_at: 'desc' },
            take: 1,
            select: { reporter_patient_confirmed_at: true },
          },
        },
      }),
    ]);
    const legs = await Promise.all(dispatches.map((d) => this.legs.resolve(d.id)));
    const sharing = this.reporterSharingEnabled();

    const byDispatch = new Map<string, DispatchAudience>();
    dispatches.forEach((d, i) => {
      const leg = legs[i];
      if (!leg) return;
      byDispatch.set(d.id, {
        leg,
        crewUserIds: d.dispatch_crew.map((c) => c.user_id),
        reporterConfirmedPatient: sharing && !!d.transport_records[0]?.reporter_patient_confirmed_at,
      });
    });
    return { reporterUserId: reporter?.user_id ?? null, dispatches: byDispatch };
  }

  /** A leg or the reporter-patient confirmation changed: the next lookup reads the database. */
  invalidate(incidentId: string): void {
    this.epoch += 1;
    this.cache.delete(incidentId);
  }

  /**
   * Rooms for one of this dispatch's leg-sensitive events. Pass `leg` when the
   * caller has just resolved it (it wins over the cached one). Never throws: when
   * the audience cannot be read, a hospital-leg (or unknown-leg) event goes to ops
   * only, so a failed lookup can never leak a destination.
   */
  async roomsForDispatch(incidentId: string, dispatchId: string, leg?: TransportLeg): Promise<RealtimeAudience> {
    try {
      const audience = await this.forIncident(incidentId);
      return audienceRooms(audience, dispatchId, leg);
    } catch (err) {
      this.logger.warn(`Audience lookup failed for incident ${incidentId}: ${String(err)}`);
      return { incidentRoom: leg === 'TO_SCENE', userIds: [] };
    }
  }

  /** The reporter's user id when the crew confirmed them as this dispatch's patient (C17); otherwise null. */
  async confirmedReporter(incidentId: string, dispatchId: string): Promise<string | null> {
    try {
      const audience = await this.forIncident(incidentId);
      return audience.dispatches.get(dispatchId)?.reporterConfirmedPatient ? audience.reporterUserId : null;
    } catch (err) {
      this.logger.warn(`Audience lookup failed for incident ${incidentId}: ${String(err)}`);
      return null;
    }
  }

  private store(incidentId: string, value: IncidentAudience): void {
    const now = Date.now();
    if (this.cache.size >= 1000) {
      for (const [key, entry] of this.cache) if (entry.expiresAt <= now) this.cache.delete(key);
    }
    this.cache.set(incidentId, { expiresAt: now + AUDIENCE_CACHE_TTL_MS, value });
  }
}

/** The rule itself (see the class comment). An unknown dispatch on a hospital or unknown leg gets ops only. */
export function audienceRooms(audience: IncidentAudience, dispatchId: string, leg?: TransportLeg): RealtimeAudience {
  const entry = audience.dispatches.get(dispatchId);
  const currentLeg = leg ?? entry?.leg.leg;
  if (currentLeg === 'TO_SCENE') return { incidentRoom: true, userIds: [] };
  if (!entry) return { incidentRoom: false, userIds: [] };
  const reporter = entry.reporterConfirmedPatient && audience.reporterUserId ? [audience.reporterUserId] : [];
  return { incidentRoom: false, userIds: [...new Set([...entry.crewUserIds, ...reporter])] };
}
