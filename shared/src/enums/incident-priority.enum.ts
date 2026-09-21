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
