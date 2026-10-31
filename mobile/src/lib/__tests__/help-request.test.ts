/// <reference types="jest" />
import { CREW_HELP_NEEDS, UNIT_FIELD_FLOW_LABELS, UNIT_FIELD_FLOWS, type UnitFieldFlow } from '@agap/shared';
import { helpNeedsFor } from '../help-request';
import { en, fil } from '../../i18n/translations';

const FLOWS = Object.values(UNIT_FIELD_FLOWS) as UnitFieldFlow[];

describe('UNIT_FIELD_FLOW_LABELS', () => {
  it('has a non-empty label for every flow, and nothing else', () => {
    expect(Object.keys(UNIT_FIELD_FLOW_LABELS).sort()).toEqual([...FLOWS].sort());
    for (const flow of FLOWS) expect(UNIT_FIELD_FLOW_LABELS[flow].trim()).not.toBe('');
    expect(UNIT_FIELD_FLOW_LABELS.FIRE).toBe('Fire unit');
  });
});

describe('helpNeedsFor', () => {
  it('puts More personnel first for an ambulance', () => {
    expect(helpNeedsFor('MEDICAL_TRANSPORT')[0]).toBe('MORE_PERSONNEL');
  });

  it.each(['MEDICAL_FIRST', 'FIRE', 'RESCUE', 'GENERAL'] as UnitFieldFlow[])('puts Ambulance first for %s', (flow) => {
    expect(helpNeedsFor(flow)[0]).toBe('AMBULANCE');
  });

  it.each(FLOWS)('offers every need exactly once for %s', (flow) => {
    expect([...helpNeedsFor(flow)].sort()).toEqual([...CREW_HELP_NEEDS].sort());
  });

  it('has a label for every need in both languages', () => {
    for (const need of CREW_HELP_NEEDS) {
      expect(en.helpRequest.needs[need]).toBeTruthy();
      expect(fil.helpRequest.needs[need]).toBeTruthy();
    }
  });
});
