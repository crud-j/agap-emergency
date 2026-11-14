import type { Responder } from './api';

/** Readiness shown on the fleet board: the duty switch, or ON_ASSIGNMENT while riding a unit. */
export type ResponderReadiness = 'ON_ASSIGNMENT' | 'AVAILABLE' | 'OFF_DUTY' | 'UNAVAILABLE' | (string & {});

/**
 * A responder's availability is their own on/off-duty switch and stays AVAILABLE
 * while they ride a unit. The backend refuses to put them on a second unit
 * (RESPONDER_ON_ASSIGNMENT), so the board shows ON_ASSIGNMENT instead.
 */
export function responderReadiness(r: Pick<Responder, 'availability_status' | 'active_assignment'>): ResponderReadiness {
  return r.active_assignment ? 'ON_ASSIGNMENT' : r.availability_status;
}

/** Can crew a new unit now: on duty and not already riding one (any incident). */
export function isFreeForCrew(r: Pick<Responder, 'availability_status' | 'active_assignment'>): boolean {
  return r.availability_status === 'AVAILABLE' && !r.active_assignment;
}

/** "AMB-1 · INC-2026-000123", for the fleet board and the crew picker. */
export function assignmentLabel(r: Pick<Responder, 'active_assignment'>): string | null {
  const a = r.active_assignment;
  if (!a) return null;
  return [a.unit, a.incident_reference].filter(Boolean).join(' · ');
}
