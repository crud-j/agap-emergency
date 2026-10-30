/// <reference types="jest" />
import { RESPONDER_SIGNAL_LOST_MS } from '@agap/shared';
import { LOCATION_HEARTBEAT_MS, isHeartbeatDue } from '../useResponderLocationShare';

jest.mock('expo-location', () => ({}));
jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn(),
}));

// A stopped unit gets no watch updates (15 m distance filter). The heartbeat keeps
// it from showing as "signal lost" on the console and keeps its server route alive.
describe('responder location heartbeat', () => {
  const NOW = 1_000_000;

  it('is due once no fix has been sent for 20 s', () => {
    expect(isHeartbeatDue(NOW - LOCATION_HEARTBEAT_MS, NOW)).toBe(true);
    expect(isHeartbeatDue(NOW - 45_000, NOW)).toBe(true);
    expect(isHeartbeatDue(0, NOW)).toBe(true);
  });

  it('is not due while the watch is sending (the unit is moving)', () => {
    expect(isHeartbeatDue(NOW - 5_000, NOW)).toBe(false);
    expect(isHeartbeatDue(NOW - LOCATION_HEARTBEAT_MS + 1, NOW)).toBe(false);
  });

  it('keeps the worst gap (heartbeat + 10 s check) well under the 60 s signal-lost line', () => {
    expect(LOCATION_HEARTBEAT_MS + 10_000).toBeLessThan(RESPONDER_SIGNAL_LOST_MS / 1.5);
  });
});
