import type { LucideIcon } from 'lucide-react';
import { ACTIVE_INCIDENT_STATUSES } from '@agap/shared';
import {
  Activity,
  Car,
  Waves,
  CloudLightning,
  Flame,
  AlertTriangle,
  Layers,
  LifeBuoy,
  CircleAlert,
} from 'lucide-react';

/**
 * Incident lifecycle statuses that still need operations attention. Shared with the
 * backend's municipal overview counts, so the dashboard and the queue agree.
 */
export const ACTIVE_STATUSES: string[] = [...ACTIVE_INCIDENT_STATUSES];

/** Statuses from which a dispatch can be authorized (mirrors backend). */
export const DISPATCHABLE_STATUSES = ['ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING'];

/** Seconds → "45s", "12 min", "2 h 5 min"; null → "—" (no data, never a fake 0). */
export function formatDurationSec(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '—';
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function titleCase(value?: string | null): string {
  return (value ?? '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatAffectedCount(
  hazardFlags?: readonly string[] | null,
  recordedPatientCount?: number | null,
): string | null {
  const countFlag = hazardFlags?.find((flag) => flag.startsWith('AFFECTED_COUNT:'));
  const countBucket = countFlag?.slice('AFFECTED_COUNT:'.length);
  const reportedCounts: Record<string, string> = {
    '1': '1 person (caller estimate)',
    '2-5': '2–5 people (caller estimate)',
    '5+': '5 or more people (caller estimate)',
    unknown: 'Count unknown to caller',
  };

  if (countBucket) return reportedCounts[countBucket] ?? 'Reported count range unavailable';
  if (recordedPatientCount != null) {
    return `${recordedPatientCount} on record (source not specified)`;
  }
  return null;
}

export function categoryIcon(category?: string | null): LucideIcon {
  switch (category) {
    case 'MEDICAL':
      return Activity;
    case 'ROAD_ACCIDENT':
      return Car;
    case 'FLOOD':
      return Waves;
    case 'NATURAL_DISASTER':
      return CloudLightning;
    case 'FIRE':
      return Flame;
    case 'INDUSTRIAL':
      return AlertTriangle;
    case 'DEBRIS':
      return Layers;
    case 'RESCUE':
      return LifeBuoy;
    default:
      return CircleAlert;
  }
}

export function priorityClasses(priority?: string | null): {
  text: string;
  bg: string;
  dot: string;
} {
  switch (priority) {
    case 'CRITICAL':
      return { text: 'text-red-600',     bg: 'bg-red-50',     dot: 'bg-red-500' };
    case 'HIGH':
      return { text: 'text-orange-600',  bg: 'bg-orange-50',  dot: 'bg-orange-500' };
    case 'MEDIUM':
      return { text: 'text-amber-600',   bg: 'bg-amber-50',   dot: 'bg-amber-500' };
    case 'LOW':
      return { text: 'text-emerald-700', bg: 'bg-emerald-50', dot: 'bg-emerald-600' };
    default:
      return { text: 'text-agap-textSub', bg: 'bg-agap-surface', dot: 'bg-agap-textSub' };
  }
}

export function statusClasses(status?: string | null): { text: string; bg: string } {
  if (status === 'SUBMITTED' || status === 'RECEIVED')
    return { text: 'text-red-600',     bg: 'bg-red-50' };
  if (status === 'ACKNOWLEDGED' || status === 'ASSESSED' || status === 'DISPATCH_PENDING')
    return { text: 'text-amber-600',   bg: 'bg-amber-50' };
  if (status === 'DISPATCHED' || status === 'EN_ROUTE')
    return { text: 'text-blue-600',    bg: 'bg-blue-50' };
  if (status === 'ON_SCENE' || status === 'TRANSPORTING' || status === 'ASSISTING')
    return { text: 'text-emerald-700', bg: 'bg-emerald-50' };
  return { text: 'text-agap-textSub',  bg: 'bg-agap-surface' };
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
