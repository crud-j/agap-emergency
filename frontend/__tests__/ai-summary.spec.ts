import { aiSummaryCopyText, aiSummaryErrorMessage, manilaDateTime } from '@/features/analytics/ai-summary';
import type { AiSummary } from '@/features/analytics/api';

/** MOD-50 AI summary card: plain messages and the text copied into meeting notes. */

const SUMMARY: AiSummary = {
  id: 'sum-1',
  status: 'PENDING_REVIEW',
  createdAt: '2026-11-14T08:05:00.000Z',
  period: { from: '2026-10-15T16:00:00.000Z', to: '2026-11-14T16:00:00.000Z', days: 30, label: '16 Oct 2026 to 14 Nov 2026' },
  incidents: 42,
  headline: '42 incidents, up from 31.',
  points: ['Flood reports rose from 4 to 11.', 'Dispatch target met 72%.'],
  watchItems: ['3 incidents still waiting past the dispatch target.'],
  reviewedBy: null,
  reviewedAt: null,
};

describe('aiSummaryErrorMessage', () => {
  it.each(['TIMEOUT', 'RATE_LIMITED', 'DAILY_LIMIT', 'UNVERIFIED_NUMBER', 'BLOCKED', 'AUTH', 'INVALID_OUTPUT', 'PROVIDER_ERROR', 'SOMETHING_NEW'])(
    'gives a plain sentence for %s, never the code',
    (code) => {
      const text = aiSummaryErrorMessage(code);
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toContain(code);
    },
  );
});

describe('manilaDateTime', () => {
  it('shows Manila time', () => {
    expect(manilaDateTime('2026-11-14T08:05:00.000Z')).toMatch(/Nov 14, 2026.*4:05/);
  });
});

describe('aiSummaryCopyText', () => {
  it('lists the period, the summary and the watch items, and says it is unreviewed', () => {
    expect(aiSummaryCopyText(SUMMARY)).toBe(
      [
        'AGAP Emergency Response Analytics: AI summary',
        'Period: 16 Oct 2026 to 14 Nov 2026 (30 days, 42 incidents)',
        '',
        '42 incidents, up from 31.',
        '',
        '- Flood reports rose from 4 to 11.',
        '- Dispatch target met 72%.',
        '',
        'Worth a look:',
        '- 3 incidents still waiting past the dispatch target.',
        '',
        'AI summary, not yet reviewed. Check it against the figures before use.',
      ].join('\n'),
    );
  });

  it('names the reviewer once accepted, and drops an empty watch list', () => {
    const text = aiSummaryCopyText({
      ...SUMMARY,
      status: 'ACCEPTED',
      watchItems: [],
      reviewedBy: 'Ana Cruz',
      reviewedAt: '2026-11-14T09:00:00.000Z',
    });
    expect(text).not.toContain('Worth a look');
    expect(text).toMatch(/AI summary, reviewed by Ana Cruz on Nov 14, 2026.*5:00/);
  });
});
