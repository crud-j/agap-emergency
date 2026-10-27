import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateRiskAreaDto, UpdateRiskAreaDto } from './dto/risk-area.dto';

@Injectable()
export class RiskIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getHeatmap() {
    // Placeholder — real PostGIS density is a later step.
    const grouped = await this.prisma.incident_locations.groupBy({
      by: ['barangay'],
      orderBy: { barangay: 'asc' },
      _count: { _all: true },
    });
    return grouped.map((g) => ({ barangay: g.barangay, count: g._count._all }));
  }

  /**
   * Geo risk points for the operations map overlay (MOD-51). Clusters recent
   * incidents by a ~111 m coordinate grid and returns normalized intensity per
   * cluster. Pure PostgreSQL read — no PostGIS required.
   */
  async getGeoHeatmap(periodDays = 30) {
    const days = Number.isFinite(periodDays) && periodDays > 0 ? Math.min(periodDays, 365) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.incident.findMany({
      where: { submitted_at: { gte: since } },
      select: {
        category: true,
        incident_locations: { select: { latitude: true, longitude: true, barangay: true } },
      },
    });

    const buckets = new Map<
      string,
      { lat: number; lng: number; count: number; barangay: string | null; categories: Record<string, number> }
    >();

    for (const row of rows) {
      const loc = row.incident_locations;
      if (!loc || loc.latitude == null || loc.longitude == null) continue;
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      // Round to 3 decimals (~111 m) so nearby incidents form one density point.
      const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { lat, lng, count: 0, barangay: loc.barangay ?? null, categories: {} };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      if (row.category) bucket.categories[row.category] = (bucket.categories[row.category] ?? 0) + 1;
    }

    const clusters = [...buckets.values()];
    const maxCount = Math.max(1, ...clusters.map((b) => b.count));

    const points = clusters.map((b) => {
      const topCategory =
        Object.entries(b.categories).sort((a, c) => c[1] - a[1])[0]?.[0] ?? null;
      return {
        lat: b.lat,
        lng: b.lng,
        intensity: Math.round((b.count / maxCount) * 100) / 100, // 0..1
        category: topCategory,
        barangay: b.barangay,
        incident_count: b.count,
      };
    });

    return { points, generated_at: new Date().toISOString(), period_days: days };
  }

  async getFloodZones() {
    return this.prisma.risk_areas.findMany({
      where: { risk_type: 'FLOOD', is_active: true },
    });
  }

  async findAreas() {
    return this.prisma.risk_areas.findMany({ orderBy: { name: 'asc' } });
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

  async getPatterns() {
    const byCategory = await this.prisma.incident.groupBy({
      by: ['category'],
      orderBy: { category: 'asc' },
      _count: { _all: true },
    });
    return { byCategory };
  }
}
