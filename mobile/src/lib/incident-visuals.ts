import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IconName = ComponentProps<typeof Ionicons>['name'];

const CATEGORY_ICON: Record<string, IconName> = {
  MEDICAL: 'pulse',
  ROAD_ACCIDENT: 'car-sport',
  FLOOD: 'water',
  RESCUE: 'hand-left',
  FIRE: 'flame',
  INDUSTRIAL: 'warning',
  DEBRIS: 'layers',
  OTHER: 'alert-circle',
};

const CATEGORY_COLOR: Record<string, string> = {
  MEDICAL: '#DC2626',
  ROAD_ACCIDENT: '#D97706',
  FLOOD: '#3B82F6',
  RESCUE: '#7C3AED',
  FIRE: '#EA580C',
  INDUSTRIAL: '#CA8A04',
  DEBRIS: '#6B7280',
  OTHER: '#0D6053',
};

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: '#DC2626',
  HIGH: '#EA580C',
  MEDIUM: '#D97706',
  LOW: '#16A34A',
};

export function categoryIcon(category?: string | null): IconName {
  return CATEGORY_ICON[category ?? ''] ?? 'alert-circle';
}

export function categoryColor(category?: string | null): string {
  return CATEGORY_COLOR[category ?? ''] ?? '#0D6053';
}

export function priorityColor(priority?: string | null): string {
  return PRIORITY_COLOR[priority ?? ''] ?? '#64748B';
}

/** "ROAD_ACCIDENT" → "Road Accident" */
export function titleCase(value?: string | null): string {
  return (value ?? '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
