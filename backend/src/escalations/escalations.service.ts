import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class EscalationsService {
  private readonly logger = new Logger(EscalationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async findAll(filters: { status?: string; incidentId?: string }) {
    const where: Prisma.EscalationWhereInput = {};
    if (filters.status) where.status = filters.status as any;
    if (filters.incidentId) where.incident_id = filters.incidentId;
    return this.prisma.escalation.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
  }

  async findById(id: string) {
    const escalation = await this.prisma.escalation.findUnique({ where: { id } });
    if (!escalation) throw new NotFoundException('Escalation not found');
    return escalation;
  }

  async acknowledge(id: string, _userId: string) {
    await this.findById(id);
    const updated = await this.prisma.escalation.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledged_at: new Date() },
    });
    this.emitUpdated(updated);
    return updated;
  }

  async resolve(id: string, _userId: string) {
    await this.findById(id);
    const updated = await this.prisma.escalation.update({
      where: { id },
      data: { status: 'RESOLVED', resolved_at: new Date() },
    });
    this.emitUpdated(updated);
    return updated;
  }

  /**
   * Push the escalation state change to the ops room (MOD-41). Best-effort: a WS
   * failure must never undo the persisted acknowledge/resolve.
   */
  private emitUpdated(escalation: { id: string; incident_id: string; status: string }) {
    try {
      this.realtime.escalationUpdated(escalation.incident_id, {
        escalationId: escalation.id,
        status: escalation.status,
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for escalation update: ${String(err)}`);
    }
  }
}
