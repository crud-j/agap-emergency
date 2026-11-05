import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { dirname, join } from 'path';
import { createWorker, OEM, type Worker } from 'tesseract.js';

/** A read slower than this returns "unreadable" instead of holding the request open. */
export const OCR_TIMEOUT_MS = 20_000;

export interface OcrResult {
  text: string;
  /** Tesseract's mean word confidence, 0–100. */
  confidence: number;
}

/**
 * Server-side reading of a PhilHealth ID image (plan §5.4). Local tesseract.js with the
 * English data bundled in @tesseract.js-data/eng: nothing is fetched from a CDN, nothing is
 * cached to disk, and the image never leaves AGAP's server. The text it returns is personal
 * data — never log it.
 */
@Injectable()
export class PhilhealthOcrService implements OnModuleDestroy {
  private readonly logger = new Logger(PhilhealthOcrService.name);
  /** One worker, created on first use and reused; tesseract queues its jobs. */
  private worker: Promise<Worker> | null = null;

  /** The text on the card, or null when it couldn't be read in time. Never throws. */
  async read(image: Buffer): Promise<OcrResult | null> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), OCR_TIMEOUT_MS);
    });
    const work = this.getWorker().then((worker) => worker.recognize(image));
    // If the read fails after the timeout already won, that rejection must not go unhandled.
    work.catch(() => undefined);
    try {
      const result = await Promise.race([work, timeout]);
      if (result === 'timeout') {
        this.logger.warn(`PhilHealth ID reading timed out after ${OCR_TIMEOUT_MS} ms; restarting the OCR worker`);
        void this.reset();
        return null;
      }
      return { text: result.data.text, confidence: result.data.confidence };
    } catch (err: unknown) {
      this.logger.warn(`PhilHealth ID reading failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      void this.reset();
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.reset();
  }

  private getWorker(): Promise<Worker> {
    this.worker ??= createWorker('eng', OEM.LSTM_ONLY, {
      langPath: join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int'),
      gzip: true,
      cacheMethod: 'none',
    });
    return this.worker;
  }

  /** Drops the worker (stuck or failed); the next read starts a fresh one. */
  private async reset(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    if (!worker) return;
    try {
      await (await worker).terminate();
    } catch {
      // Already dead — nothing to clean up.
    }
  }
}
