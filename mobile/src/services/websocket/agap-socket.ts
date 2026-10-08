import { io, type Socket } from 'socket.io-client';

/**
 * Shared Socket.IO client for the AGAP realtime gateway (MOD-20).
 *
 * Connects to the authenticated `/agap` namespace and is reused across screens
 * (one warm connection). WebSocket is for live distribution only — PostgreSQL
 * remains the source of truth, so a dropped socket never loses data; screens
 * re-fetch REST state and the socket reconnects automatically.
 */
const WS_BASE = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:3000';

let socket: Socket | null = null;

/** Returns the shared socket, (re)connecting with the given JWT if needed. */
export function connectSocket(token: string): Socket {
  if (!socket) {
    socket = io(`${WS_BASE}/agap`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    return socket;
  }
  // Keep the auth token fresh (e.g. after a refresh) and ensure it's connected.
  socket.auth = { token };
  if (!socket.connected) socket.connect();
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
