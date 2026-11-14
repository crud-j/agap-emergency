import { checkNarrative, dropRepeatedWatchItems, repeatsPoint } from '../../src/ai-assist/analytics-narrative/narrative-check';

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

describe('dropRepeatedWatchItems', () => {
  // The first real summary (2026-11-15): every watch item repeated a point.
  const REAL = {
    headline: 'Incidents reported increased to 8, with response targets below 90%.',
    points: [
      'Incidents reported rose to 8, up from 0 in the previous period.',
      "Response target 'Acknowledged' met at 29% with 2 incidents still waiting past the target.",
      "Response target 'Dispatched' met at 38% with 4 incidents still waiting past the target.",
      "Response target 'First unit on scene' met at 25% with 6 incidents still waiting past the target.",
    ],
    watchItems: [
      "2 incidents still waiting past the 'Acknowledged' target.",
      "4 incidents still waiting past the 'Dispatched' target.",
      "6 incidents still waiting past the 'First unit on scene' target.",
    ],
  };

  it('drops watch items that only repeat a point', () => {
    expect(dropRepeatedWatchItems(REAL).watchItems).toEqual([]);
  });

  it('keeps a watch item that adds something', () => {
    const kept = 'The Acknowledged result rests on only 7 incidents.';
    expect(dropRepeatedWatchItems({ ...REAL, watchItems: [kept] }).watchItems).toEqual([kept]);
  });

  it('keeps an item with a number the matching point does not have', () => {
    const item = "3 incidents still waiting past the 'Acknowledged' target.";
    expect(dropRepeatedWatchItems({ ...REAL, watchItems: [item] }).watchItems).toEqual([item]);
  });

  it('drops a repeat of an earlier watch item, and leaves the rest of the summary alone', () => {
    const item = 'Flood reports in Lolomboy to follow next period.';
    const out = dropRepeatedWatchItems({ ...REAL, watchItems: [item, 'Flood reports in Lolomboy, follow next period.'] });
    expect(out.watchItems).toEqual([item]);
    expect(out.points).toEqual(REAL.points);
    expect(out.headline).toBe(REAL.headline);
  });

  it('repeatsPoint matches the same fact in other words, not a different step', () => {
    expect(repeatsPoint('2 still waiting for acknowledgement: Acknowledged', REAL.points[1]!)).toBe(true);
    expect(repeatsPoint("2 incidents still waiting past the 'Acknowledged' target.", REAL.points[2]!)).toBe(false);
  });
});
