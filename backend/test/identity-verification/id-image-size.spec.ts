import { ID_DOCUMENT_RULES } from '@agap/shared';
import { imageSize, regionInPixels } from '../../src/identity-verification/id-image-size';
import { JPEG, PNG, jpegOfSize } from './id-test-kit';

function pngOfSize(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

describe('imageSize: from the header only', () => {
  it('reads a PNG', () => {
    expect(imageSize(pngOfSize(1600, 1008))).toEqual({ width: 1600, height: 1008 });
  });

  it('reads a baseline and a progressive JPEG, past the Huffman table that shares the frame range', () => {
    expect(imageSize(jpegOfSize(1600, 1008))).toEqual({ width: 1600, height: 1008 });
    expect(imageSize(jpegOfSize(1280, 806, 0xc2))).toEqual({ width: 1280, height: 806 });
  });

  it('skips fill bytes between segments', () => {
    const jpeg = jpegOfSize(800, 504);
    const filled = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xff]), jpeg.subarray(2)]);
    expect(imageSize(filled)).toEqual({ width: 800, height: 504 });
  });

  it('gives null when it cannot tell: the test stubs, a cut-off header, image data before any frame, zero size', () => {
    expect(imageSize(JPEG)).toBeNull();
    expect(imageSize(PNG)).toBeNull();
    expect(imageSize(jpegOfSize(1600, 1008).subarray(0, 40))).toBeNull();
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 8, 1, 2, 3, 4, 5, 6]))).toBeNull();
    expect(imageSize(jpegOfSize(0, 1008))).toBeNull();
    expect(imageSize(Buffer.alloc(0))).toBeNull();
    expect(imageSize(Buffer.from('not an image at all'))).toBeNull();
  });
});

describe('regionInPixels', () => {
  const region = ID_DOCUMENT_RULES.NATIONAL_ID.nameRegion!;

  it("turns the National ID's name column into pixels", () => {
    expect(regionInPixels(region, { width: 1600, height: 1008 })).toEqual({ left: 688, top: 282, width: 912, height: 474 });
  });

  it('stays inside the image', () => {
    const px = regionInPixels({ left: 0.9, top: 0.9, width: 0.5, height: 0.5 }, { width: 100, height: 60 })!;
    expect(px.left + px.width).toBeLessThanOrEqual(100);
    expect(px.top + px.height).toBeLessThanOrEqual(60);
  });

  it('does not apply to an image taller than wide: the card is on its side', () => {
    expect(regionInPixels(region, { width: 1008, height: 1600 })).toBeNull();
  });
});

describe('the National ID name column (measured layout)', () => {
  const region = ID_DOCUMENT_RULES.NATIONAL_ID.nameRegion!;

  it('leaves out the photos and the card number, and holds the labels down to the birth date label', () => {
    expect(region.left).toBeGreaterThan(0.4); // right of the ghost photo, which ends about 40% across
    expect(region.left).toBeLessThan(0.46); // the labels start about 46% across
    expect(region.top).toBeLessThan(0.33); // the last-name label starts about 33% down
    expect(region.top + region.height).toBeGreaterThan(0.71); // past the middle-name value (about 70%)
    expect(region.top + region.height).toBeLessThanOrEqual(0.76); // the birth date value starts about 76% down
    expect(region.left + region.width).toBeLessThanOrEqual(1);
  });

  it('only the National ID has one: a PhilHealth ID is read whole, as before', () => {
    expect(ID_DOCUMENT_RULES.PHILHEALTH.nameRegion).toBeNull();
  });
});
