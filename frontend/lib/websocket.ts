import { io, Socket } from 'socket.io-client';
import type { AgapWebSocketEvent, AgapEventName } from '@agap/shared';
import { getToken } from './auth';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/agap`, {
      autoConnect: false,
      // Try a direct WebSocket first — it connects in a single round-trip, so the
      // "Live" indicator flips over almost immediately. 'polling' is kept only as a
      // fallback for proxies/networks that refuse a WebSocket upgrade.
      transports: ['websocket', 'polling'],
      // Attempt the upgrade right away rather than settling on long-polling first.
      upgrade: true,
      // Don't wait the default 20s before surfacing a failed connection.
      timeout: 8_000,
      // Slow down reconnection retries so the browser console isn't flooded when
      // the backend is temporarily down. Starts at 2s, caps at 30s (6× the default 5s).
      reconnectionDelay: 2_000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.3,
    });
  }
  return socket;
}

/**
 * Connect using the current in-memory access token. The callback form means every
 * reconnect sends the latest (silently refreshed) token, not the one from page load.
 */
export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) {
    s.auth = (cb) => cb({ token: getToken() });
    s.connect();
  }
  return s;
}

/** Close the connection on sign-out so no further incident events arrive. */
export function disconnectSocket(): void {
  socket?.disconnect();
}

/**
 * Join the Operations Center room so this client receives ops-scoped events
 * (incident.created, incident.status_changed, dispatch.created, …). The gateway
 * restricts this room to dispatcher/supervisor/admin roles via the JWT.
 *
 * The server forgets a socket's rooms when it drops (backend restart, network blip,
 * laptop sleep), so this rejoins on every reconnect, not just the first connect.
 * Returns a cleanup that stops rejoining.
 */
export function joinOps(): () => void {
  const s = getSocket();
  const emit = () => s.emit('join:ops');
  if (s.connected) emit();
  s.on('connect', emit);
  return () => {
    s.off('connect', emit);
  };
}

export function onIncidentEvent<T>(
  // Accepts any AGAP event name. Typed loosely because dispatch.* events aren't
  // yet part of the shared AgapEventName union.
  event: AgapEventName | string,
  handler: (payload: T) => void,
): () => void {
  const s = getSocket();
  const wrapped = (envelope: AgapWebSocketEvent<T>) => handler(envelope.data);
  s.on(event as string, wrapped);
  return () => s.off(event as string, wrapped);
}
