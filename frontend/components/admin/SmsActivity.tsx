'use client';

import { useState, type JSX } from 'react';
import {
  CheckCircle2, XCircle, MinusCircle, Inbox, Send, Percent, AlertTriangle, X,
} from 'lucide-react';
import {
  Badge, DataTable, Pagination, StatCard,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  type Column,
} from '@/components/ui';
import { useSmsLog, useSmsSummary } from '@/features/admin/hooks';
import { SMS_KINDS, SMS_STATUSES, type SmsKind, type SmsLogRow, type SmsStatus, type SmsSummary } from '@/features/admin/api';
import { cn } from '@/lib/utils';
import { fmtDateTime, fmtNumber, fmtRelative } from './format';

export const SMS_KIND_LABELS: Record<SmsKind, string> = {
  OPS_ALERT: 'Ops alert (MDRRMO)',
  BARANGAY_ALERT: 'Barangay alert',
  BARANGAY_REPLY: 'Barangay reply',
  SOS_REPLY: 'Citizen SOS reply',
  CONTACT_ALERT: 'Emergency contact',
  AUTH: 'Sign-in / OTP',
  ID_REVIEW: 'ID review result',
  ANNOUNCEMENT: 'Announcement',
  NOTIFICATION: 'Notification',
  OTHER: 'Other',
};

const STATUS_STYLE: Record<SmsStatus, { label: string; variant: 'green' | 'red' | 'muted'; icon: typeof CheckCircle2 }> = {
  ACCEPTED: { label: 'Accepted', variant: 'green', icon: CheckCircle2 },
  FAILED: { label: 'Failed', variant: 'red', icon: XCircle },
  NOT_CONFIGURED: { label: 'Not configured', variant: 'muted', icon: MinusCircle },
};

const INPUT_CLASS =
  'h-9 rounded-xl border border-agap-track bg-white px-3 text-sm text-agap-textMain focus:outline-none focus:ring-2 focus:ring-agap-green';

// ─── 7-day chart ─────────────────────────────────────────────────────────────
// Accepted = info blue, failed = amber: validated pair (CVD ΔE 31, normal ΔE 36).
// Green/red failed the protan check, so it isn't used here.

