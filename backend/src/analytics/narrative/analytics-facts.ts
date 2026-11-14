import type { incident_priority } from '@prisma/client';
import type { AnalyticsDateRange, ResponseIntervals } from '../analytics.service';
import { categoryLabel, priorityLabel } from '../export/labels';

/**
 * MOD-50 AI summary, step 1 (no AI here): the totals for a period and the period before
 * it, and the changes worth mentioning. Code decides every number and every change; the
 * model only words them. Aggregates only: no incident rows, names, phone numbers,
 * addresses, coordinates, descriptions or medical data. Barangay is the finest location.
 */

/** Below this many incidents in the period there is no summary at all. */
export const MIN_INCIDENTS_FOR_SUMMARY = 5;
/** Smallest base for any comparison (a category, a target, an average). */
export const MIN_SAMPLE = 5;
/** The Analytics page shows a response target in amber below this. */
export const TARGET_WARNING_PCT = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One step's response-target result, as getSlaCompliance() returns it. */
export interface TargetStat {
  met: number;
  /** Reached the step, plus still waiting past the target. */
  counted: number;
  overdue: number;
  pct: number | null;
}

/** Everything the database gives for one period (see AnalyticsFactsService). */
export interface PeriodTotals {
  range: AnalyticsDateRange;
  incidents: number;
  byCategory: { category: string; count: number }[];
  byPriority: { priority: incident_priority; count: number }[];
  byBarangay: { barangay: string; count: number }[];
  targets: { acknowledge: TargetStat; dispatch: TargetStat; onScene: TargetStat };
  intervals: ResponseIntervals;
  falseAlerts: { count: number; ratePct: number | null };
}

export interface CountRow {
  label: string;
  current: number;
  previous: number;
}

export interface TargetRow {
  step: string;
  current: TargetStat;
  previous: TargetStat;
}

export interface MinutesRow {
  step: string;
  current: number | null;
  currentN: number;
  previous: number | null;
  previousN: number;
}

/** What is sent to the model, and stored with the summary so every number can be traced. */
export interface AnalyticsFacts {
  period: { from: string; to: string; days: number; label: string; previousLabel: string };
  incidents: { current: number; previous: number };
  byCategory: CountRow[];
  byPriority: CountRow[];
  byBarangay: CountRow[];
  responseTargets: TargetRow[];
  averageMinutes: MinutesRow[];
  falseAlerts: { current: number; currentRatePct: number | null; previous: number; previousRatePct: number | null };
  /** Changes found by code, as plain sentences. The model may only word these. */
  changes: string[];
}

/** Seconds → minutes with one decimal (null stays null), as in the CSV export. */
export function toMinutes(secs: number | null): number | null {
  return secs === null ? null : Math.round(secs / 6) / 10;
}

/** "15 Oct 2026" in Asia/Manila. */
export function manilaDayLabel(at: Date): string {
  const t = new Date(at.getTime() + MANILA_OFFSET_MS);
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}

/** The period of the same length that ends where `range` starts. */
export function previousRange(range: AnalyticsDateRange): AnalyticsDateRange {
  const length = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - length), to: new Date(range.from) };
}

export function periodDays(range: AnalyticsDateRange): number {
  return Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS));
}

function periodLabel(range: AnalyticsDateRange): string {
  // `to` is exclusive; a range ending exactly at midnight ends the day before.
  return `${manilaDayLabel(range.from)} to ${manilaDayLabel(new Date(range.to.getTime() - 1))}`;
}

/** Rows present in either period, most in the current period first, then by name. */
function mergeCounts(
  current: { key: string; count: number }[],
  previous: { key: string; count: number }[],
  label: (key: string) => string,
): CountRow[] {
  const keys = new Set([...current.map((r) => r.key), ...previous.map((r) => r.key)]);
  const find = (rows: { key: string; count: number }[], key: string) => rows.find((r) => r.key === key)?.count ?? 0;
  return [...keys]
    .map((key) => ({ label: label(key), current: find(current, key), previous: find(previous, key) }))
    .filter((row) => row.current > 0 || row.previous > 0)
    .sort((a, b) => b.current - a.current || b.previous - a.previous || a.label.localeCompare(b.label));
}

