import { formatPhotoDate, photoLockedUntil } from '../profile-photo';

describe('photoLockedUntil', () => {
  const now = new Date('2026-11-11T02:00:00Z');

  it('is null with no photo or no lock', () => {
    expect(photoLockedUntil(null, now)).toBeNull();
    expect(photoLockedUntil({ profile_photo_next_change_at: null }, now)).toBeNull();
    expect(photoLockedUntil({}, now)).toBeNull();
  });

  it('returns the date while it is in the future', () => {
    expect(photoLockedUntil({ profile_photo_next_change_at: '2027-04-11T02:00:00.000Z' }, now)).toBe('2027-04-11T02:00:00.000Z');
  });

  it('is null once the date has passed', () => {
    expect(photoLockedUntil({ profile_photo_next_change_at: '2026-11-10T00:00:00.000Z' }, now)).toBeNull();
  });

  it('ignores a malformed date', () => {
    expect(photoLockedUntil({ profile_photo_next_change_at: 'soon' }, now)).toBeNull();
  });
});

describe('formatPhotoDate', () => {
  it('formats in Philippine time', () => {
    // 20:00 UTC on Apr 10 is already Apr 11 in Manila.
    expect(formatPhotoDate('2027-04-10T20:00:00.000Z', 'en')).toMatch(/April 11, 2027/);
  });

  it('is empty for a malformed date', () => {
    expect(formatPhotoDate('nope', 'en')).toBe('');
  });
});
