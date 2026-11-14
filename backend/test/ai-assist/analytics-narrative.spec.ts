import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@agap/shared';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import {
  ANALYTICS_SUBJECT,
  AnalyticsNarrativeService,
} from '../../src/ai-assist/analytics-narrative/analytics-narrative.service';
import { AnalyticsSummaryController } from '../../src/ai-assist/analytics-narrative/analytics-summary.controller';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';
import { ANALYTICS_NARRATIVE_INSTRUCTIONS } from '../../src/ai-assist/prompts/analytics-narrative.prompt';
import { buildFacts, factsToPromptText, type PeriodTotals } from '../../src/analytics/narrative/analytics-facts';

/** MOD-50 AI summary on the Analytics page (Supervisor only, button, aggregates only). */

const SUPERVISOR = { id: 'sup-1', role: 'SUPERVISOR' };
const NOW = new Date('2026-11-14T08:00:00.000Z');
const RANGE = { from: new Date('2026-10-15T08:00:00.000Z'), to: NOW };

function totals(incidents: number, range = RANGE): PeriodTotals {
  const target = { met: incidents, counted: incidents, overdue: 0, pct: incidents ? 100 : null };
  return {
    range,
    incidents,
    byCategory: [{ category: 'FLOOD', count: incidents }],
    byPriority: [{ priority: 'HIGH', count: incidents }],
    byBarangay: [{ barangay: 'Lolomboy', count: incidents }],
    targets: { acknowledge: target, dispatch: target, onScene: target },
    intervals: { acknowledge: { avgSec: 60, n: incidents }, dispatch: { avgSec: 300, n: incidents }, arrival: { avgSec: 600, n: incidents } },
    falseAlerts: { count: 0, ratePct: incidents ? 0 : null },
  };
}

const factsFor = (current: number, previous = 4) =>
  buildFacts(totals(current), totals(previous, { from: new Date(RANGE.from.getTime() - 30 * 86_400_000), to: RANGE.from }));

const GOOD = {
  headline: 'Lolomboy had 12 flood incidents in 30 days, up from 4.',
  points: ['All 12 incidents were acknowledged within target.', 'There were 0 false alerts.'],
  watchItems: [],
};

function storedRow(over: Record<string, unknown> = {}) {
  const facts = factsFor(12);
  return {
    id: 'sum-1',
    status: 'PENDING_REVIEW',
    created_at: NOW,
    reviewed_at: null,
    reviewed_by: null,
    output: { ...GOOD, period: { from: facts.period.from, to: facts.period.to, days: 30, label: facts.period.label }, facts },
    ...over,
  };
}

function build(opts: { enabled?: boolean; incidents?: number; existing?: unknown; answer?: unknown } = {}) {
  const facts = factsFor(opts.incidents ?? 12);
  const prisma: any = {
    ai_suggestions: {
      findFirst: jest.fn().mockResolvedValue(opts.existing ?? null),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(async ({ data }: any) => ({
        id: 'sum-2',
        status: data.status,
        created_at: NOW,
        reviewed_at: null,
        reviewed_by: null,
        output: data.output,
      })),
    },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: any) => unknown) => fn(prisma));
  const audit = { log: jest.fn(), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const ai = {
    enabled: opts.enabled ?? true,
    structured: jest.fn().mockResolvedValue(
      opts.answer ?? { ok: true, value: GOOD, model: 'gemini-3.8-flash', latencyMs: 1200 },
    ),
  };
  const factsService = { collect: jest.fn().mockResolvedValue(facts) };
  const service = new AnalyticsNarrativeService(prisma, audit as any, ai as any, factsService as any);
  return { service, prisma, audit, ai, factsService, facts };
}

