import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, UserRole } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { activeMemberOrgIds, type OrgActor } from '../organizations/org-scope';

@Injectable()
export class FacilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    return this.prisma.facility.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Active evacuation centers, for a rescue crew's trip log. No contacts or capacity data. */
  async listEvacuationCenters() {
    return this.prisma.facility.findMany({
      where: { is_active: true, facility_type: 'EVACUATION_CENTER' },
      select: { id: true, name: true, barangay: true, latitude: true, longitude: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const facility = await this.prisma.facility.findUnique({
      where: { id },
      include: { facility_capabilities: true },
    });
    if (!facility) throw new NotFoundException('Facility not found');
    return facility;
  }

  async create(dto: {
    name: string;
    facilityType: string;
    barangay?: string;
    municipality?: string;
    contactNumber?: string;
    isEvacuationCenter?: boolean;
  }) {
    return this.prisma.facility.create({
      data: {
        name: dto.name,
        facility_type: dto.facilityType as any,
        barangay: dto.barangay ?? null,
        municipality: dto.municipality ?? null,
        contact_number: dto.contactNumber ?? null,
        is_evacuation_center: dto.isEvacuationCenter ?? false,
      },
    });
  }

  /**
   * A receiving status / bed report (MOD-38/39). Dispatchers and Supervisors report for any
   * facility; a Hospital User only for a facility of an organization they are an active
   * member of (CLAUDE.md: Hospital User updates receiving status). A status report stamps
   * receiving_status_updated_at, even when it confirms the same status: the freshness
   * reminder (C8) and the referral ranking (C6) read how recently it was confirmed. Audited.
   */
  async updateStatus(
    id: string,
    dto: { receivingStatus?: string; capacityAvailable?: number },
    actor: OrgActor,
  ) {
    const existing = await this.findById(id);
    if (actor.role === UserRole.HOSPITAL_USER) {
      const own = !!existing.organization_id
        && (await activeMemberOrgIds(this.prisma, actor.id)).includes(existing.organization_id);
      if (!own) throw new ForbiddenException("You can update only your own hospital's status.");
    }
    const now = new Date();
    const updated = await this.prisma.facility.update({
      where: { id },
      data: {
        ...(dto.receivingStatus !== undefined && {
          receiving_status: dto.receivingStatus as any,
          receiving_status_updated_at: now,
        }),
        ...(dto.capacityAvailable !== undefined && {
          capacity_available: dto.capacityAvailable,
        }),
        updated_at: now,
      },
    });
    await this.audit.log({
      action: AuditAction.UPDATE,
      actorId: actor.id,
      actorRole: actor.role,
      entityType: 'facility',
      entityId: id,
      moduleId: 'MOD-39',
      oldValues: { receiving_status: existing.receiving_status, capacity_available: existing.capacity_available },
      newValues: {
        ...(dto.receivingStatus !== undefined && { receiving_status: dto.receivingStatus }),
        ...(dto.capacityAvailable !== undefined && { capacity_available: dto.capacityAvailable }),
      },
    });
    return updated;
  }
}
