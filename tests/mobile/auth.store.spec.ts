/**
 * Regression guard for a bug where the auth store used SecureStore keys
 * containing ':' (e.g. 'agap:access_token'). expo-secure-store validates keys
 * with /^[\w.-]+$/ and THROWS on invalid keys, so login() threw right after a
 * successful backend verification — surfacing on the client as a bogus
 * "Invalid or expired code" with no navigation.
 *
 * This test fails if any storage key ever regresses to a value SecureStore
 * would reject.
 */

// expo-secure-store touches native modules on import; stub it so the store
// module can be imported in the Node test environment.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import { KEYS } from '../../mobile/src/stores/auth.store';

// Mirrors expo-secure-store's own isValidKey():
//   function isValidKey(key) { return typeof key === 'string' && /^[\w.-]+$/.test(key); }
const SECURE_STORE_KEY = /^[\w.-]+$/;

describe('auth.store SecureStore keys', () => {
  it('exposes at least the access token, refresh token, and user keys', () => {
    expect(KEYS.accessToken).toBeDefined();
    expect(KEYS.refreshToken).toBeDefined();
    expect(KEYS.user).toBeDefined();
  });

  it.each(Object.entries(KEYS))(
    'key "%s" (%s) is valid for expo-secure-store',
    (_name, key) => {
      expect(typeof key).toBe('string');
      expect(key).toMatch(SECURE_STORE_KEY);
      expect(key).not.toContain(':'); // the exact character that caused the bug
    },
  );
});
