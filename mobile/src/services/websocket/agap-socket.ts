import { io, type Socket } from 'socket.io-client';
import { onSessionEnd, useAuthStore } from '../../stores/auth.store';
import { refreshAccessToken } from '../api/authed-fetch';

/**
 * Shared Socket.IO client for the AGAP realtime gateway (MOD-20).
 *
 * Connects to the authenticated `/agap` namespace and is reused across screens
 * (one warm connection). WebSocket is for live distribution only — PostgreSQL
 * remains the source of truth, so a dropped socket never loses data; screens
 * re-fetch REST state and the socket reconnects automatically.
 */
const WS_BASE = process.env.EXPO_PUBLIC_WS_URL ?? 'ws://localhost:3000';

/** REST poll interval for screens while the socket is down (plan §19). */
export const DISCONNECTED_POLL_MS = 15_000;
/** A connection that stays up this long ends a server-disconnect episode (see onDisconnect). */
const STABLE_CONNECTION_MS = 5_000;

/** The gateway's answer to `join:incident`. Older servers send none. */
export type JoinIncidentAck = { ok: true } | { ok: false; reason: 'UNAUTHORIZED' | 'NOT_PARTICIPANT' };

interface WatchedRoom {
  watchers: number;
  listeners: Set<(ack: JoinIncidentAck) => void>;
  /** The ack for the current connection; cleared on disconnect. */
  lastAck?: JoinIncidentAck;
}

let socket: Socket | null = null;
/**
 * Incident rooms watched by mounted screens. A room is joined on its first watch,
 * left on its last release, and re-joined once on every connect, so closing the
 * chat does not stop Tracking underneath from receiving the incident's events.
 */
const rooms = new Map<string, WatchedRoom>();
let retriedServerDisconnect = false;
let stableTimer: ReturnType<typeof setTimeout> | null = null;

function joinRoom(s: Socket, incidentId: string): void {
  s.emit('join:incident', { incidentId }, (ack?: JoinIncidentAck) => {
    const room = rooms.get(incidentId);
    if (!ack || !room || socket !== s) return;
    room.lastAck = ack;
    room.listeners.forEach((listener) => listener(ack));
  });
}

function createSocket(): Socket {
  const s = io(`${WS_BASE}/agap`, {
    // Called on every (re)connect, so a reconnect never reuses an expired token.
    auth: (cb) => cb({ token: useAuthStore.getState().accessToken }),
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  s.on('connect', () => {
    rooms.forEach((_room, incidentId) => joinRoom(s, incidentId));
    if (stableTimer) clearTimeout(stableTimer);
    stableTimer = setTimeout(() => { retriedServerDisconnect = false; }, STABLE_CONNECTION_MS);
  });

  s.on('disconnect', (reason) => {
    rooms.forEach((room) => { room.lastAck = undefined; });
    if (stableTimer) clearTimeout(stableTimer);
    stableTimer = null;
    // Socket.IO retries every other reason by itself. The server disconnects an
    // expired or revoked token; refresh once and reconnect only if that worked, so
    // a revoked or deactivated account can't loop (a failed refresh logs out).
    if (reason !== 'io server disconnect' || retriedServerDisconnect) return;
    retriedServerDisconnect = true;
    void refreshAccessToken().then((ok) => {
      if (ok && socket === s) s.connect();
    });
  });

  return s;
}

/** Returns the shared socket, connecting with the current session token if needed. */
export function connectSocket(): Socket {
  if (!socket) {
    socket = createSocket();
    return socket;
  }
  if (!socket.connected) socket.connect();
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (stableTimer) clearTimeout(stableTimer);
  stableTimer = null;
  retriedServerDisconnect = false;
  socket?.disconnect();
  socket = null;
}

// Logout or another account signing in closes the socket, so it never outlives the
// session and the next account doesn't reuse the previous user's incident rooms.
onSessionEnd(disconnectSocket);

/**
 * Watch an incident's room on the shared socket. `onJoin` receives the gateway's
 * ack (also the current one, if the room is already joined). Returns the release.
 */
export function watchIncidentRoom(incidentId: string, onJoin?: (ack: JoinIncidentAck) => void): () => void {
  const s = connectSocket();
  let room = rooms.get(incidentId);
  if (!room) {
    room = { watchers: 0, listeners: new Set() };
    rooms.set(incidentId, room);
  }
  room.watchers += 1;
  if (onJoin) {
    room.listeners.add(onJoin);
    if (room.lastAck) onJoin(room.lastAck);
  }
  // Later watchers share the join; a socket that isn't connected yet joins on 'connect'.
  if (room.watchers === 1 && s.connected) joinRoom(s, incidentId);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = rooms.get(incidentId);
    if (!current) return;
    if (onJoin) current.listeners.delete(onJoin);
    current.watchers -= 1;
    if (current.watchers > 0) return;
    rooms.delete(incidentId);
    socket?.emit('leave:incident', { incidentId });
  };
}
