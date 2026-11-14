import { checkNarrative } from '../../src/ai-assist/analytics-narrative/narrative-check';

/** MOD-50 AI summary: every number the AI writes must be in what it was sent. */
const INPUT = [
  'PERIOD: 16 Oct 2026 to 14 Nov 2026 (30 days).',
  'INCIDENTS REPORTED: 42 (previous period: 31).',
  '- Biñang 1st: 6 / 2',
  '- Dispatched: 72% (18 of 25; 3 still waiting past target). Previous: 91%.',
  '- Report to dispatched: 6.5 / 4.2',
  'FALSE ALERTS: 1,250 (5%)',
].join('\n');

const narrative = (headline: string, points: string[] = ['Flood reports rose.', 'Nothing else changed.'], watchItems: string[] = []) => ({
  headline,
  points,
  watchItems,
});

describe('checkNarrative', () => {
  it('passes when every number is copied from the input', () => {
    expect(
      checkNarrative(
        narrative('42 incidents in 30 days, up from 31.', ['Dispatch target met 72% (18 of 25), down from 91%.', 'Average dispatch 6.5 minutes.'], [
          '3 incidents still waiting past the dispatch target.',
        ]),
        INPUT,
      ),
    ).toEqual({ ok: true });
  });

  it('accepts the same number written differently (6.50, 1250, Biñang 1st)', () => {
    expect(checkNarrative(narrative('6.50 minutes; 1250 false alerts; Biñang 1st had 6.'), INPUT)).toEqual({ ok: true });
  });

  it.each([
    ['an invented number', '43 incidents this period.'],
    ['a rounded number', 'Average dispatch took 7 minutes.'],
    ['a computed difference', '11 more incidents than before.'],
    ['a computed percentage change', 'Incidents rose 35%.'],
  ])('fails on %s', (_label, headline) => {
    expect(checkNarrative(narrative(headline), INPUT)).toEqual({ ok: false, reason: 'number not in the input' });
  });

  it.each(['Flood reports doubled.', 'Dispatch time almost halved.', 'Twice as many fires.'])('fails on a ratio word: %p', (point) => {
    expect(checkNarrative(narrative('42 incidents.', [point, 'Other.']), INPUT)).toEqual({ ok: false, reason: 'ratio word' });
  });

  it('checks the watch items too', () => {
    expect(checkNarrative(narrative('42 incidents.', undefined, ['8 still waiting.']), INPUT).ok).toBe(false);
  });
});
