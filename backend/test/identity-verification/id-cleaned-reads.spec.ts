import { HttpException, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { IdVerificationErrorCode } from '@agap/shared';
import { imageSize } from '../../src/identity-verification/id-image-size';
import { CLEANED_READ_TIMEOUT_MS } from '../../src/identity-verification/identity-verification.service';
import { PHILHEALTH_TEXT, file, makeKit } from './id-test-kit';

// MOD-01 — the cleaned reads (id-image-prep) inside a scan. OCR is stubbed; the images are real, so the
// clean-up runs. Invented names and fake numbers only.

const PCN = '0000-0000-0000-0001';
const OTHER_PCN = '0000-0000-0000-0002';

const card = (middle = 'SANTOS', number: string | null = PCN, last = 'DELA CRUZ') =>
  [
    'REPUBLIKA NG PILIPINAS',
    'PAMBANSANG PAGKAKAKILANLAN',
    'Philippine Identification Card',
    ...(number ? [number] : []),
    'Apelyido/Last Name',
    last,
    'Mga Pangalan/Given Names',
    'JUAN',
    'Gitnang Apelyido/Middle Name',
    middle,
    'Petsa ng Kapanganakan/Date of Birth',
  ].join('\n');

const HEADING_NUMBER_ONLY = ['PAMBANSANG PAGKAKAKILANLAN', PCN].join('\n');
const GARBLED = 'g i y L ¥ ] = a Fi';

type Read = { text: string; confidence: number } | null;

const isPng = (image: Buffer) => image.readUInt32BE(0) === 0x89504e47;

describe('cleaned reads in a scan', () => {
  let kit: ReturnType<typeof makeKit>;
  let landscape: Buffer;
  let portrait: Buffer;
  const read = () => kit.ocr.read as unknown as jest.Mock;
  const calls = () => read().mock.calls as Array<[Buffer, string?, object?]>;

  beforeAll(async () => {
    landscape = await sharp({ create: { width: 320, height: 200, channels: 3, background: { r: 250, g: 200, b: 210 } } })
      .jpeg()
      .toBuffer();
    portrait = await sharp(landscape).rotate(90).jpeg().toBuffer();
  });

  beforeEach(() => {
    kit = makeKit({ ID_VERIFICATION_REQUIRED: 'true' });
  });

  const readsInOrder = (...results: Read[]) => {
    read().mockReset();
    results.forEach((result) => read().mockResolvedValueOnce(result));
    read().mockResolvedValue({ text: GARBLED, confidence: 30 });
  };
  const scan = (image: Buffer, documentType: 'NATIONAL_ID' | 'PHILHEALTH' = 'NATIONAL_ID') =>
    kit.service.scan(file(image), { documentType });
  const failureOf = async (run: Promise<unknown>) => {
    const err = await run.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    return ((err as HttpException).getResponse() as { code: string }).code;
  };
  const withWarnings = async (run: () => Promise<unknown>): Promise<string> => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      await run().catch(() => undefined);
      return JSON.stringify(warn.mock.calls);
    } finally {
      warn.mockRestore();
    }
  };

  describe('National ID', () => {
    it('reads the cleaned images first, and stops once two reads agree on the number and the name', async () => {
      readsInOrder({ text: card(), confidence: 50 }, { text: card(), confidence: 70 });
      const result = await scan(landscape);

      expect(result.nameOnId).toEqual({ last: 'DELA CRUZ', first: 'JUAN', middle: 'SANTOS' });
      expect(result.pinLast4).toBe('0001');
      expect(calls()).toHaveLength(2);
      expect(calls().every(([image]) => isPng(image))).toBe(true);
      expect(calls().map(([, layout]) => layout)).toEqual(['block', 'auto']);
      expect(kit.prisma.db.idv[0]).toMatchObject({ status: 'AUTO_VERIFIED', document_type: 'NATIONAL_ID' });
    });

    it('votes each name part across the reads, so one misread letter is outvoted', async () => {
      readsInOrder(
        { text: card('SANTIS'), confidence: 50 },
        { text: card('SANTOS'), confidence: 70 },
        { text: card('SAMTOS'), confidence: 45 },
        { text: card('SANTOS'), confidence: 65 },
      );
      const result = await scan(landscape);
      expect(result.nameOnId).toEqual({ last: 'DELA CRUZ', first: 'JUAN', middle: 'SANTOS' });
      expect(calls()).toHaveLength(4);
    });

    it("doesn't stop on one read's number alone: the next reads must back it up", async () => {
      readsInOrder(
        { text: card(), confidence: 50 },
        { text: card('SANTOS', null), confidence: 70 },
        { text: card(), confidence: 45 },
      );
      await scan(landscape);
      // Reads go in pairs (block and auto at once): the second pair backs the number up.
      expect(calls()).toHaveLength(4);
    });

    it('refuses two reads with different numbers, as for any reads', async () => {
      readsInOrder({ text: card(), confidence: 50 }, { text: card('SANTOS', OTHER_PCN), confidence: 70 });
      expect(await failureOf(scan(landscape))).toBe(IdVerificationErrorCode.UNREADABLE);
      expect(kit.prisma.db.idv).toHaveLength(0);
    });

    it('reads the cleaned images again at 1.3× when 1× did not settle, before any raw read', async () => {
      readsInOrder(
        ...Array(4).fill({ text: HEADING_NUMBER_ONLY, confidence: 50 }),
        { text: card(), confidence: 60 },
        { text: card(), confidence: 70 },
      );
      const result = await scan(landscape);
      expect(result.nameOnId).toMatchObject({ last: 'DELA CRUZ', first: 'JUAN' });
      expect(calls()).toHaveLength(6);
      expect(calls().every(([image]) => isPng(image))).toBe(true);
      expect(imageSize(calls()[0]![0])).toEqual({ width: 320, height: 200 });
      expect(imageSize(calls()[4]![0])).toEqual({ width: 416, height: 260 });
    });

    it('never takes a number that only the 1.3× reads found, even when two of them agree', async () => {
      // Two reads of one resized image once agreed on the same wrong digit.
      const nameOnly = card('SANTOS', null);
      readsInOrder(
        ...Array(4).fill({ text: nameOnly, confidence: 50 }),
        { text: card(), confidence: 60 },
        { text: card(), confidence: 70 },
        { text: nameOnly, confidence: 60 },
        { text: nameOnly, confidence: 60 },
      );
      expect(await failureOf(scan(landscape))).toBe(IdVerificationErrorCode.UNREADABLE);
      // All eight cleaned reads; the heading was seen, so no raw read.
      expect(calls()).toHaveLength(8);
      expect(kit.prisma.db.idv).toHaveLength(0);
    });

    it('a 1.3× number that differs from the 1× number trusts neither', async () => {
      readsInOrder(
        ...Array(4).fill({ text: HEADING_NUMBER_ONLY, confidence: 50 }),
        { text: card('SANTOS', OTHER_PCN), confidence: 60 },
      );
      expect(await failureOf(scan(landscape))).toBe(IdVerificationErrorCode.UNREADABLE);
    });

    it('stops on a clear majority for each name part, not only on agreement by every read', async () => {
      readsInOrder(
        { text: card('SANTOS'), confidence: 50 },
        { text: card('SANTIS'), confidence: 70 },
        { text: card('SANTOS'), confidence: 45 },
      );
      const result = await scan(landscape);
      expect(result.nameOnId).toMatchObject({ middle: 'SANTOS' });
      // 1–1 after the first pair; 2–1 after the second, short of the 1.3× stage.
      expect(calls()).toHaveLength(4);
    });

    it('falls back to the raw image when the cleaned reads miss, and the raw read alone decides "wrong card"', async () => {
      // Cleaned reads are confident garbage; the raw read is unsure: unreadable, not the wrong card.
      readsInOrder(
        ...Array(8).fill({ text: GARBLED, confidence: 90 }),
        { text: GARBLED, confidence: 30 },
        { text: GARBLED, confidence: 30 },
      );
      expect(await failureOf(scan(landscape))).toBe(IdVerificationErrorCode.UNREADABLE);
      expect(calls()).toHaveLength(10);
      expect(calls().slice(0, 8).every(([image]) => isPng(image))).toBe(true);
      expect(calls().slice(8).every(([image]) => image === landscape)).toBe(true);
      expect(calls()[8]).toHaveLength(1);

      // A confident raw read with no heading is the wrong card, as before.
      readsInOrder(...Array(8).fill({ text: GARBLED, confidence: 30 }), { text: PHILHEALTH_TEXT, confidence: 80 }, { text: PHILHEALTH_TEXT, confidence: 80 });
      expect(await failureOf(scan(landscape))).toBe(IdVerificationErrorCode.NOT_NATIONAL_ID);
    });

    it('skips the slow raw reads once a cleaned read saw the heading', async () => {
      readsInOrder(...Array(8).fill({ text: card('SANTOS', null), confidence: 50 }));
      expect(await failureOf(scan(landscape))).toBe(IdVerificationErrorCode.UNREADABLE);
      expect(calls()).toHaveLength(8);
      expect(calls().some(([image]) => image === landscape)).toBe(false);
    });

    it('a whole but unsettled card skips the raw reads', async () => {
      // One read with the name, so the name has no second vote: whole, never settled.
      readsInOrder({ text: card(), confidence: 50 }, ...Array(7).fill({ text: HEADING_NUMBER_ONLY, confidence: 50 }));
      const result = await scan(landscape);
      expect(result.pinLast4).toBe('0001');
      expect(calls()).toHaveLength(8);
    });

    it('stops the cleaned reads when one fails or times out', async () => {
      readsInOrder({ text: GARBLED, confidence: 50 }, null, { text: card(), confidence: 40 }, { text: GARBLED, confidence: 30 });
      await scan(landscape);
      // One pair of cleaned reads, then raw (no heading seen): no more cleaned reads after a failed one.
      expect(calls()).toHaveLength(3);
      expect(calls()[2]![0]).toBe(landscape);
    });

    it('reads the name column from the cleaned image, measured in its pixels', async () => {
      readsInOrder(
        ...Array(8).fill({ text: HEADING_NUMBER_ONLY, confidence: 50 }),
        { text: card(), confidence: 60 },
      );
      const result = await scan(landscape);
      expect(result.nameOnId).toMatchObject({ last: 'DELA CRUZ' });
      expect(calls()).toHaveLength(9);
      const [image, layout, region] = calls()[8]!;
      expect(isPng(image)).toBe(true);
      expect(layout).toBe('block');
      expect(region).toEqual({ left: 138, top: 56, width: 182, height: 94 });
    });

    it('reads block and auto at once, each with the short timeout', async () => {
      let releaseBlock!: (read: Read) => void;
      read().mockReset();
      read()
        .mockImplementationOnce(() => new Promise<Read>((resolve) => (releaseBlock = resolve)))
        .mockResolvedValueOnce({ text: card(), confidence: 70 })
        .mockResolvedValue({ text: card(), confidence: 60 });
      const pending = scan(landscape);
      // Wait for the image prep; a sequential read would never make the second call while the first is pending.
      for (let i = 0; i < 300 && calls().length < 2; i++) await new Promise((resolve) => setTimeout(resolve, 10));
      // The auto read started while the block read is still running.
      expect(calls().map(([, layout]) => layout)).toEqual(['block', 'auto']);
      releaseBlock({ text: card(), confidence: 50 });
      await pending;
      expect(calls().every((call) => call[3] === CLEANED_READ_TIMEOUT_MS)).toBe(true);
    });

    it('starts no new read once the time budget is spent', async () => {
      let now = 1_000_000;
      const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
      try {
        read().mockReset();
        // Each read "takes" 7 s; nothing ever settles.
        read().mockImplementation(async () => {
          now += 7_000;
          return { text: HEADING_NUMBER_ONLY, confidence: 50 };
        });
        await failureOf(scan(landscape));
        // The first pair (14 s of reads) passes the 12 s budget: no second pair, no 1.3×, no raw. Only the
        // name-column read (a small region, well under a second) still runs.
        expect(calls()).toHaveLength(3);
        expect(calls()[2]![2]).toEqual({ left: 138, top: 56, width: 182, height: 94 });
      } finally {
        clock.mockRestore();
      }
    });

    it('turns a card on its side the way whose read looks like the card', async () => {
      readsInOrder(
        { text: GARBLED, confidence: 60 }, // turned 90°
        { text: card(), confidence: 40 }, // turned 270°: heading wins over confidence
        { text: card(), confidence: 70 },
      );
      const result = await scan(portrait);
      expect(result.pinLast4).toBe('0001');
      const [first, second] = calls();
      for (const [image] of [first!, second!]) expect(imageSize(image)).toEqual({ width: 320, height: 200 });
      expect(calls()).toHaveLength(3);
    });

    it('logs the reads by name, and no name, number or card text', async () => {
      readsInOrder(
        { text: HEADING_NUMBER_ONLY, confidence: 50 },
        { text: card('SANTOS'), confidence: 70 },
        { text: card('SANTOS'), confidence: 65 },
      );
      const logged = await withWarnings(() => scan(landscape));
      expect(logged).toContain('cleaned=yes');
      expect(logged).toContain('turned=0');
      expect(logged).toContain('nameVotes=last=2/2,first=2/2,middle=2/2');
      expect(logged).toContain('clean/block[conf=50');
      expect(logged).toContain('clean/auto[conf=70');
      expect(logged).toContain('outcome=passed after 4 reads');
      for (const secret of ['DELA', 'CRUZ', 'JUAN', 'SANTOS', '0001', 'PAMBANSANG']) expect(logged).not.toContain(secret);
    });
  });

  describe('PhilHealth', () => {
    it('reads the uploaded image first, exactly as before, and passes without a cleaned read', async () => {
      readsInOrder({ text: PHILHEALTH_TEXT, confidence: 80 });
      await scan(landscape, 'PHILHEALTH');
      expect(calls()).toHaveLength(1);
      expect(calls()[0]).toEqual([landscape]);
    });

    it('falls back to the cleaned reads only when both raw reads fail', async () => {
      readsInOrder(
        { text: GARBLED, confidence: 30 },
        { text: GARBLED, confidence: 30 },
        { text: PHILHEALTH_TEXT, confidence: 60 },
        { text: PHILHEALTH_TEXT, confidence: 70 },
      );
      const result = await scan(landscape, 'PHILHEALTH');
      expect(result.pinLast4).toBe('0010');
      expect(calls().slice(0, 2).every(([image]) => image === landscape)).toBe(true);
      expect(calls().slice(2).every(([image]) => isPng(image))).toBe(true);
    });
  });
});
