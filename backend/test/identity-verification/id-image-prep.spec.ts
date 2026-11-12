import sharp from 'sharp';
import { otsuThreshold, prepareIdImage, turnIdImage, uprightIdImage } from '../../src/identity-verification/id-image-prep';
import { imageSize } from '../../src/identity-verification/id-image-size';
import { JPEG } from './id-test-kit';

// Image clean-up before OCR. Synthetic images only: coloured bands and black blocks standing in for a card's
// background print and its text. No card, real or invented, is drawn.

const PINK = { r: 255, g: 182, b: 193 };
const BLUE = { r: 110, g: 160, b: 255 };
const INK = { r: 20, g: 20, b: 30 };

/** 400×250: pink left half, blue right half, and a black block in each. */
async function bandedCard(width = 400, height = 250): Promise<Buffer> {
  const block = (color: typeof INK) => sharp({ create: { width: 60, height: 20, channels: 3, background: color } }).png().toBuffer();
  const half = (color: typeof PINK) => sharp({ create: { width: width / 2, height, channels: 3, background: color } }).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: PINK } })
    .composite([
      { input: await half(PINK), left: 0, top: 0 },
      { input: await half(BLUE), left: width / 2, top: 0 },
      { input: await block(INK), left: 60, top: 100 },
      { input: await block(INK), left: 280, top: 100 },
    ])
    .jpeg({ quality: 95 })
    .toBuffer();
}

/** Mean grey of a rectangle of a single-channel PNG. */
async function meanGrey(png: Buffer, left: number, top: number, width: number, height: number): Promise<number> {
  const data = await sharp(png).extract({ left, top, width, height }).greyscale().raw().toBuffer();
  return data.reduce((sum, value) => sum + value, 0) / data.length;
}

describe('otsuThreshold', () => {
  it('splits two grey levels between them', () => {
    const grey = Uint8Array.from([...Array(50).fill(40), ...Array(50).fill(220)]);
    const t = otsuThreshold(grey);
    expect(t).toBeGreaterThanOrEqual(40);
    expect(t).toBeLessThan(220);
  });

  it('does not fail on a flat image', () => {
    expect(otsuThreshold(new Uint8Array(100).fill(128))).toBeGreaterThanOrEqual(0);
  });
});

describe('uprightIdImage', () => {
  it('is null for bytes that are not a decodable image, so the caller reads the original', async () => {
    expect(await uprightIdImage(JPEG)).toBeNull();
    expect(await uprightIdImage(Buffer.from('not an image'))).toBeNull();
  });

  it('keeps the original bytes when no EXIF turn is set', async () => {
    const card = await bandedCard();
    const result = await uprightIdImage(card);
    expect(result?.upright).toBe(card);
    expect(result?.portrait).toBe(false);
  });

  it("applies the EXIF orientation, so a phone photo stored sideways is read the right way up", async () => {
    // Stored 400×250 with orientation 6 ("turn 90° clockwise to view"): shown 250×400.
    const stored = await sharp(await bandedCard()).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const result = await uprightIdImage(stored);
    expect(result?.upright).not.toBe(stored);
    expect(imageSize(result!.upright)).toEqual({ width: 250, height: 400 });
    expect(result?.portrait).toBe(true);
  });

  it('calls a taller-than-wide image portrait: the card on its side', async () => {
    const tall = await sharp(await bandedCard()).rotate(90).jpeg().toBuffer();
    expect((await uprightIdImage(tall))?.portrait).toBe(true);
  });
});

describe('prepareIdImage', () => {
  it('is null for an image it cannot decode, and never throws', async () => {
    expect(await prepareIdImage(JPEG)).toBeNull();
  });

  it('fades pink and blue print toward paper but keeps black ink dark', async () => {
    const card = await bandedCard();
    const prepared = await prepareIdImage(card);
    expect(prepared).not.toBeNull();
    const { clean, size } = prepared!;
    expect(size).toEqual({ width: 400, height: 250 });

    // Plain greyscale keeps the blue band mid-grey, which OCR takes for text.
    const plain = await sharp(card).greyscale().png().toBuffer();
    expect(await meanGrey(plain, 300, 20, 60, 40)).toBeLessThan(180);

    expect(await meanGrey(clean, 30, 20, 60, 40)).toBeGreaterThan(200); // pink band
    expect(await meanGrey(clean, 300, 20, 60, 40)).toBeGreaterThan(200); // blue band
    expect(await meanGrey(clean, 70, 105, 40, 10)).toBeLessThan(80); // ink on pink
    expect(await meanGrey(clean, 290, 105, 40, 10)).toBeLessThan(80); // ink on blue
  });

  it('makes a black-and-white copy with ink black and the bands white', async () => {
    const { binary } = (await prepareIdImage(await bandedCard()))!;
    const values = new Set(await sharp(binary).greyscale().raw().toBuffer());
    expect([...values].every((value) => value === 0 || value === 255)).toBe(true);
    expect(await meanGrey(binary, 300, 20, 60, 40)).toBe(255);
    expect(await meanGrey(binary, 290, 105, 40, 10)).toBe(0);
  });

  it('turns the image a quarter first when asked, for a card on its side', async () => {
    const tall = await sharp(await bandedCard()).rotate(90).jpeg().toBuffer();
    const prepared = await prepareIdImage(tall, 270);
    expect(prepared?.size).toEqual({ width: 400, height: 250 });
    expect(imageSize(prepared!.clean)).toEqual({ width: 400, height: 250 });
  });

  it('resizes by the scale after turning', async () => {
    const card = await bandedCard();
    expect((await prepareIdImage(card, 0, 1.3))?.size).toEqual({ width: 520, height: 325 });
    const tall = await sharp(card).rotate(90).jpeg().toBuffer();
    expect((await prepareIdImage(tall, 270, 1.3))?.size).toEqual({ width: 520, height: 325 });
  });

  it('returns PNGs, which are never mistaken for the uploaded JPEG', async () => {
    const { clean, binary } = (await prepareIdImage(await bandedCard()))!;
    for (const png of [clean, binary]) expect(png.readUInt32BE(0)).toBe(0x89504e47);
  });
});

describe('turnIdImage', () => {
  it('turns a quarter, and is null for an undecodable image', async () => {
    const turned = await turnIdImage(await bandedCard(), 90);
    expect(imageSize(turned!)).toEqual({ width: 250, height: 400 });
    expect(await turnIdImage(JPEG, 90)).toBeNull();
  });
});
