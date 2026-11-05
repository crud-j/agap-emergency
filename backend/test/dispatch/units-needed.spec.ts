import { IncidentType, ResourceType, recommendUnitsNeeded } from '@agap/shared';

// MOD-29/30 — units the dispatch console pre-selects from a report.
const summary = (type: IncidentType, answers: Record<string, string[]> = {}) =>
  recommendUnitsNeeded(type, answers).map((n) => `${n.count}x${n.resourceType}`);

describe('recommendUnitsNeeded', () => {
  it('asks for one unit of the category type by default', () => {
    expect(summary(IncidentType.FIRE)).toEqual(['1xFIRE_TRUCK']);
    expect(summary(IncidentType.ROAD_ACCIDENT)).toEqual(['1xAMBULANCE']);
    expect(summary(IncidentType.MEDICAL)).toEqual(['1xAMBULANCE']);
    expect(summary(IncidentType.FLOOD)).toEqual(['1xRESCUE_BOAT']);
    expect(summary(IncidentType.RESCUE)).toEqual(['1xRESCUE_TRUCK']);
    expect(summary(IncidentType.NATURAL_DISASTER)).toEqual(['1xRESCUE_TRUCK']);
  });

  it('leaves OTHER to the dispatcher unless someone is injured', () => {
    expect(summary(IncidentType.OTHER)).toEqual([]);
    expect(summary(IncidentType.OTHER, { injured: ['yes'] })).toEqual(['1xAMBULANCE']);
  });

  it('sends an ambulance with the fire truck when people are trapped', () => {
    const needs = recommendUnitsNeeded(IncidentType.FIRE, { trapped: ['yes'] });
    expect(needs.map((n) => `${n.count}x${n.resourceType}`)).toEqual(['1xFIRE_TRUCK', '1xAMBULANCE']);
    expect(needs[1]!.reasons).toEqual(['People trapped by the fire']);
  });

  it('asks for two fire trucks for a fireworks fire, without duplicating the type', () => {
    const needs = recommendUnitsNeeded(IncidentType.FIRE, { burning: ['fireworks'], explosions: ['yes'] });
    expect(needs).toHaveLength(1);
    expect(needs[0]).toMatchObject({ resourceType: ResourceType.FIRE_TRUCK, count: 2 });
    expect(needs[0]!.reasons).toEqual(['Fire report', 'Fireworks shop or factory involved', 'Explosions heard']);
  });

  it('adds a rescue truck and a fire truck to a road crash from the caller answers', () => {
    expect(summary(IncidentType.ROAD_ACCIDENT, { pinned: ['yes'], fuel: ['yes'], injured: ['yes'] })).toEqual([
      '1xAMBULANCE',
      '1xRESCUE_TRUCK',
      '1xFIRE_TRUCK',
    ]);
  });

  it('ignores "no" and "not sure" answers', () => {
    expect(summary(IncidentType.FIRE, { trapped: ['unknown'], spreading: ['no'] })).toEqual(['1xFIRE_TRUCK']);
  });

  it('sends a fire truck and an ambulance to an industrial hazard', () => {
    expect(summary(IncidentType.INDUSTRIAL)).toEqual(['1xFIRE_TRUCK', '1xAMBULANCE']);
  });

  it('names stand-in types for units Bocaue may not have', () => {
    const [flood] = recommendUnitsNeeded(IncidentType.FLOOD, {});
    expect(flood!.alternatives).toEqual([ResourceType.RESCUE_TRUCK]);
    const [debris] = recommendUnitsNeeded(IncidentType.DEBRIS, {});
    expect(debris).toMatchObject({ resourceType: ResourceType.CLEARING_EQUIPMENT, alternatives: [ResourceType.RESCUE_TRUCK] });
  });
});
