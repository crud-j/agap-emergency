import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRiskAreaDto, UpdateRiskAreaDto } from './dto/risk-area.dto';
import type { RiskMapPeriod } from './dto/risk-map.dto';

/** Enough for a year of Bocaue incidents; beyond it the page says the list was cut. */
export const RISK_MAP_MAX_POINTS = 2000;

/** A GeoJSON geometry as PostGIS ST_AsGeoJSON returns it. */
export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

export interface RiskMapBarangay {
  name: string;
  boundary: GeoJsonGeometry;
  flood_incidents: number;
}

export interface RiskMapPoint {
  category: string;
  lat: number;
  lng: number;
  incident_count: number;
  last_reported_at: Date;
  /** null = outside every barangay boundary. */
  barangay: string | null;
}

export interface RiskMap {
  period_days: RiskMapPeriod;
  generated_at: string;
  barangays: RiskMapBarangay[];
  points: RiskMapPoint[];
  points_truncated: boolean;
}

@Injectable()
export class RiskIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The Risk Map (MOD-51). Floods are counted per barangay, because a flood covers an
   * area; every other incident is shown where it happened. Incidents at the same spot
   * (about 11 m) and of the same type become one point with a count. A flood report
   * outside every barangay boundary is shown as a point, so it never disappears.
   *
   * Barangay = the polygon that covers the GPS point (geo_regions), not the reverse-geocoded
   * text, which can be missing or spelled differently. Draft, false, duplicate and cancelled
   * reports don't count (same filter as hotspot discovery). No reporter, patient or incident
   * id is returned: only type, place, count and the latest report time.
   */
  async getRiskMap(periodDays: RiskMapPeriod): Promise<RiskMap> {
    const [barangays, spots] = await Promise.all([
      this.prisma.$queryRaw<RiskMapBarangay[]>`
        WITH floods AS (
          SELECT ST_SetSRID(ST_MakePoint(il.longitude::float8, il.latitude::float8), 4326) AS g
            FROM incidents i
            JOIN incident_locations il ON il.incident_id = i.id
           WHERE i.category = 'FLOOD'
             AND i.created_at >= now() - make_interval(days => ${periodDays}::int)
             AND i.status NOT IN ('DRAFT', 'FALSE_ALERT', 'DUPLICATE', 'CANCELLED')
        )
        SELECT r.name,
               ST_AsGeoJSON(r.boundary, 6)::json AS boundary,
               (SELECT count(*)::int FROM floods f WHERE ST_Covers(r.boundary, f.g)) AS flood_incidents
          FROM geo_regions r
         WHERE r.region_type = 'barangay'
         ORDER BY r.name`,
      this.prisma.$queryRaw<RiskMapPoint[]>`
        WITH incs AS (
          SELECT i.category::text AS category, i.created_at,
                 il.latitude::float8 AS lat, il.longitude::float8 AS lng,
                 ST_SetSRID(ST_MakePoint(il.longitude::float8, il.latitude::float8), 4326) AS g
            FROM incidents i
            JOIN incident_locations il ON il.incident_id = i.id
           WHERE i.created_at >= now() - make_interval(days => ${periodDays}::int)
             AND i.status NOT IN ('DRAFT', 'FALSE_ALERT', 'DUPLICATE', 'CANCELLED')
        ),
        spots AS (
          SELECT category, avg(lat) AS lat, avg(lng) AS lng,
                 count(*)::int AS incident_count, max(created_at) AS last_reported_at
            FROM incs
           WHERE category <> 'FLOOD'
              OR NOT EXISTS (SELECT 1 FROM geo_regions r
                              WHERE r.region_type = 'barangay' AND ST_Covers(r.boundary, incs.g))
           GROUP BY category, round(lat::numeric, 4), round(lng::numeric, 4)
        )
        SELECT s.category, s.lat, s.lng, s.incident_count, s.last_reported_at,
               (SELECT r.name FROM geo_regions r
                 WHERE r.region_type = 'barangay'
                   AND ST_Covers(r.boundary, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326))
                 LIMIT 1) AS barangay
          FROM spots s
         ORDER BY s.incident_count DESC, s.last_reported_at DESC
         LIMIT ${RISK_MAP_MAX_POINTS + 1}::int`,
    ]);

    return {
      period_days: periodDays,
      generated_at: new Date().toISOString(),
      barangays,
      points: spots.slice(0, RISK_MAP_MAX_POINTS),
      // Said on the page, so a busy year never looks like a quiet one.
      points_truncated: spots.length > RISK_MAP_MAX_POINTS,
    };
  }

  /** Every risk area, with its outline as GeoJSON when it has one (approved hotspots). */
  async findAreas() {
    const [areas, outlines] = await Promise.all([
      this.prisma.risk_areas.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.$queryRaw<Array<{ id: string; boundary: GeoJsonGeometry }>>`
        SELECT id::text AS id, ST_AsGeoJSON(area_boundary::geometry, 6)::json AS boundary
          FROM risk_areas
         WHERE area_boundary IS NOT NULL`,
    ]);
    const boundaryById = new Map(outlines.map((o) => [o.id, o.boundary]));
    return areas.map((a) => ({ ...a, boundary: boundaryById.get(a.id) ?? null }));
  }

  async createArea(dto: CreateRiskAreaDto, actorId: string) {
    const barangay = await this.resolveBarangay(dto.barangay);
    const area = await this.prisma.risk_areas.create({
      data: {
        name: dto.name.trim(),
        risk_type: dto.riskType,
        risk_level: dto.riskLevel,
        barangay,
        flood_threshold_meters: dto.floodThresholdMeters ?? null,
        description: dto.description?.trim() || null,
      },
    });
    await this.audit.log({
      action: 'CREATE',
      actorId,
      entityType: 'risk_area',
      entityId: area.id,
      moduleId: 'MOD-51',
      newValues: this.auditValues(area),
    });
    return area;
  }

  async updateArea(id: string, dto: UpdateRiskAreaDto, actorId: string) {
    const area = await this.prisma.risk_areas.findUnique({ where: { id } });
    if (!area) throw new NotFoundException('Risk area not found');
    const barangay = dto.barangay !== undefined ? await this.resolveBarangay(dto.barangay) : undefined;
    const updated = await this.prisma.risk_areas.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.riskType !== undefined && { risk_type: dto.riskType }),
        ...(dto.riskLevel !== undefined && { risk_level: dto.riskLevel }),
        ...(barangay !== undefined && { barangay }),
        // null clears the threshold (e.g. an area no longer tied to the river level)
        ...(dto.floodThresholdMeters !== undefined && { flood_threshold_meters: dto.floodThresholdMeters }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.isActive !== undefined && { is_active: dto.isActive }),
        // The column has no @updatedAt, so it never moved before.
        updated_at: new Date(),
      },
    });
    await this.audit.log({
      action: 'UPDATE',
      actorId,
      entityType: 'risk_area',
      entityId: id,
      moduleId: 'MOD-51',
      oldValues: this.auditValues(area),
      newValues: this.auditValues(updated),
    });
    return updated;
  }

  async deleteArea(id: string, actorId: string) {
    const area = await this.prisma.risk_areas.findUnique({ where: { id } });
    if (!area) throw new NotFoundException('Risk area not found');
    await this.prisma.risk_areas.delete({ where: { id } });
    // The audit row keeps what was deleted: nothing else references risk areas.
    await this.audit.log({
      action: 'DELETE',
      actorId,
      entityType: 'risk_area',
      entityId: id,
      moduleId: 'MOD-51',
      oldValues: this.auditValues(area),
    });
  }

  /** Empty means "no barangay"; anything else must be one of Bocaue's 19 (geo_regions). */
  private async resolveBarangay(name: string | null | undefined): Promise<string | null> {
    const trimmed = name?.trim();
    if (!trimmed) return null;
    const region = await this.prisma.geo_regions.findFirst({
      where: { region_type: 'barangay', name: { equals: trimmed, mode: 'insensitive' } },
      select: { name: true },
    });
    if (!region) throw new BadRequestException(`"${trimmed}" is not a Bocaue barangay.`);
    return region.name;
  }

  private auditValues(a: {
    name: string;
    risk_type: string;
    risk_level: string;
    barangay: string | null;
    flood_threshold_meters: unknown;
    is_active: boolean;
  }) {
    return {
      name: a.name,
      riskType: a.risk_type,
      riskLevel: a.risk_level,
      barangay: a.barangay,
      floodThresholdMeters: a.flood_threshold_meters === null ? null : Number(a.flood_threshold_meters),
      isActive: a.is_active,
    };
  }
}
