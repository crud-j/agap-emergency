import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class RiskIntelligenceService {
  constructor(private readonly prisma: PrismaService) {}

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

  async createArea(dto: {
    name: string;
    riskType: string;
    riskLevel?: string;
    barangay?: string;
    floodThresholdMeters?: number;
    description?: string;
  }) {
    return this.prisma.risk_areas.create({
      data: {
        name: dto.name,
        risk_type: dto.riskType as any,
        risk_level: dto.riskLevel ?? 'MODERATE',
        barangay: dto.barangay ?? null,
        flood_threshold_meters: dto.floodThresholdMeters ?? null,
        description: dto.description ?? null,
      },
    });
  }

  async updateArea(
    id: string,
    dto: {
      name?: string;
      riskLevel?: string;
      barangay?: string;
      floodThresholdMeters?: number;
      description?: string;
      isActive?: boolean;
    },
  ) {
    const area = await this.prisma.risk_areas.findUnique({ where: { id } });
    if (!area) throw new NotFoundException('Risk area not found');
    return this.prisma.risk_areas.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.riskLevel !== undefined && { risk_level: dto.riskLevel }),
        ...(dto.barangay !== undefined && { barangay: dto.barangay }),
        ...(dto.floodThresholdMeters !== undefined && {
          flood_threshold_meters: dto.floodThresholdMeters,
        }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { is_active: dto.isActive }),
      },
    });
  }

  async deleteArea(id: string) {
    const area = await this.prisma.risk_areas.findUnique({ where: { id } });
    if (!area) throw new NotFoundException('Risk area not found');
    await this.prisma.risk_areas.delete({ where: { id } });
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
