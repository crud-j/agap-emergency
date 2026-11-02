import { capabilityChipLabel, groupAddableCapabilities } from '@/features/resources/capabilities';
import type { CapabilityCatalogItem } from '@/features/resources/api';

function cap(id: string, name: string, category: string | null): CapabilityCatalogItem {
  return { id, name, category, description: null };
}

describe('capabilityChipLabel (MOD-29)', () => {
  it('shows a verified capability by name', () => {
    expect(capabilityChipLabel({ name: 'WATER_RESCUE', is_verified: true })).toBe('Water Rescue');
  });

  it('says "unverified" in words for an unverified one', () => {
    expect(capabilityChipLabel({ name: 'ROPE_RESCUE', is_verified: false })).toBe('Rope Rescue · unverified');
  });
});

describe('groupAddableCapabilities (MOD-29)', () => {
  const catalog = [
    cap('c1', 'ROPE_RESCUE', 'RESCUE'),
    cap('c2', 'FIRST_AID', 'MEDICAL'),
    cap('c3', 'ROAD_RESCUE', 'RESCUE'),
    cap('c4', 'WATER_RESCUE', 'FLOOD'),
    cap('c5', 'GENERATOR', null),
  ];

  it('groups by category in order, names in order, uncategorized under OTHER', () => {
    expect(groupAddableCapabilities(catalog, []).map((g) => [g.category, g.items.map((i) => i.name)])).toEqual([
      ['FLOOD', ['WATER_RESCUE']],
      ['MEDICAL', ['FIRST_AID']],
      ['OTHER', ['GENERATOR']],
      ['RESCUE', ['ROAD_RESCUE', 'ROPE_RESCUE']],
    ]);
  });

  it("leaves out the unit's current capabilities and empty categories", () => {
    const groups = groupAddableCapabilities(catalog, [{ id: 'c4' }, { id: 'c1' }]);
    expect(groups.map((g) => g.category)).toEqual(['MEDICAL', 'OTHER', 'RESCUE']);
    expect(groups.find((g) => g.category === 'RESCUE')?.items.map((i) => i.id)).toEqual(['c3']);
  });
});
