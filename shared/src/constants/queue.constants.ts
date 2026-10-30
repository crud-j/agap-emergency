export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  SMS: 'sms',
  PUSH_NOTIFICATIONS: 'push-notifications',
  INCIDENT_RETRY: 'incident-retry',
  ESCALATION: 'escalation',
  SLA_MONITOR: 'sla-monitor',
  LOCATION_PROCESSING: 'location-processing',
  ANALYTICS_AGGREGATION: 'analytics-aggregation',
  AUDIT_PROCESSING: 'audit-processing',
  /** AI Assist (AI_ASSIST_PLAN): one job per suggestion, e.g. `reply-<inboundId>`. */
  AI_ASSIST: 'ai-assist',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
