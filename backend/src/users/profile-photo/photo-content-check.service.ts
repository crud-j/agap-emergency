import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'path';
import sharp from 'sharp';

/**
 * MOD-01: on-server check of a profile selfie for sunglasses and missing clothing.
 *
 * Runs an open model (OpenAI CLIP ViT-B/32, MIT licence, ONNX, quantized) on this
 * server through transformers.js. The photo is never sent to a third party and a check
 * costs nothing per photo. The model (~150 MB) is downloaded from the Hugging Face hub
 * once and cached; no user data is sent to fetch it.
 *
 * CLIP compares the photo with short text descriptions ("a photo of a person wearing
 * sunglasses" vs "... with clearly visible eyes") and reports how strongly it matches
 * the "flag" side. Cut-offs were set on a small set of public photos (sunglasses worn
 * vs pushed up, clear glasses, hijabs, caps, shirtless, close-up faces) and can be
 * tuned with PROFILE_PHOTO_*_THRESHOLD. It is a screen, not proof: the person can retake.
 */

export type PhotoIssue = 'SUNGLASSES' | 'UNDRESSED';

interface PromptGroup {
  /** Descriptions that mean the photo has this issue. */
  flag: string[];
  /** Descriptions that mean it doesn't — including look-alikes that must pass. */
  pass: string[];
}

export const PHOTO_CHECK_PROMPTS: Record<PhotoIssue, PromptGroup> = {
  SUNGLASSES: {
    flag: [
      'a photo of a person wearing sunglasses',
      'a photo of a person whose eyes are hidden behind dark sunglasses',
      'a photo of a person wearing dark shades over their eyes',
    ],
    pass: [
      'a photo of a person with clearly visible eyes',
      'a photo of a person wearing clear eyeglasses',
      'a photo of a person with sunglasses resting on top of their head',
      'a photo of a person looking straight at the camera',
    ],
  },
  UNDRESSED: {
    flag: [
      'a photo of a shirtless person',
      'a photo of a naked person',
      'a photo of a topless person',
      'a photo of a person in underwear or a bikini',
    ],
    pass: [
      'a photo of a person wearing a shirt',
      'a photo of a person wearing clothes',
      'a close-up photo of a face',
      'a headshot of a person',
      'a photo of a person wearing a hijab',
      'a photo of a person wearing a dress',
    ],
  },
};

export const DEFAULT_THRESHOLDS: Record<PhotoIssue, number> = { SUNGLASSES: 0.78, UNDRESSED: 0.7 };

const MODEL_ID = 'Xenova/clip-vit-base-patch32';
/** CLIP's learned logit scale (exp(4.6052)). */
const LOGIT_SCALE = 100;
/** How long an upload waits for the model on a cold start before asking the user to retry. */
const LOAD_WAIT_MS = 20_000;

export type PhotoCheckResult =
  | { status: 'passed'; scores: Record<PhotoIssue, number> }
  | { status: 'rejected'; issues: PhotoIssue[]; scores: Record<PhotoIssue, number> }
  /** Checks are switched off (PROFILE_PHOTO_CHECKS=off). */
  | { status: 'skipped' }
  /** The model couldn't be loaded or is still loading. */
  | { status: 'unavailable' };

