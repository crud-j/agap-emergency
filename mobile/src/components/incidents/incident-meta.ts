import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Presentation metadata for incident categories and statuses, shared by the
 * history list and the detail screen so a given type/status always renders
 * with the same icon, colour, and label. Mirrors the backend incident_category
 * and incident_status enums (MOD-14 / MOD-15).
 */

export interface TypeMeta {
  label: string;
  icon: IconName;
  color: string;
  soft: string;
}

export const TYPE_META: Record<string, TypeMeta> = {
  MEDICAL:       { label: 'Medical Emergency', icon: 'medkit',       color: colors.primary, soft: colors.primarySoft },
  ROAD_ACCIDENT: { label: 'Road Traffic Accident', icon: 'car-sport', color: colors.danger,  soft: colors.dangerSoft },
  FLOOD:         { label: 'Flood Emergency',   icon: 'water',        color: colors.info,    soft: colors.infoSoft },
  RESCUE:        { label: 'Rescue',            icon: 'body',         color: '#7C3AED',      soft: '#F3EEFC' },
  FIRE:          { label: 'Fire Emergency',    icon: 'flame',        color: '#EA580C',      soft: '#FFF2EC' },
  INDUSTRIAL:    { label: 'Industrial Hazard', icon: 'warning',      color: colors.amber,   soft: colors.amberSoft },
  DEBRIS:        { label: 'Debris / Obstruction', icon: 'layers',    color: '#64748B',      soft: '#F1F5F9' },
  OTHER:         { label: 'General Emergency',  icon: 'alert-circle', color: '#64748B',      soft: '#F1F5F9' },
};

export function typeMeta(type: string): TypeMeta {
  return TYPE_META[type] ?? TYPE_META.OTHER;
}

export type StatusTone = 'active' | 'resolved' | 'closed' | 'cancelled' | 'neutral';

export interface StatusMeta {
  label: string;
  tone: StatusTone;
  icon: IconName;
}

export const STATUS_META: Record<string, StatusMeta> = {
  DRAFT:             { label: 'Draft',             tone: 'neutral',   icon: 'create-outline' },
  SUBMITTED:         { label: 'Submitted',         tone: 'active',    icon: 'paper-plane' },
  RECEIVED:          { label: 'Received',          tone: 'active',    icon: 'download' },
  ACKNOWLEDGED:      { label: 'Acknowledged',      tone: 'active',    icon: 'checkmark-circle' },
  ASSESSED:          { label: 'Assessed',          tone: 'active',    icon: 'clipboard' },
  DISPATCH_PENDING:  { label: 'Dispatching',       tone: 'active',    icon: 'time' },
  DISPATCHED:        { label: 'Dispatched',        tone: 'active',    icon: 'navigate' },
  EN_ROUTE:          { label: 'En Route',          tone: 'active',    icon: 'car' },
  ON_SCENE:          { label: 'On Scene',          tone: 'active',    icon: 'location' },
  TRANSPORTING:      { label: 'Transporting',      tone: 'active',    icon: 'bus' },
  ASSISTING:         { label: 'Assisting',         tone: 'active',    icon: 'hand-left' },
  RESOLVED:          { label: 'Resolved',          tone: 'resolved',  icon: 'checkmark-circle' },
  CLOSED:            { label: 'Closed',            tone: 'closed',    icon: 'checkmark-done-circle' },
  CANCELLED:         { label: 'Canceled',          tone: 'cancelled', icon: 'ban' },
  FALSE_ALERT:       { label: 'False Alert',       tone: 'cancelled', icon: 'alert' },
  DUPLICATE:         { label: 'Duplicate',         tone: 'cancelled', icon: 'copy' },
  UNABLE_TO_RESPOND: { label: 'Unable to Respond', tone: 'cancelled', icon: 'close-circle' },
  REFERRED:          { label: 'Referred',          tone: 'neutral',   icon: 'arrow-redo' },
};

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? { label: status, tone: 'neutral', icon: 'ellipse' };
}

export const TONE_COLORS: Record<StatusTone, { fg: string; bg: string }> = {
  active:    { fg: colors.primary, bg: colors.primarySoft },
  resolved:  { fg: colors.primary, bg: colors.primarySoft },
  closed:    { fg: colors.info,    bg: colors.infoSoft },
  cancelled: { fg: colors.amber,   bg: colors.amberSoft },
  neutral:   { fg: colors.textSub, bg: '#F1F5F9' },
};

// ─── Filter groups (history tabs) ───────────────────────────────────────────

export type HistoryFilter = 'all' | 'ongoing' | 'resolved' | 'cancelled';

const ONGOING = new Set([
  'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED',
  'DISPATCH_PENDING', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE',
  'TRANSPORTING', 'ASSISTING',
]);
const RESOLVED = new Set(['RESOLVED', 'CLOSED']);
const CANCELLED = new Set(['CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND', 'REFERRED']);

export function matchesFilter(status: string, filter: HistoryFilter): boolean {
  switch (filter) {
    case 'ongoing':   return ONGOING.has(status);
    case 'resolved':  return RESOLVED.has(status);
    case 'cancelled': return CANCELLED.has(status);
    default:          return true;
  }
}

export function isOngoing(status: string): boolean {
  return ONGOING.has(status);
}
