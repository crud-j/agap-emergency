import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export type AiReviewLabel = 'LIKELY_REAL' | 'SUSPICIOUS' | 'LIKELY_FAKE';

export interface AiReviewResult {
  label: AiReviewLabel;
  reason: string;
}

const VALID_LABELS = new Set<string>(['LIKELY_REAL', 'SUSPICIOUS', 'LIKELY_FAKE']);

const PROMPT = `You are assisting an emergency dispatcher by screening a photo submitted as evidence for a reported emergency in Bocaue, Philippines. Judge only whether this looks like a genuine, live photo of a real physical scene taken by a phone camera — never whether the emergency itself is serious or credible.

Flag it as SUSPICIOUS or LIKELY_FAKE if it looks like: a screenshot, a stock/web photo, an AI-generated image, a photo of a screen or monitor, a meme, or an image with no physical incident content at all (e.g. a random selfie, a blank wall).

Respond with ONLY a JSON object and nothing else:
{"label": "LIKELY_REAL" | "SUSPICIOUS" | "LIKELY_FAKE", "reason": "<one short sentence, under 100 characters>"}`;

/**
 * Tier 2 evidence review (MOD-10/MOD-25) — an advisory AI plausibility check on
 * a submitted photo, layered on top of the Tier 1 device-provenance check in
 * MediaService. Purely advisory: a dispatcher decides what to do with the
 * result, nothing here ever blocks an upload or touches dispatch.
 *
 * Disabled (review() always resolves null) when OPENAI_API_KEY is unset.
 */
@Injectable()
export class EvidenceAiReviewService {
  private readonly logger = new Logger(EvidenceAiReviewService.name);
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY', '');
    this.model = this.config.get<string>('OPENAI_EVIDENCE_REVIEW_MODEL', 'gpt-4o-mini');
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async review(buffer: Buffer, mimeType: string): Promise<AiReviewResult | null> {
    if (!this.client) return null;
    try {
      const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: PROMPT },
              { type: 'input_image', detail: 'low', image_url: dataUrl },
            ],
          },
        ],
      });

      const text = response.output_text?.trim() ?? '';
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        this.logger.warn(`Evidence AI review returned no parsable JSON: ${text.slice(0, 200)}`);
        return null;
      }

      const parsed = JSON.parse(match[0]) as { label?: unknown; reason?: unknown };
      if (typeof parsed.label !== 'string' || !VALID_LABELS.has(parsed.label)) {
        this.logger.warn(`Evidence AI review returned an unrecognized label: ${String(parsed.label)}`);
        return null;
      }
      const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 300) : '';
      return { label: parsed.label as AiReviewLabel, reason };
    } catch (err) {
      // Advisory only — a failed/unreachable OpenAI call must never affect the
      // upload that already succeeded, or dispatch in any way.
      this.logger.warn(`Evidence AI review failed: ${String(err)}`);
      return null;
    }
  }
}
