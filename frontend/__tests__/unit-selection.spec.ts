import { ResourceType, type UnitNeed } from '@agap/shared';
import { planUnitSelection, type CandidateUnit } from '@/features/dispatch/unit-selection';

const need = (resourceType: ResourceType, count = 1, alternatives: ResourceType[] = []): UnitNeed => ({
  resourceType, count, reasons: ['test'], alternatives,
});

// Best-ranked first, as the console passes them.
const candidates: CandidateUnit[] = [
  { id: 'charlie-1', resourceType: 'FIRE_TRUCK', crewIds: ['carlos'] },
  { id: 'alpha-2', resourceType: 'AMBULANCE', crewIds: ['mark'] },
  { id: 'charlie-3', resourceType: 'FIRE_TRUCK', crewIds: ['paolo'] },
  { id: 'alpha-3', resourceType: 'AMBULANCE', crewIds: ['grace'] },
  { id: 'charlie-2', resourceType: 'RESCUE_TRUCK', crewIds: [] },
];
const onDuty = new Set(['carlos', 'mark', 'paolo', 'grace']);

describe('planUnitSelection', () => {
  it('pre-selects the best-ranked unit of each needed type with its on-duty home crew', () => {
    const plan = planUnitSelection({
      needs: [need(ResourceType.FIRE_TRUCK), need(ResourceType.AMBULANCE)],
      candidates,
      respondingTypes: [],
      availableResponderIds: onDuty,
    });
    expect(plan.unitIds).toEqual(['charlie-1', 'alpha-2']);
    expect(plan.crewByUnit).toEqual({ 'charlie-1': ['carlos'], 'alpha-2': ['mark'] });
    expect(plan.needs.every((n) => n.short === 0)).toBe(true);
  });

  it('takes as many units as the need asks for, never the same unit twice', () => {
    const plan = planUnitSelection({
      needs: [need(ResourceType.FIRE_TRUCK, 2), need(ResourceType.FIRE_TRUCK, 1)],
      candidates,
      respondingTypes: [],
      availableResponderIds: onDuty,
    });
    expect(plan.unitIds).toEqual(['charlie-1', 'charlie-3']);
    expect(plan.needs[1]!.short).toBe(1);
  });

  it('subtracts units of that type already responding (dispatch another unit)', () => {
    const plan = planUnitSelection({
      needs: [need(ResourceType.FIRE_TRUCK, 2), need(ResourceType.AMBULANCE)],
      candidates: candidates.filter((c) => c.id !== 'charlie-1'),
      respondingTypes: ['FIRE_TRUCK'],
      availableResponderIds: onDuty,
    });
    expect(plan.unitIds).toEqual(['charlie-3', 'alpha-2']);
    expect(plan.needs[0]).toMatchObject({ responding: 1, short: 0 });
  });

  it('selects nothing when the need is already covered', () => {
    const plan = planUnitSelection({
      needs: [need(ResourceType.AMBULANCE)],
      candidates,
      respondingTypes: ['AMBULANCE'],
      availableResponderIds: onDuty,
    });
    expect(plan.unitIds).toEqual([]);
    expect(plan.needs[0]!.short).toBe(0);
  });

  it('reports a shortfall and falls back to the alternative type', () => {
    const plan = planUnitSelection({
      needs: [need(ResourceType.RESCUE_BOAT, 1, [ResourceType.RESCUE_TRUCK])],
      candidates,
      respondingTypes: [],
      availableResponderIds: onDuty,
    });
    expect(plan.unitIds).toEqual(['charlie-2']);
    expect(plan.needs[0]).toMatchObject({ alternativeUsed: ResourceType.RESCUE_TRUCK, short: 0 });

    const none = planUnitSelection({
      needs: [need(ResourceType.RESCUE_BOAT)],
      candidates,
      respondingTypes: [],
      availableResponderIds: onDuty,
    });
    expect(none.unitIds).toEqual([]);
    expect(none.needs[0]!.short).toBe(1);
  });

  it('leaves out home crew who are off duty or already on the incident', () => {
    const plan = planUnitSelection({
      needs: [need(ResourceType.AMBULANCE, 2)],
      candidates,
      respondingTypes: [],
      availableResponderIds: new Set(['grace', 'mark']),
      busyResponderIds: new Set(['mark']),
    });
    expect(plan.crewByUnit).toEqual({ 'alpha-2': [], 'alpha-3': ['grace'] });
  });
});
