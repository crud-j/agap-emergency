import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { AuditAction } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivateSurgeDto } from './dto/activate-surge.dto';
import { TriageTagDto } from './dto/triage-tag.dto';

@Injectable()
export class DisasterModeService {
  private readonly logger = new Logger(DisasterModeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async getStatus() {
    const active = await this.prisma.surge_incidents.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { activated_at: 'desc' },
    });
    return { active: !!active, surge: active };
  }

  async activate(dto: ActivateSurgeDto, userId: string, orgId: string) {
    // One surge at a time: the banner, triage board and broadcast all read "the" active surge.
    const active = await this.prisma.surge_incidents.findFirst({ where: { status: 'ACTIVE' }, select: { name: true } });
    if (active) throw new ConflictException(`Surge mode is already active (${active.name}). Deactivate it first.`);
    const surge = await this.prisma.surge_incidents.create({
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
    await this.audit?.log({
      action: AuditAction.CREATE,
      actorId: userId,
      entityType: 'surge_incident',
      entityId: surge.id,
      moduleId: 'MOD-52',
      newValues: { name: surge.name, category: String(surge.category), affectedBarangays: surge.affected_barangays },
    });
    return surge;
  }

  async deactivate(surgeId: string, _userId: string) {
    const surge = await this.prisma.surge_incidents.findUnique({ where: { id: surgeId } });
    if (!surge) throw new NotFoundException('Surge incident not found');
    if (surge.status !== 'ACTIVE') throw new BadRequestException('This surge is not active.');
    const updated = await this.prisma.surge_incidents.update({
      where: { id: surgeId },
      data: { status: 'INACTIVE', deactivated_at: new Date() },
    });
    await this.audit?.log({
      action: AuditAction.UPDATE,
      actorId: _userId,
      entityType: 'surge_incident',
      entityId: surgeId,
      moduleId: 'MOD-52',
      oldValues: { status: 'ACTIVE' },
      newValues: { status: 'INACTIVE' },
    });
    return updated;
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

  /**
   * Sends the message to every active responder as an in-app notice (saved, and
   * pushed live to open apps). Each delivery is independent; one failure never
   * stops the rest. Returns how many were actually delivered.
   */
  async broadcast(dto: { surgeId: string; message: string }, userId: string) {
    const surge = await this.prisma.surge_incidents.findUnique({ where: { id: dto.surgeId } });
    if (!surge) throw new NotFoundException('Surge incident not found');
    if (surge.status !== 'ACTIVE') throw new BadRequestException('Surge is not active');
    // `status` tracks identity verification (PENDING_VERIFICATION is normal for
    // a roster that hasn't done phone verification yet), not on-duty readiness,
    // so only exclude accounts that can no longer sign in at all — matches the
    // roster filter responders.service.ts uses elsewhere.
    const responders = await this.prisma.user.findMany({
      where: { role: 'RESPONDER', status: { notIn: ['SUSPENDED', 'DEACTIVATED'] } },
      select: { id: true },
    });
    const message = dto.message.trim();
    const results = await Promise.allSettled(
      responders.map((r) =>
        this.notifications!.create({
          userId: r.id,
          eventType: 'SURGE_BROADCAST',
          title: `Surge: ${surge.name}`,
          body: message,
          dataPayload: { surgeId: surge.id },
        }),
      ),
    );
    const delivered = results.filter((r) => r.status === 'fulfilled').length;
    if (delivered < responders.length) {
      this.logger.warn(`Surge broadcast reached ${delivered}/${responders.length} responders`);
    }
    const sentAt = new Date();
    await this.audit?.log({
      action: AuditAction.CREATE,
      actorId: userId,
      entityType: 'surge_broadcast',
      entityId: surge.id,
      moduleId: 'MOD-52',
      newValues: { message, recipientCount: responders.length, delivered },
    });
    return { surgeId: surge.id, sentBy: userId, recipientCount: responders.length, delivered, message, sentAt };
  }
}
