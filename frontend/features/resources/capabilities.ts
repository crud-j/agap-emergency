import { titleCase } from '@/lib/incident-format';
import type { CapabilityCatalogItem, ResourceCapability } from './api';

/**
 * Chip text for a unit's capability (MOD-29). An unverified one says so in words,
 * not only by its outline style, so it's clear why the recommender ignores it.
 */
export function capabilityChipLabel(capability: Pick<ResourceCapability, 'name' | 'is_verified'>): string {
  const name = titleCase(capability.name);
  return capability.is_verified ? name : `${name} · unverified`;
}

export interface CatalogGroup {
  category: string;
  items: CapabilityCatalogItem[];
}

/** The catalog without the unit's current capabilities, grouped by category for the Add picker. */
export function groupAddableCapabilities(
  catalog: CapabilityCatalogItem[],
  assigned: Pick<ResourceCapability, 'id'>[],
): CatalogGroup[] {
  const taken = new Set(assigned.map((c) => c.id));
  const groups = new Map<string, CapabilityCatalogItem[]>();
  for (const item of catalog) {
    if (taken.has(item.id)) continue;
    const category = item.category ?? 'OTHER';
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => ({ category, items: [...items].sort((a, b) => a.name.localeCompare(b.name)) }));
}
