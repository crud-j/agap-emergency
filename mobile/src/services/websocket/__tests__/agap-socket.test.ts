/// <reference types="jest" />

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

type Handler = (...args: any[]) => void;

/** Minimal stand-in for a socket.io-client Socket: records emits, fires events on demand. */
class MockSocket {
  connected = false;
  emitted: { event: string; payload: unknown; ack?: Handler }[] = [];
  connectCalls = 0;
  disconnectCalls = 0;
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, h: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(h);
    return this;
  }
  off(event: string, h: Handler) {
    this.handlers.get(event)?.delete(h);
    return this;
  }
  emit(event: string, payload?: unknown, ack?: Handler) {
    this.emitted.push({ event, payload, ...(ack && { ack }) });
    return this;
  }
  connect() {
    this.connectCalls += 1;
    return this;
  }
  disconnect() {
    this.disconnectCalls += 1;
    this.connected = false;
    return this;
  }
  /** Simulate the server side of the connection. */
  fire(event: string, ...args: unknown[]) {
    if (event === 'connect') this.connected = true;
    if (event === 'disconnect') this.connected = false;
    this.handlers.get(event)?.forEach((h) => h(...args));
  }
  joins(incidentId?: string) {
    return this.emitted.filter(
      (e) => e.event === 'join:incident' && (!incidentId || (e.payload as any).incidentId === incidentId),
    );
  }
  leaves() {
    return this.emitted.filter((e) => e.event === 'leave:incident');
  }
}

const mockSockets: MockSocket[] = [];
const mockIoOptions: any[] = [];
jest.mock('socket.io-client', () => ({
  io: jest.fn((_url: string, options: unknown) => {
    const s = new MockSocket();
    mockSockets.push(s);
    mockIoOptions.push(options);
    return s;
  }),
}));

const mockRefreshAccessToken = jest.fn<Promise<boolean>, []>();
jest.mock('../../api/authed-fetch', () => ({ refreshAccessToken: () => mockRefreshAccessToken() }));

import { connectSocket, disconnectSocket, watchIncidentRoom } from '../agap-socket';
import { useAuthStore } from '../../../stores/auth.store';

const current = () => mockSockets[mockSockets.length - 1];

// Rooms are module state that outlive disconnectSocket() (each screen releases its
// own watch), so every test releases what it watched.
let openWatches: (() => void)[] = [];
function watch(...args: Parameters<typeof watchIncidentRoom>): () => void {
  const release = watchIncidentRoom(...args);
  openWatches.push(release);
  return release;
}
afterEach(() => {
  openWatches.forEach((release) => release());
  openWatches = [];
});

beforeEach(() => {
  disconnectSocket();
  mockSockets.length = 0;
  mockIoOptions.length = 0;
  mockRefreshAccessToken.mockReset();
  useAuthStore.setState({ accessToken: 'token-1', user: { id: 'u-1' } as any });
});

describe('watchIncidentRoom (shared socket room counting)', () => {
  it('joins once for two watchers and leaves only when the last one releases', () => {
    const releaseTracking = watch('inc-1');
    current().fire('connect');
    const releaseChat = watch('inc-1');

    expect(current().joins('inc-1')).toHaveLength(1);

    releaseChat();
    expect(current().leaves()).toHaveLength(0);
    releaseTracking();
    expect(current().leaves()).toEqual([{ event: 'leave:incident', payload: { incidentId: 'inc-1' } }]);
  });

  it('a release called twice counts once', () => {
    const releaseA = watch('inc-1');
    watch('inc-1');
    releaseA();
    releaseA();
    expect(current().leaves()).toHaveLength(0);
  });

  it('re-joins every watched room on each connect, once per room, including the first', () => {
    watch('inc-1');
    watch('inc-1');
    watch('inc-2');
    expect(current().joins()).toHaveLength(0); // not connected yet

    current().fire('connect');
    expect(current().joins('inc-1')).toHaveLength(1);
    expect(current().joins('inc-2')).toHaveLength(1);

    current().fire('disconnect', 'transport close');
    current().fire('connect');
    expect(current().joins('inc-1')).toHaveLength(2);
    expect(current().joins('inc-2')).toHaveLength(2);
  });

  it('stops re-joining a room after it is released', () => {
    const release = watch('inc-1');
    current().fire('connect');
    release();
    current().fire('disconnect', 'transport close');
    current().fire('connect');
    expect(current().joins('inc-1')).toHaveLength(1);
  });

  it("passes the gateway's ack to watchers, including one that arrives later", () => {
    const first = jest.fn();
    watch('inc-1', first);
    current().fire('connect');
    current().joins('inc-1')[0].ack!({ ok: false, reason: 'NOT_PARTICIPANT' });
    expect(first).toHaveBeenCalledWith({ ok: false, reason: 'NOT_PARTICIPANT' });

    const later = jest.fn();
    watch('inc-1', later);
    expect(later).toHaveBeenCalledWith({ ok: false, reason: 'NOT_PARTICIPANT' });
  });
});

describe('shared socket auth and reconnects', () => {
  it('sends the current token on every (re)connect', () => {
    connectSocket();
    const auth = mockIoOptions[0].auth as (cb: (data: unknown) => void) => void;
    const cb = jest.fn();
    auth(cb);
    useAuthStore.setState({ accessToken: 'token-2' });
    auth(cb);
    expect(cb.mock.calls).toEqual([[{ token: 'token-1' }], [{ token: 'token-2' }]]);
    expect(mockIoOptions[0].transports).toEqual(['websocket']);
  });

  it('after a server disconnect, refreshes and reconnects once; a second rejection is not retried', async () => {
    connectSocket();
    const s = current();
    s.fire('connect');
    mockRefreshAccessToken.mockResolvedValue(true);

    s.fire('disconnect', 'io server disconnect');
    await Promise.resolve();
    await Promise.resolve();
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(s.connectCalls).toBe(1);

    // The server rejects again right after connecting (e.g. a revoked session).
    s.fire('connect');
    s.fire('disconnect', 'io server disconnect');
    await Promise.resolve();
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
    expect(s.connectCalls).toBe(1);
  });

  it('does not reconnect when the refresh fails', async () => {
    connectSocket();
    const s = current();
    mockRefreshAccessToken.mockResolvedValue(false);
    s.fire('disconnect', 'io server disconnect');
    await Promise.resolve();
    await Promise.resolve();
    expect(s.connectCalls).toBe(0);
  });

  it('leaves other disconnect reasons to socket.io', () => {
    connectSocket();
    current().fire('disconnect', 'transport close');
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });
});

describe('auth store closes the socket', () => {
  it('logout disconnects before the tokens are cleared', async () => {
    connectSocket();
    const s = current();
    let tokenAtDisconnect: string | null | undefined;
    s.disconnect = function () {
      tokenAtDisconnect = useAuthStore.getState().accessToken;
      return MockSocket.prototype.disconnect.call(this);
    };
    await useAuthStore.getState().logout();
    expect(tokenAtDisconnect).toBe('token-1');
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('login disconnects for another user but not for a token refresh', async () => {
    connectSocket();
    const s = current();
    await useAuthStore.getState().login({ accessToken: 'token-2', refreshToken: 'r' }, { id: 'u-1' } as any);
    expect(s.disconnectCalls).toBe(0);
    await useAuthStore.getState().login({ accessToken: 'token-3', refreshToken: 'r' }, { id: 'u-2' } as any);
    expect(s.disconnectCalls).toBe(1);
  });
});