describe('AnalyticsNarrativeService.generate', () => {
  it('does nothing when AI is off', async () => {
    const b = build({ enabled: false });
    await expect(b.service.generate(RANGE, SUPERVISOR, NOW)).resolves.toEqual({ outcome: 'DISABLED' });
    expect(b.factsService.collect).not.toHaveBeenCalled();
    expect(b.prisma.ai_suggestions.create).not.toHaveBeenCalled();
  });

  it('makes no call and stores nothing with fewer than 5 incidents', async () => {
    const b = build({ incidents: 4 });
    await expect(b.service.generate(RANGE, SUPERVISOR, NOW)).resolves.toEqual({ outcome: 'TOO_FEW', incidents: 4, minimum: 5 });
    expect(b.ai.structured).not.toHaveBeenCalled();
    expect(b.prisma.ai_suggestions.create).not.toHaveBeenCalled();
  });

  it('sends only the facts text, stores a PENDING_REVIEW row with its audit entry, and supersedes older ones', async () => {
    const b = build();
    const res = await b.service.generate(RANGE, SUPERVISOR, NOW);

    expect(res).toMatchObject({
      outcome: 'CREATED',
      summary: { id: 'sum-2', status: 'PENDING_REVIEW', headline: GOOD.headline, incidents: 12, period: { days: 30 } },
    });
    const [task, , input, , , opts] = b.ai.structured.mock.calls[0];
    expect(task).toBe('ANALYTICS_NARRATIVE');
    expect(input).toBe(factsToPromptText(b.facts));
    expect(opts).toEqual({ maxOutputTokens: 1024, timeoutMs: 20_000 });

    expect(b.prisma.ai_suggestions.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: 'PENDING_REVIEW', subject_type: ANALYTICS_SUBJECT, output: { path: ['period', 'days'], equals: 30 } }),
      data: { status: 'SUPERSEDED' },
    });
    const data = b.prisma.ai_suggestions.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      kind: 'ANALYTICS_NARRATIVE',
      subject_type: ANALYTICS_SUBJECT,
      status: 'PENDING_REVIEW',
      requested_by_id: 'sup-1',
      error: null,
    });
    expect(data.subject_id).toBeUndefined();
    expect(data.input_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.audit.logInTransaction).toHaveBeenCalledWith(
      b.prisma,
      expect.objectContaining({ action: 'CREATE', entityType: 'ai_suggestion', entityId: 'sum-2', moduleId: 'MOD-50', actorId: 'sup-1' }),
    );
  });

  it('returns the same summary for the same facts without a new call', async () => {
    const b = build({ existing: storedRow() });
    await expect(b.service.generate(RANGE, SUPERVISOR, NOW)).resolves.toMatchObject({ outcome: 'REUSED', summary: { id: 'sum-1' } });
    expect(b.ai.structured).not.toHaveBeenCalled();
    expect(b.prisma.ai_suggestions.findFirst.mock.calls[0][0].where).toMatchObject({
      kind: 'ANALYTICS_NARRATIVE',
      status: { in: ['PENDING_REVIEW', 'ACCEPTED'] },
    });
  });

  it('stores FAILED / UNVERIFIED_NUMBER when the AI writes a number that is not in the facts', async () => {
    const b = build({
      answer: { ok: true, value: { ...GOOD, headline: 'Floods rose 200%.' }, model: 'gemini-3.8-flash', latencyMs: 900 },
    });
    await expect(b.service.generate(RANGE, SUPERVISOR, NOW)).resolves.toEqual({ outcome: 'FAILED', error: 'UNVERIFIED_NUMBER' });
    expect(b.prisma.ai_suggestions.create.mock.calls[0][0].data).toMatchObject({ status: 'FAILED', error: 'UNVERIFIED_NUMBER' });
    // A failed summary never replaces a good one.
    expect(b.prisma.ai_suggestions.updateMany).not.toHaveBeenCalled();
    expect(b.audit.logInTransaction.mock.calls[0][1].newValues).toMatchObject({ status: 'FAILED', error: 'UNVERIFIED_NUMBER' });
  });

  it('stores and returns the summary without watch items that repeat a point', async () => {
    const b = build({
      answer: {
        ok: true,
        value: { ...GOOD, watchItems: ['All 12 incidents acknowledged within target.', 'Lolomboy flood reports to follow next period.'] },
        model: 'gpt-4o-mini',
        latencyMs: 900,
      },
    });
    const res = await b.service.generate(RANGE, SUPERVISOR, NOW);
    expect(res).toMatchObject({ outcome: 'CREATED', summary: { watchItems: ['Lolomboy flood reports to follow next period.'] } });
    expect(b.prisma.ai_suggestions.create.mock.calls[0][0].data.output.watchItems).toEqual([
      'Lolomboy flood reports to follow next period.',
    ]);
  });

  it('asks for the counts behind each percentage and no repeated watch items', () => {
    expect(ANALYTICS_NARRATIVE_INSTRUCTIONS).toContain('"29% (2 of 7)"');
    expect(ANALYTICS_NARRATIVE_INSTRUCTIONS).toContain('Never repeat or reword a point');
  });

  it('stores FAILED with the provider code on a timeout', async () => {
    const b = build({ answer: { ok: false, error: 'TIMEOUT', model: 'gemini-3.8-flash', latencyMs: 20_000 } });
    await expect(b.service.generate(RANGE, SUPERVISOR, NOW)).resolves.toEqual({ outcome: 'FAILED', error: 'TIMEOUT' });
    expect(b.prisma.ai_suggestions.create.mock.calls[0][0].data).toMatchObject({ status: 'FAILED', error: 'TIMEOUT' });
  });
});

