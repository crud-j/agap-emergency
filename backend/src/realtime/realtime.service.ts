import { Injectable, Logger } from '@nestjs/common';
import { AgapGateway } from './agap.gateway';
import type { IncidentCreatedPayload, IncidentStatusChangedPayload } from '@agap/shared';
import { INCIDENT_EVENTS } from '@agap/shared';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly gateway: AgapGateway) {}

  notifyIncidentCreated(payload: IncidentCreatedPayload): void {
    this.gateway.emitToOps(INCIDENT_EVENTS.CREATED, payload);
    this.logger.log(`Emitted ${INCIDENT_EVENTS.CREATED} for incident ${payload.incidentId}`);
  }

  notifyIncidentStatusChanged(payload: IncidentStatusChangedPayload): void {
    this.gateway.emitToOps(INCIDENT_EVENTS.STATUS_CHANGED, payload);
    this.gateway.emitToIncident(
      INCIDENT_EVENTS.STATUS_CHANGED,
      payload.incidentId,
      payload,
    );
  }
}
