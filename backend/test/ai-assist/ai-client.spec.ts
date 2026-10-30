import {
  AiClientService,
  classifyAiError,
  startOfManilaDay,
  thinkingConfigFor,
} from '../../src/ai-assist/ai-client.service';
import {
  BARANGAY_REPLY_INSTRUCTIONS,
  BARANGAY_REPLY_JSON_SCHEMA,
  BarangayReplySchema,
} from '../../src/ai-assist/prompts/barangay-reply.prompt';

/**
 * AUTOMATION_NEEDS_PLAN Phase 3 (C4) / AI_ASSIST_PLAN Phase 1: the one Gemini client.
 * '@google/genai' is mocked: no test calls Gemini.
 */

const mockGenerateContent = jest.fn();
const mockConstructed: any[] = [];
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation((opts: any) => {
    mockConstructed.push(opts);
    return { models: { generateContent: mockGenerateContent } };
  }),
}));

const ON = { AI_ASSIST_ENABLED: 'true', GEMINI_API_KEY: 'test-key-not-real', GEMINI_MODEL: 'gemini-3.8-flash' };

function build(env: Record<string, string | undefined> = ON, used = 0) {
  const prisma: any = { ai_suggestions: { count: jest.fn().mockResolvedValue(used) } };
  const config: any = { get: jest.fn((k: string) => env[k]) };
  return { service: new AiClientService(prisma, config), prisma };
}

const call = (service: AiClientService, input = 'nandito na kami') =>
  service.structured('BARANGAY_REPLY', BARANGAY_REPLY_INSTRUCTIONS, input, BARANGAY_REPLY_JSON_SCHEMA, BarangayReplySchema);

const answer = (json: unknown, extra: Record<string, unknown> = {}) => ({
  text: typeof json === 'string' ? json : JSON.stringify(json),
  candidates: [{ finishReason: 'STOP' }],
  ...extra,
});

const apiError = (status: number, message = 'provider said something') => Object.assign(new Error(message), { status });

beforeEach(() => {
  mockGenerateContent.mockReset();
  mockConstructed.length = 0;
});

describe('AiClientService: off', () => {
  it.each([
    ['flag unset', { ...ON, AI_ASSIST_ENABLED: undefined }],
    ['flag false', { ...ON, AI_ASSIST_ENABLED: 'false' }],
    ['no key', { ...ON, GEMINI_API_KEY: '' }],
    ['no model', { ...ON, GEMINI_MODEL: ' ' }],
  ])('%s: DISABLED, no client is built and nothing is called', async (_label, env) => {
    const b = build(env as Record<string, string>);
    expect(b.service.enabled).toBe(false);
    await expect(call(b.service)).resolves.toMatchObject({ ok: false, error: 'DISABLED' });
    expect(mockConstructed).toHaveLength(0);
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(b.prisma.ai_suggestions.count).not.toHaveBeenCalled();
  });
});

describe('AiClientService: a call', () => {
  it('sends the instructions, the input and the JSON schema, one attempt, temperature 0, with an abort signal', async () => {
    mockGenerateContent.mockResolvedValue(answer({ status: 'ON_SCENE', confidence: 0.93, english: 'We are here' }));
    const b = build();
    await expect(call(b.service)).resolves.toMatchObject({
      ok: true,
      value: { status: 'ON_SCENE', confidence: 0.93, english: 'We are here' },
      model: 'gemini-3.8-flash',
    });

    // The client is built lazily, once, with no SDK retries (it would retry 429/5xx 5 times).
    expect(mockConstructed).toEqual([{ apiKey: 'test-key-not-real', httpOptions: { retryOptions: { attempts: 1 } } }]);
    const req = mockGenerateContent.mock.calls[0][0];
    expect(req.model).toBe('gemini-3.8-flash');
    expect(req.contents).toBe('nandito na kami');
    expect(req.config).toMatchObject({
      systemInstruction: BARANGAY_REPLY_INSTRUCTIONS,
      responseMimeType: 'application/json',
      responseJsonSchema: BARANGAY_REPLY_JSON_SCHEMA,
      temperature: 0,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    });
    expect(req.config.abortSignal).toBeInstanceOf(AbortSignal);

    await call(b.service);
    expect(mockConstructed).toHaveLength(1);
  });

  it('cuts an over-long English reading instead of failing the call', async () => {
    mockGenerateContent.mockResolvedValue(answer({ status: 'NEEDS_BACKUP', confidence: 0.9, english: 'x'.repeat(150) }));
    const res = await call(build().service);
    expect(res.ok && res.value.english).toHaveLength(120);
  });
});

