/// <reference types="jest" />
import { useAuthStore } from '../auth.store';
import { useIncidentStore } from '../incident.store';
import type { SafeUser } from '../../services/api/auth.api';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const tokens = { accessToken: 'access', refreshToken: 'refresh' };
const userA = { id: 'user-a' } as SafeUser;
const userB = { id: 'user-b' } as SafeUser;

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
  useIncidentStore.getState().reset();
});

describe('signing in clears another session’s incident (shared phone)', () => {
  it("a guest report's incident does not carry into the account that signs in next", async () => {
    useIncidentStore.getState().beginGuestReport();
    useIncidentStore.getState().setActiveIncidentId('guest-incident');

    await useAuthStore.getState().login(tokens, userA);

    expect(useIncidentStore.getState().activeIncidentId).toBeNull();
    expect(useIncidentStore.getState().draft.isGuestReport).toBe(false);
  });

  it('a different account signing in does not see the previous account’s incident', async () => {
    await useAuthStore.getState().login(tokens, userA);
    useIncidentStore.getState().setActiveIncidentId('incident-of-a');

    await useAuthStore.getState().login(tokens, userB);

    expect(useIncidentStore.getState().activeIncidentId).toBeNull();
  });

  it('a token refresh (login again as the same user) keeps the active incident', async () => {
    await useAuthStore.getState().login(tokens, userA);
    useIncidentStore.getState().setActiveIncidentId('incident-of-a');

    await useAuthStore.getState().login({ accessToken: 'access-2', refreshToken: 'refresh-2' }, userA);

    expect(useIncidentStore.getState().activeIncidentId).toBe('incident-of-a');
  });
});
