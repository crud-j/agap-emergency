import { Injectable, BadRequestException } from '@nestjs/common';
import { IncidentStatus, INCIDENT_STATUS_TRANSITIONS, TERMINAL_INCIDENT_STATUSES } from '@agap/shared';

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
}
