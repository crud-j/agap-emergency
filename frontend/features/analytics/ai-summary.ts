import type { AiSummary } from './api';

/**
 * MOD-50 AI summary: what the card says when no summary could be written. The server
 * sends a short code (never the provider's message); every code gets a plain sentence.
 */
export function aiSummaryErrorMessage(code: string): string {
  switch (code) {
    case 'TIMEOUT':
      return 'The AI took too long to answer. Try again in a minute.';
    case 'RATE_LIMITED':
      return 'The AI service is busy right now. Try again in a few minutes.';
    case 'DAILY_LIMIT':
      return "Today's AI limit has been reached. Try again tomorrow.";
    case 'UNVERIFIED_NUMBER':
      return "The AI wrote a figure that isn't in AGAP's totals, so the summary was not shown. Try again.";
    case 'BLOCKED':
      return 'The AI declined to write this summary. Use the figures on this page instead.';
    case 'AUTH':
      return 'AI is not set up correctly (key refused). Tell the system administrator.';
    case 'INVALID_OUTPUT':
      return "The AI's answer was not in the expected form. Try again.";
    default:
      return 'The AI summary could not be written. Try again later.';
  }
}

const MANILA_TIME = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "Nov 14, 2026, 4:05 PM" in Manila time. */
export function manilaDateTime(iso: string): string {
  return MANILA_TIME.format(new Date(iso));
}

/**
 * Plain text for meeting notes or a report: the period, the summary, and who reviewed it.
 * It always says it is an AI summary.
 */
export function aiSummaryCopyText(summary: AiSummary): string {
  const lines = [
    `AGAP Emergency Response Analytics: AI summary`,
    `Period: ${summary.period.label} (${summary.period.days} days, ${summary.incidents} incidents)`,
    '',
    summary.headline,
    '',
    ...summary.points.map((p) => `- ${p}`),
  ];
  if (summary.watchItems.length > 0) {
    lines.push('', 'Worth a look:', ...summary.watchItems.map((w) => `- ${w}`));
  }
  lines.push(
    '',
    summary.status === 'ACCEPTED' && summary.reviewedBy && summary.reviewedAt
      ? `AI summary, reviewed by ${summary.reviewedBy} on ${manilaDateTime(summary.reviewedAt)}.`
      : 'AI summary, not yet reviewed. Check it against the figures before use.',
  );
  return lines.join('\n');
}
