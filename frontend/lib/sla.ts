/**
 * Client-side SLA computation for the dispatch queue (MOD-41).
 *
 * Deadlines are cumulative from `submitted_at`, matching the backend SLA monitor
 * and the seeded `sla_policies`. Thresholds are mirrored here because the policy
 * endpoint is supervisor-scoped; keep in sync with `prisma/seed/seed.ts`.
 * SLA values are operational targets, never guarantees of physical response time.
 */

interface SlaThresholds {
  ack: number; // seconds from submission to acknowledge
  dispatch: number; // …to dispatch
  onScene: number; // …to on-scene
}

const SLA_BY_PRIORITY: Record<string, SlaThresholds> = {
  CRITICAL: { ack: 60, dispatch: 120, onScene: 600 },
  HIGH: { ack: 120, dispatch: 300, onScene: 900 },
  MEDIUM: { ack: 300, dispatch: 600, onScene: 1800 },
  LOW: { ack: 600, dispatch: 1200, onScene: 3600 },
};

const ACK_DONE = new Set([
  'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING', 'DISPATCHED', 'EN_ROUTE',
  'ON_SCENE', 'TRANSPORTING', 'ASSISTING', 'RESOLVED', 'CLOSED',
]);
const DISPATCH_DONE = new Set([
  'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING', 'RESOLVED', 'CLOSED',
]);
const ONSCENE_DONE = new Set(['ON_SCENE', 'TRANSPORTING', 'ASSISTING', 'RESOLVED', 'CLOSED']);

export interface SlaInput {
  priority: string;
  status: string;
  submitted_at: string;
  acknowledged_at?: string | null;
  dispatched_at?: string | null;
  on_scene_at?: string | null;
}

export interface SlaState {
  label: string; // next milestone, e.g. "Dispatch"
  remainingSecs: number; // negative when breached
  breached: boolean;
  warn: boolean; // within the final 60s before a deadline
  met: boolean; // all tracked milestones satisfied
}

export function computeSla(incident: SlaInput, nowMs: number = Date.now()): SlaState {
  const t = SLA_BY_PRIORITY[incident.priority] ?? SLA_BY_PRIORITY.MEDIUM!;
  const submitted = new Date(incident.submitted_at).getTime();

  const acknowledged = !!incident.acknowledged_at || ACK_DONE.has(incident.status);
  const dispatched = !!incident.dispatched_at || DISPATCH_DONE.has(incident.status);
  const onScene = !!incident.on_scene_at || ONSCENE_DONE.has(incident.status);

  let label: string;
  let deadlineSecs: number;
  if (!acknowledged) {
    label = 'Acknowledge';
    deadlineSecs = t.ack;
  } else if (!dispatched) {
    label = 'Dispatch';
    deadlineSecs = t.dispatch;
  } else if (!onScene) {
    label = 'On scene';
    deadlineSecs = t.onScene;
  } else {
    return { label: 'SLA met', remainingSecs: 0, breached: false, warn: false, met: true };
  }

  const remainingSecs = Math.round((submitted + deadlineSecs * 1000 - nowMs) / 1000);
  return {
    label,
    remainingSecs,
    breached: remainingSecs < 0,
    warn: remainingSecs >= 0 && remainingSecs <= 60,
    met: false,
  };
}

/** "m:ss" countdown; breached times render as "+m:ss over". */
export function formatCountdown(remainingSecs: number): string {
  const over = remainingSecs < 0;
  const abs = Math.abs(remainingSecs);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const body = `${m}:${String(s).padStart(2, '0')}`;
  return over ? `+${body} over` : body;
}