describe('AnalyticsNarrativeService.latest', () => {
  it('reports AI off without reading anything', async () => {
    const b = build({ enabled: false });
    await expect(b.service.latest(RANGE, NOW)).resolves.toEqual({ enabled: false, summary: null });
    expect(b.prisma.ai_suggestions.findFirst).not.toHaveBeenCalled();
  });

  it('returns the newest open summary of the same period length from the last 24 h', async () => {
    const b = build({ existing: storedRow({ status: 'ACCEPTED', reviewed_at: NOW, reviewed_by: { full_name: 'Ana Cruz' } }) });
    await expect(b.service.latest(RANGE, NOW)).resolves.toMatchObject({
      enabled: true,
      summary: { id: 'sum-1', status: 'ACCEPTED', reviewedBy: 'Ana Cruz' },
    });
    expect(b.prisma.ai_suggestions.findFirst.mock.calls[0][0].where).toMatchObject({
      output: { path: ['period', 'days'], equals: 30 },
      created_at: { gte: new Date(NOW.getTime() - 24 * 3_600_000) },
    });
  });
});

describe('AnalyticsNarrativeService review', () => {
  it('accept marks it reviewed and audits it in the same transaction', async () => {
    const b = build();
    b.prisma.ai_suggestions.findUnique.mockResolvedValue({ kind: 'ANALYTICS_NARRATIVE', status: 'PENDING_REVIEW' });
    b.prisma.ai_suggestions.findUniqueOrThrow.mockResolvedValue(
      storedRow({ status: 'ACCEPTED', reviewed_at: NOW, reviewed_by: { full_name: 'Ana Cruz' } }),
    );
    await expect(b.service.accept('sum-1', SUPERVISOR)).resolves.toMatchObject({ status: 'ACCEPTED', reviewedBy: 'Ana Cruz' });
    expect(b.prisma.ai_suggestions.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'sum-1', kind: 'ANALYTICS_NARRATIVE', status: { in: ['PENDING_REVIEW'] } },
      data: { status: 'ACCEPTED', reviewed_by_id: 'sup-1' },
    });
    expect(b.audit.logInTransaction.mock.calls[0][1]).toMatchObject({
      action: 'UPDATE',
      moduleId: 'MOD-50',
      oldValues: { status: 'PENDING_REVIEW' },
      newValues: { status: 'ACCEPTED' },
    });
  });

  it('a second review is refused and audits nothing', async () => {
    const b = build();
    b.prisma.ai_suggestions.findUnique.mockResolvedValue({ kind: 'ANALYTICS_NARRATIVE', status: 'ACCEPTED' });
    b.prisma.ai_suggestions.updateMany.mockResolvedValue({ count: 0 });
    await expect(b.service.accept('sum-1', SUPERVISOR)).rejects.toThrow(ConflictException);
    expect(b.audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('dismiss also withdraws an accepted summary', async () => {
    const b = build();
    b.prisma.ai_suggestions.findUnique.mockResolvedValue({ kind: 'ANALYTICS_NARRATIVE', status: 'ACCEPTED' });
    b.prisma.ai_suggestions.findUniqueOrThrow.mockResolvedValue(storedRow({ status: 'DISMISSED' }));
    await expect(b.service.dismiss('sum-1', SUPERVISOR)).resolves.toEqual({ id: 'sum-1', status: 'DISMISSED' });
    expect(b.prisma.ai_suggestions.updateMany.mock.calls[0][0].where.status).toEqual({ in: ['PENDING_REVIEW', 'ACCEPTED'] });
  });

  it('404 for an incident suggestion id', async () => {
    const b = build();
    b.prisma.ai_suggestions.findUnique.mockResolvedValue({ kind: 'BARANGAY_REPLY', status: 'PENDING_REVIEW' });
    await expect(b.service.accept('sug-1', SUPERVISOR)).rejects.toThrow(NotFoundException);
    expect(b.prisma.ai_suggestions.updateMany).not.toHaveBeenCalled();
  });
});

describe('AI summary routes', () => {
  it('are Supervisor only', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AnalyticsSummaryController)).toEqual([UserRole.SUPERVISOR]);
  });

  it('limit how often a summary can be generated', () => {
    const limit = (name: string) => Reflect.getMetadata(`${THROTTLER_LIMIT}${name}`, AnalyticsSummaryController.prototype.generate);
    expect(limit('burst')).toBe(3);
    expect(limit('sustained')).toBe(20);
  });
});
