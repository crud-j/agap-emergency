export declare const QUEUE_NAMES: {
    readonly NOTIFICATIONS: "notifications";
    readonly SMS: "sms";
    readonly PUSH_NOTIFICATIONS: "push-notifications";
    readonly INCIDENT_RETRY: "incident-retry";
    readonly OFFLINE_SYNC: "offline-sync";
    readonly ESCALATION: "escalation";
    readonly SLA_MONITOR: "sla-monitor";
    readonly LOCATION_PROCESSING: "location-processing";
    readonly ANALYTICS_AGGREGATION: "analytics-aggregation";
    readonly AUDIT_PROCESSING: "audit-processing";
};
export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
//# sourceMappingURL=queue.constants.d.ts.map