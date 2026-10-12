
import { io, type Socket } from 'socket.io-client';
import type {
  AgapWebSocketEvent,
  AgapEventName,
} from '@agap/shared';

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3000';

let socket: Socket | null = null;
let opsJoinHandler: (() => void) | null = null;

export function getSocket(): Socket {
  socket ??= io(`${WS_URL}/agap`, {
    autoConnect: false,
    transports: ['websocket'],
  });

  return socket;
}

export function connectSocket(token?: string): Socket {
  const s = getSocket();

  if (token) {
    s.auth = { token };
  }

  if (!s.connected) {
    s.connect();
  }

  return s;
}

export function joinOps(): void {
  const s = getSocket();

  // Keep only one handler so repeated calls do not create
  // duplicate join requests.
  if (opsJoinHandler) {
    s.off('connect', opsJoinHandler);
  }

  opsJoinHandler = () => {
    if (s.connected) {
      s.emit('join:ops');
    }
  };

  s.on('connect', opsJoinHandler);

  if (s.connected) {
    opsJoinHandler();
  }
}

export function onIncidentEvent<T>(
  event: AgapEventName | string,
  handler: (payload: T) => void,
): () => void {
  const s = getSocket();

  const wrapped = (envelope: AgapWebSocketEvent<T>) => {
    handler(envelope.data);
  };

  s.on(event, wrapped);

  return () => {
    s.off(event, wrapped);
  };
}
