import type { MapRef } from 'react-map-gl/maplibre';
import { resolveMissingStyleImages } from '@/components/map/missing-style-images';

/** Just enough of a MapLibre map for the resolver. */
function fakeMap(existing: string[] = []) {
  const images = new Set(existing);
  let resolver: ((id: string) => void) | null = null;
  const map = {
    setMissingStyleImageResolver: jest.fn((r: (id: string) => void) => { resolver = r; }),
    hasImage: (id: string) => images.has(id),
    addImage: jest.fn((id: string) => { images.add(id); }),
  };
  return { map, ref: { getMap: () => map } as unknown as MapRef, resolve: (id: string) => resolver!(id) };
}

describe('resolveMissingStyleImages (MapTiler Streets warnings)', () => {
  it('registers a transparent SDF placeholder, so it can share a layer with the SDF sprite icons', () => {
    const { map, ref, resolve } = fakeMap();
    resolveMissingStyleImages(ref);
    resolve('exit_2');
    expect(map.addImage).toHaveBeenCalledWith(
      'exit_2',
      { width: 1, height: 1, data: new Uint8Array(4) },
      { sdf: true },
    );
  });

  it('resolves " " (the style\'s "no icon" on town labels)', () => {
    const { map, ref, resolve } = fakeMap();
    resolveMissingStyleImages(ref);
    resolve(' ');
    expect(map.addImage).toHaveBeenCalledWith(' ', expect.anything(), { sdf: true });
  });

  it('ignores an empty id and an image that already exists', () => {
    const { map, ref, resolve } = fakeMap(['hospital']);
    resolveMissingStyleImages(ref);
    resolve('');
    resolve('hospital');
    expect(map.addImage).not.toHaveBeenCalled();
  });

  it('installs once per map', () => {
    const { map, ref } = fakeMap();
    resolveMissingStyleImages(ref);
    resolveMissingStyleImages(ref);
    expect(map.setMissingStyleImageResolver).toHaveBeenCalledTimes(1);
  });
});
