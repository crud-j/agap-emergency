import type { ResponderStatus } from '../enums/responder-status.enum';

export const RESPONDER_EVENTS = {
  LOCATION_UPDATED: 'responder.location_updated',
  STATUS_CHANGED: 'responder.status_changed',
  AVAILABILITY_CHANGED: 'responder.availability_changed',
  ETA_UPDATED: 'responder.eta_updated',
} as const;

export type ResponderEventName = (typeof RESPONDER_EVENTS)[keyof typeof RESPONDER_EVENTS];

export interface ResponderLocationUpdatedPayload {
  responderId: string;
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  updatedAt: string;
  /**
   * Additive, optional fields (older clients ignore them). The envelope sent to
   * the ops and incident rooms always carries `incidentId`; `dispatchId` and
   * `callSign` let maps group crew phones into one unit marker. Never carries
   * the responder's name or phone — this event reaches the reporter.
   */
  incidentId?: string;
  dispatchId?: string;
  callSign?: string | null;
}

/** `responder.eta_updated` — ETA is always an estimate (Rule 13). */
export interface ResponderEtaUpdatedPayload {
  incidentId: string;
  dispatchId: string;
  etaSeconds: number;
  isEstimate: true;
  calculatedAt: string;
}

export interface ResponderStatusChangedPayload {
  responderId: string;
  previousStatus: ResponderStatus;
  newStatus: ResponderStatus;
  changedAt: string;
}
