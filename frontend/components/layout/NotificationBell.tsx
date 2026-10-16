'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, AlertCircle, Megaphone, Info, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUnreadCount, useNotifications, useMarkRead, useMarkAllRead } from '@/features/notifications/hooks';
import type { AppNotification } from '@/features/notifications/api';

// ─── Event-type display config ─────────────────────────────────────────────────

const EVENT_META: Record<string, { icon: typeof AlertCircle; color: string; bg: string }> = {
  DISPATCH_CREATED:   { icon: AlertCircle, color: '#D97706', bg: '#FFF7ED' },
  INCIDENT_ESCALATED: { icon: AlertCircle, color: '#DC2626', bg: '#FEF2F2' },
  INCIDENT_UPDATED:   { icon: Info,        color: '#3B82F6', bg: '#EFF6FF' },
  ANNOUNCEMENT:       { icon: Megaphone,   color: '#0D6053', bg: '#EEF7F4' },
};

function getEventMeta(eventType: string) {
  return (
    EVENT_META[eventType] ??
    EVENT_META[Object.keys(EVENT_META).find((k) => eventType.startsWith(k) || eventType.includes(k)) ?? ''] ??
    { icon: Info, color: '#8795A3', bg: '#F5F7FA' }
  );
}

// ─── Time formatter ────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Single row ────────────────────────────────────────────────────────────────

function NotifRow({
  notif,
  onRead,
}: {
  notif: AppNotification;
  onRead: (id: string) => void;
}) {
  const router = useRouter();
  const unread = notif.status === 'PENDING';
  const { icon: Icon, color, bg } = getEventMeta(notif.event_type);

  function handleClick() {
    if (unread) onRead(notif.id);
    if (notif.incident_id) {
      router.push(`/operations/incidents?id=${notif.incident_id}`);
    } else if (notif.event_type === 'ANNOUNCEMENT' && typeof notif.data_payload?.announcementId === 'string') {
      router.push(`/announcements/${notif.data_payload.announcementId}`);
    }
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
        unread ? 'bg-agap-greenSoft/30 hover:bg-agap-greenSoft/50' : 'hover:bg-agap-surface',
      )}
    >
      {/* Icon */}
      <span
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: bg }}
      >
        <Icon size={14} style={{ color }} />
      </span>

      {/* Body */}
      <div className="min-w-0 flex-1">
        {notif.title && (
          <p className={cn('truncate text-sm', unread ? 'font-semibold text-agap-textMain' : 'text-agap-textMain')}>
            {notif.title}
          </p>
        )}
        <p className="line-clamp-2 text-xs text-agap-textSub leading-relaxed">{notif.body}</p>
      </div>

      {/* Right */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[10px] text-agap-track whitespace-nowrap">{timeAgo(notif.created_at)}</span>
        {unread && <span className="h-2 w-2 rounded-full bg-agap-green" />}
      </div>
    </button>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: countData } = useUnreadCount();
  const { data: listData } = useNotifications(1);
  const { mutate: markRead } = useMarkRead();
  const { mutate: markAll, isPending: markingAll } = useMarkAllRead();

  const unread = countData?.unread ?? 0;
  const notifications = listData?.data ?? [];

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-agap-green',
          open ? 'bg-agap-surface text-agap-green' : 'text-agap-textSub hover:bg-agap-surface hover:text-agap-textMain',
        )}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-agap-danger px-0.5 text-[9px] font-bold text-white leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-10 z-50 w-96 overflow-hidden rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[rgba(168,181,193,0.12)] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-agap-textMain">Notifications</span>
              {unread > 0 && (
                <span className="rounded-full bg-agap-greenSoft px-2 py-0.5 text-[10px] font-bold text-agap-green">
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={() => markAll()}
                disabled={markingAll}
                className="flex items-center gap-1 text-xs font-semibold text-agap-green hover:text-agap-greenDark disabled:opacity-50 transition-opacity"
              >
                <CheckCheck size={13} />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-[rgba(168,181,193,0.10)]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <Bell size={28} className="text-agap-track" />
                <p className="text-sm font-semibold text-agap-textMain">All caught up</p>
                <p className="text-xs text-agap-textSub">No notifications yet.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotifRow
                  key={n.id}
                  notif={n}
                  onRead={(id) => { markRead(id); }}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {(listData?.meta.total ?? 0) > notifications.length && (
            <div className="border-t border-[rgba(168,181,193,0.12)] px-4 py-2.5 text-center">
              <span className="text-xs text-agap-textSub">
                Showing {notifications.length} of {listData?.meta.total}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
