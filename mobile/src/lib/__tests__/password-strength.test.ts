import { passwordStrength } from '../password-strength';

describe('passwordStrength', () => {
  it('is level 0 with nothing to fix when empty', () => {
    expect(passwordStrength('')).toEqual({ level: 0, meetsAll: false, nextRule: null });
  });

  it('is strong only when every registration rule is met', () => {
    expect(passwordStrength('Abcdef1!')).toEqual({ level: 4, meetsAll: true, nextRule: null });
    // Long and varied, but no symbol: the form would refuse it, so it isn't strong.
    expect(passwordStrength('Abcdefghijkl123')).toMatchObject({ level: 3, meetsAll: false, nextRule: 'symbol' });
  });

  it('drops a level for each rule not met', () => {
    expect(passwordStrength('abcdefg1!').level).toBe(3); // no uppercase
    expect(passwordStrength('abcdefgh!').level).toBe(2); // no uppercase, no number
    expect(passwordStrength('abcdefgh').level).toBe(1); // only length and lowercase
    expect(passwordStrength('a').level).toBe(1);
  });

  it('names the first rule not met, in the order the hints are shown', () => {
    expect(passwordStrength('Ab1!').nextRule).toBe('length');
    expect(passwordStrength('ABCDEFG1!').nextRule).toBe('lowercase');
    expect(passwordStrength('abcdefg1!').nextRule).toBe('uppercase');
    expect(passwordStrength('Abcdefgh!').nextRule).toBe('number');
    expect(passwordStrength('Abcdefgh1').nextRule).toBe('symbol');
  });

  it("doesn't count a space as a symbol, as the form doesn't", () => {
    expect(passwordStrength('Abcdefg 1').nextRule).toBe('symbol');
  });

  it('asks for a shorter password past 128 characters, and never calls it strong', () => {
    const long = `Aa1!${'x'.repeat(130)}`;
    expect(passwordStrength(long)).toEqual({ level: 3, meetsAll: false, nextRule: 'maximum' });
  });
});
