import { createHash } from 'node:crypto';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AuditAction } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AnalyticsDateRange } from '../../analytics/analytics.service';
import { AnalyticsFactsService } from '../../analytics/narrative/analytics-facts.service';
import {
  MIN_INCIDENTS_FOR_SUMMARY,
  factsToPromptText,
  periodDays,
  type AnalyticsFacts,
} from '../../analytics/narrative/analytics-facts';
import { AiClientService, type AiErrorCode } from '../ai-client.service';
import {
  ANALYTICS_NARRATIVE_INSTRUCTIONS,
  ANALYTICS_NARRATIVE_JSON_SCHEMA,
  ANALYTICS_NARRATIVE_MAX_OUTPUT_TOKENS,
  ANALYTICS_NARRATIVE_TIMEOUT_MS,
  AnalyticsNarrativeSchema,
  type AnalyticsNarrative,
} from '../prompts/analytics-narrative.prompt';
import { checkNarrative, dropRepeatedWatchItems } from './narrative-check';

/** `subject_type` of an analytics summary: a period, not a row (subject_id stays null). */
export const ANALYTICS_SUBJECT = 'analytics_period';
/** A summary is shown, and a repeat request reuses it, for this long. */
export const SUMMARY_REUSE_MS = 24 * 60 * 60 * 1000;

const MODULE_ID = 'MOD-50';
const KIND = 'ANALYTICS_NARRATIVE' as const;
const OPEN_STATUSES = ['PENDING_REVIEW', 'ACCEPTED'] as const;

export interface SummaryActor {
  id: string;
  role: string;
}

/** What the Analytics page shows. Never a FAILED, DISMISSED or SUPERSEDED row. */
export interface AnalyticsSummaryView {
  id: string;
  status: 'PENDING_REVIEW' | 'ACCEPTED';
  createdAt: string;
  period: { from: string; to: string; days: number; label: string };
  incidents: number;
  headline: string;
  points: string[];
  watchItems: string[];
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export type GenerateSummaryResult =
  | { outcome: 'CREATED' | 'REUSED'; summary: AnalyticsSummaryView }
  | { outcome: 'TOO_FEW'; incidents: number; minimum: number }
  | { outcome: 'FAILED'; error: AiErrorCode }
  | { outcome: 'DISABLED' };

/** What `ai_suggestions.output` holds for a summary that was shown. */
const StoredSummarySchema = AnalyticsNarrativeSchema.extend({
  period: z.object({ from: z.string(), to: z.string(), days: z.number(), label: z.string() }),
  facts: z.object({ incidents: z.object({ current: z.number() }) }).passthrough(),
});

const ROW_SELECT = {
  id: true,
  status: true,
  created_at: true,
  output: true,
  reviewed_at: true,
  reviewed_by: { select: { full_name: true } },
} satisfies Prisma.ai_suggestionsSelect;
type SummaryRow = Prisma.ai_suggestionsGetPayload<{ select: typeof ROW_SELECT }>;

/**
 * MOD-50 AI summary on the Analytics page, Supervisors only. AGAP's code computes the
 * facts and the changes (AnalyticsFactsService); Gemini only words them; code then checks
 * every number. One `ai_suggestions` row per call, written with its audit entry in one
 * transaction. A summary changes nothing: Accept means "reviewed, fit for reports".
 */
@Injectable()
export class AnalyticsNarrativeService {
  private readonly logger = new Logger(AnalyticsNarrativeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ai: AiClientService,
    private readonly facts: AnalyticsFactsService,
  ) {}

  /** The newest open summary for a period of the same length, from the last 24 h. */
  async latest(range: AnalyticsDateRange, now: Date = new Date()): Promise<{ enabled: boolean; summary: AnalyticsSummaryView | null }> {
    if (!this.ai.enabled) return { enabled: false, summary: null };
    const row = await this.prisma.ai_suggestions.findFirst({
      where: {
        kind: KIND,
        subject_type: ANALYTICS_SUBJECT,
        status: { in: [...OPEN_STATUSES] },
        created_at: { gte: new Date(now.getTime() - SUMMARY_REUSE_MS) },
        output: { path: ['period', 'days'], equals: periodDays(range) },
      },
      orderBy: { created_at: 'desc' },
      select: ROW_SELECT,
    });
    return { enabled: true, summary: row ? toView(row) : null };
  }

