import { AiTaskRunner } from '../../src/ai-assist/ai-task-runner.service';
import { BARANGAY_SMS_SUBJECT } from '../../src/ai-assist/ai-assist.jobs';
import { BARANGAY_REPLY_INSTRUCTIONS, BarangayReplySchema } from '../../src/ai-assist/prompts/barangay-reply.prompt';

/**
 * AUTOMATION_NEEDS_PLAN Phase 3 (C4): one AI_ASSIST job reads one unparsed barangay reply
 * and stores exactly one ai_suggestions row. It never throws and never touches the incident.
 */

const INBOUND = {
  id: 'in-1',
  body: 'nandito na kami, tawag kayo sa 09171234567',
  outcome: 'UNPARSED',
  notice: { incident_id: 'inc-1', closed_at: null },
};

function build(opts: { enabled?: boolean; inbound?: any; existing?: boolean; result?: any } = {}) {
  const prisma: any = {
    barangay_sms_inbound: { findUnique: jest.fn().mockResolvedValue(opts.inbound === undefined ? INBOUND : opts.inbound) },
    ai_suggestions: {
      findFirst: jest.fn().mockResolvedValue(opts.existing ? { id: 'old' } : null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 'sug-1' }),
    },
    incident: { update: jest.fn() },
    incident_barangay_notices: { update: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn: (tx: any) => unknown) => fn(prisma));
  const ai: any = {
    enabled: opts.enabled ?? true,
    structured: jest.fn().mockResolvedValue(
      opts.result ?? { ok: true, value: { status: 'ON_SCENE', confidence: 0.92, english: 'We are here' }, model: 'gemini-3.8-flash', latencyMs: 640 },
    ),
  };
  const realtime: any = { aiSuggestionCreated: jest.fn() };
  return { runner: new AiTaskRunner(prisma, ai, realtime), prisma, ai, realtime };
}

const run = (b: ReturnType<typeof build>) => b.runner.run({ task: 'BARANGAY_REPLY', inboundId: 'in-1' });
const created = (b: ReturnType<typeof build>) => b.prisma.ai_suggestions.create.mock.calls[0][0].data;

describe('AiTaskRunner: barangay reply', () => {
  it('sends only the redacted body and stores a PENDING_REVIEW suggestion for a confident reading', async () => {
    const b = build();
    await run(b);

    const [task, instructions, input, , schema] = b.ai.structured.mock.calls[0];
    expect(task).toBe('BARANGAY_REPLY');
    expect(instructions).toBe(BARANGAY_REPLY_INSTRUCTIONS);
    expect(schema).toBe(BarangayReplySchema);
    // No phone number, and nothing but the reply text (no incident or notice data).
    expect(input).toBe('nandito na kami, tawag kayo sa [removed]');

    expect(created(b)).toMatchObject({
      incident_id: 'inc-1',
      subject_type: BARANGAY_SMS_SUBJECT,
      subject_id: 'in-1',
      kind: 'BARANGAY_REPLY',
      status: 'PENDING_REVIEW',
      output: { status: 'ON_SCENE', confidence: 0.92, english: 'We are here' },
      model: 'gemini-3.8-flash',
      latency_ms: 640,
      error: null,
    });
    expect(created(b).input_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.realtime.aiSuggestionCreated).toHaveBeenCalledWith({
      suggestionId: 'sug-1', incidentId: 'inc-1', kind: 'BARANGAY_REPLY', status: 'PENDING_REVIEW',
    });
    // The newest reading replaces older open ones for the case, in the same transaction as
    // the insert, except an open reading of a help request.
    expect(b.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(b.prisma.ai_suggestions.updateMany).toHaveBeenCalledWith({
      where: {
        incident_id: 'inc-1',
        kind: 'BARANGAY_REPLY',
        status: { in: ['PENDING_REVIEW', 'INFO'] },
        NOT: { output: { path: ['status'], equals: 'NEEDS_BACKUP' } },
      },
      data: { status: 'SUPERSEDED' },
    });
    // A suggestion only: nothing about the incident or the notice changes.
    expect(b.prisma.incident.update).not.toHaveBeenCalled();
    expect(b.prisma.incident_barangay_notices.update).not.toHaveBeenCalled();
  });

  it.each([
    ['UNCLEAR', { status: 'UNCLEAR', confidence: 0.95, english: 'Who is this?' }],
    ['a confidence below 0.6', { status: 'HANDLED', confidence: 0.55, english: 'Maybe done' }],
  ])('%s → INFO (shown, no Accept)', async (_label, value) => {
    const b = build({ result: { ok: true, value, model: 'm', latencyMs: 1 } });
    await run(b);
    expect(created(b).status).toBe('INFO');
    // Information never replaces a reviewable reading (a "salamat po" after a request for
    // a boat must not hide the backup card), only older information.
    expect(b.prisma.ai_suggestions.updateMany.mock.calls[0][0].where).toMatchObject({
      status: 'INFO',
      NOT: { output: { path: ['status'], equals: 'NEEDS_BACKUP' } },
    });
  });

  it.each(['TIMEOUT', 'RATE_LIMITED', 'AUTH', 'BLOCKED', 'INVALID_OUTPUT', 'DAILY_LIMIT', 'PROVIDER_ERROR'])(
    '%s → a FAILED row with that code, no output, nothing superseded',
    async (code) => {
      const b = build({ result: { ok: false, error: code, model: 'gemini-3.8-flash', latencyMs: 8000 } });
      await expect(run(b)).resolves.toBeUndefined();
      expect(created(b)).toMatchObject({ status: 'FAILED', error: code });
      expect(created(b)).not.toHaveProperty('output');
      expect(b.prisma.ai_suggestions.updateMany).not.toHaveBeenCalled();
    },
  );

  it('with AI Assist off: no call and no row', async () => {
    const b = build({ enabled: false });
    await run(b);
    expect(b.ai.structured).not.toHaveBeenCalled();
    expect(b.prisma.ai_suggestions.create).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing inbound row', null],
    ['an applied reply', { ...INBOUND, outcome: 'APPLIED' }],
    ['a reply with no case', { ...INBOUND, notice: null }],
    ['a closed case', { ...INBOUND, notice: { incident_id: 'inc-1', closed_at: new Date() } }],
  ])('%s is never sent to Gemini', async (_label, inbound) => {
    const b = build({ inbound });
    await run(b);
    expect(b.ai.structured).not.toHaveBeenCalled();
    expect(b.prisma.ai_suggestions.create).not.toHaveBeenCalled();
  });

  it('a repeated job for the same reply makes no second call', async () => {
    const b = build({ existing: true });
    await run(b);
    expect(b.ai.structured).not.toHaveBeenCalled();
  });

  it('never throws, even when the row cannot be stored', async () => {
    const b = build();
    b.prisma.ai_suggestions.create.mockRejectedValue(new Error('db down'));
    await expect(run(b)).resolves.toBeUndefined();
    expect(b.realtime.aiSuggestionCreated).not.toHaveBeenCalled();
  });
});
