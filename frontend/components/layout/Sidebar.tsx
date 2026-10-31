'use client';

import type { JSX, SyntheticEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuthUser } from '@/lib/use-auth';
import { logout } from '@/lib/session';
import { navForRole, showsSidebar, type NavLink } from '@/lib/role-access';
import styles from './Sidebar.module.css';
import {
  LayoutDashboard, List, Map as MapIcon, Filter, Radio,
  Truck, Building2, HeartPulse, AlarmClock,
  Shield, Network, Zap, BarChart2, Layers,
  Megaphone, Settings, FileSearch, PanelLeftClose, PanelLeftOpen,
  Users, KeyRound, Landmark, Circle, History, Archive, ShieldAlert, Plug, Inbox, ShieldCheck, MapPinned, LogOut,
  Fingerprint,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Icons ──────────────────────────────────────────────────────────────────────
//
// Which links each role sees lives in lib/role-access.ts; this only picks icons.

const ICONS: Record<string, LucideIcon> = {
  '/dashboard': LayoutDashboard,
  '/operations/incidents': List,
  '/operations/map': MapIcon,
  '/operations/triage': Filter,
  '/operations/dispatch': Radio,
  '/operations/escalations': AlarmClock,
  '/operations/command': Shield,
  '/operations/multi-agency': Network,
  '/operations/surge': Zap,
  '/organizations': Building2,
  '/operations/fleet': Truck,
  '/resources/requests': Inbox,
  '/hospitals': HeartPulse,
  '/analytics': BarChart2,
  '/operations/risk': Layers,
  '/announcements': Megaphone,
  '/announcements/history': History,
  '/operations/approvals': ShieldCheck,
  '/operations/history': Archive,
  '/administration/users': Users,
  '/administration/permissions': KeyRound,
  '/administration/barangays': Landmark,
  '/administration/risk-areas': MapPinned,
  '/administration/config': Settings,
  '/administration/security': ShieldAlert,
  '/administration/integrations': Plug,
  '/audit': FileSearch,
  '/account/security': Fingerprint,
};

type NavItem = NavLink & { icon: LucideIcon };

// ─── Motion ─────────────────────────────────────────────────────────────────────
//
// Collapsing morphs the sidebar into a floating dock: a fixed "panel" layer
// animates its clip-path from the sidebar's rect to the dock's rect while every
// icon flies (FLIP) from its sidebar row into its dock slot, staggered. Expanding
// plays the same thing in reverse.

type Mode = 'sidebar' | 'dock';

const STORAGE_KEY = 'agap.ops.nav';
const DESKTOP_QUERY = '(min-width: 1024px)';
const SPRING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const MORPH_MS = 700;
const STAGGER_MS = 28;
const MAX_STAGGER_MS = 240;
const SIDEBAR_BG = '#eaf1fd';
const DOCK_BG = '#ffffff';
const SIDEBAR_RADIUS = 0;
const DOCK_RADIUS = 22;
const TOGGLE_FLIP_KEY = '__toggle';
const SIDEBAR_WIDTH = 248;

interface Snapshot {
  panel: DOMRect;
  icons: Map<string, DOMRect>;
}

function takeSnapshot(root: HTMLElement | null): Snapshot | null {
  if (!root) return null;
  const icons = new Map<string, DOMRect>();
  root.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
    icons.set(el.dataset.flip!, el.getBoundingClientRect());
  });
  return { panel: root.getBoundingClientRect(), icons };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Fixed layer whose clip-path travels between two rects. Returns a canceller. */
function morphPanel(
  from: { rect: DOMRect; radius: number; color: string },
  to: { rect: DOMRect; radius: number; color: string },
  onDone: () => void,
): () => void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const inset = (r: DOMRect, radius: number) =>
    `inset(${r.top}px ${vw - r.right}px ${vh - r.bottom}px ${r.left}px round ${radius}px)`;

  // Shadow lives on the parent: clip-path would cut a box-shadow on the fill.
  const shell = document.createElement('div');
  shell.className = styles.morphShell ?? '';
  const fill = document.createElement('div');
  fill.className = styles.morphFill ?? '';
  shell.appendChild(fill);
  document.body.appendChild(shell);

  const anim = fill.animate(
    [
      { clipPath: inset(from.rect, from.radius), backgroundColor: from.color },
      { clipPath: inset(to.rect, to.radius), backgroundColor: to.color },
    ],
    { duration: MORPH_MS, easing: SPRING, fill: 'forwards' },
  );

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    shell.remove();
    onDone();
  };
  anim.onfinish = finish;
  return () => {
    anim.cancel();
    finish();
  };
}