  async generate(range: AnalyticsDateRange, actor: SummaryActor, now: Date = new Date()): Promise<GenerateSummaryResult> {
    if (!this.ai.enabled) return { outcome: 'DISABLED' };

    const facts = await this.facts.collect(range, now);
    if (facts.incidents.current < MIN_INCIDENTS_FOR_SUMMARY) {
      return { outcome: 'TOO_FEW', incidents: facts.incidents.current, minimum: MIN_INCIDENTS_FOR_SUMMARY };
    }

    const input = factsToPromptText(facts);
    const inputHash = createHash('sha256').update(input).digest('hex');

    // Same facts (a double click, or a second Supervisor): the same summary, no new call.
    const existing = await this.prisma.ai_suggestions.findFirst({
      where: {
        kind: KIND,
        input_hash: inputHash,
        status: { in: [...OPEN_STATUSES] },
        created_at: { gte: new Date(now.getTime() - SUMMARY_REUSE_MS) },
      },
      orderBy: { created_at: 'desc' },
      select: ROW_SELECT,
    });
    const reused = existing ? toView(existing) : null;
    if (reused) return { outcome: 'REUSED', summary: reused };

    const result = await this.ai.structured(
      'ANALYTICS_NARRATIVE',
      ANALYTICS_NARRATIVE_INSTRUCTIONS,
      input,
      ANALYTICS_NARRATIVE_JSON_SCHEMA,
      AnalyticsNarrativeSchema,
      { maxOutputTokens: ANALYTICS_NARRATIVE_MAX_OUTPUT_TOKENS, timeoutMs: ANALYTICS_NARRATIVE_TIMEOUT_MS },
    );
    if (!result.ok && result.error === 'DISABLED') return { outcome: 'DISABLED' };

    let error: AiErrorCode | null = result.ok || result.error === 'DISABLED' ? null : result.error;
    let narrative: AnalyticsNarrative | null = result.ok ? result.value : null;
    if (narrative) {
      const check = checkNarrative(narrative, input);
      if (!check.ok) {
        this.logger.warn(`AI ANALYTICS_NARRATIVE rejected: ${check.reason}`);
        error = 'UNVERIFIED_NUMBER';
      } else {
        // "Worth a look" that only repeats a point is noise: drop those items.
        narrative = dropRepeatedWatchItems(narrative);
      }
    }
    const status = error ? 'FAILED' : 'PENDING_REVIEW';
    const period = { from: facts.period.from, to: facts.period.to, days: facts.period.days, label: facts.period.label };

    const row = await this.prisma.$transaction(async (tx) => {
      if (status === 'PENDING_REVIEW') {
        // One open summary per period length: a newer one replaces an unreviewed older one.
        await tx.ai_suggestions.updateMany({
          where: {
            kind: KIND,
            subject_type: ANALYTICS_SUBJECT,
            status: 'PENDING_REVIEW',
            output: { path: ['period', 'days'], equals: period.days },
          },
          data: { status: 'SUPERSEDED' },
        });
      }
      const created = await tx.ai_suggestions.create({
        data: {
          subject_type: ANALYTICS_SUBJECT,
          kind: KIND,
          status,
          input_hash: inputHash,
          // A rejected text is kept for evaluation; it is never shown.
          output: { ...(narrative ?? {}), period, facts } as unknown as Prisma.InputJsonValue,
          model: result.model.slice(0, 80) || 'unset',
          latency_ms: result.latencyMs,
          error,
          requested_by_id: actor.id,
        },
        select: ROW_SELECT,
      });
      await this.audit.logInTransaction(tx, {
        action: AuditAction.CREATE,
        actorId: actor.id,
        actorRole: actor.role,
        entityType: 'ai_suggestion',
        entityId: created.id,
        moduleId: MODULE_ID,
        newValues: { kind: KIND, status, from: period.from, to: period.to, days: period.days, ...(error && { error }) },
      });
      return created;
    });

    if (error) return { outcome: 'FAILED', error };
    const summary = toView(row);
    // The row was just written from a checked narrative, so this cannot be null.
    if (!summary) return { outcome: 'FAILED', error: 'INVALID_OUTPUT' };
    return { outcome: 'CREATED', summary };
  }

  /** Marks the summary as reviewed and fit for reports. Changes nothing else. */
  async accept(id: string, actor: SummaryActor): Promise<AnalyticsSummaryView> {
    return this.review(id, actor, ['PENDING_REVIEW'], 'ACCEPTED');
  }

  /** Hides the summary (also one accepted earlier, if it turns out to be wrong). */
  async dismiss(id: string, actor: SummaryActor): Promise<{ id: string; status: 'DISMISSED' }> {
    await this.review(id, actor, [...OPEN_STATUSES], 'DISMISSED');
    return { id, status: 'DISMISSED' };
  }

  private async review(
    id: string,
    actor: SummaryActor,
    from: readonly ('PENDING_REVIEW' | 'ACCEPTED')[],
    to: 'ACCEPTED' | 'DISMISSED',
  ): Promise<AnalyticsSummaryView> {
    const row = await this.prisma.ai_suggestions.findUnique({ where: { id }, select: { kind: true, status: true } });
    if (!row || row.kind !== KIND) throw new NotFoundException('Summary not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.ai_suggestions.updateMany({
        where: { id, kind: KIND, status: { in: [...from] } },
        data: { status: to, reviewed_by_id: actor.id, reviewed_at: new Date() },
      });
      if (claimed.count === 0) {
        throw new ConflictException(
          row.status === 'DISMISSED' || row.status === 'SUPERSEDED'
            ? 'This summary is no longer current. Generate a new one.'
            : 'This summary was already reviewed.',
        );
      }
      await this.audit.logInTransaction(tx, {
        action: AuditAction.UPDATE,
        actorId: actor.id,
        actorRole: actor.role,
        entityType: 'ai_suggestion',
        entityId: id,
        moduleId: MODULE_ID,
        oldValues: { status: row.status },
        newValues: { status: to, kind: KIND },
      });
      return tx.ai_suggestions.findUniqueOrThrow({ where: { id }, select: ROW_SELECT });
    });

    const view = toView(updated, true);
    if (!view) throw new NotFoundException('Summary not found');
    return view;
  }
}

/** null for a row that is not an open, well-formed summary. */
function toView(row: SummaryRow, allowAnyStatus = false): AnalyticsSummaryView | null {
  const status = row.status;
  if (!allowAnyStatus && status !== 'PENDING_REVIEW' && status !== 'ACCEPTED') return null;
  const parsed = StoredSummarySchema.safeParse(row.output);
  if (!parsed.success) return null;
  const out = parsed.data;
  return {
    id: row.id,
    status: status === 'ACCEPTED' ? 'ACCEPTED' : 'PENDING_REVIEW',
    createdAt: row.created_at.toISOString(),
    period: out.period,
    incidents: (out.facts as unknown as AnalyticsFacts).incidents.current,
    headline: out.headline,
    points: out.points,
    watchItems: out.watchItems,
    reviewedBy: row.reviewed_by?.full_name ?? null,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
  };
}
