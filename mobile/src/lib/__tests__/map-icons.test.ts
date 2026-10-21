/// <reference types="jest" />
// TypeScript 6 no longer auto-includes @types/*; reference jest here so its
// globals stay out of app code.
import { AMBULANCE_ICON, citizenIconFor } from '../map-icons';

describe('mobile map icons (WP4)', () => {
  it('resolves bundled images for the ambulance and both reporter icons', () => {
    expect(AMBULANCE_ICON).toBeTruthy();
    expect(citizenIconFor('MALE')).toBeTruthy();
    expect(citizenIconFor('FEMALE')).toBeTruthy();
    expect(citizenIconFor('MALE')).not.toBe(citizenIconFor('FEMALE'));
  });

  it.each([null, undefined, 'PREFER_NOT_TO_SAY'])('returns null (neutral pin) for %p', (sex) => {
    expect(citizenIconFor(sex)).toBeNull();
  });
});
