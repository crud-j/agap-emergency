import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { Socket } from 'socket.io-client';
import type { AgapWebSocketEvent, IncidentMessagePayload } from '@agap/shared';
import { useAuthStore } from '@/src/stores/auth.store';
import {
  DISCONNECTED_POLL_MS,
  connectSocket,
  watchIncidentRoom,
} from '@/src/services/websocket/agap-socket';
import {
  getIncidentMessages,
  sendIncidentMessage,
  type IncidentMessage,
} from '@/src/services/api/communications.api';

function toRow(p: IncidentMessagePayload): IncidentMessage {
  return {
    id: p.id,
    incident_id: p.incidentId,
    sender_id: p.senderId,
    message_text: p.messageText,
    attachment_id: p.attachmentId,
    sent_at: p.sentAt,
    sender_role: p.senderRole,
    sender_label: p.senderLabel,
  };
}

/** History reloads and live events merged by id, oldest first. */
export function mergeMessages(prev: IncidentMessage[], incoming: IncidentMessage[]): IncidentMessage[] {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
}

type ChatSocket = Pick<Socket, 'connected' | 'on' | 'off'>;

function subscribeAppActive(onActive: () => void): () => void {
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') onActive();
  });
  return () => sub.remove();
}

/**
 * Keeps an open chat in step with the server: reloads history now, on every
 * (re)connect and when the app returns to the foreground, polls while the socket is
 * down, and passes on live messages for this incident. Returns the cleanup.
 */
export function attachChatSync(
  socket: ChatSocket,
  incidentId: string,
  handlers: {
    reload: () => void;
    onMessage: (message: IncidentMessage) => void;
    setConnected: (connected: boolean) => void;
  },
  onAppActive: (cb: () => void) => () => void = subscribeAppActive,
): () => void {
  let poll: ReturnType<typeof setInterval> | null = null;
  const stopPolling = () => {
    if (poll) clearInterval(poll);
    poll = null;
  };
  const startPolling = () => {
    if (!poll) poll = setInterval(handlers.reload, DISCONNECTED_POLL_MS);
  };

  const onConnect = () => {
    handlers.setConnected(true);
    stopPolling();
    handlers.reload();
  };
  const onDisconnect = () => {
    handlers.setConnected(false);
    startPolling();
  };
  const onMessage = (env: AgapWebSocketEvent<IncidentMessagePayload>) => {
    if (env.data.incidentId === incidentId) handlers.onMessage(toRow(env.data));
  };

  handlers.setConnected(socket.connected);
  if (!socket.connected) startPolling();
  handlers.reload();

  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);
  socket.on('message.created', onMessage);
  const stopAppState = onAppActive(handlers.reload);

  return () => {
    stopPolling();
    stopAppState();
    socket.off('connect', onConnect);
    socket.off('disconnect', onDisconnect);
    socket.off('message.created', onMessage);
  };
}

export interface IncidentChatState {
  messages: IncidentMessage[];
  connected: boolean;
  loading: boolean;
  sending: boolean;
  error: string | null;
  myUserId: string | null;
  send: (text: string) => Promise<void>;
}

/**
 * Incident chat (MOD-33). Loads history over REST, watches the incident room on the
 * shared socket, and appends live `message.created` events. Participants only — the
 * server blocks non-participants and strips personal identity (role labels only).
 */
export function useIncidentChat(incidentId?: string): IncidentChatState {
  const signedIn = useAuthStore((s) => !!s.accessToken);
  const me = useAuthStore((s) => s.user);
  const myUserId = me?.id ?? null;

  const [messages, setMessages] = useState<IncidentMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Keyed on the user, not the token: a token refresh keeps the chat; another
  // account on the same phone starts from that account's history.
  useEffect(() => {
    if (!incidentId || !signedIn) return;
    let active = true;
    setMessages([]);
    setLoading(true);
    setJoinError(null);

    const reload = () => {
      getIncidentMessages(incidentId)
        .then((m) => {
          if (!active) return;
          setMessages((prev) => mergeMessages(prev, m));
          setLoadError(null);
        })
        .catch((e) => {
          if (active) setLoadError(e instanceof Error ? e.message : 'Could not load messages');
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };

    const release = watchIncidentRoom(incidentId, (ack) => {
      if (!active) return;
      setJoinError(ack.ok || ack.reason !== 'NOT_PARTICIPANT' ? null : "You're not a participant of this incident.");
    });
    const detach = attachChatSync(connectSocket(), incidentId, {
      reload,
      onMessage: (m) => setMessages((prev) => mergeMessages(prev, [m])),
      setConnected,
    });

    return () => {
      active = false;
      detach();
      release();
    };
  }, [incidentId, signedIn, myUserId]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!incidentId || !signedIn || !trimmed) return;
      setSending(true);
      setSendError(null);
      try {
        const msg = await sendIncidentMessage(incidentId, trimmed);
        setMessages((prev) => mergeMessages(prev, [msg]));
      } catch (e) {
        setSendError(e instanceof Error ? e.message : 'Message failed to send');
        throw e;
      } finally {
        setSending(false);
      }
    },
    [incidentId, signedIn],
  );

  return {
    messages,
    connected,
    loading,
    sending,
    error: sendError ?? joinError ?? loadError,
    myUserId,
    send,
  };
}
