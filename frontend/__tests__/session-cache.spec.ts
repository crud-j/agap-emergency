import { QueryClient } from '@tanstack/react-query';
import { clearSession, getSessionUser, setSession, type SessionUser } from '@/lib/auth';
import { clearCacheWhenAccountChanges } from '@/lib/session-cache';

const user = (id: string): SessionUser => ({
  id,
  email: null,
  role: 'DISPATCHER',
  name: 'Test Dispatcher',
  orgId: null,
  orgName: null,
  mustChangePassword: false,
});
const session = (id: string, accessToken = 'token') => ({ accessToken, user: user(id) });

const INCIDENT = ['incident', 'inc-1'];

describe('the query cache follows the signed-in account (shared computers)', () => {
  let client: QueryClient;
  let unsubscribe: () => void;

  /** Starts watching with this session already signed in, as after a page load. */
  function watch(id?: string): void {
    if (id) setSession(session(id));
    unsubscribe = clearCacheWhenAccountChanges(client);
    client.setQueryData(INCIDENT, { reporter: 'cached' });
  }

  beforeEach(() => {
    clearSession();
    client = new QueryClient();
  });

  afterEach(() => {
    unsubscribe();
    client.clear();
  });

  it('signing out empties it, including what a mutation was sent', () => {
    watch('user-a');
    client.getMutationCache().build(client, { mutationKey: ['save'] });

    clearSession();

    expect(client.getQueryData(INCIDENT)).toBeUndefined();
    expect(client.getMutationCache().getAll()).toEqual([]);
  });

  it('a request in flight at sign-out does not land in it', async () => {
    watch('user-a');
    let respond: (value: unknown) => void = () => undefined;
    const pending = client
      .fetchQuery({ queryKey: ['late'], queryFn: () => new Promise((resolve) => { respond = resolve; }) })
      .catch(() => undefined);

    clearSession();
    respond({ reporter: 'late' });
    await pending;

    expect(client.getQueryData(['late'])).toBeUndefined();
  });

  it('another account signing in empties it, with no sign-out in between', () => {
    watch('user-a');

    setSession(session('user-b'));

    expect(client.getQueryData(INCIDENT)).toBeUndefined();
  });

  it('the session is already the new one when it empties, so a refetch uses the new account', () => {
    watch('user-a');
    let accountWhenCleared: string | undefined;
    const spy = jest.spyOn(client, 'clear').mockImplementation(() => {
      accountWhenCleared = getSessionUser()?.id;
    });

    setSession(session('user-b'));
    spy.mockRestore();

    expect(accountWhenCleared).toBe('user-b');
  });

  it('a token refresh for the same account keeps it: a dispatcher’s screens must not blank out', () => {
    watch('user-a');

    setSession(session('user-a', 'token-2'));

    expect(client.getQueryData(INCIDENT)).toEqual({ reporter: 'cached' });
  });

  it('restoring a session after a page load keeps what is there', () => {
    watch();

    setSession(session('user-a'));

    expect(client.getQueryData(INCIDENT)).toEqual({ reporter: 'cached' });
  });

  it('an account signing in after a sign-out keeps what was fetched while signed out', () => {
    watch('user-a');
    clearSession();
    client.setQueryData(['public'], { open: true });

    setSession(session('user-b'));

    expect(client.getQueryData(['public'])).toEqual({ open: true });
  });

  it('after unsubscribing it no longer clears', () => {
    watch('user-a');
    unsubscribe();

    clearSession();

    expect(client.getQueryData(INCIDENT)).toEqual({ reporter: 'cached' });
  });
});
