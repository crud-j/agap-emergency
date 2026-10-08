import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

// ---------------------------------------------------------------------------
// Capability matrix — maps each IncidentCategory to the capability names
// a responding unit is expected to hold for a strong match.
// Names are upper-cased for case-insensitive comparison.
// ---------------------------------------------------------------------------
export const CAPABILITY_MATRIX: Record<string, string[]> = {
  MEDICAL:       ['MEDICAL_RESPONSE', 'FIRST_AID', 'PATIENT_TRANSPORT'],
  ROAD_ACCIDENT: ['ROAD_RESCUE', 'PATIENT_TRANSPORT', 'FIRST_AID'],
  FIRE:          ['FIREFIGHTING', 'FIRE_SUPPRESSION', 'RESCUE'],
  RESCUE:        ['SEARCH_AND_RESCUE', 'ROPE_RESCUE'],
  FLOOD:         ['WATER_RESCUE', 'BOAT_OPERATION'],
  INDUSTRIAL:    ['HAZMAT', 'FIREFIGHTING', 'RESCUE'],
  DEBRIS:        ['HEAVY_EQUIPMENT', 'SEARCH_AND_RESCUE'],
  OTHER:         ['FIRST_AID'],
};

// Resource types that carry a natural affinity for each incident category.
const TYPE_AFFINITY: Record<string, string[]> = {
  MEDICAL:       ['AMBULANCE'],
  ROAD_ACCIDENT: ['AMBULANCE', 'RESCUE_TRUCK'],
  FIRE:          ['FIRE_TRUCK'],
  RESCUE:        ['RESCUE_TRUCK', 'RESCUE_BOAT'],
  FLOOD:         ['RESCUE_BOAT'],
  INDUSTRIAL:    ['FIRE_TRUCK', 'RESCUE_TRUCK'],
  DEBRIS:        ['CLEARING_EQUIPMENT', 'RESCUE_TRUCK'],
  OTHER:         [],
};

const MAX_RANGE_METERS = 20_000;

export interface ResourceRecommendation {
  rank: number;
  resourceId: string;
  resourceName: string;
  callSign: string | null;
  resourceType: string;
  organizationId: string;
  score: number;
  distanceMeters: number | null;
  requiredCapabilities: string[];
  matchedCapabilities: string[];
  rationale: string;
}

// ---------------------------------------------------------------------------
// Pure scoring functions — exported so unit tests can exercise them directly.
// ---------------------------------------------------------------------------

export function computeCapabilityScore(
  requiredCaps: string[],
  assignedCaps: string[],
): number {
  if (requiredCaps.length === 0) return 50;
  const upper = assignedCaps.map((c) => c.toUpperCase());
  const matched = requiredCaps.filter((c) => upper.includes(c)).length;
  return (matched / requiredCaps.length) * 100;
}

export function computeProximityScore(
  distanceMeters: number | null,
  maxRangeMeters = MAX_RANGE_METERS,
): number {
  if (distanceMeters === null) return 50;
  return Math.max(0, 100 * (1 - distanceMeters / maxRangeMeters));
}

export function computeFinalScore(
  capScore: number,
  proxScore: number,
  typeAffinity: boolean,
): number {
  const typeBonus = typeAffinity ? 100 : 0;
  return capScore * 0.5 + proxScore * 0.35 + typeBonus * 0.15;
}

export function buildRationale(opts: {
  category: string;
  requiredCaps: string[];
  matchedCaps: string[];
  resourceType: string;
  distanceMeters: number | null;
  typeAffinity: boolean;
}): string {
  const parts: string[] = [];

  if (opts.requiredCaps.length > 0) {
    const capDetail =
      opts.matchedCaps.length > 0 ? ` (${opts.matchedCaps.join(', ')})` : '';
    parts.push(
      `Capability match: ${opts.matchedCaps.length}/${opts.requiredCaps.length} required${capDetail}`,
    );
  }

  if (opts.distanceMeters !== null) {
    parts.push(`Distance: ${(opts.distanceMeters / 1000).toFixed(1)}km`);
  }

  const typeLabel = opts.resourceType.replace(/_/g, ' ').toLowerCase();
  parts.push(
    opts.typeAffinity
      ? `Type: ${typeLabel} (strong match for ${opts.category.toLowerCase()} incidents)`
      : `Type: ${typeLabel}`,
  );

  return parts.join('. ');
}

// ---------------------------------------------------------------------------

type RawProximityRow = { id: string; distance_meters: number | null };

