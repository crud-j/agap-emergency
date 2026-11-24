/** Display helpers for the System Administration pages (MOD-49). */

export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 0)}m`;
}

export function fmtNumber(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toLocaleString('en-PH');
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", else the date. */
export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const diff = Math.max(0, now - Date.parse(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  return fmtDateTime(iso);
}

export type Tone = 'good' | 'warn' | 'bad' | 'none';

/**
 * Response-time tone. Postgres and Redis sit on Railway's private network, so tens of
 * milliseconds is already slow there; the bucket is across the internet.
 */
export function latencyTone(ms: number | null | undefined, slowMs: number, badMs: number): Tone {
  if (ms === null || ms === undefined) return 'none';
  if (ms >= badMs) return 'bad';
  if (ms >= slowMs) return 'warn';
  return 'good';
}

/** Share of a limit used, as a tone: 80 % warns, 95 % is bad. */
export function usageTone(used: number | null | undefined, max: number | null | undefined): Tone {
  if (!used || !max) return 'none';
  const share = used / max;
  if (share >= 0.95) return 'bad';
  if (share >= 0.8) return 'warn';
  return 'good';
}

export const TONE_TEXT: Record<Tone, string> = {
  good: 'text-agap-green',
  warn: 'text-agap-amberText',
  bad: 'text-agap-danger',
  none: 'text-agap-textSub',
};

export const TONE_BAR: Record<Tone, string> = {
  good: 'bg-agap-green',
  warn: 'bg-agap-amber',
  bad: 'bg-agap-danger',
  none: 'bg-agap-textSub',
};
