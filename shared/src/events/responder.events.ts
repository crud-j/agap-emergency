import type { ResponderStatus } from '../enums/responder-status.enum';

export const RESPONDER_EVENTS = {
  LOCATION_UPDATED: 'responder.location_updated',
  STATUS_CHANGED: 'responder.status_changed',
  AVAILABILITY_CHANGED: 'responder.availability_changed',
} as const;

export type ResponderEventName = (typeof RESPONDER_EVENTS)[keyof typeof RESPONDER_EVENTS];

export interface ResponderLocationUpdatedPayload {
  responderId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updatedAt: string;
}

export interface ResponderStatusChangedPayload {
  responderId: string;
  previousStatus: ResponderStatus;
  newStatus: ResponderStatus;
  changedAt: string;
}
