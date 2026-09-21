import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IncidentType, DUPLICATE_DETECTION_RADIUS_METERS, DUPLICATE_DETECTION_WINDOW_MINUTES } from '@agap/shared';
import { type Incident } from '@prisma/client';

@Injectable()
export class DuplicateDetectionService {
  private readonly logger = new Logger(DuplicateDetectionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a recent nearby incident of the same category.
   * Advisory only — does NOT automatically merge. Requires human review.
   */
  async findNearbyRecent(lat: number, lng: number, category: IncidentType): Promise<Incident | null> {
    const windowStart = new Date(Date.now() - DUPLICATE_DETECTION_WINDOW_MINUTES * 60 * 1000);

    // Approximate bounding box (1 degree lat ≈ 111 km)
    const latDelta = DUPLICATE_DETECTION_RADIUS_METERS / 111000;
    const lngDelta = DUPLICATE_DETECTION_RADIUS_METERS / (111000 * Math.cos((lat * Math.PI) / 180));

    const candidates = await this.prisma.incident.findMany({
      where: {
        category: category as any,
        submitted_at: { gte: windowStart },
        status: { notIn: ['CLOSED', 'FALSE_ALERT', 'CANCELLED', 'DUPLICATE'] as any[] },
      },
      take: 1,
    });

    return candidates[0] ?? null;
  }
}
