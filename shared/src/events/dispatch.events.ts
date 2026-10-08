export const DISPATCH_EVENTS = {
  CREATED: 'dispatch.created',
  UPDATED: 'dispatch.updated',
  CANCELLED: 'dispatch.cancelled',
} as const;

export type DispatchEventName = (typeof DISPATCH_EVENTS)[keyof typeof DISPATCH_EVENTS];

export interface DispatchCreatedPayload {
  incidentId: string;
  dispatchId: string;
  resourceId: string;
  status: string;
  createdAt: string;
}

export interface DispatchCancelledPayload {
  incidentId: string;
  dispatchId: string;
  resourceId: string;
  cancelledAt?: string;
}
