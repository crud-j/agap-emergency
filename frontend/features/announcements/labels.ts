import {
  AlertOctagon, AlertTriangle, Info, Megaphone,
  type LucideIcon,
} from 'lucide-react';
import type { BadgeVariant } from '@/components/ui';

export const CATEGORY_LABELS: Record<string, string> = {
  FLOOD_ALERT: 'Flood',
  WEATHER_ADVISORY: 'Weather',
  EVACUATION_ORDER: 'Evacuation',
  CLASS_SUSPENSION: 'Class suspension',
  ROAD_CLOSURE: 'Traffic',
  PUBLIC_ADVISORY: 'Public advisory',
  MUNICIPAL_SERVICE: 'Municipal service',
  FIRE_ADVISORY: 'Fire',
  INDUSTRIAL_HAZARD: 'Industrial hazard',
  POST_DISASTER_UPDATE: 'Post-disaster',
  RESCUE_UPDATE: 'Rescue',
  GENERAL_INFORMATION: 'General',
};

export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c.replace(/_/g, ' ').toLowerCase();

/**
 * Severity maps onto the format standard's priority (routine / important /
 * urgent). Icon + label always accompany the colour — never colour alone.
 */
export const SEVERITY_META: Record<
  string,
  { label: string; priority: string; variant: BadgeVariant; icon: LucideIcon; bar: string; text: string }
> = {
  CRITICAL:      { label: 'Critical', priority: 'Urgent',    variant: 'red',   icon: AlertOctagon,  bar: 'bg-agap-danger', text: 'text-agap-danger' },
  WARNING:       { label: 'Warning',  priority: 'Important', variant: 'amber', icon: AlertTriangle, bar: 'bg-agap-amber',  text: 'text-agap-amber' },
  ADVISORY:      { label: 'Advisory', priority: 'Important', variant: 'blue',  icon: Info,          bar: 'bg-agap-info',   text: 'text-agap-info' },
  INFORMATIONAL: { label: 'Info',     priority: 'Routine',   variant: 'green', icon: Megaphone,     bar: 'bg-agap-green',  text: 'text-agap-green' },
};

export const severityMeta = (s: string) => SEVERITY_META[s] ?? SEVERITY_META['INFORMATIONAL']!;

export const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  DRAFT:      { label: 'Draft',      variant: 'muted' },
  SCHEDULED:  { label: 'Scheduled',  variant: 'amber' },
  PUBLISHED:  { label: 'Published',  variant: 'green' },
  CANCELLED:  { label: 'Cancelled',  variant: 'red' },
  ARCHIVED:   { label: 'Archived',   variant: 'muted' },
  SUPERSEDED: { label: 'Superseded', variant: 'muted' },
};

export const statusMeta = (s: string) => STATUS_META[s] ?? { label: s, variant: 'muted' as BadgeVariant };

export const LANGUAGE_LABELS = { FIL: 'Filipino', EN: 'English', FIL_EN: 'Filipino + English' } as const;

/** Display a timestamp in Bocaue local time regardless of the viewer's zone. */
export function fmtManila(iso: string | null | undefined, withTime = true): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short', day: 'numeric', year: 'numeric',
    ...(withTime && { hour: 'numeric', minute: '2-digit' }),
  });
}
