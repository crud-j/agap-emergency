export const QUEUE_NAMES = {
  NOTIFICATIONS: 'notifications',
  SMS: 'sms',
  PUSH_NOTIFICATIONS: 'push-notifications',
  INCIDENT_RETRY: 'incident-retry',
  OFFLINE_SYNC: 'offline-sync',
  ESCALATION: 'escalation',
  SLA_MONITOR: 'sla-monitor',
  LOCATION_PROCESSING: 'location-processing',
  ANALYTICS_AGGREGATION: 'analytics-aggregation',
  AUDIT_PROCESSING: 'audit-processing',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
