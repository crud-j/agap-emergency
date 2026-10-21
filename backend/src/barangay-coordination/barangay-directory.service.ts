import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

export type BarangayMatchMethod = 'POLYGON' | 'NEAREST' | 'MANUAL';

export interface BarangayMatch {
  barangayId: string;
  name: string;
  matchMethod: BarangayMatchMethod;
  isApproximate: boolean;
}

/** A point this close to a barangay border could belong to the neighbour. */
export const BORDER_TOLERANCE_M = 75;
/** A point outside every polygon (e.g. on a river) snaps to a barangay within this range. */
export const NEAREST_TOLERANCE_M = 300;

interface ResolveRow {
  id: string;
  name: string;
  inside: boolean;
  dist_m: number | null;
  border_m: number | null;
}

@Injectable()
export class BarangayDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Which barangay contains this point? `null` when the location is unusable
   * (0,0 manual-address sentinel, non-finite) or far from every barangay.
   */
  async resolve(lat: number, lng: number): Promise<BarangayMatch | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;

    const rows = await this.prisma.$queryRaw<ResolveRow[]>`
      WITH p AS (SELECT ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326) AS g)
      SELECT r.id,
             r.name,
             ST_Covers(r.boundary, p.g) AS inside,
             ST_Distance(r.boundary::geography, p.g::geography)::float8 AS dist_m,
             ST_Distance(ST_Boundary(r.boundary)::geography, p.g::geography)::float8 AS border_m
        FROM geo_regions r, p
       WHERE r.region_type = 'barangay'
       ORDER BY inside DESC, dist_m ASC
       LIMIT 1`;

    const row = rows[0];
    if (!row) return null;

    if (row.inside) {
      return {
        barangayId: row.id,
        name: row.name,
        matchMethod: 'POLYGON',
        isApproximate: row.border_m !== null && Number(row.border_m) < BORDER_TOLERANCE_M,
      };
    }
    if (row.dist_m !== null && Number(row.dist_m) <= NEAREST_TOLERANCE_M) {
      return { barangayId: row.id, name: row.name, matchMethod: 'NEAREST', isApproximate: true };
    }
    return null;
  }

  /** All 19 barangays, for the manual-correction dropdown. */
  listBarangays() {
    return this.prisma.geo_regions.findMany({
      where: { region_type: 'barangay' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  barangayExists(barangayId: string): Promise<{ id: string; name: string } | null> {
    return this.prisma.geo_regions.findFirst({
      where: { id: barangayId, region_type: 'barangay' },
      select: { id: true, name: true },
    });
  }

  /** Active contacts, primary first. Includes non-SMS numbers so dispatchers can call them. */
  listContacts(barangayId: string) {
    return this.prisma.barangay_contacts.findMany({
      where: { barangay_id: barangayId, is_active: true },
      select: {
        id: true,
        phone_e164: true,
        kind: true,
        can_sms: true,
        role: true,
        label: true,
        is_demo: true,
        verified_at: true,
      },
      orderBy: [{ role: 'asc' }, { created_at: 'asc' }],
    });
  }

  /** Who gets the automatic SMS: active, SMS-capable PRIMARY and BACKUP contacts. */
  getAlertTargets(barangayId: string) {
    return this.prisma.barangay_contacts.findMany({
      where: {
        barangay_id: barangayId,
        is_active: true,
        can_sms: true,
        role: { in: ['PRIMARY', 'BACKUP'] },
      },
      orderBy: [{ role: 'asc' }],
    });
  }
}
