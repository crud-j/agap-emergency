import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { IncidentType } from '@agap/shared';

export type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** A string available in both app languages (MOD-04). */
export interface Bilingual {
  en: string;
  fil: string;
}

export type FirstAidUrgency = 'critical' | 'important' | 'info';

export interface FirstAidStep {
  text: Bilingual;
  /** Highlighted as a safety-critical caution in the UI. */
  caution?: boolean;
}

/**
 * Bundled, offline-first first-aid guide.
 *
 * Field names intentionally mirror the `first_aid_guides` table
 * (backend/prisma/schema.prisma) — `category`, bilingual content, `steps`,
 * `display_order`, `is_active` — so a future "bundled + backend sync" upgrade
 * is a drop-in replacement for the data source, with no screen changes.
 */
export interface FirstAidGuide {
  id: string;
  /** Aligns with incident_category; used by the category filter. */
  category: IncidentType;
  /** Core life-saving guides surface under every category filter. */
  appliesToAll?: boolean;
  displayOrder: number;
  icon: IoniconName;
  urgency: FirstAidUrgency;
  title: Bilingual;
  summary: Bilingual;
  steps: FirstAidStep[];
  dos: Bilingual[];
  donts: Bilingual[];
  whenToEscalate: Bilingual[];
}