export function buildFacts(current: PeriodTotals, previous: PeriodTotals): AnalyticsFacts {
  const steps = [
    ['Acknowledged', 'acknowledge'],
    ['Dispatched', 'dispatch'],
    ['First unit on scene', 'onScene'],
  ] as const;
  const intervals = [
    ['Report to acknowledged', 'acknowledge'],
    ['Report to dispatched', 'dispatch'],
    ['Dispatched to first unit on scene', 'arrival'],
  ] as const;

  const facts: AnalyticsFacts = {
    period: {
      from: current.range.from.toISOString(),
      to: current.range.to.toISOString(),
      days: periodDays(current.range),
      label: periodLabel(current.range),
      previousLabel: periodLabel(previous.range),
    },
    incidents: { current: current.incidents, previous: previous.incidents },
    byCategory: mergeCounts(
      current.byCategory.map((r) => ({ key: r.category, count: r.count })),
      previous.byCategory.map((r) => ({ key: r.category, count: r.count })),
      (key) => categoryLabel(key),
    ),
    byPriority: mergeCounts(
      current.byPriority.map((r) => ({ key: r.priority, count: r.count })),
      previous.byPriority.map((r) => ({ key: r.priority, count: r.count })),
      (key) => priorityLabel(key),
    ),
    byBarangay: mergeCounts(
      current.byBarangay.map((r) => ({ key: r.barangay, count: r.count })),
      previous.byBarangay.map((r) => ({ key: r.barangay, count: r.count })),
      (key) => key,
    ),
    responseTargets: steps.map(([step, key]) => ({ step, current: current.targets[key], previous: previous.targets[key] })),
    averageMinutes: intervals.map(([step, key]) => ({
      step,
      current: toMinutes(current.intervals[key].avgSec),
      currentN: current.intervals[key].n,
      previous: toMinutes(previous.intervals[key].avgSec),
      previousN: previous.intervals[key].n,
    })),
    falseAlerts: {
      current: current.falseAlerts.count,
      currentRatePct: current.falseAlerts.ratePct,
      previous: previous.falseAlerts.count,
      previousRatePct: previous.falseAlerts.ratePct,
    },
    changes: [],
  };
  facts.changes = findChanges(facts);
  return facts;
}

/** A count that moved enough to mention: at least 3 either way, by half or more, on a base of 5. */
function countMoved(current: number, previous: number): 'up' | 'down' | null {
  if (current >= MIN_SAMPLE && current - previous >= 3 && (previous === 0 || current >= previous * 1.5)) return 'up';
  if (previous >= MIN_SAMPLE && previous - current >= 3 && current <= previous / 1.5) return 'down';
  return null;
}

/**
 * The changes worth a sentence, in a fixed order. Every number in them is already in
 * the facts, so the model never has to compute one.
 */
