import { useCallback, useEffect, useState } from 'react';
import type { AgapWebSocketEvent, IncidentMessagePayload } from '@agap/shared';
import { useAuthStore } from '@/src/stores/auth.store';
import { connectSocket } from '@/src/services/websocket/agap-socket';
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
 * Incident chat (MOD-33). Loads history over REST, joins the incident room, and
 * appends live `message.created` events. Participants only — the server blocks
 * non-participants and strips personal identity (role labels only).
 */
export function useIncidentChat(incidentId?: string): IncidentChatState {
  const token = useAuthStore((s) => s.accessToken);
  const me = useAuthStore((s) => s.user);

  const [messages, setMessages] = useState<IncidentMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!incidentId || !token) return;
    let active = true;

    setLoading(true);
    getIncidentMessages(incidentId, token)
      .then((m) => {
        if (active) setMessages(m);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Could not load messages');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const socket = connectSocket(token);
    const join = () => {
      setConnected(true);
      socket.emit('join:incident', { incidentId });
    };
    const onDisconnect = () => setConnected(false);
    const onMessage = (env: AgapWebSocketEvent<IncidentMessagePayload>) => {
      const p = env.data;
      if (p.incidentId !== incidentId) return;
      setMessages((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, toRow(p)]));
    };

    if (socket.connected) join();
    socket.on('connect', join);
    socket.on('disconnect', onDisconnect);
    socket.on('message.created', onMessage);

    return () => {
      active = false;
      socket.emit('leave:incident', { incidentId });
      socket.off('connect', join);
      socket.off('disconnect', onDisconnect);
      socket.off('message.created', onMessage);
    };
  }, [incidentId, token]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!incidentId || !token || !trimmed) return;
      setSending(true);
      setError(null);
      try {
        const msg = await sendIncidentMessage(incidentId, trimmed, token);
        setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Message failed to send');
        throw e;
      } finally {
        setSending(false);
      }
    },
    [incidentId, token],
  );

  return { messages, connected, loading, sending, error, myUserId: me?.id ?? null, send };
}
