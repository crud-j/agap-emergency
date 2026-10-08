'use client';

import { useEffect, useRef, useState, type JSX } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui';
import { useIncidentMessages, useSendMessage } from '@/features/communications/hooks';
import type { IncidentMessage } from '@/features/communications/api';
import { useIncidentEvent, useJoinIncidentRoom } from '@/hooks/useIncidentEvents';
import { useAuthUser } from '@/lib/use-auth';
import { timeAgo } from '@/lib/incident-format';
import { cn } from '@/lib/utils';

/**
 * Incident chat panel (MOD-33) for the ops detail Drawer. Joins the incident
 * room, renders role-labelled messages (own messages right-aligned in #0D6053),
 * and appends live via the message.created event. Participants only — the API
 * blocks non-participants and never exposes a reporter's personal identity.
 */
export function IncidentChatPanel({ incidentId }: { incidentId: string }): JSX.Element {
  const qc = useQueryClient();
  const me = useAuthUser();
  const { data: messages = [], isLoading } = useIncidentMessages(incidentId);
  const send = useSendMessage(incidentId);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Receive this incident's room events while the panel is open.
  useJoinIncidentRoom(incidentId);
  useIncidentEvent<IncidentMessage>('message.created', (msg) => {
    if (msg.incident_id !== incidentId) return;
    qc.setQueryData<IncidentMessage[]>(['incident-messages', incidentId], (old) =>
      old && old.some((m) => m.id === msg.id) ? old : [...(old ?? []), msg],
    );
  });

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  function submit() {
    const text = draft.trim();
    if (!text) return;
    send.mutate(text);
    setDraft('');
  }

  return (
    <div className="flex flex-col rounded-xl border border-[rgba(168,181,193,0.20)] bg-white">
      <div ref={scrollRef} className="max-h-64 min-h-[8rem] space-y-2 overflow-y-auto p-3">
        {isLoading ? (
          <p className="py-6 text-center text-xs text-agap-textSub">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-agap-textSub">No messages yet. Start the conversation.</p>
        ) : (
          messages.map((m) => {
            const own = !!me && m.sender_id === me.id;
            return (
              <div key={m.id} className={cn('flex flex-col', own ? 'items-end' : 'items-start')}>
                {!own && <span className="mb-0.5 px-1 text-[11px] font-semibold text-agap-textSub">{m.sender_label}</span>}
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                    own ? 'bg-agap-green text-white' : 'bg-agap-surface text-agap-textMain',
                  )}
                >
                  {m.message_text}
                </div>
                <span className="mt-0.5 px-1 text-[10px] text-agap-textSub">{timeAgo(m.sent_at)}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-[rgba(168,181,193,0.20)] p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message incident participants…"
          className="flex-1 rounded-lg border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
        />
        <Button variant="primary" size="sm" onClick={submit} loading={send.isPending} disabled={!draft.trim()}>
          <Send size={14} />
        </Button>
      </div>
      {send.isError && (
        <p className="px-3 pb-2 text-xs text-agap-danger">
          {(send.error as Error)?.message ?? 'Message failed to send.'}
        </p>
      )}
    </div>
  );
}
