import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Incident } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  IncidentType,
  DUPLICATE_DETECTION_RADIUS_METERS,
  DUPLICATE_DETECTION_WINDOW_MINUTES,
} from '@agap/shared';

export interface DuplicateCandidate {
  incidentId: string;
  distanceMeters: number;
}

/**
 * How far along the earlier, similar report is, in words a reporter understands.
 * Sent back to whoever submits a nearby same-category report so they know help is
 * already moving (MOD-26 + MOD-42). Never carries the other report's reference,
 * reporter or patient (Rule 15) — only its stage and age.
 */
export type SimilarReportStage = 'RECEIVED' | 'ASSESSING' | 'RESPONDING' | 'ON_SCENE' | 'RESOLVED';

export interface SimilarReportHint {
  stage: SimilarReportStage;
  /** Whole minutes since the earlier report was submitted. */
  minutesAgo: number;
}

const STAGE_BY_STATUS: Record<string, SimilarReportStage> = {
  SUBMITTED: 'RECEIVED',
  RECEIVED: 'RECEIVED',
  ACKNOWLEDGED: 'ASSESSING',
  ASSESSED: 'ASSESSING',
  DISPATCH_PENDING: 'ASSESSING',
  DISPATCHED: 'RESPONDING',
  EN_ROUTE: 'RESPONDING',
  ON_SCENE: 'ON_SCENE',
  TRANSPORTING: 'ON_SCENE',
  ASSISTING: 'ON_SCENE',
  RESOLVED: 'RESOLVED',
};

/** The reporter-safe summary of an earlier similar report, or null for statuses that don't apply. */
export function toSimilarReportHint(
  earlier: { status: string; submitted_at: Date },
  now = Date.now(),
): SimilarReportHint | null {
  const stage = STAGE_BY_STATUS[earlier.status];
  if (!stage) return null;
  return { stage, minutesAgo: Math.max(0, Math.floor((now - earlier.submitted_at.getTime()) / 60_000)) };
}

// Statuses that can no longer be a duplicate target (already resolved/merged).
const NON_CANDIDATE_STATUSES = ['CLOSED', 'FALSE_ALERT', 'CANCELLED', 'DUPLICATE'];

@Injectable()
export class DuplicateDetectionService {
  private readonly logger = new Logger(DuplicateDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find recent, same-category incidents within DUPLICATE_DETECTION_RADIUS_METERS
   * of the given point, using a true PostGIS `ST_DWithin` radius query against the
   * `incident_locations.point` geography column. Returns candidates ordered by
   * distance (metres), nearest first.
   *
   * Advisory only (MOD-26) — this NEVER merges automatically. A dispatcher must
   * confirm via POST /incidents/:id/merge.
   */
  async findCandidates(
    lat: number,
    lng: number,
    category: IncidentType,
    opts?: { excludeId?: string },
  ): Promise<DuplicateCandidate[]> {
    const windowStart = new Date(Date.now() - DUPLICATE_DETECTION_WINDOW_MINUTES * 60 * 1000);
    const excludeId = opts?.excludeId ?? null;

    const rows = await this.prisma.$queryRaw<{ id: string; distance_meters: number }[]>(
      Prisma.sql`
        SELECT i.id,
               ST_Distance(
                 il.point,
                 ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
               )::int AS distance_meters
        FROM   incidents i
        JOIN   incident_locations il ON il.incident_id = i.id
        WHERE  i.category = ${category}::incident_category
          AND  i.submitted_at >= ${windowStart}
          AND  i.status NOT IN ('CLOSED', 'FALSE_ALERT', 'CANCELLED', 'DUPLICATE')
          AND  il.point IS NOT NULL
          AND  (${excludeId}::uuid IS NULL OR i.id <> ${excludeId}::uuid)
          AND  ST_DWithin(
                 il.point,
                 ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                 ${DUPLICATE_DETECTION_RADIUS_METERS}
               )
        ORDER  BY distance_meters ASC
        LIMIT  10
      `,
    );

    return rows.map((r) => ({ incidentId: r.id, distanceMeters: r.distance_meters }));
  }

  /**
   * Nearest recent same-category incident, or null. Thin wrapper over
   * findCandidates kept for the incident-intake duplicate hint.
   */
  async findNearbyRecent(lat: number, lng: number, category: IncidentType): Promise<Incident | null> {
    const [nearest] = await this.findCandidates(lat, lng, category);
    if (!nearest) return null;
    return this.prisma.incident.findUnique({ where: { id: nearest.incidentId } });
  }

  /** Exposed for callers/tests that need the non-candidate status list. */
  static get nonCandidateStatuses(): readonly string[] {
    return NON_CANDIDATE_STATUSES;
  }
}
