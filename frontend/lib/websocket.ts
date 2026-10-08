import { io, Socket } from 'socket.io-client';
import type { AgapWebSocketEvent, AgapEventName } from '@agap/shared';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/agap`, {
      autoConnect: false,
      transports: ['websocket'],
    });
  }
  return socket;
}

export function connectSocket(token?: string): Socket {
  const s = getSocket();
  if (!s.connected) {
    if (token) {
      s.auth = { token };
    }
    s.connect();
  }
  return s;
}

/**
 * Join the Operations Center room so this client receives ops-scoped events
 * (incident.created, incident.status_changed, dispatch.created, …). The gateway
 * restricts this room to dispatcher/supervisor/admin roles via the JWT.
 */
export function joinOps(): void {
  const s = getSocket();
  const emit = () => s.emit('join:ops');
  if (s.connected) emit();
  else s.once('connect', emit);
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