describe('AiClientService: every failure is a code, never a throw', () => {
  it('TIMEOUT: the call is aborted at AI_ASSIST_TIMEOUT_MS', async () => {
    mockGenerateContent.mockImplementation(
      ({ config }: any) =>
        new Promise((_resolve, reject) =>
          config.abortSignal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
        ),
    );
    const b = build({ ...ON, AI_ASSIST_TIMEOUT_MS: '30' } as any);
    await expect(call(b.service)).resolves.toMatchObject({ ok: false, error: 'TIMEOUT' });
  });

  it.each([
    [429, 'RATE_LIMITED'],
    [401, 'AUTH'],
    [403, 'AUTH'],
    [500, 'PROVIDER_ERROR'],
    [503, 'PROVIDER_ERROR'],
  ])('HTTP %i → %s', async (status, code) => {
    mockGenerateContent.mockRejectedValue(apiError(status));
    await expect(call(build().service)).resolves.toMatchObject({ ok: false, error: code });
  });

  it('a bad key (Gemini answers 400 "API key not valid") → AUTH; any other 400 → PROVIDER_ERROR', async () => {
    mockGenerateContent.mockRejectedValueOnce(apiError(400, 'API key not valid. Please pass a valid API key.'));
    await expect(call(build().service)).resolves.toMatchObject({ ok: false, error: 'AUTH' });
    mockGenerateContent.mockRejectedValueOnce(apiError(400, 'Invalid JSON payload'));
    await expect(call(build().service)).resolves.toMatchObject({ ok: false, error: 'PROVIDER_ERROR' });
  });

  it.each([
    ['a blocked prompt', answer('', { promptFeedback: { blockReason: 'SAFETY' }, candidates: [] })],
    ['finishReason SAFETY', answer('', { candidates: [{ finishReason: 'SAFETY' }] })],
    ['finishReason PROHIBITED_CONTENT', answer('', { candidates: [{ finishReason: 'PROHIBITED_CONTENT' }] })],
  ])('BLOCKED: %s', async (_label, response) => {
    mockGenerateContent.mockResolvedValue(response);
    await expect(call(build().service)).resolves.toMatchObject({ ok: false, error: 'BLOCKED' });
  });

  it.each([
    ['not JSON', 'Sure! The status is ON_SCENE.'],
    ['empty', ''],
    ['an unknown status', { status: 'MAYBE', confidence: 0.9, english: 'x' }],
    ['confidence over 1', { status: 'SEEN', confidence: 2, english: 'x' }],
    ['a missing field', { status: 'SEEN', english: 'x' }],
  ])('INVALID_OUTPUT: %s', async (_label, output) => {
    mockGenerateContent.mockResolvedValue(answer(output));
    await expect(call(build().service)).resolves.toMatchObject({ ok: false, error: 'INVALID_OUTPUT' });
  });

  it('DAILY_LIMIT: no call once today has AI_ASSIST_DAILY_LIMIT calls', async () => {
    const b = build({ ...ON, AI_ASSIST_DAILY_LIMIT: '3' } as any, 3);
    await expect(call(b.service)).resolves.toMatchObject({ ok: false, error: 'DAILY_LIMIT' });
    expect(mockGenerateContent).not.toHaveBeenCalled();
    const where = b.prisma.ai_suggestions.count.mock.calls[0][0].where;
    expect(where.created_at.gte).toEqual(startOfManilaDay(new Date()));
    // DAILY_LIMIT rows made no call; rows with no error must still count (a bare NOT would drop them).
    expect(where.OR).toEqual([{ error: null }, { error: { not: 'DAILY_LIMIT' } }]);
  });

  it('below the limit the call goes ahead', async () => {
    mockGenerateContent.mockResolvedValue(answer({ status: 'SEEN', confidence: 0.8, english: 'Noted' }));
    const b = build({ ...ON, AI_ASSIST_DAILY_LIMIT: '3' } as any, 2);
    await expect(call(b.service)).resolves.toMatchObject({ ok: true });
  });

  it('a database error on the limit check is a failure, not a throw', async () => {
    const b = build();
    b.prisma.ai_suggestions.count.mockRejectedValue(new Error('db down'));
    await expect(call(b.service)).resolves.toMatchObject({ ok: false, error: 'PROVIDER_ERROR' });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('classifyAiError never needs the message except to spot a bad key', () => {
    expect(classifyAiError(new Error('x'), true)).toBe('TIMEOUT');
    expect(classifyAiError('a string', false)).toBe('PROVIDER_ERROR');
    expect(classifyAiError(undefined, false)).toBe('PROVIDER_ERROR');
  });

  it.each([
    ['gemini-3.8-flash', { thinkingLevel: 'MINIMAL' }],
    ['gemini-3-pro', { thinkingLevel: 'LOW' }],
    ['gemini-2.5-flash', { thinkingBudget: 0 }],
    ['gemini-2.5-flash-lite', { thinkingBudget: 0 }],
    ['gemini-2.5-pro', { thinkingBudget: 128 }],
    ['gemini-2.0-flash', undefined],
    ['some-other-model', undefined],
  ])('thinkingConfigFor(%s)', (model, expected) => {
    expect(thinkingConfigFor(model)).toEqual(expected);
  });

  it('startOfManilaDay is midnight in UTC+8, whatever the server zone', () => {
    // 2026-10-30 23:30 UTC is 2026-10-31 07:30 in Manila → day starts 2026-10-30 16:00 UTC.
    expect(startOfManilaDay(new Date('2026-10-30T23:30:00Z')).toISOString()).toBe('2026-10-30T16:00:00.000Z');
    // 2026-10-30 15:59 UTC is 23:59 in Manila → day started 2026-10-29 16:00 UTC.
    expect(startOfManilaDay(new Date('2026-10-30T15:59:00Z')).toISOString()).toBe('2026-10-29T16:00:00.000Z');
  });
});
