import { isCoordinateInBocaue } from '@agap/shared';

describe('isCoordinateInBocaue', () => {
  it('accepts a point inside Bocaue', () => {
    expect(isCoordinateInBocaue(14.7969, 120.9268)).toBe(true);
  });

  it('rejects a point outside the municipal polygon but inside its rectangular bounds', () => {
    expect(isCoordinateInBocaue(14.765, 120.906)).toBe(false);
  });

  it('rejects coordinates outside the municipality bounds and non-finite values', () => {
    expect(isCoordinateInBocaue(14.75, 120.93)).toBe(false);
    expect(isCoordinateInBocaue(Number.NaN, 120.9268)).toBe(false);
  });
});
