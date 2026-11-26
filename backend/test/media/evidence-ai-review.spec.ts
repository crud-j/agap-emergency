const mockCreate = jest.fn();
const mockOpenAI = jest.fn().mockImplementation(() => ({ responses: { create: (...a: unknown[]) => mockCreate(...a) } }));
// A plain function (not an arrow) so `new OpenAI(...)` works.
jest.mock('openai', () => ({
  __esModule: true,
  default: function OpenAI(...a: unknown[]) { return mockOpenAI(...a); },
}));

import type { ConfigService } from '@nestjs/config';
import { EvidenceAiReviewService } from '../../src/media/evidence-ai-review.service';
import { MediaService } from '../../src/media/media.service';

/** MOD-10 / MOD-25 Tier 2: advisory AI review of incident photo evidence. Never blocks anything. */

function config(values: Record<string, string>): ConfigService {
  return { get: (key: string, fallback?: unknown) => values[key] ?? fallback } as unknown as ConfigService;
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

describe('EvidenceAiReviewService', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockOpenAI.mockClear();
  });

  it('is off without OPENAI_API_KEY: no client, review resolves null', async () => {
    const service = new EvidenceAiReviewService(config({}));
    expect(service.enabled).toBe(false);
    await expect(service.review(JPEG, 'image/jpeg')).resolves.toBeNull();
    expect(mockOpenAI).not.toHaveBeenCalled();
  });

  it('sends the photo as a low-detail image with the screening prompt, and reads the label', async () => {
    mockCreate.mockResolvedValue({ output_text: '{"label":"SUSPICIOUS","reason":"Looks like a photo of a screen."}' });
    const service = new EvidenceAiReviewService(config({ OPENAI_API_KEY: 'test-key' }));

    await expect(service.review(JPEG, 'image/jpeg')).resolves.toEqual({
      label: 'SUSPICIOUS',
      reason: 'Looks like a photo of a screen.',
    });

    const request = mockCreate.mock.calls[0][0];
    expect(request.model).toBe('gpt-4o-mini');
    const [prompt, image] = request.input[0].content;
    expect(prompt.text).toMatch(/genuine, live photo/);
    expect(image).toEqual({ type: 'input_image', detail: 'low', image_url: `data:image/jpeg;base64,${JPEG.toString('base64')}` });
  });

  it('uses OPENAI_EVIDENCE_REVIEW_MODEL when set', async () => {
    mockCreate.mockResolvedValue({ output_text: '{"label":"LIKELY_REAL","reason":"ok"}' });
    const service = new EvidenceAiReviewService(config({ OPENAI_API_KEY: 'k', OPENAI_EVIDENCE_REVIEW_MODEL: 'other-model' }));
    await service.review(JPEG, 'image/jpeg');
    expect(mockCreate.mock.calls[0][0].model).toBe('other-model');
  });

  it('finds the JSON inside extra text, and trims a long reason', async () => {
    mockCreate.mockResolvedValue({ output_text: `Sure:\n{"label":"LIKELY_FAKE","reason":"${'x'.repeat(400)}"}\nDone.` });
    const service = new EvidenceAiReviewService(config({ OPENAI_API_KEY: 'k' }));
    const result = await service.review(JPEG, 'image/png');
    expect(result?.label).toBe('LIKELY_FAKE');
    expect(result?.reason).toHaveLength(300);
  });

  it.each([
    ['no JSON', 'I cannot help with that.'],
    ['an unknown label', '{"label":"REAL","reason":"x"}'],
    ['broken JSON', '{"label": "LIKELY_REAL",'],
    ['an empty answer', ''],
  ])('returns null (no label) for %s', async (_case, text) => {
    mockCreate.mockResolvedValue({ output_text: text });
    const service = new EvidenceAiReviewService(config({ OPENAI_API_KEY: 'k' }));
    await expect(service.review(JPEG, 'image/jpeg')).resolves.toBeNull();
  });

  it('an OpenAI error or outage returns null instead of throwing', async () => {
    mockCreate.mockRejectedValue(new Error('429 quota exceeded'));
    const service = new EvidenceAiReviewService(config({ OPENAI_API_KEY: 'k' }));
    await expect(service.review(JPEG, 'image/jpeg')).resolves.toBeNull();
  });
});

