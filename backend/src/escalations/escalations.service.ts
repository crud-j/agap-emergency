import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class EscalationsService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.escalation.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED', acknowledged_at: new Date() },
    });
  }

  async resolve(id: string, _userId: string) {
    await this.findById(id);
    return this.prisma.escalation.update({
      where: { id },
      data: { status: 'RESOLVED', resolved_at: new Date() },
    });
  }
}
