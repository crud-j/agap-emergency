const PH_MOBILE = /(\+?63|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
/** IDs, account and plate-like numbers. */
const LONG_ID = /\b\d{8,}\b/g;
const COORDS = /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g;

/**
 * Strips contact details and coordinates from free text before it leaves AGAP (AI_ASSIST_PLAN
 * "Data sent to Gemini"). Free text can still contain a name; that risk is accepted in Phase 0.
 */
export function redactForAi(text: string | null | undefined, max = 1500): string {
  if (!text) return '';
  return text
    .replace(EMAIL, '[removed]')
    .replace(PH_MOBILE, '[removed]')
    .replace(COORDS, '[location removed]')
    .replace(LONG_ID, '[removed]')
    .slice(0, max);
}
