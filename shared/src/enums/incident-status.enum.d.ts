export declare enum IncidentStatus {
    DRAFT = "DRAFT",
    SUBMITTED = "SUBMITTED",
    RECEIVED = "RECEIVED",
    ACKNOWLEDGED = "ACKNOWLEDGED",
    ASSESSED = "ASSESSED",
    DISPATCH_PENDING = "DISPATCH_PENDING",
    DISPATCHED = "DISPATCHED",
    EN_ROUTE = "EN_ROUTE",
    ON_SCENE = "ON_SCENE",
    TRANSPORTING = "TRANSPORTING",
    ASSISTING = "ASSISTING",
    RESOLVED = "RESOLVED",
    CLOSED = "CLOSED",
    CANCELLED = "CANCELLED",
    FALSE_ALERT = "FALSE_ALERT",
    DUPLICATE = "DUPLICATE",
    UNABLE_TO_RESPOND = "UNABLE_TO_RESPOND",
    REFERRED = "REFERRED"
}
export declare const TERMINAL_INCIDENT_STATUSES: ReadonlySet<IncidentStatus>;
export declare const INCIDENT_STATUS_TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>>;
//# sourceMappingURL=incident-status.enum.d.ts.map