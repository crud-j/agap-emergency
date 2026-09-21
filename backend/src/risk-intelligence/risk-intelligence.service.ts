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
