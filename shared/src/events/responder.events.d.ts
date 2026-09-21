import type { ResponderStatus } from '../enums/responder-status.enum';
export declare const RESPONDER_EVENTS: {
    readonly LOCATION_UPDATED: "responder.location_updated";
    readonly STATUS_CHANGED: "responder.status_changed";
    readonly AVAILABILITY_CHANGED: "responder.availability_changed";
};
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
//# sourceMappingURL=responder.events.d.ts.map