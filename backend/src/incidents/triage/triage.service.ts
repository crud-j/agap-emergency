import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IncidentStatusService } from '../incident-status/incident-status.service';
import { IncidentStatus } from '@agap/shared';

@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly statusService: IncidentStatusService,
  ) {}

  async triage(
    incidentId: string,
    actorId: string,
    options: { markFalse?: boolean; reason?: string },
  ) {
    const incident = await this.prisma.incident.findUniqueOrThrow({
      where: { id: incidentId },
    });

    const current = incident.status as unknown as IncidentStatus;

    if (options.markFalse) {
      this.statusService.validateTransition(current, IncidentStatus.FALSE_ALERT);
      return this.prisma.incident.update({
        where: { id: incidentId },
        data: { status: IncidentStatus.FALSE_ALERT as any },
      });
    }

    this.statusService.validateTransition(current, IncidentStatus.ASSESSED);
    return this.prisma.incident.update({
      where: { id: incidentId },
      data: { status: IncidentStatus.ASSESSED as any, assessed_at: new Date() },
    });
  }
}
