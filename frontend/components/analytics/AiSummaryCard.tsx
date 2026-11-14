'use client';

import { useEffect, useState, type JSX } from 'react';
import { CheckCircle2, Copy, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui';
import type { AnalyticsRange } from '@/features/analytics/api';
import { useAiSummary, useGenerateAiSummary, useReviewAiSummary } from '@/features/analytics/hooks';
import { aiSummaryCopyText, aiSummaryErrorMessage, manilaDateTime } from '@/features/analytics/ai-summary';

const FRAME = 'rounded-2xl border border-[rgba(124,58,237,0.25)] bg-violet-50/60 p-4';

function Label(): JSX.Element {
  return (
    <div className="flex items-center gap-1.5">
      <Sparkles size={14} className="shrink-0 text-violet-600" aria-hidden />
      <span className="text-[11px] font-bold uppercase tracking-wide text-violet-700">AI summary</span>
    </div>
  );
}

/**
 * MOD-50 AI summary of the period on the Analytics page (Supervisor only). AGAP computes
 * every figure and change; the AI only words them, and any figure it invents is rejected
 * on the server. Hidden when AI Assist is off or unavailable: the page works the same.
 */
export function AiSummaryCard({ range, days }: { range: AnalyticsRange; days: number }): JSX.Element | null {
  const state = useAiSummary(range);
  const generate = useGenerateAiSummary(range);
  const review = useReviewAiSummary();
  const [copied, setCopied] = useState(false);

  // A "too few" or failed answer belongs to the range it was asked for.
  const { reset } = generate;
  useEffect(() => reset(), [range, reset]);

  if (!state.data?.enabled) return null;
  const summary = state.data.summary;
  const result = generate.data;
  const busy = generate.isPending || review.isPending;

  async function copy(): Promise<void> {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(aiSummaryCopyText(summary));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const generateButton = (label: string) => (
    <Button size="sm" variant={summary ? 'ghost' : 'primary'} loading={generate.isPending} disabled={busy} onClick={() => generate.mutate()}>
      {!generate.isPending && (summary ? <RefreshCw size={13} /> : <Sparkles size={13} />)}
      {generate.isPending ? 'Writing summary…' : label}
    </Button>
  );

  if (!summary) {
    return (
      <section className={FRAME} aria-label="AI summary">
        <Label />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {generateButton(`Generate AI summary of the last ${days} days`)}
          <span className="text-xs text-agap-textSub">
            {generate.isPending
              ? 'This can take up to 20 seconds.'
              : 'Uses totals only. No names, contact details or exact locations are sent.'}
          </span>
        </div>
        {result?.outcome === 'TOO_FEW' && (
          <p className="mt-2 text-xs text-agap-textMid">
            Only {result.incidents} incident{result.incidents === 1 ? '' : 's'} in this period, too few for a useful summary
            (at least {result.minimum} needed).
          </p>
        )}
        {result?.outcome === 'FAILED' && (
          <p role="alert" className="mt-2 text-xs font-semibold text-agap-danger">{aiSummaryErrorMessage(result.error)}</p>
        )}
        {generate.isError && (
          <p role="alert" className="mt-2 text-xs font-semibold text-agap-danger">
            {generate.error instanceof Error && generate.error.message ? generate.error.message : 'Could not reach AGAP. Check your connection.'}
          </p>
        )}
      </section>
    );
  }

  const accepted = summary.status === 'ACCEPTED';
  return (
    <section className={FRAME} aria-label="AI summary">
      <div className="flex flex-wrap items-center gap-2">
        <Label />
        <span className="text-[11px] text-agap-textSub">
          {summary.period.label} · {summary.incidents} incidents · written {manilaDateTime(summary.createdAt)}
        </span>
        {accepted && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-agap-greenSoft px-2 py-0.5 text-[11px] font-semibold text-agap-green">
            <CheckCircle2 size={12} aria-hidden /> Reviewed
          </span>
        )}
      </div>

      <p className="mt-2 text-base font-bold text-agap-textMain">{summary.headline}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-agap-textMid">
        {summary.points.map((point, i) => (
          <li key={i}>{point}</li>
        ))}
      </ul>
      {summary.watchItems.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-agap-textMain">Worth a look</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-agap-textMid">
            {summary.watchItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-snug text-agap-textSub">
        Written by AI from AGAP&apos;s totals; every figure was checked against them. Check it against the figures on this page
        before using it. It describes the period; decisions stay with MDRRMO.
        {accepted && summary.reviewedBy && summary.reviewedAt && (
          <> Reviewed by {summary.reviewedBy}, {manilaDateTime(summary.reviewedAt)}.</>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!accepted && (
          <Button size="sm" variant="primary" loading={review.isPending && review.variables?.action === 'accept'} disabled={busy}
            onClick={() => review.mutate({ id: summary.id, action: 'accept' })}>
            <CheckCircle2 size={13} /> Accept
          </Button>
        )}
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void copy()}>
          <Copy size={13} /> {copied ? 'Copied' : 'Copy text'}
        </Button>
        <Button size="sm" variant="ghost" loading={review.isPending && review.variables?.action === 'dismiss'} disabled={busy}
          onClick={() => review.mutate({ id: summary.id, action: 'dismiss' })}>
          <X size={13} /> Dismiss
        </Button>
        {!accepted && generateButton('Regenerate')}
        {review.isError && (
          <span role="alert" className="w-full text-xs text-agap-danger">Could not save. Refresh and try again.</span>
        )}
        {result?.outcome === 'FAILED' && (
          <span role="alert" className="w-full text-xs text-agap-danger">{aiSummaryErrorMessage(result.error)}</span>
        )}
      </div>
    </section>
  );
}
