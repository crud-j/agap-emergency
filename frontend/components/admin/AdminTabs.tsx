'use client';

import { useRef, type JSX, type KeyboardEvent, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AdminTab<K extends string> {
  key: K;
  label: string;
  icon: LucideIcon;
  /** One sentence under the tabs: what this tab is for. */
  hint: string;
}

/** The tab named in ?tab=, or the first tab when it is missing or unknown. */
export function activeTabKey<K extends string>(tabs: readonly AdminTab<K>[], value: string | null): K {
  return tabs.find((t) => t.key === value)?.key ?? tabs[0]!.key;
}

/**
 * Tabs for a System Administrator page that joins several related views (Logs, Settings).
 * The tab lives in the URL (?tab=), so a link or a reload opens the same tab, and the old
 * single-purpose pages redirect straight to theirs. Arrow keys move between tabs.
 */
export function AdminTabs<K extends string>({
  tabs, label, children,
}: {
  tabs: readonly AdminTab<K>[];
  /** Accessible name of the tab list. */
  label: string;
  children: (active: K) => ReactNode;
}): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = activeTabKey(tabs, params.get('tab'));
  const current = tabs.find((t) => t.key === active)!;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function select(key: K): void {
    // Other query parameters belong to the previous tab's filters; start clean.
    router.replace(key === tabs[0]!.key ? pathname : `${pathname}?tab=${key}`, { scroll: false });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const i = tabs.findIndex((t) => t.key === active);
    const next =
      e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length]
        : e.key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length]
          : e.key === 'Home' ? tabs[0]
            : e.key === 'End' ? tabs[tabs.length - 1]
              : undefined;
    if (!next) return;
    e.preventDefault();
    select(next.key);
    refs.current[next.key]?.focus();
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        <div
          role="tablist"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-agap-track/50 bg-agap-surface/80 p-1 sm:w-fit"
        >
          {tabs.map(({ key, label: text, icon: Icon }) => {
            const selected = key === active;
            return (
              <button
                key={key}
                ref={(el) => { refs.current[key] = el; }}
                type="button"
                role="tab"
                id={`admin-tab-${key}`}
                aria-selected={selected}
                aria-controls={`admin-panel-${key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(key)}
                className={cn(
                  'inline-flex h-10 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-[13px] font-semibold transition-all duration-150 sm:flex-none',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/60',
                  selected
                    ? 'bg-white text-agap-green shadow-tile'
                    : 'text-agap-textMid hover:bg-white/60 hover:text-agap-textMain',
                )}
              >
                <Icon size={15} aria-hidden="true" className={selected ? 'text-agap-green' : 'text-agap-textSub'} />
                {text}
              </button>
            );
          })}
        </div>
        <p className="text-[13px] text-agap-textSub">{current.hint}</p>
      </div>

      <div role="tabpanel" id={`admin-panel-${active}`} aria-labelledby={`admin-tab-${active}`}>
        {children(active)}
      </div>
    </div>
  );
}
