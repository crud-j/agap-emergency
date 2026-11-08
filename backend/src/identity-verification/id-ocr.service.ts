import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { dirname, join } from 'path';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import type { PixelRegion } from './id-image-size';

/** A read slower than this returns "unreadable" instead of holding the request open. */
export const OCR_TIMEOUT_MS = 20_000;

/**
 * How Tesseract lays out the page. `block` is its default: one uniform block of text, which is how
 * every first read runs. `auto` finds the columns itself, which can help when a photo sits beside the text.
 */
export type OcrLayout = 'block' | 'auto';

export interface OcrResult {
  text: string;
  /** Tesseract's mean word confidence, 0–100. */
  confidence: number;
}

/**
 * Server-side reading of an ID image, either ID (plan §5.4). Local tesseract.js with the
 * English data bundled in @tesseract.js-data/eng: nothing is fetched from a CDN, nothing is
 * cached to disk, and the image never leaves AGAP's server. The text it returns is personal
 * data — never log it.
 */
@Injectable()
export class IdOcrService implements OnModuleDestroy {
  private readonly logger = new Logger(IdOcrService.name);
  /**
   * One worker per layout, each created on first use and reused; tesseract queues its jobs. A layout
   * is a setting on the whole worker, so sharing one would let concurrent scans change each other's.
   */
  private readonly workers: Partial<Record<OcrLayout, Promise<Worker>>> = {};

  /**
   * The text on the card, or null when it couldn't be read in time. Never throws. `region`: read only that
   * part of the image, e.g. the name column away from the photo.
   */
  async read(image: Buffer, layout: OcrLayout = 'block', region?: PixelRegion): Promise<OcrResult | null> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), OCR_TIMEOUT_MS);
    });
    const work = this.getWorker(layout).then((worker) =>
      region ? worker.recognize(image, { rectangle: region }) : worker.recognize(image),
    );
    // If the read fails after the timeout already won, that rejection must not go unhandled.
    work.catch(() => undefined);
    try {
      const result = await Promise.race([work, timeout]);
      if (result === 'timeout') {
        this.logger.warn(`ID reading timed out after ${OCR_TIMEOUT_MS} ms; restarting the OCR worker`);
        void this.reset(layout);
        return null;
      }
      return { text: result.data.text, confidence: result.data.confidence };
    } catch (err: unknown) {
      this.logger.warn(`ID reading failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      void this.reset(layout);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.reset('block'), this.reset('auto')]);
  }

  private getWorker(layout: OcrLayout): Promise<Worker> {
    return (this.workers[layout] ??= this.startWorker(layout));
  }

  private async startWorker(layout: OcrLayout): Promise<Worker> {
    const worker = await createWorker('eng', OEM.LSTM_ONLY, {
      langPath: join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int'),
      gzip: true,
      cacheMethod: 'none',
    });
    if (layout === 'auto') {
      try {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      } catch (err: unknown) {
        await worker.terminate().catch(() => undefined);
        throw err;
      }
    }
    return worker;
  }

  /** Drops a worker (stuck or failed); the next read with that layout starts a fresh one. */
  private async reset(layout: OcrLayout): Promise<void> {
    const worker = this.workers[layout];
    delete this.workers[layout];
    if (!worker) return;
    try {
      await (await worker).terminate();
    } catch {
      // Already dead — nothing to clean up.
    }
  }
}
