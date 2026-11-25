/// <reference types="jest" />

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  deleteItemAsync: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));
const mockSetPushToken = jest.fn();
jest.mock('../../api/guest-report.api', () => ({ setGuestReportPushToken: (...a: unknown[]) => mockSetPushToken(...a) }));
const mockDeviceToken = jest.fn();
jest.mock('../../push/push-registration', () => ({ getDevicePushToken: (...a: unknown[]) => mockDeviceToken(...a) }));

import {
  clearSavedGuestReport, enableGuestReportPush, loadSavedGuestReport, saveGuestReport,
} from '../saved-guest-report';
import { guestStatusText } from '../../../components/guest-report/guest-status-text';

const NOW = new Date('2026-11-25T08:00:00Z');
const DAY = 24 * 60 * 60_000;

describe('saved guest report (MOD-42)', () => {
  beforeEach(() => mockStore.clear());

  it('saves and loads the report this phone follows', async () => {
    await saveGuestReport({ token: 't'.repeat(43), publicReference: 'INC-2026-000200' }, NOW);

    await expect(loadSavedGuestReport(new Date(NOW.getTime() + DAY))).resolves.toEqual({
      token: 't'.repeat(43),
      publicReference: 'INC-2026-000200',
      savedAt: NOW.toISOString(),
    });
  });

  it('drops a report older than 7 days (the server token has expired too)', async () => {
    await saveGuestReport({ token: 't'.repeat(43), publicReference: 'INC-2026-000200' }, NOW);

    await expect(loadSavedGuestReport(new Date(NOW.getTime() + 7 * DAY))).resolves.toBeNull();
    expect(mockStore.size).toBe(0);
  });

  it('drops unreadable data instead of throwing', async () => {
    mockStore.set('agap.guest_report.v1', '{not json');
    await expect(loadSavedGuestReport(NOW)).resolves.toBeNull();
  });

  it('clear removes it', async () => {
    await saveGuestReport({ token: 't'.repeat(43), publicReference: 'INC-2026-000200' }, NOW);
    await clearSavedGuestReport();
    await expect(loadSavedGuestReport(NOW)).resolves.toBeNull();
  });
});

describe('enableGuestReportPush', () => {
  beforeEach(() => {
    mockSetPushToken.mockReset().mockResolvedValue({ pushEnabled: true });
    mockDeviceToken.mockReset();
  });

  it('registers this phone’s token for the report', async () => {
    mockDeviceToken.mockResolvedValue('fcm-device');

    await expect(enableGuestReportPush('tok')).resolves.toBe(true);
    expect(mockDeviceToken).toHaveBeenCalledWith({ requestPermission: true });
    expect(mockSetPushToken).toHaveBeenCalledWith('tok', 'fcm-device');
  });

  it('resolves false when notifications are not allowed', async () => {
    mockDeviceToken.mockResolvedValue(null);

    await expect(enableGuestReportPush('tok')).resolves.toBe(false);
    expect(mockSetPushToken).not.toHaveBeenCalled();
  });

  it('resolves false instead of throwing when the server cannot be reached', async () => {
    mockDeviceToken.mockResolvedValue('fcm-device');
    mockSetPushToken.mockRejectedValue(new Error('offline'));

    await expect(enableGuestReportPush('tok')).resolves.toBe(false);
  });
});

describe('guestStatusText', () => {
  it('says "accepted" once a dispatcher acknowledges', () => {
    expect(guestStatusText('ACKNOWLEDGED').title).toBe('Report accepted');
  });

  it.each(['CANCELLED', 'FALSE_ALERT', 'UNABLE_TO_RESPOND'])('%s points to the hotlines', (status) => {
    const text = guestStatusText(status);
    expect(text.tone).toBe('warn');
    expect(text.body).toMatch(/911/);
  });

  it('never promises an arrival time (Rule 13)', () => {
    for (const s of ['DISPATCHED', 'EN_ROUTE', 'ON_SCENE']) {
      expect(guestStatusText(s).body).not.toMatch(/\bmin(ute)?s?\b|arrive in/i);
    }
  });

  it('falls back for an unknown status', () => {
    expect(guestStatusText('SOMETHING_NEW').title).toBe('Report sent');
  });
});