/** Fly every [data-flip] icon inside `root` from where it was in the snapshot. */
function flipIcons(root: HTMLElement, snap: Snapshot) {
  let i = 0;
  root.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
    const from = snap.icons.get(el.dataset.flip!);
    const delay = Math.min(i++ * STAGGER_MS, MAX_STAGGER_MS);
    if (!from) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 250, fill: 'backwards' });
      return;
    }
    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scale = to.width ? from.width / to.width : 1;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: 'none' }],
      { duration: MORPH_MS, easing: SPRING, delay, fill: 'backwards' },
    );
  });
}

// ─── Component ──────────────────────────────────────────────────────────────────

function SidebarNav(): JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthUser();

  const [isDesktop, setIsDesktop] = useState(true);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('sidebar');
  // Keeps the sidebar mounted while it hands its icons over to the dock.
  const [asideMounted, setAsideMounted] = useState(true);
  const [tip, setTip] = useState<{ label: string; x: number; y: number } | null>(null);

  const asideRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLElement>(null);
  const navContentRef = useRef<HTMLDivElement>(null);
  const dockScrollRef = useRef<HTMLDivElement>(null);
  const [dockEdges, setDockEdges] = useState({ start: false, end: false });
  const pendingSnapshot = useRef<Snapshot | null>(null);
  const [activePosition, setActivePosition] = useState<{ top: number; height: number } | null>(null);

  const groups = navForRole(user?.role).map((g) => ({
    label: g.label,
    items: g.items.map((item): NavItem => ({ ...item, icon: ICONS[item.href] ?? Circle })),
  }));

  function matchesPath(item: NavLink) {
    return item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  // The most specific matching link wins, so Publication History
  // (/announcements/history) doesn't also light up Announcements.
  function isActive(item: NavItem) {
    if (!matchesPath(item)) return false;
    return !groups.some((g) =>
      g.items.some((other) => other.href.length > item.href.length && matchesPath(other)),
    );
  }

  const docked = mode === 'dock';
  const overlay = !isDesktop && !docked;

  /* ── Breakpoint + saved preference ─────────────────────────────────────── */

  useLayoutEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const apply = (desktop: boolean) => {
      let saved: Mode | null = null;
      try {
        saved = window.localStorage.getItem(STORAGE_KEY) as Mode | null;
      } catch {
        /* storage unavailable — fall back to defaults */
      }
      // Below lg the dock is the resting state; the sidebar opens as an overlay.
      const next: Mode = desktop ? (saved === 'dock' ? 'dock' : 'sidebar') : 'dock';
      pendingSnapshot.current = null;
      setIsDesktop(desktop);
      setMode(next);
      setAsideMounted(next === 'sidebar');
    };
    apply(mq.matches);
    setReady(true);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /* ── Toggle ─────────────────────────────────────────────────────────────── */

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const toggle = useCallback(() => {
    const current = modeRef.current;
    const next: Mode = current === 'sidebar' ? 'dock' : 'sidebar';
    pendingSnapshot.current = prefersReducedMotion()
      ? null
      : takeSnapshot(current === 'sidebar' ? asideRef.current : dockRef.current);
    setTip(null);
    if (next === 'sidebar') setAsideMounted(true);
    setMode(next);
    if (window.matchMedia(DESKTOP_QUERY).matches) {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage unavailable — preference just won't persist */
      }
    }
  }, []);

  /* ── Run the morph after the new layout is in the DOM, before paint ────── */

  useLayoutEffect(() => {
    document.documentElement.dataset.opsNav = mode;

    const snap = pendingSnapshot.current;
    pendingSnapshot.current = null;

    if (mode === 'dock' && !snap) setAsideMounted(false);
    if (!snap) return;

    const target = mode === 'dock' ? dockRef.current : asideRef.current;
    if (!target) return;

    target.dataset.morphing = 'true';
    flipIcons(target, snap);

    const cancel = morphPanel(
      {
        rect: snap.panel,
        radius: mode === 'dock' ? SIDEBAR_RADIUS : DOCK_RADIUS,
        color: mode === 'dock' ? SIDEBAR_BG : DOCK_BG,
      },
      {
        rect: target.getBoundingClientRect(),
        radius: mode === 'dock' ? DOCK_RADIUS : SIDEBAR_RADIUS,
        color: mode === 'dock' ? DOCK_BG : SIDEBAR_BG,
      },
      () => {
        delete target.dataset.morphing;
        // Re-check: a quick second toggle cancels this morph after mode flipped back.
        if (modeRef.current === 'dock') setAsideMounted(false);
      },
    );
    return cancel;
  }, [mode]);

  useEffect(() => () => {
    delete document.documentElement.dataset.opsNav;
  }, []);

  /* ── Overlay (below lg): close on navigation and on Escape ─────────────── */

  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (overlay) toggle();
  }, [pathname, overlay, toggle]);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, toggle]);

  /* ── ⌘/Ctrl + B ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'b') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  /* ── Active notch (sidebar) / active slot in view (dock) ───────────────── */

  useLayoutEffect(() => {
    const activeLink = navContentRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    setActivePosition(activeLink ? { top: activeLink.offsetTop, height: activeLink.offsetHeight } : null);
  }, [asideMounted, pathname, user?.role]);

  useEffect(() => {
    if (!docked) return;
    dockRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [docked, pathname]);

  // A long nav (admins) can start with the current page below the fold.
  useEffect(() => {
    if (docked || !asideMounted) return;
    navContentRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [docked, asideMounted, pathname]);

  /* ── Dock edge fades: hint that more icons scroll into view ─────────────── */

  const updateDockEdges = useCallback(() => {
    const el = dockScrollRef.current;
    if (!el) return;
    const start = el.scrollLeft > 2;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setDockEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    if (!docked) return;
    updateDockEdges();
    window.addEventListener('resize', updateDockEdges);
    return () => window.removeEventListener('resize', updateDockEdges);
  }, [docked, updateDockEdges]);

  const showTip = (label: string) => (e: SyntheticEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, x: r.left + r.width / 2, y: r.top });
  };
  const hideTip = () => setTip(null);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <>
      {/* In-flow column: holds the sidebar's space on desktop, nothing below lg. */}
      <div
        className={styles.column}
        data-ready={ready || undefined}
        style={{ width: isDesktop && !docked ? SIDEBAR_WIDTH : 0 }}
      >
        {overlay && (
          <button
            type="button"
            aria-label="Close navigation"
            className={styles.backdrop}
            onClick={toggle}
          />
        )}

        {asideMounted && (
          <aside
            ref={asideRef}
            data-state={docked ? 'closing' : 'open'}
            {...(docked ? ({ inert: '' } as object) : {})}
            className={cn(
              'flex h-full flex-col border-r',
              styles.sidebar,
              overlay ? styles.sidebarOverlay : styles.sidebarDocked,
            )}
            style={{ width: SIDEBAR_WIDTH }}
          >
            {/* Brand */}
            <div className={cn('flex h-[4.5rem] shrink-0 items-center gap-3 border-b px-5', styles.brand)}>
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', styles.brandIcon)}>
                <Image
                  src="/agap-solo-icon.png"
                  alt="AGAP"
                  width={40}
                  height={40}
                  unoptimized
                  style={{ width: 40, height: 40, objectFit: 'contain' }}
                  priority
                />
              </div>
              <div className={cn('min-w-0', styles.fadeText)}>
                <p className={cn('text-[15px] font-bold leading-tight tracking-wide', styles.brandTitle)}>AGAP</p>
                <p className={cn('mt-1 text-[10px] font-semibold leading-tight uppercase tracking-[0.18em]', styles.brandSubtitle)}>Operations</p>
              </div>
            </div>

            {/* Nav */}
            <nav aria-label="Operations navigation" className="flex-1 overflow-y-auto px-1 py-3 scrollbar-thin">
              <div ref={navContentRef} className={styles.navContent}>
                {activePosition && (
                  <span
                    aria-hidden="true"
                    className={styles.activeNotch}
                    style={{
                      height: activePosition.height,
                      transform: `translateY(${activePosition.top}px)`,
                    }}
                  />
                )}
                {groups.map((group, gi) => (
                  <div key={group.label} role="group" aria-labelledby={`nav-group-${gi}`} className="mb-4">
                    <p
                      id={`nav-group-${gi}`}
                      className={cn(
                        'mx-2 mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-widest select-none',
                        styles.groupLabel,
                        styles.fadeText,
                      )}
                    >
                      {group.label}
                    </p>
                    {group.items.map((item) => {
                      const active = isActive(item);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'relative z-10 mx-2 mb-0.5 flex h-9 items-center gap-2.5 rounded-[0.85rem] px-2.5 text-[13px] font-medium transition-colors duration-200',
                            styles.navLink,
                            active ? styles.activeLink : styles.inactiveLink,
                          )}
                        >
                          <span data-flip={item.href} className={styles.flipIcon}>
                            <Icon
                              size={16}
                              className={cn('shrink-0 transition-colors', active ? styles.activeIcon : styles.inactiveIcon)}
                            />
                          </span>
                          <span className={cn('truncate', styles.fadeText)}>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            </nav>

            {/* Collapse toggle */}
            <div className={cn('shrink-0 border-t px-3 py-3', styles.footer)}>
              {user && (
                <div className={cn('mb-2 flex items-center gap-2.5 rounded-xl px-2 py-2', styles.profileCard)}>
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', styles.profileAvatar)}>
                    <span className="text-xs font-bold text-white">
                      {(user.name ?? user.email ?? '?')[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className={cn('min-w-0 flex-1', styles.fadeText)}>
                    <p title={user.name ?? user.email} className={cn('truncate text-xs font-semibold', styles.profileName)}>
                      {user.name ?? user.email}
                    </p>
                    <p className={cn('mt-0.5 truncate text-[11px] font-medium', styles.profileRole)}>{user.role.replaceAll('_', ' ')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className={styles.logoutButton}
                    aria-label="Log out"
                    title="Log out"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={toggle}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-colors duration-150',
                  styles.collapseButton,
                )}
                aria-label={overlay ? 'Close navigation' : 'Collapse sidebar to dock'}
                aria-expanded={!docked}
                title={overlay ? undefined : 'Collapse (Ctrl+B)'}
              >
                <span data-flip={TOGGLE_FLIP_KEY} className={styles.flipIcon}>
                  <PanelLeftClose size={16} />
                </span>
                {/* Below lg the sidebar is an overlay menu, so "collapse" really means close. */}
                <span className={styles.fadeText}>{overlay ? 'Close menu' : 'Collapse'}</span>
                {!overlay && (
                  <kbd aria-hidden="true" className={cn('ml-auto', styles.kbd, styles.fadeText)}>
                    Ctrl B
                  </kbd>
                )}
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Floating dock */}
      {docked && (
        <nav ref={dockRef} aria-label="Operations navigation" className={styles.dock}>
          <div
            ref={dockScrollRef}
            className={styles.dockScroll}
            data-fade-start={dockEdges.start || undefined}
            data-fade-end={dockEdges.end || undefined}
            onScroll={() => {
              hideTip();
              updateDockEdges();
            }}
          >
            {groups.map((group, gi) => (
              <Fragment key={group.label}>
                {gi > 0 && <span aria-hidden="true" className={styles.dockDivider} />}
                {group.items.map((item) => {
                  const active = isActive(item);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-label={item.label}
                      aria-current={active ? 'page' : undefined}
                      className={cn(styles.dockItem, active && styles.dockItemActive)}
                      onMouseEnter={showTip(item.label)}
                      onMouseLeave={hideTip}
                      onFocus={showTip(item.label)}
                      onBlur={hideTip}
                    >
                      <span data-flip={item.href} className={styles.flipIcon}>
                        <Icon size={18} />
                      </span>
                    </Link>
                  );
                })}
              </Fragment>
            ))}
            <span aria-hidden="true" className={styles.dockDivider} />
            <button
              type="button"
              onClick={toggle}
              aria-label="Expand sidebar"
              aria-expanded={false}
              className={styles.dockItem}
              onMouseEnter={showTip('Expand (Ctrl+B)')}
              onMouseLeave={hideTip}
              onFocus={showTip('Expand (Ctrl+B)')}
              onBlur={hideTip}
            >
              <span data-flip={TOGGLE_FLIP_KEY} className={styles.flipIcon}>
                <PanelLeftOpen size={18} />
              </span>
            </button>
          </div>
        </nav>
      )}

      {docked && tip && (
        <div role="tooltip" className={styles.tooltip} style={{ left: tip.x, top: tip.y }}>
          {tip.label}
        </div>
      )}
    </>
  );
}


/**
 * Roles with a single page (the Hospital Portal) get no sidebar at all; the
 * nav never mounts, so it also never sets the dock spacing on <html>.
 */
export function Sidebar(): JSX.Element | null {
  const user = useAuthUser();
  if (!showsSidebar(user?.role)) return null;
  return <SidebarNav />;
}
