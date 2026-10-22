'use client';

import { useMemo, type JSX } from 'react';
import Link from 'next/link';
import { ArrowRight, Megaphone, Siren, Zap } from 'lucide-react';
import { useSurgeState } from '@/features/surge/hooks';
import { usePublishedAnnouncements } from '@/features/announcements/hooks';

/**
 * Banners shown at the top of every role's dashboard: the active critical public
 * advisory (GET /announcements is public) and, for roles that may read surge status
 * (GET /disaster-mode/status), the surge / mass-casualty banner.
 */
export function DashboardBanners({ showSurge = false }: { showSurge?: boolean }): JSX.Element | null {
  const surgeQuery = useSurgeState({ enabled: showSurge });
  const announcementsQuery = usePublishedAnnouncements();

  const surge = showSurge ? surgeQuery.data : undefined;
  const criticalAnnouncement = useMemo(
    () =>
      (announcementsQuery.data ?? []).find(
        (a) => a.severity === 'CRITICAL' && a.status === 'PUBLISHED',
      ) ?? null,
    [announcementsQuery.data],
  );

  if (!surge?.is_active && !criticalAnnouncement) return null;

  return (
    <>
      {surge?.is_active && (
        <SurgeBanner
          massCasualty={surge.mass_casualty}
          reason={surge.activation_reason}
          barangays={surge.affected_barangays}
          incidentCount={surge.active_incident_count}
        />
      )}
      {criticalAnnouncement && (
        <AnnouncementBanner
          title={criticalAnnouncement.title}
          body={criticalAnnouncement.body}
        />
      )}
    </>
  );
}

// ─── Surge banner ────────────────────────────────────────────────────────────

function SurgeBanner({
  massCasualty, reason, barangays, incidentCount,
}: {
  massCasualty: boolean;
  reason?: string | null;
  barangays: string[];
  incidentCount: number;
}): JSX.Element {
  const detail = [
    reason,
    barangays.length ? `Affected: ${barangays.join(', ')}` : null,
    `${incidentCount} active incident${incidentCount === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="flex items-start gap-3 rounded-xl bg-agap-sidebar border border-white/10 px-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/20">
        <Siren size={18} className="text-red-400" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-white">
          {massCasualty ? 'Mass-Casualty Surge Mode Active' : 'Disaster Surge Mode Active'}
        </p>
        {detail && <p className="mt-0.5 text-[12px] text-white/60 line-clamp-1">{detail}</p>}
      </div>
      <Link
        href="/operations/surge"
        className="flex items-center gap-1 shrink-0 self-center rounded-lg bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-white/15 transition-colors"
      >
        <Zap size={12} /> Open surge console
      </Link>
    </div>
  );
}

// ─── Announcement banner ─────────────────────────────────────────────────────

function AnnouncementBanner({
  title, body,
}: {
  title: string;
  body?: string | null;
}): JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-agap-danger/25 bg-agap-dangerSoft px-4 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-agap-danger/10">
        <Megaphone size={18} className="text-agap-danger" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-agap-danger">Critical Advisory — {title}</p>
        {body && <p className="mt-0.5 text-[12px] text-agap-textMid line-clamp-2">{body}</p>}
      </div>
      <Link
        href="/announcements"
        className="flex items-center gap-1 shrink-0 self-center rounded-lg border border-agap-danger/20 px-3 py-1.5 text-[12px] font-semibold text-agap-danger hover:bg-agap-danger/5 transition-colors"
      >
        View <ArrowRight size={12} />
      </Link>
    </div>
  );
}
