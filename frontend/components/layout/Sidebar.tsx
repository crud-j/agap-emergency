'use client';

import type { JSX } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuthUser } from '@/lib/use-auth';
import {
  LayoutDashboard, List, Map, Filter, Radio,
  Truck, Package, Building2, HeartPulse, AlarmClock,
  Shield, Network, Zap, BarChart2, Layers,
  Megaphone, Settings, FileSearch, ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Roles ─────────────────────────────────────────────────────────────────────

const R = {
  DISPATCHER:             'DISPATCHER',
  SUPERVISOR:             'SUPERVISOR',
  HOSPITAL_USER:          'HOSPITAL_USER',
  ORG_ADMIN:              'ORG_ADMINISTRATOR',
  ANNOUNCEMENTS_PUB:      'ANNOUNCEMENTS_PUBLISHER',
  SYS_ADMIN:              'SYSTEM_ADMINISTRATOR',
} as const;

const ALL_OPS = [R.DISPATCHER, R.SUPERVISOR, R.ORG_ADMIN, R.SYS_ADMIN, R.ANNOUNCEMENTS_PUB];

// ─── Nav definition ─────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard',           label: 'Dashboard',    icon: LayoutDashboard, roles: ALL_OPS, exact: true },
    ],
  },
  {
    label: 'Incidents',
    items: [
      { href: '/operations/incidents',  label: 'Queue',      icon: List,   roles: [R.DISPATCHER, R.SUPERVISOR, R.SYS_ADMIN] },
      { href: '/operations/map',        label: 'Map',        icon: Map,    roles: [R.DISPATCHER, R.SUPERVISOR, R.SYS_ADMIN] },
      { href: '/operations/triage',     label: 'Triage',     icon: Filter, roles: [R.DISPATCHER, R.SUPERVISOR, R.SYS_ADMIN] },
      { href: '/operations/dispatch',   label: 'Dispatch',   icon: Radio,  roles: [R.DISPATCHER, R.SUPERVISOR, R.SYS_ADMIN] },
    ],
  },
  {
    label: 'Resources',
    items: [
      { href: '/operations/fleet',  label: 'Fleet',          icon: Truck,     roles: [R.DISPATCHER, R.SUPERVISOR, R.ORG_ADMIN, R.SYS_ADMIN] },
      { href: '/resources',         label: 'Registry',       icon: Package,   roles: [R.DISPATCHER, R.SUPERVISOR, R.ORG_ADMIN, R.SYS_ADMIN] },
      { href: '/organizations',     label: 'Organizations',  icon: Building2, roles: [R.ORG_ADMIN, R.SYS_ADMIN] },
    ],
  },
  {
    label: 'Hospitals',
    items: [
      { href: '/hospitals', label: 'Hospitals', icon: HeartPulse,
        roles: [R.HOSPITAL_USER, R.DISPATCHER, R.SUPERVISOR, R.SYS_ADMIN] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/operations/escalations',   label: 'Escalations',   icon: AlarmClock, roles: [R.SUPERVISOR, R.DISPATCHER, R.SYS_ADMIN] },
      { href: '/operations/command',       label: 'Command / ICS', icon: Shield,     roles: [R.SUPERVISOR, R.SYS_ADMIN] },
      { href: '/operations/multi-agency',  label: 'Multi-Agency',  icon: Network,    roles: [R.SUPERVISOR, R.DISPATCHER, R.SYS_ADMIN] },
      { href: '/operations/surge',         label: 'Surge Mode',    icon: Zap,        roles: [R.SUPERVISOR, R.SYS_ADMIN] },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/analytics',         label: 'Analytics',   icon: BarChart2, roles: [R.SUPERVISOR, R.ORG_ADMIN, R.SYS_ADMIN] },
      { href: '/operations/risk',   label: 'Risk Map',    icon: Layers,    roles: [R.SUPERVISOR, R.SYS_ADMIN] },
    ],
  },
  {
    label: 'Broadcast',
    items: [
      { href: '/announcements', label: 'Announcements', icon: Megaphone,
        roles: [R.ANNOUNCEMENTS_PUB, R.SUPERVISOR, R.SYS_ADMIN] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/administration', label: 'Admin',     icon: Settings,    roles: [R.ORG_ADMIN, R.SYS_ADMIN] },
      { href: '/audit',          label: 'Audit Log', icon: FileSearch,  roles: [R.SUPERVISOR, R.ORG_ADMIN, R.SYS_ADMIN] },
    ],
  },
];

// ─── Component ──────────────────────────────────────────────────────────────────

export function Sidebar(): JSX.Element {
  const pathname = usePathname();
  const user = useAuthUser();
  const [collapsed, setCollapsed] = useState(false);

  function isActive(item: NavItem) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  function canSee(item: NavItem) {
    if (!user) return false;
    return item.roles.includes(user.role);
  }

  return (
    <aside
      className={cn(
        'flex h-full flex-col bg-white border-r border-[rgba(168,181,193,0.20)] shadow-tile transition-all duration-200 shrink-0',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Brand */}
      <div className={cn(
        'flex h-16 shrink-0 items-center border-b border-[rgba(168,181,193,0.20)] px-4',
        collapsed ? 'justify-center' : 'gap-3',
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-agap-green shadow-green">
          <span className="text-white text-xs font-extrabold tracking-tight">AG</span>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-agap-textMain leading-tight">AGAP</p>
            <p className="text-[10px] font-semibold text-agap-textSub leading-tight uppercase tracking-wide">Ops Center</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {NAV.map((group) => {
          const visible = group.items.filter(canSee);
          if (visible.length === 0) return null;
          return (
            <div key={group.label} className="mb-3">
              {!collapsed && (
                <p className="mb-1 px-3 text-[10px] font-semibold text-agap-textSub uppercase tracking-widest">
                  {group.label}
                </p>
              )}
              {visible.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-agap-greenSoft text-agap-green font-semibold'
                        : 'text-agap-textMid hover:bg-agap-surface hover:text-agap-textMain',
                      collapsed && 'justify-center px-0',
                    )}
                  >
                    <Icon
                      size={18}
                      className={cn(
                        'shrink-0',
                        active ? 'text-agap-green' : 'text-agap-textSub group-hover:text-agap-textMain',
                      )}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="shrink-0 border-t border-[rgba(168,181,193,0.20)] p-2">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-agap-textSub hover:bg-agap-surface hover:text-agap-textMain transition-colors',
            collapsed && 'justify-center px-0',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  );
}
