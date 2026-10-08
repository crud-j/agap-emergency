import type { IncidentType } from '@agap/shared';
import type { Language } from '../../stores/accessibility.store';
import { GUIDES } from './guides';
import type { FirstAidGuide } from './types';

export * from './types';
export { GUIDES } from './guides';

/** All guides, ordered for display. */
export function getAllGuides(): FirstAidGuide[] {
  return [...GUIDES].sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getGuideById(id: string): FirstAidGuide | undefined {
  return GUIDES.find((g) => g.id === id);
}

/**
 * Guides for a category filter. Core life-saving guides (`appliesToAll`)
 * surface under every category.
 */
export function getGuidesByCategory(category: IncidentType): FirstAidGuide[] {
  return getAllGuides().filter((g) => g.appliesToAll || g.category === category);
}

/** Case-insensitive search across the title and summary in the given language. */
export function searchGuides(query: string, lang: Language): FirstAidGuide[] {
  const q = query.trim().toLowerCase();
  if (!q) return getAllGuides();
  return getAllGuides().filter(
    (g) =>
      g.title[lang].toLowerCase().includes(q) ||
      g.summary[lang].toLowerCase().includes(q),
  );
}
