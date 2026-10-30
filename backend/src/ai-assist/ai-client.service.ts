import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GenerateContentResponse, GoogleGenAI, ThinkingConfig, ThinkingLevel } from '@google/genai' with {
  'resolution-mode': 'import',
};
import type { z } from 'zod';
import { PrismaService } from '../common/prisma/prisma.service';
import { aiAssistEnabled } from './ai-assist.flags';

// The SDK is an ES module package whose Node "require" export is a CommonJS build. TypeScript
// (node16) reads its typings as ESM, so the types come from the type-only import above and the
// class from require(), which resolves to dist/node/index.cjs.
const genai = require('@google/genai') as { GoogleGenAI: typeof GoogleGenAI };

export type AiTask =
  | 'BARANGAY_REPLY'
  | 'CASE_BRIEF'
  | 'HANDOVER_DRAFT'
  | 'CLOSURE_DRAFT'
  | 'ANNOUNCEMENT_DRAFT'
  | 'ANALYTICS_NARRATIVE';

/** Stored in ai_suggestions.error. Never a provider message: it can echo request content. */
export type AiErrorCode =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'AUTH'
  | 'BLOCKED'
  | 'INVALID_OUTPUT'
  | 'DAILY_LIMIT'
  | 'PROVIDER_ERROR';

export type AiResult<T> =
  | { ok: true; value: T; model: string; latencyMs: number }
  /** DISABLED: nothing was called and nothing should be stored. */
  | { ok: false; error: AiErrorCode | 'DISABLED'; model: string; latencyMs: number | null };

/** Finish reasons that mean Gemini withheld the answer (stored as BLOCKED). */
const BLOCKED_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII']);

/** Midnight in the Philippines (UTC+8, no DST), whatever the server's time zone. */
export function startOfManilaDay(now: Date): Date {
  const offset = 8 * 60 * 60 * 1000;
  const day = 24 * 60 * 60 * 1000;
  return new Date(Math.floor((now.getTime() + offset) / day) * day - offset);
}

/**
 * The lowest thinking setting the model generation allows: classification needs none, and
 * thinking would eat into AI_ASSIST_TIMEOUT_MS. Gemini 2.5 takes a token budget (Flash
 * can turn it off; Pro can't go below 128); Gemini 3 and later take a level (Flash has
 * MINIMAL, Pro starts at LOW). Older models don't think. Check new models against Google's docs.
 */
export function thinkingConfigFor(model: string): ThinkingConfig | undefined {
  const m = /^gemini-(\d+)(?:\.(\d+))?/.exec(model.trim().toLowerCase());
  if (!m) return undefined;
  const major = Number(m[1]);
  const minor = Number(m[2] ?? 0);
  const flash = model.toLowerCase().includes('flash');
  if (major >= 3) return { thinkingLevel: (flash ? 'MINIMAL' : 'LOW') as ThinkingLevel };
  if (major === 2 && minor >= 5) return { thinkingBudget: flash ? 0 : 128 };
  return undefined;
}

/** Maps a thrown error to a code. The message is read only to classify, never kept. */
export function classifyAiError(err: unknown, timedOut: boolean): AiErrorCode {
  if (timedOut) return 'TIMEOUT';
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : null;
  if (status === 429) return 'RATE_LIMITED';
  if (status === 401 || status === 403) return 'AUTH';
  // The Gemini API answers a bad key with 400 INVALID_ARGUMENT ("API key not valid").
  const message = err instanceof Error ? err.message : '';
  if (status === 400 && /API[ _]KEY/i.test(message)) return 'AUTH';
  return 'PROVIDER_ERROR';
}

/** BLOCKED when Gemini refused the prompt or stopped the answer for safety. */
function blocked(response: GenerateContentResponse): boolean {
  if (response.promptFeedback?.blockReason) return true;
  const reason = response.candidates?.[0]?.finishReason;
  return !!reason && BLOCKED_FINISH.has(String(reason));
}

