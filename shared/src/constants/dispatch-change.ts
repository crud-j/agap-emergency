/**
 * MOD-31 — why a dispatcher recalls (cancels) or replaces (reassigns) a unit.
 * The backend validates against these codes and writes the label to the incident
 * timeline and audit trail; the operations console offers them as choices.
 */
export const DISPATCH_CHANGE_REASONS = {
  UNIT_BREAKDOWN: "Vehicle broke down or can't go",
  WRONG_UNIT: 'Wrong unit sent',
  CLOSER_UNIT: 'A closer unit is available',
  CREW_NOT_RESPONDING: 'Crew not responding',
  NOT_NEEDED: 'Unit no longer needed',
  OTHER: 'Other',
} as const;

export type DispatchChangeReason = keyof typeof DISPATCH_CHANGE_REASONS;

export const DISPATCH_CHANGE_REASON_CODES = Object.keys(DISPATCH_CHANGE_REASONS) as DispatchChangeReason[];

/** Reasons that need a written note, because the code alone says nothing. */
export const DISPATCH_CHANGE_NOTE_REQUIRED: ReadonlySet<DispatchChangeReason> = new Set<DispatchChangeReason>(['OTHER']);

export const DISPATCH_CHANGE_NOTES_MAX = 300;

/**
 * A unit can be recalled or replaced while its dispatch is open and the crew has
 * not reached the scene. Once on scene the crew ends its part with Finish on the
 * responder app, so a patient on board is never "cancelled" from the console.
 */
export const CHANGEABLE_DISPATCH_STATUSES: readonly string[] = ['PENDING', 'SENT', 'ACCEPTED'];

export function isDispatchChangeable(dispatch: { status: string; on_scene_at?: string | Date | null }): boolean {
  return CHANGEABLE_DISPATCH_STATUSES.includes(dispatch.status) && !dispatch.on_scene_at;
}

/** "Wrong unit sent — sent the boat, needed the truck" for timelines and notices. */
export function describeDispatchChange(reason: DispatchChangeReason, notes?: string | null): string {
  const label = DISPATCH_CHANGE_REASONS[reason] ?? reason;
  const note = notes?.trim();
  return note ? `${label} — ${note}` : label;
}
