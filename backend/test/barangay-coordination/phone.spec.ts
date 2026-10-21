import { normalizePhPhone } from '@agap/shared';

describe('normalizePhPhone (MOD-17 barangay directory)', () => {
  describe('mobile numbers', () => {
    it.each([
      ['0961-150-1961', '+639611501961'],
      ['09611501961', '+639611501961'],
      ['+63 961 150 1961', '+639611501961'],
      ['639611501961', '+639611501961'],
      ['9611501961', '+639611501961'],
      ['  0975-707-2301  ', '+639757072301'],
    ])('%s → %s', (raw, e164) => {
      expect(normalizePhPhone(raw)).toEqual({ e164, kind: 'MOBILE', canSms: true });
    });
  });

  describe('landlines (callable, not textable)', () => {
    it.each([
      ['044-6401266', '+63446401266'],
      ['(044) 913-6980', '+63449136980'],
      ['044-309-2956', '+63443092956'],
      ['+63 44 792 4974', '+63447924974'],
      ['02-8123-4567', '+63281234567'],
    ])('%s → %s', (raw, e164) => {
      expect(normalizePhPhone(raw)).toEqual({ e164, kind: 'LANDLINE', canSms: false });
    });
  });

  describe('numbers that must NOT be trusted', () => {
    it('rejects a local number with no area code instead of guessing 044', () => {
      expect(normalizePhPhone('769-2412')).toEqual({
        e164: null,
        kind: 'INVALID',
        canSms: false,
        issue: 'MISSING_AREA_CODE',
      });
    });

    it('rejects the malformed Biñang 1st poster number', () => {
      // "(044) 07924300": extra digit after the area code.
      expect(normalizePhPhone('(044) 07924300')).toMatchObject({
        e164: null,
        kind: 'INVALID',
        issue: 'MALFORMED',
      });
    });

    it.each([
      ['truncated mobile', '0917123456'],
      ['too long mobile', '091712345678'],
      ['letters only', 'call the hall'],
    ])('rejects %s', (_label, raw) => {
      const result = normalizePhPhone(raw);
      expect(result.kind).toBe('INVALID');
      expect(result.e164).toBeNull();
      expect(result.canSms).toBe(false);
    });

    it.each([[''], ['   '], [null], [undefined]])('treats %p as EMPTY', (raw) => {
      expect(normalizePhPhone(raw as string | null | undefined)).toEqual({
        e164: null,
        kind: 'INVALID',
        canSms: false,
        issue: 'EMPTY',
      });
    });
  });
});
