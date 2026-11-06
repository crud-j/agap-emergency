jest.mock('tesseract.js', () => ({
  OEM: { LSTM_ONLY: 1 },
  createWorker: jest.fn(),
}));

import { createWorker } from 'tesseract.js';
import { Logger } from '@nestjs/common';
import { IdentityVerificationCleanupProcessor } from '../../src/jobs/processors/identity-verification.processor';
import { OCR_TIMEOUT_MS, PhilhealthOcrService } from '../../src/identity-verification/philhealth-ocr.service';
import { JPEG, makeKit } from './id-test-kit';

// MOD-01 / MOD-48 — the 10-minute cleanup job (plan §5.2a, §5.3) and the server OCR worker (§5.4).
describe('ID scan cleanup job', () => {
  let kit: ReturnType<typeof makeKit>;
  const NOW = new Date('2026-11-05T10:00:00Z');
  const minutes = (n: number) => new Date(NOW.getTime() + n * 60 * 1000);

  function seed(id: string, fields: Record<string, unknown>) {
    const location = `local:id-documents/${id}`;
    kit.storage.objects.set(location, Buffer.from('sealed'));
    kit.prisma.db.idv.push({
      id,
      user_id: null,
      status: 'AUTO_VERIFIED',
      claim_expires_at: minutes(10),
      pin_hmac: `hmac-${id}`,
      image_storage_key: location,
      ...fields,
    });
  }
  const rowOf = (id: string) => kit.prisma.db.idv.find((r: { id: string }) => r.id === id);

  beforeEach(() => {
    kit = makeKit();
  });

  it('expires unclaimed scans past their 30 minutes and deletes their images', async () => {
    seed('stale', { claim_expires_at: minutes(-1) });
    seed('fresh', { claim_expires_at: minutes(5) });

    expect(await kit.service.cleanup(NOW)).toEqual({ expired: 1, deleted: 1, failed: 0 });
    expect(rowOf('stale')).toMatchObject({ status: 'EXPIRED', image_storage_key: null });
    expect(kit.storage.objects.has('local:id-documents/stale')).toBe(false);
    // Still within its claim window: untouched.
    expect(rowOf('fresh')).toMatchObject({ status: 'AUTO_VERIFIED', image_storage_key: 'local:id-documents/fresh' });
    expect(kit.storage.objects.has('local:id-documents/fresh')).toBe(true);
  });

  it('erases the name and PIN data of an expired scan, keeping only that it happened', async () => {
    seed('stale', { claim_expires_at: minutes(-1), pin_hmac: 'hmac', pin_last4: '0010', name_on_id_sealed: 'sealed' });
    seed('fresh', { claim_expires_at: minutes(5), pin_hmac: 'hmac2', pin_last4: '0020', name_on_id_sealed: 'sealed2' });

    await kit.service.cleanup(NOW);

    expect(rowOf('stale')).toMatchObject({ status: 'EXPIRED', pin_hmac: null, pin_last4: null, name_on_id_sealed: null });
    expect(rowOf('fresh')).toMatchObject({ pin_hmac: 'hmac2', pin_last4: '0020', name_on_id_sealed: 'sealed2' });
  });

  it('also erases rows that expired before this rule existed, and leaves claimed rows alone', async () => {
    seed('old', { status: 'EXPIRED', claim_expires_at: minutes(-500), pin_hmac: 'hmac', pin_last4: '0010', name_on_id_sealed: 'sealed' });
    seed('claimed', { user_id: 'u-1', status: 'APPROVED', claim_expires_at: minutes(-500), pin_hmac: 'hmac3', pin_last4: '0030', name_on_id_sealed: 'sealed3' });

    await kit.service.cleanup(NOW);

    expect(rowOf('old')).toMatchObject({ pin_hmac: null, pin_last4: null, name_on_id_sealed: null });
    expect(rowOf('claimed')).toMatchObject({ status: 'APPROVED', pin_hmac: 'hmac3', pin_last4: '0030', name_on_id_sealed: 'sealed3' });
  });

  it('expires an unclaimed review scan too, and deletes its image', async () => {
    seed('review-stale', { status: 'PENDING_REVIEW', pin_hmac: null, claim_expires_at: minutes(-1) });
    seed('review-fresh', { status: 'PENDING_REVIEW', pin_hmac: null, claim_expires_at: minutes(5) });

    expect(await kit.service.cleanup(NOW)).toEqual({ expired: 1, deleted: 1, failed: 0 });
    expect(rowOf('review-stale')).toMatchObject({ status: 'EXPIRED', image_storage_key: null });
    expect(kit.storage.objects.has('local:id-documents/review-stale')).toBe(false);
    expect(rowOf('review-fresh')).toMatchObject({ status: 'PENDING_REVIEW', image_storage_key: 'local:id-documents/review-fresh' });
  });

  it('sweeps images of decided rows, and keeps the ones staff still need to review', async () => {
    seed('matched', { user_id: 'u-1', status: 'AUTO_VERIFIED' });
    seed('approved', { user_id: 'u-2', status: 'APPROVED' });
    seed('rejected', { user_id: 'u-3', status: 'REJECTED' });
    seed('expired', { status: 'EXPIRED' });
    seed('review', { user_id: 'u-4', status: 'PENDING_REVIEW' });

    expect(await kit.service.cleanup(NOW)).toEqual({ expired: 0, deleted: 4, failed: 0 });
    for (const id of ['matched', 'approved', 'rejected', 'expired']) {
      expect(rowOf(id).image_storage_key).toBeNull();
      expect(kit.storage.objects.has(`local:id-documents/${id}`)).toBe(false);
    }
    expect(rowOf('review').image_storage_key).toBe('local:id-documents/review');
    expect(kit.storage.objects.has('local:id-documents/review')).toBe(true);
  });

  it('logs a failed delete without card data and retries it on the next run', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    seed('matched', { user_id: 'u-1' });
    kit.storage.deletePrivateObject.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    expect(await kit.service.cleanup(NOW)).toEqual({ expired: 0, deleted: 0, failed: 1 });
    expect(rowOf('matched').image_storage_key).toBe('local:id-documents/matched');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('verification matched'));
    expect(warn.mock.calls.join(' ')).not.toMatch(/id-documents|DELA|0000/);

    expect(await kit.service.cleanup(NOW)).toEqual({ expired: 0, deleted: 1, failed: 0 });
    expect(rowOf('matched').image_storage_key).toBeNull();
    warn.mockRestore();
  });

  it('runs on a 10-minute schedule and never throws', async () => {
    const processor = new IdentityVerificationCleanupProcessor(kit.service);
    expect(Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', processor.run)).toMatchObject({ cronTime: '*/10 * * * *' });

    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(kit.service, 'cleanup').mockRejectedValueOnce(new Error('db down'));
    await expect(processor.run()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('PhilhealthOcrService', () => {
  const recognize = jest.fn();
  const terminate = jest.fn().mockResolvedValue(undefined);
  const mockCreateWorker = createWorker as jest.Mock;

  beforeEach(() => {
    jest.useRealTimers();
    recognize.mockReset();
    terminate.mockClear();
    mockCreateWorker.mockReset().mockResolvedValue({ recognize, terminate });
  });

  it('uses the bundled English data with no remote cache, and reuses one worker', async () => {
    recognize.mockResolvedValue({ data: { text: 'PhilHealth', confidence: 90 } });
    const ocr = new PhilhealthOcrService();

    expect(await ocr.read(JPEG)).toEqual({ text: 'PhilHealth', confidence: 90 });
    await ocr.read(JPEG);
    expect(mockCreateWorker).toHaveBeenCalledTimes(1);
    const [lang, , options] = mockCreateWorker.mock.calls[0];
    expect(lang).toBe('eng');
    expect(options).toMatchObject({ cacheMethod: 'none', gzip: true });
    expect(options.langPath).toMatch(/@tesseract\.js-data[\\/]eng[\\/]4\.0\.0_best_int$/);
  });

  it('gives up after the timeout, returns null, and starts a fresh worker next time', async () => {
    jest.useFakeTimers();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    recognize.mockReturnValueOnce(new Promise(() => undefined)); // stuck forever
    const ocr = new PhilhealthOcrService();

    const pending = ocr.read(JPEG);
    await jest.advanceTimersByTimeAsync(OCR_TIMEOUT_MS);
    expect(await pending).toBeNull();
    expect(terminate).toHaveBeenCalled();

    jest.useRealTimers();
    recognize.mockResolvedValue({ data: { text: 'ok', confidence: 80 } });
    expect(await ocr.read(JPEG)).toEqual({ text: 'ok', confidence: 80 });
    expect(mockCreateWorker).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('returns null instead of throwing when the worker fails, without logging any card text', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    mockCreateWorker.mockRejectedValueOnce(new Error('wasm failed to load'));
    const ocr = new PhilhealthOcrService();
    expect(await ocr.read(JPEG)).toBeNull();

    recognize.mockRejectedValueOnce(new Error('bad image'));
    expect(await ocr.read(JPEG)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
