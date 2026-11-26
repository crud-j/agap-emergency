import { guestDetailOf } from '@/components/admin/SecurityEvents';

describe('Security Events: guest report details', () => {
  it('a repeat shows the phone code and how many came from this network at this place', () => {
    expect(guestDetailOf({ device: 'a1b2c3d4', networkReports10m: 2, samePlaceReports10m: 2 })).toBe(
      'Phone a1b2c3d4 · 2 from this network at this place in 10 min · 2 from this network in 10 min',
    );
  });

  it('a first report shows only the phone code', () => {
    expect(guestDetailOf({ device: 'a1b2c3d4', networkReports10m: 1, samePlaceReports10m: 1 })).toBe('Phone a1b2c3d4');
  });

  it('a refusal names the limit', () => {
    expect(guestDetailOf({ reason: 'LIMIT_SPOT', limit: 3, windowMinutes: 10, device: 'ffff0000' })).toBe(
      'Same place, same network · limit 3 per 10 min · Phone ffff0000',
    );
  });

  it('nothing known → a dash', () => {
    expect(guestDetailOf({})).toBe('—');
  });
});