/**
 * The one Gemini client for AI Assist (AI_ASSIST_PLAN Phase 1). It never throws: every
 * failure comes back as `{ ok: false, error }`, so callers keep today's behaviour. Off
 * unless AI_ASSIST_ENABLED is 'true' and GEMINI_API_KEY and GEMINI_MODEL are set; the
 * client is built only on the first call. One attempt per call (no SDK retries), a hard
 * timeout, and a daily cap. The only file that imports '@google/genai'.
 */
@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);
  private client: GoogleGenAI | null = null;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly dailyLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.model = this.config.get<string>('GEMINI_MODEL')?.trim() ?? '';
    this.timeoutMs = Number(this.config.get('AI_ASSIST_TIMEOUT_MS') ?? 8000) || 8000;
    this.dailyLimit = Number(this.config.get('AI_ASSIST_DAILY_LIMIT') ?? 500) || 0;
  }

  get enabled(): boolean {
    return aiAssistEnabled(this.config);
  }

  get modelId(): string {
    return this.model;
  }

  async structured<S extends z.ZodTypeAny>(
    task: AiTask,
    instructions: string,
    input: string,
    jsonSchema: unknown,
    schema: S,
  ): Promise<AiResult<z.infer<S>>> {
    const model = this.model;
    if (!this.enabled) return { ok: false, error: 'DISABLED', model, latencyMs: null };

    try {
      if (await this.overDailyLimit()) return { ok: false, error: 'DAILY_LIMIT', model, latencyMs: null };
    } catch (err) {
      this.logger.warn(`AI ${task}: daily limit check failed (${err instanceof Error ? err.name : 'unknown'})`);
      return { ok: false, error: 'PROVIDER_ERROR', model, latencyMs: null };
    }

    const started = Date.now();
    const abort = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, this.timeoutMs);

    try {
      const thinkingConfig = thinkingConfigFor(model);
      const response = await this.getClient().models.generateContent({
        model,
        contents: input,
        config: {
          systemInstruction: instructions,
          responseMimeType: 'application/json',
          responseJsonSchema: jsonSchema,
          temperature: 0,
          maxOutputTokens: 512,
          ...(thinkingConfig && { thinkingConfig }),
          abortSignal: abort.signal,
        },
      });
      const latencyMs = Date.now() - started;
      if (timedOut) return this.fail(task, 'TIMEOUT', model, latencyMs);
      if (blocked(response)) return this.fail(task, 'BLOCKED', model, latencyMs);

      let raw: unknown;
      try {
        raw = JSON.parse(response.text ?? '');
      } catch {
        return this.fail(task, 'INVALID_OUTPUT', model, latencyMs);
      }
      // Gemini's schema narrows the shape; Zod enforces our limits.
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return this.fail(task, 'INVALID_OUTPUT', model, latencyMs);
      return { ok: true, value: parsed.data, model, latencyMs };
    } catch (err) {
      const code = classifyAiError(err, timedOut);
      // The error class only: the message can echo request content.
      this.logger.warn(`AI ${task} failed: ${code} (${err instanceof Error ? err.name : 'unknown error'})`);
      return { ok: false, error: code, model, latencyMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }

  private fail(task: AiTask, error: AiErrorCode, model: string, latencyMs: number): AiResult<never> {
    this.logger.warn(`AI ${task} failed: ${error}`);
    return { ok: false, error, model, latencyMs };
  }

  /** Built on first use, so a disabled or unconfigured AI never creates a client. */
  private getClient(): GoogleGenAI {
    if (!this.client) {
      // Loaded from backend/.env by ConfigModule. Never logged, returned or stored.
      const apiKey = this.config.get<string>('GEMINI_API_KEY')?.trim() ?? '';
      // attempts 1 = no retries: the SDK otherwise retries 429 and 5xx up to 5 times.
      this.client = new genai.GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
    }
    return this.client;
  }

  /** Today's calls (Philippine day). A DAILY_LIMIT row made no call, so it doesn't count. */
  private async overDailyLimit(): Promise<boolean> {
    const used = await this.prisma.ai_suggestions.count({
      where: {
        created_at: { gte: startOfManilaDay(new Date()) },
        // NOT { error: 'DAILY_LIMIT' } alone would also drop rows whose error is null.
        OR: [{ error: null }, { error: { not: 'DAILY_LIMIT' } }],
      },
    });
    return used >= this.dailyLimit;
  }
}
