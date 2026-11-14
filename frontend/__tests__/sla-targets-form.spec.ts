import { formFromPolicy, formatTarget, parseTargetForm, secsToMinutesText } from '@/features/sla-policies/form';
import type { SlaPolicy } from '@/features/sla-policies/api';

const CRITICAL: SlaPolicy = {
  id: 'p1', category: null, priority: 'CRITICAL',
  acknowledgeSecs: 60, dispatchSecs: 120, onSceneSecs: 600, isActive: true,
};

describe('Response Targets form (MOD-41)', () => {
  it('shows seconds as minutes', () => {
    expect(secsToMinutesText(90)).toBe('1.5');
    expect(formatTarget(120)).toBe('2 min');
    expect(formatTarget(45)).toBe('45 s');
    expect(formFromPolicy(CRITICAL)).toEqual({ acknowledge: '1', dispatch: '2', onScene: '10' });
  });

  it('turns minutes back into whole seconds for the API', () => {
    expect(parseTargetForm({ acknowledge: '1.5', dispatch: '3', onScene: '10' })).toEqual({
      ok: true,
      body: { acknowledgeSecs: 90, dispatchSecs: 180, onSceneSecs: 600 },
    });
  });

  it('explains what is wrong in plain words', () => {
    expect(parseTargetForm({ acknowledge: '', dispatch: '3', onScene: '10' })).toEqual({
      ok: false, error: 'Acknowledge: enter a number of minutes.',
    });
    expect(parseTargetForm({ acknowledge: '0.2', dispatch: '3', onScene: '10' })).toMatchObject({ ok: false });
    expect(parseTargetForm({ acknowledge: '5', dispatch: '2', onScene: '10' })).toEqual({
      ok: false, error: 'Targets must run in order: acknowledge ≤ dispatch ≤ on scene (all from the report).',
    });
  });
});
