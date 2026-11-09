'use client';

import { useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { Ban, Bell, ChevronRight, ImageOff, Landmark, MapPin, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';
import { categoryLabel, severityMeta } from '@/features/announcements/labels';

export interface PreviewModel {
  title: string;
  summary: string;
  body: string;
  severity: string;
  category: string;
  issuingOffice: string;
  sourceReference: string;
  areaText: string;
  timeLabel: string;
  imageUrl: string | null;
  imageAlt: string;
  push: { title: string; body: string };
  cancelled?: { note: string | null } | null;
}

type Tab = 'card' | 'full' | 'push';

const TABS: { key: Tab; label: string }[] = [
  { key: 'card', label: 'Feed card' },
  { key: 'full', label: 'Full notice' },
  { key: 'push', label: 'Push' },
];

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green focus-visible:ring-offset-2';

function SeverityTag({ severity }: { severity: string }) {
  const m = severityMeta(severity);
  const Icon = m.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold', m.soft, m.text)}>
      <Icon size={12} aria-hidden />
      {m.label}
    </span>
  );
}

function Placeholder({ text }: { text: string }) {
  return <span className="font-normal italic text-agap-hint">{text}</span>;
}

/** Plain-text body → paragraphs. Section headings (all caps lines) are bolded. */
function BodyText({ body }: { body: string }) {
  if (!body.trim()) return <Placeholder text="The full announcement appears here as you fill the form." />;
  return (
    <div className="space-y-2.5 text-[13px] leading-relaxed text-agap-textMid">
      {body.split(/\n{2,}/).map((block, i) => (
        <p key={i} className="whitespace-pre-line">
          {block.split('\n').map((line, j) => {
            const heading = line.length > 3 && line === line.toUpperCase() && /[A-Z]/.test(line);
            return (
              <span key={j} className={cn(heading && 'text-xs font-bold tracking-wide text-agap-textMain')}>
                {j > 0 && '\n'}
                {line}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

/**
 * Mirrors the citizen app feed (mobile/app/announcements/index.tsx): Critical
 * notices are pinned as a red banner; everything else is a card with the
 * severity icon + label (never colour alone), summary, image and area.
 */
function CriticalBannerView({ m }: { m: PreviewModel }) {
  const sev = severityMeta('CRITICAL');
  const Icon = sev.icon;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-agap-danger to-agap-dangerDeep p-4 text-white shadow-card-md">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Icon size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold tracking-wider text-agap-danger">
              CRITICAL
            </span>
            <span className="truncate text-xs text-white/90">{categoryLabel(m.category)} · {m.timeLabel}</span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-[15px] font-extrabold leading-snug">
            {m.title || <span className="italic text-white/80">Headline</span>}
          </p>
          {m.summary && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-white/90">{m.summary}</p>}
        </div>
        <ChevronRight size={20} className="shrink-0 text-white/85" aria-hidden />
      </div>
      <p className="text-xs leading-snug text-agap-hint">
        Critical notices are pinned above the feed as a banner until they expire or are cancelled.
      </p>
    </div>
  );
}

function CardView({ m }: { m: PreviewModel }) {
  if (m.severity === 'CRITICAL' && !m.cancelled) return <CriticalBannerView m={m} />;
  const sev = severityMeta(m.severity);
  const Icon = sev.icon;
  return (
    <article className="rounded-2xl border border-agap-track bg-white p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', sev.soft, sev.text)}>
          <Icon size={20} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-bold', sev.soft, sev.text)}>{sev.label}</span>
            <span className="truncate text-xs font-semibold text-agap-textMain">{categoryLabel(m.category)}</span>
          </div>
          <p className="mt-0.5 text-xs text-agap-hint">{m.timeLabel}</p>
        </div>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-agap-pearl">
          <ChevronRight size={15} className="text-agap-hint" aria-hidden />
        </span>
      </div>

      <p className="mt-3 line-clamp-2 text-[15px] font-extrabold leading-snug tracking-tight text-agap-textMain">
        {m.title || <Placeholder text="Headline" />}
      </p>
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-agap-hint">
        {m.summary || m.body || <Placeholder text="Summary" />}
      </p>

      {m.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.imageUrl} alt={m.imageAlt} className="mt-3 h-[150px] w-full rounded-2xl bg-agap-surface object-cover" />
      )}

      <div className="mt-3 flex min-w-0 items-center gap-2 border-t border-agap-surface pt-3">
        <span className="inline-flex min-w-0 max-w-[60%] items-center gap-1 rounded-full bg-agap-greenSoft px-2 py-1 text-xs font-semibold text-agap-green">
          <MapPin size={12} className="shrink-0" aria-hidden />
          <span className="truncate">{m.areaText || 'All of Bocaue'}</span>
        </span>
        {m.issuingOffice && <span className="min-w-0 truncate text-xs text-agap-hint">{m.issuingOffice}</span>}
      </div>
    </article>
  );
}

function FullView({ m }: { m: PreviewModel }) {
  return (
    <div className="space-y-3">
      {m.cancelled && (
        <div className="flex gap-2 rounded-lg border border-agap-danger/25 bg-agap-dangerSoft px-3 py-2">
          <Ban size={14} className="mt-0.5 shrink-0 text-agap-danger" aria-hidden />
          <div className="text-xs text-agap-textMid">
            <p className="font-bold text-agap-danger">This announcement was cancelled</p>
            {m.cancelled.note && <p className="mt-0.5">{m.cancelled.note}</p>}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <SeverityTag severity={m.severity} />
        <span className="text-xs text-agap-hint">{categoryLabel(m.category)}</span>
      </div>
      <h3 className="text-[18px] font-extrabold leading-tight text-agap-textMain">
        {m.title || <Placeholder text="Headline" />}
      </h3>
      {m.summary && <p className="text-[13px] font-medium leading-snug text-agap-textMain">{m.summary}</p>}
      {m.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.imageUrl} alt={m.imageAlt} className="w-full rounded-xl object-cover" />
      ) : null}
      <div className="border-t border-agap-surface pt-3">
        <BodyText body={m.body} />
      </div>
      <div className="flex items-start gap-2 rounded-lg bg-agap-pearl px-3 py-2">
        <Landmark size={14} className="mt-0.5 shrink-0 text-agap-hint" aria-hidden />
        <div className="text-xs leading-snug text-agap-textMid">
          <p><span className="font-semibold text-agap-textMain">Issued by</span> {m.issuingOffice || '—'}</p>
          {m.sourceReference && <p><span className="font-semibold text-agap-textMain">Source</span> {m.sourceReference}</p>}
          <p className="text-agap-hint">{m.timeLabel}</p>
        </div>
      </div>
      <div className="flex items-start gap-2 text-xs leading-snug text-agap-hint">
        <Radio size={12} className="mt-0.5 shrink-0" aria-hidden />
        One-way public broadcast. For emergencies, call 911 or the MDRRMO hotline.
      </div>
    </div>
  );
}

function PushView({ m }: { m: PreviewModel }) {
  const titleLen = m.push.title.length;
  const bodyLen = m.push.body.length;
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-agap-track bg-white p-3 shadow-card">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-agap-hint">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-agap-green">
            <Bell size={9} className="text-white" aria-hidden />
          </span>
          AGAP · now
        </div>
        <p className="text-[13px] font-semibold leading-snug text-agap-textMain">
          {m.push.title || <Placeholder text="Push title" />}
        </p>
        <p className="mt-0.5 line-clamp-3 text-xs leading-snug text-agap-textMid">
          {m.push.body || <Placeholder text="Push body" />}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <LengthStat label="Title" len={titleLen} min={35} max={60} />
        <LengthStat label="Body" len={bodyLen} min={80} max={140} />
      </dl>
      <p className="text-xs leading-snug text-agap-hint">
        Targets from the format standard, not hard limits. Keep the push short — the full notice opens in the app.
      </p>
    </div>
  );
}

function LengthStat({ label, len, min, max }: { label: string; len: number; min: number; max: number }) {
  const ok = len >= min && len <= max;
  const pct = Math.min(100, Math.round((len / max) * 100));
  return (
    <div className="rounded-lg bg-white px-2.5 py-2">
      <dt className="text-agap-hint">{label}</dt>
      <dd className={cn('font-semibold tabular-nums', ok ? 'text-agap-green' : 'text-agap-amberText')}>
        {len} chars <span className="font-normal text-agap-hint">· aim {min}–{max}</span>
      </dd>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-agap-surface" aria-hidden>
        <div className={cn('h-full rounded-full', ok ? 'bg-agap-green' : 'bg-agap-amber')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AnnouncementPreview({
  model,
  className,
  imageError,
}: {
  model: PreviewModel;
  className?: string;
  imageError?: boolean;
}): JSX.Element {
  const [tab, setTab] = useState<Tab>('full');
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ card: null, full: null, push: null });

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.key === tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!.key;
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-agap-track bg-white', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-agap-track px-4 py-2.5">
        <p className="text-xs font-bold uppercase tracking-wide text-agap-hint">Citizen app preview</p>
        <div role="tablist" aria-label="Preview type" className="flex gap-0.5 rounded-lg bg-agap-surface p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              ref={(el) => { tabRefs.current[t.key] = el; }}
              id={`preview-tab-${t.key}`}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              aria-controls="preview-panel"
              tabIndex={tab === t.key ? 0 : -1}
              onClick={() => setTab(t.key)}
              onKeyDown={onTabKey}
              className={cn(
                'min-h-8 rounded-md px-3 text-xs font-semibold motion-safe:transition-colors',
                focusRing,
                tab === t.key ? 'bg-white text-agap-textMain shadow-tile' : 'text-agap-textMid hover:text-agap-textMain',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div
        id="preview-panel"
        role="tabpanel"
        aria-labelledby={`preview-tab-${tab}`}
        className="bg-agap-pearl p-4"
      >
        <div className={cn('mx-auto max-w-[360px]', tab === 'full' && 'rounded-2xl bg-white p-4 shadow-card')}>
          {tab === 'card' && <CardView m={model} />}
          {tab === 'full' && <FullView m={model} />}
          {tab === 'push' && <PushView m={model} />}
          {imageError && tab !== 'push' && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-agap-amberText">
              <ImageOff size={12} aria-hidden /> Image could not be loaded from storage.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
