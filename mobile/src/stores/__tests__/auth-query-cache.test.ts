/// <reference types="jest" />
import { useAuthStore } from '../auth.store';
import { queryClient } from '../../lib/query-client';
import type { SafeUser } from '../../services/api/auth.api';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

const tokens = { accessToken: 'access', refreshToken: 'refresh' };
const userA = { id: 'user-a' } as SafeUser;
const userB = { id: 'user-b' } as SafeUser;
const MEDICAL = ['medical-profile'];

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, refreshToken: null, user: null, isAuthenticated: false });
  queryClient.clear();
});

afterAll(() => queryClient.clear());

describe('nothing cached outlives the account it belongs to (shared phone)', () => {
  it('signing out removes cached data, including what a mutation was sent', async () => {
    await useAuthStore.getState().login(tokens, userA);
    queryClient.setQueryData(MEDICAL, { bloodType: 'O+' });
    queryClient.getMutationCache().build(queryClient, { mutationKey: ['medical-save'] });

    await useAuthStore.getState().logout();

    expect(queryClient.getQueryData(MEDICAL)).toBeUndefined();
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
  });

  it('a request still in flight at sign-out does not land in the cache', async () => {
    await useAuthStore.getState().login(tokens, userA);
    let respond: (value: unknown) => void = () => undefined;
    const pending = queryClient
      .fetchQuery({ queryKey: MEDICAL, queryFn: () => new Promise((resolve) => { respond = resolve; }) })
      .catch(() => undefined);

    await useAuthStore.getState().logout();
    respond({ bloodType: 'O+' });
    await pending;

    expect(queryClient.getQueryData(MEDICAL)).toBeUndefined();
  });

  it('another account signing in without a sign-out does not see the last one’s data', async () => {
    await useAuthStore.getState().login(tokens, userA);
    queryClient.setQueryData(MEDICAL, { bloodType: 'O+' });

    await useAuthStore.getState().login(tokens, userB);

    expect(queryClient.getQueryData(MEDICAL)).toBeUndefined();
  });

  it('the session is already in place when the cache empties, so a refetch uses the new account', async () => {
    await useAuthStore.getState().login(tokens, userA);
    queryClient.setQueryData(MEDICAL, { bloodType: 'O+' });
    const userWhenCleared: Array<string | undefined> = [];
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'removed') userWhenCleared.push(useAuthStore.getState().user?.id);
    });

    await useAuthStore.getState().login(tokens, userB);
    unsubscribe();

    expect(userWhenCleared).toEqual(['user-b']);
  });

  it('a token refresh (login again as the same user) keeps the cache', async () => {
    await useAuthStore.getState().login(tokens, userA);
    queryClient.setQueryData(MEDICAL, { bloodType: 'O+' });

    await useAuthStore.getState().login({ accessToken: 'access-2', refreshToken: 'refresh-2' }, userA);

    expect(queryClient.getQueryData(MEDICAL)).toEqual({ bloodType: 'O+' });
  });

  // authedFetch calls logout() on every 401 with no refresh token. If each call emptied the cache,
  // a mounted screen would build a new query, fetch, get a 401, and go round again forever.
  it('logout with no session left changes nothing in the cache', async () => {
    await useAuthStore.getState().login(tokens, userA);
    await useAuthStore.getState().logout();
    queryClient.setQueryData(['map-config'], { public: true });

    await useAuthStore.getState().logout();

    expect(queryClient.getQueryData(['map-config'])).toEqual({ public: true });
  });
});
