import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { AuditAction } from '@agap/shared';

export interface CreateHandoverDto {
  toUserId: string;
  situationSummary: string;
  pendingActions?: string[];
  resourcesInField?: Record<string, unknown>;
}

/**
 * MOD-44 — Incident Handover. Records operator-to-operator shift transfers with
 * situation summary, pending action list, and optional field resource snapshot.
 * Emits `incident.handover` on create and acknowledge so the incoming operator's
 * UI updates live. Audit writes are fire-and-forget (never block the operation).
 */
@Injectable()
export class IncidentHandoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(incidentId: string, dto: CreateHandoverDto, fromUserId: string) {
    // Verify incident exists before creating handover
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException('Incident not found');

    const handover = await this.prisma.incident_handovers.create({
      data: {
        incident_id: incidentId,
        from_user_id: fromUserId,
        to_user_id: dto.toUserId,
        situation_summary: dto.situationSummary,
        pending_actions: dto.pendingActions ?? [],
        resources_in_field: (dto.resourcesInField ?? null) as any,
      },
    });

    void this.audit.log({
      action: AuditAction.CREATE,
      actorId: fromUserId,
      entityType: 'incident_handover',
      entityId: handover.id,
      moduleId: 'MOD-44',
      incidentId,
      newValues: {
        to_user_id: dto.toUserId,
        pending_action_count: (dto.pendingActions ?? []).length,
      },
    });

    this.realtime.incidentHandover(incidentId, {
      handoverId: handover.id,
      fromUserId,
      toUserId: dto.toUserId,
      handedOverAt: handover.handed_over_at.toISOString(),
      pendingActionCount: handover.pending_actions.length,
    });

    return handover;
  }

  async list(incidentId: string) {
    return this.prisma.incident_handovers.findMany({
      where: { incident_id: incidentId },
      orderBy: { handed_over_at: 'desc' },
      include: {
        users_incident_handovers_from_user_idTousers: {
          select: { id: true, full_name: true, role: true },
        },
        users_incident_handovers_to_user_idTousers: {
          select: { id: true, full_name: true, role: true },
        },
      },
    });
  }

  async acknowledge(incidentId: string, userId: string) {
    const handover = await this.prisma.incident_handovers.findFirst({
      where: {
        incident_id: incidentId,
        to_user_id: userId,
        acknowledged_at: null,
      },
      orderBy: { handed_over_at: 'desc' },
    });
    if (!handover) throw new NotFoundException('Pending handover not found for this user');

    const updated = await this.prisma.incident_handovers.update({
      where: { id: handover.id },
      data: { acknowledged_at: new Date() },
    });

    void this.audit.log({
      action: AuditAction.UPDATE,
      actorId: userId,
      entityType: 'incident_handover',
      entityId: handover.id,
      moduleId: 'MOD-44',
      incidentId,
      newValues: { acknowledged_at: updated.acknowledged_at?.toISOString() },
    });

    this.realtime.incidentHandover(incidentId, {
      handoverId: handover.id,
      acknowledgedBy: userId,
      acknowledgedAt: updated.acknowledged_at?.toISOString(),
    });

    return updated;
  }
}