function DailyChart({ daily }: { daily: SmsSummary['daily'] }): JSX.Element {
  const max = Math.max(1, ...daily.map((d) => d.accepted + d.failed));
  const empty = daily.every((d) => d.accepted + d.failed === 0);
  const dayLabel = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'UTC' });

  return (
    <section className="rounded-2xl border border-agap-track/60 bg-white p-5 shadow-card" aria-label="SMS per day, last 7 days">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold text-agap-textMain">Last 7 days</h2>
        <div className="flex items-center gap-4 text-xs text-agap-textMid" aria-hidden>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-agap-info" /> Accepted</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-agap-amber" /> Failed</span>
        </div>
      </header>

      {empty ? (
        <p className="py-8 text-center text-sm text-agap-textSub">No SMS in the last 7 days.</p>
      ) : (
        <div className="flex h-40 items-end gap-3 border-b border-agap-track pb-0">
          {daily.map((d) => {
            const total = d.accepted + d.failed;
            return (
              <div key={d.day} className="group relative flex h-full flex-1 flex-col items-center justify-end">
                {/* Hover tooltip; the same numbers are in the table below for screen readers. */}
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-agap-textMain px-2.5 py-1.5 text-[11px] text-white shadow-card-md group-hover:block">
                  <p className="font-semibold">{dayLabel(d.day)} {d.day.slice(5)}</p>
                  <p>{d.accepted} accepted · {d.failed} failed</p>
                </div>
                {total > 0 && <span className="mb-1 text-[11px] font-semibold tabular-nums text-agap-textMid">{total}</span>}
                <div className="flex w-full max-w-10 flex-col justify-end gap-[2px]" style={{ height: `${(total / max) * 100}%` }}>
                  {d.failed > 0 && <div className="w-full rounded-t-[4px] bg-agap-amber" style={{ flexGrow: d.failed }} />}
                  {d.accepted > 0 && (
                    <div className={cn('w-full bg-agap-info', d.failed === 0 && 'rounded-t-[4px]')} style={{ flexGrow: d.accepted }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-1.5 flex gap-3">
        {daily.map((d) => (
          <span key={d.day} className="flex-1 text-center text-[11px] text-agap-textSub">{dayLabel(d.day)}</span>
        ))}
      </div>

      <table className="sr-only">
        <caption>SMS per day, last 7 days</caption>
        <thead><tr><th>Day</th><th>Accepted</th><th>Failed</th></tr></thead>
        <tbody>{daily.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.accepted}</td><td>{d.failed}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function KindBreakdown({ kinds, onPick }: { kinds: SmsSummary['byKind7d']; onPick: (kind: SmsKind) => void }): JSX.Element {
  return (
    <section className="rounded-2xl border border-agap-track/60 bg-white p-5 shadow-card" aria-label="SMS by kind, last 7 days">
      <h2 className="mb-3 text-[13px] font-bold text-agap-textMain">By kind · 7 days</h2>
      {kinds.length === 0 ? (
        <p className="py-6 text-center text-sm text-agap-textSub">Nothing sent yet.</p>
      ) : (
        <ul className="space-y-1">
          {kinds.map((k) => (
            <li key={k.kind}>
              <button
                type="button"
                onClick={() => onPick(k.kind)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-agap-surface"
                title="Show only this kind"
              >
                <span className="truncate text-agap-textMain">{SMS_KIND_LABELS[k.kind] ?? k.kind}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  {k.failed > 0 && <span className="text-xs font-semibold text-agap-danger">{k.failed} failed</span>}
                  <span className="font-semibold text-agap-textMid">{fmtNumber(k.total)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

/** SMS activity (MOD-17 tracking for MOD-49): every outbound attempt, from sms_log. */
export function SmsActivity(): JSX.Element {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [status, setStatus] = useState('ALL');
  const [kind, setKind] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const summary = useSmsSummary();
  const log = useSmsLog({
    page,
    perPage,
    ...(status !== 'ALL' && { status }),
    ...(kind !== 'ALL' && { kind }),
    ...(from && { from }),
    ...(to && { to }),
  });

  const s = summary.data;
  const failed24h = s ? s.last24h.failed + s.last24h.notConfigured : 0;
  const rate7d = s && s.last7d.total > 0 ? Math.round((s.last7d.accepted / s.last7d.total) * 1000) / 10 : null;
  const filtered = status !== 'ALL' || kind !== 'ALL' || from || to;

  function reset<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }

  const columns: Column<SmsLogRow>[] = [
    {
      key: 'time',
      header: 'Time',
      accessor: (r) => (
        <div title={fmtDateTime(r.createdAt)}>
          <p className="text-sm text-agap-textMain">{fmtDateTime(r.createdAt)}</p>
          <p className="text-[11px] text-agap-textSub">{fmtRelative(r.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Kind',
      accessor: (r) => (
        <div>
          <p className="text-sm font-medium text-agap-textMain">{SMS_KIND_LABELS[r.kind] ?? r.kind}</p>
          {r.hasIncident && <p className="text-[11px] text-agap-textSub">Linked to an incident</p>}
        </div>
      ),
    },
    {
      key: 'to',
      header: 'To',
      accessor: (r) => <span className="font-mono text-sm text-agap-textMid">{r.recipientLast4 ? `•••• ${r.recipientLast4}` : '—'}</span>,
    },
    {
      key: 'status',
      header: 'Result',
      accessor: (r) => {
        const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.FAILED;
        return (
          <div className="space-y-0.5">
            <Badge variant={st.variant}><st.icon size={12} /> {st.label}</Badge>
            {r.error && <p className="max-w-[260px] truncate text-[11px] text-agap-danger" title={r.error}>{r.error}</p>}
          </div>
        );
      },
    },
    {
      key: 'detail',
      header: 'Detail',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      accessor: (r) => (
        <div className="text-[11px] tabular-nums text-agap-textSub">
          <p>{r.chars} chars{r.attempt > 1 ? ` · try ${r.attempt}` : ''}</p>
          {r.durationMs !== null && <p>{r.durationMs} ms</p>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Accepted · 24 h" value={s ? fmtNumber(s.last24h.accepted) : '—'} icon={<Send size={16} />} loading={summary.isLoading} trendLabel={s ? `Last ${fmtRelative(s.lastAcceptedAt)}` : undefined} />
        <StatCard
          label="Failed · 24 h"
          value={s ? fmtNumber(failed24h) : '—'}
          icon={<AlertTriangle size={16} />}
          variant={failed24h > 0 ? 'critical' : 'default'}
          loading={summary.isLoading}
          trendLabel={s && s.last24h.notConfigured > 0 ? `${s.last24h.notConfigured} with no gateway set` : undefined}
        />
        <StatCard label="Accepted rate · 7 d" value={rate7d === null ? '—' : `${rate7d}%`} icon={<Percent size={16} />} loading={summary.isLoading} trendLabel={s ? `${fmtNumber(s.last7d.total)} attempts` : undefined} />
        <StatCard label="Inbound · 24 h" value={s ? fmtNumber(s.inbound24h) : '—'} icon={<Inbox size={16} />} loading={summary.isLoading} trendLabel="Barangay replies and SMS SOS" />
      </div>

      {summary.isError && (
        <p role="alert" className="rounded-xl bg-agap-dangerSoft px-4 py-2 text-sm text-agap-danger">Couldn&apos;t load the SMS summary.</p>
      )}

      {s && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2"><DailyChart daily={s.daily} /></div>
          <KindBreakdown kinds={s.byKind7d} onPick={(k) => { setKind(k); setPage(1); }} />
        </div>
      )}

      <section className="space-y-3" aria-label="SMS log">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-agap-textSub">Result</label>
            <Select value={status} onValueChange={reset(setStatus)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Any result</SelectItem>
                {SMS_STATUSES.map((v) => <SelectItem key={v} value={v}>{STATUS_STYLE[v].label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-52">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-agap-textSub">Kind</label>
            <Select value={kind} onValueChange={reset(setKind)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Any kind</SelectItem>
                {SMS_KINDS.map((v) => <SelectItem key={v} value={v}>{SMS_KIND_LABELS[v]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="sms-from" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-agap-textSub">From</label>
            <input id="sms-from" type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} className={INPUT_CLASS} />
          </div>
          <div>
            <label htmlFor="sms-to" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-agap-textSub">To</label>
            <input id="sms-to" type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} className={INPUT_CLASS} />
          </div>
          {filtered && (
            <button
              type="button"
              onClick={() => { setStatus('ALL'); setKind('ALL'); setFrom(''); setTo(''); setPage(1); }}
              className="inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-agap-textMid hover:bg-agap-surface"
            >
              <X size={13} /> Clear filters
            </button>
          )}
        </div>

        {log.isError ? (
          <p role="alert" className="rounded-xl bg-agap-dangerSoft px-4 py-3 text-sm text-agap-danger">Couldn&apos;t load the SMS log.</p>
        ) : (
          <DataTable
            columns={columns}
            data={log.data?.data ?? []}
            getRowKey={(r) => r.id}
            loading={log.isLoading}
            emptyTitle={filtered ? 'No SMS match these filters' : 'No SMS sent yet'}
            emptyDescription={filtered ? 'Try a wider date range or another kind.' : 'Every outbound SMS will be listed here.'}
          />
        )}

        {log.data && (
          <Pagination
            page={log.data.meta.page}
            totalPages={log.data.meta.totalPages}
            total={log.data.meta.total}
            perPage={log.data.meta.perPage}
            onPageChange={setPage}
            onPerPageChange={(n) => { setPerPage(n); setPage(1); }}
            noun="messages"
            fetching={log.isFetching && !log.isLoading}
          />
        )}

        <p className="text-xs text-agap-textSub">
          &ldquo;Accepted&rdquo; means Textbee took the message; delivery still depends on the gateway phone&apos;s load and signal.
          Message text is never stored (sign-in codes), and only the last 4 digits of each number are kept. Rows older than
          90 days are deleted automatically.
        </p>
      </section>
    </div>
  );
}
