import { assignmentLabel, isFreeForCrew, responderReadiness } from '@/features/responders/readiness';

const onAmb1 = {
  dispatch_id: 'disp-1',
  incident_id: 'inc-1',
  unit: 'AMB-1',
  incident_reference: 'INC-2026-000123',
};

describe('responder readiness (one person, one unit)', () => {
  it('a responder riding a unit shows On assignment, even though their duty switch says Available', () => {
    expect(responderReadiness({ availability_status: 'AVAILABLE', active_assignment: onAmb1 })).toBe('ON_ASSIGNMENT');
    expect(isFreeForCrew({ availability_status: 'AVAILABLE', active_assignment: onAmb1 })).toBe(false);
    expect(assignmentLabel({ active_assignment: onAmb1 })).toBe('AMB-1 · INC-2026-000123');
  });

  it('a free on-duty responder can crew a unit', () => {
    expect(responderReadiness({ availability_status: 'AVAILABLE', active_assignment: null })).toBe('AVAILABLE');
    expect(isFreeForCrew({ availability_status: 'AVAILABLE', active_assignment: null })).toBe(true);
    expect(assignmentLabel({ active_assignment: null })).toBeNull();
  });

  it('off duty or unavailable keeps that status and cannot crew', () => {
    expect(responderReadiness({ availability_status: 'OFF_DUTY', active_assignment: null })).toBe('OFF_DUTY');
    expect(isFreeForCrew({ availability_status: 'OFF_DUTY', active_assignment: null })).toBe(false);
    expect(isFreeForCrew({ availability_status: 'UNAVAILABLE' })).toBe(false);
  });
});