function normalize(v: ArrayLike<number>): number[] {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const norm = Math.sqrt(sum) || 1;
  return Array.from(v, (x) => x / norm);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/**
 * Probability mass on the "flag" side: softmax over all descriptions in the group
 * (cosine similarity × CLIP's logit scale), summed over the flag descriptions.
 */
export function flagProbability(imageEmbed: number[], flagEmbeds: number[][], passEmbeds: number[][]): number {
  const logits = [...flagEmbeds, ...passEmbeds].map((t) => LOGIT_SCALE * dot(imageEmbed, t));
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.slice(0, flagEmbeds.length).reduce((a, b) => a + b, 0) / total;
}

/** Issues whose score reaches its cut-off, in a stable order. */
export function issuesFor(scores: Record<PhotoIssue, number>, thresholds: Record<PhotoIssue, number>): PhotoIssue[] {
  return (Object.keys(PHOTO_CHECK_PROMPTS) as PhotoIssue[]).filter((k) => scores[k] >= thresholds[k]);
}

interface LoadedModel {
  embedImage(jpeg: Buffer): Promise<number[]>;
  textEmbeds: Record<PhotoIssue, { flag: number[][]; pass: number[][] }>;
}

@Injectable()
export class PhotoContentCheckService implements OnModuleInit {
  private readonly logger = new Logger(PhotoContentCheckService.name);
  private readonly enabled: boolean;
  private readonly cacheDir: string;
  private readonly allowDownload: boolean;
  private readonly thresholds: Record<PhotoIssue, number>;
  private loading: Promise<LoadedModel> | null = null;

  constructor(config: ConfigService) {
    this.enabled = config.get<string>('PROFILE_PHOTO_CHECKS', 'on') !== 'off';
    this.cacheDir = resolve(config.get<string>('PROFILE_PHOTO_MODEL_DIR', '.cache/models'));
    this.allowDownload = config.get<string>('PROFILE_PHOTO_MODEL_DOWNLOAD', 'true') !== 'false';
    const threshold = (key: string, fallback: number) => {
      const n = Number(config.get<string>(key));
      return Number.isFinite(n) && n > 0 && n < 1 ? n : fallback;
    };
    this.thresholds = {
      SUNGLASSES: threshold('PROFILE_PHOTO_SUNGLASSES_THRESHOLD', DEFAULT_THRESHOLDS.SUNGLASSES),
      UNDRESSED: threshold('PROFILE_PHOTO_UNDRESSED_THRESHOLD', DEFAULT_THRESHOLDS.UNDRESSED),
    };
  }

  /** Warm the model in the background so the first photo change doesn't wait for it. */
  onModuleInit(): void {
    if (!this.enabled || process.env['NODE_ENV'] === 'test') return;
    this.model().then(
      () => this.logger.log('Profile photo check ready.'),
      () => undefined, // logged in model(); retried on the next upload
    );
  }

  /** Checks a normalised (square JPEG) selfie. Never throws. */
  async check(jpeg: Buffer): Promise<PhotoCheckResult> {
    if (!this.enabled) return { status: 'skipped' };
    let model: LoadedModel;
    try {
      model = await Promise.race([
        this.model(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('still loading')), LOAD_WAIT_MS).unref()),
      ]);
    } catch {
      return { status: 'unavailable' };
    }

    try {
      const image = await model.embedImage(jpeg);
      const scores = {} as Record<PhotoIssue, number>;
      for (const issue of Object.keys(PHOTO_CHECK_PROMPTS) as PhotoIssue[]) {
        const { flag, pass } = model.textEmbeds[issue];
        scores[issue] = Math.round(flagProbability(image, flag, pass) * 1000) / 1000;
      }
      const issues = issuesFor(scores, this.thresholds);
      // Scores only (for tuning the cut-offs): never the image or who it belongs to.
      this.logger.debug(`Photo check ${issues.length ? `flagged ${issues.join(',')}` : 'passed'} ${JSON.stringify(scores)}`);
      return issues.length ? { status: 'rejected', issues, scores } : { status: 'passed', scores };
    } catch (err: unknown) {
      this.logger.error(`Profile photo check failed: ${String(err)}`);
      return { status: 'unavailable' };
    }
  }

  private model(): Promise<LoadedModel> {
    this.loading ??= this.load().catch((err: unknown) => {
      this.loading = null; // try again next time
      this.logger.error(`Profile photo check model could not be loaded: ${String(err)}`);
      throw err;
    });
    return this.loading;
  }

  private async load(): Promise<LoadedModel> {
    // Loaded on first use: the ONNX runtime is native, and a host that can't load it
    // must only lose photo checks, never fail to boot.
    const T = await import('@huggingface/transformers');
    T.env.cacheDir = this.cacheDir;
    T.env.allowRemoteModels = this.allowDownload;

    const [processor, tokenizer, vision, text] = await Promise.all([
      T.AutoProcessor.from_pretrained(MODEL_ID),
      T.AutoTokenizer.from_pretrained(MODEL_ID),
      T.CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' }),
      T.CLIPTextModelWithProjection.from_pretrained(MODEL_ID, { dtype: 'q8' }),
    ]);

    const textEmbeds = {} as LoadedModel['textEmbeds'];
    for (const [issue, group] of Object.entries(PHOTO_CHECK_PROMPTS) as [PhotoIssue, PromptGroup][]) {
      const prompts = [...group.flag, ...group.pass];
      const { text_embeds } = await text(tokenizer(prompts, { padding: true, truncation: true }));
      const width = text_embeds.dims[1] as number;
      const data = text_embeds.data as Float32Array;
      const rows = prompts.map((_, i) => normalize(data.subarray(i * width, (i + 1) * width)));
      textEmbeds[issue] = { flag: rows.slice(0, group.flag.length), pass: rows.slice(group.flag.length) };
    }

    return {
      textEmbeds,
      async embedImage(jpeg: Buffer) {
        const { data, info } = await sharp(jpeg).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const image = new T.RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
        const { image_embeds } = await vision(await processor(image));
        return normalize(image_embeds.data as Float32Array);
      },
    };
  }
}
