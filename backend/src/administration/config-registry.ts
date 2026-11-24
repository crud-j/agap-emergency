import { OVERSIGHT_CONFIG } from '../oversight/oversight.service';
import { LAST_RUN_KEY } from '../risk-intelligence/hotspot-discovery.service';

/**
 * What the Configuration page (MOD-49) knows about each system_configurations key.
 * `readBy` names the feature that reads the key at runtime; a key without it is stored
 * but no code reads it yet, and the page says so instead of pretending it does something.
 */
export interface ConfigKeyInfo {
  label: string;
  type: 'number' | 'boolean' | 'string';
  min?: number;
  max?: number;
  unit?: string;
  readBy?: string;
}

export const KNOWN_CONFIG: Record<string, ConfigKeyInfo> = {
  [OVERSIGHT_CONFIG.waitingMinutes]: {
    label: 'Unacknowledged incident alert',
    type: 'number', min: 1, max: 240, unit: 'minutes',
    readBy: 'Supervisor oversight: flags incidents still waiting after this long',
  },
  [OVERSIGHT_CONFIG.staleLocationMinutes]: {
    label: 'Stale responder location alert',
    type: 'number', min: 1, max: 240, unit: 'minutes',
    readBy: 'Supervisor oversight: flags units whose last GPS fix is older than this',
  },
  bocaue_river_critical_level_meters: { label: 'Bocaue River critical level', type: 'number', min: 1, max: 30, unit: 'm' },
  sms_enabled: { label: 'SMS enabled', type: 'boolean' },
  default_language: { label: 'Default language', type: 'string' },
  sos_cancel_window_seconds: { label: 'SOS cancel window', type: 'number', min: 0, max: 120, unit: 'seconds' },
  max_offline_queue_age_hours: { label: 'Offline queue maximum age', type: 'number', min: 1, max: 168, unit: 'hours' },
  eta_update_interval_seconds: { label: 'ETA update interval', type: 'number', min: 5, max: 600, unit: 'seconds' },
  duplicate_detection_radius_meters: { label: 'Duplicate detection radius', type: 'number', min: 10, max: 5000, unit: 'm' },
};

/**
 * Rows that live in system_configurations but are not settings: per-user push tokens
 * (personal device identifiers) and job bookkeeping. Never listed, never editable here.
 */
const HIDDEN_PREFIXES = ['fcm_token:'];
const HIDDEN_KEYS = new Set([LAST_RUN_KEY]);

export function isHiddenConfigKey(key: string): boolean {
  return HIDDEN_KEYS.has(key) || HIDDEN_PREFIXES.some((p) => key.startsWith(p));
}

export const HIDDEN_CONFIG_PREFIXES = HIDDEN_PREFIXES;
export const HIDDEN_CONFIG_KEYS = [...HIDDEN_KEYS];

/** Letters, digits and `_ . -`, up to 100 characters. */
export const CONFIG_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;

/** Null when the value fits the key's type and range; otherwise the reason. */
export function configValueProblem(key: string, value: unknown): string | null {
  const info = KNOWN_CONFIG[key];
  if (!info) return null;
  if (info.type === 'boolean') return typeof value === 'boolean' ? null : `${info.label} must be true or false.`;
  if (info.type === 'string') return typeof value === 'string' && value.trim() ? null : `${info.label} must be text.`;
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return `${info.label} must be a number.`;
  if (info.min !== undefined && n < info.min) return `${info.label} must be at least ${info.min}${info.unit ? ` ${info.unit}` : ''}.`;
  if (info.max !== undefined && n > info.max) return `${info.label} must be at most ${info.max}${info.unit ? ` ${info.unit}` : ''}.`;
  return null;
}