@Injectable()
export class ResourceMatchingService {
  private readonly logger = new Logger(ResourceMatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Returns a ranked list of AVAILABLE resources suited for the given incident.
   * ASSISTIVE ONLY — no dispatch is initiated. Dispatcher must confirm (CLAUDE.md rule 8).
   */
  async getRecommendations(
    incidentId: string,
    actorId: string,
    actorRole: string,
  ): Promise<ResourceRecommendation[]> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      include: { incident_locations: true },
    });
    if (!incident) throw new NotFoundException('Incident not found');

    const category = incident.category as string;
    const requiredCaps = CAPABILITY_MATRIX[category] ?? [];

    // Step 1 — find AVAILABLE resources, optionally ranked by PostGIS proximity.
    // Use latitude presence as proxy for whether the PostGIS `point` column is
    // populated — `point` is an Unsupported geography type not exposed by the
    // Prisma TS type but set by the DB whenever lat/lon are written.
    const hasLocation =
      !!incident.incident_locations?.latitude &&
      !!incident.incident_locations?.longitude;
    const candidateDistances = await this.fetchCandidates(incidentId, hasLocation);

    if (candidateDistances.size === 0) return [];

    // Step 2 — load resource details + verified capability assignments
    const resources = await this.prisma.resources.findMany({
      where: { id: { in: [...candidateDistances.keys()] } },
      include: {
        resource_capability_assignments: {
          where: { is_verified: true },
          include: { resource_capabilities: true },
        },
      },
    });

    // Step 3 — score and rank
    const scored = resources.map((resource) => {
      const distanceMeters = candidateDistances.get(resource.id) ?? null;
      const assignedCaps = resource.resource_capability_assignments.map(
        (a) => a.resource_capabilities.name.toUpperCase(),
      );
      const matchedCaps = requiredCaps.filter((c) => assignedCaps.includes(c));
      const typeAffinity = (TYPE_AFFINITY[category] ?? []).includes(
        resource.resource_type,
      );

      const capScore = computeCapabilityScore(requiredCaps, assignedCaps);
      const proxScore = computeProximityScore(distanceMeters);
      const score = computeFinalScore(capScore, proxScore, typeAffinity);

      return {
        resourceId: resource.id,
        resourceName: resource.name,
        callSign: resource.call_sign,
        resourceType: resource.resource_type,
        organizationId: resource.organization_id,
        score: Math.round(score * 100) / 100,
        distanceMeters,
        requiredCapabilities: requiredCaps,
        matchedCapabilities: matchedCaps,
        rationale: buildRationale({
          category,
          requiredCaps,
          matchedCaps,
          resourceType: resource.resource_type,
          distanceMeters,
          typeAffinity,
        }),
      };
    });

    scored.sort((a, b) => b.score - a.score);
    const ranked: ResourceRecommendation[] = scored.map((r, i) => ({
      rank: i + 1,
      ...r,
    }));

    // Step 4 — persist (best-effort, never blocks the response)
    this.persistRecommendations(incidentId, ranked).catch((err) =>
      this.logger.error(`Persist recommendations failed for ${incidentId}: ${String(err)}`),
    );

    // Step 5 — audit the READ (non-blocking, CLAUDE.md rule 11)
    this.audit
      .log({
        action: 'READ',
        actorId,
        actorRole,
        entityType: 'resource_recommendations',
        entityId: incidentId,
        moduleId: 'MOD-30',
        incidentId,
        newValues: { count: ranked.length, category },
      })
      .catch((err) =>
        this.logger.warn(`Audit log failed for resource recommendations: ${String(err)}`),
      );

    return ranked;
  }

  private async fetchCandidates(
    incidentId: string,
    hasLocation: boolean,
  ): Promise<Map<string, number | null>> {
    if (hasLocation) {
      const rows = await this.prisma.$queryRaw<RawProximityRow[]>(
        Prisma.sql`
          SELECT r.id,
                 ST_Distance(r.base_location::geography, il.point::geography)::int
                   AS distance_meters
          FROM   resources r
          CROSS  JOIN incident_locations il
          WHERE  il.incident_id   = ${incidentId}::uuid
            AND  r.status         = 'AVAILABLE'
            AND  r.is_active      = true
            AND  r.base_location  IS NOT NULL
            AND  ST_DWithin(
                   r.base_location::geography,
                   il.point::geography,
                   ${MAX_RANGE_METERS}
                 )
          ORDER  BY distance_meters ASC
          LIMIT  50
        `,
      );
      return new Map(rows.map((r) => [r.id, r.distance_meters]));
    }

    // No incident location — fall back to any AVAILABLE unit (proximity unknown)
    const all = await this.prisma.resources.findMany({
      where: { status: 'AVAILABLE', is_active: true },
      select: { id: true },
      take: 50,
    });
    return new Map(all.map((r) => [r.id, null]));
  }

  private async persistRecommendations(
    incidentId: string,
    ranked: ResourceRecommendation[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.resource_recommendations.deleteMany({
        where: { incident_id: incidentId },
      }),
      this.prisma.resource_recommendations.createMany({
        data: ranked.map((r) => ({
          incident_id: incidentId,
          resource_id: r.resourceId,
          rank: r.rank,
          score: r.score,
          distance_meters: r.distanceMeters,
          reasoning: {
            rationale: r.rationale,
            matchedCapabilities: r.matchedCapabilities,
            requiredCapabilities: r.requiredCapabilities,
            resourceType: r.resourceType,
          },
        })),
      }),
    ]);
  }
}
