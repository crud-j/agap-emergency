import type { AnalyticsNarrative } from '../prompts/analytics-narrative.prompt';

/** Digits with an optional decimal part; thousands separators are removed first. */
const NUMBER = /\d+(?:\.\d+)?/g;
/** Words that state a ratio the input never gives. */
const RATIO_WORDS = /\b(doubled|doubling|tripled|tripling|quadrupled|twice|half|halved)\b/i;

function numbersIn(text: string): string[] {
  return (text.replace(/(\d),(?=\d{3}\b)/g, '$1').match(NUMBER) ?? []).map(canonical);
}

/** "12.0" and "12" are the same number; "08" and "8" too. */
function canonical(token: string): string {
  return String(Number(token));
}

export type NarrativeCheck = { ok: true } | { ok: false; reason: string };

/**
 * Every number in the summary must appear in the text the model was sent, and no ratio
 * word may appear (the input never states one). The reason names the problem, never the
 * text, so it can be logged.
 */
export function checkNarrative(narrative: AnalyticsNarrative, input: string): NarrativeCheck {
  const allowed = new Set(numbersIn(input));
  const texts = [narrative.headline, ...narrative.points, ...narrative.watchItems];
  for (const text of texts) {
    if (RATIO_WORDS.test(text)) return { ok: false, reason: 'ratio word' };
    const unknown = numbersIn(text).find((n) => !allowed.has(n));
    if (unknown !== undefined) return { ok: false, reason: 'number not in the input' };
  }
  return { ok: true };
}
