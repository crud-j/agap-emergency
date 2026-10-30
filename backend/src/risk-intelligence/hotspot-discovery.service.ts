import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuditAction } from '@agap/shared';
import { risk_area_proposal_status } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RiskIntelligenceService } from './risk-intelligence.service';
import { ApproveRiskAreaProposalDto } from './dto/risk-area-proposal.dto';

/** Incidents older than this don't count toward a hotspot. */
export const HOTSPOT_WINDOW_DAYS = 90;
/** DBSCAN neighbourhood (metres, UTM 51N) and the fewest incidents that make a cluster. */
export const HOTSPOT_EPS_M = 150;
export const HOTSPOT_MIN_POINTS = 4;
/** Hull padding, so a cluster of points on one line still has an area. */
export const HOTSPOT_BUFFER_M = 30;

/**
 * MOD-51 (AUTOMATION_NEEDS_PLAN Phase 2, C7): each night, proposes recurring incident
 * clusters as risk areas. Only a System Administrator's approval creates the risk area
 * (through RiskIntelligenceService.createArea, so its barangay check and audit apply).
 */
@Injectable()
export class HotspotDiscoveryService {
  private readonly logger = new Logger(HotspotDiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly risk: RiskIntelligenceService,
  ) {}

  /**
   * One run: cluster the last 90 days per category, drop clusters an active risk area of
   * the same type already covers (by boundary, or by barangay for areas without one) or
   * that an administrator dismissed in that window, and upsert one PENDING proposal per
   * type and barangay. Returns how many proposals were written; a failure logs and returns 0.
   */
  @Cron('30 2 * * *')
  async discover(): Promise<number> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        WITH pts AS (
          SELECT i.category, ST_Transform(il.point::geometry, 32651) AS g
            FROM incidents i
            JOIN incident_locations il ON il.incident_id = i.id
           WHERE il.point IS NOT NULL
             AND i.created_at >= now() - make_interval(days => ${HOTSPOT_WINDOW_DAYS}::int)
             AND i.status NOT IN ('DRAFT', 'FALSE_ALERT', 'DUPLICATE', 'CANCELLED')
        ),
        clustered AS (
          SELECT category, g,
                 ST_ClusterDBSCAN(g, eps := ${HOTSPOT_EPS_M}::float8, minpoints := ${HOTSPOT_MIN_POINTS}::int)
                   OVER (PARTITION BY category) AS cid
            FROM pts
        ),
        clusters AS (
          SELECT category, count(*)::int AS n,
                 ST_Buffer(ST_ConvexHull(ST_Collect(g)), ${HOTSPOT_BUFFER_M}::float8) AS hull
            FROM clustered
           WHERE cid IS NOT NULL
           GROUP BY category, cid
        ),
        named AS (
          SELECT c.category, c.n, c.hull,
                 (SELECT r.name FROM geo_regions r
                   WHERE r.region_type = 'barangay'
                     AND ST_Covers(r.boundary, ST_Transform(ST_Centroid(c.hull), 4326))
                   LIMIT 1) AS barangay
            FROM clusters c
        ),
        uncovered AS (
          SELECT nm.* FROM named nm
           WHERE NOT EXISTS (
                   SELECT 1 FROM risk_areas a
                    WHERE a.is_active AND a.risk_type = nm.category
                      AND ((a.area_boundary IS NOT NULL
                            AND ST_Intersects(a.area_boundary, ST_Transform(nm.hull, 4326)::geography))
                        OR (a.area_boundary IS NULL AND a.barangay IS NOT NULL AND a.barangay = nm.barangay)))
             AND NOT EXISTS (
                   SELECT 1 FROM risk_area_proposals d
                    WHERE d.status = 'DISMISSED' AND d.risk_type = nm.category
                      AND COALESCE(d.barangay, '') = COALESCE(nm.barangay, '')
                      AND d.reviewed_at >= now() - make_interval(days => ${HOTSPOT_WINDOW_DAYS}::int))
        ),
        grouped AS (
          SELECT category, barangay, sum(n)::int AS n,
                 ST_Transform(ST_Union(hull), 4326)::geography AS boundary
            FROM uncovered
           GROUP BY category, barangay
        )
        INSERT INTO risk_area_proposals (risk_type, barangay, incident_count, area_boundary, window_days)
        SELECT category, barangay, n, boundary, ${HOTSPOT_WINDOW_DAYS}::int FROM grouped
        ON CONFLICT (risk_type, (COALESCE(barangay, ''))) WHERE status = 'PENDING'
        DO UPDATE SET incident_count = EXCLUDED.incident_count,
                      area_boundary  = EXCLUDED.area_boundary,
                      window_days    = EXCLUDED.window_days,
                      updated_at     = now()
        RETURNING id`;
      if (rows.length) this.logger.log(`Hotspot discovery wrote ${rows.length} risk area proposal(s)`);
      return rows.length;
    } catch (err) {
      this.logger.error(`Hotspot discovery failed: ${String(err)}`);
      return 0;
    }
  }

  listProposals(status: risk_area_proposal_status = 'PENDING') {
    return this.prisma.risk_area_proposals.findMany({
      where: { status },
      orderBy: [{ incident_count: 'desc' }, { updated_at: 'desc' }],
      take: 100,
    });
  }

  /**
   * Creates the risk area from a PENDING proposal, with its boundary. The proposal is
   * claimed first, so two administrators can't approve it twice; if the area can't be
   * created the claim is released.
   */
  async approve(id: string, dto: ApproveRiskAreaProposalDto, actorId: string) {
    const proposal = await this.prisma.risk_area_proposals.findUnique({ where: { id } });
    if (!proposal) throw new NotFoundException('Risk area proposal not found');
    const now = new Date();
    const claimed = await this.prisma.risk_area_proposals.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', reviewed_by_id: actorId, reviewed_at: now, updated_at: now },
    });
    if (claimed.count === 0) throw new ConflictException('This proposal was already reviewed.');

    let area;
    try {
      area = await this.risk.createArea(
        {
          name: dto.name,
          riskType: proposal.risk_type,
          riskLevel: dto.riskLevel,
          ...(proposal.barangay && { barangay: proposal.barangay }),
          ...(dto.description && { description: dto.description }),
        },
        actorId,
      );
    } catch (err) {
      await this.prisma.risk_area_proposals.updateMany({
        where: { id, status: 'APPROVED', risk_area_id: null },
        data: { status: 'PENDING', reviewed_by_id: null, reviewed_at: null },
      });
      throw err;
    }

    await this.prisma.$executeRaw`
      UPDATE risk_areas
         SET area_boundary = (SELECT area_boundary FROM risk_area_proposals WHERE id = ${id}::uuid)
       WHERE id = ${area.id}::uuid`;
    await this.prisma.risk_area_proposals.update({ where: { id }, data: { risk_area_id: area.id } });
    await this.audit.log({
      action: AuditAction.UPDATE,
      actorId,
      entityType: 'risk_area_proposal',
      entityId: id,
      moduleId: 'MOD-51',
      oldValues: { status: 'PENDING' },
      newValues: { status: 'APPROVED', riskAreaId: area.id, incidentCount: proposal.incident_count },
    });
    return { proposalId: id, riskArea: area };
  }

  async dismiss(id: string, actorId: string) {
    const now = new Date();
    const res = await this.prisma.risk_area_proposals.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'DISMISSED', reviewed_by_id: actorId, reviewed_at: now, updated_at: now },
    });
    if (res.count === 0) {
      const exists = await this.prisma.risk_area_proposals.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundException('Risk area proposal not found');
      throw new ConflictException('This proposal was already reviewed.');
    }
    await this.audit.log({
      action: AuditAction.UPDATE,
      actorId,
      entityType: 'risk_area_proposal',
      entityId: id,
      moduleId: 'MOD-51',
      oldValues: { status: 'PENDING' },
      newValues: { status: 'DISMISSED' },
    });
    return { proposalId: id, status: 'DISMISSED' as const };
  }
}
