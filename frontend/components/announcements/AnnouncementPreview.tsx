'use client';

import { useState, type JSX } from 'react';
import { Bell, ChevronRight, ImageOff, Landmark, Radio, Ban } from 'lucide-react';
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

function SeverityTag({ severity }: { severity: string }) {
  const m = severityMeta(severity);
  const Icon = m.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide', m.text)}>
      <Icon size={12} aria-hidden />
      {m.label}
    </span>
  );
}

function Placeholder({ text }: { text: string }) {
  return <span className="text-agap-textSub italic">{text}</span>;
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
              <span key={j} className={cn(heading && 'font-bold text-agap-textMain tracking-wide text-[12px]')}>
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

function CardView({ m }: { m: PreviewModel }) {
  const sev = severityMeta(m.severity);
  return (
    <div className="flex overflow-hidden rounded-xl border border-[rgba(168,181,193,0.25)] bg-white">
      <div className={cn('w-1 shrink-0', sev.bar)} aria-hidden />
      <div className="min-w-0 flex-1 px-3 py-3">
        <div className="mb-1.5 flex items-center gap-2">
          <SeverityTag severity={m.severity} />
          <span className="truncate text-[11px] text-agap-textSub">{categoryLabel(m.category)}</span>
          <span className="ml-auto text-[11px] text-agap-textSub">{m.timeLabel}</span>
        </div>
        <p className="mb-1.5 text-[14px] font-bold leading-snug text-agap-textMain">
          {m.title || <Placeholder text="Headline" />}
        </p>
        {m.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.imageUrl} alt={m.imageAlt} className="mb-1.5 h-28 w-full rounded-lg object-cover" />
        ) : (
          <p className="mb-1 line-clamp-2 text-[12px] leading-snug text-agap-textMid">
            {m.summary || <Placeholder text="Summary" />}
          </p>
        )}
        {m.areaText && <p className="text-[11px] text-agap-textSub">{m.areaText}</p>}
      </div>
      <ChevronRight size={16} className="mr-2 self-center text-agap-track" aria-hidden />
    </div>
  );
}

function FullView({ m }: { m: PreviewModel }) {
  return (
    <div className="space-y-3">
      {m.cancelled && (
        <div className="flex gap-2 rounded-lg border border-[rgba(212,72,88,0.25)] bg-agap-dangerSoft px-3 py-2">
          <Ban size={14} className="mt-0.5 shrink-0 text-agap-danger" aria-hidden />
          <div className="text-[12px] text-agap-textMid">
            <p className="font-bold text-agap-danger">This announcement was cancelled</p>
            {m.cancelled.note && <p className="mt-0.5">{m.cancelled.note}</p>}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <SeverityTag severity={m.severity} />
        <span className="text-[11px] text-agap-textSub">· {categoryLabel(m.category)}</span>
      </div>
      <h3 className="text-[18px] font-extrabold leading-tight text-agap-textMain">
        {m.title || <Placeholder text="Headline" />}
      </h3>
      {m.summary && <p className="text-[13px] font-medium leading-snug text-agap-textMain">{m.summary}</p>}
      {m.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.imageUrl} alt={m.imageAlt} className="w-full rounded-lg object-cover" />
      ) : null}
      <div className="border-t border-agap-surface pt-3">
        <BodyText body={m.body} />
      </div>
      <div className="flex items-start gap-2 rounded-lg bg-agap-pearl px-3 py-2">
        <Landmark size={14} className="mt-0.5 shrink-0 text-agap-textSub" aria-hidden />
        <div className="text-[11px] leading-snug text-agap-textMid">
          <p><span className="font-semibold text-agap-textMain">Issued by</span> {m.issuingOffice || '—'}</p>
          {m.sourceReference && <p><span className="font-semibold text-agap-textMain">Source</span> {m.sourceReference}</p>}
          <p className="text-agap-textSub">{m.timeLabel}</p>
        </div>
      </div>
      <div className="flex items-start gap-2 text-[11px] leading-snug text-agap-textSub">
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
      <div className="rounded-xl border border-[rgba(168,181,193,0.25)] bg-white p-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-agap-textSub">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-agap-green">
            <Bell size={9} className="text-white" aria-hidden />
          </span>
          AGAP · now
        </div>
        <p className="text-[13px] font-semibold leading-snug text-agap-textMain">
          {m.push.title || <Placeholder text="Push title" />}
        </p>
        <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-agap-textMid">
          {m.push.body || <Placeholder text="Push body" />}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <LengthStat label="Title" len={titleLen} min={35} max={60} />
        <LengthStat label="Body" len={bodyLen} min={80} max={140} />
      </dl>
      <p className="text-[11px] leading-snug text-agap-textSub">
        Targets from the format standard, not hard limits. Keep the push short — the full notice opens in the app.
      </p>
    </div>
  );
}

function LengthStat({ label, len, min, max }: { label: string; len: number; min: number; max: number }) {
  const ok = len >= min && len <= max;
  return (
    <div className="rounded-lg bg-agap-pearl px-2.5 py-1.5">
      <dt className="text-agap-textSub">{label}</dt>
      <dd className={cn('font-semibold tabular-nums', ok ? 'text-agap-green' : 'text-agap-amber')}>
        {len} chars <span className="font-normal text-agap-textSub">· aim {min}–{max}</span>
      </dd>
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
  return (
    <div className={cn('rounded-2xl border border-[rgba(168,181,193,0.25)] bg-white', className)}>
      <div className="flex items-center justify-between border-b border-[rgba(168,181,193,0.2)] px-4 py-2.5">
        <p className="text-xs font-bold uppercase tracking-wide text-agap-textSub">Citizen app preview</p>
        <div role="tablist" className="flex gap-0.5 rounded-lg bg-agap-surface p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                tab === t.key ? 'bg-white text-agap-textMain shadow-tile' : 'text-agap-textSub hover:text-agap-textMain',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-agap-pearl p-4">
        <div className="mx-auto max-w-[360px] rounded-xl bg-white p-4">
          {tab === 'card' && <CardView m={model} />}
          {tab === 'full' && <FullView m={model} />}
          {tab === 'push' && <PushView m={model} />}
          {imageError && tab !== 'push' && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-agap-amber">
              <ImageOff size={12} aria-hidden /> Image could not be loaded from storage.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
