export const RESOURCE_EVENTS = {
  STATUS_CHANGED: 'resource.status_changed',
} as const;

export type ResourceEventName = (typeof RESOURCE_EVENTS)[keyof typeof RESOURCE_EVENTS];

/** MOD-28 — a response unit's status changed (fleet board, dispatch, resolve). Ops room only. */
export interface ResourceStatusChangedPayload {
  resourceId: string;
  previousStatus?: string;
  newStatus: string;
  changedAt: string;
}
