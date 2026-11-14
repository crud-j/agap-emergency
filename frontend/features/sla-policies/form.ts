import type { SlaPolicy, SlaPolicyUpdate } from './api';

/** The edit form works in minutes (what people think in); the API stores seconds. */
export interface SlaTargetForm {
  acknowledge: string;
  dispatch: string;
  onScene: string;
}

const MIN_SECS = 30;
const MAX_SECS = 24 * 60 * 60;

/** 90 → "1.5", 120 → "2". */
export function secsToMinutesText(secs: number): string {
  return String(Math.round((secs / 60) * 100) / 100);
}

/** "1.5 min", "2 min", "45 s". */
export function formatTarget(secs: number): string {
  return secs < 60 ? `${secs} s` : `${secsToMinutesText(secs)} min`;
}

export function formFromPolicy(p: SlaPolicy): SlaTargetForm {
  return {
    acknowledge: secsToMinutesText(p.acknowledgeSecs),
    dispatch: secsToMinutesText(p.dispatchSecs),
    onScene: secsToMinutesText(p.onSceneSecs),
  };
}

/**
 * Minutes text → seconds body, or an error message in plain words. Mirrors the API's
 * checks (30 s to 24 h each; acknowledge ≤ dispatch ≤ on scene) so the person sees the
 * problem before saving; the API still enforces them.
 */
export function parseTargetForm(form: SlaTargetForm): { ok: true; body: SlaPolicyUpdate } | { ok: false; error: string } {
  const fields: [keyof SlaTargetForm, string][] = [
    ['acknowledge', 'Acknowledge'],
    ['dispatch', 'Dispatch'],
    ['onScene', 'On scene'],
  ];
  const secs: Partial<Record<keyof SlaTargetForm, number>> = {};
  for (const [key, label] of fields) {
    const minutes = Number(form[key].trim());
    if (form[key].trim() === '' || !Number.isFinite(minutes)) return { ok: false, error: `${label}: enter a number of minutes.` };
    const value = Math.round(minutes * 60);
    if (value < MIN_SECS || value > MAX_SECS) return { ok: false, error: `${label}: must be between 0.5 minutes and 24 hours.` };
    secs[key] = value;
  }
  const { acknowledge = 0, dispatch = 0, onScene = 0 } = secs;
  if (!(acknowledge <= dispatch && dispatch <= onScene)) {
    return { ok: false, error: 'Targets must run in order: acknowledge ≤ dispatch ≤ on scene (all from the report).' };
  }
  return { ok: true, body: { acknowledgeSecs: acknowledge, dispatchSecs: dispatch, onSceneSecs: onScene } };
}
