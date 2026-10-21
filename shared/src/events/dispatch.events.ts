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

/** `dispatch.updated` — crew accepted / declined (status is the new dispatch status). */
export interface DispatchUpdatedPayload {
  incidentId: string;
  dispatchId: string;
  resourceId: string;
  status: string;
  updatedAt: string;
}

export interface DispatchCancelledPayload {
  incidentId: string;
  dispatchId: string;
  resourceId: string;
  cancelledAt?: string;
}
