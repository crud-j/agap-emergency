/// <reference types="jest" />
// TypeScript 6 no longer auto-includes @types/*; reference jest here so its
// globals stay out of app code.
import { AMBULANCE_ICON } from '../map-icons';

describe('mobile map icons (WP4)', () => {
  it('resolves the bundled ambulance image', () => {
    expect(AMBULANCE_ICON).toBeTruthy();
  });
});
