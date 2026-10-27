import type { ResponderStatus } from '../enums/responder-status.enum';
import type { RouteSnapshot, TransportDestinationView, TransportLeg } from '../maps/map.types';

export const RESPONDER_EVENTS = {
  LOCATION_UPDATED: 'responder.location_updated',
  STATUS_CHANGED: 'responder.status_changed',
  AVAILABILITY_CHANGED: 'responder.availability_changed',
  ETA_UPDATED: 'responder.eta_updated',
  ROUTE_UPDATED: 'responder.route_updated',
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

/**
 * `responder.route_updated` — the server-computed route for the unit's current leg.
 * The incident room receives it only on TO_SCENE; on the hospital leg it goes to
 * ops and named user rooms only (C6/C18).
 */
export interface ResponderRouteUpdatedPayload {
  incidentId: string;
  dispatchId: string;
  leg: TransportLeg;
  destination: TransportDestinationView | null;
  route: RouteSnapshot | null;
}

export interface ResponderStatusChangedPayload {
  responderId: string;
  previousStatus: ResponderStatus;
  newStatus: ResponderStatus;
  changedAt: string;
}