describe('MediaService: photo upload → AI review → dashboard', () => {
  function build(review: jest.Mock, enabled = true) {
    const prisma = {
      incident: { findUnique: jest.fn().mockResolvedValue(null) },
      incidentAttachment: {
        create: jest.fn().mockResolvedValue({ id: 'att-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const realtime = { incidentUpdated: jest.fn() };
    const aiReview = { enabled, review } as unknown as EvidenceAiReviewService;
    const service = new MediaService(prisma as any, config({}), realtime as any, aiReview);
    // No object storage in tests: the upload itself always succeeds.
    (service as any).ensureBucket = jest.fn().mockResolvedValue(undefined);
    (service as any).s3 = { send: jest.fn().mockResolvedValue({}) };
    return { service, prisma, realtime };
  }

  const file = (mimetype: string, originalname: string) =>
    ({ mimetype, originalname, size: 1000, buffer: JPEG }) as Express.Multer.File;
  const settle = () => new Promise((r) => setImmediate(r));

  it('reviews a photo after it is saved, stores the label, and tells the dashboard', async () => {
    const review = jest.fn().mockResolvedValue({ label: 'SUSPICIOUS', reason: 'Screenshot.' });
    const { service, prisma, realtime } = build(review);

    const attachment = await service.uploadIncidentPhoto(file('image/jpeg', 'scene.jpg'), 'inc-1', 'user-1');
    expect(attachment).toEqual({ id: 'att-1' });
    await settle();

    expect(review).toHaveBeenCalledWith(JPEG, 'image/jpeg');
    expect(prisma.incidentAttachment.update).toHaveBeenCalledWith({
      where: { id: 'att-1' },
      data: expect.objectContaining({ ai_review_label: 'SUSPICIOUS', ai_review_reason: 'Screenshot.' }),
    });
    expect(realtime.incidentUpdated).toHaveBeenCalledWith('inc-1', {
      change: 'attachment_ai_reviewed',
      attachmentId: 'att-1',
      aiReviewLabel: 'SUSPICIOUS',
    });
  });

  it('the upload does not wait for the review', async () => {
    let finish: (v: unknown) => void = () => undefined;
    const review = jest.fn().mockReturnValue(new Promise((r) => { finish = r; }));
    const { service, prisma } = build(review);

    await expect(service.uploadIncidentPhoto(file('image/jpeg', 'a.jpg'), 'inc-1')).resolves.toEqual({ id: 'att-1' });
    expect(prisma.incidentAttachment.update).not.toHaveBeenCalled();
    finish(null);
  });

  it('videos are not sent for review', async () => {
    const review = jest.fn();
    const { service } = build(review);
    await service.uploadIncidentPhoto(file('video/mp4', 'clip.mp4'), 'inc-1');
    await settle();
    expect(review).not.toHaveBeenCalled();
  });

  it('review off (no key) or no answer: nothing is written', async () => {
    const off = build(jest.fn(), false);
    await off.service.uploadIncidentPhoto(file('image/jpeg', 'a.jpg'), 'inc-1');
    const silent = build(jest.fn().mockResolvedValue(null));
    await silent.service.uploadIncidentPhoto(file('image/jpeg', 'a.jpg'), 'inc-1');
    await settle();
    expect(off.prisma.incidentAttachment.update).not.toHaveBeenCalled();
    expect(silent.prisma.incidentAttachment.update).not.toHaveBeenCalled();
  });

  it('a failed save of the label never affects the upload', async () => {
    const { service, prisma, realtime } = build(jest.fn().mockResolvedValue({ label: 'LIKELY_REAL', reason: 'ok' }));
    prisma.incidentAttachment.update.mockRejectedValue(new Error('db down'));
    await expect(service.uploadIncidentPhoto(file('image/jpeg', 'a.jpg'), 'inc-1')).resolves.toEqual({ id: 'att-1' });
    await settle();
    expect(realtime.incidentUpdated).not.toHaveBeenCalled();
  });
});
