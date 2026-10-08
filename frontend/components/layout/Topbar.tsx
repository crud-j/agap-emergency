'use client';

import type { JSX } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthUser } from '@/lib/use-auth';
import { clearToken } from '@/lib/auth';
import { useWsState } from '@/lib/use-ws-state';
import { ConnectionIndicator } from './ConnectionIndicator';
import { cn } from '@/lib/utils';
import { LogOut, ChevronRight } from 'lucide-react';

// ─── Role display labels ────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  DISPATCHER:              'Dispatcher',
  SUPERVISOR:              'Supervisor',
  HOSPITAL_USER:           'Hospital',
  ORG_ADMINISTRATOR:       'Org Admin',
  ANNOUNCEMENTS_PUBLISHER: 'Publisher',
  SYSTEM_ADMINISTRATOR:    'Sys Admin',
};

// ─── Breadcrumb from pathname ───────────────────────────────────────────────────

const PATH_LABELS: Record<string, string> = {
  dashboard:       'Dashboard',
  operations:      'Operations',
  dispatch:        'Dispatch',
  incidents:       'Incidents',
  map:             'Map',
  triage:          'Triage',
  fleet:           'Fleet',
  escalations:     'Escalations',
  command:         'Command',
  'multi-agency':  'Multi-Agency',
  surge:           'Surge',
  risk:            'Risk Map',
  resources:       'Resources',
  organizations:   'Organizations',
  hospitals:       'Hospitals',
  analytics:       'Analytics',
  announcements:   'Announcements',
  administration:  'Admin',
  audit:           'Audit Log',
  ops:             'Ops',
  'kitchen-sink':  'Kitchen Sink',
};

function buildBreadcrumb(pathname: string): string[] {
  return pathname
    .split('/')
    .filter(Boolean)
    .map((seg) => PATH_LABELS[seg] ?? seg);
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function Topbar(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthUser();
  const wsState = useWsState();
  const crumbs = buildBreadcrumb(pathname);

  function handleLogout() {
    clearToken();
    router.push('/login');
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[rgba(168,181,193,0.20)] bg-white px-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={14} className="text-agap-track" />}
            <span
              className={cn(
                i === crumbs.length - 1
                  ? 'font-semibold text-agap-textMain'
                  : 'text-agap-textSub',
              )}
            >
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      {/* Right rail */}
      <div className="flex items-center gap-3">
        <ConnectionIndicator state={wsState} />

        {user && (
          <>
            {/* Org name */}
            {user.orgName && (
              <span className="hidden lg:block text-xs font-medium text-agap-textSub border-r border-[rgba(168,181,193,0.20)] pr-3">
                {user.orgName}
              </span>
            )}

            {/* Role badge */}
            <span className="hidden sm:inline-flex items-center rounded-full bg-agap-greenSoft px-2.5 py-0.5 text-xs font-semibold text-agap-green">
              {ROLE_LABELS[user.role] ?? user.role}
            </span>

            {/* Avatar */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-agap-green shadow-green">
              <span className="text-xs font-bold text-white">
                {(user.name ?? user.email ?? '?')[0]?.toUpperCase()}
              </span>
            </div>

            {/* User name */}
            <span className="hidden md:block text-sm font-semibold text-agap-textMain max-w-[120px] truncate">
              {user.name ?? user.email}
            </span>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-agap-textSub hover:bg-agap-surface hover:text-agap-danger transition-colors focus:outline-none focus:ring-2 focus:ring-agap-green"
              aria-label="Log out"
            >
              <LogOut size={16} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
