'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Bell, Loader2, AlertCircle, Megaphone, Info, CheckCheck, CheckCircle2, Truck, Siren, Flame, LifeBuoy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUnreadCount, useNotifications, useMarkRead, useMarkAllRead } from '@/features/notifications/hooks';
import type { AppNotification } from '@/features/notifications/api';
import { Toast } from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';
import { onIncidentEvent } from '@/lib/websocket';
import { crewHelpNote } from '@/lib/crew-help-note';
import { NOTIFICATION_EVENT_TYPES, type NotificationCreatedPayload } from '@agap/shared';

// ─── Event-type display config ─────────────────────────────────────────────────

const EVENT_META: Record<string, { icon: typeof AlertCircle; color: string; bg: string }> = {
  DISPATCH_CREATED:          { icon: AlertCircle,  color: '#D97706', bg: '#FFF7ED' },
  INCIDENT_ESCALATED:        { icon: AlertCircle,  color: '#DC2626', bg: '#FEF2F2' },
  INCIDENT_AWAITING_CLOSURE: { icon: CheckCircle2, color: '#0D6053', bg: '#EEF7F4' },
  RESPONDER_:                { icon: Truck,        color: '#7C3AED', bg: '#F5F3FF' },
  INCIDENT_UPDATED:          { icon: Info,         color: '#3B82F6', bg: '#EFF6FF' },
  [NOTIFICATION_EVENT_TYPES.CREW_HELP_REQUESTED]: { icon: Siren, color: '#D44858', bg: '#FDF2F3' },
  [NOTIFICATION_EVENT_TYPES.FIRE_REPORT_ALERT]:   { icon: Flame, color: '#D44858', bg: '#FDF2F3' },
  [NOTIFICATION_EVENT_TYPES.RESCUE_PEOPLE_WAITING]:      { icon: LifeBuoy, color: '#D44858', bg: '#FDF2F3' },
  [NOTIFICATION_EVENT_TYPES.RESCUE_AMBULANCE_SUGGESTED]: { icon: LifeBuoy, color: '#D44858', bg: '#FDF2F3' },
  ANNOUNCEMENT:              { icon: Megaphone,    color: '#0D6053', bg: '#EEF7F4' },
  SURGE_:                    { icon: Siren,        color: '#D44858', bg: '#FDF2F3' },
};

/** `n` makes each notification's link unique, so opening a second notice for an
 *  incident that is already open on the Incident Queue still reopens its drawer. */
function incidentLink(incidentId: string, notificationId?: string): string {
  const id = encodeURIComponent(incidentId);
  return notificationId
    ? `/operations/incidents?id=${id}&n=${encodeURIComponent(notificationId)}`
    : `/operations/incidents?id=${id}`;
}

/** Where a notification row leads, or null when it has no page of its own. */
function notificationHref(notif: AppNotification): string | null {
  // Incident notices (crew help, fire report and rescue notices included) open that incident.
  if (notif.incident_id) return incidentLink(notif.incident_id, notif.id);
  if (notif.event_type === 'ANNOUNCEMENT' && typeof notif.data_payload?.announcementId === 'string') {
    return `/announcements/${encodeURIComponent(notif.data_payload.announcementId)}`;
  }
  // MOD-52: the surge page shows the recommendation with its Activate button.
  if (notif.event_type === 'SURGE_RECOMMENDED') return '/operations/surge';
  // MOD-39 (C8): the Hospitals page has the receiving status and the registry rows.
  if (notif.event_type === 'HOSPITAL_STATUS_STALE' || notif.event_type === 'REGISTRY_REVIEW_DUE') return '/hospitals';
  return null;
}

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
  onOpen,
}: {
  notif: AppNotification;
  onRead: (id: string) => void;
  onOpen: (href: string) => void;
}) {
  const unread = notif.status === 'PENDING';
  const { icon: Icon, color, bg } = getEventMeta(notif.event_type);
  const href = notificationHref(notif);

  const crewNote = crewHelpNote(notif);

  function handleClick() {
    if (unread) onRead(notif.id);
    if (href) onOpen(href);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-agap-green',
        href && 'cursor-pointer',
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
        {crewNote && (
          <p className="mt-1 line-clamp-3 text-xs italic text-agap-textMain leading-relaxed">
            Crew note: {crewNote}
          </p>
        )}
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
  const router = useRouter();
  const { toasts, toast, dismiss } = useToast();
  const toastLinks = useRef(new Map<string, string>());
  // Navigation can take a moment (first visit to a page); the bell shows a spinner
  // until the new page is on screen, and the dropdown closes at once.
  const [navigating, startNavigation] = useTransition();

  function openLink(href: string) {
    setOpen(false);
    startNavigation(() => router.push(href));
  }

  // Close with Escape, back to the bell.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // A live toast for each new notification (e.g. a unit resolved an incident and
  // it awaits closure). Clicking it opens the incident.
  useEffect(() => {
    return onIncidentEvent<NotificationCreatedPayload>('notification.created', (n) => {
      const id = toast({
        title: n.title,
        ...(n.body && { description: n.body }),
        variant: n.type === 'INCIDENT_AWAITING_CLOSURE' ? 'success' : 'default',
        duration: 8000,
      });
      if (n.incidentId) toastLinks.current.set(id, incidentLink(n.incidentId));
      else if (n.type === 'SURGE_RECOMMENDED') toastLinks.current.set(id, '/operations/surge');
      else if (n.type === 'HOSPITAL_STATUS_STALE' || n.type === 'REGISTRY_REVIEW_DUE') toastLinks.current.set(id, '/hospitals');
    });
  }, [toast]);

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
      {toasts.map((t) => {
        const link = toastLinks.current.get(t.id);
        return (
          <Toast
            key={t.id}
            title={t.title}
            {...(t.description && { description: t.description })}
            {...(t.variant && { variant: t.variant })}
            {...(t.duration !== undefined && { duration: t.duration })}
            {...(link && { className: 'cursor-pointer', onClick: () => openLink(link) })}
            onOpenChange={(isOpen) => {
              if (!isOpen) {
                dismiss(t.id);
                toastLinks.current.delete(t.id);
              }
            }}
          />
        );
      })}

      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-agap-green',
          open ? 'bg-agap-surface text-agap-green' : 'text-agap-textSub hover:bg-agap-surface hover:text-agap-textMain',
        )}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}${navigating ? ', opening' : ''}`}
        aria-expanded={open}
        aria-busy={navigating}
      >
        {navigating ? <Loader2 size={16} className="animate-spin text-agap-green motion-reduce:animate-none" /> : <Bell size={16} />}
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
                  onOpen={openLink}
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