export function findChanges(facts: AnalyticsFacts): string[] {
  const out: string[] = [];
  const { current, previous } = facts.incidents;
  out.push(
    previous === current
      ? `Incidents reported: ${current}, the same as the previous period.`
      : `Incidents reported: ${current}, ${current > previous ? 'up' : 'down'} from ${previous} in the previous period.`,
  );

  for (const [kind, rows] of [
    ['Category', facts.byCategory],
    ['Barangay', facts.byBarangay],
  ] as const) {
    for (const row of rows) {
      if (kind === 'Barangay' && row.label === 'Unassigned') continue;
      const moved = countMoved(row.current, row.previous);
      if (moved) out.push(`${kind} ${row.label}: ${row.current} incidents, ${moved} from ${row.previous}.`);
    }
  }

  for (const row of facts.responseTargets) {
    const now = row.current;
    const before = row.previous;
    if (now.pct !== null && now.counted >= MIN_SAMPLE) {
      const fell = before.pct !== null && before.counted >= MIN_SAMPLE && before.pct - now.pct >= 10;
      if (now.pct < TARGET_WARNING_PCT || fell) {
        out.push(
          `Response target "${row.step}": ${now.pct}% met (${now.met} of ${now.counted})` +
            (fell ? `, down from ${before.pct}%.` : `, below the ${TARGET_WARNING_PCT}% line.`),
        );
      }
    }
    if (now.overdue > 0) {
      out.push(`Response target "${row.step}": ${now.overdue} incidents still waiting past the target.`);
    }
  }

  for (const row of facts.averageMinutes) {
    if (row.current === null || row.previous === null) continue;
    if (row.currentN < MIN_SAMPLE || row.previousN < MIN_SAMPLE || row.previous === 0) continue;
    const diff = row.current - row.previous;
    if (Math.abs(diff) >= 1 && Math.abs(diff) / row.previous >= 0.2) {
      out.push(`Average time "${row.step}": ${row.current} minutes, ${diff > 0 ? 'slower' : 'faster'} than ${row.previous} minutes.`);
    }
  }

  const fa = facts.falseAlerts;
  if (
    fa.currentRatePct !== null &&
    fa.previousRatePct !== null &&
    current >= MIN_SAMPLE &&
    previous >= MIN_SAMPLE &&
    Math.abs(fa.currentRatePct - fa.previousRatePct) >= 5
  ) {
    out.push(
      `False alert rate: ${fa.currentRatePct}% (${fa.current} of ${current}), ` +
        `${fa.currentRatePct > fa.previousRatePct ? 'up' : 'down'} from ${fa.previousRatePct}%.`,
    );
  }
  return out;
}

const shown = (value: number | null, unit = ''): string => (value === null ? 'no data' : `${value}${unit}`);

/**
 * The facts as the labelled text the model reads. Stable for the same facts, so its
 * hash identifies a repeat request.
 */
export function factsToPromptText(facts: AnalyticsFacts): string {
  const lines: string[] = [
    `PERIOD: ${facts.period.label} (${facts.period.days} days). PREVIOUS PERIOD: ${facts.period.previousLabel}.`,
    `INCIDENTS REPORTED: ${facts.incidents.current} (previous period: ${facts.incidents.previous}).`,
    '',
    'BY CATEGORY (this period / previous):',
    ...facts.byCategory.map((r) => `- ${r.label}: ${r.current} / ${r.previous}`),
    '',
    'BY PRIORITY (this period / previous):',
    ...facts.byPriority.map((r) => `- ${r.label}: ${r.current} / ${r.previous}`),
    '',
    'BY BARANGAY (this period / previous):',
    ...facts.byBarangay.map((r) => `- ${r.label}: ${r.current} / ${r.previous}`),
    '',
    'RESPONSE TARGETS (share of counted incidents handled within target):',
    ...facts.responseTargets.map(
      (r) =>
        `- ${r.step}: ${shown(r.current.pct, '%')} (${r.current.met} of ${r.current.counted}; ` +
        `${r.current.overdue} still waiting past target). Previous: ${shown(r.previous.pct, '%')}.`,
    ),
    '',
    'AVERAGE MINUTES (this period / previous):',
    ...facts.averageMinutes.map((r) => `- ${r.step}: ${shown(r.current)} / ${shown(r.previous)}`),
    '',
    `FALSE ALERTS: ${facts.falseAlerts.current} (${shown(facts.falseAlerts.currentRatePct, '%')}); ` +
      `previous: ${facts.falseAlerts.previous} (${shown(facts.falseAlerts.previousRatePct, '%')}).`,
    '',
    'CHANGES FOUND BY AGAP:',
    ...facts.changes.map((c) => `- ${c}`),
  ];
  return lines.join('\n');
}
