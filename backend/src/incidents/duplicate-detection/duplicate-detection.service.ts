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
