import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, type Incident, type user_role } from '@prisma/client';
import { IncidentStatus, INCIDENT_STATUS_TRANSITIONS, TERMINAL_INCIDENT_STATUSES } from '@agap/shared';

/** The incident column stamped when a status is entered. TRANSPORTING/ASSISTING have none. */
const STATUS_TIMESTAMP_COLUMN = {
  [IncidentStatus.ACKNOWLEDGED]: 'acknowledged_at',
  [IncidentStatus.ASSESSED]: 'assessed_at',
  [IncidentStatus.DISPATCHED]: 'dispatched_at',
  [IncidentStatus.EN_ROUTE]: 'en_route_at',
  [IncidentStatus.ON_SCENE]: 'on_scene_at',
  [IncidentStatus.RESOLVED]: 'resolved_at',
  [IncidentStatus.CLOSED]: 'closed_at',
} as const;

type StatusTimestampColumn = (typeof STATUS_TIMESTAMP_COLUMN)[keyof typeof STATUS_TIMESTAMP_COLUMN];

export interface RecordTransitionInput {
  incidentId: string;
  from: IncidentStatus;
  to: IncidentStatus;
  actorId: string;
  actorRole?: string;
  notes?: string | null;
  at?: Date;
}

@Injectable()
export class IncidentStatusService {
  validateTransition(current: IncidentStatus, next: IncidentStatus): void {
    if (TERMINAL_INCIDENT_STATUSES.has(current)) {
      throw new BadRequestException(
        `Incident is in terminal state ${current} and cannot be transitioned`,
      );
    }

    const allowed = INCIDENT_STATUS_TRANSITIONS[current];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Invalid status transition: ${current} → ${next}. Allowed: ${allowed.join(', ')}`,
      );
    }
  }

  isTerminal(status: IncidentStatus): boolean {
    return TERMINAL_INCIDENT_STATUSES.has(status);
  }

  getAllowedTransitions(status: IncidentStatus): readonly IncidentStatus[] {
    return INCIDENT_STATUS_TRANSITIONS[status] ?? [];
  }

  statusTimestampFields(status: IncidentStatus, at: Date): Partial<Record<StatusTimestampColumn, Date>> {
    const column = STATUS_TIMESTAMP_COLUMN[status as keyof typeof STATUS_TIMESTAMP_COLUMN];
    return column ? { [column]: at } : {};
  }

  /**
   * The one place an incident status change is written (MOD-15): status + its
   * timestamp column + the IncidentEvent row, inside the caller's transaction.
   * The update only matches while the incident is still in `from`, so two
   * concurrent changes cannot both apply; the loser gets a 409.
   */
  async recordTransition(tx: Prisma.TransactionClient, input: RecordTransitionInput): Promise<Incident> {
    const { incidentId, from, to, actorId, actorRole, notes, at = new Date() } = input;
    this.validateTransition(from, to);

    let updated: Incident;
    try {
      updated = await tx.incident.update({
        where: { id: incidentId, status: from },
        data: { status: to, ...this.statusTimestampFields(to, at) },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new ConflictException({
          code: 'INCIDENT_STATUS_CHANGED',
          message: 'The incident status changed. Refresh and try again.',
        });
      }
      throw error;
    }

    await tx.incidentEvent.create({
      data: {
        incident_id: incidentId,
        from_status: from,
        to_status: to,
        triggered_by_id: actorId,
        triggered_by_role: (actorRole ?? null) as user_role | null,
        notes: notes ?? null,
      },
    });
    return updated;
  }
}
