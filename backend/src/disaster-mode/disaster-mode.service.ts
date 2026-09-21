import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ActivateSurgeDto } from './dto/activate-surge.dto';
import { TriageTagDto } from './dto/triage-tag.dto';

@Injectable()
export class DisasterModeService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus() {
    const active = await this.prisma.surge_incidents.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { activated_at: 'desc' },
    });
    return { active: !!active, surge: active };
  }

  async activate(dto: ActivateSurgeDto, userId: string, orgId: string) {
    return this.prisma.surge_incidents.create({
      data: {
        declared_by_id: userId,
        organization_id: orgId,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category as any,
        affected_barangays: dto.affectedBarangays ?? [],
        bocaue_river_level: dto.bocaueRiverLevel ?? null,
        status: 'ACTIVE',
      },
    });
  }

  async deactivate(surgeId: string, _userId: string) {
    const surge = await this.prisma.surge_incidents.findUnique({ where: { id: surgeId } });
    if (!surge) throw new NotFoundException('Surge incident not found');
    return this.prisma.surge_incidents.update({
      where: { id: surgeId },
      data: { status: 'INACTIVE', deactivated_at: new Date() },
    });
  }

  async linkIncident(surgeId: string, incidentId: string) {
    const surge = await this.prisma.surge_incidents.findUnique({ where: { id: surgeId } });
    if (!surge) throw new NotFoundException('Surge incident not found');
    return this.prisma.incident.update({
      where: { id: incidentId },
      data: { surge_incident_id: surgeId, is_surge_incident: true },
    });
  }

  async createTriageTag(dto: TriageTagDto, userId: string) {
    const surge = await this.prisma.surge_incidents.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { activated_at: 'desc' },
    });
    if (!surge) throw new BadRequestException('No active surge to tag against');
    return this.prisma.triage_tags.create({
      data: {
        surge_id: surge.id,
        patient_id: dto.patientId ?? null,
        incident_id: dto.incidentId ?? null,
        triage_color: dto.triageColor,
        triage_notes: dto.triageNotes ?? null,
        tagged_by_id: userId,
      },
    });
  }

  async getTriageTags(surgeId: string) {
    return this.prisma.triage_tags.findMany({
      where: { surge_id: surgeId },
      orderBy: { tagged_at: 'desc' },
    });
  }

  async updateTriageTag(tagId: string, dto: Partial<TriageTagDto>, _userId: string) {
    const tag = await this.prisma.triage_tags.findUnique({ where: { id: tagId } });
    if (!tag) throw new NotFoundException('Triage tag not found');
    return this.prisma.triage_tags.update({
      where: { id: tagId },
      data: {
        ...(dto.triageColor !== undefined && { triage_color: dto.triageColor }),
        ...(dto.triageNotes !== undefined && { triage_notes: dto.triageNotes }),
      },
    });
  }

  async getAvailableResources() {
    return this.prisma.resources.findMany({
      where: { status: 'AVAILABLE', is_active: true },
    });
  }

  async resolveActiveSurgeId(): Promise<string> {
    const surge = await this.prisma.surge_incidents.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { activated_at: 'desc' },
    });
    if (!surge) throw new BadRequestException('No active surge incident');
    return surge.id;
  }

  async resolveOrgForUser(userId: string): Promise<string> {
    const membership = await this.prisma.organization_memberships.findFirst({
      where: { user_id: userId, is_active: true },
    });
    if (!membership) {
      throw new BadRequestException('Actor is not a member of any organization');
    }
    return membership.organization_id;
  }
}
