import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

/** Roles that may see every incident (ops staff). */
export const INCIDENT_STAFF_ROLES: readonly string[] = [
  'DISPATCHER',
  'SUPERVISOR',
  'SYSTEM_ADMINISTRATOR',
  'ORG_ADMINISTRATOR',
];

export type IncidentParticipation = 'staff' | 'reporter' | 'crew';

export interface ParticipantActor {
  id: string;
  role: string;
}

/**
 * Single source of truth for "may this user see this incident's live data?"
 * (MOD-13 / MOD-33 / MOD-47). Used by both the WebSocket room join and the REST
 * tracking endpoints so the two rules cannot drift apart.
 *
 * - staff: ops roles see every incident;
 * - reporter: the registered user who reported it (guests have no account);
 * - crew: a user on any dispatch crew for the incident.
 */
@Injectable()
export class IncidentParticipantService {
  constructor(private readonly prisma: PrismaService) {}

  isStaff(role: string | undefined | null): boolean {
    return !!role && INCIDENT_STAFF_ROLES.includes(role);
  }

  async getParticipation(actor: ParticipantActor, incidentId: string): Promise<IncidentParticipation | null> {
    if (this.isStaff(actor.role)) return 'staff';

    const reporter = await this.prisma.incidentReporter.findUnique({
      where: { incident_id: incidentId },
      select: { user_id: true },
    });
    if (reporter?.user_id && reporter.user_id === actor.id) return 'reporter';

    const crewCount = await this.prisma.dispatch_crew.count({
      where: { user_id: actor.id, dispatches: { incident_id: incidentId } },
    });
    return crewCount > 0 ? 'crew' : null;
  }

  async assertParticipant(actor: ParticipantActor, incidentId: string): Promise<IncidentParticipation> {
    const participation = await this.getParticipation(actor, incidentId);
    if (!participation) {
      throw new ForbiddenException('Not a participant of this incident');
    }
    return participation;
  }
}
