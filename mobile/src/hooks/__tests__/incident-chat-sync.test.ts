/// <reference types="jest" />
import { DISCONNECTED_POLL_MS } from '../../services/websocket/agap-socket';
import { attachChatSync, mergeMessages } from '../useIncidentChat';
import type { IncidentMessage } from '../../services/api/communications.api';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn(),
}));

type Handler = (...args: any[]) => void;

function fakeSocket(connected: boolean) {
  const handlers = new Map<string, Set<Handler>>();
  const socket = {
    connected,
    on: jest.fn((event: string, h: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(h);
    }),
    off: jest.fn((event: string, h: Handler) => handlers.get(event)?.delete(h)),
    fire(event: string, ...args: unknown[]) {
      if (event === 'connect') socket.connected = true;
      if (event === 'disconnect') socket.connected = false;
      handlers.get(event)?.forEach((h) => h(...args));
    },
    listenerCount: (event: string) => handlers.get(event)?.size ?? 0,
  };
  return socket;
}

function msg(id: string, sentAt: string, senderId = 'u-1'): IncidentMessage {
  return {
    id,
    incident_id: 'inc-1',
    sender_id: senderId,
    message_text: id,
    attachment_id: null,
    sent_at: sentAt,
    sender_role: 'RESPONDER',
    sender_label: 'Responder',
  };
}

function setup(connected: boolean) {
  const socket = fakeSocket(connected);
  const handlers = { reload: jest.fn(), onMessage: jest.fn(), setConnected: jest.fn() };
  let appActive: (() => void) | null = null;
  const stopAppState = jest.fn();
  const detach = attachChatSync(socket as any, 'inc-1', handlers, (cb) => {
    appActive = cb;
    return stopAppState;
  });
  return { socket, handlers, detach, stopAppState, foreground: () => appActive?.() };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('incident chat sync (MOD-33)', () => {
  it('loads history when it opens', () => {
    const { handlers } = setup(true);
    expect(handlers.reload).toHaveBeenCalledTimes(1);
    expect(handlers.setConnected).toHaveBeenLastCalledWith(true);
  });

  it('reloads history on every reconnect, so messages sent while disconnected appear', () => {
    const { socket, handlers } = setup(true);
    socket.fire('disconnect', 'transport close');
    expect(handlers.setConnected).toHaveBeenLastCalledWith(false);

    socket.fire('connect');
    expect(handlers.setConnected).toHaveBeenLastCalledWith(true);
    expect(handlers.reload).toHaveBeenCalledTimes(2);

    socket.fire('disconnect', 'io server disconnect');
    socket.fire('connect');
    expect(handlers.reload).toHaveBeenCalledTimes(3);
  });

  it('polls while disconnected and stops once connected', () => {
    const { socket, handlers } = setup(false);
    expect(handlers.reload).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(DISCONNECTED_POLL_MS * 2);
    expect(handlers.reload).toHaveBeenCalledTimes(3);

    socket.fire('connect'); // reloads once more, then no polling
    jest.advanceTimersByTime(DISCONNECTED_POLL_MS * 3);
    expect(handlers.reload).toHaveBeenCalledTimes(4);
  });

  it('reloads when the app returns to the foreground', () => {
    const { handlers, foreground } = setup(true);
    foreground();
    expect(handlers.reload).toHaveBeenCalledTimes(2);
  });

  it("passes on live messages for this incident only", () => {
    const { socket, handlers } = setup(true);
    const live = (incidentId: string) => ({
      data: {
        id: `m-${incidentId}`, incidentId, senderId: 'u-2', messageText: 'hi', attachmentId: null,
        sentAt: '2026-11-02T10:00:00.000Z', senderRole: 'REPORTER', senderLabel: 'Reporter',
      },
    });
    socket.fire('message.created', live('inc-1'));
    socket.fire('message.created', live('inc-2'));
    expect(handlers.onMessage).toHaveBeenCalledTimes(1);
    expect(handlers.onMessage.mock.calls[0][0]).toMatchObject({ id: 'm-inc-1', sender_id: 'u-2', sender_label: 'Reporter' });
  });

  it('cleans up listeners, polling and the foreground subscription', () => {
    const { socket, handlers, detach, stopAppState } = setup(false);
    detach();
    jest.advanceTimersByTime(DISCONNECTED_POLL_MS * 2);
    expect(handlers.reload).toHaveBeenCalledTimes(1);
    expect(stopAppState).toHaveBeenCalled();
    expect(socket.listenerCount('connect')).toBe(0);
    expect(socket.listenerCount('message.created')).toBe(0);
  });
});

describe('mergeMessages', () => {
  it('merges history reloads and live events by id, oldest first', () => {
    const a = msg('a', '2026-11-02T10:00:00.000Z');
    const b = msg('b', '2026-11-02T10:01:00.000Z', 'u-2');
    const c = msg('c', '2026-11-02T10:02:00.000Z');

    const live = mergeMessages([], [c]);
    const merged = mergeMessages(live, [a, b, c]);
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(mergeMessages(merged, [b]).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});
