import { analyticsExportFilename, manilaDateKey } from '@/features/analytics/export';

describe('analytics CSV export (MOD-50)', () => {
  it('dates the file in Manila time, like the server', () => {
    // 17:30 UTC on Nov 1 is already Nov 2 in Bocaue.
    expect(manilaDateKey('2026-11-01T17:30:00.000Z')).toBe('2026-11-02');
    expect(manilaDateKey('2026-11-01T15:59:59.000Z')).toBe('2026-11-01');
  });

  it('names the file by dataset and range', () => {
    const range = { from: '2026-10-15T04:00:00.000Z', to: '2026-11-14T04:00:00.000Z' };
    expect(analyticsExportFilename('summary', range)).toBe('AGAP-Analytics-Summary_2026-10-15_to_2026-11-14.csv');
    expect(analyticsExportFilename('incidents', range)).toBe('AGAP-Incident-List_2026-10-15_to_2026-11-14.csv');
  });
});
