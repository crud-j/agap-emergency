/**
 * MOD-41 response targets (SLA): the one definition every part of AGAP uses.
 *
 *  - The live escalation alarm (jobs/processors/sla-monitor.processor.ts)
 *  - Analytics compliance and the CSV exports (analytics/)
 *  - GET /sla-policies, which the web console reads instead of keeping its own copy
 *
 * Targets come from the `sla_policies` table: the most specific active policy for the
 * incident's category and priority wins (category + priority, then either one, then a
 * catch-all; newest first on a tie). FALLBACK_SLA_SECONDS applies only when no active
 * policy matches. Every deadline is measured from `submitted_at`.
 *
 * Targets measure the Operations Center's own speed. They are never a promise of when
 * help arrives.
 */

export type SlaStepKey = 'acknowledge' | 'dispatch' | 'onScene';
/** Job payload names, kept from the first version so jobs already in Redis still run. */
export type SlaEscalationType = 'ACKNOWLEDGEMENT' | 'DISPATCH' | 'RESPONSE';

export interface SlaThresholds {
  acknowledge: number;
  dispatch: number;
  onScene: number;
}

/** Used only when no active policy matches; same as the sla_policies column defaults. */
export const FALLBACK_SLA_SECONDS: Readonly<SlaThresholds> = Object.freeze({
  acknowledge: 120,
  dispatch: 300,
  onScene: 900,
});

/** Statuses after which nothing more is expected, so no step can be missed any more. */
export const SLA_TERMINAL_STATUSES: readonly string[] = [
  'RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND', 'REFERRED',
];

export interface SlaStep {
  key: SlaStepKey;
  escalationType: SlaEscalationType;
  /** Incident column set when the step happens. */
  timestamp: 'acknowledged_at' | 'dispatched_at' | 'on_scene_at';
  /** Active statuses in which the incident is still waiting for this step. */
  waitingStatuses: readonly string[];
  escalationLevel: 'LEVEL_1_SUPERVISOR' | 'LEVEL_2_INCIDENT_COMMANDER' | 'LEVEL_3_ADMINISTRATOR';
  /** Past tense, for "not acknowledged within 2 min". */
  verb: string;
}

const BEFORE_ACK = ['DRAFT', 'SUBMITTED', 'RECEIVED'];
const BEFORE_DISPATCH = [...BEFORE_ACK, 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING'];
const BEFORE_ON_SCENE = [...BEFORE_DISPATCH, 'DISPATCHED', 'EN_ROUTE'];

export const SLA_STEPS: readonly SlaStep[] = [
  {
    key: 'acknowledge',
    escalationType: 'ACKNOWLEDGEMENT',
    timestamp: 'acknowledged_at',
    waitingStatuses: BEFORE_ACK,
    escalationLevel: 'LEVEL_1_SUPERVISOR',
    verb: 'acknowledged',
  },
  {
    key: 'dispatch',
    escalationType: 'DISPATCH',
    timestamp: 'dispatched_at',
    waitingStatuses: BEFORE_DISPATCH,
    escalationLevel: 'LEVEL_2_INCIDENT_COMMANDER',
    verb: 'dispatched',
  },
  {
    key: 'onScene',
    escalationType: 'RESPONSE',
    timestamp: 'on_scene_at',
    waitingStatuses: BEFORE_ON_SCENE,
    escalationLevel: 'LEVEL_3_ADMINISTRATOR',
    verb: 'on scene',
  },
];

export function stepForEscalation(type: string): SlaStep | undefined {
  return SLA_STEPS.find((s) => s.escalationType === type);
}

export interface SlaPolicyRow {
  id: string;
  incident_category: string | null;
  priority: string | null;
  acknowledge_threshold_secs: number;
  dispatch_threshold_secs: number;
  on_scene_threshold_secs: number;
  is_active: boolean;
  created_at: Date;
}

function specificity(p: Pick<SlaPolicyRow, 'incident_category' | 'priority'>): number {
  return (p.incident_category ? 1 : 0) + (p.priority ? 1 : 0);
}

/**
 * The policy that applies to an incident. Same order as the SQL in analytics
 * (getSlaCompliance and the incident-list export): keep the two in step.
 */
export function pickPolicy<T extends SlaPolicyRow>(policies: readonly T[], category: string, priority: string): T | null {
  const candidates = policies.filter(
    (p) =>
      p.is_active &&
      (p.incident_category === null || p.incident_category === category) &&
      (p.priority === null || p.priority === priority),
  );
  candidates.sort(
    (a, b) => specificity(b) - specificity(a) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return candidates[0] ?? null;
}

export function thresholdsOf(policy: SlaPolicyRow | null): SlaThresholds {
  if (!policy) return { ...FALLBACK_SLA_SECONDS };
  return {
    acknowledge: policy.acknowledge_threshold_secs,
    dispatch: policy.dispatch_threshold_secs,
    onScene: policy.on_scene_threshold_secs,
  };
}

export function deadlineFor(submittedAt: Date, thresholds: SlaThresholds, step: SlaStep): Date {
  return new Date(submittedAt.getTime() + thresholds[step.key] * 1000);
}

export interface SlaIncidentState {
  status: string;
  acknowledged_at?: Date | null;
  dispatched_at?: Date | null;
  on_scene_at?: Date | null;
}

/** The step happened: its timestamp is set, or the incident has moved past it. */
export function stepReached(step: SlaStep, incident: SlaIncidentState): boolean {
  if (incident[step.timestamp]) return true;
  return !step.waitingStatuses.includes(incident.status) && !SLA_TERMINAL_STATUSES.includes(incident.status);
}

/** Whole minutes when exact ("2 min"), otherwise seconds ("90 s"). */
export function formatTarget(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`;
}
