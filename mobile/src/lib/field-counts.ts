/** A count stepper for the crew field forms: unanswered (null) counts from 0, never below 0 or above `max`. */
export function stepCount(value: number | null, delta: 1 | -1, max = 999): number {
  return Math.min(max, Math.max(0, (value ?? 0) + delta));
}
