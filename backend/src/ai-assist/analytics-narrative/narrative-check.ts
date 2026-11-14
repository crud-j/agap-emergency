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

/** Words that carry no meaning of their own when comparing two sentences. */
const FILLER = new Set(['the', 'a', 'an', 'of', 'in', 'at', 'on', 'to', 'for', 'with', 'and', 'or', 'is', 'are', 'was', 'were', 'past', 'target', 'targets', 'response']);

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !FILLER.has(w)),
  );
}

/**
 * True when `item` says what `point` already says: every number in the item is in the
 * point, and at least 60% of the item's words are too ("2 incidents still waiting past the
 * Acknowledged target" against "… Acknowledged met at 29% with 2 incidents still waiting").
 */
export function repeatsPoint(item: string, point: string): boolean {
  const pointNumbers = new Set(numbersIn(point));
  const itemNumbers = numbersIn(item);
  if (!itemNumbers.every((n) => pointNumbers.has(n))) return false;
  const itemWords = words(item);
  if (itemWords.size === 0) return itemNumbers.length > 0;
  const pointWords = words(point);
  const shared = [...itemWords].filter((w) => pointWords.has(w)).length;
  return shared / itemWords.size >= 0.6;
}

/**
 * "Worth a look" must add something: drops each item that repeats a point or an earlier
 * item. The model is told not to repeat; this catches it when it does anyway.
 */
export function dropRepeatedWatchItems(narrative: AnalyticsNarrative): AnalyticsNarrative {
  const kept: string[] = [];
  for (const item of narrative.watchItems) {
    if ([narrative.headline, ...narrative.points, ...kept].some((text) => repeatsPoint(item, text))) continue;
    kept.push(item);
  }
  return { ...narrative, watchItems: kept };
}

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
