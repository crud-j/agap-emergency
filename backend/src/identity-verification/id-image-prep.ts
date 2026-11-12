import sharp from 'sharp';
import type { ImageSize } from './id-image-size';

/**
 * Cleaned copies of one ID image for OCR. Built in memory only: nothing is written to disk or logged, and
 * the copies are as sensitive as the image itself.
 */
export interface PreparedIdImage {
  /** The image the right way up (its EXIF orientation applied). The original bytes when it had none. */
  upright: Buffer;
  /** Grey PNG keeping only dark ink: each pixel's brightest channel, with lighting flattened. */
  clean: Buffer;
  /** `clean` thresholded to black and white (Otsu). */
  binary: Buffer;
  /** Size of `clean` and `binary`, which may be turned a quarter from `upright`. */
  size: ImageSize;
}

/** ID-1 cards (both IDs) are landscape. An image taller than wide holds the card on its side. */
export type QuarterTurn = 0 | 90 | 270;

/** Lighting is estimated with a blur this fraction of the short side: wider than a letter, narrower than a wave. */
const BACKGROUND_BLUR_FRACTION = 1 / 40;
/** Flattened paper lands here, leaving headroom below white so faint ink keeps some contrast. */
const PAPER_LEVEL = 235;

/** Whether an EXIF orientation (1–8) asks for any turn or flip; 1 and none mean the pixels are already upright. */
function hasOrientation(orientation: number | undefined): boolean {
  return orientation !== undefined && orientation !== 1;
}

/**
 * Darkest-ink grey: each pixel's brightest channel. Black and navy print is dark in every channel and stays
 * dark; the National ID's pink and blue waves and its coloured fine-line background are bright in at least one
 * channel and fade toward paper. Plain greyscale keeps them as mid-grey, which Tesseract reads as text.
 */
function inkGrey(rgb: Buffer, channels: number, pixels: number): Buffer {
  const grey = Buffer.alloc(pixels);
  for (let i = 0, j = 0; j < pixels; i += channels, j++) {
    const r = rgb[i] ?? 0;
    const g = rgb[i + 1] ?? r;
    const b = rgb[i + 2] ?? r;
    grey[j] = r > g ? (r > b ? r : b) : g > b ? g : b;
  }
  return grey;
}

/** Divide by a heavy blur, so shadows, glare gradients and the card's broad colour bands flatten to paper. */
async function flattenLighting(grey: Buffer, size: ImageSize): Promise<Buffer> {
  const sigma = Math.max(8, Math.round(Math.min(size.width, size.height) * BACKGROUND_BLUR_FRACTION));
  const background = await sharp(grey, { raw: { width: size.width, height: size.height, channels: 1 } })
    .blur(sigma)
    .raw()
    .toBuffer();
  const out = Buffer.alloc(grey.length);
  for (let i = 0; i < grey.length; i++) {
    out[i] = Math.min(255, Math.round(((grey[i] ?? 0) / Math.max(background[i] ?? 0, 1)) * PAPER_LEVEL));
  }
  return out;
}

/** Otsu's threshold: the grey level that best splits the histogram in two. Untuned, so no card is special. */
export function otsuThreshold(grey: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0);
  for (const value of grey) histogram[value] = (histogram[value] ?? 0) + 1;
  let total = 0;
  for (let level = 0; level < 256; level++) total += level * (histogram[level] ?? 0);

  let backgroundWeight = 0;
  let backgroundSum = 0;
  let best = 0;
  let threshold = 127;
  for (let level = 0; level < 256; level++) {
    const count = histogram[level] ?? 0;
    backgroundWeight += count;
    if (backgroundWeight === 0) continue;
    const foregroundWeight = grey.length - backgroundWeight;
    if (foregroundWeight === 0) break;
    backgroundSum += level * count;
    const meanGap = backgroundSum / backgroundWeight - (total - backgroundSum) / foregroundWeight;
    const between = backgroundWeight * foregroundWeight * meanGap * meanGap;
    if (between > best) {
      best = between;
      threshold = level;
    }
  }
  return threshold;
}

/** Width of an ID-1 card (both IDs), in inches: 85.6 mm. */
const CARD_WIDTH_INCHES = 85.6 / 25.4;

/**
 * The image's real resolution, from the card filling its width. Written into the PNG because sharp otherwise
 * writes 1000 px/m (25 dpi): Tesseract then rejects it, assumes 70 dpi, takes every letter for a giant, finds
 * no lines in automatic layout and can run until the read times out.
 */
export function cardDpi(width: number): number {
  return Math.round(width / CARD_WIDTH_INCHES);
}

const greyPng = (grey: Buffer, size: ImageSize): Promise<Buffer> =>
  sharp(grey, { raw: { width: size.width, height: size.height, channels: 1 } })
    .withMetadata({ density: cardDpi(size.width) })
    .png({ compressionLevel: 1 })
    .toBuffer();

/**
 * The image the right way up, plus whether it is portrait (the card on its side). null when the image can't be
 * decoded: the caller then reads the original bytes only, as before this module existed.
 */
export async function uprightIdImage(image: Buffer): Promise<{ upright: Buffer; portrait: boolean } | null> {
  try {
    const meta = await sharp(image).metadata();
    if (!meta.width || !meta.height) return null;
    // EXIF orientations 5–8 swap width and height.
    const swapped = meta.orientation !== undefined && meta.orientation >= 5;
    const width = swapped ? meta.height : meta.width;
    const height = swapped ? meta.width : meta.height;
    const upright = hasOrientation(meta.orientation) ? await sharp(image).rotate().jpeg({ quality: 95 }).toBuffer() : image;
    return { upright, portrait: height > width };
  } catch {
    return null;
  }
}

/** The image turned a quarter, as a JPEG for a raw read. null when it can't be decoded. Never throws. */
export async function turnIdImage(image: Buffer, turn: QuarterTurn): Promise<Buffer | null> {
  try {
    return await sharp(image).rotate(turn).jpeg({ quality: 95 }).toBuffer();
  } catch {
    return null;
  }
}

/**
 * Cleaned copies of an upright image, turned `turn` degrees clockwise first (a portrait card needs 90 or 270),
 * then resized by `scale`. null when the image can't be decoded. Never throws.
 */
export async function prepareIdImage(upright: Buffer, turn: QuarterTurn = 0, scale = 1): Promise<PreparedIdImage | null> {
  try {
    let pipeline = sharp(upright).rotate(turn);
    if (scale !== 1) {
      const meta = await sharp(upright).metadata();
      const width = turn === 0 ? meta.width : meta.height;
      if (!width) return null;
      // sharp turns before it resizes, so the width given is the turned image's. No re-encode in between.
      pipeline = pipeline.resize(Math.round(width * scale), null, { kernel: 'lanczos3' });
    }
    const { data, info } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const size = { width: info.width, height: info.height };
    const flat = await flattenLighting(inkGrey(data, info.channels, size.width * size.height), size);
    const threshold = otsuThreshold(flat);
    const binary = Buffer.alloc(flat.length);
    for (let i = 0; i < flat.length; i++) binary[i] = (flat[i] ?? 0) > threshold ? 255 : 0;
    const [clean, binaryPng] = await Promise.all([greyPng(flat, size), greyPng(binary, size)]);
    return { upright, clean, binary: binaryPng, size };
  } catch {
    return null;
  }
}
