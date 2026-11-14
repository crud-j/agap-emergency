import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isCoordinateInBocaue } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRiskAreaDto, UpdateRiskAreaDto } from './dto/risk-area.dto';
import type { RiskMapPeriod } from './dto/risk-map.dto';
import {
  AREA_STATS_WINDOW_DAYS,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  levelFromCount,
  reviewHint,
  suggestAreaName,
  type AreaStats,
} from './risk-area-rules';

interface Pin {
  lat: number;
  lng: number;
  radius: number;
}

export type RiskAreaShape = 'PIN' | 'OUTLINE' | 'BARANGAY' | 'NONE';

interface AreaShapeRow {
  id: string;
  shape: RiskAreaShape;
  boundary: GeoJsonGeometry | null;
  incidents_90d: number;
  incidents_prev_90d: number;
  last_incident_at: Date | null;
}

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

  /**
   * Every risk area with its shape on the map and live figures (MOD-51, 2026-11-15):
   * - `shape`: PIN (circle around a pin), OUTLINE (an approved hotspot), BARANGAY (the
   *   whole barangay) or NONE (no place, not drawn);
   * - `boundary`: the GeoJSON actually drawn and counted (the barangay polygon for BARANGAY);
   * - `stats`: incidents of the area's type inside it (same status filter as the Risk Map)
   *   in the last 90 days, the 90 days before, and the latest one;
   * - `hint`: what a Supervisor may want to change (reviewHint), or null.
   * Counts only: no incident id, reporter or patient.
   */
  async findAreas(now: Date = new Date()) {
    const [areas, shapes] = await Promise.all([
      this.prisma.risk_areas.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.$queryRaw<AreaShapeRow[]>`
        WITH a AS (
          SELECT ra.id, ra.risk_type,
                 COALESCE(ra.area_boundary::geometry, r.boundary) AS geom,
                 CASE WHEN ra.pin_latitude IS NOT NULL THEN 'PIN'
                      WHEN ra.area_boundary IS NOT NULL THEN 'OUTLINE'
                      WHEN r.boundary IS NOT NULL THEN 'BARANGAY'
                      ELSE 'NONE' END AS shape
            FROM risk_areas ra
            LEFT JOIN geo_regions r ON r.region_type = 'barangay' AND r.name = ra.barangay
        )
        SELECT a.id::text AS id, a.shape,
               ST_AsGeoJSON(a.geom, 6)::json AS boundary,
               COALESCE(s.n90, 0)::int AS incidents_90d,
               COALESCE(s.nprev, 0)::int AS incidents_prev_90d,
               s.last_at AS last_incident_at
          FROM a
          LEFT JOIN LATERAL (
            SELECT count(*) FILTER (WHERE i.created_at >= ${now}::timestamptz - make_interval(days => ${AREA_STATS_WINDOW_DAYS}::int)) AS n90,
                   count(*) FILTER (WHERE i.created_at <  ${now}::timestamptz - make_interval(days => ${AREA_STATS_WINDOW_DAYS}::int)
                                      AND i.created_at >= ${now}::timestamptz - make_interval(days => ${AREA_STATS_WINDOW_DAYS * 2}::int)) AS nprev,
                   max(i.created_at) AS last_at
              FROM incidents i
              JOIN incident_locations il ON il.incident_id = i.id
             WHERE a.geom IS NOT NULL
               AND il.point IS NOT NULL
               AND i.category = a.risk_type
               AND i.status NOT IN ('DRAFT', 'FALSE_ALERT', 'DUPLICATE', 'CANCELLED')
               AND ST_Covers(a.geom, il.point::geometry)
          ) s ON true`,
    ]);
    const byId = new Map(shapes.map((s) => [s.id, s]));
    return areas.map((a) => {
      const s = byId.get(a.id);
      const stats: AreaStats = {
        incidents_90d: Number(s?.incidents_90d ?? 0),
        incidents_prev_90d: Number(s?.incidents_prev_90d ?? 0),
        last_incident_at: s?.last_incident_at ?? null,
      };
      return {
        ...a,
        shape: s?.shape ?? 'NONE',
        boundary: s?.boundary ?? null,
        pin:
          a.pin_latitude !== null && a.pin_longitude !== null && a.radius_meters !== null
            ? { lat: Number(a.pin_latitude), lng: Number(a.pin_longitude), radius_m: a.radius_meters }
            : null,
        stats,
        hint: reviewHint(a, stats, now),
      };
    });
  }

  /**
   * What the add form fills in from a pin (smart form): the barangay under it, the
   * incidents within the radius in the last 90 days by type, and a suggested level and
   * name for the chosen type. Counts only.
   */
  async suggest(q: { lat: number; lng: number; radius: number; riskType: string }) {
    const insideBocaue = isCoordinateInBocaue(q.lat, q.lng);
    const [barangay, rows] = await Promise.all([
      this.barangayAt(q.lat, q.lng),
      this.prisma.$queryRaw<Array<{ category: string; count: number }>>`
        SELECT i.category::text AS category, count(*)::int AS count
          FROM incidents i
          JOIN incident_locations il ON il.incident_id = i.id
         WHERE il.point IS NOT NULL
           AND i.created_at >= now() - make_interval(days => ${AREA_STATS_WINDOW_DAYS}::int)
           AND i.status NOT IN ('DRAFT', 'FALSE_ALERT', 'DUPLICATE', 'CANCELLED')
           AND ST_DWithin(il.point, ST_SetSRID(ST_MakePoint(${q.lng}::float8, ${q.lat}::float8), 4326)::geography, ${q.radius}::float8)
         GROUP BY 1
         ORDER BY 2 DESC, 1`,
    ]);
    const incidentsByType = rows.map((r) => ({ category: r.category, count: Number(r.count) }));
    const sameType = incidentsByType.find((r) => r.category === q.riskType)?.count ?? 0;
    return {
      insideBocaue,
      barangay,
      windowDays: AREA_STATS_WINDOW_DAYS,
      incidentsByType,
      sameTypeIncidents: sameType,
      suggestedLevel: levelFromCount(sameType),
      suggestedName: suggestAreaName(barangay, q.riskType),
    };
  }

  /**
   * A new area needs a pin (`requirePin`); an approved proposal brings its own boundary
   * instead. With a pin, the barangay comes from the pin and the circle is the boundary,
   * written in the same transaction as the row and its audit entry.
   */
  async createArea(dto: CreateRiskAreaDto, actorId: string, opts: { requirePin?: boolean } = {}) {
    const pin = this.readPin(dto);
    if (!pin && (opts.requirePin ?? true)) {
      throw new BadRequestException('Drop a pin on the map and choose a radius for the area.');
    }
    const barangay = pin ? await this.barangayAt(pin.lat, pin.lng) : await this.resolveBarangay(dto.barangay);
    return this.prisma.$transaction(async (tx) => {
      const area = await tx.risk_areas.create({
        data: {
          name: dto.name.trim(),
          risk_type: dto.riskType,
          risk_level: dto.riskLevel,
          barangay,
          flood_threshold_meters: dto.floodThresholdMeters ?? null,
          description: dto.description?.trim() || null,
          ...(pin && { pin_latitude: pin.lat, pin_longitude: pin.lng, radius_meters: pin.radius }),
        },
      });
      if (pin) await this.writeCircle(tx, area.id, pin);
      await this.audit.logInTransaction(tx, {
        action: 'CREATE',
        actorId,
        entityType: 'risk_area',
        entityId: area.id,
        moduleId: 'MOD-51',
        newValues: this.auditValues(area),
      });
      return area;
    });
  }

  async updateArea(id: string, dto: UpdateRiskAreaDto, actorId: string) {
    const area = await this.prisma.risk_areas.findUnique({ where: { id } });
    if (!area) throw new NotFoundException('Risk area not found');
    const pin = this.readPin(dto);
    // A pinned area's barangay always follows its pin.
    const barangay = pin
      ? await this.barangayAt(pin.lat, pin.lng)
      : dto.barangay !== undefined && area.pin_latitude === null
        ? await this.resolveBarangay(dto.barangay)
        : undefined;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.risk_areas.update({
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
          ...(pin && { pin_latitude: pin.lat, pin_longitude: pin.lng, radius_meters: pin.radius }),
          // The column has no @updatedAt, so it never moved before.
          updated_at: new Date(),
        },
      });
      if (pin) await this.writeCircle(tx, id, pin);
      await this.audit.logInTransaction(tx, {
        action: 'UPDATE',
        actorId,
        entityType: 'risk_area',
        entityId: id,
        moduleId: 'MOD-51',
        oldValues: this.auditValues(area),
        newValues: this.auditValues(updated),
      });
      return updated;
    });
  }

  /** The pin from a create/update body: all three parts or none, inside Bocaue. */
  private readPin(dto: { latitude?: number; longitude?: number; radiusMeters?: number }): Pin | null {
    const given = [dto.latitude, dto.longitude, dto.radiusMeters].filter((v) => v !== undefined).length;
    if (given === 0) return null;
    if (given < 3) throw new BadRequestException('A pin needs a latitude, a longitude and a radius.');
    const pin = { lat: dto.latitude!, lng: dto.longitude!, radius: dto.radiusMeters! };
    if (!isCoordinateInBocaue(pin.lat, pin.lng)) {
      throw new BadRequestException('The pin must be inside Bocaue.');
    }
    if (pin.radius < MIN_RADIUS_M || pin.radius > MAX_RADIUS_M) {
      throw new BadRequestException(`The radius must be between ${MIN_RADIUS_M} m and ${MAX_RADIUS_M} m.`);
    }
    return pin;
  }

  /** The area's boundary becomes the circle of `radius` metres around the pin. */
  private async writeCircle(tx: Prisma.TransactionClient, id: string, pin: Pin): Promise<void> {
    await tx.$executeRaw`
      UPDATE risk_areas
         SET area_boundary = ST_Buffer(ST_SetSRID(ST_MakePoint(${pin.lng}::float8, ${pin.lat}::float8), 4326)::geography,
                                       ${pin.radius}::float8)
       WHERE id = ${id}::uuid`;
  }

  /** The barangay whose polygon covers the point, or null (outside every one). */
  private async barangayAt(lat: number, lng: number): Promise<string | null> {
    const [row] = await this.prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM geo_regions
       WHERE region_type = 'barangay'
         AND ST_Covers(boundary, ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326))
       LIMIT 1`;
    return row?.name ?? null;
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
    pin_latitude?: unknown;
    pin_longitude?: unknown;
    radius_meters?: number | null;
  }) {
    return {
      name: a.name,
      riskType: a.risk_type,
      riskLevel: a.risk_level,
      barangay: a.barangay,
      floodThresholdMeters: a.flood_threshold_meters === null ? null : Number(a.flood_threshold_meters),
      isActive: a.is_active,
      pin:
        a.pin_latitude !== null && a.pin_latitude !== undefined
          ? { lat: Number(a.pin_latitude), lng: Number(a.pin_longitude), radiusMeters: a.radius_meters ?? null }
          : null,
    };
  }
}
