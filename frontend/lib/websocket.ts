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

export function onIncidentEvent<T>(
  event: AgapEventName,
  handler: (payload: T) => void,
): () => void {
  const s = getSocket();
  const wrapped = (envelope: AgapWebSocketEvent<T>) => handler(envelope.data);
  s.on(event as string, wrapped);
  return () => s.off(event as string, wrapped);
}
