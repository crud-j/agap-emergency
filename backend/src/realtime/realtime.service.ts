import { Injectable, Logger } from '@nestjs/common';
import { AgapGateway } from './agap.gateway';
import type { IncidentCreatedPayload, IncidentStatusChangedPayload } from '@agap/shared';
import { INCIDENT_EVENTS, RESPONDER_EVENTS } from '@agap/shared';

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

  notifyResponderLocationUpdated(
    incidentId: string,
    payload: {
      responderId: string;
      lat: number;
      lng: number;
      heading?: number | null;
      speed?: number | null;
      updatedAt: string;
    },
  ): void {
    const envelope = { incidentId, ...payload };
    this.gateway.emitToOps(RESPONDER_EVENTS.LOCATION_UPDATED, envelope);
    this.gateway.emitToIncident(INCIDENT_EVENTS.LOCATION_UPDATED, incidentId, envelope);
  }

  notifyDispatchCreated(
    incidentId: string,
    payload: { dispatchId: string; resourceId: string; status: string },
  ): void {
    const envelope = { incidentId, ...payload };
    this.gateway.emitToOps(INCIDENT_EVENTS.DISPATCHED, envelope);
    this.gateway.emitToIncident(INCIDENT_EVENTS.DISPATCHED, incidentId, envelope);
  }

  notifyDispatchCancelled(
    incidentId: string,
    payload: { dispatchId: string; resourceId: string },
  ): void {
    const envelope = { incidentId, eventType: 'dispatch.cancelled', ...payload };
    this.gateway.emitToOps(INCIDENT_EVENTS.UPDATED, envelope);
    this.gateway.emitToIncident(INCIDENT_EVENTS.UPDATED, incidentId, envelope);
  }

  notifyEscalation(
    incidentId: string,
    payload: { escalationId: string; escalationType: string; incidentStatus: string },
  ): void {
    this.gateway.emitToOps(INCIDENT_EVENTS.ESCALATED, { incidentId, ...payload });
    this.logger.log(`Emitted ${INCIDENT_EVENTS.ESCALATED} for incident ${incidentId}`);
  }

  notifyEtaUpdated(
    incidentId: string,
    payload: { dispatchId: string; etaSeconds: number; isEstimate: true; calculatedAt: string },
  ): void {
    const envelope = { incidentId, ...payload };
    this.gateway.emitToIncident(RESPONDER_EVENTS.ETA_UPDATED, incidentId, envelope);
    this.gateway.emitToOps(RESPONDER_EVENTS.ETA_UPDATED, envelope);
  }
}
