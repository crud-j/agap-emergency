import { ApiError } from '@/lib/api';
import {
  canReviewLocation,
  coordinateText,
  describeHospitalError,
  formatCoordinates,
  locationStatusBadge,
  parseCoordinate,
  readCoordinates,
  receivingStatusAge,
  roundCoordinate,
} from '@/features/hospitals/location';

// The seeded reference hospital (plan §6).
const JONI = { latitude: 14.79679, longitude: 120.94358 };

describe('hospital location (MOD-39)', () => {
  describe('status badge', () => {
    it.each([
      ['UNVERIFIED', 'Unverified', 'muted'],
      ['PENDING_REVIEW', 'Pending review', 'amber'],
      ['VERIFIED', 'Verified', 'green'],
      ['REJECTED', 'Rejected', 'red'],
    ])('%s → %s (%s)', (status, label, variant) => {
      expect(locationStatusBadge(status)).toEqual({ label, variant });
    });

    it.each([null, undefined, 'SOMETHING_NEW'])('falls back to Unverified for %p', (status) => {
      expect(locationStatusBadge(status)).toEqual({ label: 'Unverified', variant: 'muted' });
    });
  });

  describe('API error messages', () => {
    it('offers the swapped pair back as a suggestion', () => {
      const err = new ApiError('The latitude and longitude appear to be reversed.', 422, {
        code: 'COORDINATES_LIKELY_SWAPPED',
        suggested: { latitude: JONI.latitude, longitude: JONI.longitude },
      });
      const view = describeHospitalError(err);
      expect(view.suggested).toEqual(JONI);
      expect(view.message).toContain('14.7967900, 120.9435800');
    });

    it('ignores a malformed suggestion instead of offering it', () => {
      const err = new ApiError('x', 422, { code: 'COORDINATES_LIKELY_SWAPPED', suggested: { latitude: '14.7' } });
      const view = describeHospitalError(err);
      expect(view.suggested).toBeUndefined();
      expect(view.message).toBe('The latitude and longitude look reversed.');
    });

    it('names the existing hospital on a duplicate', () => {
      const err = new ApiError('Request failed', 409, {
        code: 'DUPLICATE_FACILITY',
        existingFacilityId: '00000000-0000-0000-0002-000000000006',
        existingName: 'DOH — Joni Villanueva General Hospital',
      });
      expect(describeHospitalError(err)).toEqual({
        message: 'This hospital is already registered as "DOH — Joni Villanueva General Hospital".',
      });
    });

    it('handles a duplicate without a name (unique-index race)', () => {
      const err = new ApiError('A matching hospital already exists.', 409, { code: 'DUPLICATE_FACILITY' });
      expect(describeHospitalError(err).message).toBe('A matching hospital is already registered.');
    });

    it('explains an out-of-area location and a verify without coordinates', () => {
      expect(describeHospitalError(new ApiError('x', 422, { code: 'COORDINATES_OUT_OF_SERVICE_AREA' })).message)
        .toContain('outside the AGAP service area');
      expect(describeHospitalError(new ApiError('x', 422, { code: 'LOCATION_MISSING' })).message)
        .toBe('Set the hospital location before verifying it.');
    });

    it('keeps the backend sentence for other errors, joining validation lists', () => {
      expect(describeHospitalError(new ApiError('The organization must be a hospital organization.', 403, {
        message: 'The organization must be a hospital organization.',
      })).message).toBe('The organization must be a hospital organization.');
      expect(describeHospitalError(new ApiError('Request failed', 400, {
        message: ['latitude must not be greater than 90', 'source must be one of the following values'],
      })).message).toBe('latitude must not be greater than 90 source must be one of the following values');
      expect(describeHospitalError(new Error('offline')).message).toBe('offline');
    });
  });

  describe('coordinate input', () => {
    it('accepts up to 7 decimals and rejects more', () => {
      expect(parseCoordinate('14.7967900', 'latitude')).toEqual({ value: 14.79679, error: null });
      expect(parseCoordinate('14.79679001', 'latitude').error).toBe('Use at most 7 decimal places.');
    });

    it('checks the range per axis', () => {
      expect(parseCoordinate('120.94358', 'latitude').error).toBe('The latitude must be between -90 and 90.');
      expect(parseCoordinate('120.94358', 'longitude')).toEqual({ value: 120.94358, error: null });
      expect(parseCoordinate('abc', 'longitude').error).toBe('Enter the longitude as a number.');
    });

    it('rounds map clicks to what the database stores', () => {
      expect(roundCoordinate(14.796790123456)).toBe(14.7967901);
    });

    it('treats both empty as no location and refuses half a location', () => {
      expect(readCoordinates({ latitude: '', longitude: '' })).toEqual({ ok: true, point: null });
      expect(readCoordinates({ latitude: '14.79679', longitude: '' }))
        .toEqual({ ok: false, error: 'Enter both latitude and longitude.' });
      expect(readCoordinates(coordinateText(JONI.latitude, JONI.longitude))).toEqual({ ok: true, point: JONI });
    });

    it('always formats latitude first', () => {
      expect(formatCoordinates(JONI.latitude, JONI.longitude)).toBe('14.7967900, 120.9435800');
    });
  });

  describe('who can be reviewed', () => {
    it.each([
      ['PENDING_REVIEW', null, true],
      ['UNVERIFIED', JONI, true],
      ['UNVERIFIED', null, false],
      ['VERIFIED', JONI, false],
      ['REJECTED', JONI, false],
    ] as const)('%s with %p → %p', (status, point, expected) => {
      expect(canReviewLocation({
        location_status: status,
        latitude: point?.latitude ?? null,
        longitude: point?.longitude ?? null,
      })).toBe(expected);
    });
  });

  // C8: the age shown next to the receiving status; past 12 h the ranking treats it as unknown.
  describe('receiving status age', () => {
    const NOW = Date.parse('2026-10-30T12:00:00Z');
    const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
    it.each([
      [null, 'Never reported', true],
      [ago(0.5), 'Updated within the hour', false],
      [ago(7), 'Updated 7 h ago', false],
      [ago(12), 'Updated 12 h ago', false],
      [ago(12.1), 'Updated 12 h ago', true],
      [ago(72), 'Updated 3 days ago', true],
    ])('%s → %s (stale %s)', (updatedAt, label, stale) => {
      expect(receivingStatusAge(updatedAt, NOW)).toEqual({ label, stale });
    });
  });
});
