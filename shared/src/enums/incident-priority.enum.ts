export enum IncidentPriority {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export const PRIORITY_WEIGHTS: Readonly<Record<IncidentPriority, number>> = {
  [IncidentPriority.CRITICAL]: 4,
  [IncidentPriority.HIGH]: 3,
  [IncidentPriority.MEDIUM]: 2,
  [IncidentPriority.LOW]: 1,
};

/**
 * MOD-24 — what every screen shows for a priority. Priority sets the ORDER of
 * response, never whether an incident gets one, so no label may read as
 * "can wait indefinitely" (no "Low"). The stored enum values are unchanged.
 */
export const PRIORITY_LABELS: Readonly<Record<IncidentPriority, string>> = {
  [IncidentPriority.CRITICAL]: 'Immediate',
  [IncidentPriority.HIGH]: 'Urgent',
  [IncidentPriority.MEDIUM]: 'Prompt',
  [IncidentPriority.LOW]: 'Standard',
};

/** Display label for a stored priority value; unknown or missing → "—". */
export function priorityLabel(priority?: string | null): string {
  if (!priority) return '—';
  return PRIORITY_LABELS[priority as IncidentPriority] ?? priority;
}
