import type { IdImageRegion } from '@agap/shared';

export interface ImageSize {
  width: number;
  height: number;
}

/** A rectangle in pixels, as tesseract.js takes it. */
export interface PixelRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Larger than any image the scan endpoint accepts (2 MB); anything bigger is a broken header. */
const MAX_SIDE = 20_000;

const size = (width: number, height: number): ImageSize | null =>
  width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE ? { width, height } : null;

/**
 * The pixel size of a JPEG or PNG, from its header only: no pixel data is decoded. null when the header
 * can't be read, and the caller then skips anything that needs the size.
 */
export function imageSize(image: Buffer): ImageSize | null {
  if (image.length >= 24 && image.readUInt32BE(0) === 0x89504e47 && image.toString('ascii', 12, 16) === 'IHDR') {
    return size(image.readUInt32BE(16), image.readUInt32BE(20));
  }
  if (image.length < 4 || image.readUInt8(0) !== 0xff || image.readUInt8(1) !== 0xd8) return null;

  // JPEG: walk the segments to the frame header (SOF0–SOF15, except DHT, JPG and DAC, which share the range).
  let at = 2;
  while (at + 9 <= image.length) {
    if (image.readUInt8(at) !== 0xff) return null;
    const marker = image.readUInt8(at + 1);
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2; // markers with no length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end, or image data, before any frame header
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    // Frame header: length (2), precision (1), height (2), width (2).
    if (isFrame) return size(image.readUInt16BE(at + 7), image.readUInt16BE(at + 5));
    const length = image.readUInt16BE(at + 2);
    if (length < 2) return null;
    at += 2 + length;
  }
  return null;
}

/**
 * A region of the card in pixels, or null when it can't apply: an image taller than wide is a card on its
 * side, where the region would be the wrong part of it.
 */
export function regionInPixels(region: IdImageRegion, image: ImageSize): PixelRegion | null {
  if (image.height > image.width) return null;
  const left = Math.round(image.width * region.left);
  const top = Math.round(image.height * region.top);
  const width = Math.min(Math.round(image.width * region.width), image.width - left);
  const height = Math.min(Math.round(image.height * region.height), image.height - top);
  return width > 0 && height > 0 ? { left, top, width, height } : null;
}
